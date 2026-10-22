// Run with: npx tsx scripts/billing.test.ts
import assert from 'node:assert/strict';
import {
  ENDING_SOON_DAYS,
  GRACE_DAYS,
  PERIOD_DAYS,
  accessAttention,
  accessStatus,
  extendAccess,
  isEntitled,
} from '../lib/billing/access';

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

const DAY = 24 * 60 * 60 * 1000;
const UNTIL = '2026-11-10T12:00:00.000Z';
const U = Date.parse(UNTIL);
/** A moment `offset` milliseconds after the access end (negative = before). */
const at = (offset: number) => new Date(U + offset);
const GRACE_END = GRACE_DAYS * DAY;

console.log('constants');
test('a paid period is 30 days (the Whop plan bills every 30 days)', () => assert.equal(PERIOD_DAYS, 30));

console.log('accessStatus');
test('NULL means never activated', () => assert.equal(accessStatus(null, at(0)), 'NOT_STARTED'));
test('one millisecond before the end is ACTIVE', () => assert.equal(accessStatus(UNTIL, at(-1)), 'ACTIVE'));
test('the end itself is already GRACE (the end is exclusive)', () => assert.equal(accessStatus(UNTIL, at(0)), 'GRACE'));
test('the last millisecond of the grace period is still GRACE', () => assert.equal(accessStatus(UNTIL, at(GRACE_END - 1)), 'GRACE'));
test('the end of the grace period is EXPIRED', () => assert.equal(accessStatus(UNTIL, at(GRACE_END)), 'EXPIRED'));
test('long after the end is EXPIRED', () => assert.equal(accessStatus(UNTIL, at(400 * DAY)), 'EXPIRED'));
test('the 2099 backfill is ACTIVE', () => assert.equal(accessStatus('2099-01-01T00:00:00.000Z', at(0)), 'ACTIVE'));
test('a value that was never loaded throws (undefined is not NULL)', () => {
  assert.throws(() => accessStatus(undefined as unknown as null, at(0)), /not loaded/);
});
test('garbage and empty strings throw instead of guessing', () => {
  assert.throws(() => accessStatus('not a date', at(0)), /not a valid date/);
  assert.throws(() => accessStatus('', at(0)), /not a valid date/);
});

console.log('isEntitled');
test('only ACTIVE and GRACE are served', () => {
  assert.equal(isEntitled(null, at(0)), false);
  assert.equal(isEntitled(UNTIL, at(-DAY)), true);
  assert.equal(isEntitled(UNTIL, at(DAY)), true);
  assert.equal(isEntitled(UNTIL, at(GRACE_END)), false);
});
test('a value that was never loaded throws here too', () => {
  assert.throws(() => isEntitled(undefined as unknown as null, at(0)));
});

console.log('accessAttention (owner summary)');
test('nothing to report without a usable date', () => {
  assert.equal(accessAttention(null, at(0)), null);
  assert.equal(accessAttention(undefined, at(0)), null);
  assert.equal(accessAttention('', at(0)), null);
  assert.equal(accessAttention('not a date', at(0)), null);
});
test('far from the end: nothing to report', () => {
  assert.equal(accessAttention(UNTIL, at(-(ENDING_SOON_DAYS * DAY) - 1)), null);
  assert.equal(accessAttention('2099-01-01T00:00:00.000Z', at(0)), null);
});
test('exactly ENDING_SOON_DAYS before the end is ENDING_SOON (inclusive)', () => {
  assert.equal(accessAttention(UNTIL, at(-ENDING_SOON_DAYS * DAY)), 'ENDING_SOON');
});
test('one millisecond before the end is ENDING_SOON', () => assert.equal(accessAttention(UNTIL, at(-1)), 'ENDING_SOON'));
test('inside the grace period is IN_GRACE', () => {
  assert.equal(accessAttention(UNTIL, at(0)), 'IN_GRACE');
  assert.equal(accessAttention(UNTIL, at(GRACE_END - 1)), 'IN_GRACE');
});
test('after the grace period there is nothing to report (missed enquiries take over)', () => {
  assert.equal(accessAttention(UNTIL, at(GRACE_END)), null);
});

console.log('extendAccess');
const PAID = new Date('2026-11-12T09:30:00.000Z');
const monthAfter = (d: Date) => d.getTime() + PERIOD_DAYS * DAY;
test('never activated: a month from the payment', () => {
  assert.equal(extendAccess(null, PAID).getTime(), monthAfter(PAID));
});
test('access that already ended: a month from the payment', () => {
  assert.equal(extendAccess(UNTIL, PAID).getTime(), monthAfter(PAID));
});
test('a pilot or period that runs longer is never shortened', () => {
  const longer = '2027-06-01T00:00:00.000Z';
  assert.equal(extendAccess(longer, PAID).toISOString(), longer);
});
test('the same payment handled twice changes nothing', () => {
  const once = extendAccess(UNTIL, PAID).toISOString();
  assert.equal(extendAccess(once, PAID).toISOString(), once);
});
test('a renewal one period later adds exactly one period (no drift)', () => {
  const first = extendAccess(null, PAID);
  const renewalPaidAt = new Date(PAID.getTime() + PERIOD_DAYS * DAY);
  assert.equal(extendAccess(first.toISOString(), renewalPaidAt).getTime(), PAID.getTime() + 2 * PERIOD_DAYS * DAY);
});
test('an older payment arriving late does not pull access back', () => {
  const current = extendAccess(null, PAID).toISOString();
  const older = new Date(PAID.getTime() - 10 * DAY);
  assert.equal(extendAccess(current, older).toISOString(), current);
});
test('a current value that is not a date throws', () => {
  assert.throws(() => extendAccess('nonsense', PAID), /not a valid date/);
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);