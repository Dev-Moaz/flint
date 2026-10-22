// Run with: npx tsx scripts/triage.test.ts
import assert from 'node:assert/strict';
import { addDays, isValidIsoDate, londonDate } from '../lib/dates';
import { evaluateTenantTriage, parseTriageInput, resolveMultiplier } from '../lib/triage-rules';
import { MOVE_IN_MAX_DAYS } from '../lib/triage-config';

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

const NOW = new Date('2026-10-11T12:00:00Z'); // 13:00 in London (BST)
const TODAY = '2026-10-11';
const good = { annualIncome: 62000, hasRightToRent: true, hasNoCCJ: true, moveInDate: '2026-11-01' };

console.log('dates');
test('londonDate uses London time, not UTC (23:30 UTC in summer is already tomorrow)', () => {
  assert.equal(londonDate(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
  assert.equal(londonDate(new Date('2026-01-01T23:30:00Z')), '2026-01-01');
});
test('addDays crosses months, years and leap days', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30'); // across the clock change
  assert.equal(addDays('2026-10-11', 180), '2027-04-09');
});
test('isValidIsoDate', () => {
  assert.ok(isValidIsoDate('2028-02-29'));
  assert.ok(!isValidIsoDate('2026-02-29'));
  assert.ok(!isValidIsoDate('2026-02-30'));
  assert.ok(!isValidIsoDate('2026-13-01'));
  assert.ok(!isValidIsoDate('11/01/2026'));
});

console.log('parseTriageInput');
test('accepts a valid submission', () => assert.deepEqual(parseTriageInput(good, NOW), { ok: true, value: good }));
test('accepts today and the last allowed day', () => {
  assert.ok(parseTriageInput({ ...good, moveInDate: TODAY }, NOW).ok);
  assert.ok(parseTriageInput({ ...good, moveInDate: addDays(TODAY, MOVE_IN_MAX_DAYS) }, NOW).ok);
});
test('rejects yesterday and beyond the limit with friendly messages', () => {
  const past = parseTriageInput({ ...good, moveInDate: '2026-10-10' }, NOW);
  assert.ok(!past.ok && /today onwards/.test(past.error));
  const far = parseTriageInput({ ...good, moveInDate: addDays(TODAY, MOVE_IN_MAX_DAYS + 1) }, NOW);
  assert.ok(!far.ok && /six months/.test(far.error));
});
test('rejects impossible dates', () => assert.ok(!parseTriageInput({ ...good, moveInDate: '2026-11-31' }, NOW).ok));
test('booleans must be real booleans ("false" and "true" strings are rejected)', () => {
  assert.ok(!parseTriageInput({ ...good, hasNoCCJ: 'false' }, NOW).ok);
  assert.ok(!parseTriageInput({ ...good, hasRightToRent: 'true' }, NOW).ok);
  assert.ok(!parseTriageInput({ ...good, hasRightToRent: undefined }, NOW).ok);
});
test('income must be a finite, non-negative number', () => {
  for (const bad of [-1, NaN, Infinity, '62000', null, undefined, 1e12]) {
    assert.ok(!parseTriageInput({ ...good, annualIncome: bad }, NOW).ok, String(bad));
  }
  assert.ok(parseTriageInput({ ...good, annualIncome: 0 }, NOW).ok);
});
test('non-objects are rejected', () => {
  for (const bad of [null, undefined, 'x', 42, []]) assert.ok(!parseTriageInput(bad, NOW).ok);
});

console.log('evaluateTenantTriage');
test('qualifies with all criteria met', () => {
  const r = evaluateTenantTriage(good, 2000, 30);
  assert.deepEqual(r, { isQualified: true, failureCodes: [], nextAction: 'SHOW_CALENDAR' });
});
test('income exactly at the threshold qualifies (>=), one pound less does not', () => {
  assert.ok(evaluateTenantTriage({ ...good, annualIncome: 60000 }, 2000, 30).isQualified);
  assert.deepEqual(evaluateTenantTriage({ ...good, annualIncome: 59999 }, 2000, 30).failureCodes, ['INCOME_BELOW_THRESHOLD']);
});
test('each failure produces its own code', () => {
  assert.deepEqual(evaluateTenantTriage({ ...good, hasRightToRent: false }, 2000).failureCodes, ['NO_RIGHT_TO_RENT']);
  assert.deepEqual(evaluateTenantTriage({ ...good, hasNoCCJ: false }, 2000).failureCodes, ['ADVERSE_CREDIT']);
});
test('several failures are all reported, and the result is SHOW_REJECTION', () => {
  const r = evaluateTenantTriage({ ...good, annualIncome: 100, hasRightToRent: false, hasNoCCJ: false }, 2000);
  assert.deepEqual(r.failureCodes, ['INCOME_BELOW_THRESHOLD', 'NO_RIGHT_TO_RENT', 'ADVERSE_CREDIT']);
  assert.equal(r.nextAction, 'SHOW_REJECTION');
});
test('the move-in date is NOT a criterion', () => {
  assert.ok(evaluateTenantTriage({ ...good, moveInDate: '2027-03-01' }, 2000).isQualified);
});
test('a null/zero/garbage multiplier falls back to 30 instead of passing everyone', () => {
  for (const m of [null, undefined, 0, -5, NaN, 'abc']) {
    assert.equal(resolveMultiplier(m), 30, String(m));
    assert.deepEqual(evaluateTenantTriage({ ...good, annualIncome: 100 }, 2000, m as never).failureCodes, ['INCOME_BELOW_THRESHOLD']);
  }
});
test('a per-agency multiplier is respected (string numerics too)', () => {
  assert.equal(resolveMultiplier('36'), 36);
  assert.ok(!evaluateTenantTriage({ ...good, annualIncome: 62000 }, 2000, 36).isQualified);
});
test('the result never carries income figures', () => {
  const json = JSON.stringify(evaluateTenantTriage({ ...good, annualIncome: 12345 }, 2000));
  assert.ok(!json.includes('12345') && !json.includes('60000'));
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);