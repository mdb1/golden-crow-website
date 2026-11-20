// billing-payment-effect.test.ts — gc-fitness #1659. La tabla de casos GEMELA de
// `recordEffect` / `voidEffect`: mismos nombres y entradas que iOS
// `BillingPaymentEffectTests.swift` y Android `BillingPaymentEffectTest.kt`.

import {
  recordEffect,
  voidEffect,
  type BillingPlanSnapshot,
  type BillingWithLastPayment,
} from "../billing";

const monthlyPlan: BillingPlanSnapshot = {
  name: "Mensual",
  kind: "monthly",
  modality: null,
  amount: 25000,
  currency: "ARS",
  periodMonths: 1,
  classCount: null,
  description: null,
};

const packPlan: BillingPlanSnapshot = {
  ...monthlyPlan,
  name: "Pack",
  kind: "class_pack",
  amount: 40000,
  periodMonths: null,
  classCount: 8,
};

function billing(
  plan: BillingPlanSnapshot | null,
  over: Partial<BillingWithLastPayment> = {},
): BillingWithLastPayment {
  return {
    planId: plan ? "p" : null,
    plan,
    startCivil: null,
    nextDueCivil: null,
    classesRemaining: null,
    reminderDaysBefore: 3,
    lastPaymentCivil: null,
    lastPaymentAmount: null,
    ...over,
  };
}

const months1 = { kind: "months" as const, months: 1, classes: null };
const classes8 = { kind: "classes" as const, months: null, classes: 8 };

describe("recordEffect — casos gemelos (#1659)", () => {
  it("sin billing crea uno sin plan", () => {
    expect(recordEffect(null, months1, "2026-11-11", 100)).toEqual({
      nextDueCivil: null,
      classesRemaining: null,
      lastPaymentCivil: "2026-11-11",
      lastPaymentAmount: 100,
    });
  });

  it("sin plan no corre el vencimiento", () => {
    const b = billing(null, { lastPaymentCivil: "2026-10-01", lastPaymentAmount: 50 });
    expect(recordEffect(b, months1, "2026-11-11", 100)).toEqual({
      nextDueCivil: null,
      classesRemaining: null,
      lastPaymentCivil: "2026-11-11",
      lastPaymentAmount: 100,
    });
  });

  it("sin plan no suma clases", () => {
    expect(recordEffect(billing(null), classes8, "2026-11-11", 100).classesRemaining).toBeNull();
  });

  it("con plan mensual corre un mes", () => {
    expect(recordEffect(billing(monthlyPlan, { nextDueCivil: "2026-11-10" }), months1, "2026-11-11", 25000)).toEqual({
      nextDueCivil: "2026-12-10",
      classesRemaining: null,
      lastPaymentCivil: "2026-11-11",
      lastPaymentAmount: 25000,
    });
  });

  it("con pack suma clases", () => {
    expect(recordEffect(billing(packPlan, { classesRemaining: 1 }), classes8, "2026-11-11", 40000).classesRemaining).toBe(9);
  });

  it("pago con fecha vieja no pisa el último", () => {
    const b = billing(monthlyPlan, { nextDueCivil: "2026-11-10", lastPaymentCivil: "2026-11-05", lastPaymentAmount: 200 });
    expect(recordEffect(b, months1, "2026-10-01", 100)).toEqual({
      nextDueCivil: "2026-12-10",
      classesRemaining: null,
      lastPaymentCivil: "2026-11-05",
      lastPaymentAmount: 200,
    });
  });

  it("misma fecha gana el nuevo", () => {
    const b = billing(monthlyPlan, { nextDueCivil: "2026-11-10", lastPaymentCivil: "2026-11-11", lastPaymentAmount: 200 });
    expect(recordEffect(b, months1, "2026-11-11", 100)).toMatchObject({
      lastPaymentCivil: "2026-11-11",
      lastPaymentAmount: 100,
    });
  });
});

describe("voidEffect — casos gemelos (#1659)", () => {
  it("anular el último revierte y pasa al anterior", () => {
    const b = billing(monthlyPlan, { nextDueCivil: "2026-12-10" });
    expect(voidEffect(b, months1, { paidCivil: "2026-10-10", amount: 90 })).toEqual({
      nextDueCivil: "2026-11-10",
      classesRemaining: null,
      lastPaymentCivil: "2026-10-10",
      lastPaymentAmount: 90,
    });
  });

  it("anular el único deja sin último pago", () => {
    expect(voidEffect(billing(monthlyPlan, { nextDueCivil: "2026-12-10" }), months1, null)).toEqual({
      nextDueCivil: "2026-11-10",
      classesRemaining: null,
      lastPaymentCivil: null,
      lastPaymentAmount: null,
    });
  });

  it("anular sin plan no toca el saldo", () => {
    expect(voidEffect(billing(null), classes8, { paidCivil: "2026-10-10", amount: 90 })).toEqual({
      nextDueCivil: null,
      classesRemaining: null,
      lastPaymentCivil: "2026-10-10",
      lastPaymentAmount: 90,
    });
  });

  it("anular clases no baja de cero", () => {
    expect(voidEffect(billing(packPlan, { classesRemaining: 3 }), classes8, null).classesRemaining).toBe(0);
  });
});
