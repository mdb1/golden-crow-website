/** @jest-environment node */
// website#520 — the client's own goals (gc-fitness#1620) show in the coach's ficha, read-only,
// with the apps' coach-mode label «Lo definió tu cliente» / "Set by your client".

import { isValidElement, type ReactNode } from "react";

import { FakeFirestore } from "@/lib/test-utils/fake-firestore-c";
import type { ClientGoalRow } from "@/lib/gc-fitness/client-goal-actions";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
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

const C = "client-1";

/** Every `<li>` whose text contains `title`, flattened to its text. */
function itemText(node: ReactNode, title: string): string | null {
  const text = (n: ReactNode): string => {
    if (typeof n === "string" || typeof n === "number") return String(n);
    if (Array.isArray(n)) return n.map(text).join("");
    if (!isValidElement(n)) return "";
    return text((n.props as { children?: ReactNode }).children);
  };
  const walk = (n: ReactNode): string | null => {
    if (Array.isArray(n)) {
      for (const child of n) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    }
    if (!isValidElement(n)) return null;
    if (n.type === "li" && text(n).includes(title)) return text(n);
    return walk((n.props as { children?: ReactNode }).children);
  };
  return walk(node);
}

function goal(over: Partial<ClientGoalRow>): ClientGoalRow {
  return {
    id: "g",
    clientId: C,
    coachId: "coach-A",
    horizon: "short",
    title: "Goal",
    description: null,
    targetDate: null,
    status: "active",
    createdAt: null,
    updatedAt: null,
    clientOwned: false,
    ...over,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-11-17T12:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
  mockDb.current = new FakeFirestore();
});
afterEach(() => jest.useRealTimers());

describe("ClientSummaryCard — client-owned goals (website#520)", () => {
  it("labels the client's own goal and only that one", async () => {
    const tree = await ClientSummaryCard({
      clientId: C,
      clientName: "Ana",
      coachId: "coach-A",
      timezone: "UTC",
      goals: [
        goal({ id: "mine", title: "Correr 10k" }),
        goal({ id: "own", title: "Bajar a 70 kg", coachId: C, clientOwned: true }),
      ],
    });
    expect(itemText(tree, "Bajar a 70 kg")).toContain("clients.detail.goals.byClient");
    expect(itemText(tree, "Correr 10k")).not.toContain("clients.detail.goals.byClient");
  });
});
