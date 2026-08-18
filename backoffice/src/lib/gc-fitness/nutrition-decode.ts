// nutrition-decode.ts
// Forgiving decoders for the nutrition wire shapes, shared by every server surface that
// reads `/nutrition_plans` (#913, extracted in #927 when the bulk-assign action needed the
// same decode as the single one).
//
// NO `"use server"` — pure and synchronous, so Jest exercises it directly and both action
// files import it. A synchronous export inside a server-action file passes the whole suite
// and dies in `next build`, which is what auto-deploys (#785).
//
// "Forgiving" is a deliberate contract, not laziness: ONE malformed document must not
// blank a coach's whole phase strip. A doc that cannot be decoded is skipped, and the rest
// of the screen still answers the question.

import type { NutritionPlan } from "./nutrition-schema";

/** Drops anything that is not a finite number, so a stray string never lands as a target. */
export function normalizeNutritionTargets(
  targets: Record<string, unknown>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of ["kcal", "proteinG", "carbsG", "fatG"] as const) {
    const value = targets[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Forgiving decode. A malformed plan is SKIPPED rather than thrown on: one bad doc must
 * not blank the whole phase strip, and the coach can still see (and fix) the rest.
 */
export function decodeNutritionPlan(id: string, raw: unknown): NutritionPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const clientId = typeof data.clientId === "string" ? data.clientId : null;
  const trainerId = typeof data.trainerId === "string" ? data.trainerId : null;
  const startsOn = typeof data.startsOn === "string" ? data.startsOn : null;
  if (!clientId || !trainerId || !startsOn) return null;

  const name =
    data.name && typeof data.name === "object"
      ? (data.name as { en?: unknown; es?: unknown })
      : {};

  return {
    id,
    clientId,
    trainerId,
    source: data.source === "self" ? "self" : "coach",
    name: {
      en: typeof name.en === "string" ? name.en : "",
      es: typeof name.es === "string" ? name.es : "",
    },
    templateId: typeof data.templateId === "string" ? data.templateId : null,
    startsOn,
    // `?? null` and NOT `|| null`: the key may legitimately hold null, and conflating
    // "absent" with "open-ended" is the bug class this whole feature is written around.
    endsOn: typeof data.endsOn === "string" ? data.endsOn : null,
    targets: (data.targets ?? {}) as NutritionPlan["targets"],
    meals: Array.isArray(data.meals) ? (data.meals as NutritionPlan["meals"]) : [],
    reminders: (data.reminders ?? null) as NutritionPlan["reminders"],
    deleted: data.deleted === true,
  };
}
