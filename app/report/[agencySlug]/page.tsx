import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase/server';
import { serif, sans } from '@/lib/fonts';
import { buildReport } from '@/lib/report/build';
import { parseRange } from '@/lib/report/config';
import { loadReportRows } from '@/lib/report/load';
import { resolveReportLink } from '@/lib/report/links';
import { resolveRange } from '@/lib/report/range';
import Dashboard from '@/components/report/dashboard';
import '../report.css';

// Always rendered per request: never cached, never indexed, never leaks its address
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Enquiry report',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ agencySlug: string }>;
  searchParams: Promise<{ t?: string | string[]; range?: string | string[] }>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ReportPage({ params, searchParams }: PageProps) {
  const { agencySlug } = await params;
  const query = await searchParams;
  const token = first(query.t);
  const rangeKey = parseRange(first(query.range));

  const agency = await resolveReportLink(supabaseAdmin, agencySlug, token);

  if (!agency || !token) {
    return (
      <main className={`rp ${serif.variable} ${sans.variable}`}>
        <div className="rp-grid" aria-hidden="true" />
        <div className="rp-unavailable">
          <div className="rp-card">
            <h1 className="rp-card__title">Link unavailable</h1>
            <p className="rp-card__hint">This report link has expired or is not valid. Please use the link in your latest report email.</p>
          </div>
        </div>
      </main>
    );
  }

  const now = new Date();
  const rows = await loadReportRows(supabaseAdmin, agency.id, now);
  const { from, to, label, previousLabel } = resolveRange(rangeKey, now);
  const model = buildReport({ agencyName: agency.name, now, from, to, rangeLabel: label, previousLabel, ...rows });

  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <Dashboard model={model} rangeKey={rangeKey} agencySlug={agencySlug} token={token} linkExpiresAt={agency.linkExpiresAt} />
    </div>
  );
}