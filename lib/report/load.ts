// lib/report/load.ts
// The thin database layer: fetches the rows buildReport needs. All the logic lives in build.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOOKBACK_DAYS } from '@/lib/report/config';
import type { ReportCalendarRow, ReportInboundRow, ReportLeadRow, ReportPropertyRow } from '@/lib/report/model';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_LIMIT = 5000;

export interface LoadedRows {
  leads: ReportLeadRow[];
  properties: ReportPropertyRow[];
  inbound: ReportInboundRow[];
  calendarEvents: ReportCalendarRow[];
}

const LEAD_COLUMNS =
  'id, created_at, status, tenant_name, tenant_email, tenant_phone, property_id, raw_property_ref, source_email_id, invitation_sent_at, invitation_error, screened_at, booked_at, viewing_starts_at, failure_codes, review_reason';

export async function loadReportRows(db: SupabaseClient, agencyId: string, now: Date): Promise<LoadedRows> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();

  const [leads, upcoming, properties, inbound, calendar] = await Promise.all([
    db.from('leads').select(LEAD_COLUMNS).eq('agency_id', agencyId).gte('created_at', since).order('created_at', { ascending: false }).limit(ROW_LIMIT),
    // a viewing booked long ago for a date still ahead must not drop out of "upcoming"
    db.from('leads').select(LEAD_COLUMNS).eq('agency_id', agencyId).eq('status', 'BOOKED').gte('viewing_starts_at', now.toISOString()).limit(200),
    db.from('properties').select('id, address').eq('agency_id', agencyId),
    db.from('inbound_emails').select('resend_email_id, created_at, status, reason, lead_id').eq('agency_id', agencyId).gte('created_at', since).limit(ROW_LIMIT),
    db.from('calendar_events').select('trigger_event, status, reason, created_at').eq('agency_id', agencyId).in('status', ['REJECTED', 'NO_MATCH']).gte('created_at', since).limit(500),
  ]);

  for (const res of [leads, upcoming, properties, inbound, calendar]) {
    if (res.error) throw new Error(`Report query failed: ${res.error.message}`);
  }

  const byId = new Map<string, ReportLeadRow>();
  for (const row of [...((leads.data ?? []) as ReportLeadRow[]), ...((upcoming.data ?? []) as ReportLeadRow[])]) byId.set(row.id, row);

  return {
    leads: [...byId.values()],
    properties: (properties.data ?? []) as ReportPropertyRow[],
    inbound: (inbound.data ?? []) as ReportInboundRow[],
    calendarEvents: (calendar.data ?? []) as ReportCalendarRow[],
  };
}