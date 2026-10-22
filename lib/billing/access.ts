// lib/billing/access.ts
// Who may use the service, as pure functions: no database and no clock of its own
// (the caller passes `now`), so every rule can be tested.
//
// One fact decides everything: agencies.access_until, the moment the agency's access ends.
// The status is derived from it and the current time, so nothing has to "expire" an agency
// and no job can fail to do so.
//
//   access_until is NULL               NOT_STARTED  never activated: new enquiries are ignored
//   now < access_until                 ACTIVE       the pilot or the paid month is running
//   now < access_until + GRACE_DAYS    GRACE        just ended: still served, so a late payment or a
//                                                   forgotten renewal does not cut off a customer
//   after that                         EXPIRED      new enquiries are ignored
//
// Only NEW enquiries are gated (the inbound webhook). A lead that already exists always finishes
// its journey: screening, booking and the daily report never check access.
//
// The grace period is applied here and never stored, so it cannot add up from one renewal to the next.

export const GRACE_DAYS = 3;
/** One paid period: matches the 30-day billing period of the Whop plan. */
export const PERIOD_DAYS = 30;
/** The owner summary warns this many days before access ends. */
export const ENDING_SOON_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessStatus = 'NOT_STARTED' | 'ACTIVE' | 'GRACE' | 'EXPIRED';

function instant(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`access_until is not a valid date: ${value}`);
  return ms;
}

/**
 * The status that decides access.
 *
 * Strict on purpose: a value that was never loaded (undefined, because a query forgot the column)
 * or that is not a date throws, so the webhook answers 500 and the provider retries. Guessing
 * would either serve an agency for free or cut off a paying one without anyone noticing.
 */
export function accessStatus(accessUntil: string | null, now: Date): AccessStatus {
  if (accessUntil === undefined) throw new Error('access_until was not loaded for this agency');
  if (accessUntil === null) return 'NOT_STARTED';
  const until = instant(accessUntil);
  const t = now.getTime();
  if (t < until) return 'ACTIVE';
  if (t < until + GRACE_DAYS * DAY_MS) return 'GRACE';
  return 'EXPIRED';
}

/** May this agency's NEW enquiries be taken on right now? */
export function isEntitled(accessUntil: string | null, now: Date): boolean {
  const status = accessStatus(accessUntil, now);
  return status === 'ACTIVE' || status === 'GRACE';
}

export type AccessAttention = 'ENDING_SOON' | 'IN_GRACE';

/**
 * What the owner summary should mention: access that ends within ENDING_SOON_DAYS, or has ended
 * and is inside the grace period (the moment to collect the payment).
 *
 * Informational only, so unlike accessStatus it never throws: a missing or invalid value simply
 * has nothing to report. It must never be used to decide access.
 */
export function accessAttention(accessUntil: string | null | undefined, now: Date): AccessAttention | null {
  if (!accessUntil) return null;
  const until = Date.parse(accessUntil);
  if (Number.isNaN(until)) return null;
  const t = now.getTime();
  if (t < until) return until - t <= ENDING_SOON_DAYS * DAY_MS ? 'ENDING_SOON' : null;
  return t < until + GRACE_DAYS * DAY_MS ? 'IN_GRACE' : null;
}

/**
 * The new end of access after a payment: one period after the payment, and never earlier than
 * what the agency already has.
 *
 * It starts from the payment's own time (not from "now" and not from the current end), so handling
 * the same payment twice changes nothing and renewals do not drift. The manual SQL in the README
 * does the same: greatest(access_until, paid_at + 30 days). A future Whop webhook will call this.
 */
export function extendAccess(current: string | null, paidAt: Date): Date {
  const fromPayment = paidAt.getTime() + PERIOD_DAYS * DAY_MS;
  if (current === null) return new Date(fromPayment);
  return new Date(Math.max(instant(current), fromPayment));
}