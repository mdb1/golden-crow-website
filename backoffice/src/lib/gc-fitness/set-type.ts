// set-type.ts
//
// quick-260714-m57 (issue #403) — Hevy-style per-set types. TypeScript twin
// of iOS `GCFitnessCore/Schema/SetType.swift` (the canonical source of truth
// for the wire strings) and Android `core/.../schema/SetType.kt`. Any change
// to the raw values or the display-label rule MUST be co-shipped on all three
// surfaces in the same change set.
//
// Plain module (NOT "use server") so both Server Actions and client
// components can import it — unit-tested in __tests__/set-type.test.ts.
//
// WIRE CONTRACT (additive, forgiving):
//   - Template/snapshot exercises carry `setTypesBySet: string[]?` (camelCase
//     wire key, sibling of repsBySet / weightBySetKg). Missing / short /
//     unknown entry ⇒ effective "normal" (see plannedSetType).
//   - Logged sets carry `set_type: string?` (snake_case, sibling of
//     `is_warmup`). Writers ALWAYS keep `is_warmup == (set_type === "warmup")`
//     in sync so old readers keep excluding warm-ups from volume/PR math.
//
// DISPLAY RULE (Hevy semantics): non-normal sets render a colored letter
// instead of the set number — W = warm-up (orange), F = failure (red),
// D = drop set (purple). Normal sets render a 1-based number counting ONLY
// normal sets (non-normal sets do not consume a number).

/** Canonical wire strings — order matters only for UI pickers. */
export const SET_TYPES = ["normal", "warmup", "failure", "dropset"] as const;

export type SetType = (typeof SET_TYPES)[number];

/** Type guard for a raw wire string. */
export function isSetType(raw: unknown): raw is SetType {
  return (
    typeof raw === "string" && (SET_TYPES as readonly string[]).includes(raw)
  );
}

/**
 * Reader-side effective type for a logged set. Accepts BOTH the snake_case
 * Firestore wire shape (`set_type` / `is_warmup`) and the camelCase
 * session shape (`setType` / `isWarmup`).
 *
 * Twin semantics (iOS/Android normalization): a valid NON-normal `set_type`
 * wins; `"normal"`, unknown strings, and absent values all fall back to the
 * legacy warmup flag — old documents resolve exactly as before.
 */
export function effectiveSetType(set: {
  set_type?: string | null;
  setType?: string | null;
  is_warmup?: boolean | null;
  isWarmup?: boolean | null;
}): SetType {
  const raw = set.set_type ?? set.setType;
  if (isSetType(raw) && raw !== "normal") return raw;
  return (set.is_warmup ?? set.isWarmup) === true ? "warmup" : "normal";
}

/**
 * Effective-type resolution for a template/snapshot `setTypesBySet` entry.
 * Missing array, out-of-range index, or unknown raw entry all coerce to
 * "normal" (store raw, coerce on read — decode-everything philosophy, same
 * as the repsBySet fallbacks).
 */
export function plannedSetType(
  setIndex: number,
  setTypesBySet: readonly string[] | null | undefined,
): SetType {
  const raw = setTypesBySet?.[setIndex];
  return isSetType(raw) ? raw : "normal";
}

/** Single-letter marker for non-normal sets; null for "normal". */
export const SET_TYPE_LETTERS: Record<SetType, string | null> = {
  normal: null,
  warmup: "W",
  failure: "F",
  dropset: "D",
};

/**
 * Hevy numbering rule: normal sets are numbered 1-based counting ONLY normal
 * sets; warm-up/failure/drop sets render their letter and do not consume a
 * number.
 *
 *     setDisplayLabels(["warmup", "normal", "normal", "dropset", "normal"])
 *     // ["W", "1", "2", "D", "3"]
 */
export function setDisplayLabels(types: readonly SetType[]): string[] {
  let normalCount = 0;
  return types.map((type) => {
    const letter = SET_TYPE_LETTERS[type];
    if (letter) return letter;
    normalCount += 1;
    return String(normalCount);
  });
}

/** Spanish display names (matches the backoffice form's inline-Spanish copy). */
export const SET_TYPE_LABELS_ES: Record<SetType, string> = {
  normal: "Normal",
  warmup: "Calentamiento",
  failure: "Al fallo",
  dropset: "Drop set",
};

/** Tailwind text-color classes for the letter markers (W/F/D). */
export const SET_TYPE_TEXT_CLASS: Record<SetType, string> = {
  normal: "",
  warmup: "text-orange-500",
  failure: "text-red-500",
  dropset: "text-purple-500",
};

/** Tailwind badge classes (bg + text) for log-detail type badges. */
export const SET_TYPE_BADGE_CLASS: Record<SetType, string> = {
  normal: "",
  warmup: "bg-orange-100 text-orange-700",
  failure: "bg-red-100 text-red-700",
  dropset: "bg-purple-100 text-purple-700",
};
