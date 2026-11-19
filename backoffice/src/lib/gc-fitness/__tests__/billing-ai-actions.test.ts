// billing-ai-actions.test.ts — gc-fitness #1696, «Analizar facturación con IA» / «Imagen del mes».
//
// What is pinned (fetch is mocked — NEVER a real call to the callable or the model):
//   • run: POSTs to `analyzeCoachBilling` with the coach's own ID token and ONLY the aggregated
//     payload of the server-side dashboard (no client ids or names, no notes, no plan names);
//   • a callable error maps to a value (quota with the server's quota, unavailable, forbidden),
//     never a raw message, never a throw (#1104);
//   • state: reads THIS month's stored analysis/card + the usage doc (another month ⇒ 0 used).

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(),
  getCurrentTrainerIdToken: jest.fn(),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));
jest.mock("next-intl/server", () => ({ getLocale: jest.fn(async () => "es") }));
jest.mock("@/lib/gc-fitness/payments-actions", () => ({
  getCoachDisplayName: jest.fn(async () => "Ana Coach"),
}));
const mockDashboardData = jest.fn();
jest.mock("@/lib/gc-fitness/billing-dashboard-actions", () => ({
  getBillingDashboardData: () => mockDashboardData(),
}));

const docs = new Map<string, Record<string, unknown>>();
function docRef(path: string): unknown {
  return {
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data, get: (field: string) => data?.[field] };
    },
  };
}
function collectionRef(path: string) {
  return { doc: (id: string) => docRef(`${path}/${id}`) };
}
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: (name: string) => collectionRef(name) })),
}));

import type { PaymentCovers } from "@/lib/gc-fitness/billing";
import { getCurrentTrainer, getCurrentTrainerIdToken } from "@/lib/gc-fitness/auth-helpers";
import { billingAIPayload } from "@/lib/gc-fitness/billing-ai";
import { getBillingAIState, runBillingAI } from "@/lib/gc-fitness/billing-ai-actions";
import { computeBillingDashboard, type DashboardBilling, type DashboardPayment } from "@/lib/gc-fitness/billing-dashboard";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";

import vectors from "./twin-vectors/billing-dashboard-vectors.json";

const COACH = "coach-1";
const mockedTrainer = getCurrentTrainer as jest.MockedFunction<typeof getCurrentTrainer>;
const mockedIdToken = getCurrentTrainerIdToken as jest.MockedFunction<typeof getCurrentTrainerIdToken>;

const scenario = (vectors as unknown as {
  dashboard: {
    name: string;
    today: string;
    payments: Array<DashboardPayment & { voided: boolean; covers: PaymentCovers }>;
    billings: DashboardBilling[];
  }[];
}).dashboard.find((s) => s.name.startsWith("mezcla"))!;
const payments = scenario.payments.map((p) => ({ ...p, voidedAt: p.voided ? "2026-11-11T00:00:00.000Z" : null }));
const dashboard = computeBillingDashboard(payments, scenario.billings, scenario.today);

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const month = () => civilDateToday("UTC").slice(0, 7);
const quotaBody = (analysisUsed: number, cardUsed: number) => ({
  month: "2026-11",
  analysis: { limit: 5, used: analysisUsed, remaining: 5 - analysisUsed },
  card: { limit: 5, used: cardUsed, remaining: 5 - cardUsed },
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
}

beforeEach(() => {
  docs.clear();
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
  mockedTrainer.mockResolvedValue({ uid: COACH, email: "c@x.test", role: "trainer", isAdmin: false, roles: ["trainer"] });
  mockedIdToken.mockResolvedValue({ uid: COACH, idToken: "ID-TOKEN" });
  mockDashboardData.mockResolvedValue({
    ok: true,
    data: {
      todayCivil: scenario.today,
      dashboard,
      payments,
      clients: [{ id: "ana", name: "Ana Pérez" }],
      truncated: false,
    },
  });
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe("runBillingAI", () => {
  it("POSTs only the aggregated payload, with the coach's ID token", async () => {
    respond(200, {
      result: {
        kind: "analysis",
        month: "2026-11",
        locale: "es",
        analysis: { summary: "Vas mejor que octubre.", risks: ["3 vencidos"], actions: ["Cobrá a los vencidos"] },
        generatedAtISO: "2026-11-18T12:00:00.000Z",
        quota: quotaBody(1, 0),
      },
    });
    const r = await runBillingAI({ kind: "analysis" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us-central1-gcfitness-3476b.cloudfunctions.net/analyzeCoachBilling");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ID-TOKEN");
    const sent = JSON.parse(String(init.body)) as { data: Record<string, unknown> };
    expect(sent.data).toEqual({
      kind: "analysis",
      locale: "es",
      timezone: "UTC",
      metrics: JSON.parse(JSON.stringify(billingAIPayload(dashboard))),
    });
    // Nothing that identifies a client crosses: no ids, names, notes or plan names.
    for (const leak of ['"ana"', '"beto"', "Ana Pérez", "duplicado", "Mensual", "Pack 3", "clientId", "planName", "note"]) {
      expect(String(init.body)).not.toContain(leak);
    }

    expect(r).toEqual({
      ok: true,
      kind: "analysis",
      month: "2026-11",
      analysis: {
        summary: "Vas mejor que octubre.",
        risks: ["3 vencidos"],
        actions: ["Cobrá a los vencidos"],
        generatedAtISO: "2026-11-18T12:00:00.000Z",
      },
      card: null,
      quota: quotaBody(1, 0),
    });
  });

  it("decodes a card (exactly 3 known stat keys)", async () => {
    respond(200, {
      result: {
        kind: "card",
        month: "2026-11",
        card: { headline: "Mes firme", stats: ["collected", "mrr", "paying"], recommendation: "Cobrá los vencidos." },
        generatedAtISO: "2026-11-18T12:00:00.000Z",
        quota: quotaBody(0, 1),
      },
    });
    const r = await runBillingAI({ kind: "card" });
    expect(r.ok && r.card?.stats).toEqual(["collected", "mrr", "paying"]);
    expect(r.ok && r.analysis).toBeNull();
  });

  it("returns the quota with a resource-exhausted error", async () => {
    respond(429, { error: { status: "RESOURCE_EXHAUSTED", details: { reason: "quota", ...quotaBody(5, 2) } } });
    const r = await runBillingAI({ kind: "analysis" });
    expect(r).toEqual({ ok: false, error: "quota", quota: quotaBody(5, 2) });
  });

  it("maps upstream / timeout to unavailable and an unknown body to generic", async () => {
    respond(503, { error: { status: "UNAVAILABLE", details: { reason: "upstream" } } });
    expect(await runBillingAI({ kind: "card" })).toEqual({ ok: false, error: "unavailable" });
    respond(504, { error: { status: "DEADLINE_EXCEEDED", details: { reason: "timeout" } } });
    expect(await runBillingAI({ kind: "card" })).toEqual({ ok: false, error: "unavailable" });
    respond(500, { error: { status: "INTERNAL", details: { reason: "invalid_output" } } });
    expect(await runBillingAI({ kind: "card" })).toEqual({ ok: false, error: "generic" });
    respond(200, { result: { kind: "card", card: { headline: "x", stats: ["collected"], recommendation: "y" }, quota: quotaBody(0, 1) } });
    expect(await runBillingAI({ kind: "card" })).toEqual({ ok: false, error: "generic" });
  });

  it("refuses a non-trainer and an unknown kind without calling anything", async () => {
    mockedIdToken.mockRejectedValueOnce(new Error("Forbidden"));
    expect(await runBillingAI({ kind: "analysis" })).toEqual({ ok: false, error: "forbidden" });
    expect(await runBillingAI({ kind: "nope" as "analysis" })).toEqual({ ok: false, error: "generic" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the callable when the dashboard cannot be read", async () => {
    mockDashboardData.mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    expect(await runBillingAI({ kind: "analysis" })).toEqual({ ok: false, error: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getBillingAIState", () => {
  it("reads this month's stored analysis + card and the usage", async () => {
    docs.set(`coach_ai_billing/${COACH}`, { usage: { month: month(), analysis: 2, card: 5 } });
    docs.set(`coach_ai_billing/${COACH}/months/${month()}`, {
      analysis: { summary: "Resumen", risks: ["r"], actions: ["a"], generatedAt: "2026-11-02T10:00:00.000Z" },
      card: { headline: "Mes firme", stats: ["collected", "mrr", "paying"], recommendation: "Cobrá" },
    });
    const r = await getBillingAIState();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.month).toBe(month());
    expect(r.coachName).toBe("Ana Coach");
    expect(r.analysis?.summary).toBe("Resumen");
    expect(r.analysis?.generatedAtISO).toBe("2026-11-02T10:00:00.000Z");
    expect(r.card?.headline).toBe("Mes firme");
    expect(r.quota.analysis).toEqual({ limit: 5, used: 2, remaining: 3 });
    expect(r.quota.card).toEqual({ limit: 5, used: 5, remaining: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts every month at zero and with nothing stored", async () => {
    docs.set(`coach_ai_billing/${COACH}`, { usage: { month: "1999-01", analysis: 5, card: 5 } });
    const r = await getBillingAIState();
    expect(r.ok && r.quota.analysis.remaining).toBe(5);
    expect(r.ok && r.analysis).toBeNull();
    expect(r.ok && r.card).toBeNull();
  });

  it("returns forbidden for a non-trainer", async () => {
    mockedTrainer.mockRejectedValueOnce(new Error("Forbidden"));
    expect(await getBillingAIState()).toEqual({ ok: false, error: "forbidden" });
  });
});
