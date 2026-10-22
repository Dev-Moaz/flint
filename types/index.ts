// NEEDS_REVIEW: an enquiry we could not safely process automatically
// (no matching property, extraction failed, ...). No screening link is sent for it.
export type LeadStatus = 'PENDING' | 'QUALIFIED' | 'DISQUALIFIED' | 'BOOKED' | 'NEEDS_REVIEW';

// معطيات استمارة الفرز القادمة من المستأجر
export interface TriageInput {
  annualIncome: number;
  hasRightToRent: boolean;
  moveInDate: string; // صيغة YYYY-MM-DD (للتسجيل فقط، ليست شرط رفض)
  hasNoCCJ: boolean;
}

// رموز أسباب عدم التأهل. تُحفظ في leads.failure_codes ولا تحمل أرقاماً
export type FailureCode = 'INCOME_BELOW_THRESHOLD' | 'NO_RIGHT_TO_RENT' | 'ADVERSE_CREDIT';

// مخرجات محرك الحسم الحتمي
export interface TriageResult {
  isQualified: boolean;
  failureCodes: FailureCode[];
  nextAction: 'SHOW_CALENDAR' | 'SHOW_REJECTION';
}

// بيانات الوكالة في قاعدة البيانات
export interface Agency {
  id: string;
  name: string;
  slug: string;
  inbound_email: string | null;
  calendar_url: string;
  income_multiplier: number;
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