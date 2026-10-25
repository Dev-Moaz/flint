// lib/triage-rules.ts
import { z } from 'zod';
import type { FailureCode, ReviewReason, TriageInput, TriageResult } from '@/types';
import { addDays, isValidIsoDate, londonDate } from '@/lib/dates';
import { DEFAULT_INCOME_MULTIPLIER, DEFAULT_MIN_INCOME_MULTIPLIER, MOVE_IN_MAX_DAYS } from '@/lib/triage-config';

const InputSchema = z.object({
  annualIncome: z
    .number()
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100_000_000),
  hasRightToRent: z.boolean(),
  hasNoCCJ: z.boolean(),
  canProvideUkGuarantor: z.boolean(),
  moveInDate: z.string(),
});

export type ParseResult = { ok: true; value: TriageInput } | { ok: false; error: string };

/**
 * Validates what the browser sent. Strict on purpose: "false" (a string) or a missing
 * field must never be treated as a yes. The messages are safe to show to the tenant.
 */
export function parseTriageInput(raw: unknown, now: Date = new Date()): ParseResult {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Please check your answers and try again.' };

  const { moveInDate } = parsed.data;
  if (!isValidIsoDate(moveInDate)) return { ok: false, error: 'Please choose a valid move-in date.' };

  const today = londonDate(now);
  if (moveInDate < today) return { ok: false, error: 'Please choose a move-in date from today onwards.' };
  if (moveInDate > addDays(today, MOVE_IN_MAX_DAYS)) {
    return { ok: false, error: 'Please choose a move-in date within the next six months.' };
  }

  return { ok: true, value: parsed.data };
}

/** A missing, null, zero or non-numeric multiplier falls back to the default instead of waving everyone through. */
export function resolveMultiplier(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INCOME_MULTIPLIER;
}

/**
 * The lowest multiplier that is still worth a person's look. A missing or invalid value falls back
 * to the default, and it can never be higher than the qualifying multiplier (then there is no review band).
 */
export function resolveMinMultiplier(value: unknown, multiplier: number): number {
  const n = Number(value);
  const min = Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_INCOME_MULTIPLIER;
  return Math.min(min, multiplier);
}

/**
 * The deterministic screening engine (UK standard criteria).
 * The move-in date is recorded but is not a criterion.
 * Returns reason CODES only: no income figures leave this function.
 *
 * Income, with an example multiplier of 30 and a minimum of 27:
 *   30x or more                      -> qualified
 *   27x up to 30x                    -> a person decides (income_borderline)
 *   below 27x, UK guarantor offered  -> a person decides (income_low_guarantor_offered)
 *   below 27x, no guarantor          -> rejected
 * Right to rent and CCJs are never softened: failing either one is a rejection.
 */
export function evaluateTenantTriage(
  input: TriageInput,
  monthlyRent: number,
  multiplier: number = DEFAULT_INCOME_MULTIPLIER,
  minMultiplier?: number | null
): TriageResult {
  const qualifyAt = resolveMultiplier(multiplier);
  const reviewFrom = resolveMinMultiplier(minMultiplier, qualifyAt);

  const failureCodes: FailureCode[] = [];
  let reviewReason: ReviewReason | null = null;

  // 1. الدخل السنوي (قاعدة المضاعف، 30 ضعفاً افتراضياً)
  if (input.annualIncome < monthlyRent * qualifyAt) {
    if (input.annualIncome >= monthlyRent * reviewFrom) reviewReason = 'income_borderline';
    else if (input.canProvideUkGuarantor === true) reviewReason = 'income_low_guarantor_offered';
    else failureCodes.push('INCOME_BELOW_THRESHOLD');
  }

  // 2. حق الإقامة (إقرار ذاتي: فحص أولي، ويبقى التحقق بالوثائق على الوكالة)
  if (input.hasRightToRent !== true) failureCodes.push('NO_RIGHT_TO_RENT');

  // 3. الأحكام القضائية والسجل الائتماني (CCJs)
  if (input.hasNoCCJ !== true) failureCodes.push('ADVERSE_CREDIT');

  // A hard failure always wins over a review
  if (failureCodes.length > 0) {
    return { isQualified: false, failureCodes, reviewReason: null, nextAction: 'SHOW_REJECTION' };
  }
  if (reviewReason) {
    return { isQualified: false, failureCodes, reviewReason, nextAction: 'SHOW_REVIEW' };
  }
  return { isQualified: true, failureCodes, reviewReason: null, nextAction: 'SHOW_CALENDAR' };
}

/** Internal wording for reports (agency-facing, never shown to the tenant). */
export const FAILURE_LABELS: Record<FailureCode, string> = {
  INCOME_BELOW_THRESHOLD: 'Declared income below the affordability threshold',
  NO_RIGHT_TO_RENT: 'Did not confirm the right to rent in England',
  ADVERSE_CREDIT: 'Declared adverse credit history (CCJs)',
};