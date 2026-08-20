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

// ── #961 — ¿las comidas suman el día? ────────────────────────────────────────────────
//
// El editor ya avisaba, comida por comida, cuando los macros de ESA comida no cerraban
// con su propia línea de calorías. Lo que faltaba es la pregunta que el coach hace en voz
// alta mientras carga el plan: "¿lo que repartí entre las comidas llega al objetivo del
// día, me quedé corto, o me pasé?". Sin eso, cuatro comidas plausibles suman 1.160 de un
// objetivo de 2.000 y el plan sale con 800 kcal de menos sin que nada lo diga.
//
// ⚠️ MISMA DISCIPLINA QUE EL RESTO DEL ARCHIVO: es una AYUDA, no una validación. No
// bloquea el guardado y no reescribe nada.
//
// ⚠️ Y UNA COMIDA SIN UN MACRO NO ES UNA COMIDA CON CERO. Si dos de cuatro comidas no
// tienen proteína cargada, "te faltan 40 g" es mentira: el total no es un total. Por eso
// cada macro reporta cuántas comidas aportaron y cuántas no, y la copia se calla el
// "faltan" cuando el total está incompleto. Tratar el faltante como cero e imprimir un
// número seguro es peor que no imprimir nada.

/** El objetivo del día y lo que suman las comidas, para UNA métrica. */
export interface MacroRollupLine {
  /** Lo que suman las comidas que SÍ tienen la métrica cargada. */
  total: number;
  /** Cuántas comidas aportaron a `total`. */
  mealsCounted: number;
  /** Cuántas comidas dejaron la métrica vacía. `> 0` ⇒ `total` es un piso, no un total. */
  mealsMissing: number;
  /** El objetivo del día, o `null` si el coach no lo cargó. */
  target: number | null;
  /**
   * `total - target`, o `null` cuando no hay objetivo **o** el total está incompleto.
   *
   * Null es la señal de "no digas nada": una diferencia calculada contra una suma a la que
   * le faltan comidas siempre exagera el faltante, y el coach corregiría un plan que está
   * bien.
   */
  delta: number | null;
}

export interface MacroRollup {
  kcal: MacroRollupLine;
  proteinG: MacroRollupLine;
  carbsG: MacroRollupLine;
  fatG: MacroRollupLine;
  /** `true` cuando ninguna comida tiene ningún número: no hay nada para mostrar todavía. */
  isEmpty: boolean;
}

export interface MacroRollupTargets extends MacroGrams {
  kcal?: number | null;
}

/** Una comida, tal como la tiene el editor: cuatro números que pueden faltar. */
export type MacroRollupMeal = MacroRollupTargets;

function rollupLine(
  values: Array<number | null | undefined>,
  target: number | null | undefined,
): MacroRollupLine {
  let total = 0;
  let mealsCounted = 0;
  let mealsMissing = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      mealsCounted += 1;
    } else {
      mealsMissing += 1;
    }
  }
  const hasTarget = typeof target === "number" && Number.isFinite(target);
  return {
    total: Math.round(total),
    mealsCounted,
    mealsMissing,
    target: hasTarget ? target : null,
    delta:
      hasTarget && mealsMissing === 0 && mealsCounted > 0
        ? Math.round(total) - target
        : null,
  };
}

/**
 * Lo que las comidas suman, contra lo que el día pide.
 *
 * Las cuatro métricas se cuentan por separado a propósito: un plan puede tener las
 * calorías de todas las comidas y la proteína de sólo dos, y ahí las calorías SÍ se pueden
 * comparar contra el objetivo y la proteína no.
 */
export function rollupMealMacros(
  meals: readonly MacroRollupMeal[],
  targets: MacroRollupTargets,
): MacroRollup {
  const kcal = rollupLine(meals.map((meal) => meal.kcal), targets.kcal);
  const proteinG = rollupLine(meals.map((meal) => meal.proteinG), targets.proteinG);
  const carbsG = rollupLine(meals.map((meal) => meal.carbsG), targets.carbsG);
  const fatG = rollupLine(meals.map((meal) => meal.fatG), targets.fatG);
  const isEmpty =
    kcal.mealsCounted === 0 &&
    proteinG.mealsCounted === 0 &&
    carbsG.mealsCounted === 0 &&
    fatG.mealsCounted === 0;
  return { kcal, proteinG, carbsG, fatG, isEmpty };
}

/**
 * Debajo de esto, el reparto "cierra".
 *
 * Para kcal se reusa [KCAL_MISMATCH_TOLERANCE] —el mismo 50 que ya usa el editor comida
 * por comida, así que dos avisos del mismo archivo no pueden contradecirse—, y para los
 * gramos alcanza con 1 g: repartir 90 g de proteína entre cuatro comidas da números
 * redondos, y un desvío de 2 g es una decisión, no un redondeo.
 */
export const MACRO_GRAMS_TOLERANCE = 1;

/** `true` cuando la diferencia es lo bastante grande como para nombrarla. */
export function rollupDeltaIsWorthShowing(
  line: MacroRollupLine,
  metric: "kcal" | "grams",
): boolean {
  if (line.delta === null) return false;
  const tolerance = metric === "kcal" ? KCAL_MISMATCH_TOLERANCE : MACRO_GRAMS_TOLERANCE;
  return Math.abs(line.delta) >= tolerance;
}
