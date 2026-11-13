// billing.test.ts — gc-fitness #1540. La tabla de casos GEMELOS de la spec: los cuatro
// lados (Swift, Kotlin, functions, backoffice) tienen estos mismos casos, uno por uno.

import {
  addMonths,
  applyPayment,
  consumeClass,
  defaultCovers,
  effectiveAmount,
  reminderText,
  revertPayment,
  status,
  whatsappShareUrl,
  type BillingLike,
  type BillingPlanSnapshot,
} from "../billing";

const TODAY = "2026-11-11";

const monthlyPlan: BillingPlanSnapshot = {
  name: "Mensual online",
  kind: "monthly",
  modality: "online",
  amount: 25000,
  currency: "ARS",
  periodMonths: 1,
  classCount: null,
  description: null,
};

const packPlan: BillingPlanSnapshot = {
  ...monthlyPlan,
  name: "Pack 8 clases",
  kind: "class_pack",
  periodMonths: null,
  classCount: 8,
};

function billing(over: Partial<BillingLike> = {}): BillingLike {
  return {
    planId: "plan-1",
    plan: monthlyPlan,
    startCivil: null,
    nextDueCivil: null,
    classesRemaining: null,
    reminderDaysBefore: 3,
    ...over,
  };
}

const months = (n: number) => ({ kind: "months" as const, months: n, classes: null });
const classes = (n: number) => ({ kind: "classes" as const, months: null, classes: n });

describe("Billing — casos gemelos de la spec", () => {
  it("sin billing → none, 0", () => {
    expect(status(null, TODAY)).toEqual({ state: "none", days: 0 });
  });

  it("vence en 5, aviso 3 → up_to_date, 5", () => {
    expect(status(billing({ nextDueCivil: "2026-11-16" }), TODAY)).toEqual({
      state: "up_to_date",
      days: 5,
    });
  });

  it("vence en 3 → due_soon, 3", () => {
    expect(status(billing({ nextDueCivil: "2026-11-14" }), TODAY)).toEqual({
      state: "due_soon",
      days: 3,
    });
  });

  it("vence hoy → due_soon, 0", () => {
    expect(status(billing({ nextDueCivil: "2026-11-11" }), TODAY)).toEqual({
      state: "due_soon",
      days: 0,
    });
  });

  it("vencido 4 → overdue, 4", () => {
    expect(status(billing({ nextDueCivil: "2026-11-07" }), TODAY)).toEqual({
      state: "overdue",
      days: 4,
    });
  });

  it("pack clases 0 → overdue, 0", () => {
    expect(status(billing({ plan: packPlan, classesRemaining: 0 }), TODAY)).toEqual({
      state: "overdue",
      days: 0,
    });
  });

  it("pack clases 2 → up_to_date, 2", () => {
    expect(status(billing({ plan: packPlan, classesRemaining: 2 }), TODAY)).toEqual({
      state: "up_to_date",
      days: 2,
    });
  });

  it("mensual paga 1 → next 2026-12-10", () => {
    expect(applyPayment(billing({ nextDueCivil: "2026-11-10" }), months(1), TODAY).nextDueCivil).toBe(
      "2026-12-10",
    );
  });

  it("pack 3 meses → next 2027-02-28", () => {
    expect(applyPayment(billing({ nextDueCivil: "2026-11-30" }), months(3), TODAY).nextDueCivil).toBe(
      "2027-02-28",
    );
  });

  it("fin de mes → addMonths(2026-01-31, 1) = 2026-02-28", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("bisiesto → addMonths(2028-02-29, 12) = 2029-02-28", () => {
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("sin next, con start → next 2026-12-01", () => {
    expect(applyPayment(billing({ startCivil: "2026-11-01" }), months(1), TODAY).nextDueCivil).toBe(
      "2026-12-01",
    );
  });

  it("revert → next 2026-11-10", () => {
    expect(revertPayment(billing({ nextDueCivil: "2026-12-10" }), months(1)).nextDueCivil).toBe(
      "2026-11-10",
    );
  });

  it("clases → remaining 1 + 8 = 9", () => {
    expect(
      applyPayment(billing({ plan: packPlan, classesRemaining: 1 }), classes(8), TODAY).classesRemaining,
    ).toBe(9);
  });

  it("consumir 0 → 0", () => {
    expect(consumeClass({ classesRemaining: 0 })).toBe(0);
  });
});

describe("Billing — bordes", () => {
  it("planId y plan nulos → none aunque haya vencimiento", () => {
    expect(status(billing({ planId: null, plan: null, nextDueCivil: "2026-11-01" }), TODAY)).toEqual({
      state: "none",
      days: 0,
    });
  });

  it("plan sin vencimiento → up_to_date, 0", () => {
    expect(status(billing({ plan: { ...monthlyPlan, kind: "per_routine" } }), TODAY)).toEqual({
      state: "up_to_date",
      days: 0,
    });
  });

  it("sin next ni start: corre desde la fecha del pago", () => {
    expect(applyPayment(billing(), months(1), "2026-11-11").nextDueCivil).toBe("2026-12-11");
  });

  it("months nulo usa el periodo del plan; classes nulo usa classCount", () => {
    const pack3 = { ...monthlyPlan, kind: "months_pack" as const, periodMonths: 3 };
    expect(
      applyPayment(billing({ plan: pack3, nextDueCivil: "2026-11-10" }), { kind: "months", months: null, classes: null }, TODAY)
        .nextDueCivil,
    ).toBe("2027-02-10");
    expect(
      applyPayment(billing({ plan: packPlan, classesRemaining: null }), { kind: "classes", months: null, classes: null }, TODAY)
        .classesRemaining,
    ).toBe(8);
  });

  it("routine / other no cambian nada", () => {
    const b = billing({ nextDueCivil: "2026-11-10", classesRemaining: 2 });
    expect(applyPayment(b, { kind: "routine", months: null, classes: null }, TODAY)).toEqual({
      nextDueCivil: "2026-11-10",
      classesRemaining: 2,
    });
    expect(revertPayment(b, { kind: "other", months: null, classes: null })).toEqual({
      nextDueCivil: "2026-11-10",
      classesRemaining: 2,
    });
  });

  it("revert de clases no baja de cero", () => {
    expect(revertPayment(billing({ plan: packPlan, classesRemaining: 3 }), classes(8)).classesRemaining).toBe(0);
  });

  it("addMonths negativo cruza el año", () => {
    expect(addMonths("2027-01-31", -2)).toBe("2026-11-30");
  });

  it("consumeClass descuenta uno", () => {
    expect(consumeClass({ classesRemaining: 5 })).toBe(4);
    expect(consumeClass({ classesRemaining: null })).toBe(0);
  });

  it("defaultCovers según el tipo de plan", () => {
    expect(defaultCovers(monthlyPlan)).toEqual(months(1));
    expect(defaultCovers({ ...monthlyPlan, kind: "months_pack", periodMonths: 6 })).toEqual(months(6));
    expect(defaultCovers(packPlan)).toEqual(classes(8));
    expect(defaultCovers({ ...monthlyPlan, kind: "per_routine" }).kind).toBe("routine");
    expect(defaultCovers(null).kind).toBe("other");
  });

  it("effectiveAmount: precio especial sobre el del plan", () => {
    expect(effectiveAmount({ amount: 20000, plan: monthlyPlan })).toBe(20000);
    expect(effectiveAmount({ amount: null, plan: monthlyPlan })).toBe(25000);
    expect(effectiveAmount(null)).toBeNull();
  });
});

describe("reminderText", () => {
  // El formateador de moneda puede usar un espacio duro; el texto alrededor es el contrato.
  const norm = (s: string) => s.replace(/ | /g, " ");

  it("es, con vencimiento", () => {
    expect(norm(reminderText("es", "Ana", "Juan", 25000, "ARS", "2026-11-16"))).toBe(
      "Hola Juan! Te recuerdo el pago de $ 25.000 que vence el 16 de noviembre. ¡Gracias! — Ana",
    );
  });

  it("es, sin fecha → pendiente", () => {
    expect(norm(reminderText("es", "Ana", "Juan", 25000, "ARS", null))).toBe(
      "Hola Juan! Te recuerdo el pago de $ 25.000 pendiente. ¡Gracias! — Ana",
    );
  });

  it("en, con y sin vencimiento", () => {
    expect(norm(reminderText("en", "Ana", "Juan", 50, "USD", "2026-11-16"))).toBe(
      "Hi Juan! A reminder about your $50 payment due on November 16. Thanks! — Ana",
    );
    expect(norm(reminderText("en", "Ana", "Juan", 50.5, "USD"))).toBe(
      "Hi Juan! A reminder about your $50.50 payment that is pending. Thanks! — Ana",
    );
  });

  it("whatsappShareUrl codifica el texto", () => {
    expect(whatsappShareUrl("Hola Juan! ¿ok?")).toBe(
      "https://wa.me/?text=Hola%20Juan!%20%C2%BFok%3F",
    );
  });
});
