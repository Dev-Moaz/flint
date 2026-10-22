'use client';

import { useMemo, useState } from 'react';

export interface TableRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  property: string;
  status: 'BOOKED' | 'QUALIFIED' | 'DISQUALIFIED' | 'PENDING' | 'NEEDS_REVIEW';
  statusLabel: string;
  details: string[];
  received: string;
  invited: string | null;
  screened: string | null;
  viewing: string | null;
}

type Filter = 'all' | TableRow['status'];

const PAGE_SIZE = 25;

const TABS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'BOOKED', label: 'Booked' },
  { key: 'QUALIFIED', label: 'Qualified, not booked' },
  { key: 'DISQUALIFIED', label: 'Not qualified' },
  { key: 'PENDING', label: 'In progress' },
  { key: 'NEEDS_REVIEW', label: 'Needs review' },
];

const BADGE: Record<TableRow['status'], string> = {
  BOOKED: 'rp-badge rp-badge--booked',
  QUALIFIED: 'rp-badge rp-badge--qualified',
  DISQUALIFIED: 'rp-badge rp-badge--out',
  PENDING: 'rp-badge rp-badge--progress',
  NEEDS_REVIEW: 'rp-badge rp-badge--review',
};

export default function LeadsTable({ rows }: { rows: TableRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, BOOKED: 0, QUALIFIED: 0, DISQUALIFIED: 0, PENDING: 0, NEEDS_REVIEW: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone ?? '', r.property].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, filter, query]);

  return (
    <div>
      <div className="rp-toolbar">
        <div className="rp-tabs" role="group" aria-label="Filter by status">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="rp-tab"
              aria-pressed={filter === tab.key}
              onClick={() => {
                setFilter(tab.key);
                setShown(PAGE_SIZE);
              }}
            >
              {tab.label}
              <span className="rp-tab__count">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="rp-search"
          placeholder="Search name, email or property"
          aria-label="Search enquiries"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE_SIZE);
          }}
        />
      </div>

      {visible.length === 0 ? (
        <p className="rp-empty">No enquiries match.</p>
      ) : (
        <div className="rp-scroll">
          <table className="rp-table rp-leads">
            <thead>
              <tr>
                <th>Received</th>
                <th>Applicant</th>
                <th>Property</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, shown).map((r) => (
                <tr key={r.id}>
                  <td data-label="Received">
                    <span className="rp-strong">{r.received}</span>
                    <span className="rp-faint">
                      {r.invited ? `Invited ${r.invited}` : 'Not invited'}
                      {r.screened ? `, answered ${r.screened}` : ''}
                    </span>
                  </td>
                  <td data-label="Applicant">
                    <span className="rp-strong">{r.name}</span>
                    <span className="rp-contact">
                      <a href={`mailto:${r.email}`}>{r.email}</a>
                      {r.phone && <a href={`tel:${r.phone.replace(/\s+/g, '')}`}>{r.phone}</a>}
                    </span>
                  </td>
                  <td data-label="Property">{r.property}</td>
                  <td data-label="Status">
                    <span className={BADGE[r.status]}>{r.statusLabel}</span>
                  </td>
                  <td data-label="Details">
                    {r.viewing && <span className="rp-strong">Viewing {r.viewing}</span>}
                    {r.details.map((d) => (
                      <span key={d} className="rp-faint rp-faint--dark">
                        {d}
                      </span>
                    ))}
                    {!r.viewing && r.details.length === 0 && <span className="rp-faint">{'\u2014'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > shown && (
        <div className="rp-more-wrap">
          <button type="button" className="rp-tab" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show more
            <span className="rp-tab__count">{visible.length - shown} left</span>
          </button>
        </div>
      )}
    </div>
  );
}