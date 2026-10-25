// lib/report/run-daily.ts
// The daily job: for each agency decide whether a report is due, build it, e-mail it, and record
// what happened. The route is a thin wrapper around this so the logic can be tested with a fake DB.
import type { SupabaseClient } from '@supabase/supabase-js';
import { accessAttention } from '@/lib/billing/access';
import { londonDate, londonParts } from '@/lib/dates';
import { buildReport } from '@/lib/report/build';
import { digestSubject, renderDailyDigest, shouldSendDigest } from '@/lib/report/digest-email';
import { createReportLink } from '@/lib/report/links';
import { loadReportRows } from '@/lib/report/load';
import { opsHasIssues, renderOpsSummary, type BillingOps, type OpsSummary } from '@/lib/report/ops-email';
import { resolveRange } from '@/lib/report/range';
import { computeWindow } from '@/lib/report/window';
import { LOOKBACK_DAYS } from '@/lib/report/config';
import { DEMO_SLUG } from '@/lib/report/demo-data';

const HOUR_MS = 60 * 60 * 1000;

export interface OutgoingEmail {
  idempotencyKey: string;
  fromName: string;
  to: string;
  subject: string;
  html?: string;
  text: string;
  replyTo?: string | null;
}
export type SendFn = (email: OutgoingEmail) => Promise<{ ok: true } | { ok: false; error: string }>;

export interface DailyDeps {
  db: SupabaseClient;
  now: Date;
  baseUrl: string;
  sendEmail: SendFn;
  sendWeekends: boolean;
  fromName: string;
  adminEmail?: string | null;
  replyTo?: string | null;
  /** Ignore "already done today" (for manual re-runs). */
  force?: boolean;
  /** Build everything, send nothing, write nothing. */
  dry?: boolean;
  onlySlug?: string | null;
}

export interface AgencyResult {
  slug: string;
  status: 'SENT' | 'SKIPPED' | 'FAILED' | 'ALREADY_DONE' | 'DRY_RUN';
  reason?: string;
  subject?: string;
  preview?: string;
}

export interface DailyResult {
  date: string;
  agencies: AgencyResult[];
  ops: 'sent' | 'not_needed' | 'failed' | 'dry_run' | 'no_admin_email';
}

interface AgencyRow {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  report_enabled: boolean | null;
  access_until: string | null;
}

export async function runDailyReports(deps: DailyDeps): Promise<DailyResult> {
  const { db, now } = deps;
  const runDate = londonParts(now).date;
  const weekday = londonParts(now).weekday;
  const isWeekend = weekday === 0 || weekday === 6;
  const results: AgencyResult[] = [];
  const reportFailures: OpsSummary['reportFailures'] = [];

  const agenciesRes = await db.from('agencies').select('id, name, slug, contact_email, report_enabled, access_until');
  if (agenciesRes.error) throw new Error(`Could not load agencies: ${agenciesRes.error.message}`);
  const allAgencies = (agenciesRes.data ?? []) as AgencyRow[];
  const agencies = allAgencies.filter(
    (a) => a.report_enabled !== false && !!a.contact_email && (!deps.onlySlug || a.slug === deps.onlySlug)
  );

  const record = async (agency: AgencyRow, status: 'SENT' | 'SKIPPED' | 'FAILED', reason: string | null, window?: { start: Date; end: Date }) => {
    if (deps.dry) return;
    const { error } = await db.from('report_runs').upsert(
      {
        agency_id: agency.id,
        run_date: runDate,
        status,
        reason,
        window_start: window?.start.toISOString() ?? null,
        window_end: window?.end.toISOString() ?? null,
      },
      { onConflict: 'agency_id,run_date' }
    );
    if (error) console.error('REPORT RUN LOG ERROR:', error.message);
  };

  for (const agency of agencies) {
    try {
      // Already handled today?
      const existing = await db.from('report_runs').select('status').eq('agency_id', agency.id).eq('run_date', runDate).maybeSingle();
      if (existing.error) throw existing.error;
      if (!deps.force && existing.data && (existing.data.status === 'SENT' || existing.data.status === 'SKIPPED')) {
        results.push({ slug: agency.slug, status: 'ALREADY_DONE', reason: existing.data.status });
        continue;
      }

      // Weekends are folded into Monday's report (its window reaches back to the last one sent)
      if (isWeekend && !deps.sendWeekends) {
        await record(agency, 'SKIPPED', 'weekend');
        results.push({ slug: agency.slug, status: 'SKIPPED', reason: 'weekend' });
        continue;
      }

      // The period: from the last report that really went out
      const last = await db
        .from('report_runs')
        .select('window_end')
        .eq('agency_id', agency.id)
        .eq('status', 'SENT')
        .order('window_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last.error) throw last.error;
      const window = computeWindow(now, last.data?.window_end ?? null);

      const rows = await loadReportRows(db, agency.id, now);
      const model = buildReport({
        agencyName: agency.name,
        now,
        from: window.start,
        to: new Date(window.end.getTime() + 1),
        rangeLabel: 'Since the last report',
        previousLabel: 'the period before',
        ...rows,
      });

      if (!shouldSendDigest(model)) {
        await record(agency, 'SKIPPED', 'no_activity', window);
        results.push({ slug: agency.slug, status: 'SKIPPED', reason: 'no_activity' });
        continue;
      }

      // Mondays also carry a seven-day recap
      let weekly = null;
      if (weekday === 1) {
        const r = resolveRange('7d', now);
        const m = buildReport({ agencyName: agency.name, now, from: r.from, to: r.to, rangeLabel: r.label, previousLabel: r.previousLabel, ...rows }).metrics;
        weekly = { enquiries: m.enquiries, outOfHours: m.outOfHours, booked: m.booked };
      }

      // A fresh private link for this email
      let token = 'dry-run-token';
      let expiresAt = new Date(now.getTime() + 7 * 24 * HOUR_MS).toISOString();
      if (!deps.dry) {
        const link = await createReportLink(db, agency.id, undefined, now);
        token = link.token;
        expiresAt = link.expiresAt;
      }
      const reportUrl = `${deps.baseUrl}/report/${agency.slug}?t=${token}`;
      const email = renderDailyDigest({ model, reportUrl, linkExpiresAt: expiresAt, weekly });

      if (deps.dry) {
        results.push({ slug: agency.slug, status: 'DRY_RUN', subject: email.subject, preview: email.text.split('\n').slice(0, 14).join('\n') });
        continue;
      }

      const sent = await deps.sendEmail({
        // a manual forced re-run must not be swallowed by Resend's duplicate protection
        idempotencyKey: `daily-report/${agency.id}/${runDate}${deps.force ? `/forced-${now.getTime()}` : ''}`,
        fromName: deps.fromName,
        to: agency.contact_email as string,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: deps.replyTo ?? null,
      });

      if (!sent.ok) {
        await record(agency, 'FAILED', sent.error.slice(0, 300), window);
        reportFailures.push({ agency: agency.name, reason: sent.error.slice(0, 200) });
        results.push({ slug: agency.slug, status: 'FAILED', reason: sent.error.slice(0, 200) });
        continue;
      }

      await record(agency, 'SENT', null, window);
      results.push({ slug: agency.slug, status: 'SENT', subject: digestSubject(model) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`Daily report failed for ${agency.slug}:`, message);
      await record(agency, 'FAILED', message.slice(0, 300));
      reportFailures.push({ agency: agency.name, reason: message.slice(0, 200) });
      results.push({ slug: agency.slug, status: 'FAILED', reason: message.slice(0, 200) });
    }
  }

  const ops = await sendOpsSummary(deps, allAgencies, runDate, reportFailures);
  return { date: runDate, agencies: results, ops };
}

// ------------------------------------------------------------------ the owner's own summary
async function sendOpsSummary(
  deps: DailyDeps,
  agencies: AgencyRow[],
  runDate: string,
  reportFailures: OpsSummary['reportFailures']
): Promise<DailyResult['ops']> {
  const { db, now } = deps;
  const since36 = new Date(now.getTime() - 36 * HOUR_MS).toISOString();
  const since24 = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
  const sinceLookback = new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR_MS).toISOString();
  const since48 = new Date(now.getTime() - 48 * HOUR_MS).toISOString();
  const nameOf = new Map(agencies.map((a) => [a.id, a.name]));
  // The demo agency exists to be looked at: its deliberate problems must not page the owner
  const demoIds = new Set(agencies.filter((a) => a.slug === DEMO_SLUG).map((a) => a.id));
  const real = <T extends { agency_id: string }>(rows: T[] | null) => (rows ?? []).filter((r) => !demoIds.has(r.agency_id));

  const [failed, review, pending, exceptions, missed] = await Promise.all([
    db.from('inbound_emails').select('agency_id, reason').eq('status', 'FAILED').gte('updated_at', since36).limit(200),
    // Only enquiries the system could not handle: an income decision belongs to the agency, not to the owner
    db.from('leads').select('agency_id').eq('status', 'NEEDS_REVIEW').eq('review_reason', 'property_not_matched').gte('created_at', sinceLookback).lt('created_at', since24).limit(500),
    db.from('leads').select('agency_id, id, invitation_error, invitation_sent_at').eq('status', 'PENDING').gte('created_at', since48).limit(500),
    db.from('calendar_events').select('agency_id, id').in('status', ['REJECTED', 'NO_MATCH']).gte('created_at', since36).limit(200),
    // New enquiries turned away because the agency has no access: the people to call
    db.from('inbound_emails').select('agency_id').eq('status', 'IGNORED').eq('reason', 'subscription_inactive').gte('created_at', since36).limit(500),
  ]);
  for (const r of [failed, review, pending, exceptions, missed]) if (r.error) throw new Error(`Ops query failed: ${r.error.message}`);

  const reasonCounts = new Map<string, number>();
  const failedRows = real((failed.data ?? []) as Array<{ agency_id: string; reason: string | null }>);
  for (const row of failedRows) {
    const key = (row.reason ?? 'unknown').slice(0, 120);
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const staleByAgency = new Map<string, number>();
  for (const row of real((review.data ?? []) as Array<{ agency_id: string }>)) {
    staleByAgency.set(row.agency_id, (staleByAgency.get(row.agency_id) ?? 0) + 1);
  }

  const missedByAgency = new Map<string, number>();
  for (const row of real((missed.data ?? []) as Array<{ agency_id: string }>)) {
    missedByAgency.set(row.agency_id, (missedByAgency.get(row.agency_id) ?? 0) + 1);
  }
  const access: BillingOps['access'] = [];
  for (const agency of agencies) {
    if (demoIds.has(agency.id) || !agency.access_until) continue;
    const state = accessAttention(agency.access_until, now);
    if (state) access.push({ agency: agency.name, state, endsOn: londonDate(new Date(agency.access_until)) });
  }
  access.sort((a, b) => a.endsOn.localeCompare(b.endsOn));

  const summary: OpsSummary = {
    date: runDate,
    failedEmails: {
      count: failedRows.length,
      reasons: [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, n]) => `${r} (x${n})`),
    },
    staleReview: [...staleByAgency.entries()].map(([id, count]) => ({ agency: nameOf.get(id) ?? id, count })),
    inviteFailures: real((pending.data ?? []) as Array<{ agency_id: string; invitation_error: string | null; invitation_sent_at: string | null }>).filter(
      (l) => l.invitation_error && !l.invitation_sent_at
    ).length,
    bookingExceptions: real((exceptions.data ?? []) as Array<{ agency_id: string }>).length,
    reportFailures,
    billing: {
      access,
      missedEnquiries: [...missedByAgency.entries()].map(([id, count]) => ({ agency: nameOf.get(id) ?? id, count })),
    },
  };

  if (!opsHasIssues(summary)) return 'not_needed';
  if (deps.dry) return 'dry_run';
  if (!deps.adminEmail) return 'no_admin_email';

  const mail = renderOpsSummary(summary);
  const res = await deps.sendEmail({
    idempotencyKey: `ops-summary/${runDate}`,
    fromName: deps.fromName,
    to: deps.adminEmail,
    subject: mail.subject,
    text: mail.text,
  });
  return res.ok ? 'sent' : 'failed';
}