// Run with: npx tsx scripts/digest.test.ts
import assert from 'node:assert/strict';
import { addDays, londonDate, londonMidnight } from '../lib/dates';
import { buildReport } from '../lib/report/build';
import { generateDemoData } from '../lib/report/demo-data';
import { digestSubject, renderDailyDigest, shortName, shouldSendDigest } from '../lib/report/digest-email';
import { computeWindow, MAX_WINDOW_HOURS } from '../lib/report/window';
import { opsHasIssues, renderOpsSummary } from '../lib/report/ops-email';
import type { ReportModel } from '../lib/report/model';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const NOW = new Date('2026-10-14T06:00:00Z'); // 07:00 BST
const demo = generateDemoData(NOW, 7);
const model = (overrides: Partial<Parameters<typeof buildReport>[0]> = {}): ReportModel =>
  buildReport({
    agencyName: 'Demo Lettings',
    now: NOW,
    from: londonMidnight(addDays(londonDate(NOW), -6)),
    to: new Date(NOW.getTime() + 1),
    rangeLabel: 'Since the last report',
    previousLabel: 'the period before',
    leads: demo.leads,
    properties: demo.properties,
    inbound: demo.inbound,
    calendarEvents: demo.calendarEvents,
    ...overrides,
  });
const m = model();
const URL = 'https://app.example.com/report/demo-lettings?t=' + 'A'.repeat(43);
const render = (mod = m, weekly: Parameters<typeof renderDailyDigest>[0]['weekly'] = null) =>
  renderDailyDigest({ model: mod, reportUrl: URL, linkExpiresAt: '2026-10-21T06:00:00Z', weekly });

console.log('digest email');
test('shortName keeps first name and last initial only', () => {
  assert.equal(shortName('Mateo Reid'), 'Mateo R.');
  assert.equal(shortName('Mary Jane van der Berg'), 'Mary B.');
  assert.equal(shortName('Cher'), 'Cher');
});
test('privacy: no applicant e-mail, phone number or income appears in the email', () => {
  const { html, text } = render();
  for (const lead of demo.leads) {
    for (const secret of [lead.tenant_email, lead.tenant_phone, lead.tenant_name].filter(Boolean) as string[]) {
      assert.ok(!html.includes(secret) && !text.includes(secret), `leaked: ${secret}`);
    }
    if (lead.annual_income) assert.ok(!text.includes(String(lead.annual_income)));
  }
});
test('the private link, its expiry and the plain-text twin are present', () => {
  const { html, text } = render();
  assert.equal(html.split(URL).length - 1, 1);
  assert.ok(text.includes(URL));
  assert.ok(/expires on 21 Oct/.test(text) && /expires on 21 Oct/.test(html));
});
test('subject summarises the day, with attention count', () => {
  assert.match(digestSubject(m), /^\d+ enquiries?, \d+ viewings? booked \(\d+ needs? attention\)$/);
  const quiet = model({ leads: [], inbound: [], calendarEvents: [] });
  assert.equal(digestSubject(quiet), 'No new enquiries');
});
test('lists are capped at 6 with a "more on the dashboard" line', () => {
  const { text } = render();
  assert.ok(m.attention.length > 6);
  assert.match(text, /\+ \d+ more on the dashboard/);
  const attentionBlock = text.split('Needs your attention')[1].split('\n\n')[0];
  assert.equal((attentionBlock.match(/^- /gm) ?? []).length, 6);
});
test('the weekly recap appears only when given', () => {
  assert.ok(!render().text.includes('Last 7 days'));
  assert.ok(render(m, { enquiries: 17, outOfHours: 9, booked: 4 }).text.includes('Last 7 days: 17 enquiries (9 out of hours), 4 viewings booked.'));
});
test('hostile agency and property names are escaped', () => {
  const evil = model({
    agencyName: '<img src=x onerror=alert(1)>',
    properties: demo.properties.map((p) => ({ ...p, address: '"><script>alert(1)</script>' })),
  });
  const { html } = render(evil);
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
});
test('layout hygiene: tables, no remote images or stylesheets', () => {
  const { html } = render();
  assert.ok(html.includes('role="presentation"'));
  assert.ok(!/<img\b/i.test(html) && !/<link\b/i.test(html) && !/@import/i.test(html));
});
test('nothing happened and nothing waits: do not send', () => {
  assert.ok(shouldSendDigest(m));
  assert.ok(!shouldSendDigest(model({ leads: [], inbound: [], calendarEvents: [] })));
});

console.log('report window');
test('starts at the last report that really went out', () => {
  const w = computeWindow(NOW, '2026-10-13T06:00:00Z');
  assert.equal(w.start.toISOString(), '2026-10-13T06:00:00.000Z');
  assert.equal(w.end.getTime(), NOW.getTime());
});
test('defaults to 24h when nothing was ever sent, and is capped when the gap is long', () => {
  assert.equal(computeWindow(NOW, null).start.toISOString(), '2026-10-13T06:00:00.000Z');
  const capped = computeWindow(NOW, '2026-10-01T06:00:00Z');
  assert.equal(NOW.getTime() - capped.start.getTime(), MAX_WINDOW_HOURS * 3600_000);
});
test('a "last sent" in the future (clock skew) is ignored', () => {
  assert.equal(computeWindow(NOW, '2026-10-20T00:00:00Z').start.toISOString(), '2026-10-13T06:00:00.000Z');
});

console.log('ops summary');
test('empty summary needs nothing; any issue triggers it', () => {
  const base = { date: '2026-10-14', failedEmails: { count: 0, reasons: [] }, staleReview: [], inviteFailures: 0, bookingExceptions: 0, reportFailures: [] };
  assert.ok(!opsHasIssues(base));
  assert.ok(opsHasIssues({ ...base, inviteFailures: 1 }));
  assert.ok(opsHasIssues({ ...base, staleReview: [{ agency: 'A', count: 2 }] }));
});
test('ops text lists each problem with counts', () => {
  const { subject, text } = renderOpsSummary({
    date: '2026-10-14',
    failedEmails: { count: 2, reasons: ['Could not fetch email body (x2)'] },
    staleReview: [{ agency: 'Demo Lettings', count: 3 }],
    inviteFailures: 1,
    bookingExceptions: 0,
    reportFailures: [{ agency: 'Demo Lettings', reason: 'boom' }],
  });
  assert.equal(subject, 'Ops: 7 items need a look');
  assert.ok(text.includes('FAILED') && text.includes('Demo Lettings: 3') && text.includes('boom'));
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);