// lib/parser/match-property.ts
// Deterministic matching of an enquiry to one of the agency's own properties.
// Order: reference, then portal listing id, then address. A method only wins if exactly
// ONE property matches; an ambiguous result is treated as "no match" and goes to human review.

export interface PropertyCandidate {
  id: string;
  address: string;
  reference: string | null;
  portal_listing_id: string | null;
}

export type MatchMethod = 'reference' | 'listing_id' | 'address';
export interface MatchResult {
  property: PropertyCandidate;
  method: MatchMethod;
}

const ABBREVIATIONS: Record<string, string> = {
  rd: 'road', st: 'street', ave: 'avenue', av: 'avenue', ln: 'lane', gdns: 'gardens',
  sq: 'square', pl: 'place', cres: 'crescent', ct: 'court', ter: 'terrace', dr: 'drive',
  pk: 'park', gr: 'grove', hse: 'house', mt: 'mount',
};

// Words that do not identify a property
const STOPWORDS = new Set(['flat', 'apartment', 'apt', 'unit', 'the', 'london', 'uk', 'united', 'kingdom', 'england']);

// Full UK postcode, then outward-only (SW4); removed before tokenising addresses
const POSTCODE_FULL = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
const POSTCODE_OUTWARD = /\b[A-Z]{1,2}\d[A-Z\d]?\b/gi;

export function normalise(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function coreTokens(address: string): string[] {
  const withoutPostcode = address.replace(POSTCODE_FULL, ' ').replace(POSTCODE_OUTWARD, ' ');
  return normalise(withoutPostcode)
    .split(' ')
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .filter((t) => !STOPWORDS.has(t));
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalise(text)
      .split(' ')
      .filter(Boolean)
      .map((t) => ABBREVIATIONS[t] ?? t)
  );
}

function unique<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null;
}

/**
 * @param fullText     whole email text (references and listing ids are searched here)
 * @param addressText  the extracted property reference plus the subject (addresses are searched here)
 */
export function matchProperty(
  properties: PropertyCandidate[],
  fullText: string,
  addressText: string
): MatchResult | null {
  // 1) agency reference, whole-word match on the normalised text
  const paddedFull = ` ${normalise(fullText)} `;
  const byRef = properties.filter((p) => {
    const ref = p.reference ? normalise(p.reference) : '';
    return ref.length >= 3 && paddedFull.includes(` ${ref} `);
  });
  if (byRef.length > 0) {
    const hit = unique(byRef);
    return hit ? { property: hit, method: 'reference' } : null; // ambiguous
  }

  // 2) portal listing id, whole number
  const byListing = properties.filter((p) => {
    const id = p.portal_listing_id?.trim();
    return !!id && id.length >= 5 && new RegExp(`(^|\\D)${id.replace(/\W/g, '')}(\\D|$)`).test(fullText);
  });
  if (byListing.length > 0) {
    const hit = unique(byListing);
    return hit ? { property: hit, method: 'listing_id' } : null;
  }

  // 3) address: every identifying token of the property address must appear
  const haystack = tokenSet(addressText);
  const byAddress = properties.filter((p) => {
    const core = coreTokens(p.address);
    return core.length >= 2 && core.every((t) => haystack.has(t));
  });
  const hit = unique(byAddress);
  return hit ? { property: hit, method: 'address' } : null;
}