// nutrition-vectors.test.ts — gc-fitness #1644. Three shared tables, pinned copies of gc-fitness
// `twin-vectors/`, through the backoffice twins:
//   * `nutrition-plan-resolution-vectors.json` — `nutritionPlansOverlapping` and the assign-time
//     planner `nutritionPlanOverlapEdits` (Swift + Kotlin run it too);
//   * `nutrition-ai-vectors.json` → `activePlan` — `activeNutritionPlan` (Swift, Kotlin and
//     functions run it too);
//   * `nutrition-coach.json` — `buildNutritionWeekGrid` / `collectNutritionNotes`; GENERATED from
//     this code (#1246) and run by the apps, but never by this suite until #1644.
// Plans go through `decodeNutritionPlan`, the same reader the coach screens use, the way the apps
// decode them with Codable / fromMap.

import { decodeNutritionPlan } from "../nutrition-decode";
import { buildNutritionWeekGrid, collectNutritionNotes } from "../nutrition-compliance";
import {
  activeNutritionPlan,
  nutritionPlanOverlapEdits,
  nutritionPlansOverlapping,
} from "../nutrition-plan-resolution";
import type { NutritionLog, NutritionPlan } from "../nutrition-schema";
import aiVectors from "./twin-vectors/nutrition-ai-vectors.json";
import coachVectors from "./twin-vectors/nutrition-coach.json";
import resolutionVectors from "./twin-vectors/nutrition-plan-resolution-vectors.json";

type Raw = Record<string, unknown>;
const plans = (raw: Raw[]): NutritionPlan[] =>
  raw.map((p) => {
    const plan = decodeNutritionPlan((p.id as string | null) ?? "", p);
    if (!plan) throw new Error(`plan ${String(p.id)} failed to decode`);
    // A plan without an id stays without one (the planner must skip it).
    return p.id == null ? { ...plan, id: undefined as unknown as string } : plan;
  });
const named = <T extends { name: string }>(cases: T[]) => cases.map((c) => [c.name, c] as const);

const resolution = resolutionVectors as unknown as {
  overlapping: { name: string; plans: Raw[]; start: string; end: string; expectedIds: string[] }[];
  overlapEdits: { name: string; existing: Raw[]; newStartsOn: string; newEndsOn: string | null; expected: unknown[] }[];
};
const ai = aiVectors as unknown as { activePlan: { name: string; date: string; plans: Raw[]; expectedId: string | null }[] };
const coach = coachVectors as unknown as {
  gridCases: { name: string; plans: Raw[]; logs: NutritionLog[]; anchor: string; today: string; expected: unknown }[];
  noteCases: { name: string; logs: NutritionLog[]; limit?: number; expected: unknown }[];
};

describe("nutrition-plan resolution twin vectors (#1644)", () => {
  test.each(named(resolution.overlapping))("overlapping: %s", (_n, c) => {
    expect(nutritionPlansOverlapping(plans(c.plans), c.start, c.end).map((p) => p.id)).toEqual(c.expectedIds);
  });

  test.each(named(resolution.overlapEdits))("overlapEdits: %s", (_n, c) => {
    expect(nutritionPlanOverlapEdits(plans(c.existing), c.newStartsOn, c.newEndsOn)).toEqual(c.expected);
  });

  test.each(named(ai.activePlan))("activePlan: %s", (_n, c) => {
    expect(activeNutritionPlan(plans(c.plans), c.date)?.id ?? null).toBe(c.expectedId);
  });
});

describe("coach nutrition twin vector (#1246, consumed here since #1644)", () => {
  test.each(named(coach.gridCases))("grid: %s", (_n, c) => {
    // The vector pins the fields every twin shares; the web grid carries a few more
    // (`expected`, `ratio`), so this is a subset match — every listed field must agree.
    expect(buildNutritionWeekGrid(plans(c.plans), c.logs, c.anchor, c.today)).toMatchObject(c.expected as object);
  });

  test.each(named(coach.noteCases))("notes: %s", (_n, c) => {
    expect(collectNutritionNotes(c.logs, c.limit)).toEqual(c.expected);
  });
});
