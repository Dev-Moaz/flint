// lib/report/tokens.ts
// Report links are bearer tokens: 256 random bits, only a SHA-256 hash is stored.
import { createHash, randomBytes } from 'node:crypto';

export function generateReportToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashReportToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Cheap shape check before touching the database (43 chars of base64url). */
export function isPlausibleToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}