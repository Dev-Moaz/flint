// lib/report/ops-email.ts
// The internal e-mail for the owner of the system (not the agencies): what needs a human today.
import { GRACE_DAYS, type AccessAttention } from '@/lib/billing/access';

export interface BillingOps {
  /** Agencies whose access ends soon, or has just ended and is inside the grace period. */
  access: Array<{ agency: string; state: AccessAttention; endsOn: string }>;
  /** New enquiries ignored because the agency has no access (last 36h): the agencies to call. */
  missedEnquiries: Array<{ agency: string; count: number }>;
}

export interface OpsSummary {
  date: string;
  failedEmails: { count: number; reasons: string[] };
  staleReview: Array<{ agency: string; count: number }>;
  inviteFailures: number;
  bookingExceptions: number;
  reportFailures: Array<{ agency: string; reason: string }>;
  /** Absent means nothing to report. */
  billing?: BillingOps;
}

export function opsHasIssues(s: OpsSummary): boolean {
  return (
    s.failedEmails.count > 0 ||
    s.staleReview.length > 0 ||
    s.inviteFailures > 0 ||
    s.bookingExceptions > 0 ||
    s.reportFailures.length > 0 ||
    (s.billing?.access.length ?? 0) > 0 ||
    (s.billing?.missedEnquiries.length ?? 0) > 0
  );
}

export function renderOpsSummary(s: OpsSummary): { subject: string; text: string } {
  const lines: string[] = [`Operations summary for ${s.date}`, ''];

  if (s.failedEmails.count > 0) {
    lines.push(`Inbound emails that FAILED to process (last 36h): ${s.failedEmails.count}`);
    s.failedEmails.reasons.forEach((r) => lines.push(`  - ${r}`));
    lines.push('');
  }
  if (s.inviteFailures > 0) {
    lines.push(`Screening invitations that could not be sent: ${s.inviteFailures}`, '');
  }
  if (s.staleReview.length > 0) {
    lines.push('Enquiries waiting more than 24h for a human (NEEDS_REVIEW):');
    s.staleReview.forEach((r) => lines.push(`  - ${r.agency}: ${r.count}`));
    lines.push('');
  }
  if (s.bookingExceptions > 0) {
    lines.push(`Bookings that could not be linked or were made without screening (last 36h): ${s.bookingExceptions}`, '');
  }
  if (s.billing && s.billing.access.length > 0) {
    lines.push('Access running out or just ended:');
    s.billing.access.forEach((a) =>
      lines.push(
        a.state === 'ENDING_SOON'
          ? `  - ${a.agency}: ends on ${a.endsOn}`
          : `  - ${a.agency}: ended on ${a.endsOn} (${GRACE_DAYS}-day grace period running)`
      )
    );
    lines.push('');
  }
  if (s.billing && s.billing.missedEnquiries.length > 0) {
    lines.push('Enquiries ignored because the agency has no access (last 36h):');
    s.billing.missedEnquiries.forEach((r) => lines.push(`  - ${r.agency}: ${r.count}`));
    lines.push('');
  }
  if (s.reportFailures.length > 0) {
    lines.push('Daily reports that failed today:');
    s.reportFailures.forEach((r) => lines.push(`  - ${r.agency}: ${r.reason}`));
    lines.push('');
  }

  const total =
    s.failedEmails.count +
    s.inviteFailures +
    s.staleReview.reduce((n, r) => n + r.count, 0) +
    s.bookingExceptions +
    s.reportFailures.length +
    (s.billing?.access.length ?? 0) +
    (s.billing?.missedEnquiries.reduce((n, r) => n + r.count, 0) ?? 0);
  return { subject: `Ops: ${total} item${total === 1 ? '' : 's'} need a look`, text: lines.join('\n').trim() };
}