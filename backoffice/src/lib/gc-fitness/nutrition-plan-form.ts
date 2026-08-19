// nutrition-plan-form.ts
// Pure validation + presentation helpers for the coach's nutrition assign flow (#914).
//
// NO `"use server"` DIRECTIVE, ON PURPOSE. Everything here is synchronous and pure, so
// Jest exercises it directly and the client form component can import it. In a
// `"use server"` file every export must be an async function — a synchronous export
// passes the whole Jest suite and dies in `next build`, which is what auto-deploys (#785).
// The Server Actions live in the sibling `nutrition-actions.ts`.
//
// The wire types this validates come from `nutrition-schema.ts` (issue #913, the triple
// twin). This module adds only what the FORM needs on top: what a coach is allowed to
// type, and how the phase strip labels what already exists.

import { z } from "zod";

import { civilDateToday } from "./civil-date";
import { activeNutritionPlan } from "./nutrition-plan-resolution";
import {
  CIVIL_DATE_PATTERN,
  NUTRITION_MEAL_MOMENTS,
  NUTRITION_REMINDER_MODES,
  NUTRITION_TIME_PATTERN,
  type NutritionPlan,
} from "./nutrition-schema";

// ── Zod ─────────────────────────────────────────────────────────────────────────────

const localizedTextSchema = z.object({
  en: z.string().trim().min(1).max(120),
  es: z.string().trim().min(1).max(120),
});

const civilDateSchema = z
  .string()
  .regex(CIVIL_DATE_PATTERN, "Usá el formato YYYY-MM-DD");

/**
 * Macros. Every field optional — a coach who only cares about calories should not have to
 * invent protein/carb/fat numbers to save a plan, and a missing field renders as "—",
 * never as `0`.
 *
 * The upper bounds are sanity rails, not nutrition advice: they catch a fat-fingered
 * "24000" that would otherwise sit in a client's plan looking authoritative.
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

const planMealSchema = z.object({
  /**
   * Optional on input: an inline meal typed into this form has no library entry behind it
   * yet, so the Server Action mints the id. It is still a real id — the daily log keys its
   * `meals` map by it, so it has to be stable for the life of the plan.
   */
  mealId: z.string().trim().max(64).optional(),
  name: localizedTextSchema,
  moment: z.enum(NUTRITION_MEAL_MOMENTS),
  targets: macroTargetsSchema.optional(),
  options: z.array(mealOptionSchema).max(12).default([]),
});

const remindersSchema = z.object({
  mode: z.enum(NUTRITION_REMINDER_MODES),
  dailyTime: z.string().regex(NUTRITION_TIME_PATTERN).nullish(),
  mealTimes: z.record(z.string(), z.string().regex(NUTRITION_TIME_PATTERN)).nullish(),
});

/**
 * What the assign form submits.
 *
 * `endsOn` is `string | null` and REQUIRED as a key — never optional. An open-ended phase
 * must reach Firestore as `endsOn: null`, because Firestore cannot match a field that is
 * not there, and open-ended is the common case. That is exactly how #400 made
 * client-created habits invisible to every `where("deleted","==",false)` query.
 *
 * `trainerId` is deliberately absent: the Server Action takes it from the session AFTER
 * this parse, so a tampered payload can never smuggle one in.
 */
const nutritionPlanBodySchema = z.object({
  name: localizedTextSchema,
  templateId: z.string().trim().max(128).nullish(),
  startsOn: civilDateSchema,
  endsOn: civilDateSchema.nullable(),
  targets: macroTargetsSchema,
  meals: z.array(planMealSchema).min(1, "Un plan necesita al menos una comida").max(12),
  reminders: remindersSchema.optional(),
});

/**
 * The checks that hold for a plan BODY, whoever it is being written for.
 *
 * Shared by the single assign and the bulk one (#927) on purpose: a rule that only the
 * single path enforces is a rule the bulk path is allowed to break fifteen times at once.
 */
function refineNutritionPlanBody(
  value: { startsOn: string; endsOn: string | null; meals: Array<{ mealId?: string }> },
  ctx: z.RefinementCtx,
): void {
  if (value.endsOn !== null && value.endsOn < value.startsOn) {
    ctx.addIssue({
      code: "custom",
      path: ["endsOn"],
      message: "La fecha de fin no puede ser anterior a la de inicio",
    });
  }
  // A meal id repeated inside one plan would collapse two rows into one key in the daily
  // log's `meals` map: the client would mark breakfast and see dinner change too.
  const ids = value.meals.map((meal) => meal.mealId).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: "custom",
      path: ["meals"],
      message: "Dos comidas del plan no pueden compartir el mismo mealId",
    });
  }
}

export const nutritionPlanFormSchema = nutritionPlanBodySchema
  .extend({ clientId: z.string().trim().min(1) })
  .superRefine(refineNutritionPlanBody);

export type NutritionPlanFormInput = z.input<typeof nutritionPlanFormSchema>;
export type NutritionPlanFormValues = z.output<typeof nutritionPlanFormSchema>;

/**
 * Hard ceiling on one bulk assign (#927).
 *
 * It is the roster cap (`listClientsForRoster` reads at most 50 clients), and it is also
 * the read budget: the bulk action reads every target client's phases before it writes, so
 * an unbounded list would turn one click into an unbounded serverless fan-out.
 */
export const MAX_BULK_ASSIGN_CLIENTS = 50;

/**
 * What the "asignar a varios clientes" dialog submits (#927): the SAME plan body as a
 * single assign, addressed to a list of clients instead of one.
 *
 * `clientIds` is validated for duplicates because the same uid twice would assign a phase
 * and then immediately trim it with its own twin — the client would end up with the plan
 * they were promised soft-deleted, and nothing would have failed.
 */
export const nutritionBulkAssignSchema = nutritionPlanBodySchema
  .extend({
    clientIds: z
      .array(z.string().trim().min(1))
      .min(1, "Elegí al menos un cliente")
      .max(MAX_BULK_ASSIGN_CLIENTS),
  })
  .superRefine((value, ctx) => {
    refineNutritionPlanBody(value, ctx);
    if (new Set(value.clientIds).size !== value.clientIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["clientIds"],
        message: "Un cliente no puede estar dos veces en la misma asignación",
      });
    }
  });

export type NutritionBulkAssignInput = z.input<typeof nutritionBulkAssignSchema>;
export type NutritionBulkAssignValues = z.output<typeof nutritionBulkAssignSchema>;

/** The subset the coach may edit on an EXISTING phase — see `nutrition-actions`. */
export const nutritionPlanEditSchema = nutritionPlanFormSchema;

// ── The phase strip ─────────────────────────────────────────────────────────────────

export type NutritionPhaseState = "past" | "current" | "scheduled";

export interface NutritionPhase {
  plan: NutritionPlan;
  state: NutritionPhaseState;
  /** True when this is the plan the client's app is reading today. */
  isActive: boolean;
}

/**
 * Classifies every plan into the strip the coach sees: pasada / vigente / programada.
 *
 * `current` is decided by the SAME resolver the apps use, not by a second date comparison
 * written here — otherwise the strip could highlight one phase while the client's phone
 * reads another, and neither would be wrong on its own terms. Everything before the
 * current one is `past`; everything after is `scheduled`.
 *
 * Soft-deleted plans are dropped: a superseded phase is history the client never lived.
 *
 * @param todayCivil today in the CLIENT's timezone. The coach may be in another zone, and
 *   the phase boundary belongs to whoever is eating.
 */
export function buildNutritionPhaseStrip(
  plans: NutritionPlan[],
  todayCivil: string,
): NutritionPhase[] {
  const visible = plans
    .filter((plan) => plan.deleted !== true)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  const active = activeNutritionPlan(visible, todayCivil);

  return visible.map((plan) => {
    const isActive = !!active && plan.id === active.id;
    let state: NutritionPhaseState;
    if (isActive) {
      state = "current";
    } else if (plan.endsOn !== null && plan.endsOn !== undefined && plan.endsOn < todayCivil) {
      state = "past";
    } else if (plan.startsOn > todayCivil) {
      state = "scheduled";
    } else {
      // Started, not finished, and not the active one — only reachable when two phases
      // overlap, i.e. corrupt data. Reading it as `past` matches what the client sees:
      // the resolver already handed the day to somebody else.
      state = "past";
    }
    return { plan, state, isActive };
  });
}

/**
 * The default `startsOn` the assign form opens with: today in the client's timezone.
 *
 * Explicitly NOT `new Date().toISOString().slice(0, 10)` — that is UTC, and a coach in
 * Buenos Aires assigning at 21:30 would default the phase to start tomorrow.
 */
export function defaultNutritionStartsOn(
  clientTimezone: string,
  now: Date = new Date(),
): string {
  return civilDateToday(clientTimezone, now);
}

// ── The overlap warning ─────────────────────────────────────────────────────────────

export interface NutritionOverlapNotice {
  planId: string;
  planName: string;
  kind: "trim" | "supersede" | "deferStart";
  /** The date the affected phase ends up starting or ending on. */
  date: string | null;
}

/**
 * Turns the planner's edits into the notices the assign screen shows BEFORE saving.
 *
 * The warning and the save read the same computation on purpose: a separately-written
 * sentence ("el plan vigente se recorta al 31 de agosto") drifts the first time the rules
 * change, and then the screen promises one thing while the write does another.
 */
export function describeNutritionOverlap(
  edits: Array<{ planId: string; action: { kind: string; endsOn?: string; startsOn?: string } }>,
  plans: NutritionPlan[],
  locale: "en" | "es" = "es",
): NutritionOverlapNotice[] {
  const byId = new Map(plans.map((plan) => [plan.id ?? "", plan]));
  return edits.map((edit) => {
    const plan = byId.get(edit.planId);
    const planName = plan ? plan.name[locale] || plan.name.en : edit.planId;
    if (edit.action.kind === "trim") {
      return { planId: edit.planId, planName, kind: "trim", date: edit.action.endsOn ?? null };
    }
    if (edit.action.kind === "deferStart") {
      return {
        planId: edit.planId,
        planName,
        kind: "deferStart",
        date: edit.action.startsOn ?? null,
      };
    }
    return { planId: edit.planId, planName, kind: "supersede", date: null };
  });
}
