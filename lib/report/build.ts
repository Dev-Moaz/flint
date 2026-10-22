// lib/report/build.ts
// Turns database rows into the report model. A pure function: no network, no clock of its own
// (the caller passes `now`), so every number can be tested.
import { addDays, londonDate, londonParts } from '@/lib/dates';
import { FAILURE_LABELS } from '@/lib/triage-rules';
import { OFFICE_CLOSE_HOUR, OFFICE_OPEN_HOUR, STALE_PENDING_HOURS } from '@/lib/report/config';
import { BOOKING_EXCEPTION_LABELS, reviewLabel } from '@/lib/report/labels';
import type {
  AttentionItem,
  HighlightLead,
  LeadView,
  ReportInput,
  ReportLeadRow,
  ReportModel,
} from '@/lib/report/model';
import type { FailureCode } from '@/types';

const HOUR_MS = 60 * 60 * 1000;

/** Out of hours = weekend, before opening or from closing time onwards (London). */
export function isOutOfHours(instant: Date): boolean {
  const { hour, weekday } = londonParts(instant);
  return weekday === 0 || weekday === 6 || hour < OFFICE_OPEN_HOUR || hour >= OFFICE_CLOSE_HOUR;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export function buildReport(input: ReportInput): ReportModel {
  const { now, from, to } = input;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const span = toMs - fromMs;
  const prevFromMs = fromMs - span;

  const propertyName = new Map(input.properties.map((p) => [p.id, p.address]));
  const inboundById = new Map(input.inbound.map((i) => [i.resend_email_id, i]));

  const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
  const inWindow = (iso: string | null | undefined, a: number, b: number) => {
    const t = at(iso);
    return Number.isFinite(t) && t >= a && t < b;
  };

  const propertyLabel = (lead: ReportLeadRow) =>
    (lead.property_id && propertyName.get(lead.property_id)) || lead.raw_property_ref || 'Property not matched';

  // ------------------------------------------------ windows
  const periodLeads = input.leads.filter((l) => inWindow(l.created_at, fromMs, toMs));
  const previousLeads = input.leads.filter((l) => inWindow(l.created_at, prevFromMs, fromMs));

  // Emails we received but could not turn into a lead at all
  const unreadable = (a: number, b: number) =>
    input.inbound.filter((i) => i.status === 'NEEDS_REVIEW' && !i.lead_id && inWindow(i.created_at, a, b));
  const periodUnreadable = unreadable(fromMs, toMs);
  const previousUnreadable = unreadable(prevFromMs, fromMs);

  const everQualified = (l: ReportLeadRow) => l.status === 'QUALIFIED' || l.status === 'BOOKED';

  // ------------------------------------------------ metrics
  const enquiries = periodLeads.length + periodUnreadable.length;
  const invited = periodLeads.filter((l) => l.invitation_sent_at).length;
  const screened = periodLeads.filter((l) => l.screened_at).length;
  const qualified = periodLeads.filter(everQualified).length;
  const booked = periodLeads.filter((l) => l.status === 'BOOKED').length;
  const disqualified = periodLeads.filter((l) => l.status === 'DISQUALIFIED').length;
  const needsReview = periodLeads.filter((l) => l.status === 'NEEDS_REVIEW').length + periodUnreadable.length;
  const inProgress = periodLeads.filter((l) => l.status === 'PENDING').length;

  const outOfHours =
    periodLeads.filter((l) => isOutOfHours(new Date(l.created_at))).length +
    periodUnreadable.filter((i) => isOutOfHours(new Date(i.created_at))).length;

  // From the moment our system received the email to the moment the invitation went out
  const replySeconds: number[] = [];
  for (const lead of periodLeads) {
    const received = lead.source_email_id ? inboundById.get(lead.source_email_id) : undefined;
    if (!received || !lead.invitation_sent_at) continue;
    const diff = (at(lead.invitation_sent_at) - at(received.created_at)) / 1000;
    if (Number.isFinite(diff) && diff >= 0) replySeconds.push(diff);
  }

  // ------------------------------------------------ daily series (London dates)
  const lastDay = londonDate(new Date(Math.max(fromMs, toMs - 1)));
  const dayTotals = new Map<string, { total: number; outOfHours: number }>();
  for (let d = londonDate(from); d <= lastDay; d = addDays(d, 1)) dayTotals.set(d, { total: 0, outOfHours: 0 });
  const countDay = (iso: string) => {
    const bucket = dayTotals.get(londonParts(new Date(iso)).date);
    if (!bucket) return;
    bucket.total += 1;
    if (isOutOfHours(new Date(iso))) bucket.outOfHours += 1;
  };
  periodLeads.forEach((l) => countDay(l.created_at));
  periodUnreadable.forEach((i) => countDay(i.created_at));

  // ------------------------------------------------ when during the day enquiries arrive (London hours)
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, outOfHours: 0 }));
  const countHour = (iso: string) => {
    const instant = new Date(iso);
    const bucket = hourly[londonParts(instant).hour];
    bucket.total += 1;
    if (isOutOfHours(instant)) bucket.outOfHours += 1;
  };
  periodLeads.forEach((l) => countHour(l.created_at));
  periodUnreadable.forEach((i) => countHour(i.created_at));

  // ------------------------------------------------ why applicants did not qualify
  const reasonCounts = new Map<string, number>();
  for (const lead of periodLeads) {
    if (lead.status !== 'DISQUALIFIED') continue;
    for (const code of lead.failure_codes ?? []) reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
  }
  const reasons = [...reasonCounts.entries()]
    .map(([code, count]) => ({ code, count, label: FAILURE_LABELS[code as FailureCode] ?? 'Did not meet a criterion' }))
    .sort((a, b) => b.count - a.count);

  // ------------------------------------------------ attention (everything outstanding, whatever the range)
  const attention: AttentionItem[] = [];
  const ageOf = (iso: string) => Math.max(0, (now.getTime() - at(iso)) / HOUR_MS);

  for (const lead of input.leads) {
    const base = {
      leadId: lead.id,
      name: lead.tenant_name,
      email: lead.tenant_email,
      phone: lead.tenant_phone,
      property: propertyLabel(lead),
    };

    if (lead.status === 'NEEDS_REVIEW') {
      attention.push({ ...base, kind: 'NEEDS_REVIEW', detail: reviewLabel(lead.review_reason), ageHours: ageOf(lead.created_at), at: lead.created_at });
    } else if (lead.status === 'QUALIFIED') {
      const since = lead.screened_at ?? lead.created_at;
      attention.push({ ...base, kind: 'QUALIFIED_NOT_BOOKED', detail: 'Qualified but has not booked a viewing yet', ageHours: ageOf(since), at: since });
    } else if (lead.status === 'PENDING') {
      if (lead.invitation_error && !lead.invitation_sent_at) {
        attention.push({ ...base, kind: 'INVITE_FAILED', detail: 'The screening email could not be sent', ageHours: ageOf(lead.created_at), at: lead.created_at });
      } else if (lead.invitation_sent_at && ageOf(lead.invitation_sent_at) >= STALE_PENDING_HOURS) {
        attention.push({ ...base, kind: 'INVITE_NOT_COMPLETED', detail: 'Invited, but has not completed the questions', ageHours: ageOf(lead.invitation_sent_at), at: lead.invitation_sent_at });
      }
    }
  }

  for (const item of input.inbound) {
    if (item.status === 'NEEDS_REVIEW' && !item.lead_id) {
      attention.push({ kind: 'UNREADABLE_EMAIL', leadId: null, name: null, email: null, phone: null, property: null, detail: reviewLabel(item.reason), ageHours: ageOf(item.created_at), at: item.created_at });
    }
  }

  for (const ev of input.calendarEvents) {
    if (ev.status === 'REJECTED' || ev.status === 'NO_MATCH') {
      attention.push({ kind: 'BOOKING_EXCEPTION', leadId: null, name: null, email: null, phone: null, property: null, detail: (ev.reason && BOOKING_EXCEPTION_LABELS[ev.reason]) || 'A booking could not be linked to an enquiry', ageHours: ageOf(ev.created_at), at: ev.created_at });
    }
  }

  const KIND_ORDER = ['NEEDS_REVIEW', 'UNREADABLE_EMAIL', 'INVITE_FAILED', 'BOOKING_EXCEPTION', 'QUALIFIED_NOT_BOOKED', 'INVITE_NOT_COMPLETED'];
  attention.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.ageHours - a.ageHours);

  // ------------------------------------------------ upcoming viewings
  const upcoming = input.leads
    .filter((l) => l.status === 'BOOKED' && l.viewing_starts_at && at(l.viewing_starts_at) >= now.getTime())
    .sort((a, b) => at(a.viewing_starts_at) - at(b.viewing_starts_at))
    .map((l) => ({
      leadId: l.id,
      name: l.tenant_name,
      property: propertyLabel(l),
      startsAt: l.viewing_starts_at as string,
      email: l.tenant_email,
      phone: l.tenant_phone,
    }));

  // ------------------------------------------------ by property
  const groups = new Map<string, { propertyId: string | null; label: string; enquiries: number; qualified: number; booked: number; disqualified: number }>();
  for (const lead of periodLeads) {
    const key = lead.property_id ?? 'none';
    const group = groups.get(key) ?? { propertyId: lead.property_id, label: lead.property_id ? propertyName.get(lead.property_id) ?? 'Property' : 'Property not matched', enquiries: 0, qualified: 0, booked: 0, disqualified: 0 };
    group.enquiries += 1;
    if (everQualified(lead)) group.qualified += 1;
    if (lead.status === 'BOOKED') group.booked += 1;
    if (lead.status === 'DISQUALIFIED') group.disqualified += 1;
    groups.set(key, group);
  }
  const byProperty = [...groups.values()].sort((a, b) => b.enquiries - a.enquiries);

  // ------------------------------------------------ table rows
  const detailsFor = (lead: ReportLeadRow): string[] => {
    if (lead.status === 'DISQUALIFIED') {
      return (lead.failure_codes ?? []).map((c) => FAILURE_LABELS[c as FailureCode] ?? 'Did not meet a criterion');
    }
    if (lead.status === 'NEEDS_REVIEW') return [reviewLabel(lead.review_reason)];
    if (lead.status === 'PENDING' && lead.invitation_error && !lead.invitation_sent_at) return ['The screening email could not be sent'];
    return [];
  };
  const rows: LeadView[] = [...periodLeads]
    .sort((a, b) => at(b.created_at) - at(a.created_at))
    .map((l) => ({
      id: l.id,
      receivedAt: l.created_at,
      name: l.tenant_name,
      email: l.tenant_email,
      phone: l.tenant_phone,
      property: propertyLabel(l),
      status: l.status,
      details: detailsFor(l),
      invitedAt: l.invitation_sent_at,
      screenedAt: l.screened_at,
      viewingStartsAt: l.viewing_starts_at,
    }));

  // ------------------------------------------------ highlights (used by the email)
  const firstName = (name: string) => name.split(' ')[0] || name;
  const highlightBooked: HighlightLead[] = periodLeads
    .filter((l) => l.status === 'BOOKED')
    .sort((a, b) => at(a.viewing_starts_at) - at(b.viewing_starts_at))
    .map((l) => ({ name: firstName(l.tenant_name), property: propertyLabel(l), detail: l.viewing_starts_at ?? '', at: l.booked_at ?? l.created_at }));
  const highlightDisqualified: HighlightLead[] = periodLeads
    .filter((l) => l.status === 'DISQUALIFIED')
    .map((l) => ({ name: firstName(l.tenant_name), property: propertyLabel(l), detail: detailsFor(l).join('; '), at: l.screened_at ?? l.created_at }));

  return {
    agencyName: input.agencyName,
    generatedAt: now.toISOString(),
    range: { from: from.toISOString(), to: to.toISOString(), label: input.rangeLabel, previousLabel: input.previousLabel },
    metrics: {
      enquiries,
      invited,
      screened,
      qualified,
      booked,
      disqualified,
      needsReview,
      inProgress,
      outOfHours,
      outOfHoursShare: ratio(outOfHours, enquiries),
      medianReplySeconds: median(replySeconds),
      completionRate: ratio(screened, invited),
      bookingRate: ratio(booked, qualified),
    },
    previous: {
      enquiries: previousLeads.length + previousUnreadable.length,
      qualified: previousLeads.filter(everQualified).length,
      booked: previousLeads.filter((l) => l.status === 'BOOKED').length,
      disqualified: previousLeads.filter((l) => l.status === 'DISQUALIFIED').length,
    },
    funnel: [
      { key: 'enquiries', label: 'Enquiries', count: enquiries },
      { key: 'invited', label: 'Invited to answer', count: invited },
      { key: 'screened', label: 'Completed the questions', count: screened },
      { key: 'qualified', label: 'Qualified', count: qualified },
      { key: 'booked', label: 'Booked a viewing', count: booked },
    ],
    daily: [...dayTotals.entries()].map(([date, v]) => ({ date, ...v })),
    hourly,
    reasons,
    attention,
    upcoming,
    byProperty,
    rows,
    highlights: { booked: highlightBooked, disqualified: highlightDisqualified },
  };
}