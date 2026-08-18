// nutrition-schema.ts
// TypeScript twin of the nutrition wire shapes (#908 / #913).
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7): any change here MUST land in the SAME
// PR as:
//   gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Nutrition*.swift
//   gc-fitness/android/core/src/main/kotlin/com/goldencrow/fitness/core/schema/Nutrition*.kt
//   gc-fitness/firestore.rules
//   gc-fitness/.planning/schemas/nutrition.md   ← the canonical field tables
//
// FOUNDATION-FREE / NO server-action directive: plain TypeScript, no firebase-admin,
// no next/headers. Safe to import from a client component; Jest exercises it directly.
// The Server Actions that read/write these collections live in sibling `*-actions.ts`
// files — Next.js requires every export in a `"use server"` file to be an async
// function, so pure helpers cannot sit next to them (#785).
//
// ── The decision that orders everything else ────────────────────────────────────────
// Nobody adds up food. Targets are DECLARED by the coach (or by the client for a
// self-authored plan), never computed from a food database. The client declares
// whether they met them. `actualMacros` is an optional escape hatch that shows a
// DELTA — and it never participates in the adherence calculation. The moment a macro
// number starts scoring, this becomes the food tracker #908 explicitly asks us not to
// build.

// ── Shared value types ──────────────────────────────────────────────────────────────

/**
 * Macro targets. Wire: `{ kcal, proteinG, carbsG, fatG }`; grams carry the unit in the
 * field name so no surface has to guess.
 *
 * Every field is optional on purpose: a coach who only cares about calories should not
 * have to invent protein/carb/fat numbers to save a plan, and a missing field must
 * render as "—", never as `0` — a zero protein target is a statement, an absent one is
 * not.
 */
export interface MacroTargets {
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

/** Wire raws for `nutrition_meals.moment`. */
export const NUTRITION_MEAL_MOMENTS = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "other",
] as const;
export type NutritionMealMoment = (typeof NUTRITION_MEAL_MOMENTS)[number];

/**
 * Forgiving decode — an unknown raw falls back to `"other"` rather than throwing, so a
 * single malformed doc can never empty the library list. Twin of the Swift/Kotlin
 * `fromWire` fallbacks.
 */
export function parseNutritionMealMoment(raw: unknown): NutritionMealMoment {
  return NUTRITION_MEAL_MOMENTS.includes(raw as NutritionMealMoment)
    ? (raw as NutritionMealMoment)
    : "other";
}

/** A `{en, es}` bilingual string — the same shape habits and exercises use. */
export interface LocalizedText {
  en: string;
  es: string;
}

/**
 * One alternative the client may pick for a meal — what the `ⓘ` affordance on the row
 * reveals ("las opciones que el coach cargó para cada comida", from #908).
 *
 * The displayed A / B / C letter is DERIVED from array order at render time and
 * deliberately not stored: reordering options in the editor must not require rewriting
 * every label.
 */
export interface NutritionMealOption {
  id: string;
  text: LocalizedText;
  targets?: MacroTargets | null;
}

// ── nutrition_meals ─────────────────────────────────────────────────────────────────

/**
 * A `nutrition_meals/{mealId}` document — the reusable library entry.
 *
 * A coach with twenty clients would otherwise type "Pollo 200 g + arroz + ensalada"
 * twenty times and correct it twenty times. Meals get COPIED into a plan when assigned:
 * editing the library does NOT rewrite what is already assigned.
 */
export interface NutritionMeal {
  id?: string;
  name: LocalizedText;
  moment: NutritionMealMoment;
  /**
   * `null` ⇒ STANDARD library entry: Admin-SDK seeded, read-only, duplicated rather
   * than edited in place (the #163 precedent).
   *
   * The KEY is always present on the wire, holding an explicit `null`. A missing key
   * cannot be matched by a Firestore `where` clause, which is exactly how #400 made
   * client-created habits disappear.
   */
  ownerId: string | null;
  targets?: MacroTargets | null;
  options: NutritionMealOption[];
  deleted?: boolean | null;
}

export function isStandardNutritionEntry(entry: {
  ownerId: string | null;
}): boolean {
  return entry.ownerId === null;
}

// ── The frozen meal copy ────────────────────────────────────────────────────────────

/**
 * A meal as FROZEN INTO a template or a plan — a copy, never a live reference. Same
 * rationale as `templateSnapshot` on `workout_assignments`: the client's plan must not
 * change under them because the coach was tidying the library.
 */
export interface NutritionPlanMeal {
  /**
   * FK back to `nutrition_meals` for provenance — AND the key this meal takes in the
   * daily log's `meals` map, so it must be unique within a plan.
   */
  mealId: string;
  name: LocalizedText;
  moment: NutritionMealMoment;
  targets?: MacroTargets | null;
  options: NutritionMealOption[];
  order: number;
}

// ── nutrition_templates ─────────────────────────────────────────────────────────────

export interface NutritionTemplate {
  id?: string;
  name: LocalizedText;
  ownerId: string | null;
  targets: MacroTargets;
  meals: NutritionPlanMeal[];
  deleted?: boolean | null;
}

// ── nutrition_plans ─────────────────────────────────────────────────────────────────

export const NUTRITION_PLAN_SOURCES = ["coach", "self"] as const;
export type NutritionPlanSource = (typeof NUTRITION_PLAN_SOURCES)[number];

/**
 * Forgiving decode — unknown raws fall back to `"coach"`, the conservative reading. A
 * plan of unknown provenance is treated as read-only for the client rather than
 * accidentally handing them the editor.
 */
export function parseNutritionPlanSource(raw: unknown): NutritionPlanSource {
  return NUTRITION_PLAN_SOURCES.includes(raw as NutritionPlanSource)
    ? (raw as NutritionPlanSource)
    : "coach";
}

export const NUTRITION_REMINDER_MODES = ["off", "daily", "perMeal"] as const;
export type NutritionReminderMode = (typeof NUTRITION_REMINDER_MODES)[number];

/** Forgiving decode — a corrupt value must not start sending notifications. */
export function parseNutritionReminderMode(raw: unknown): NutritionReminderMode {
  return NUTRITION_REMINDER_MODES.includes(raw as NutritionReminderMode)
    ? (raw as NutritionReminderMode)
    : "off";
}

/**
 * Reminder configuration carried on the plan.
 *
 * The two "on" modes are MUTUALLY EXCLUSIVE by design: either one nudge at the end of
 * the day, or one per meal. Four pushes a day is the fastest way to make someone turn
 * notifications off forever.
 *
 * Delivery is SERVER-SIDE FCM (#921), the twin of `sendHabitReminders.ts` — never a
 * local notification, or an uninstalled app would behave differently per section.
 */
export interface NutritionReminders {
  mode: NutritionReminderMode;
  /** `"HH:mm"` local wall clock. Read when `mode === "daily"`. */
  dailyTime?: string | null;
  /** `mealId → "HH:mm"`. Read when `mode === "perMeal"`. */
  mealTimes?: Record<string, string> | null;
}

/** The wire regex the rule layer applies to every time value. */
export const NUTRITION_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidNutritionTime(value: string): boolean {
  return NUTRITION_TIME_PATTERN.test(value);
}

/** The civil-date regex the rule layer applies to `startsOn` / `endsOn` / `civilDate`. */
export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `nutrition_plans/{planId}` document — ONE PHASE for ONE client.
 *
 * A plan is a phase, not a state. "Agosto definición, septiembre volumen": it carries
 * `startsOn` / `endsOn`, future phases queue up behind it, and the past stays readable
 * against the targets in force on each day. That is why assigning TRIMS the previous
 * phase instead of replacing it, and why a self-authored plan becomes a PAST PHASE when
 * a coach arrives rather than being deleted.
 */
export interface NutritionPlan {
  id?: string;
  clientId: string;
  /** Equals `clientId` when `source === "self"`. */
  trainerId: string;
  source: NutritionPlanSource;
  name: LocalizedText;
  templateId?: string | null;
  /** `"YYYY-MM-DD"` inclusive lower bound. */
  startsOn: string;
  /**
   * `"YYYY-MM-DD"` inclusive upper bound, or `null` for open-ended.
   *
   * The KEY is always written, holding an explicit `null`. #400 is the receipt:
   * client-created habits omitted `deleted` entirely and vanished from every
   * `where("deleted", "==", false)` query, because Firestore cannot match a field that
   * is not there. Open-ended is the COMMON case for self-authored plans, so those are
   * exactly the docs that would disappear.
   */
  endsOn: string | null;
  targets: MacroTargets;
  meals: NutritionPlanMeal[];
  reminders?: NutritionReminders | null;
  deleted?: boolean | null;
}

/**
 * True for a client-authored plan. Checks the source AND the id equality together —
 * #392 shipped a bare owner comparison that 404'd every self-authored workout, so
 * neither half is trusted alone.
 */
export function isSelfAuthoredPlan(plan: NutritionPlan): boolean {
  return plan.source === "self" && plan.clientId === plan.trainerId;
}

/**
 * True when the plan is in force on `civilDate`. Soft-deleted plans are never in force.
 * Lexicographic string comparison is correct for zero-padded `YYYY-MM-DD`.
 */
export function planIsActiveOn(plan: NutritionPlan, civilDate: string): boolean {
  if (plan.deleted === true) return false;
  if (plan.startsOn > civilDate) return false;
  return plan.endsOn === null || plan.endsOn === undefined
    ? true
    : civilDate <= plan.endsOn;
}

// ── nutrition_logs ──────────────────────────────────────────────────────────────────

export const NUTRITION_MEAL_STATUSES = ["done", "different", "missed"] as const;
export type NutritionMealStatus = (typeof NUTRITION_MEAL_STATUSES)[number];

/**
 * Forgiving decode — an unknown raw falls back to `"missed"`. The conservative reading
 * is that an unparseable state is not a completion, so a corrupt value can never
 * inflate someone's adherence.
 */
export function parseNutritionMealStatus(raw: unknown): NutritionMealStatus {
  return NUTRITION_MEAL_STATUSES.includes(raw as NutritionMealStatus)
    ? (raw as NutritionMealStatus)
    : "missed";
}

/**
 * The SOLE definition of "did this meal count?". Both the adherence ratio and the
 * streak read this, so their semantics cannot drift apart — the same single-predicate
 * discipline `logCountsAsCompleted` enforces for habits.
 *
 * `different` is NOT compliant. "Distinto" literally means the plan was not followed;
 * inventing a half-credit fraction would be arbitrary and impossible to explain on
 * screen. The breakdown is exposed separately so a UI can still show the split.
 */
export function statusCountsAsCompliant(status: NutritionMealStatus): boolean {
  return status === "done";
}

export interface NutritionMealEntry {
  status: NutritionMealStatus;
  /**
   * Free text. Only offered on `different` / `missed` — tapping ✓ stays a single tap
   * and opens nothing. That asymmetry IS the design: the cost is paid only when there
   * is something to tell. If the sheet appeared every time, within two weeks everybody
   * marks ✓ to make it go away, and we lose exactly the data the coaches asked for.
   */
  note?: string | null;
  /**
   * What the client says they actually ate.
   *
   * **CONTEXT ONLY — NEVER SCORED.** `nutrition-adherence.ts` does not read this field,
   * and there is an explicit test asserting that adding it leaves the ratio unchanged.
   */
  actualMacros?: MacroTargets | null;
}

/** One meal as it was expected on the logged day — frozen. */
export interface NutritionSnapshotMeal {
  mealId: string;
  name: LocalizedText;
  order: number;
  targets?: MacroTargets | null;
}

/**
 * The frozen targets a day was judged against.
 *
 * Without this, starting a new phase re-reads the entire history against the new
 * targets and past compliance CHANGES BY ITSELF — the coach's number moves without
 * anybody doing anything. Same reason `workout_assignments` carries `templateSnapshot`.
 *
 * It freezes the expected MEAL LIST too, because per-meal adherence over a range
 * ("Cena 62%") has to know what was expected on each day even after the coach renames
 * or removes that meal.
 *
 * ⚠️ Never filtered or capped at write time. Any widget projects this verbatim, so a
 * truncated snapshot makes the widget lie and nothing fails — that was #900.
 */
export interface NutritionTargetsSnapshot {
  daily: MacroTargets;
  meals: NutritionSnapshotMeal[];
}

/**
 * A `nutrition_logs/{clientId}_{civilDate}` document — one doc per client-day.
 *
 * A day is ONE document, so marking four meals is four updates to one doc and the
 * re-mark path is idempotent by construction.
 */
export interface NutritionLog {
  id?: string;
  clientId: string;
  /**
   * `"YYYY-MM-DD"` in the user's IANA timezone (Pitfall 8) — from `civilDateToday()`,
   * NEVER `new Date().toISOString().slice(0, 10)`. Marking dinner at 23:50 in Buenos
   * Aires must write `2026-08-18`, not the UTC `2026-08-19`; when each surface derives
   * the day on its own, adherence differs between screens AND NOTHING FAILS.
   */
  civilDate: string;
  planId: string;
  /** Keyed by `mealId`. May be empty for a created-but-untouched day. */
  meals: Record<string, NutritionMealEntry>;
  targetsSnapshot: NutritionTargetsSnapshot;
}

/**
 * SOLE source of truth for the composite doc-id format `${clientId}_${civilDate}`.
 *
 * The format is NOT enforced at the rule layer (Firestore rules cannot robustly match
 * id segments); the edges enforce it through this helper, and the rule layer defends
 * with the `clientId` equality plus the civil-date regex.
 */
export function nutritionLogDocId(clientId: string, civilDate: string): string {
  return `${clientId}_${civilDate}`;
}

// ── Target vs. actual ───────────────────────────────────────────────────────────────

export interface NutritionMacroDelta {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/**
 * `actual − target`, per field. Positive means the client went over.
 *
 * Powers the three-row table in the note sheet:
 * ```
 *            Kcal  Prot  Carb  Gras
 *   Tenías    780    55    78    22
 *   Comiste   950    48    95    38
 *   Dif.     +170    −7   +17   +16
 * ```
 *
 * Showing the delta is the entire reason loading actual macros is worth the taps: "me
 * pasé 170 kcal y me faltaron 7 g de proteína" is actionable, "no cumpliste" is not. It
 * is also why the rule is printed in the UI itself — **the delta never moves
 * adherence**.
 *
 * A field is `null` when EITHER side is missing: a delta against an unspecified target
 * is not zero, it is unknowable, and rendering it as `+0` would quietly claim the
 * client hit a target the coach never set.
 *
 * @param target the meal's target, read from the log's FROZEN `targetsSnapshot`, never
 *   from the live plan — the past is not re-read.
 */
export function computeMacroDelta(
  target: MacroTargets | null | undefined,
  actual: MacroTargets | null | undefined,
): NutritionMacroDelta {
  if (!target || !actual) {
    return { kcal: null, proteinG: null, carbsG: null, fatG: null };
  }
  return {
    kcal: difference(target.kcal, actual.kcal),
    proteinG: difference(target.proteinG, actual.proteinG),
    carbsG: difference(target.carbsG, actual.carbsG),
    fatG: difference(target.fatG, actual.fatG),
  };
}

export function macroDeltaIsEmpty(delta: NutritionMacroDelta): boolean {
  return (
    delta.kcal === null &&
    delta.proteinG === null &&
    delta.carbsG === null &&
    delta.fatG === null
  );
}

export function macroTargetsAreEmpty(targets: MacroTargets): boolean {
  return (
    isAbsent(targets.kcal) &&
    isAbsent(targets.proteinG) &&
    isAbsent(targets.carbsG) &&
    isAbsent(targets.fatG)
  );
}

function difference(
  target: number | null | undefined,
  actual: number | null | undefined,
): number | null {
  if (isAbsent(target) || isAbsent(actual)) return null;
  return (actual as number) - (target as number);
}

function isAbsent(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}
