// app/api/lead-status/route.ts
// Tiny read-only endpoint polled by the calendar panel: returns the lead status and nothing else.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  const agencySlug = searchParams.get('agencySlug');

  if (!leadId || !UUID.test(leadId) || !agencySlug) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE });
  }

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('status, agencies ( slug )')
    .eq('id', leadId)
    .maybeSingle();

  if (error) {
    console.error('LEAD STATUS ERROR:', error.message);
    return NextResponse.json({ error: 'Could not load status.' }, { status: 500, headers: NO_STORE });
  }

  const agency = lead && (Array.isArray(lead.agencies) ? lead.agencies[0] : lead.agencies);

  // Unknown lead and agency mismatch give the same answer
  if (!lead || !agency || agency.slug !== agencySlug) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json({ status: lead.status }, { headers: NO_STORE });
}