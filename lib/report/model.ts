// lib/report/model.ts
import type { LeadStatus } from '@/types';

// ------------------------------------------------------------------ input (rows from the database)
export interface ReportLeadRow {
  id: string;
  created_at: string;
  status: LeadStatus;
  tenant_name: string;
  tenant_email: string;
  tenant_phone: string | null;
  property_id: string | null;
  raw_property_ref: string | null;
  source_email_id: string | null;
  invitation_sent_at: string | null;
  invitation_error: string | null;
  screened_at: string | null;
  booked_at: string | null;
  viewing_starts_at: string | null;
  failure_codes: string[] | null;
  review_reason: string | null;
}

export interface ReportPropertyRow {
  id: string;
  address: string;
}

export interface ReportInboundRow {
  resend_email_id: string;
  created_at: string;
  status: string;
  reason: string | null;
  lead_id: string | null;
}

export interface ReportCalendarRow {
  trigger_event: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export interface ReportInput {
  agencyName: string;
  now: Date;
  /** Reporting window [from, to). */
  from: Date;
  to: Date;
  rangeLabel: string;
  previousLabel: string;
  leads: ReportLeadRow[];
  properties: ReportPropertyRow[];
  inbound: ReportInboundRow[];
  calendarEvents: ReportCalendarRow[];
}

// ------------------------------------------------------------------ output (what the UI and email render)
export type AttentionKind =
  | 'NEEDS_REVIEW'
  | 'UNREADABLE_EMAIL'
  | 'QUALIFIED_NOT_BOOKED'
  | 'INVITE_NOT_COMPLETED'
  | 'INVITE_FAILED'
  | 'BOOKING_EXCEPTION';

export interface AttentionItem {
  kind: AttentionKind;
  leadId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  property: string | null;
  detail: string;
  /** Hours since the thing happened (for sorting and "waiting 2 days"). */
  ageHours: number;
  at: string;
}

export interface LeadView {
  id: string;
  receivedAt: string;
  name: string;
  email: string;
  phone: string | null;
  property: string;
  status: LeadStatus;
  details: string[];
  invitedAt: string | null;
  screenedAt: string | null;
  viewingStartsAt: string | null;
}

export interface HighlightLead {
  name: string;
  property: string;
  detail: string;
  at: string;
}

export interface ReportModel {
  agencyName: string;
  generatedAt: string;
  range: { from: string; to: string; label: string; previousLabel: string };
  metrics: {
    enquiries: number;
    invited: number;
    screened: number;
    qualified: number;
    booked: number;
    disqualified: number;
    needsReview: number;
    inProgress: number;
    outOfHours: number;
    outOfHoursShare: number | null;
    medianReplySeconds: number | null;
    completionRate: number | null;
    bookingRate: number | null;
  };
  previous: { enquiries: number; qualified: number; booked: number; disqualified: number };
  funnel: Array<{ key: string; label: string; count: number }>;
  daily: Array<{ date: string; total: number; outOfHours: number }>;
  /** Enquiries by London hour of day (0-23), with the part that counted as out of hours. */
  hourly: Array<{ hour: number; total: number; outOfHours: number }>;
  /** Why applicants did not qualify: one count per reason code (an applicant can have several). */
  reasons: Array<{ code: string; label: string; count: number }>;
  attention: AttentionItem[];
  upcoming: Array<{ leadId: string; name: string; property: string; startsAt: string; email: string; phone: string | null }>;
  byProperty: Array<{ propertyId: string | null; label: string; enquiries: number; qualified: number; booked: number; disqualified: number }>;
  rows: LeadView[];
  highlights: { booked: HighlightLead[]; disqualified: HighlightLead[] };
}