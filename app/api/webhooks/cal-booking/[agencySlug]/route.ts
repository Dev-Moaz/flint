// app/api/webhooks/cal-booking/[agencySlug]/route.ts
// Receives Cal.com booking webhooks for ONE agency (the slug in the URL selects the signing secret).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyCalSignature } from '@/lib/calendar/signature';
import { decide } from '@/lib/calendar/transitions';

export const runtime = 'nodejs';

const HANDLED = new Set(['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z
  .object({
    triggerEvent: z.string(),
    payload: z
      .object({
        uid: z.string().min(1).max(200).optional(),
        startTime: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).nullish(),
        rescheduleUid: z.string().nullish(),
        rescheduledFromUid: z.string().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

type EventStatus = 'APPLIED' | 'NOOP' | 'REJECTED' | 'NO_MATCH';

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

async function finishEvent(id: string, status: EventStatus, reason: string | null, leadId: string | null) {
  const { error } = await supabaseAdmin
    .from('calendar_events')
    .update({ status, reason, lead_id: leadId })
    .eq('id', id);
  if (error) console.error('CALENDAR EVENT LOG UPDATE ERROR:', error.message);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agencySlug: string }> }
) {
  const { agencySlug } = await params;
  const raw = await req.text(); // the signature covers the raw body, so never re-serialise it

  // 1) Which agency, and what secret does it sign with?
  const agencyRes = await supabaseAdmin
    .from('agencies')
    .select('id, cal_webhook_secret')
    .eq('slug', agencySlug)
    .maybeSingle();
  if (agencyRes.error) {
    console.error('CAL WEBHOOK AGENCY LOOKUP ERROR:', agencyRes.error.message);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  const agency = agencyRes.data;
  if (!agency?.cal_webhook_secret) return new NextResponse('Not found', { status: 404 });

  // 2) Authenticate
  if (!verifyCalSignature(raw, req.headers.get('x-cal-signature-256'), agency.cal_webhook_secret)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  // 3) Parse (signed but malformed is a sender bug: say so)
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: 'Unrecognised payload' }, { status: 400 });
  }

  const trigger = body.triggerEvent;
  const uid = body.payload.uid;
  if (!uid || !HANDLED.has(trigger)) return ok({ ignored: 'not_a_booking_event' });

  const startRaw = body.payload.startTime;
  const startTime = startRaw && !Number.isNaN(new Date(startRaw).getTime()) ? new Date(startRaw).toISOString() : null;

  try {
    // 4) Log it. The unique (agency, trigger, uid) makes redelivery harmless.
    const insert = await supabaseAdmin
      .from('calendar_events')
      .insert({ agency_id: agency.id, trigger_event: trigger, booking_uid: uid, status: 'RECEIVED', start_time: startTime })
      .select('id')
      .single();

    let eventId: string;
    if (insert.error?.code === '23505') {
      const existing = await supabaseAdmin
        .from('calendar_events')
        .select('id, status')
        .eq('agency_id', agency.id)
        .eq('trigger_event', trigger)
        .eq('booking_uid', uid)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data || existing.data.status !== 'RECEIVED') return ok({ duplicate: true });
      eventId = existing.data.id; // an earlier attempt crashed mid-way: finish it
    } else if (insert.error) {
      throw insert.error;
    } else {
      eventId = insert.data.id;
    }

    // 5) Find the lead: by the booking uid we already know (cancel/reschedule), then by metadata.leadId
    const knownUids = [uid, body.payload.rescheduleUid, body.payload.rescheduledFromUid].filter(
      (u): u is string => typeof u === 'string' && u.length > 0
    );
    type LeadRow = { id: string; status: string; cal_booking_uid: string | null };
    let lead: LeadRow | null = null;

    const byUid = await supabaseAdmin
      .from('leads')
      .select('id, status, cal_booking_uid')
      .eq('agency_id', agency.id)
      .in('cal_booking_uid', knownUids)
      .limit(1)
      .maybeSingle();
    if (byUid.error) throw byUid.error;
    lead = byUid.data as LeadRow | null;

    if (!lead) {
      const metaLeadId = body.payload.metadata?.leadId;
      if (typeof metaLeadId === 'string' && UUID.test(metaLeadId)) {
        const byMeta = await supabaseAdmin
          .from('leads')
          .select('id, status, cal_booking_uid')
          .eq('id', metaLeadId)
          .eq('agency_id', agency.id) // a booking can never touch another agency's lead
          .maybeSingle();
        if (byMeta.error) throw byMeta.error;
        lead = byMeta.data as LeadRow | null;
      }
    }

    if (!lead) {
      await finishEvent(eventId, 'NO_MATCH', 'no_lead_for_booking', null);
      return ok({ matched: false });
    }

    // 6) Apply the transition (conditional updates make races harmless)
    const decision = decide(
      { status: lead.status as never, cal_booking_uid: lead.cal_booking_uid },
      { trigger, uid }
    );

    if (decision.action === 'BOOK') {
      const patch: Record<string, unknown> = {
        status: 'BOOKED',
        cal_booking_uid: uid,
        viewing_starts_at: startTime,
      };
      if (decision.setBookedAt) patch.booked_at = new Date().toISOString();

      const res = await supabaseAdmin
        .from('leads')
        .update(patch)
        .eq('id', lead.id)
        .in('status', ['QUALIFIED', 'BOOKED'])
        .select('id');
      if (res.error) throw res.error;
      const applied = (res.data ?? []).length > 0;
      await finishEvent(eventId, applied ? 'APPLIED' : 'NOOP', applied ? decision.reason ?? null : 'state_changed', lead.id);
    } else if (decision.action === 'CANCEL') {
      const res = await supabaseAdmin
        .from('leads')
        .update({ status: 'QUALIFIED', cal_booking_uid: null, booked_at: null, viewing_starts_at: null })
        .eq('id', lead.id)
        .eq('status', 'BOOKED')
        .eq('cal_booking_uid', uid)
        .select('id');
      if (res.error) throw res.error;
      const applied = (res.data ?? []).length > 0;
      await finishEvent(eventId, applied ? 'APPLIED' : 'NOOP', applied ? 'cancelled' : 'state_changed', lead.id);
    } else if (decision.action === 'REJECT') {
      // A booking for a lead that never qualified: logged for the agency, nothing is changed
      await finishEvent(eventId, 'REJECTED', decision.reason, lead.id);
    } else {
      await finishEvent(eventId, 'NOOP', decision.reason, lead.id);
    }

    return ok();
  } catch (error) {
    console.error('Cal webhook error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}