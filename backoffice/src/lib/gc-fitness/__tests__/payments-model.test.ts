// payments-model.test.ts — gc-fitness #1540: piezas puras de pagos (entrada de montos,
// CSV, normalización de planes y decoders).

import {
  buildPaymentsCsv,
  clientFirstName,
  decodeBilling,
  decodePayment,
  normalizePlanInput,
  parseMoneyInput,
  planIsPeriodic,
  sumByCurrency,
  type ClientPaymentView,
} from "../payments-model";

describe("parseMoneyInput", () => {
  it.each([
    ["25000", 25000],
    ["25.000", 25000],
    ["25.000,50", 25000.5],
    ["25,000.50", 25000.5],
    ["$ 1.500", 1500],
    ["12,5", 12.5],
    ["12.50", 12.5],
    ["1.5", 1.5],
  ])("%s → %s", (raw, expected) => {
    expect(parseMoneyInput(raw)).toBe(expected);
  });

  it.each(["", "abc", "1.2.3", "12.345,678", "-5"])("%s → NaN", (raw) => {
    expect(parseMoneyInput(raw)).toBeNaN();
  });
});

describe("normalizePlanInput", () => {
  it("custom: periodo opcional 1–24; sin clases", () => {
    expect(normalizePlanInput({ name: "Propio", kind: "custom", amount: 1, periodMonths: null, classCount: 3 })).toMatchObject({
      periodMonths: null,
      classCount: null,
    });
    expect(() => normalizePlanInput({ name: "x", kind: "custom", amount: 1, periodMonths: 30 })).toThrow(
      "The period must be 1 to 24 months.",
    );
  });

  it("per_class / per_routine no llevan periodo ni clases; la moneda va en mayúsculas", () => {
    expect(
      normalizePlanInput({ name: "Clase", kind: "per_class", amount: 5000, periodMonths: 2, classCount: 4, currency: "usd" }),
    ).toMatchObject({ periodMonths: null, classCount: null, currency: "USD" });
  });

  it("planIsPeriodic", () => {
    expect(planIsPeriodic({ kind: "monthly", periodMonths: 1 })).toBe(true);
    expect(planIsPeriodic({ kind: "custom", periodMonths: null })).toBe(false);
    expect(planIsPeriodic({ kind: "custom", periodMonths: 2 })).toBe(true);
    expect(planIsPeriodic({ kind: "class_pack", periodMonths: null })).toBe(false);
  });
});

describe("decoders", () => {
  it("un billing a medio escribir no rompe: defaults y nulls", () => {
    expect(decodeBilling({ clientId: "c" })).toEqual({
      clientId: "c",
      planId: null,
      plan: null,
      amount: null,
      startCivil: null,
      nextDueCivil: null,
      classesRemaining: null,
      reminderDaysBefore: 3,
      lastPaymentCivil: null,
      lastPaymentAmount: null,
    });
  });

  it("un pago con enums desconocidos cae en «other»", () => {
    const p = decodePayment("p", { method: "crypto", covers: { kind: "weeks" }, amount: 10, paidCivil: "2026-11-01" });
    expect(p.method).toBe("other");
    expect(p.covers).toEqual({ kind: "other", months: null, classes: null });
  });
});

describe("clientFirstName", () => {
  it("apodo, primera palabra del nombre, o el mail", () => {
    expect(clientFirstName({ displayName: "Juan Pérez", email: "j@x.com", coachNickname: "Juancho" })).toBe("Juancho");
    expect(clientFirstName({ displayName: "Juan Pérez", email: "j@x.com" })).toBe("Juan");
    expect(clientFirstName({ displayName: " ", email: "jp@x.com" })).toBe("jp");
  });
});

const pay = (over: Partial<ClientPaymentView>): ClientPaymentView => ({
  id: "p",
  clientId: "c1",
  amount: 100,
  currency: "ARS",
  paidCivil: "2026-11-01",
  method: "cash",
  methodNote: null,
  covers: { kind: "months", months: 1, classes: null },
  planName: null,
  note: null,
  createdAt: null,
  voidedAt: null,
  voidReason: null,
  ...over,
});

describe("sumByCurrency", () => {
  it("ignora anulados y suma por moneda sin errores de coma flotante", () => {
    expect(
      sumByCurrency([
        pay({ amount: 0.1 }),
        pay({ amount: 0.2 }),
        pay({ amount: 50, currency: "USD" }),
        pay({ amount: 999, voidedAt: "x" }),
      ]),
    ).toEqual([
      { currency: "ARS", amount: 0.3 },
      { currency: "USD", amount: 50 },
    ]);
  });
});

describe("buildPaymentsCsv", () => {
  it("escapa comas/comillas, neutraliza fórmulas y marca anulados", () => {
    const csv = buildPaymentsCsv(
      [
        pay({ note: 'dijo "ok", listo', clientId: "c1" }),
        pay({ id: "p2", note: "=HYPERLINK(1)", voidedAt: "2026-11-02T00:00:00Z", method: "other", methodNote: "cripto" }),
      ],
      {
        headers: ["Fecha", "Alumno", "Monto", "Moneda", "Medio", "Detalle", "Cubre", "Plan", "Nota", "Estado"],
        clientName: (id) => (id === "c1" ? "Juan" : id),
        method: (m) => m,
        covers: () => "1 mes",
        voided: "Anulado",
      },
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toEqual([
      "Fecha,Alumno,Monto,Moneda,Medio,Detalle,Cubre,Plan,Nota,Estado",
      '2026-11-01,Juan,100,ARS,cash,,1 mes,,"dijo ""ok"", listo",',
      "2026-11-01,Juan,100,ARS,other,cripto,1 mes,,'=HYPERLINK(1),Anulado",
    ]);
  });
});
