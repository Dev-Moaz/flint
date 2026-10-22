// Run with: npx tsx scripts/seed.test.ts
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fake-db';
import { DEMO_SLUG } from '../lib/report/demo-data';
import { deleteDemo, seedDemo } from '../lib/report/seed';

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
const NOW = new Date('2026-10-14T10:00:00Z');

async function main() {
  console.log('demo seed');

  await test('creates the agency and all related rows, with consistent foreign keys', async () => {
    const db = new FakeDb();
    const client = db as unknown as SupabaseClient;
    const { agencyId, counts } = await seedDemo(client, { now: NOW });
    assert.equal(typeof agencyId, 'string');
    assert.ok(agencyId.length > 0);
    assert.equal(db.tables.agencies.length, 1);
    assert.equal(db.tables.agencies[0].slug, DEMO_SLUG);
    assert.equal(db.tables.agencies[0].id, agencyId);
    assert.equal(db.tables.properties.length, counts.properties);
    assert.equal(db.tables.leads.length, counts.leads);
    assert.equal(db.tables.inbound_emails.length, counts.inbound);
    const propertyIds = new Set(db.tables.properties.map((p) => p.id));
    for (const lead of db.tables.leads) {
      assert.equal(lead.agency_id, agencyId);
      assert.ok(lead.property_id === null || propertyIds.has(lead.property_id));
    }
    const leadIds = new Set(db.tables.leads.map((l) => l.id));
    for (const mail of db.tables.inbound_emails) assert.ok(mail.lead_id === null || leadIds.has(mail.lead_id));
  });

  await test('the demo agency has a webhook secret, no contact address by default, and nothing real in it', async () => {
    const db = new FakeDb();
    await seedDemo(db as unknown as SupabaseClient, { now: NOW });
    const agency = db.tables.agencies[0];
    assert.equal(agency.cal_webhook_secret.length, 64);
    assert.equal(agency.contact_email, null);
    for (const l of db.tables.leads) assert.ok(l.tenant_email.endsWith('@example.com'));
  });

  await test('re-running replaces the demo agency instead of duplicating it', async () => {
    const db = new FakeDb();
    const client = db as unknown as SupabaseClient;
    await seedDemo(client, { now: NOW });
    await seedDemo(client, { now: NOW });
    assert.equal(db.tables.agencies.length, 1);
    assert.equal(db.tables.leads.length, 40);
  });

  await test('delete removes only the demo agency and its data; a real agency is untouched', async () => {
    const db = new FakeDb();
    const client = db as unknown as SupabaseClient;
    db.tables.agencies = [{ id: 'real', name: 'Real Agency', slug: 'real-agency' }];
    db.tables.leads = [{ id: 'real-lead', agency_id: 'real' }];
    db.tables.properties = [{ id: 'real-prop', agency_id: 'real' }];
    await seedDemo(client, { now: NOW });
    assert.equal(await deleteDemo(client), 1);
    assert.deepEqual(db.tables.agencies.map((a) => a.slug), ['real-agency']);
    assert.deepEqual(db.tables.leads.map((l) => l.id), ['real-lead']);
    assert.deepEqual(db.tables.properties.map((p) => p.id), ['real-prop']);
    assert.equal(await deleteDemo(client), 0);
  });

  await test('an optional contact address is stored lowercase', async () => {
    const db = new FakeDb();
    await seedDemo(db as unknown as SupabaseClient, { now: NOW, contactEmail: 'Owner@Example.COM' });
    assert.equal(db.tables.agencies[0].contact_email, 'owner@example.com');
  });

  console.log(`\n${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);
}
main();