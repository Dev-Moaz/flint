// Run with: npx tsx scripts/email.test.ts
import assert from 'node:assert/strict';
import { escapeHtml, oneLine, renderScreeningInvitation, safeDisplayName } from '../lib/email/screening-invitation';

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

const base = {
  tenantName: 'Jane Smith',
  agencyName: 'Oakwood Lettings London',
  propertyAddress: 'Flat 4, 12 Clapham Common South Side, London SW4',
  screeningUrl: 'https://app.example.com/screen/oakwood-london/3f2b8c1e-9a4d-4e6b-8c11-0a1b2c3d4e5f',
  expiresInDays: 14,
  contactEmail: 'lettings@oakwood.co.uk',
};

console.log('escaping and headers');
test('escapeHtml', () => assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;'));
test('oneLine strips line breaks (header injection) and caps length', () => {
  assert.equal(oneLine('Hello\r\nBcc: evil@example.com'), 'Hello Bcc: evil@example.com');
  assert.ok(oneLine('x'.repeat(500)).length <= 120);
});
test('safeDisplayName removes quotes, brackets and newlines', () => {
  const n = safeDisplayName('Oak"wood <Lettings>\r\nBcc: x@y.com');
  assert.ok(!/["<>\r\n]/.test(n), n);
  assert.equal(safeDisplayName('"<>"'), 'Lettings team');
});

console.log('content');
test('subject is one line and includes the address', () => {
  const { subject } = renderScreeningInvitation({ ...base, propertyAddress: 'Flat 4\r\nBcc: evil@example.com' });
  assert.ok(!/[\r\n]/.test(subject));
  assert.ok(subject.startsWith('Your viewing enquiry: Flat 4'));
});
test('hostile name, agency and address are escaped in the HTML', () => {
  const { html } = renderScreeningInvitation({
    ...base,
    tenantName: '<script>alert(1)</script>',
    agencyName: '<img src=x onerror=alert(1)>',
    propertyAddress: '"><a href="https://evil.example">Click</a>',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('href="https://evil.example"'));
  assert.ok(html.includes('&lt;script&gt;'));
});
test('the screening link appears in the button, the fallback line and the text version', () => {
  const { html, text } = renderScreeningInvitation(base);
  assert.equal(html.split(base.screeningUrl).length - 1, 3); // button href + fallback href + fallback text
  assert.ok(text.includes(base.screeningUrl));
});
test('a quote in the URL cannot break out of the href attribute', () => {
  const { html } = renderScreeningInvitation({ ...base, screeningUrl: 'https://a.example/x" onclick="alert(1)' });
  assert.ok(!html.includes('" onclick="'));
});
test('honest wording: no verification or compliance claims, no pressure', () => {
  const { html, text } = renderScreeningInvitation(base);
  for (const banned of [/ensures compliance/i, /before slots are filled/i, /verify criteria/i, /reserve slot/i, /guarantee/i]) {
    assert.ok(!banned.test(html) && !banned.test(text), String(banned));
  }
  assert.ok(/not a credit check/i.test(text));
});
test('expiry sentence is shown only when provided', () => {
  assert.ok(renderScreeningInvitation(base).text.includes('expires in 14 days'));
  assert.ok(!renderScreeningInvitation({ ...base, expiresInDays: undefined }).text.includes('expires'));
});
test('contact line: reply-to address when known, "contact directly" when not', () => {
  assert.ok(renderScreeningInvitation(base).text.includes('lettings@oakwood.co.uk'));
  assert.ok(renderScreeningInvitation({ ...base, contactEmail: null }).text.includes('contact Oakwood Lettings London directly'));
});
test('layout hygiene: table-based, no remote images, no external stylesheets', () => {
  const { html } = renderScreeningInvitation(base);
  assert.ok(html.includes('role="presentation"'));
  assert.ok(!/<img\b/i.test(html) && !/<link\b/i.test(html) && !/@import/i.test(html));
});

console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);