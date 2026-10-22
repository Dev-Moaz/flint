// lib/inbound/senders.ts
// Who may trigger the pipeline, and which emails count as lettings enquiries.
// The webhook signature proves the request came from Resend, NOT that the email's
// sender is trustworthy: anyone can email an inbound address. These checks close that gap.

// Known portal "From" addresses. Rightmove's come from its own help pages;
// Zoopla's comes from a third-party guide, so confirm it against a real sample.
export const PORTAL_SENDERS = new Set<string>([
  'admin@update.rightmove.co.uk',
  'autoresponder@rightmove.com',
  'members@zpg.com',
]);

/** Extracts a bare, lowercase address from "Name <a@b.com>" or "a@b.com". */
export function bareAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/<([^<>\s]+@[^<>\s]+)>/) ?? raw.match(/([^\s<>"',;]+@[^\s<>"',;]+)/);
  const addr = match?.[1]?.trim().toLowerCase();
  if (!addr || addr.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : null;
}

/** Extra allowed senders for local testing only, e.g. INBOUND_EXTRA_SENDERS=me@gmail.com */
function extraSendersFromEnv(): string[] {
  return (process.env.INBOUND_EXTRA_SENDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Allowed: a known portal address, an address the agency registered as its own
 * forwarding mailbox (agencies.forwarding_senders), or a dev-only extra sender.
 */
export function isAllowedSender(from: string | null | undefined, agencyForwarders: string[] | null | undefined): boolean {
  const addr = bareAddress(from);
  if (!addr) return false;
  if (PORTAL_SENDERS.has(addr)) return true;
  if ((agencyForwarders ?? []).some((f) => f.trim().toLowerCase() === addr)) return true;
  return extraSendersFromEnv().includes(addr);
}

/** Addresses that must never be used as a tenant address (prevents mail loops and relaying). */
export function isSystemAddress(
  email: string,
  agencyInbound: string | null | undefined,
  agencyForwarders: string[] | null | undefined
): boolean {
  const addr = email.trim().toLowerCase();
  return (
    PORTAL_SENDERS.has(addr) ||
    (agencyInbound ? agencyInbound.trim().toLowerCase() === addr : false) ||
    (agencyForwarders ?? []).some((f) => f.trim().toLowerCase() === addr)
  );
}

/**
 * Deterministic pre-filter, applied before any model call.
 * Accept "lettings" subjects (Rightmove: "Lettings enquiry: ..."); otherwise accept a generic
 * enquiry unless it is clearly sales/valuation/commercial. Tighten once real Zoopla samples exist.
 * Anything rejected here is logged as IGNORED, never silently dropped.
 */
export function isLettingsEnquirySubject(subject: string | null | undefined): boolean {
  const s = (subject ?? '').toLowerCase();
  if (/\blettings?\b/.test(s)) return true;
  if (!/\b(enquiry|inquiry)\b/.test(s)) return false;
  return !/\b(sales?|valuation|commercial|buyer|vendor)\b/.test(s);
}