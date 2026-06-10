// admin-user-search.ts
//
// PURE, side-effect-free helpers for the admin user-email search (GitHub issue
// #163). NO firebase imports live here — this file is the unit-testable seam
// for the Admin-SDK scan in `admin-actions.ts`.
//
// WHY an in-memory CONTAINS filter and not a Firestore query: the admin wants
// substring matches ("carba" must find both carba.nico@… AND ncarballal@…),
// and Firestore has no substring/contains operator — a prefix range
// (startAt/endAt) only matches emails that START with the query. The user base
// is small (admin-only tool), so the action scans the `users` collection with
// a field projection and filters here. Emails are stored lowercase at
// provisioning (`user-actions.ts`: `.trim().toLowerCase()`) and Google sign-in
// emails are already lowercase, so we lowercase the query to line up; the
// stored email is lowercased defensively at match time anyway.
//
// NOTE: unlike `normalizeMirrorEmail`, we do NOT canonicalize Gmail dots/plus —
// we want a LITERAL substring match of the stored email, so `john.doe@` and
// `john+tag@` must keep their dots/plus.

/** Trim + lowercase ONLY. No Gmail dot/plus canonicalization (see file header). */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Literal case-insensitive CONTAINS match of `normalizedQuery` against a
 * stored email value. `email` is `unknown` because Firestore doc fields are
 * untyped — non-string / empty values never match. Pass the query through
 * `normalizeSearchQuery` first; an empty query matches nothing (callers
 * short-circuit before querying anyway).
 */
export function emailMatchesQuery(email: unknown, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return false;
  if (typeof email !== "string" || email.length === 0) return false;
  return email.toLowerCase().includes(normalizedQuery);
}
