// Run with: npx tsx scripts/links.test.ts
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fake-db';
import { createReportLink, resolveReportLink } from '../lib/report/links';
import { hashReportToken } from '../lib/report/tokens';

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

function setup() {
  const db = new FakeDb();
  db.tables.agencies = [
    { id: 'ag1', name: 'Demo Lettings', slug: 'demo-lettings', report_enabled: true },
    { id: 'ag2', name: 'Other Agency', slug: 'other', report_enabled: true },
    { id: 'ag3', name: 'Paused', slug: 'paused', report_enabled: false },
  ];
  return { db, client: db as unknown as SupabaseClient };
}

async function main() {
  console.log('report links');

  await test('a fresh link resolves for its own agency and reports its expiry', async () => {
    const { db, client } = setup();
    const { token, expiresAt } = await createReportLink(client, 'ag1');
    const found = await resolveReportLink(client, 'demo-lettings', token);
    assert.deepEqual(found && { id: found.id, name: found.name, linkExpiresAt: found.linkExpiresAt }, { id: 'ag1', name: 'Demo Lettings', linkExpiresAt: expiresAt });
    assert.ok(db.tables.report_links[0].last_used_at, 'last_used_at is stamped');
  });

  await test('only the hash is stored, never the token', async () => {
    const { db, client } = setup();
    const { token } = await createReportLink(client, 'ag1');
    assert.equal(db.tables.report_links[0].token_hash, hashReportToken(token));
    assert.ok(!JSON.stringify(db.tables).includes(token));
  });

  await test('the same token does not open another agency\u2019s report', async () => {
    const { client } = setup();
    const { token } = await createReportLink(client, 'ag1');
    assert.equal(await resolveReportLink(client, 'other', token), null);
  });

  await test('expired and revoked links are refused', async () => {
    const { db, client } = setup();
    const expired = await createReportLink(client, 'ag1', -1);
    assert.equal(await resolveReportLink(client, 'demo-lettings', expired.token), null);
    const revoked = await createReportLink(client, 'ag1');
    db.tables.report_links.find((l) => l.token_hash === hashReportToken(revoked.token))!.revoked_at = new Date().toISOString();
    assert.equal(await resolveReportLink(client, 'demo-lettings', revoked.token), null);
  });

  await test('a switched-off agency, an unknown slug and malformed tokens are refused', async () => {
    const { client } = setup();
    const paused = await createReportLink(client, 'ag3');
    assert.equal(await resolveReportLink(client, 'paused', paused.token), null);
    const { token } = await createReportLink(client, 'ag1');
    assert.equal(await resolveReportLink(client, 'nope', token), null);
    for (const bad of [undefined, null, '', 'short', 'x'.repeat(43) + '!', 42]) {
      assert.equal(await resolveReportLink(client, 'demo-lettings', bad), null, String(bad));
    }
  });

  await test('a guessed token of the right shape is refused', async () => {
    const { client } = setup();
    await createReportLink(client, 'ag1');
    assert.equal(await resolveReportLink(client, 'demo-lettings', 'A'.repeat(43)), null);
  });

  console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);
}
main();