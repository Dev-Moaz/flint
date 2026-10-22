// lib/report/config.ts
export type RangeKey = 'today' | '7d' | '30d';

export const RANGES: Record<RangeKey, { days: number; label: string; previousLabel: string }> = {
  today: { days: 1, label: 'Today', previousLabel: 'yesterday' },
  '7d': { days: 7, label: 'Last 7 days', previousLabel: 'the 7 days before' },
  '30d': { days: 30, label: 'Last 30 days', previousLabel: 'the 30 days before' },
};

export const DEFAULT_RANGE: RangeKey = '7d';

export function parseRange(value: unknown): RangeKey {
  return value === 'today' || value === '7d' || value === '30d' ? value : DEFAULT_RANGE;
}

// "Out of hours" = before OPEN, from CLOSE onwards, and all weekend (London time)
export const OFFICE_OPEN_HOUR = 9;
export const OFFICE_CLOSE_HOUR = 18;

/** Everything older than this is never loaded (also the report's retention horizon). */
export const LOOKBACK_DAYS = 60;

/** A PENDING lead whose invitation is older than this is flagged as "not completed". */
export const STALE_PENDING_HOURS = 24;

/** How long a report link stays valid. */
export const REPORT_LINK_TTL_DAYS = 7;