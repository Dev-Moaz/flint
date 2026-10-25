// NEEDS_REVIEW: a person has to look at this lead. review_reason says why:
//  - the enquiry could not be processed automatically (no matching property): no screening link was sent
//  - the applicant answered the questions and their income needs a decision (see ReviewReason)
export type LeadStatus = 'PENDING' | 'QUALIFIED' | 'DISQUALIFIED' | 'BOOKED' | 'NEEDS_REVIEW';

// معطيات استمارة الفرز القادمة من المستأجر
export interface TriageInput {
  annualIncome: number;
  hasRightToRent: boolean;
  moveInDate: string; // صيغة YYYY-MM-DD (للتسجيل فقط، ليست شرط رفض)
  hasNoCCJ: boolean;
  canProvideUkGuarantor: boolean; // only used when income is below the requirement
}

// رموز أسباب عدم التأهل. تُحفظ في leads.failure_codes ولا تحمل أرقاماً
export type FailureCode = 'INCOME_BELOW_THRESHOLD' | 'NO_RIGHT_TO_RENT' | 'ADVERSE_CREDIT';

// Why an applicant was sent to a person instead of being qualified or rejected (leads.review_reason)
export type ReviewReason = 'income_borderline' | 'income_low_guarantor_offered';

// مخرجات محرك الحسم الحتمي
export interface TriageResult {
  isQualified: boolean;
  failureCodes: FailureCode[];
  /** Set only when the applicant is neither qualified nor rejected. */
  reviewReason: ReviewReason | null;
  nextAction: 'SHOW_CALENDAR' | 'SHOW_REVIEW' | 'SHOW_REJECTION';
}

// بيانات الوكالة في قاعدة البيانات
export interface Agency {
  id: string;
  name: string;
  slug: string;
  inbound_email: string | null;
  calendar_url: string;
  income_multiplier: number;
  min_income_multiplier?: number | null; // below this (and without a guarantor) an applicant is rejected
  logo_url?: string | null;
  forwarding_senders?: string[];
  contact_email?: string | null;
  // End of the pilot or paid period (lib/billing/access.ts). null = never activated.
  access_until?: string | null;
}

// بيانات العقار
export interface Property {
  id: string;
  agency_id: string;
  reference: string | null;
  address: string;
  monthly_rent: number;
  portal_listing_id?: string | null;
  is_active?: boolean;
}