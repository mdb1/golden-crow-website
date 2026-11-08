/** @jest-environment node */
// gc-fitness#1504 (D2) — the new coach's ficha. The card used to fetch "the 80 oldest
// assignments", so a client who inherited hundreds of past workouts showed only the
// former coach's overdue work, and a streak that never reached anything recent.

import { isValidElement, type ReactElement, type ReactNode } from "react";

import { FakeFirestore } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values && "count" in values ? `${key}:${values.count}` : key;
    return t;
  },
}));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
jest.mock("@/lib/gc-fitness/nutrition-roster", () => ({
  loadNutritionRosterSummaries: async () => new Map(),
}));
jest.mock("../ClientSummaryLists", () => ({ ClientSummaryLists: () => null }));
jest.mock("../InheritedPlanPanel", () => ({ InheritedPlanPanel: () => null }));
jest.mock("@/components/ui/badge", () => ({ Badge: () => null }));

import { ClientSummaryCard } from "../ClientSummaryCard";
import { ClientSummaryLists } from "../ClientSummaryLists";
import { InheritedPlanPanel } from "../InheritedPlanPanel";

const TODAY = "2026-11-05";
const NEW = "coach-new";
const C = "client-swapped";

function civilDaysBefore(n: number): string {
  return new Date(Date.UTC(2026, 10, 5) - n * 86_400_000).toISOString().slice(0, 10);
}

function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<Record<string, unknown>>;
  return findElement((node.props as { children?: ReactNode }).children, type);
}

function findText(node: ReactNode, pattern: RegExp): boolean {
  if (typeof node === "string") return pattern.test(node);
  if (Array.isArray(node)) return node.some((child) => findText(child, pattern));
  if (!isValidElement(node)) return false;
  return findText((node.props as { children?: ReactNode }).children, pattern);
}

const render = () =>
  ClientSummaryCard({ clientId: C, clientName: "Swapped", coachId: NEW, timezone: "UTC", goals: [] });

let db: FakeFirestore;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(`${TODAY}T12:00:00Z`), doNotFake: ["nextTick", "setImmediate"] });
  db = new FakeFirestore();
  mockDb.current = db;
  // 334 overdue workouts from the former coach, like the production case in the issue.
  for (let i = 30; i < 364; i += 1) {
    db.seed(`workout_assignments/old-${i}`, {
      clientId: C, trainerId: "coach-old", status: "scheduled", scheduledFor: civilDaysBefore(i),
      templateSnapshot: { name: "Old plan" },
    });
  }
});

afterEach(() => jest.useRealTimers());

describe("ClientSummaryCard after a coach swap", () => {
  it("lists only this coach's work, and offers to end the inherited plan", async () => {
    db.seed("workout_assignments/old-future", {
      clientId: C, trainerId: "coach-old", status: "scheduled", scheduledFor: "2026-11-10",
      templateSnapshot: { name: "Old plan" },
    });
    db.seed("workout_assignments/mine", {
      clientId: C, trainerId: NEW, status: "scheduled", scheduledFor: "2026-11-11",
      templateSnapshot: { name: "My plan" },
    });
    db.seed("habits/old", { clientId: C, trainerId: "coach-old", name: "Old habit", startsOn: "2026-01-01" });
    db.seed("habits/mine", { clientId: C, trainerId: NEW, name: "My habit", startsOn: "2026-01-01" });

    const tree = await render();
    const lists = findElement(tree, ClientSummaryLists)!.props as {
      workouts: Array<{ name: string }>;
      habits: Array<{ name: string }>;
    };
    expect(lists.workouts.map((w) => w.name)).toEqual(["My plan"]);
    expect(lists.habits.map((h) => h.name)).toEqual(["My habit"]);

    const panel = findElement(tree, InheritedPlanPanel)!.props;
    expect(panel).toMatchObject({ clientId: C, workouts: 1, habits: 1, plans: 0 });
  });

  it("the streak isn't broken by the inherited overdue, and isn't lost behind them", async () => {
    for (const [id, days] of [["m1", 1], ["m2", 2], ["m3", 3]] as const) {
      db.seed(`workout_assignments/${id}`, {
        clientId: C, trainerId: NEW, status: "completed", scheduledFor: civilDaysBefore(days),
        templateSnapshot: { name: "Mine" },
      });
    }
    // An inherited miss between two of mine, on the day it would have broken it.
    db.seed("workout_assignments/old-recent", {
      clientId: C, trainerId: "coach-old", status: "missed", scheduledFor: civilDaysBefore(2),
      templateSnapshot: { name: "Old plan" },
    });
    expect(findText(await render(), /workoutStreakLabel:3/)).toBe(true);
  });

  it("an inherited nutrition plan alone offers the exit (#1504 Q2)", async () => {
    db.seed("nutrition_plans/old", { clientId: C, trainerId: "coach-old", source: "coach", startsOn: "2026-01-01", endsOn: null });
    db.seed("nutrition_plans/mine", { clientId: C, trainerId: NEW, source: "coach", startsOn: "2026-01-01", endsOn: null });
    db.seed("nutrition_plans/own", { clientId: C, trainerId: C, source: "self", startsOn: "2026-01-01", endsOn: null });
    const panel = findElement(await render(), InheritedPlanPanel)!.props;
    expect(panel).toMatchObject({ clientId: C, workouts: 0, habits: 0, plans: 1 });
  });

  it("offers no exit when nothing inherited is live", async () => {
    db.seed("nutrition_plans/old-over", { clientId: C, trainerId: "coach-old", source: "coach", startsOn: "2026-01-01", endsOn: "2026-02-01" });
    expect(findElement(await render(), InheritedPlanPanel)).toBeNull();
  });
});
