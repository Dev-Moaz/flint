// Run with: npx tsx scripts/daily.test.ts
// Exercises the whole daily job against an in-memory fake of the Supabase client.
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_SLUG, generateDemoData } from '../lib/report/demo-data';
import { FakeDb } from './fake-db';
import { runDailyReports, type OutgoingEmail, type SendFn } from '../lib/report/run-daily';

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------ fixtures
const BASE = 'https://app.example.com';
function setup(now: Date, withData = true) {
  const db = new FakeDb();
  const demo = generateDemoData(now, 7);
  db.tables.agencies = [
    { id: 'ag1', name: 'Oakwood Test', slug: 'oakwood-test', contact_email: 'lettings@demo.example', report_enabled: true },
    { id: 'ag2', name: 'Silent Agency', slug: 'silent', contact_email: null, report_enabled: true },
    { id: 'ag3', name: 'Paused Agency', slug: 'paused', contact_email: 'p@example.com', report_enabled: false },
  ];
  if (withData) {
    db.tables.leads = demo.leads.map((l) => ({ ...l, agency_id: 'ag1' }));
    db.tables.properties = demo.properties.map((p) => ({ ...p, agency_id: 'ag1' }));
    db.tables.inbound_emails = demo.inbound.map((i) => ({ ...i, agency_id: 'ag1', updated_at: i.created_at }));
    db.tables.calendar_events = demo.calendarEvents.map((c) => ({ ...c, agency_id: 'ag1' }));
  }
  return db;
}
function sender(opts: { failDaily?: boolean } = {}) {
  const sent: OutgoingEmail[] = [];
  const fn: SendFn = async (email) => {
    if (opts.failDaily && email.idempotencyKey.startsWith('daily-report')) return { ok: false, error: 'boom: domain not verified' };
    sent.push(email);
    return { ok: true };
  };
  return { sent, fn };
}
const run = (db: FakeDb, now: Date, s: SendFn, extra: Partial<Parameters<typeof runDailyReports>[0]> = {}) =>
  runDailyReports({ db: db as unknown as SupabaseClient, now, baseUrl: BASE, sendEmail: s, sendWeekends: false, fromName: 'Daily lettings report', adminEmail: 'owner@example.com', ...extra });

const WED = new Date('2026-10-14T06:00:00Z'); // Wed 07:00 BST
const FRI = new Date('2026-10-16T06:00:00Z');
const SAT = new Date('2026-10-17T06:00:00Z');
const MON = new Date('2026-10-19T06:00:00Z');

async function main() {
  console.log('daily job');

  await test('sends one report to the agency with a contact address, and to nobody else', async () => {
    const db = setup(WED);
    const s = sender();
    const result = await run(db, WED, s.fn);
    const reports = s.sent.filter((e) => e.idempotencyKey.startsWith('daily-report'));
    assert.equal(reports.length, 1);
    assert.equal(reports[0].to, 'lettings@demo.example');
    assert.equal(result.agencies.length, 1); // "Silent" has no contact address, "Paused" is switched off
    assert.equal(result.agencies[0].status, 'SENT');
    assert.match(reports[0].text, /https:\/\/app\.example\.com\/report\/oakwood-test\?t=[A-Za-z0-9_-]{43}/);
  });

  await test('records the run and stores only a hash of the link token', async () => {
    const db = setup(WED);
    const s = sender();
    await run(db, WED, s.fn);
    const runRow = db.tables.report_runs[0];
    assert.equal(runRow.status, 'SENT');
    assert.equal(runRow.run_date, '2026-10-14');
    assert.equal(new Date(runRow.window_end).getTime(), WED.getTime());
    assert.equal(WED.getTime() - new Date(runRow.window_start).getTime(), 24 * 3600_000);
    const link = db.tables.report_links[0];
    assert.equal(link.token_hash.length, 64);
    const token = s.sent[0].text.match(/\?t=([A-Za-z0-9_-]{43})/)![1];
    assert.notEqual(link.token_hash, token);
    assert.ok(Math.abs(new Date(link.expires_at).getTime() - (WED.getTime() + 7 * 86400_000)) < 5000);
  });

  await test('a second run on the same day does nothing (no second email, no second link)', async () => {
    const db = setup(WED);
    const s = sender();
    await run(db, WED, s.fn);
    const again = await run(db, WED, s.fn);
    assert.equal(again.agencies[0].status, 'ALREADY_DONE');
    assert.equal(s.sent.filter((e) => e.idempotencyKey.startsWith('daily-report')).length, 1);
    assert.equal(db.tables.report_links.length, 1);
  });

  await test('force re-sends, with a different idempotency key so the provider does not swallow it', async () => {
    const db = setup(WED);
    const s = sender();
    await run(db, WED, s.fn);
    await run(db, WED, s.fn, { force: true });
    const keys = s.sent.filter((e) => e.idempotencyKey.startsWith('daily-report')).map((e) => e.idempotencyKey);
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
  });

  await test('weekends are skipped, and Monday reaches back to Friday and adds the 7-day recap', async () => {
    const db = setup(MON);
    const s = sender();
    await run(db, FRI, s.fn);
    const sat = await run(db, SAT, s.fn);
    assert.equal(sat.agencies[0].reason, 'weekend');
    const mon = await run(db, MON, s.fn);
    assert.equal(mon.agencies[0].status, 'SENT');
    const monRow = db.tables.report_runs.find((r) => r.run_date === '2026-10-19')!;
    assert.equal(new Date(monRow.window_start).getTime(), FRI.getTime()); // the whole weekend is covered
    const monday = s.sent.filter((e) => e.idempotencyKey.startsWith('daily-report')).at(-1)!;
    assert.ok(monday.text.includes('Last 7 days:'));
    assert.ok(!s.sent.find((e) => e.idempotencyKey.includes('2026-10-17') && e.idempotencyKey.startsWith('daily-report')));
  });

  await test('sendWeekends=true sends on Saturday', async () => {
    const db = setup(SAT);
    const s = sender();
    const r = await run(db, SAT, s.fn, { sendWeekends: true });
    assert.equal(r.agencies[0].status, 'SENT');
  });

  await test('no activity and nothing waiting: skipped, not sent', async () => {
    const db = setup(WED, false);
    const s = sender();
    const r = await run(db, WED, s.fn);
    assert.deepEqual(r.agencies.map((a) => [a.status, a.reason]), [['SKIPPED', 'no_activity']]);
    assert.equal(s.sent.length, 0);
    assert.equal(r.ops, 'not_needed');
    assert.equal(db.tables.report_runs[0].status, 'SKIPPED');
  });

  await test('a long gap since the last report is capped at 96 hours', async () => {
    const db = setup(WED);
    db.tables.report_runs = [{ id: 'old', agency_id: 'ag1', run_date: '2026-10-01', status: 'SENT', window_end: '2026-10-01T06:00:00Z' }];
    const s = sender();
    await run(db, WED, s.fn);
    const row = db.tables.report_runs.find((r) => r.run_date === '2026-10-14')!;
    assert.equal(WED.getTime() - new Date(row.window_start).getTime(), 96 * 3600_000);
  });

  await test('a failed send is recorded, reported to the owner, and retried by the next run', async () => {
    const db = setup(WED);
    const bad = sender({ failDaily: true });
    const first = await run(db, WED, bad.fn);
    assert.equal(first.agencies[0].status, 'FAILED');
    assert.equal(db.tables.report_runs[0].status, 'FAILED');
    assert.equal(first.ops, 'sent');
    const ops = bad.sent.find((e) => e.idempotencyKey.startsWith('ops-summary'))!;
    assert.equal(ops.to, 'owner@example.com');
    assert.ok(ops.text.includes('boom') && ops.text.includes('Oakwood Test'));

    const good = sender();
    const retry = await run(db, WED, good.fn);
    assert.equal(retry.agencies[0].status, 'SENT'); // FAILED does not block a retry the same day
    assert.equal(db.tables.report_runs.length, 1); // same row, updated
  });

  await test('the owner summary also flags stale reviews, and is silent when there is no admin address', async () => {
    const db = setup(WED);
    const s = sender();
    const r = await run(db, WED, s.fn);
    assert.equal(r.ops, 'sent');
    assert.ok(s.sent.find((e) => e.idempotencyKey.startsWith('ops-summary'))!.text.includes('NEEDS_REVIEW'));
    const db2 = setup(WED);
    const r2 = await run(db2, WED, sender().fn, { adminEmail: null });
    assert.equal(r2.ops, 'no_admin_email');
  });

  await test('the demo agency never pages the owner, but is still sent its own report when it has an address', async () => {
    const db = setup(WED);
    db.tables.agencies[0].slug = DEMO_SLUG;
    const s = sender();
    const r = await run(db, WED, s.fn);
    assert.equal(r.agencies[0].status, 'SENT');
    assert.equal(r.ops, 'not_needed');
    assert.ok(!s.sent.some((e) => e.idempotencyKey.startsWith('ops-summary')));
  });

  await test('dry run builds the email but sends nothing and writes nothing', async () => {
    const db = setup(WED);
    const s = sender();
    const r = await run(db, WED, s.fn, { dry: true });
    assert.equal(r.agencies[0].status, 'DRY_RUN');
    assert.ok(r.agencies[0].subject && r.agencies[0].preview);
    assert.equal(s.sent.length, 0);
    assert.equal((db.tables.report_runs ?? []).length, 0);
    assert.equal((db.tables.report_links ?? []).length, 0);
  });

  await test('onlySlug limits the run to one agency', async () => {
    const db = setup(WED);
    const r = await run(db, WED, sender().fn, { onlySlug: 'nobody' });
    assert.equal(r.agencies.length, 0);
  });

  console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);
}
main();