// app/api/webhooks/inbound-lead/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extractLeadFromEmail } from '@/lib/parser/extract-lead';
import { matchProperty, type PropertyCandidate } from '@/lib/parser/match-property';
import { resend, sendScreeningInvitation } from '@/lib/email/resend';
import { bareAddress, isAllowedSender, isLettingsEnquirySubject, isSystemAddress } from '@/lib/inbound/senders';
import { boundedText, cleanName, cleanPhone, emailAppearsIn, htmlToText } from '@/lib/inbound/sanitize';
import { isEntitled } from '@/lib/billing/access';

export const runtime = 'nodejs';

const MAX_PER_HOUR = Number(process.env.INBOUND_MAX_PER_HOUR ?? 60);
const LINK_TTL_DAYS = Number(process.env.LEAD_LINK_TTL_DAYS ?? 14);
const DUPLICATE_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type InboundStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'NEEDS_REVIEW' | 'FAILED';
interface Outcome {
  status: Exclude<InboundStatus, 'RECEIVED' | 'FAILED'>;
  reason?: string;
  leadId?: string;
}
interface AgencyRow {
  id: string;
  name: string;
  slug: string;
  inbound_email: string | null;
  forwarding_senders: string[] | null;
  contact_email: string | null;
  access_until: string | null;
}

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

async function updateInbound(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('inbound_emails').update(patch).eq('id', id);
  if (error) console.error('INBOUND LOG UPDATE ERROR:', error.message);
}

/** Envelope recipients first (forwarded mail keeps the agency's own address in "To"), then headers. */
function candidateRecipients(data: { received_for?: string[]; to?: string[]; cc?: string[]; bcc?: string[] }): string[] {
  const all = [...(data.received_for ?? []), ...(data.to ?? []), ...(data.cc ?? []), ...(data.bcc ?? [])];
  return [...new Set(all.map((r) => bareAddress(r)).filter((a): a is string => !!a))];
}

async function findAgency(recipients: string[]): Promise<AgencyRow | null> {
  const select = 'id, name, slug, inbound_email, forwarding_senders, contact_email, access_until';
  const inboundDomain = process.env.INBOUND_DOMAIN?.toLowerCase();

  for (const addr of recipients) {
    const byAddress = await supabaseAdmin.from('agencies').select(select).eq('inbound_email', addr).maybeSingle();
    if (byAddress.error) throw byAddress.error;
    if (byAddress.data) return byAddress.data as AgencyRow;

    // Fallback used during testing: "<slug>@<inbound domain>"
    const [local, domain] = addr.split('@');
    if (inboundDomain && domain !== inboundDomain) continue;
    const bySlug = await supabaseAdmin.from('agencies').select(select).eq('slug', local).maybeSingle();
    if (bySlug.error) throw bySlug.error;
    if (bySlug.data) return bySlug.data as AgencyRow;
  }
  return null;
}

export async function POST(req: NextRequest) {
  // 1) Verify the Resend (Svix) signature over the RAW body. Anything else is rejected.
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const payload = await req.text();
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get('svix-id') ?? '',
        timestamp: req.headers.get('svix-timestamp') ?? '',
        signature: req.headers.get('svix-signature') ?? '',
      },
      webhookSecret: secret,
    });
  } catch {
    return new NextResponse('Invalid webhook', { status: 400 });
  }

  if (event.type !== 'email.received') return ok({ ignored: 'event_type' });

  const { email_id: emailId, from, subject } = event.data;
  let inboundId: string | null = null;

  try {
    // 2) Which agency was this sent to?
    const agency = await findAgency(candidateRecipients(event.data));

    // 3) Log it. The unique resend_email_id makes duplicate deliveries harmless.
    const insert = await supabaseAdmin
      .from('inbound_emails')
      .insert({
        resend_email_id: emailId,
        agency_id: agency?.id ?? null,
        from_address: bareAddress(from),
        subject: (subject ?? '').slice(0, 300),
        status: 'RECEIVED',
      })
      .select('id')
      .single();

    if (insert.error?.code === '23505') {
      const existing = await supabaseAdmin
        .from('inbound_emails')
        .select('id, status, attempts')
        .eq('resend_email_id', emailId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      // Finished before: nothing to do. Unfinished (crashed mid-way): carry on.
      if (!existing.data || !['RECEIVED', 'FAILED'].includes(existing.data.status)) return ok({ duplicate: true });
      inboundId = existing.data.id;
      await updateInbound(inboundId!, { status: 'RECEIVED', attempts: (existing.data.attempts ?? 1) + 1 });
    } else if (insert.error) {
      throw insert.error;
    } else {
      inboundId = insert.data.id;
    }

    if (!agency) {
      await updateInbound(inboundId!, { status: 'IGNORED', reason: 'unknown_agency' });
      return ok({ ignored: 'unknown_agency' });
    }

    // 4) Do the work
    const outcome = await processEmail({ agency, emailId, from, subject });
    await updateInbound(inboundId!, {
      status: outcome.status,
      reason: outcome.reason ?? null,
      lead_id: outcome.leadId ?? null,
    });
    return ok();
  } catch (error) {
    // Message only: never log the payload, it may contain personal data.
    console.error('Inbound webhook error:', error instanceof Error ? error.message : 'unknown error');
    if (inboundId) {
      await updateInbound(inboundId, {
        status: 'FAILED',
        reason: (error instanceof Error ? error.message : 'unknown error').slice(0, 300),
      });
    }
    // 500 makes Resend retry; the log row and the unique indexes keep the retry safe.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function processEmail(args: {
  agency: AgencyRow;
  emailId: string;
  from: string;
  subject: string;
}): Promise<Outcome> {
  const { agency, emailId, from, subject } = args;

  // Retry path: this email already produced a lead. Only the invitation may still be missing.
  const existingLead = await supabaseAdmin
    .from('leads')
    .select('id, status, tenant_name, tenant_email, property_id, invitation_sent_at')
    .eq('source_email_id', emailId)
    .maybeSingle();
  if (existingLead.error) throw existingLead.error;
  if (existingLead.data) return finishLead(agency, existingLead.data);

  // Cheap, deterministic gates before any model call
  if (!isAllowedSender(from, agency.forwarding_senders)) return { status: 'IGNORED', reason: 'sender_not_allowed' };
  if (!isLettingsEnquirySubject(subject)) return { status: 'IGNORED', reason: 'not_a_lettings_enquiry' };

  // No access (never activated, or ended): do not take on a NEW enquiry. A lead that already exists
  // was finished above, so nobody who is mid-journey is cut off. IGNORED rather than NEEDS_REVIEW:
  // there is no lead to review, and the owner summary counts these so you know whom to call.
  if (!isEntitled(agency.access_until, new Date())) return { status: 'IGNORED', reason: 'subscription_inactive' };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await supabaseAdmin
    .from('inbound_emails')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agency.id)
    .eq('status', 'PROCESSED')
    .gte('created_at', since);
  if (recent.error) throw recent.error;
  if ((recent.count ?? 0) >= MAX_PER_HOUR) return { status: 'NEEDS_REVIEW', reason: 'rate_limited' };

  // Fetch the body (the webhook carries metadata only)
  const received = await resend.emails.receiving.get(emailId);
  if (received.error || !received.data) throw new Error(`Could not fetch email body: ${received.error?.message ?? 'no data'}`);
  const plain = received.data.text?.trim() || htmlToText(received.data.html);
  const text = boundedText(plain);
  if (!text) return { status: 'NEEDS_REVIEW', reason: 'empty_body' };

  const extracted = await extractLeadFromEmail(text);
  if (!extracted) return { status: 'NEEDS_REVIEW', reason: 'extraction_failed' };

  // The model may only report an address that is really in the email
  if (!emailAppearsIn(extracted.tenantEmail, plain, received.data.html)) {
    return { status: 'NEEDS_REVIEW', reason: 'email_not_in_body' };
  }
  // Never invite a system address (mail loops, relaying)
  if (isSystemAddress(extracted.tenantEmail, agency.inbound_email, agency.forwarding_senders)) {
    return { status: 'NEEDS_REVIEW', reason: 'email_is_system_address' };
  }

  // Match the enquiry to one of this agency's own properties
  const props = await supabaseAdmin
    .from('properties')
    .select('id, address, reference, portal_listing_id')
    .eq('agency_id', agency.id)
    .eq('is_active', true);
  if (props.error) throw props.error;
  const match = matchProperty(
    (props.data ?? []) as PropertyCandidate[],
    text,
    `${extracted.propertyRef ?? ''} ${subject}`
  );

  // The same person asking about the same property again: no second invitation
  const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * DAY_MS).toISOString();
  let dupQuery = supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agency.id)
    .eq('tenant_email', extracted.tenantEmail)
    .gte('created_at', windowStart);
  dupQuery = match
    ? dupQuery.eq('property_id', match.property.id)
    : dupQuery.eq('raw_property_ref', extracted.propertyRef ?? '');
  const dup = await dupQuery;
  if (dup.error) throw dup.error;
  if ((dup.count ?? 0) > 0) return { status: 'IGNORED', reason: 'duplicate_enquiry' };

  // Create the lead
  const insert = await supabaseAdmin
    .from('leads')
    .insert({
      agency_id: agency.id,
      property_id: match?.property.id ?? null,
      raw_property_ref: extracted.propertyRef,
      tenant_name: cleanName(extracted.tenantName),
      tenant_email: extracted.tenantEmail,
      tenant_phone: cleanPhone(extracted.tenantPhone),
      status: match ? 'PENDING' : 'NEEDS_REVIEW',
      review_reason: match ? null : 'property_not_matched',
      source_email_id: emailId,
      expires_at: new Date(Date.now() + LINK_TTL_DAYS * DAY_MS).toISOString(),
    })
    .select('id, status, tenant_name, tenant_email, property_id, invitation_sent_at')
    .single();

  if (insert.error?.code === '23505') {
    // A concurrent delivery created it first
    return { status: 'PROCESSED', reason: 'concurrent_delivery' };
  }
  if (insert.error) throw insert.error;

  return finishLead(agency, insert.data);
}

/** Sends the screening invitation for a PENDING lead, once. NEEDS_REVIEW leads get no link. */
async function finishLead(
  agency: AgencyRow,
  lead: {
    id: string;
    status: string;
    tenant_name: string;
    tenant_email: string;
    property_id: string | null;
    invitation_sent_at: string | null;
  }
): Promise<Outcome> {
  if (lead.status !== 'PENDING') return { status: 'NEEDS_REVIEW', reason: 'property_not_matched', leadId: lead.id };
  if (lead.invitation_sent_at) return { status: 'PROCESSED', leadId: lead.id };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  if (!baseUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set');

  // Address comes from OUR database, never from the email text
  const property = await supabaseAdmin.from('properties').select('address').eq('id', lead.property_id).maybeSingle();
  if (property.error) throw property.error;
  if (!property.data) throw new Error('Property for lead no longer exists');

  const result = await sendScreeningInvitation({
    leadId: lead.id,
    tenantName: lead.tenant_name,
    tenantEmail: lead.tenant_email,
    agencyName: agency.name,
    propertyAddress: property.data.address,
    screeningUrl: `${baseUrl}/screen/${agency.slug}/${lead.id}`,
    expiresInDays: LINK_TTL_DAYS,
    contactEmail: agency.contact_email,
  });

  if (!result.ok) {
    const message = result.error.slice(0, 300);
    await supabaseAdmin.from('leads').update({ invitation_error: message }).eq('id', lead.id);
    throw new Error(`Invitation email failed: ${message}`);
  }

  await supabaseAdmin
    .from('leads')
    .update({ invitation_sent_at: new Date().toISOString(), invitation_error: null })
    .eq('id', lead.id);

  return { status: 'PROCESSED', leadId: lead.id };
}