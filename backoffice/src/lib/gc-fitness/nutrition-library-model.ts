// nutrition-library-model.ts
// PURE validation + tally helpers for the coach's nutrition LIBRARY (#918, epic
// gc-fitness#908 step F): `nutrition_meals` (reusable meals) and
// `nutrition_templates` (reusable whole plans).
//
// NO `"use server"` DIRECTIVE, ON PURPOSE. Everything here is synchronous and pure, so Jest
// exercises it directly and the client components can import it. In a `"use server"` file
// every export must be an async function — a synchronous export passes the whole Jest suite
// and dies in `next build`, which is what auto-deploys (#785). The Server Actions live in
// the sibling `nutrition-library-actions.ts`.
//
// ── THE RULE THIS MODULE EXISTS TO PROTECT ───────────────────────────────────────────
//
// **Editing the library does NOT rewrite what is already assigned.** A plan carries frozen
// COPIES of its meals (`NutritionPlanMeal`), not references, so there is no code path from
// a library edit to an assigned plan — and that is the point, not an omission. If a coach
// wants to propagate a change they re-assign. Same rule that already governs workout
// templates, and the reason `usage` counts exist at all: the pill is what tells a coach
// "this meal is in 9 plans" BEFORE they edit it, since editing will NOT reach those 9.
//
// ── WHY THE COUNTS ARE TWO DIFFERENT NUMBERS ─────────────────────────────────────────
//
// A meal can be used by a TEMPLATE (a plan the coach will assign later) and by an assigned
// PLAN (a phase some client is eating today). They answer different questions and a single
// merged number would answer neither: "9" that turns out to be 9 templates nobody is on is
// a very different warning from 9 people currently eating it.

import { z } from "zod";

import {
  NUTRITION_MEAL_MOMENTS,
  type LocalizedText,
  type NutritionMeal,
  type NutritionMealMoment,
  type NutritionTemplate,
} from "./nutrition-schema";

// ── Zod ─────────────────────────────────────────────────────────────────────────────

const localizedTextSchema = z.object({
  en: z.string().trim().min(1).max(120),
  es: z.string().trim().min(1).max(120),
});

/**
 * Macros. Every field optional — a coach who only cares about calories should not have to
 * invent protein/carb/fat numbers, and a missing field renders as "—", never as `0`.
 *
 * Same bounds as `nutrition-plan-form.ts` on purpose: a meal that is legal in the library
 * and illegal in a plan would fail at ASSIGN time, which is the worst moment to find out.
 */
const macroTargetsSchema = z.object({
  kcal: z.number().min(0).max(20000).nullish(),
  proteinG: z.number().min(0).max(2000).nullish(),
  carbsG: z.number().min(0).max(2000).nullish(),
  fatG: z.number().min(0).max(2000).nullish(),
});

const mealOptionSchema = z.object({
  id: z.string().trim().max(64).optional(),
  text: localizedTextSchema,
  targets: macroTargetsSchema.optional(),
});

/** What the meal editor submits. `ownerId` is NEVER accepted from input — see the action. */
export const nutritionMealFormSchema = z.object({
  name: localizedTextSchema,
  moment: z.enum(NUTRITION_MEAL_MOMENTS),
  targets: macroTargetsSchema.optional(),
  options: z.array(mealOptionSchema).max(12).default([]),
});

export type NutritionMealFormInput = z.input<typeof nutritionMealFormSchema>;
export type NutritionMealFormValues = z.output<typeof nutritionMealFormSchema>;

const templateMealSchema = z.object({
  /**
   * The library meal this row was copied FROM, when it came from one. Optional because a
   * template may hold a meal typed inline — and it is still a real id once written, since
   * the daily log keys its `meals` map by it.
   */
  mealId: z.string().trim().max(64).optional(),
  name: localizedTextSchema,
  moment: z.enum(NUTRITION_MEAL_MOMENTS),
  targets: macroTargetsSchema.optional(),
  options: z.array(mealOptionSchema).max(12).default([]),
});

/** What the template editor submits. */
export const nutritionTemplateFormSchema = z
  .object({
    name: localizedTextSchema,
    targets: macroTargetsSchema,
    meals: z
      .array(templateMealSchema)
      .min(1, "Una plantilla necesita al menos una comida")
      .max(12),
  })
  .superRefine((value, ctx) => {
    // A meal id repeated inside one template would collapse two rows into one key in the
    // daily log's `meals` map once assigned: the client would mark breakfast and see dinner
    // change too. Caught HERE rather than at assign time, where it is a mystery.
    const ids = value.meals.map((meal) => meal.mealId).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["meals"],
        message: "Dos comidas de la plantilla no pueden compartir el mismo mealId",
      });
    }
  });

export type NutritionTemplateFormInput = z.input<typeof nutritionTemplateFormSchema>;
export type NutritionTemplateFormValues = z.output<typeof nutritionTemplateFormSchema>;

// ── Standard vs. owned ──────────────────────────────────────────────────────────────

/**
 * A library row as the SERVER hands it back: the doc id is always known there, unlike the
 * optional `id` on the wire type (a meal frozen into a plan carries no doc id of its own).
 * Typing that away here keeps every consumer from re-checking it.
 */
export type NutritionMealRow = NutritionMeal & { id: string };
export type NutritionTemplateRow = NutritionTemplate & { id: string };

/**
 * The name a duplicate takes: the original plus a locale-appropriate suffix.
 *
 * Both slots get their own suffix — a copy called "Desayuno (copia)" in Spanish and
 * "Breakfast (copia)" in English is the kind of half-translation that survives for years
 * because nobody looks at the other language.
 */
export function duplicatedLibraryName(name: LocalizedText): LocalizedText {
  return {
    en: `${name.en} (copy)`.slice(0, 120),
    es: `${name.es} (copia)`.slice(0, 120),
  };
}

// ── Usage tallies ───────────────────────────────────────────────────────────────────

/** Minimal shape of a `nutrition_templates` doc needed to tally meal usage. */
export interface TemplateForMealUsage {
  id: string;
  deleted?: boolean;
  meals?: Array<{ mealId?: string | null } | null> | null;
}

/** Minimal shape of a `nutrition_plans` doc needed to tally usage. */
export interface PlanForUsage {
  id: string;
  deleted?: boolean;
  templateId?: string | null;
  meals?: Array<{ mealId?: string | null } | null> | null;
}

/**
 * `mealId` → number of DISTINCT non-deleted templates that embed it.
 *
 * A template that lists the same meal twice still counts once for that template: the
 * question the pill answers is "how many templates would I have to re-check", not "how
 * many rows exist".
 */
export function tallyMealUsageInTemplates(
  templates: TemplateForMealUsage[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const template of templates) {
    if (!template || template.deleted === true) continue;
    const ids = new Set<string>();
    for (const meal of template.meals ?? []) {
      const id = meal?.mealId;
      if (typeof id === "string" && id) ids.add(id);
    }
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/**
 * `mealId` → number of DISTINCT non-deleted ASSIGNED plans that embed it.
 *
 * Counts every plan, past phases included, and that is deliberate: the number exists to
 * warn a coach that a name they are about to change is the name a client already read on
 * a day they logged. Dropping closed phases would under-warn exactly where the history is.
 */
export function tallyMealUsageInPlans(plans: PlanForUsage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const plan of plans) {
    if (!plan || plan.deleted === true) continue;
    const ids = new Set<string>();
    for (const meal of plan.meals ?? []) {
      const id = meal?.mealId;
      if (typeof id === "string" && id) ids.add(id);
    }
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** `templateId` → number of non-deleted plans assigned FROM that template. */
export function tallyTemplateUsageInPlans(plans: PlanForUsage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const plan of plans) {
    if (!plan || plan.deleted === true) continue;
    const id = plan.templateId;
    if (typeof id !== "string" || !id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** The two numbers a library row shows, already merged for rendering. */
export interface LibraryUsage {
  /** In how many reusable templates. */
  templates: number;
  /** In how many assigned client plans. */
  plans: number;
}

export function libraryUsageFor(
  id: string,
  templates: Record<string, number>,
  plans: Record<string, number>,
): LibraryUsage {
  return { templates: templates[id] ?? 0, plans: plans[id] ?? 0 };
}

// ── Template → assign prefill ───────────────────────────────────────────────────────

/**
 * A field the coach retouched for THIS client, relative to the template it came from.
 *
 * #918 asks for "lo modificado marcado", and the honest way to mark it is to compare
 * against the template rather than to track keystrokes: a coach who types a value and then
 * types the original back has not modified anything, and a diff says so while a dirty-flag
 * does not.
 */
export interface TemplateDeviation {
  /** `daily` for the plan's own targets, or the meal's index in display order. */
  scope: "daily" | { mealIndex: number };
  field: "kcal" | "proteinG" | "carbsG" | "fatG" | "name" | "moment" | "options";
}

interface MacroLike {
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

interface MealLike {
  name: LocalizedText;
  moment: NutritionMealMoment;
  targets?: MacroLike | null;
  options?: Array<{ text: LocalizedText }> | null;
}

const MACRO_FIELDS = ["kcal", "proteinG", "carbsG", "fatG"] as const;

/**
 * What differs between the template and what the coach is about to assign.
 *
 * Absent and `null` are treated as the SAME value: a macro the template never set and one
 * the coach cleared are both "no target", and reporting that as a change would light up
 * every row of every assign made from a calories-only template.
 */
export function templateDeviations(
  template: { targets: MacroLike; meals: MealLike[] },
  draft: { targets: MacroLike; meals: MealLike[] },
): TemplateDeviation[] {
  const found: TemplateDeviation[] = [];

  for (const field of MACRO_FIELDS) {
    if (!sameMacro(template.targets[field], draft.targets[field])) {
      found.push({ scope: "daily", field });
    }
  }

  const shared = Math.min(template.meals.length, draft.meals.length);
  for (let index = 0; index < shared; index += 1) {
    const before = template.meals[index]!;
    const after = draft.meals[index]!;
    if (before.name.es !== after.name.es || before.name.en !== after.name.en) {
      found.push({ scope: { mealIndex: index }, field: "name" });
    }
    if (before.moment !== after.moment) {
      found.push({ scope: { mealIndex: index }, field: "moment" });
    }
    for (const field of MACRO_FIELDS) {
      if (!sameMacro(before.targets?.[field], after.targets?.[field])) {
        found.push({ scope: { mealIndex: index }, field });
      }
    }
    const beforeOptions = (before.options ?? []).map((o) => o.text.es).join("␟");
    const afterOptions = (after.options ?? []).map((o) => o.text.es).join("␟");
    if (beforeOptions !== afterOptions) {
      found.push({ scope: { mealIndex: index }, field: "options" });
    }
  }

  // Added or removed meals are reported against the row that has no counterpart, so the
  // form can mark it without inventing a third "structure changed" concept.
  for (let index = shared; index < draft.meals.length; index += 1) {
    found.push({ scope: { mealIndex: index }, field: "name" });
  }

  return found;
}

/** `null`, `undefined` and a missing key are one value: "no target". */
function sameMacro(a: number | null | undefined, b: number | null | undefined): boolean {
  const left = a ?? null;
  const right = b ?? null;
  return left === right;
}
