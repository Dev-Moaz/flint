// lib/report/range.ts
import { addDays, londonDate, londonMidnight } from '@/lib/dates';
import { RANGES, type RangeKey } from '@/lib/report/config';

/** The reporting window for a range key: whole London days, ending now. */
export function resolveRange(key: RangeKey, now: Date) {
  const { days, label, previousLabel } = RANGES[key];
  const from = londonMidnight(addDays(londonDate(now), -(days - 1)));
  const to = new Date(now.getTime() + 1);
  return { from, to, label, previousLabel };
}