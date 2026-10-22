// lib/dates.ts
// Calendar dates as YYYY-MM-DD strings in London time. Identical on server and client,
// and pure date arithmetic (no hours), so daylight-saving changes cannot shift a day.

const londonFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' });

/** Today's date in London, e.g. "2026-10-11". */
export function londonDate(now: Date = new Date()): string {
  return londonFormatter.format(now);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- UK display format (dd/mm/yy)
// Only for what a person types or reads. Stored and sent dates stay YYYY-MM-DD.

/** "2026-11-25" becomes "25/11/26". Anything that is not a YYYY-MM-DD date gives an empty string. */
export function formatUkDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1].slice(2)}` : '';
}

/**
 * Shapes what a person types into dd/mm/yy as they type: "251126" becomes "25/11/26".
 * A one-digit day or month followed by a separator is padded ("5/1/26" becomes "05/01/26"),
 * a four-digit year is accepted, and anything else is ignored.
 */
export function maskUkDate(raw: string): string {
  const MAX_LENGTH = [2, 2, 4]; // day, month, year
  const fields = ['', '', ''];
  let i = 0;
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      if (fields[i].length === MAX_LENGTH[i]) {
        if (i === 2) continue; // the year is full
        i += 1;
      }
      fields[i] += ch;
    } else if (/[/.\-\s]/.test(ch) && fields[i] !== '' && i < 2) {
      if (fields[i].length === 1) fields[i] = `0${fields[i]}`;
      i += 1;
    }
  }
  return fields.filter(Boolean).join('/');
}

/**
 * "25/11/26" or "25/11/2026" becomes "2026-11-25". A two-digit year means 20yy.
 * Returns null unless the text is a real calendar date (25/13/26 and 29/02/27 are not).
 */
export function parseUkDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year.length === 2 ? `20${year}` : year}-${month}-${day}`;
  return isValidIsoDate(iso) ? iso : null;
}

// ---------------------------------------------------------------- London wall-clock helpers

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** London calendar date, hour (0-23) and weekday (0 = Sunday) for an instant. */
export function londonParts(instant: Date): { date: string; hour: number; weekday: number } {
  const parts = partsFormatter.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

function londonOffsetMinutes(instant: Date): number {
  const parts = partsFormatter.formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The exact instant when a London calendar date begins (00:00 London time). */
export function londonMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let instant = guess - londonOffsetMinutes(new Date(guess)) * 60000;
  instant = guess - londonOffsetMinutes(new Date(instant)) * 60000; // settle across a clock change
  return new Date(instant);
}