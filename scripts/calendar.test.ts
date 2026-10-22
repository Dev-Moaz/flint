// Run with: npx tsx scripts/calendar.test.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyCalSignature } from '../lib/calendar/signature';
import { buildCalendarUrl } from '../lib/calendar/build-url';
import { decide, type LeadState } from '../lib/calendar/transitions';

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

const SECRET = 'test-secret-0123456789';
const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } });
const sign = (b: string, s = SECRET) => createHmac('sha256', s).update(b).digest('hex');

console.log('signature');
test('valid signature accepted', () => assert.ok(verifyCalSignature(body, sign(body), SECRET)));
test('"sha256=" prefix and upper case accepted', () => assert.ok(verifyCalSignature(body, 'sha256=' + sign(body).toUpperCase(), SECRET)));
test('wrong secret rejected', () => assert.ok(!verifyCalSignature(body, sign(body, 'other'), SECRET)));
test('tampered body rejected', () => assert.ok(!verifyCalSignature(body + ' ', sign(body), SECRET)));
test('re-serialised body rejected (why we use the raw text)', () => {
  const pretty = JSON.stringify(JSON.parse(body), null, 2);
  assert.ok(!verifyCalSignature(pretty, sign(body), SECRET));
});
test('missing header / secret rejected', () => {
  assert.ok(!verifyCalSignature(body, null, SECRET));
  assert.ok(!verifyCalSignature(body, sign(body), ''));
});
test('wrong length rejected without throwing', () => assert.ok(!verifyCalSignature(body, 'abc', SECRET)));

console.log('buildCalendarUrl');
const lead = { id: '3f2b8c1e-9a4d-4e6b-8c11-0a1b2c3d4e5f', name: "Mary-Jane O'Neil", email: 'mj@example.com' };
test('adds name, email and metadata[leadId]', () => {
  const u = new URL(buildCalendarUrl('https://cal.com/oakwood/viewing', lead)!);
  assert.equal(u.searchParams.get('name'), "Mary-Jane O'Neil");
  assert.equal(u.searchParams.get('email'), 'mj@example.com');
  assert.equal(u.searchParams.get('metadata[leadId]'), lead.id);
});
test('keeps existing query params', () => {
  const u = new URL(buildCalendarUrl('https://cal.com/oakwood/viewing?theme=light', lead)!);
  assert.equal(u.searchParams.get('theme'), 'light');
});
test('rejects http, junk and empty', () => {
  assert.equal(buildCalendarUrl('http://cal.com/x', lead), null);
  assert.equal(buildCalendarUrl('not a url', lead), null);
  assert.equal(buildCalendarUrl(null, lead), null);
  assert.equal(buildCalendarUrl('', lead), null);
});

console.log('decide (state machine)');
const st = (status: LeadState['status'], uid: string | null = null): LeadState => ({ status, cal_booking_uid: uid });
test('QUALIFIED + created => BOOK, sets booked_at', () => assert.deepEqual(decide(st('QUALIFIED'), { trigger: 'BOOKING_CREATED', uid: 'u1' }), { action: 'BOOK', setBookedAt: true }));
test('BOOKED + same created uid => NOOP (redelivery)', () => assert.equal(decide(st('BOOKED', 'u1'), { trigger: 'BOOKING_CREATED', uid: 'u1' }).action, 'NOOP'));
test('BOOKED + created with new uid => BOOK (replaced), keeps booked_at', () => {
  const d = decide(st('BOOKED', 'u1'), { trigger: 'BOOKING_CREATED', uid: 'u2' });
  assert.deepEqual(d, { action: 'BOOK', setBookedAt: false, reason: 'replaced_booking' });
});
test('BOOKED + rescheduled => BOOK (new uid/time)', () => assert.equal(decide(st('BOOKED', 'u1'), { trigger: 'BOOKING_RESCHEDULED', uid: 'u2' }).action, 'BOOK'));
test('QUALIFIED + rescheduled (missed create) => BOOK', () => assert.equal(decide(st('QUALIFIED'), { trigger: 'BOOKING_RESCHEDULED', uid: 'u2' }).action, 'BOOK'));
test('BOOKED + cancel of current uid => CANCEL', () => assert.equal(decide(st('BOOKED', 'u1'), { trigger: 'BOOKING_CANCELLED', uid: 'u1' }).action, 'CANCEL'));
test('late cancel of an OLD uid does not undo a newer booking', () => assert.equal(decide(st('BOOKED', 'u2'), { trigger: 'BOOKING_CANCELLED', uid: 'u1' }).action, 'NOOP'));
test('cancel when not booked => NOOP', () => assert.equal(decide(st('QUALIFIED'), { trigger: 'BOOKING_CANCELLED', uid: 'u1' }).action, 'NOOP'));
test('never books a lead that did not qualify', () => {
  for (const s of ['PENDING', 'DISQUALIFIED', 'NEEDS_REVIEW'] as const) {
    assert.deepEqual(decide(st(s), { trigger: 'BOOKING_CREATED', uid: 'u1' }), { action: 'REJECT', reason: 'lead_not_qualified' });
  }
});
test('unknown trigger => NOOP', () => assert.equal(decide(st('QUALIFIED'), { trigger: 'MEETING_ENDED', uid: 'u1' }).action, 'NOOP'));

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);