// lib/calendar/signature.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies the X-Cal-Signature-256 header: HMAC-SHA256 of the RAW request body with the
 * webhook secret, as a hex string. Accepts an optional "sha256=" prefix.
 * Constant-time comparison. Returns false for anything missing or malformed.
 */
export function verifyCalSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!header || !secret) return false;
  const provided = header.trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}