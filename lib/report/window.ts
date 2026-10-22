// lib/report/window.ts
// Which period does a daily report cover? From the last report that really went out
// (so a missed run leaves no gap), never longer than MAX_WINDOW_HOURS.
const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_WINDOW_HOURS = 24;
export const MAX_WINDOW_HOURS = 96;

export function computeWindow(now: Date, lastSentEnd: string | Date | null | undefined): { start: Date; end: Date } {
  const earliest = now.getTime() - MAX_WINDOW_HOURS * HOUR_MS;
  const last = lastSentEnd ? new Date(lastSentEnd).getTime() : NaN;
  const wanted = Number.isFinite(last) && last < now.getTime() ? last : now.getTime() - DEFAULT_WINDOW_HOURS * HOUR_MS;
  return { start: new Date(Math.max(wanted, earliest)), end: now };
}