// exercise-name-variants.ts — #581.
//
// The progress payload ships ONE display name per logged exercise (ES-first),
// so the other language never reaches the browser and the picker's search can
// only ever match the language the coach happens to be shown. This module is
// the pure half of the fix: it pulls EVERY language out of a bilingual
// `{ en, es }` name (from a log's `templateSnapshot` or from the `exercises`
// doc) and turns the collected set into the search-only alias list that rides
// alongside the display name.
//
// Both mobile twins already search `name.en` AND `name.es` (iOS
// `GCFitnessCore/ExerciseSearch.swift`, `ExerciseListViewModel`), as does the
// backoffice's own library search (`exercise-search.ts` `scoreExercise`) — they
// all hold the whole exercise doc. Only the progress payload flattens, which is
// why this helper exists here and has no mobile counterpart.

import { normalizeSearchText } from "./exercise-search";

/**
 * Every non-empty language variant of a wire `name` value, in EN→ES order.
 *
 * Accepts the two shapes the wire actually carries:
 *   - `{ en?, es? }` — the modern bilingual name (both languages returned)
 *   - `"Squat"`      — a legacy plain-string name (single variant)
 *
 * Anything else (null, number, empty strings) yields `[]`. Values are trimmed;
 * no normalization is applied — these stay display-shaped, and the search layer
 * normalizes at match time.
 */
export function exerciseNameVariants(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!value || typeof value !== "object") return [];
  const loc = value as { en?: unknown; es?: unknown };
  const out: string[] = [];
  for (const raw of [loc.en, loc.es]) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/**
 * Accumulate the variants of `value` into `target`, deduped by NORMALIZED text
 * so "Press de Banca" and "Press de banca" (the same name spelled differently
 * across two logs) don't both survive. First spelling seen wins.
 *
 * Callers fold every log's snapshot name for an exercise through this, so an
 * exercise renamed mid-history stays findable by BOTH its old and new names.
 */
export function collectExerciseNameVariants(
  target: Map<string, string>,
  value: unknown,
): void {
  for (const variant of exerciseNameVariants(value)) {
    const key = normalizeSearchText(variant);
    if (!key || target.has(key)) continue;
    target.set(key, variant);
  }
}

/**
 * The search-only alias list for a picker row: every collected variant EXCEPT
 * the one already displayed, so nothing is duplicated on the wire. Comparison
 * is on normalized text, so a display name that differs from its variant only
 * by case/diacritics is still recognized as the same name.
 */
export function searchAliasesFor(
  displayName: string,
  variants: Map<string, string>,
): string[] {
  const displayKey = normalizeSearchText(displayName);
  const out: string[] = [];
  for (const [key, variant] of variants) {
    if (key === displayKey) continue;
    out.push(variant);
  }
  return out;
}
