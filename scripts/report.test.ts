// Run with: npx tsx scripts/report.test.ts
import assert from 'node:assert/strict';
import { addDays, londonDate, londonMidnight, londonParts } from '../lib/dates';
import { buildReport, isOutOfHours, median } from '../lib/report/build';
import { generateDemoData } from '../lib/report/demo-data';
import { generateReportToken, hashReportToken, isPlausibleToken } from '../lib/report/tokens';
import { fmtAge, fmtDuration, fmtPercent } from '../lib/report/format';
import { parseRange, RANGES } from '../lib/report/config';
import type { ReportInput, ReportLeadRow } from '../lib/report/model';

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
const D = (s: string) => new Date(s);

console.log('london time');
test('londonMidnight: summer, winter and both clock-change days', () => {
  assert.equal(londonMidnight('2026-07-01').toISOString(), '2026-06-30T23:00:00.000Z');
  assert.equal(londonMidnight('2026-01-15').toISOString(), '2026-01-15T00:00:00.000Z');
  assert.equal(londonMidnight('2026-03-29').toISOString(), '2026-03-29T00:00:00.000Z'); // clocks go forward at 01:00
  assert.equal(londonMidnight('2026-10-25').toISOString(), '2026-10-24T23:00:00.000Z'); // clocks go back at 02:00
  assert.equal(londonMidnight('2026-10-26').toISOString(), '2026-10-26T00:00:00.000Z');
});
test('londonParts', () => {
  assert.deepEqual(londonParts(D('2026-07-07T07:59:00Z')), { date: '2026-07-07', hour: 8, weekday: 2 });
  assert.deepEqual(londonParts(D('2026-07-07T23:30:00Z')), { date: '2026-07-08', hour: 0, weekday: 3 });
});
test('isOutOfHours boundaries (Tue 7 Jul 2026, BST)', () => {
  assert.ok(isOutOfHours(D('2026-07-07T07:59:00Z'))); // 08:59
  assert.ok(!isOutOfHours(D('2026-07-07T08:00:00Z'))); // 09:00
  assert.ok(!isOutOfHours(D('2026-07-07T16:59:00Z'))); // 17:59
  assert.ok(isOutOfHours(D('2026-07-07T17:00:00Z'))); // 18:00
});
test('weekends are out of hours all day; winter time uses GMT', () => {
  assert.ok(isOutOfHours(D('2026-07-11T11:00:00Z'))); // Saturday noon
  assert.ok(isOutOfHours(D('2026-07-12T11:00:00Z'))); // Sunday noon
  assert.ok(!isOutOfHours(D('2026-01-13T09:00:00Z'))); // Tue 09:00 GMT
  assert.ok(isOutOfHours(D('2026-01-13T08:59:00Z')));
});

console.log('helpers');
test('median', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});
test('tokens', () => {
  const t = generateReportToken();
  assert.ok(isPlausibleToken(t));
  assert.notEqual(t, generateReportToken());
  assert.equal(hashReportToken(t).length, 64);
  assert.equal(hashReportToken(t), hashReportToken(t));
  assert.ok(!isPlausibleToken('short') && !isPlausibleToken(null) && !isPlausibleToken('x'.repeat(43) + '!'));
});
test('formatters and range parsing', () => {
  assert.equal(fmtDuration(8), '8s');
  assert.equal(fmtDuration(95), '1m 35s');
  assert.equal(fmtDuration(3700), '1h 1m');
  assert.equal(fmtDuration(null), 'n/a');
  assert.equal(fmtAge(0.2), 'under an hour');
  assert.equal(fmtAge(5.5), '5h');
  assert.equal(fmtAge(30), '1 day');
  assert.equal(fmtAge(80), '3 days');
  assert.equal(fmtPercent(0.456), '46%');
  assert.equal(parseRange('30d'), '30d');
  assert.equal(parseRange('year'), '7d');
  assert.equal(RANGES.today.days, 1);
});

console.log('buildReport: hand-made fixture');
const NOW = D('2026-10-14T10:00:00Z'); // Wed 11:00 BST
const FROM = londonMidnight(addDays(londonDate(NOW), -6)); // last 7 London days
const TO = new Date(NOW.getTime() + 1);
const lead = (over: Partial<ReportLeadRow> & { id: string }): ReportLeadRow => ({
  created_at: '2026-10-13T20:00:00Z', // Tue 21:00 BST: out of hours
  status: 'PENDING',
  tenant_name: 'Jane Smith',
  tenant_email: 'jane@example.com',
  tenant_phone: '07700 900123',
  property_id: 'p1',
  raw_property_ref: null,
  source_email_id: null,
  invitation_sent_at: null,
  invitation_error: null,
  screened_at: null,
  booked_at: null,
  viewing_starts_at: null,
  failure_codes: null,
  review_reason: null,
  ...over,
});
const fixtureInput = (leads: ReportLeadRow[], extra: Partial<ReportInput> = {}): ReportInput => ({
  agencyName: 'Oakwood',
  now: NOW,
  from: FROM,
  to: TO,
  rangeLabel: 'Last 7 days',
  previousLabel: 'the 7 days before',
  leads,
  properties: [{ id: 'p1', address: '27 Brixton Road, London SW9' }, { id: 'p2', address: '8 Acre Lane, London SW2' }],
  inbound: [],
  calendarEvents: [],
  ...extra,
});

test('counts every status, funnel stages and out-of-hours in the window', () => {
  const leads = [
    lead({ id: 'a', status: 'BOOKED', invitation_sent_at: '2026-10-13T20:00:10Z', screened_at: '2026-10-13T21:00:00Z', booked_at: '2026-10-13T22:00:00Z', viewing_starts_at: '2026-10-16T10:00:00Z' }),
    lead({ id: 'b', status: 'QUALIFIED', created_at: '2026-10-12T10:00:00Z', invitation_sent_at: '2026-10-12T10:00:05Z', screened_at: '2026-10-12T11:00:00Z' }),
    lead({ id: 'c', status: 'DISQUALIFIED', property_id: 'p2', created_at: '2026-10-12T14:00:00Z', invitation_sent_at: '2026-10-12T14:00:05Z', screened_at: '2026-10-12T15:00:00Z', failure_codes: ['INCOME_BELOW_THRESHOLD', 'ADVERSE_CREDIT'] }),
    lead({ id: 'd', status: 'PENDING', created_at: '2026-10-14T08:00:00Z', invitation_sent_at: '2026-10-14T08:00:05Z' }),
    lead({ id: 'e', status: 'NEEDS_REVIEW', property_id: null, raw_property_ref: '14 Elmfield Gardens', review_reason: 'property_not_matched', created_at: '2026-10-11T09:00:00Z' }),
    lead({ id: 'old', status: 'BOOKED', created_at: '2026-09-01T10:00:00Z' }), // outside the window
  ];
  const m = buildReport(fixtureInput(leads)).metrics;
  assert.equal(m.enquiries, 5);
  assert.equal(m.invited, 4);
  assert.equal(m.screened, 3);
  assert.equal(m.qualified, 2); // BOOKED + QUALIFIED
  assert.equal(m.booked, 1);
  assert.equal(m.disqualified, 1);
  assert.equal(m.needsReview, 1);
  assert.equal(m.inProgress, 1);
  // out of hours: a (Tue 21:00 BST), d (Wed 09:00 BST is in hours? 08:00Z = 09:00 BST -> in hours), b 11:00 BST in hours, c 15:00 in hours, e Sun 10:00 BST weekend
  assert.equal(m.outOfHours, 2);
  assert.equal(m.completionRate, 3 / 4);
  assert.equal(m.bookingRate, 1 / 2);
});

test('median reply time runs from our receipt of the email to the invitation', () => {
  const leads = [
    lead({ id: 'a', source_email_id: 'e1', invitation_sent_at: '2026-10-13T20:00:12Z' }),
    lead({ id: 'b', source_email_id: 'e2', invitation_sent_at: '2026-10-13T20:00:20Z' }),
    lead({ id: 'c', source_email_id: 'e3', invitation_sent_at: '2026-10-13T20:00:08Z' }),
    lead({ id: 'd', source_email_id: null, invitation_sent_at: '2026-10-13T20:05:00Z' }), // no inbound row: ignored
  ];
  const inbound = ['e1', 'e2', 'e3'].map((id) => ({ resend_email_id: id, created_at: '2026-10-13T20:00:00Z', status: 'PROCESSED', reason: null, lead_id: null }));
  assert.equal(buildReport(fixtureInput(leads, { inbound })).metrics.medianReplySeconds, 12);
});

test('no data at all gives zeros and nulls, never NaN', () => {
  const m = buildReport(fixtureInput([])).metrics;
  assert.equal(m.enquiries, 0);
  assert.equal(m.outOfHoursShare, null);
  assert.equal(m.medianReplySeconds, null);
  assert.equal(m.completionRate, null);
  assert.equal(m.bookingRate, null);
});

test('unreadable emails count as enquiries needing review, and appear in attention', () => {
  const inbound = [{ resend_email_id: 'x', created_at: '2026-10-13T20:00:00Z', status: 'NEEDS_REVIEW', reason: 'extraction_failed', lead_id: null }];
  const r = buildReport(fixtureInput([], { inbound }));
  assert.equal(r.metrics.enquiries, 1);
  assert.equal(r.metrics.needsReview, 1);
  assert.equal(r.metrics.outOfHours, 1);
  assert.equal(r.attention[0].kind, 'UNREADABLE_EMAIL');
  assert.match(r.attention[0].detail, /could not read/i);
});

test('attention: qualified-not-booked, stale invitations and failed invitations (whatever the range)', () => {
  const leads = [
    lead({ id: 'q', status: 'QUALIFIED', created_at: '2026-09-20T10:00:00Z', screened_at: '2026-09-20T11:00:00Z' }), // outside window but still outstanding
    lead({ id: 'stale', status: 'PENDING', created_at: '2026-10-12T10:00:00Z', invitation_sent_at: '2026-10-12T10:00:05Z' }),
    lead({ id: 'fresh', status: 'PENDING', created_at: '2026-10-14T09:00:00Z', invitation_sent_at: '2026-10-14T09:00:05Z' }), // 1h old: not flagged
    lead({ id: 'fail', status: 'PENDING', created_at: '2026-10-14T09:30:00Z', invitation_error: 'Domain is not verified' }),
    lead({ id: 'done', status: 'BOOKED', screened_at: '2026-10-13T21:00:00Z' }),
  ];
  const kinds = buildReport(fixtureInput(leads)).attention.map((a) => `${a.kind}:${a.leadId}`);
  assert.deepEqual(kinds, ['INVITE_FAILED:fail', 'QUALIFIED_NOT_BOOKED:q', 'INVITE_NOT_COMPLETED:stale']);
});

test('attention: booking exceptions from the calendar log, in plain words', () => {
  const calendarEvents = [
    { trigger_event: 'BOOKING_CREATED', status: 'REJECTED', reason: 'lead_not_qualified', created_at: '2026-10-13T10:00:00Z' },
    { trigger_event: 'BOOKING_CREATED', status: 'APPLIED', reason: null, created_at: '2026-10-13T11:00:00Z' },
  ];
  const a = buildReport(fixtureInput([], { calendarEvents })).attention;
  assert.equal(a.length, 1);
  assert.match(a[0].detail, /had not completed screening/);
});

test('upcoming viewings: only future, soonest first', () => {
  const leads = [
    lead({ id: 'late', status: 'BOOKED', viewing_starts_at: '2026-10-20T10:00:00Z' }),
    lead({ id: 'soon', status: 'BOOKED', viewing_starts_at: '2026-10-15T10:00:00Z' }),
    lead({ id: 'past', status: 'BOOKED', viewing_starts_at: '2026-10-13T10:00:00Z' }),
  ];
  assert.deepEqual(buildReport(fixtureInput(leads)).upcoming.map((u) => u.leadId), ['soon', 'late']);
});

test('previous window feeds the deltas and does not leak into the current one', () => {
  const leads = [
    lead({ id: 'now1', created_at: '2026-10-13T10:00:00Z' }),
    lead({ id: 'prev1', created_at: '2026-10-05T10:00:00Z' }), // 7-14 days before
    lead({ id: 'prev2', created_at: '2026-10-04T10:00:00Z', status: 'BOOKED' }),
  ];
  const r = buildReport(fixtureInput(leads));
  assert.equal(r.metrics.enquiries, 1);
  assert.equal(r.previous.enquiries, 2);
  assert.equal(r.previous.booked, 1);
});

test('reasons are plain English; income figures never appear in the model', () => {
  const leads = [lead({ id: 'c', status: 'DISQUALIFIED', failure_codes: ['INCOME_BELOW_THRESHOLD', 'NO_RIGHT_TO_RENT'], created_at: '2026-10-13T10:00:00Z', screened_at: '2026-10-13T11:00:00Z' })];
  const r = buildReport(fixtureInput(leads));
  assert.deepEqual(r.rows[0].details, ['Declared income below the affordability threshold', 'Did not confirm the right to rent in England']);
  assert.ok(!/annual_income|income":/i.test(JSON.stringify(r)));
});

test('daily series covers every London day of the window, in order', () => {
  const r = buildReport(fixtureInput([lead({ id: 'a' })]));
  assert.equal(r.daily.length, 7);
  assert.equal(r.daily[0].date, '2026-10-08');
  assert.equal(r.daily[6].date, '2026-10-14');
  assert.equal(r.daily.reduce((s, d) => s + d.total, 0), 1);
});

test('hourly: 24 London hours that add up to the enquiries and the out-of-hours count', () => {
  const leads = [
    lead({ id: 'a', created_at: '2026-10-13T20:00:00Z' }), // Tue 21:00 BST, out of hours
    lead({ id: 'b', created_at: '2026-10-13T20:30:00Z' }), // 21:30
    lead({ id: 'c', created_at: '2026-10-13T10:00:00Z' }), // Tue 11:00 BST, office hours
    lead({ id: 'd', created_at: '2026-10-11T10:00:00Z' }), // Sun 11:00 BST, weekend = out of hours
  ];
  const r = buildReport(fixtureInput(leads));
  assert.equal(r.hourly.length, 24);
  assert.deepEqual(r.hourly[21], { hour: 21, total: 2, outOfHours: 2 });
  assert.deepEqual(r.hourly[11], { hour: 11, total: 2, outOfHours: 1 }); // one weekday, one Sunday
  assert.equal(r.hourly.reduce((n, h) => n + h.total, 0), r.metrics.enquiries);
  assert.equal(r.hourly.reduce((n, h) => n + h.outOfHours, 0), r.metrics.outOfHours);
});

test('reasons: one count per code, most common first, only for not-qualified applicants', () => {
  const leads = [
    lead({ id: 'a', status: 'DISQUALIFIED', failure_codes: ['INCOME_BELOW_THRESHOLD', 'ADVERSE_CREDIT'], created_at: '2026-10-13T10:00:00Z' }),
    lead({ id: 'b', status: 'DISQUALIFIED', failure_codes: ['INCOME_BELOW_THRESHOLD'], created_at: '2026-10-13T11:00:00Z' }),
    lead({ id: 'c', status: 'QUALIFIED', failure_codes: [], created_at: '2026-10-13T12:00:00Z' }),
  ];
  const r = buildReport(fixtureInput(leads));
  assert.deepEqual(r.reasons.map((x) => [x.code, x.count]), [['INCOME_BELOW_THRESHOLD', 2], ['ADVERSE_CREDIT', 1]]);
  assert.equal(r.reasons[0].label, 'Declared income below the affordability threshold');
  assert.deepEqual(buildReport(fixtureInput([])).reasons, []);
});

console.log('buildReport: demo data invariants');
const demo = generateDemoData(NOW, 7);
const model = buildReport({
  agencyName: 'Demo Lettings',
  now: NOW,
  from: londonMidnight(addDays(londonDate(NOW), -29)),
  to: TO,
  rangeLabel: 'Last 30 days',
  previousLabel: 'the 30 days before',
  leads: demo.leads,
  properties: demo.properties,
  inbound: demo.inbound,
  calendarEvents: demo.calendarEvents,
});

test('demo data is deterministic and fully fictional', () => {
  assert.deepEqual(generateDemoData(NOW, 7).leads.map((l) => l.id), demo.leads.map((l) => l.id));
  for (const l of demo.leads) {
    assert.ok(l.tenant_email.endsWith('@example.com'));
    assert.ok(!l.tenant_phone || l.tenant_phone.startsWith('07700 900'));
    assert.ok(new Date(l.created_at).getTime() <= NOW.getTime());
  }
});
test('funnel never grows from one stage to the next', () => {
  const f = model.funnel.map((s) => s.count);
  for (let i = 1; i < f.length; i++) assert.ok(f[i] <= f[i - 1], `${model.funnel[i].label}: ${f.join(',')}`);
});
test('every lead in the window shows in the table, by-property and daily totals', () => {
  const inWindow = demo.leads.length; // all demo leads fall inside 30 days
  assert.equal(model.rows.length, inWindow);
  assert.equal(model.byProperty.reduce((s, p) => s + p.enquiries, 0), inWindow);
  assert.equal(model.daily.reduce((s, d) => s + d.total, 0), model.metrics.enquiries);
});
test('demo: hourly and reasons are consistent with the headline numbers', () => {
  assert.equal(model.hourly.reduce((n, h) => n + h.total, 0), model.metrics.enquiries);
  assert.equal(model.hourly.reduce((n, h) => n + h.outOfHours, 0), model.metrics.outOfHours);
  assert.ok(model.reasons.length >= 1);
});
test('status counts add up to the enquiries', () => {
  const m = model.metrics;
  const unreadable = demo.inbound.filter((i) => i.status === 'NEEDS_REVIEW' && !i.lead_id).length;
  assert.equal(m.enquiries, demo.leads.length + unreadable);
  const bookedOrQualified = demo.leads.filter((l) => l.status === 'BOOKED' || l.status === 'QUALIFIED').length;
  assert.equal(m.qualified, bookedOrQualified);
  assert.equal(m.qualified + m.disqualified + m.inProgress + (m.needsReview - unreadable), demo.leads.length);
});
test('the demo tells a believable story for the Loom', () => {
  const m = model.metrics;
  assert.ok(m.outOfHoursShare! > 0.35 && m.outOfHoursShare! < 0.75, String(m.outOfHoursShare));
  assert.ok(m.medianReplySeconds! >= 5 && m.medianReplySeconds! <= 25, String(m.medianReplySeconds));
  assert.ok(m.booked >= 5 && m.disqualified >= 5 && m.inProgress >= 3, JSON.stringify(m));
  assert.ok(model.attention.length >= 4);
  assert.ok(model.upcoming.length >= 1);
});
test('highlights carry first names only (for the email)', () => {
  for (const h of [...model.highlights.booked, ...model.highlights.disqualified]) assert.ok(!h.name.includes(' '), h.name);
});
test('attention is sorted by kind priority, then oldest first', () => {
  const order = ['NEEDS_REVIEW', 'UNREADABLE_EMAIL', 'INVITE_FAILED', 'BOOKING_EXCEPTION', 'QUALIFIED_NOT_BOOKED', 'INVITE_NOT_COMPLETED'];
  for (let i = 1; i < model.attention.length; i++) {
    const a = model.attention[i - 1], b = model.attention[i];
    const ka = order.indexOf(a.kind), kb = order.indexOf(b.kind);
    assert.ok(ka < kb || (ka === kb && a.ageHours >= b.ageHours));
  }
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);