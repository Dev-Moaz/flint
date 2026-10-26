// Fills the database with a fictional demo agency ("Demo Lettings") so you can open the dashboard
// and screenshot it for the Loom. Re-running replaces the demo agency; real agencies are never touched.
//
//   npx tsx --env-file=.env.local scripts/seed-demo.ts
//   npx tsx --env-file=.env.local scripts/seed-demo.ts --email you@yourdomain.com   (also receives the daily report)
//   npx tsx --env-file=.env.local scripts/seed-demo.ts --delete-only
import { createClient } from '@supabase/supabase-js';
import { createReportLink } from '../lib/report/links';
import { DEMO_SLUG } from '../lib/report/demo-data';
import { deleteDemo, seedDemo } from '../lib/report/seed';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf('--email');
  const email = emailIndex >= 0 ? args[emailIndex + 1] : null;

  if (args.includes('--delete-only')) {
    const removed = await deleteDemo(db);
    console.log(removed ? 'Demo agency deleted.' : 'No demo agency found.');
    return;
  }

  const result = await seedDemo(db, { contactEmail: email });
  console.log('Seeded demo agency:', result.counts);

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const link = await createReportLink(db, result.agencyId);
  console.log(`\nDashboard (valid until ${link.expiresAt}):\n${base}/report/${DEMO_SLUG}?t=${link.token}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});