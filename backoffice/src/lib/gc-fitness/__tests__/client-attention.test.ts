// __tests__/client-attention.test.ts
//
// #499 — the «needs attention» reasons. The bulk of the cases live in the
// SHARED table `__fixtures__/client-attention-cases.json`, which the apps'
// callable (gc-fitness `functions/src/coach/coachAttention.ts`) mirrors: a
// case changed here must change there.

import {
  ATTENTION_REASONS,
  ATTENTION_RULES,
  attentionRank,
  clientNeedsAttention,
  NEEDS_ATTENTION_INACTIVITY_HOURS,
  type ClientAttentionInput,
} from "../client-attention";
import { NUTRITION_ATTENTION_RATIO } from "../nutrition-coach-reply";
import table from "../__fixtures__/client-attention-cases.json";

interface Case {
  name: string;
  input: Omit<ClientAttentionInput, "nowMs">;
  expected: string[];
}

describe("clientNeedsAttention — shared case table", () => {
  it.each((table.cases as Case[]).map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const r = clientNeedsAttention({ ...c.input, nowMs: table.nowMs });
    expect(r.reasons).toEqual(c.expected);
    expect(r.needsAttention).toBe(c.expected.length > 0);
  });
});

describe("the reason table", () => {
  it("keeps the inactivity threshold the dashboard tile uses", () => {
    expect(NEEDS_ATTENTION_INACTIVITY_HOURS).toBe(72);
  });

  it("uses the same nutrition bar as the client's nutrition screen", () => {
    expect(ATTENTION_RULES.lowNutrition.ratio).toBe(NUTRITION_ATTENTION_RATIO);
  });

  it("has unique ranks and lists the reasons by rank", () => {
    const ranks = ATTENTION_REASONS.map((r) => ATTENTION_RULES[r].rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(ATTENTION_REASONS[0]).toBe("inactive");
  });

  it("matches the 4-day window of the dashboard's «nothing assigned» card", () => {
    expect(ATTENTION_RULES.nothingAssigned.windowDays).toBe(4);
  });
});

describe("attentionRank", () => {
  it("is the most urgent reason's rank", () => {
    expect(attentionRank(["unreadChat", "overduePayment"])).toBe(ATTENTION_RULES.overduePayment.rank);
  });

  it("puts a client with nothing wrong last", () => {
    expect(attentionRank([])).toBe(Number.POSITIVE_INFINITY);
  });
});
