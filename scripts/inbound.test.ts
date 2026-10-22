// Run with: npx tsx scripts/inbound.test.ts
// Synthetic fixtures only (made-up names and addresses). Replace/extend with real,
// anonymised portal emails once an agency forwards some.
import assert from 'node:assert/strict';
import { bareAddress, isAllowedSender, isLettingsEnquirySubject, isSystemAddress } from '../lib/inbound/senders';
import { boundedText, cleanName, cleanPhone, emailAppearsIn, htmlToText } from '../lib/inbound/sanitize';
import { matchProperty, type PropertyCandidate } from '../lib/parser/match-property';

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

const props: PropertyCandidate[] = [
  { id: 'p4', address: 'Flat 4, 12 Clapham Common South Side, London SW4', reference: 'OAK-0142', portal_listing_id: '160123456' },
  { id: 'p5', address: 'Flat 5, 12 Clapham Common South Side, London SW4', reference: 'OAK-0143', portal_listing_id: '160123999' },
  { id: 'p7', address: '27 Brixton Rd, London SW9', reference: null, portal_listing_id: null },
  { id: 'p9', address: '8 Acre Lane, London SW2', reference: 'OAK-0150', portal_listing_id: null },
];

console.log('senders');
test('bareAddress handles "Name <a@b.com>"', () => assert.equal(bareAddress('Acme <Admin@Update.Rightmove.co.uk>'), 'admin@update.rightmove.co.uk'));
test('bareAddress rejects junk', () => assert.equal(bareAddress('not an address'), null));
test('portal sender allowed (both Rightmove addresses)', () => {
  assert.ok(isAllowedSender('admin@update.rightmove.co.uk', []));
  assert.ok(isAllowedSender('autoresponder@rightmove.com', null));
});
test('random sender blocked', () => assert.ok(!isAllowedSender('attacker@evil.example', [])));
test('agency forwarding mailbox allowed', () => assert.ok(isAllowedSender('Lettings <lettings@oakwood.co.uk>', ['lettings@oakwood.co.uk'])));
test('system address detection', () => {
  assert.ok(isSystemAddress('autoresponder@rightmove.com', null, []));
  assert.ok(isSystemAddress('oakwood@inbound.example.com', 'oakwood@inbound.example.com', []));
  assert.ok(!isSystemAddress('tenant@gmail.com', 'oakwood@inbound.example.com', ['lettings@oakwood.co.uk']));
});
test('lettings subject accepted', () => assert.ok(isLettingsEnquirySubject('Lettings enquiry: 2 bed flat, Clapham')));
test('forwarded lettings subject accepted', () => assert.ok(isLettingsEnquirySubject('Fwd: Lettings enquiry: Flat 4')));
test('sales / valuation / commercial rejected', () => {
  assert.ok(!isLettingsEnquirySubject('Sales enquiry: 3 bed house'));
  assert.ok(!isLettingsEnquirySubject('Rightmove Valuation Request – Online Agent Valuation – New Request'));
  assert.ok(!isLettingsEnquirySubject('Commercial enquiry: From Someone'));
});
test('unrelated subject rejected', () => assert.ok(!isLettingsEnquirySubject('Your invoice for October')));

console.log('sanitize');
test('cleanName strips markup and links', () => {
  const n = cleanName('<a href="http://evil.example">Click here to claim £500</a> Jane');
  assert.ok(!/[<>:/"£]/.test(n), n);
});
test('cleanName keeps normal names', () => {
  assert.equal(cleanName("Mary-Jane O'Neil"), "Mary-Jane O'Neil");
  assert.equal(cleanName('Zoë Müller'), 'Zoë Müller');
});
test('cleanName falls back', () => assert.equal(cleanName('<<<>>>'), 'there'));
test('cleanName caps length', () => assert.ok(cleanName('A'.repeat(500)).length <= 60));
test('cleanPhone', () => {
  assert.equal(cleanPhone('+44 7700 900123'), '+44 7700 900123');
  assert.equal(cleanPhone('call me'), null);
});
test('htmlToText', () => {
  const t = htmlToText('<style>p{color:red}</style><p>Hello&nbsp;Jane</p><p>Flat 4 &amp; 5</p>');
  assert.ok(t.includes('Hello Jane') && t.includes('Flat 4 & 5') && !t.includes('color'), t);
});
test('boundedText', () => assert.equal(boundedText('x'.repeat(10000), 8000).length, 8000));
test('emailAppearsIn is literal and case-insensitive', () => {
  assert.ok(emailAppearsIn('jane@example.com', 'Reach me at Jane@Example.com please'));
  assert.ok(!emailAppearsIn('victim@example.com', 'Reach me at jane@example.com'));
});

console.log('matchProperty');
const body = (extra: string) => `New lettings enquiry\nName: Test Tenant\nEmail: t@example.com\n${extra}`;
test('matches by agency reference', () => {
  const r = matchProperty(props, body('Property reference: OAK-0143'), '');
  assert.equal(r?.property.id, 'p5');
  assert.equal(r?.method, 'reference');
});
test('reference works with different punctuation', () => {
  assert.equal(matchProperty(props, body('ref oak 0142'), '')?.property.id, 'p4');
});
test('matches by portal listing id', () => {
  const r = matchProperty(props, body('Rightmove property 160123999 enquiry'), '');
  assert.equal(r?.property.id, 'p5');
  assert.equal(r?.method, 'listing_id');
});
test('listing id must be a whole number', () => {
  assert.equal(matchProperty(props, body('id 99160123999999'), ''), null);
});
test('matches by address with abbreviations (Rd vs Road)', () => {
  const r = matchProperty(props, body(''), '27 Brixton Road, London SW9 Lettings enquiry');
  assert.equal(r?.property.id, 'p7');
  assert.equal(r?.method, 'address');
});
test('matches the right flat in the same building', () => {
  assert.equal(matchProperty(props, body(''), 'Flat 5, 12 Clapham Common South Side')?.property.id, 'p5');
  assert.equal(matchProperty(props, body(''), 'Flat 4, 12 Clapham Common South Side')?.property.id, 'p4');
});
test('building without a flat number is ambiguous, so no match', () => {
  assert.equal(matchProperty(props, body(''), '12 Clapham Common South Side'), null);
});
test('unknown property gives no match', () => {
  assert.equal(matchProperty(props, body(''), '99 Nowhere Street, London N1'), null);
});
test('two properties matching one reference is ambiguous', () => {
  const dup = [...props, { id: 'x', address: '1 Other Road', reference: 'OAK-0142', portal_listing_id: null }];
  assert.equal(matchProperty(dup, body('OAK-0142'), ''), null);
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);