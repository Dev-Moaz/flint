// Prints a private dashboard link for an agency (valid 7 days by default).
//
//   npx tsx --env-file=.env.local scripts/create-report-link.ts <agency-slug> [days]
import { createClient } from '@supabase/supabase-js';
import { createReportLink } from '../lib/report/links';

async function main() {
  const [slug, daysArg] = process.argv.slice(2);
  if (!slug) {
    console.error('Usage: create-report-link.ts <agency-slug> [days]');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local');
    process.exit(1);
  }
  const days = daysArg ? Number(daysArg) : undefined;
  if (days !== undefined && !(days > 0 && days <= 90)) {
    console.error('days must be between 1 and 90');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const agency = await db.from('agencies').select('id, name').eq('slug', slug).maybeSingle();
  if (agency.error) throw new Error(agency.error.message);
  if (!agency.data) {
    console.error(`No agency with slug "${slug}"`);
    process.exit(1);
  }

  const link = await createReportLink(db, agency.data.id, days);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  console.log(`Report link for ${agency.data.name} (valid until ${link.expiresAt}):\n${base}/report/${slug}?t=${link.token}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});