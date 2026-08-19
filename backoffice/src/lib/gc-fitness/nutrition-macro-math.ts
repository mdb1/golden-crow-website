// nutrition-macro-math.ts
//
// The Atwater arithmetic behind the "los macros suman ≈X kcal" hint in the plan editors
// (#949). Pure, so the assign form and the library dialogs print the same number.
//
// ── THIS IS A HINT, NOT A VALIDATION ─────────────────────────────────────────────────
//
// The 4/4/9 factors are a rounded convention, not a measurement: fibre, alcohol and the
// thermic effect all move the real number, and coaches legitimately prescribe macros that
// do not add up to the calorie line they typed. So nothing here BLOCKS a save and nothing
// rewrites the coach's `kcal`. It exists because typing 90/280/50 and 2000 in four blind
// boxes is how a phase ships 500 kcal away from what was intended, and nobody notices
// until the client stops losing weight.
//
// ── A PARTIAL SET OF MACROS STILL ESTIMATES ──────────────────────────────────────────
//
// A coach who only set protein gets an estimate computed from protein alone, and the
// caller is told how many macros went into it (`macrosUsed`) so the copy can say the
// estimate is partial. Treating a missing macro as zero and printing a confident total
// would be worse than printing nothing: it reads as an authoritative number.

/** Kilocalories per gram — the Atwater general factors. */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * Below this many kcal apart, the typed calories and the macro sum are "the same number".
 *
 * 50 kcal is under 3% of a normal daily target and well inside the rounding a coach does
 * in their head. Flagging smaller gaps would light the warning up on almost every plan,
 * which is the fastest way to teach people to ignore it.
 */
export const KCAL_MISMATCH_TOLERANCE = 50;

export interface MacroGrams {
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface MacroKcalEstimate {
  /** Whole kilocalories implied by the macros that ARE set. */
  kcal: number;
  /** How many of the three macros contributed — 1, 2 or 3. Never 0. */
  macrosUsed: number;
  /** `true` when at least one macro is missing, so the copy can hedge. */
  isPartial: boolean;
}

/**
 * The kcal the typed macros add up to, or `null` when no macro is set at all.
 *
 * `null` is the "say nothing" signal: a coach who filled in only the calorie line has not
 * made a claim that could disagree with itself.
 */
export function estimateKcalFromMacros(macros: MacroGrams): MacroKcalEstimate | null {
  const parts: Array<[number | null | undefined, number]> = [
    [macros.proteinG, KCAL_PER_GRAM.protein],
    [macros.carbsG, KCAL_PER_GRAM.carbs],
    [macros.fatG, KCAL_PER_GRAM.fat],
  ];

  let kcal = 0;
  let macrosUsed = 0;
  for (const [grams, perGram] of parts) {
    if (typeof grams !== "number" || !Number.isFinite(grams)) continue;
    kcal += grams * perGram;
    macrosUsed += 1;
  }

  if (macrosUsed === 0) return null;
  return { kcal: Math.round(kcal), macrosUsed, isPartial: macrosUsed < 3 };
}

/**
 * How far the typed calorie target is from what the macros imply — `null` when there is
 * nothing to compare, or when the gap is inside the tolerance.
 *
 * Only reported for a COMPLETE set of macros. A partial estimate is always lower than the
 * real total by construction, so comparing it against the target would flag every plan
 * where the coach deliberately left a macro open.
 */
export function macroKcalMismatch(
  targetKcal: number | null | undefined,
  estimate: MacroKcalEstimate | null,
): number | null {
  if (estimate === null || estimate.isPartial) return null;
  if (typeof targetKcal !== "number" || !Number.isFinite(targetKcal)) return null;
  const delta = estimate.kcal - targetKcal;
  return Math.abs(delta) >= KCAL_MISMATCH_TOLERANCE ? delta : null;
}
