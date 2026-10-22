// lib/report/links.ts
// Magic links for the dashboard. The token is shown once (in the email or script output);
// only its hash is stored, so a database leak does not leak working links.
import type { SupabaseClient } from '@supabase/supabase-js';
import { REPORT_LINK_TTL_DAYS } from '@/lib/report/config';
import { generateReportToken, hashReportToken, isPlausibleToken } from '@/lib/report/tokens';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createReportLink(
  db: SupabaseClient,
  agencyId: string,
  ttlDays: number = REPORT_LINK_TTL_DAYS,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: string }> {
  const token = generateReportToken();
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS).toISOString();
  const { error } = await db.from('report_links').insert({ agency_id: agencyId, token_hash: hashReportToken(token), expires_at: expiresAt });
  if (error) throw new Error(`Could not create report link: ${error.message}`);
  return { token, expiresAt };
}

export interface ResolvedAgency {
  id: string;
  name: string;
  linkExpiresAt: string;
}

/** Returns the agency only if the token is valid for THIS agency slug, unexpired and not revoked. */
export async function resolveReportLink(db: SupabaseClient, agencySlug: string, token: unknown): Promise<ResolvedAgency | null> {
  if (!isPlausibleToken(token)) return null;

  const agency = await db.from('agencies').select('id, name, report_enabled').eq('slug', agencySlug).maybeSingle();
  if (agency.error || !agency.data || agency.data.report_enabled === false) return null;

  const link = await db
    .from('report_links')
    .select('id, expires_at, revoked_at')
    .eq('agency_id', agency.data.id)
    .eq('token_hash', hashReportToken(token))
    .maybeSingle();
  if (link.error || !link.data || link.data.revoked_at) return null;
  if (new Date(link.data.expires_at).getTime() < Date.now()) return null;

  // best effort: when was the link last used?
  await db.from('report_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.data.id);

  return { id: agency.data.id, name: agency.data.name, linkExpiresAt: link.data.expires_at };
}