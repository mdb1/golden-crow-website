// set-effort.ts
//
// gc-fitness #1623 — per-set effort (RPE/RIR). TypeScript twin of the mobile
// `normalizedRpe` helper (iOS GCFitnessCore ⇄ Android core). Any change to the
// normalization rule MUST be co-shipped on all three surfaces.
//
// Plain module (NOT "use server") so Server Actions and client components can
// both import it — unit-tested in __tests__/set-effort.test.ts.
//
// WIRE CONTRACT (additive, forgiving; the backoffice only READS it):
//   - Logged sets carry `rpe: number?` (sibling of `set_type` / `weight_kg`).
//     RPE 6–10 in 0.5 steps. Absent = not logged.
//   - RIR is only a CLIENT display mode (RIR = 10 − RPE); the wire is always
//     RPE and the coach always sees RPE.

export const RPE_MIN = 6;
export const RPE_MAX = 10;

/**
 * Forgiving read of a logged set's `rpe`: non-number / non-finite → absent;
 * round to the nearest 0.5; outside [6, 10] after rounding → absent.
 */
export function normalizedRpe(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const rounded = Math.round(raw * 2) / 2;
  if (rounded < RPE_MIN || rounded > RPE_MAX) return undefined;
  return rounded;
}

/**
 * `{ rpe }` when the raw wire value normalizes, `{}` otherwise — spread into a
 * decoded set so an absent RPE leaves no key (no `undefined` crossing the RSC
 * boundary or reaching the Admin SDK).
 */
export function rpeField(raw: unknown): { rpe?: number } {
  const rpe = normalizedRpe(raw);
  return rpe === undefined ? {} : { rpe };
}

/** RIR (reps in reserve) for a normalized RPE. */
export function rirFromRpe(rpe: number): number {
  return 10 - rpe;
}

/**
 * Locale-aware compact number: integers without decimals ("8"), halves with
 * the locale's decimal separator ("8,5" in Spanish, "8.5" in English).
 */
export function formatRpe(rpe: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(rpe);
}
