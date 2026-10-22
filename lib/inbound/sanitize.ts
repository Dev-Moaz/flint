// lib/inbound/sanitize.ts
// Everything extracted from an inbound email is attacker-controlled text.
// These helpers keep it small, plain and safe before it reaches the database or an outgoing email.

/** Letters, spaces, apostrophes, hyphens and dots only; max 60 chars. Falls back to "there". */
export function cleanName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned.length > 0 ? cleaned : 'there';
}

/** Digits, plus, spaces, brackets, hyphens; max 20 chars; null if nothing sensible is left. */
export function cleanPhone(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '').replace(/[^\d+()\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return cleaned.replace(/\D/g, '').length >= 7 ? cleaned : null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Minimal HTML to text, used only when an email has no plain-text part. */
export function htmlToText(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Caps the text sent to the model. */
export function boundedText(text: string, max = 8000): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** True only if the address literally appears in the email: stops the model inventing one. */
export function emailAppearsIn(email: string, ...haystacks: Array<string | null | undefined>): boolean {
  const needle = email.trim().toLowerCase();
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(needle));
}