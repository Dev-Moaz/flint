// app/api/triage/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { LeadStatus } from '@/types';
import { buildCalendarUrl } from '@/lib/calendar/build-url';
import { evaluateTenantTriage, parseTriageInput, resolveMultiplier } from '@/lib/triage-rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
// After qualifying, the tenant gets this long to book
const BOOKING_LINK_TTL_DAYS = Number(process.env.BOOKING_LINK_TTL_DAYS ?? process.env.LEAD_LINK_TTL_DAYS ?? 14);

export async function POST(request: Request) {
  let body: { leadId?: unknown; agencySlug?: unknown; formData?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { leadId, agencySlug, formData } = body;
  if (typeof leadId !== 'string' || !UUID.test(leadId) || typeof agencySlug !== 'string' || !agencySlug) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // Strict validation before anything touches the database
  const input = parseTriageInput(formData);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select(
      'id, status, expires_at, tenant_name, tenant_email, properties ( monthly_rent ), agencies ( slug, calendar_url, income_multiplier )'
    )
    .eq('id', leadId)
    .maybeSingle();

  if (error) {
    console.error('TRIAGE LOOKUP ERROR:', error.message);
    return NextResponse.json({ error: 'Could not load this application.' }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const agency = Array.isArray(lead.agencies) ? lead.agencies[0] : lead.agencies;
  const property = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties;

  if (!agency || agency.slug !== agencySlug) {
    return NextResponse.json({ error: 'Invalid agency.' }, { status: 404 });
  }
  if (lead.status !== 'PENDING') {
    return NextResponse.json({ error: 'This application was already processed.' }, { status: 409 });
  }
  if (lead.expires_at && new Date(lead.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This invitation link has expired.' }, { status: 410 });
  }

  const monthlyRent = Number(property?.monthly_rent) || 0;
  if (!monthlyRent) {
    return NextResponse.json({ error: 'Property rent is missing for this lead.' }, { status: 422 });
  }

  // The single decision point: all rules live in lib/triage-rules.ts
  const result = evaluateTenantTriage(input.value, monthlyRent, resolveMultiplier(agency.income_multiplier));
  const nextStatus: LeadStatus = result.isQualified ? 'QUALIFIED' : 'DISQUALIFIED';

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('leads')
    .update({
      status: nextStatus,
      annual_income: input.value.annualIncome,
      has_right_to_rent: input.value.hasRightToRent,
      move_in_date: input.value.moveInDate,
      has_no_ccj: input.value.hasNoCCJ,
      failure_codes: result.failureCodes,
      screened_at: new Date().toISOString(),
      // a qualified tenant gets a fresh window to book
      ...(result.isQualified
        ? { expires_at: new Date(Date.now() + BOOKING_LINK_TTL_DAYS * DAY_MS).toISOString() }
        : {}),
    })
    .eq('id', leadId)
    .eq('status', 'PENDING') // prevents double processing
    .select('id');

  if (updateError) {
    console.error('TRIAGE UPDATE ERROR:', updateError.message);
    return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'This application was already processed.' }, { status: 409 });
  }

  return NextResponse.json({
    isQualified: result.isQualified,
    calendarUrl: result.isQualified
      ? buildCalendarUrl(agency.calendar_url, { id: lead.id, name: lead.tenant_name, email: lead.tenant_email })
      : null,
  });
}