// billing-dashboard-vectors.test.ts — gc-fitness #1695. EVERY case of the ONE billing-dashboard
// table (`twin-vectors/billing-dashboard-vectors.json`, pinned copy of gc-fitness `twin-vectors/`)
// through billing-dashboard.ts (+ the CSV through payments-model's `buildPaymentsCsv` / `csvCell`,
// which is the TS twin of the apps' `BillingExport`). The same file drives Swift
// `BillingDashboardVectorTests` and Kotlin `BillingDashboardVectorTest`.
// Money compares with |a−b| < 0.005, rates with 1e−9 (the file's own `_comment`).

import type { PaymentCovers, PaymentMethod } from "../billing";
import {
  addDaysCivil,
  billingPlanOptions,
  computeBillingDashboard,
  coverEnd,
  DASHBOARD_CHURN_WINDOW_MONTHS,
  DASHBOARD_GRACE_DAYS,
  DASHBOARD_HORIZONS,
  DASHBOARD_LOOKBACK_MONTHS,
  DASHBOARD_SERIES_MONTHS,
  filterBillingPayments,
  loadFromCivil,
  project,
  seriesMonths,
  type DashboardBilling,
  type DashboardPayment,
} from "../billing-dashboard";
import { buildPaymentsCsv, csvCell, type ClientPaymentView } from "../payments-model";
import vectors from "./twin-vectors/billing-dashboard-vectors.json";

interface VPayment {
  id: string;
  clientId: string;
  amount: number;
  currency: string;
  paidCivil: string;
  method: string;
  methodNote: string | null;
  covers: PaymentCovers;
  planName: string | null;
  note: string | null;
  voided: boolean;
}

interface Vectors {
  constants: { graceDays: number; seriesMonths: number; lookbackMonths: number; churnWindowMonths: number; horizons: number[] };
  addDays: { civil: string; days: number; expected: string }[];
  loadFrom: { today: string; expected: string }[];
  seriesMonths: { today: string; expected: string[] }[];
  coverEnd: { payment: VPayment; expected: string }[];
  project: { mrr: number; rate: number; months: number; expected: number }[];
  dashboard: { name: string; today: string; payments: VPayment[]; billings: DashboardBilling[]; expected: unknown }[];
  export: {
    csvCell: { value: string | number | null; expected: string }[];
    payments: VPayment[];
    filter: { filter: Record<string, string>; expectedIds: string[] }[];
    planOptions: string[];
    csv: { headers: string[]; clientNames: Record<string, string>; voidedLabel: string; ids: string[]; expected: string };
  };
}

const v = vectors as unknown as Vectors;

function toPayment(p: VPayment): DashboardPayment & ClientPaymentView {
  return {
    id: p.id,
    clientId: p.clientId,
    amount: p.amount,
    currency: p.currency,
    paidCivil: p.paidCivil,
    method: p.method as PaymentMethod,
    methodNote: p.methodNote,
    covers: p.covers,
    planName: p.planName,
    note: p.note,
    createdAt: null,
    voidedAt: p.voided ? "2026-01-01T00:00:00.000Z" : null,
    voidReason: null,
  };
}

/** Deep comparison: numbers with a tolerance (money 0.005, everything else exact for ints). */
function expectClose(actual: unknown, expected: unknown, path = "$"): void {
  if (typeof expected === "number") {
    expect(typeof actual).toBe("number");
    const tol = path.endsWith("churnRate") || path.includes(".rates.") ? 1e-9 : 0.005;
    if (Math.abs((actual as number) - expected) >= tol) {
      throw new Error(`${path}: expected ${expected}, got ${actual}`);
    }
    return;
  }
  if (expected === null || typeof expected !== "object") {
    if (actual !== expected) throw new Error(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`${path}: expected array of ${expected.length}, got ${JSON.stringify(actual)}`);
    }
    expected.forEach((e, i) => expectClose(actual[i], e, `${path}[${i}]`));
    return;
  }
  const a = actual as Record<string, unknown>;
  const e = expected as Record<string, unknown>;
  expect(Object.keys(a ?? {}).sort()).toEqual(Object.keys(e).sort());
  for (const k of Object.keys(e)) expectClose(a[k], e[k], `${path}.${k}`);
}

function coversLabel(c: PaymentCovers | null): string {
  const covers = c ?? { kind: "other", months: null, classes: null };
  const n = covers.kind === "months" ? covers.months : covers.kind === "classes" ? covers.classes : null;
  return covers.kind + (n == null ? "" : ` x${n}`);
}

describe("billing dashboard twin vectors (#1695)", () => {
  it("shares the constants", () => {
    expect(v.constants).toEqual({
      graceDays: DASHBOARD_GRACE_DAYS,
      seriesMonths: DASHBOARD_SERIES_MONTHS,
      lookbackMonths: DASHBOARD_LOOKBACK_MONTHS,
      churnWindowMonths: DASHBOARD_CHURN_WINDOW_MONTHS,
      horizons: [...DASHBOARD_HORIZONS],
    });
  });

  it("has every section", () => {
    expect(v.dashboard.length).toBeGreaterThanOrEqual(5);
    expect(v.export.csvCell.length).toBeGreaterThanOrEqual(10);
  });

  test.each(v.addDays.map((c) => [`${c.civil} + ${c.days}`, c] as const))("addDays: %s", (_n, c) => {
    expect(addDaysCivil(c.civil, c.days)).toBe(c.expected);
  });

  test.each(v.loadFrom.map((c) => [c.today, c] as const))("loadFrom: %s", (_n, c) => {
    expect(loadFromCivil(c.today)).toBe(c.expected);
  });

  test.each(v.seriesMonths.map((c) => [c.today, c] as const))("seriesMonths: %s", (_n, c) => {
    expect(seriesMonths(c.today)).toEqual(c.expected);
  });

  test.each(v.coverEnd.map((c) => [`${c.payment.paidCivil} ${JSON.stringify(c.payment.covers)}`, c] as const))(
    "coverEnd: %s",
    (_n, c) => {
      expect(coverEnd(toPayment(c.payment))).toBe(c.expected);
    },
  );

  test.each(v.project.map((c) => [`${c.mrr} @ ${c.rate} × ${c.months}`, c] as const))("project: %s", (_n, c) => {
    expect(Math.abs(project(c.mrr, c.rate, c.months) - c.expected)).toBeLessThan(0.005);
  });

  test.each(v.dashboard.map((c) => [c.name, c] as const))("dashboard: %s", (_n, c) => {
    const result = computeBillingDashboard(c.payments.map(toPayment), c.billings, c.today);
    expectClose(result, c.expected);
  });

  test.each(v.export.csvCell.map((c) => [JSON.stringify(c.value), c] as const))("csvCell: %s", (_n, c) => {
    expect(csvCell(c.value)).toBe(c.expected);
  });

  test.each(v.export.filter.map((c) => [JSON.stringify(c.filter), c] as const))("filter: %s", (_n, c) => {
    const ids = filterBillingPayments(v.export.payments.map(toPayment), c.filter).map((p) => p.id);
    expect(ids).toEqual(c.expectedIds);
  });

  it("planOptions", () => {
    expect(billingPlanOptions(v.export.payments.map(toPayment))).toEqual(v.export.planOptions);
  });

  it("csv", () => {
    const { csv } = v.export;
    const rows = filterBillingPayments(v.export.payments.map(toPayment), {});
    expect(rows.map((p) => p.id)).toEqual(csv.ids);
    const out = buildPaymentsCsv(rows, {
      headers: csv.headers as Parameters<typeof buildPaymentsCsv>[1]["headers"],
      clientName: (id) => csv.clientNames[id] ?? id,
      method: (m) => m,
      covers: coversLabel,
      voided: csv.voidedLabel,
    });
    expect(out).toBe(csv.expected);
  });
});
