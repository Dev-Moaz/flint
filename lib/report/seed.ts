// lib/report/seed.ts
// Creates (or removes) the fictional demo agency in a real database so the dashboard can be
// explored and screenshotted. It can only ever touch the agency with slug DEMO_SLUG.
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_SLUG, generateDemoData } from '@/lib/report/demo-data';

const CHUNK = 50;

async function must<T extends { error: { message: string } | null }>(label: string, op: PromiseLike<T>): Promise<T> {
  const res = await op;
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res;
}

export async function deleteDemo(db: SupabaseClient): Promise<number> {
  const found = await must('find demo agency', db.from('agencies').select('id').eq('slug', DEMO_SLUG).maybeSingle());
  const agencyId = (found.data as { id: string } | null)?.id;
  if (!agencyId) return 0;

  // children first: some foreign keys do not cascade
  for (const table of ['calendar_events', 'inbound_emails', 'leads', 'report_links', 'report_runs', 'properties']) {
    await must(`delete ${table}`, db.from(table).delete().eq('agency_id', agencyId));
  }
  await must('delete agency', db.from('agencies').delete().eq('id', agencyId));
  return 1;
}

export interface SeedResult {
  agencyId: string;
  counts: { properties: number; leads: number; inbound: number; calendarEvents: number };
}

export async function seedDemo(db: SupabaseClient, options: { now?: Date; contactEmail?: string | null } = {}): Promise<SeedResult> {
  const now = options.now ?? new Date();
  await deleteDemo(db);
  const demo = generateDemoData(now);

  const agency = await must(
    'create agency',
    db
      .from('agencies')
      .insert({
        name: 'Demo Lettings',
        slug: DEMO_SLUG,
        calendar_url: 'https://cal.com/demo/viewing',
        income_multiplier: 30,
        contact_email: options.contactEmail?.toLowerCase() ?? null,
        cal_webhook_secret: randomBytes(32).toString('hex'),
        report_enabled: true,
      })
      .select('id')
      .single()
  );
  const agencyId = (agency.data as { id: string }).id;

  const insertAll = async (table: string, rows: Array<Record<string, unknown>>) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await must(`insert ${table}`, db.from(table).insert(rows.slice(i, i + CHUNK)));
    }
  };

  await insertAll(
    'properties',
    demo.properties.map((p) => ({ id: p.id, agency_id: agencyId, address: p.address, reference: p.reference, portal_listing_id: p.portal_listing_id, monthly_rent: p.monthly_rent }))
  );

  await insertAll(
    'leads',
    demo.leads.map((l) => ({
      id: l.id,
      agency_id: agencyId,
      property_id: l.property_id,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      tenant_phone: l.tenant_phone,
      status: l.status,
      annual_income: l.annual_income,
      has_right_to_rent: l.has_right_to_rent,
      has_no_ccj: l.has_no_ccj,
      move_in_date: l.move_in_date,
      raw_property_ref: l.raw_property_ref,
      source_email_id: l.source_email_id,
      invitation_sent_at: l.invitation_sent_at,
      invitation_error: l.invitation_error,
      review_reason: l.review_reason,
      failure_codes: l.failure_codes,
      screened_at: l.screened_at,
      booked_at: l.booked_at,
      viewing_starts_at: l.viewing_starts_at,
      cal_booking_uid: l.cal_booking_uid,
      created_at: l.created_at,
    }))
  );

  await insertAll(
    'inbound_emails',
    demo.inbound.map((i) => ({
      resend_email_id: i.resend_email_id,
      agency_id: agencyId,
      from_address: i.from_address,
      subject: i.subject,
      status: i.status,
      reason: i.reason,
      lead_id: i.lead_id,
      created_at: i.created_at,
    }))
  );

  await insertAll(
    'calendar_events',
    demo.calendarEvents.map((c, i) => ({
      agency_id: agencyId,
      trigger_event: c.trigger_event,
      booking_uid: `demo-event-${i + 1}`,
      status: c.status,
      reason: c.reason,
      created_at: c.created_at,
    }))
  );

  return {
    agencyId,
    counts: { properties: demo.properties.length, leads: demo.leads.length, inbound: demo.inbound.length, calendarEvents: demo.calendarEvents.length },
  };
}