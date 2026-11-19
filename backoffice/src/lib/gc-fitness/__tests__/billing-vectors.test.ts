// billing-vectors.test.ts — gc-fitness #1644. EVERY case of the ONE billing table
// (`twin-vectors/billing-vectors.json`, pinned copy of gc-fitness `twin-vectors/`) through
// billing.ts. The same file drives Swift `BillingVectorTests`, Kotlin `BillingVectorTest` and
// functions `billingVectors.test.ts` — «la misma tabla de casos» is one table, not four.

import {
  addMonths,
  applyPayment,
  consumeClass,
  defaultCovers,
  formatBillingAmount,
  noticeDueDate,
  recordEffect,
  reminderText,
  revertPayment,
  status,
  voidEffect,
  type BillingLike,
  type BillingPlanSnapshot,
  type BillingWithLastPayment,
  type PaymentCovers,
} from "../billing";
import vectors from "./twin-vectors/billing-vectors.json";

type Billing = BillingWithLastPayment & { coachId: string; clientId: string };
interface Vectors {
  addMonths: { name: string; civil: string; months: number; expected: string }[];
  status: { name: string; billing: Billing | null; today: string; expected: { state: string; days: number } }[];
  applyPayment: { name: string; billing: Billing; covers: PaymentCovers; paidCivil: string; expected: unknown }[];
  revertPayment: { name: string; billing: Billing; covers: PaymentCovers; expected: unknown }[];
  consumeClass: { name: string; classesRemaining: number | null; expected: number }[];
  defaultCovers: { name: string; plan: BillingPlanSnapshot | null; expected: PaymentCovers }[];
  recordEffect: {
    name: string;
    billing: Billing | null;
    covers: PaymentCovers;
    paidCivil: string;
    amount: number;
    expected: unknown;
  }[];
  voidEffect: {
    name: string;
    billing: Billing;
    covers: PaymentCovers | null;
    previous: { paidCivil: string; amount: number } | null;
    expected: unknown;
  }[];
  reminderText: {
    name: string;
    lang: "es" | "en";
    coachName: string;
    clientFirstName: string;
    amount: number;
    currency: string;
    dueCivil: string | null;
    paymentDetails: string | null;
    expected: string;
  }[];
  noticeDueDate: { name: string; lang: "es" | "en"; civil: string; expected: string | null }[];
}

const v = vectors as unknown as Vectors;
const named = <T extends { name: string }>(cases: T[]) => cases.map((c) => [c.name, c] as const);

describe("billing twin vectors (#1644)", () => {
  it("has the minimum case counts", () => {
    expect(v.addMonths.length).toBeGreaterThanOrEqual(10);
    expect(v.status.length).toBeGreaterThanOrEqual(18);
    expect(v.applyPayment.length).toBeGreaterThanOrEqual(10);
    expect(v.recordEffect.length).toBeGreaterThanOrEqual(7);
  });

  test.each(named(v.addMonths))("addMonths: %s", (_n, c) => {
    expect(addMonths(c.civil, c.months)).toBe(c.expected);
  });

  test.each(named(v.status))("status: %s", (_n, c) => {
    expect(status(c.billing as BillingLike | null, c.today)).toEqual(c.expected);
  });

  test.each(named(v.applyPayment))("applyPayment: %s", (_n, c) => {
    expect(applyPayment(c.billing, c.covers, c.paidCivil)).toEqual(c.expected);
  });

  test.each(named(v.revertPayment))("revertPayment: %s", (_n, c) => {
    expect(revertPayment(c.billing, c.covers)).toEqual(c.expected);
  });

  test.each(named(v.consumeClass))("consumeClass: %s", (_n, c) => {
    expect(consumeClass({ classesRemaining: c.classesRemaining })).toBe(c.expected);
  });

  test.each(named(v.defaultCovers))("defaultCovers: %s", (_n, c) => {
    expect(defaultCovers(c.plan)).toEqual(c.expected);
  });

  test.each(named(v.recordEffect))("recordEffect: %s", (_n, c) => {
    expect(recordEffect(c.billing, c.covers, c.paidCivil, c.amount)).toEqual(c.expected);
  });

  test.each(named(v.voidEffect))("voidEffect: %s", (_n, c) => {
    expect(voidEffect(c.billing, c.covers, c.previous)).toEqual(c.expected);
  });

  // #1697 — the words are the table's; `{money}` is this platform's own formatter.
  test.each(named(v.reminderText))("reminderText: %s", (_n, c) => {
    const money = formatBillingAmount(c.lang, c.amount, c.currency);
    expect(
      reminderText(c.lang, c.coachName, c.clientFirstName, c.amount, c.currency, c.dueCivil, c.paymentDetails),
    ).toBe(c.expected.replace("{money}", money));
  });

  test.each(named(v.noticeDueDate))("noticeDueDate: %s", (_n, c) => {
    expect(noticeDueDate(c.civil, c.lang)).toBe(c.expected);
  });
});
