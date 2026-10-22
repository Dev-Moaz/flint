// lib/report/format.ts
// London-time formatting, always with an explicit time zone so server and tests agree.

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayOnly = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });
const weekdayDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const timeOnly = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const longWhen = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(',', '');
export const fmtDay = (iso: string) => dayOnly.format(new Date(iso));
export const fmtWeekdayDay = (iso: string) => weekdayDay.format(new Date(iso)).replace(',', '');
export const fmtTime = (iso: string) => timeOnly.format(new Date(iso));
export const fmtLongWhen = (iso: string) => longWhen.format(new Date(iso)).replace(',', '');

/** 8 -> "8s", 95 -> "1m 35s", 3700 -> "1h 2m" */
export function fmtDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'n/a';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** 5.5 -> "5h", 30 -> "1 day", 80 -> "3 days" (hours in, short words out) */
export function fmtAge(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function fmtPercent(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}

export function fmtDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  const diff = current - previous;
  if (diff === 0) return { text: 'same as before', direction: 'flat' };
  return { text: `${diff > 0 ? '+' : '\u2212'}${Math.abs(diff)} vs before`, direction: diff > 0 ? 'up' : 'down' };
}