// lib/triage-service.ts
import { supabaseAdmin } from '@/lib/supabase/server';
import type { LeadStatus } from '@/types';
import { buildCalendarUrl } from '@/lib/calendar/build-url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The only texts this file lets the public see: never database or internal wording (the detail goes to the
// server log). An unknown lead and an agency mismatch share one text, so the page cannot be used to find out
// which leads exist.
const LINK_NOT_VALID = 'This link is not valid.';
const LINK_EXPIRED = 'This invitation link has expired.';
const LOAD_FAILED = 'We could not load this page. Please try again in a few minutes.';

export interface LeadScreeningData {
  isValid: boolean;
  status?: LeadStatus; // الحالة الفعلية بدل isAlreadyProcessed
  agencyName?: string;
  agencySlug?: string;
  agencyLogo?: string | null;
  propertyAddress?: string;
  monthlyRent?: number;
  calendarUrl?: string;
  viewingStartsAt?: string | null; // when the booked viewing starts
  errorMessage?: string;
}

export async function getLeadScreeningData(
  agencySlug: string,
  leadId: string
): Promise<LeadScreeningData> {
  // A malformed id can never match a lead: answer like an unknown lead, without touching the database
  if (!UUID.test(leadId)) return { isValid: false, errorMessage: LINK_NOT_VALID };

  try {
    // 1. جلب الطلب مع بيانات الوكالة والعقار وحقل النص الاحتياطي
    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select(`
        id,
        status,
        expires_at,
        tenant_name,
        tenant_email,
        viewing_starts_at,
        raw_property_ref,
        properties (
          address,
          monthly_rent
        ),
        agencies (
          name,
          slug,
          logo_url,
          calendar_url
        )
      `)
      .eq('id', leadId)
      .maybeSingle();

    if (error) {
      console.error('SCREENING LOOKUP ERROR:', error.message);
      return { isValid: false, errorMessage: LOAD_FAILED };
    }

    if (!lead) {
      return { isValid: false, errorMessage: LINK_NOT_VALID };
    }

    const agency = Array.isArray(lead.agencies) ? lead.agencies[0] : lead.agencies;
    const property = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties;

    // 2. التحقق من تطابق الوكالة
    if (!agency || agency.slug !== agencySlug) {
      return { isValid: false, errorMessage: LINK_NOT_VALID };
    }

    // 3. الرابط المنتهي: لا يُفتح لمن لم يكمل أو لم يحجز بعد
    const isExpired = !!lead.expires_at && new Date(lead.expires_at).getTime() < Date.now();
    if (isExpired && (lead.status === 'PENDING' || lead.status === 'QUALIFIED')) {
      return { isValid: false, errorMessage: LINK_EXPIRED };
    }

    // 4. نعيد الحالة كما هي، والصفحة تقرر ما تعرضه
    return {
      isValid: true,
      status: lead.status as LeadStatus,
      agencyName: agency.name,
      agencySlug: agency.slug,
      agencyLogo: agency.logo_url,
      // يأخذ عنوان العقار، فإن لم يجده يأخذ النص المستخرج من الإيميل
      propertyAddress: property?.address || lead.raw_property_ref || 'Property Viewing',
      monthlyRent: property?.monthly_rent,
      calendarUrl:
        buildCalendarUrl(agency.calendar_url, {
          id: lead.id,
          name: lead.tenant_name,
          email: lead.tenant_email,
        }) ?? undefined,
      viewingStartsAt: lead.viewing_starts_at ?? null,
    };
  } catch (err) {
    console.error('SCREENING UNEXPECTED ERROR:', err instanceof Error ? err.message : 'unknown error');
    return { isValid: false, errorMessage: LOAD_FAILED };
  }
}