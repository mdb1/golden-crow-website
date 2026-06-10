// admin-user-search.ts
//
// PURE, side-effect-free helpers for the admin user-email search (GitHub issue
// #163). NO firebase imports live here — this file is the unit-testable seam the
// Admin-SDK query in `admin-actions.ts` builds its range from.
//
// WHY a prefix range and not a full-text search: Firestore has no substring/
// contains operator, but an `orderBy("email").startAt(q).endAt(q + SENTINEL)`
// range matches every email that STARTS WITH `q`. Emails are stored lowercase
// at provisioning (`user-actions.ts`: `.trim().toLowerCase()`) and Google
// sign-in emails are already lowercase, so we lowercase the query to line up
// with the stored values (Firestore range queries are case-sensitive).
//
// NOTE: unlike `normalizeMirrorEmail`, we do NOT canonicalize Gmail dots/plus —
// we want a LITERAL prefix match of the stored email, so `john.doe@` and
// `john+tag@` must keep their dots/plus.

/**
 * High-codepoint sentinel (U+F8FF, the highest BMP private-use code point) —
 * the standard Firestore prefix-range upper bound. Appending it to the query
 * yields an `endAt` that sorts just after every string starting with `query`.
 */
const PREFIX_SENTINEL = "";

/** Trim + lowercase ONLY. No Gmail dot/plus canonicalization (see file header). */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Build the Firestore prefix-range bounds for an email search.
 * Returns `null` for an empty (or whitespace-only) query so the caller can
 * short-circuit to `[]` without issuing a query.
 */
export function buildEmailPrefixBounds(
  raw: string,
): { startAt: string; endAt: string } | null {
  const q = normalizeSearchQuery(raw);
  if (q.length === 0) return null;
  return { startAt: q, endAt: q + PREFIX_SENTINEL };
}
