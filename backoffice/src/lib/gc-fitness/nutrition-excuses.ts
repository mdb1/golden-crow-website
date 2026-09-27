// nutrition-excuses.ts
// #1148 — WHY and WHERE the client fails: rankings of their "No cumplí" notes, overall, per
// meal and per meal × weekday. The coach's view of the same analysis the client sees in
// "Ver mis números".
//
// TRIPLE TWIN (same-PR invariant): behavioral changes here MUST land together with
//   gc-fitness iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/NutritionExcuseAnalyzer.swift
//   gc-fitness android/core/.../algorithms/NutritionExcuseAnalyzer.kt
// and `__tests__/nutrition-excuses.test.ts` pins the SAME fixtures and the SAME expected
// output as the two mobile suites — including tie order.
//
// PURE, NO SERVER-ACTION DIRECTIVE: this file is imported by a server component and by tests.
// It must never grow a `"use server"` (every export there has to be async — #785).
//
// ── WHAT COUNTS AS A FAILURE ─────────────────────────────────────────────────────────
//
// A slot marked `missed` — or the legacy `different` (#1143 removed the option; old logs still
// carry it and every surface now draws it as "No cumplió"). An UNMARKED slot is NOT a failure
// here: nobody said why, and there is no note to rank. It still counts in the denominator —
// "falló 3 de 4 jueves" stays literally true.
//
// A failure without a note (or with only whitespace) is its own reason, "sin motivo"
// (`text === null`): hiding it would make the named excuses look more decisive than they are.
//
// ── NOTES → REASONS ──────────────────────────────────────────────────────────────────
//
// Split on `·`, trim, collapse whitespace, lowercase for the key (the #1143 pill rule). A note
// "Comí afuera · había pizza" is a failure for BOTH reasons, so a slot's reason percents can add
// past 100% — each answers "¿en qué porcentaje de las fallas apareció esto?".
//
// Presets are canonicalized ACROSS languages: the caller passes each preset as its spellings
// with the language to DISPLAY first. Custom notes show their MOST RECENT spelling.
//
// ── THE BAR FOR SAYING SOMETHING ─────────────────────────────────────────────────────
//
// - Nothing below `MIN_FAILURES` failures in the range (`hasEnoughData === false`).
// - A meal needs `MIN_MEAL_SAMPLE` expected slots and `MIN_SLOT_FAILURES` failures.
// - A meal × weekday needs `MIN_WEEKDAY_SAMPLE` expected slots, `MIN_SLOT_FAILURES` failures and
//   a failure rate of at least 50%.
// - Percents round half-up, but never to 100% unless it IS all, nor to 0% unless it is none.
//
// ── THE RANKING ──────────────────────────────────────────────────────────────────────
//
// Slots rank by failures² / expected, compared by integer cross-multiplication so the three
// implementations agree bit for bit. Ties: failures DESC → mealId ASC → weekday ASC. Reasons
// rank by count DESC, then recency — the walk order of `forEachDatedNutritionSlot` (days from
// the range end backward, meals in each day's expected order).

import { forEachDatedNutritionSlot } from "./nutrition-adherence";
import { nutritionWeekdayIndex } from "./nutrition-metrics";
import type { LocalizedText, NutritionLog, NutritionPlan } from "./nutrition-schema";

export interface NutritionExcuseReason {
  /** Normalized key. `""` for the "sin motivo" bucket. */
  key: string;
  /** What to show. `null` = the failure had no note ("sin motivo"). */
  text: string | null;
  /** Failures in the bucket whose note contained this reason. */
  count: number;
  /** `count` over the bucket's failures. */
  percent: number;
}

export interface NutritionFailureSlot {
  mealId: string;
  /** The name on the most recent day this meal was expected (the walk meets it first). */
  name: LocalizedText;
  /** Monday-first (`0` = Monday … `6` = Sunday). `null` = every day. */
  weekday: number | null;
  /** Slots this meal was expected in the range (on that weekday, if any). */
  expected: number;
  /** Of those, `missed` or legacy `different`. */
  failures: number;
  percent: number;
  /** Top reasons, percents over `failures`. */
  reasons: NutritionExcuseReason[];
}

export interface NutritionExcuseInsights {
  totalFailures: number;
  hasEnoughData: boolean;
  reasons: NutritionExcuseReason[];
  byMeal: NutritionFailureSlot[];
  byMealWeekday: NutritionFailureSlot[];
}

/**
 * The four preset reasons of the app's "No cumplí" sheet, in every shipped language — the SAME
 * texts as `nutrition_note_reason_*` (Android) / `NutritionNoteReason` (iOS). A preset saved in
 * either language counts as ONE reason.
 */
export const NUTRITION_NOTE_PRESETS: ReadonlyArray<{ es: string; en: string }> = [
  { es: "Comí afuera", en: "Ate out" },
  { es: "Menos cantidad", en: "Smaller portion" },
  { es: "No tenía los ingredientes", en: "Didn't have the ingredients" },
  { es: "No me dio el tiempo", en: "No time" },
];

/** The preset groups for `analyzeNutritionExcuses`, the reader's language first. */
export function nutritionNotePresetGroups(locale: string): string[][] {
  return NUTRITION_NOTE_PRESETS.map((p) => (locale === "en" ? [p.en, p.es] : [p.es, p.en]));
}

export const MIN_FAILURES = 3;
export const MIN_MEAL_SAMPLE = 4;
export const MIN_WEEKDAY_SAMPLE = 3;
export const MIN_SLOT_FAILURES = 2;
export const MAX_REASONS = 5;
export const MAX_SLOT_REASONS = 3;
export const MAX_WEEKDAY_SLOTS = 3;

/** `slot.weekday === null ? mealId : "mealId#weekday"` — the same id the apps use. */
export function nutritionFailureSlotId(slot: NutritionFailureSlot): string {
  return slot.weekday === null ? slot.mealId : `${slot.mealId}#${slot.weekday}`;
}

/** The single slot worth leading with — the top meal × weekday. */
export function nutritionExcuseHeadline(insights: NutritionExcuseInsights): NutritionFailureSlot | null {
  return insights.byMealWeekday[0] ?? null;
}

// ── Note segments (twin of `NutritionFrequentNotes.segments`) ────────────────────────

export interface NutritionNoteSegment {
  /** Trimmed, whitespace collapsed, lowercased. */
  key: string;
  /** Trimmed, whitespace collapsed, case preserved. */
  display: string;
}

export function collapseWhitespace(text: string): string {
  return text.split(/\s+/u).filter((piece) => piece.length > 0).join(" ");
}

export function normalizedNoteKey(text: string): string {
  return collapseWhitespace(text).toLowerCase();
}

/** Split on `·`, normalize, drop empty pieces. Order preserved, duplicates kept. */
export function nutritionNoteSegments(note: string | null | undefined): NutritionNoteSegment[] {
  if (note === null || note === undefined) return [];
  const out: NutritionNoteSegment[] = [];
  for (const piece of note.split("·")) {
    const display = collapseWhitespace(piece);
    if (display.length === 0) continue;
    out.push({ key: display.toLowerCase(), display });
  }
  return out;
}

// ── The analysis ─────────────────────────────────────────────────────────────────────

/** Rounded half-up, but 100 only when `part === whole` and 0 only when `part === 0`. */
export function excusePercent(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  if (part >= whole) return 100;
  const rounded = Math.floor((part * 200 + whole) / (2 * whole));
  return Math.min(Math.max(rounded, 1), 99);
}

interface ReasonEntry {
  count: number;
  firstSeen: number;
  display: string | null;
}

class ReasonTally {
  private entries = new Map<string, ReasonEntry>();

  add(key: string, display: string | null, position: number): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      this.entries.set(key, { count: 1, firstSeen: position, display });
    }
  }

  ranked(base: number, limit: number): NutritionExcuseReason[] {
    return [...this.entries.entries()]
      .sort(([, a], [, b]) => (a.count !== b.count ? b.count - a.count : a.firstSeen - b.firstSeen))
      .slice(0, limit)
      .map(([key, entry]) => ({
        key,
        text: entry.display,
        count: entry.count,
        percent: excusePercent(entry.count, base),
      }));
  }
}

interface SlotTally {
  mealId: string;
  name: LocalizedText;
  weekday: number | null;
  expected: number;
  failures: number;
  reasons: ReasonTally;
}

function newSlot(mealId: string, name: LocalizedText, weekday: number | null): SlotTally {
  return { mealId, name, weekday, expected: 0, failures: 0, reasons: new ReasonTally() };
}

function rankSlots(slots: SlotTally[]): NutritionFailureSlot[] {
  return [...slots]
    .sort((a, b) => {
      // failures² / expected, DESC — cross-multiplied, integers only.
      const l = a.failures * a.failures * b.expected;
      const r = b.failures * b.failures * a.expected;
      if (l !== r) return r - l;
      if (a.failures !== b.failures) return b.failures - a.failures;
      if (a.mealId !== b.mealId) return a.mealId < b.mealId ? -1 : 1;
      return (a.weekday ?? -1) - (b.weekday ?? -1);
    })
    .map((slot) => ({
      mealId: slot.mealId,
      name: slot.name,
      weekday: slot.weekday,
      expected: slot.expected,
      failures: slot.failures,
      percent: excusePercent(slot.failures, slot.expected),
      reasons: slot.reasons.ranked(slot.failures, MAX_SLOT_REASONS),
    }));
}

/**
 * @param plans / logs ONE client's (extras outside the range are harmless).
 * @param start / end the closed civil range in the CLIENT's timezone — `end` is their today.
 * @param presetGroups each preset's spellings in every shipped language, the one to DISPLAY first.
 */
export function analyzeNutritionExcuses(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
  presetGroups: string[][] = [],
): NutritionExcuseInsights {
  // Preset spelling (normalized) → canonical key + display.
  const aliases = new Map<string, { key: string; display: string }>();
  for (const group of presetGroups) {
    const first = group[0];
    if (first === undefined) continue;
    const display = collapseWhitespace(first);
    if (display.length === 0) continue;
    const canonical = display.toLowerCase();
    for (const spelling of group) {
      const key = normalizedNoteKey(spelling);
      if (key.length > 0 && !aliases.has(key)) aliases.set(key, { key: canonical, display });
    }
  }

  const logsByDate = new Map<string, NutritionLog>();
  for (const log of logs) logsByDate.set(log.civilDate, log);

  const global = new ReasonTally();
  const meals = new Map<string, SlotTally>();
  const mealWeekdays = new Map<string, SlotTally>();
  const displayByKey = new Map<string, string>();
  let position = 0;
  let totalFailures = 0;

  forEachDatedNutritionSlot(plans, logs, start, end, (civilDate, meal, status) => {
    const weekday = nutritionWeekdayIndex(civilDate);
    const weekdayKey = weekday === null ? null : `${meal.mealId}#${weekday}`;

    let mealTally = meals.get(meal.mealId);
    if (!mealTally) {
      mealTally = newSlot(meal.mealId, meal.name, null);
      meals.set(meal.mealId, mealTally);
    }
    mealTally.expected += 1;
    let weekdayTally: SlotTally | undefined;
    if (weekdayKey !== null) {
      weekdayTally = mealWeekdays.get(weekdayKey);
      if (!weekdayTally) {
        weekdayTally = newSlot(meal.mealId, meal.name, weekday);
        mealWeekdays.set(weekdayKey, weekdayTally);
      }
      weekdayTally.expected += 1;
    }

    if (status !== "missed" && status !== "different") return;
    totalFailures += 1;
    mealTally.failures += 1;
    if (weekdayTally) weekdayTally.failures += 1;

    // Distinct reasons of THIS failure, canonicalized; none → "sin motivo".
    const reasons: { key: string; display: string | null }[] = [];
    const note = logsByDate.get(civilDate)?.meals[meal.mealId]?.note;
    for (const segment of nutritionNoteSegments(note)) {
      const resolved = aliases.get(segment.key) ?? { key: segment.key, display: segment.display };
      if (!reasons.some((r) => r.key === resolved.key)) {
        const display = displayByKey.get(resolved.key) ?? resolved.display;
        displayByKey.set(resolved.key, display);
        reasons.push({ key: resolved.key, display });
      }
    }
    if (reasons.length === 0) reasons.push({ key: "", display: null });

    for (const reason of reasons) {
      global.add(reason.key, reason.display, position);
      mealTally.reasons.add(reason.key, reason.display, position);
      weekdayTally?.reasons.add(reason.key, reason.display, position);
      position += 1;
    }
  });

  if (totalFailures < MIN_FAILURES) {
    return { totalFailures, hasEnoughData: false, reasons: [], byMeal: [], byMealWeekday: [] };
  }

  const byMeal = rankSlots(
    [...meals.values()].filter((s) => s.expected >= MIN_MEAL_SAMPLE && s.failures >= MIN_SLOT_FAILURES),
  );
  const byMealWeekday = rankSlots(
    [...mealWeekdays.values()].filter(
      (s) =>
        s.expected >= MIN_WEEKDAY_SAMPLE && s.failures >= MIN_SLOT_FAILURES && s.failures * 2 >= s.expected,
    ),
  ).slice(0, MAX_WEEKDAY_SLOTS);

  return {
    totalFailures,
    hasEnoughData: true,
    reasons: global.ranked(totalFailures, MAX_REASONS),
    byMeal,
    byMealWeekday,
  };
}
