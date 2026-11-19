// habit-quantity.ts — gc-fitness #1648: habits with an amount (agua, pasos).
//
// TS twin of gc-fitness `GCFitnessCore/HabitQuantity.swift` and android core `HabitQuantity.kt`.
// Every case of `__tests__/twin-vectors/habit-quantity-vectors.json` (PINNED copy of gc-fitness
// `twin-vectors/`) runs through this file.
//
// WIRE CONTRACT: a quantity habit is still a BINARY habit (`type: "binary"`) with an OPTIONAL
// daily target — `habits.quantityTarget` (integer 1…100000) + `habits.quantityUnit`. The day's
// progress lives in `habit_logs.quantity`; `habit_logs.value` stays the ONLY "done?" bit, which
// quantity writers stamp as `quantity >= target`. Compliance (habit-compliance.ts) keeps reading
// `value` and is deliberately untouched.

export const HABIT_QUANTITY_UNITS = ["glasses", "steps", "minutes", "times"] as const;
export type HabitQuantityUnit = (typeof HABIT_QUANTITY_UNITS)[number];

export const HABIT_QUANTITY_MAX_TARGET = 100_000;
export const HABIT_QUANTITY_MAX_QUANTITY = 1_000_000;

export interface HabitQuantityLogLike {
  quantity?: unknown;
  value?: unknown;
  deleted?: unknown;
}

export type HabitQuantityTap =
  | { action: "reset" }
  | { action: "write"; quantity: number; value: boolean };

/** Half-up rounding (Swift `.toNearestOrAwayFromZero` / Kotlin `Math.round` agree for ≥ 0). */
function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** The habit's daily target, or null for a plain yes/no habit. */
export function habitQuantityTarget(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = roundHalfUp(raw);
  return rounded >= 1 && rounded <= HABIT_QUANTITY_MAX_TARGET ? rounded : null;
}

export function habitQuantityUnit(raw: unknown): HabitQuantityUnit {
  return typeof raw === "string" && (HABIT_QUANTITY_UNITS as readonly string[]).includes(raw)
    ? (raw as HabitQuantityUnit)
    : "times";
}

export function isQuantityHabit(habit: { quantityTarget?: unknown; quantityUnit?: unknown }): boolean {
  return habitQuantityTarget(habit.quantityTarget) !== null;
}

/** True when Health fills the habit in (a steps habit with a target). */
export function isAutoStepsHabit(habit: { quantityTarget?: unknown; quantityUnit?: unknown }): boolean {
  return isQuantityHabit(habit) && habitQuantityUnit(habit.quantityUnit) === "steps";
}

export function habitQuantityStep(unit: HabitQuantityUnit): number {
  switch (unit) {
    case "steps":
      return 1000;
    case "minutes":
      return 5;
    default:
      return 1;
  }
}

export function habitQuantityFraction(quantity: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(quantity)) return 0;
  return Math.min(Math.max(quantity / target, 0), 1);
}

/** A missing / negative / non-finite logged amount counts as zero. */
export function sanitizedQuantity(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function habitQuantityTap(
  target: number,
  unit: HabitQuantityUnit,
  log: HabitQuantityLogLike | null | undefined,
): HabitQuantityTap {
  const live = log != null && log.deleted !== true;
  if (live && log.value === true) return { action: "reset" };
  const base = live ? sanitizedQuantity(log.quantity) : 0;
  const quantity = Math.min(base + habitQuantityStep(unit), HABIT_QUANTITY_MAX_QUANTITY);
  return { action: "write", quantity, value: quantity >= target };
}

/** What Health asks to write for a steps habit today, or null when nothing should be written. */
export function habitQuantityAutoSteps(
  target: number,
  log: HabitQuantityLogLike | null | undefined,
  steps: number,
): { quantity: number; value: boolean } | null {
  if (!Number.isFinite(steps)) return null;
  const read = roundHalfUp(steps);
  if (read <= 0) return null;
  if (log != null && log.deleted === true) return null;
  const quantity = Math.min(Math.max(sanitizedQuantity(log?.quantity), read), HABIT_QUANTITY_MAX_QUANTITY);
  const value = log?.value === true || quantity >= target;
  if (log != null && typeof log.quantity === "number" && log.quantity === quantity && (log.value === true) === value) {
    return null;
  }
  return { quantity, value };
}

/** Spanish unit label for the coach surfaces (backoffice copy). */
const UNIT_LABEL_ES: Record<HabitQuantityUnit, string> = {
  glasses: "vasos",
  steps: "pasos",
  minutes: "min",
  times: "veces",
};
const UNIT_LABEL_EN: Record<HabitQuantityUnit, string> = {
  glasses: "glasses",
  steps: "steps",
  minutes: "min",
  times: "times",
};

/** "3 / 8 vasos" — the same wording the apps show (`habits.quantity.progress.*`). */
export function formatHabitQuantityProgress(
  quantity: number,
  target: number,
  unit: HabitQuantityUnit,
  locale: string = "es",
): string {
  const es = !locale.toLowerCase().startsWith("en");
  const fmt = new Intl.NumberFormat(es ? "es-AR" : "en-US", { maximumFractionDigits: 0 });
  const label = (es ? UNIT_LABEL_ES : UNIT_LABEL_EN)[unit];
  return `${fmt.format(sanitizedQuantity(quantity))} / ${fmt.format(target)} ${label}`;
}
