// lib/report/labels.ts
// Plain-English wording for the agency. Never shown to tenants.
import type { LeadStatus } from '@/types';

export const STATUS_LABELS: Record<LeadStatus, string> = {
  BOOKED: 'Booked',
  QUALIFIED: 'Qualified',
  DISQUALIFIED: 'Not qualified',
  PENDING: 'In progress',
  NEEDS_REVIEW: 'Needs review',
};

// leads.review_reason and inbound_emails.reason values written by the webhooks
export const REVIEW_REASON_LABELS: Record<string, string> = {
  property_not_matched: 'Could not match the enquiry to one of your properties',
  extraction_failed: 'Could not read the enquiry email',
  email_not_in_body: 'Could not confirm the applicant\u2019s email address',
  email_is_system_address: 'The applicant\u2019s address looked like a system address',
  empty_body: 'The enquiry email was empty',
  rate_limited: 'Paused: unusually many enquiries in one hour',
  // the applicant answered the questions and the income needs a decision from the agency
  income_borderline: 'Income is close to your affordability requirement',
  income_low_guarantor_offered: 'Income is below your requirement, but the applicant can provide a UK guarantor',
};

export const BOOKING_EXCEPTION_LABELS: Record<string, string> = {
  no_lead_for_booking: 'A viewing was booked that is not linked to any enquiry',
  lead_not_qualified: 'A viewing was booked by someone who had not completed screening',
};

export function reviewLabel(reason: string | null | undefined): string {
  return (reason && REVIEW_REASON_LABELS[reason]) || 'Needs a manual look';
}