// billing-ai-vectors.test.ts — gc-fitness #1696. EVERY case of `twin-vectors/billing-ai-vectors.json`
// (pinned copy of gc-fitness `twin-vectors/`) through billing-ai.ts: the payload sent to
// `analyzeCoachBilling`, the card's stat values, the monthly quota, card decoding and the error
// mapping. Same table as Swift `CoachBillingAIVectorTests` and Kotlin `CoachBillingAIVectorTest`.
// `payload[i].dashboard` indexes billing-dashboard-vectors.json `dashboard[i]`, computed here with
// the TS engine (so a drift in EITHER engine is red).

import type { PaymentCovers } from "../billing";
import {
  billingAIErrorKind,
  billingAIPayload,
  billingAIQuota,
  decodeBillingCard,
  statValue,
} from "../billing-ai";
import { computeBillingDashboard, type DashboardBilling, type DashboardPayment } from "../billing-dashboard";
import aiVectors from "./twin-vectors/billing-ai-vectors.json";
import dashboardVectors from "./twin-vectors/billing-dashboard-vectors.json";

interface VPayment {
  id: string;
  clientId: string;
  amount: number;
  currency: string;
  paidCivil: string;
  method: string;
  covers: PaymentCovers;
  planName: string | null;
  voided: boolean;
}

interface AIVectors {
  payload: { dashboard: number; name: string; payload: unknown; stats: Record<string, Record<string, unknown>> }[];
  quota: { usage: unknown; month: string; expected: { analysis: number; card: number } }[];
  decodeCard: { raw: unknown; valid: boolean; stats?: string[] }[];
  errorKind: { code: string | null; reason: string | null; expected: string }[];
}

const ai = aiVectors as unknown as AIVectors;
const scenarios = (dashboardVectors as unknown as {
  dashboard: { today: string; payments: VPayment[]; billings: DashboardBilling[] }[];
}).dashboard;

const dashboards = scenarios.map((s) =>
  computeBillingDashboard(
    s.payments.map(
      (p): DashboardPayment => ({
        id: p.id,
        clientId: p.clientId,
        amount: p.amount,
        currency: p.currency,
        paidCivil: p.paidCivil,
        method: p.method,
        covers: p.covers,
        planName: p.planName,
        voidedAt: p.voided ? "1970-01-01T00:00:00.000Z" : null,
      }),
    ),
    s.billings,
    s.today,
  ),
);

function same(a: unknown, b: unknown, path: string): void {
  if (typeof b === "number") {
    if (typeof a !== "number" || Math.abs(a - b) >= (path.endsWith("churnRate") ? 1e-9 : 0.005)) {
      throw new Error(`${path}: expected ${b}, got ${JSON.stringify(a)}`);
    }
    return;
  }
  if (b === null || typeof b !== "object") {
    if (a !== b) throw new Error(`${path}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    return;
  }
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) throw new Error(`${path}: expected ${b.length} items, got ${JSON.stringify(a)}`);
    b.forEach((x, i) => same(a[i], x, `${path}[${i}]`));
    return;
  }
  const x = (a ?? {}) as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  expect(Object.keys(x).sort()).toEqual(Object.keys(y).sort());
  for (const k of Object.keys(y)) same(x[k], y[k], `${path}.${k}`);
}

describe("billing AI twin vectors (#1696)", () => {
  it("covers every #1695 scenario", () => {
    expect(ai.payload.length).toBe(dashboards.length);
  });

  test.each(ai.payload.map((c) => [c.name, c] as const))("payload + stats: %s", (_n, c) => {
    const d = dashboards[c.dashboard];
    // Round-trip through JSON: what actually crosses to the callable.
    same(JSON.parse(JSON.stringify(billingAIPayload(d))), c.payload, "payload");
    for (const [key, expected] of Object.entries(c.stats)) {
      same(statValue(key, d), expected, `stats.${key}`);
    }
  });

  test.each(ai.quota.map((c, i) => [i, c] as const))("quota #%s", (_i, c) => {
    const q = billingAIQuota(c.usage, c.month);
    expect({ analysis: q.analysis.used, card: q.card.used }).toEqual(c.expected);
    expect(q.analysis.remaining).toBe(Math.max(0, 5 - c.expected.analysis));
  });

  test.each(ai.decodeCard.map((c, i) => [i, c] as const))("decodeCard #%s", (_i, c) => {
    const card = decodeBillingCard(c.raw);
    expect(card !== null).toBe(c.valid);
    if (card && c.stats) expect(card.stats).toEqual(c.stats);
  });

  test.each(ai.errorKind.map((c) => [`${c.code} / ${c.reason}`, c] as const))("errorKind %s", (_n, c) => {
    expect(billingAIErrorKind(c.code, c.reason === null ? undefined : { reason: c.reason })).toBe(c.expected);
  });
});
