// lib/triage-service.ts
import { supabaseAdmin } from '@/lib/supabase/server';
import type { LeadStatus } from '@/types';
import { buildCalendarUrl } from '@/lib/calendar/build-url';

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
      console.error('SUPABASE ERROR:', error);
      return {
        isValid: false,
        errorMessage: `Database error: ${error.message}`,
      };
    }

    if (!lead) {
      return {
        isValid: false,
        errorMessage: 'Lead record not found in database.',
      };
    }

    const agency = Array.isArray(lead.agencies) ? lead.agencies[0] : lead.agencies;
    const property = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties;

    // 2. التحقق من تطابق الوكالة
    if (!agency || agency.slug !== agencySlug) {
      return {
        isValid: false,
        errorMessage: 'Agency mismatch or invalid agency slug.',
      };
    }

    // 3. الرابط المنتهي: لا يُفتح لمن لم يكمل أو لم يحجز بعد
    const isExpired = !!lead.expires_at && new Date(lead.expires_at).getTime() < Date.now();
    if (isExpired && (lead.status === 'PENDING' || lead.status === 'QUALIFIED')) {
      return {
        isValid: false,
        errorMessage: 'This invitation link has expired.',
      };
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
  } catch (err: any) {
    console.error('UNEXPECTED SERVER ERROR:', err);
    return {
      isValid: false,
      errorMessage: err.message || 'Internal server error.',
    };
  }
}