// lib/triage-config.ts
// Tunable screening constants in one tiny file (safe to import from client components).

/** Used when an agency has no (or an invalid) income_multiplier. */
export const DEFAULT_INCOME_MULTIPLIER = 30;

/**
 * How far ahead a move-in date may be picked. This is only a sanity bound against typos:
 * the date is recorded for the agency but is NOT a reason to disqualify anyone.
 */
export const MOVE_IN_MAX_DAYS = 180;