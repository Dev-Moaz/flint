// Run with: npx tsx scripts/ukdate.test.ts
import assert from 'node:assert/strict';
import { formatUkDate, maskUkDate, parseUkDate } from '../lib/dates';

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

console.log('maskUkDate (as a person types)');
test('digits get their slashes', () => {
  assert.equal(maskUkDate(''), '');
  assert.equal(maskUkDate('2'), '2');
  assert.equal(maskUkDate('25'), '25');
  assert.equal(maskUkDate('251'), '25/1');
  assert.equal(maskUkDate('2511'), '25/11');
  assert.equal(maskUkDate('25112'), '25/11/2');
  assert.equal(maskUkDate('251126'), '25/11/26');
});
test('a four-digit year is accepted, a fifth digit is ignored', () => {
  assert.equal(maskUkDate('25112026'), '25/11/2026');
  assert.equal(maskUkDate('251120261'), '25/11/2026');
});
test('typing the separators works, and a one-digit day or month is padded', () => {
  assert.equal(maskUkDate('5/1/26'), '05/01/26');
  assert.equal(maskUkDate('25.11.26'), '25/11/26');
  assert.equal(maskUkDate('25-11-26'), '25/11/26');
  assert.equal(maskUkDate('25 11 26'), '25/11/26');
});
test('a trailing separator adds nothing, a leading or doubled one is ignored', () => {
  assert.equal(maskUkDate('25/'), '25');
  assert.equal(maskUkDate('/'), '');
  assert.equal(maskUkDate('25//11'), '25/11');
});
test('letters are ignored', () => assert.equal(maskUkDate('2a5b'), '25'));
test('masking is idempotent (what it produced can be fed back, e.g. after a backspace)', () => {
  for (const v of ['', '2', '25', '25/1', '25/11', '25/11/2', '25/11/26', '25/11/2026']) assert.equal(maskUkDate(v), v);
});
test('deleting the last character of a full date works', () => assert.equal(maskUkDate('25/11/2'), '25/11/2'));

console.log('parseUkDate');
test('two-digit and four-digit years give the same ISO date (20yy)', () => {
  assert.equal(parseUkDate('25/11/26'), '2026-11-25');
  assert.equal(parseUkDate('25/11/2026'), '2026-11-25');
});
test('surrounding spaces are tolerated', () => assert.equal(parseUkDate(' 25/11/26 '), '2026-11-25'));
test('real calendar dates only', () => {
  assert.equal(parseUkDate('29/02/28'), '2028-02-29'); // leap year
  assert.equal(parseUkDate('29/02/27'), null);
  assert.equal(parseUkDate('31/04/26'), null);
  assert.equal(parseUkDate('00/01/26'), null);
  assert.equal(parseUkDate('25/13/26'), null);
});
test('incomplete or differently shaped text is null', () => {
  for (const v of ['', '25/11', '25/11/2', '25/11/202', '25112026', '2026-11-25', '25/11/26/1']) assert.equal(parseUkDate(v), null, v);
});
test('day first, not month first: 05/11/26 is 5 November', () => assert.equal(parseUkDate('05/11/26'), '2026-11-05'));

console.log('formatUkDate');
test('ISO to dd/mm/yy', () => assert.equal(formatUkDate('2026-11-25'), '25/11/26'));
test('anything that is not an ISO date gives an empty string', () => {
  assert.equal(formatUkDate(''), '');
  assert.equal(formatUkDate('garbage'), '');
  assert.equal(formatUkDate('25/11/26'), '');
});
test('format then parse returns the same date', () => {
  for (const iso of ['2026-01-05', '2026-11-25', '2028-02-29', '2099-12-31']) assert.equal(parseUkDate(formatUkDate(iso)), iso);
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);