// payments-actions.test.ts — gc-fitness #1540. Admin SDK ⇒ las reglas no corren: estas
// guardas son lo único que impide que un coach lea o toque los cobros de otro. Se
// asertan los DOCUMENTOS escritos (fake en memoria), no las llamadas.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
jest.mock("@/lib/gc-fitness/civil-date", () => ({
  ...jest.requireActual("@/lib/gc-fitness/civil-date"),
  civilDateToday: () => "2026-11-11",
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: async () => "America/Argentina/Buenos_Aires",
}));

import { SERVER_TIMESTAMP, fake, ts } from "@/lib/test-utils/fake-firestore-cov-a";

import {
  assignClientPlan,
  consumeClientClass,
  getClientBilling,
  getCollectedThisMonth,
  listClientBillings,
  listClientPayments,
  listClientPaymentsForExport,
  listPaymentPlans,
  recordClientPayment,
  savePaymentPlan,
  setPaymentPlanArchived,
  updateClientBilling,
  voidClientPayment,
} from "../payments-actions";

const COACH = "coach-A";
const OTHER = "coach-B";
const BILLING = `client_billing/${COACH}_client-1`;

function expectNoUndefinedDeep(value: unknown, path = "$"): void {
  if (value === undefined) throw new Error(`undefined at ${path}`);
  if (Array.isArray(value)) value.forEach((v, i) => expectNoUndefinedDeep(v, `${path}[${i}]`));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) expectNoUndefinedDeep(v, `${path}.${k}`);
  }
}

const monthlyPlan = {
  coachId: COACH,
  name: "Mensual online",
  kind: "monthly",
  modality: "online",
  amount: 25000,
  currency: "ARS",
  periodMonths: 1,
  classCount: null,
  description: null,
  archived: false,
};

const payment = (over: Record<string, unknown> = {}) => ({
  coachId: COACH,
  clientId: "client-1",
  amount: 25000,
  currency: "ARS",
  paidCivil: "2026-11-01",
  method: "cash",
  methodNote: null,
  covers: { kind: "months", months: 1, classes: null },
  planName: "Mensual online",
  note: null,
  createdAt: ts("2026-11-01T12:00:00Z"),
  voidedAt: null,
  voidReason: null,
  ...over,
});

beforeEach(() => {
  fake.reset();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "ana@example.com" });
  fake.seed({
    [`users/${COACH}`]: { displayName: "Ana Coach" },
    "users/client-1": { role: "client", coachId: COACH },
    "users/client-2": { role: "client", coachId: OTHER },
    "coach_payment_plans/plan-1": monthlyPlan,
    "coach_payment_plans/plan-pack": {
      ...monthlyPlan,
      name: "Pack 8",
      kind: "class_pack",
      periodMonths: null,
      classCount: 8,
    },
    "coach_payment_plans/plan-other": { ...monthlyPlan, coachId: OTHER, name: "Ajeno" },
  });
});

describe("auth gate", () => {
  it.each([
    ["listPaymentPlans", () => listPaymentPlans()],
    ["listClientBillings", () => listClientBillings()],
    ["listClientPayments", () => listClientPayments({})],
    ["getCollectedThisMonth", () => getCollectedThisMonth()],
  ])("%s rejects a non-trainer before any read", async (_n, call) => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(call()).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.queries).toEqual([]);
  });

  it.each([
    ["savePaymentPlan", () => savePaymentPlan({ name: "x", kind: "monthly", amount: 1 })],
    ["recordClientPayment", () => recordClientPayment({})],
    ["voidClientPayment", () => voidClientPayment({ paymentId: "p" })],
    ["assignClientPlan", () => assignClientPlan({ clientId: "client-1", planId: "plan-1" })],
  ])("%s returns Forbidden and writes nothing", async (_n, call) => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(call()).resolves.toEqual({ ok: false, error: "Forbidden" });
    expect(fake.db.writes).toEqual([]);
  });
});

describe("planes", () => {
  it("crea un plan normalizado según el tipo, sin undefined", async () => {
    const result = await savePaymentPlan({
      name: "  Pack 3 meses ",
      kind: "months_pack",
      amount: 70000,
      periodMonths: 3,
      classCount: 99,
      description: "  ",
    });
    expect(result).toEqual({ ok: true, id: "auto-1" });
    const doc = fake.doc("coach_payment_plans/auto-1");
    expect(doc).toEqual({
      coachId: COACH,
      name: "Pack 3 meses",
      kind: "months_pack",
      modality: null,
      amount: 70000,
      currency: "ARS",
      periodMonths: 3,
      classCount: null,
      description: null,
      archived: false,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    });
    expectNoUndefinedDeep(doc);
  });

  it("valida los rangos por tipo", async () => {
    await expect(savePaymentPlan({ name: "x", kind: "months_pack", amount: 1, periodMonths: 1 })).resolves.toEqual({
      ok: false,
      error: "A multi-month pack covers 2 to 24 months.",
    });
    await expect(savePaymentPlan({ name: "x", kind: "class_pack", amount: 1 })).resolves.toMatchObject({ ok: false });
    await expect(savePaymentPlan({ name: "x", kind: "monthly", amount: 1.234 })).resolves.toMatchObject({ ok: false });
    await expect(savePaymentPlan({ name: "", kind: "monthly", amount: 1 })).resolves.toMatchObject({ ok: false });
    expect(fake.db.writes).toEqual([]);
  });

  it("monthly fija periodMonths = 1; editar actualiza sin tocar coachId/createdAt", async () => {
    await expect(
      savePaymentPlan({ id: "plan-1", name: "Mensual", kind: "monthly", amount: 30000, periodMonths: 7 }),
    ).resolves.toEqual({ ok: true, id: "plan-1" });
    expect(fake.db.writes).toEqual([
      expect.objectContaining({ op: "update", path: "coach_payment_plans/plan-1" }),
    ]);
    expect(fake.doc("coach_payment_plans/plan-1")).toMatchObject({
      coachId: COACH,
      name: "Mensual",
      amount: 30000,
      periodMonths: 1,
    });
  });

  it("no edita ni archiva el plan de otro coach", async () => {
    await expect(
      savePaymentPlan({ id: "plan-other", name: "x", kind: "monthly", amount: 1 }),
    ).resolves.toEqual({ ok: false, error: "Forbidden" });
    await expect(setPaymentPlanArchived({ planId: "plan-other", archived: true })).resolves.toEqual({
      ok: false,
      error: "Forbidden",
    });
    expect(fake.db.writes).toEqual([]);
  });

  it("archiva y lista sólo los del coach, archivados al final", async () => {
    await expect(setPaymentPlanArchived({ planId: "plan-1", archived: true })).resolves.toEqual({ ok: true });
    const plans = await listPaymentPlans();
    expect(plans.map((p) => [p.id, p.archived])).toEqual([
      ["plan-pack", false],
      ["plan-1", true],
    ]);
    expect(fake.db.queries[0]).toMatchObject({
      path: "coach_payment_plans",
      filters: [["coachId", "==", COACH]],
    });
  });
});

describe("assignClientPlan", () => {
  it("crea el billing con el snapshot del plan y el primer vencimiento = inicio", async () => {
    await expect(
      assignClientPlan({ clientId: "client-1", planId: "plan-1", startCivil: "2026-11-05", amount: 20000 }),
    ).resolves.toEqual({ ok: true });
    const doc = fake.doc(BILLING);
    expect(doc).toEqual({
      coachId: COACH,
      clientId: "client-1",
      planId: "plan-1",
      plan: {
        name: "Mensual online",
        kind: "monthly",
        modality: "online",
        amount: 25000,
        currency: "ARS",
        periodMonths: 1,
        classCount: null,
        description: null,
      },
      amount: 20000,
      startCivil: "2026-11-05",
      nextDueCivil: "2026-11-05",
      classesRemaining: null,
      reminderDaysBefore: 3,
      lastPaymentCivil: null,
      lastPaymentAmount: null,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    });
    expectNoUndefinedDeep(doc);
  });

  it("un pack de clases arranca con saldo 0 y sin vencimiento", async () => {
    await assignClientPlan({ clientId: "client-1", planId: "plan-pack" });
    expect(fake.doc(BILLING)).toMatchObject({
      planId: "plan-pack",
      startCivil: "2026-11-11",
      nextDueCivil: null,
      classesRemaining: 0,
    });
  });

  it("rechaza un alumno que no es suyo, un plan ajeno y un pendiente (mirror:)", async () => {
    await expect(assignClientPlan({ clientId: "client-2", planId: "plan-1" })).resolves.toEqual({
      ok: false,
      error: "Forbidden",
    });
    await expect(assignClientPlan({ clientId: "client-1", planId: "plan-other" })).resolves.toEqual({
      ok: false,
      error: "Forbidden",
    });
    await expect(assignClientPlan({ clientId: "mirror:x@example.com", planId: "plan-1" })).resolves.toEqual({
      ok: false,
      error: "Forbidden",
    });
    expect(fake.db.writes).toEqual([]);
  });

  it("cambiar de plan conserva el vencimiento vigente; quitarlo deja todo en null", async () => {
    fake.seed({
      [BILLING]: {
        coachId: COACH,
        clientId: "client-1",
        planId: "plan-1",
        plan: { ...monthlyPlan },
        amount: null,
        startCivil: "2026-10-01",
        nextDueCivil: "2026-12-01",
        classesRemaining: null,
        reminderDaysBefore: 5,
        lastPaymentCivil: "2026-11-01",
        lastPaymentAmount: 25000,
      },
    });
    await assignClientPlan({ clientId: "client-1", planId: "plan-1", reminderDaysBefore: 5 });
    expect(fake.doc(BILLING)).toMatchObject({ nextDueCivil: "2026-12-01", startCivil: "2026-10-01" });
    await assignClientPlan({ clientId: "client-1", planId: null });
    expect(fake.doc(BILLING)).toMatchObject({
      planId: null,
      plan: null,
      amount: null,
      startCivil: null,
      nextDueCivil: null,
      classesRemaining: null,
      // El último pago es historia: no se borra al quitar el plan.
      lastPaymentCivil: "2026-11-01",
    });
  });
});

describe("recordClientPayment", () => {
  beforeEach(() => {
    fake.seed({
      [BILLING]: {
        coachId: COACH,
        clientId: "client-1",
        planId: "plan-1",
        plan: { ...monthlyPlan },
        amount: null,
        startCivil: "2026-10-10",
        nextDueCivil: "2026-11-10",
        classesRemaining: null,
        reminderDaysBefore: 3,
        lastPaymentCivil: null,
        lastPaymentAmount: null,
      },
    });
  });

  const input = (over: Record<string, unknown> = {}) => ({
    clientId: "client-1",
    amount: 25000,
    paidCivil: "2026-11-11",
    method: "transfer",
    covers: { kind: "months", months: 1 },
    ...over,
  });

  it("un batch: crea el pago y corre el vencimiento desde el vigente", async () => {
    await expect(recordClientPayment(input({ note: " pagó ", methodNote: "" }))).resolves.toEqual({
      ok: true,
      id: "auto-1",
    });
    const doc = fake.doc("client_payments/auto-1");
    expect(doc).toEqual({
      coachId: COACH,
      clientId: "client-1",
      amount: 25000,
      currency: "ARS",
      paidCivil: "2026-11-11",
      method: "transfer",
      methodNote: null,
      covers: { kind: "months", months: 1, classes: null },
      planName: "Mensual online",
      note: "pagó",
      createdAt: SERVER_TIMESTAMP,
      voidedAt: null,
      voidReason: null,
    });
    expectNoUndefinedDeep(doc);
    expect(fake.doc(BILLING)).toMatchObject({
      nextDueCivil: "2026-12-10",
      lastPaymentCivil: "2026-11-11",
      lastPaymentAmount: 25000,
    });
    expect(fake.db.writes.map((w) => [w.op, w.path])).toEqual([
      ["set", "client_payments/auto-1"],
      ["update", BILLING],
    ]);
  });

  it("sin billing previo crea uno sin plan con el último pago", async () => {
    fake.db.docs.delete(BILLING);
    await recordClientPayment(input({ covers: { kind: "other" } }));
    const doc = fake.doc(BILLING);
    expect(doc).toMatchObject({
      coachId: COACH,
      clientId: "client-1",
      planId: null,
      plan: null,
      nextDueCivil: null,
      lastPaymentCivil: "2026-11-11",
      lastPaymentAmount: 25000,
    });
    expectNoUndefinedDeep(doc);
    expect(fake.doc("client_payments/auto-1")).toMatchObject({ planName: null, currency: "ARS" });
  });

  it("un billing sin plan no inventa un vencimiento: sólo guarda el último pago", async () => {
    fake.seed({
      [BILLING]: { ...fake.doc(BILLING), planId: null, plan: null, nextDueCivil: null, startCivil: null },
    });
    await recordClientPayment(input());
    expect(fake.doc(BILLING)).toMatchObject({ nextDueCivil: null, lastPaymentCivil: "2026-11-11" });
  });

  it("rechaza monto ≤ 0, medio inválido y un alumno ajeno sin escribir", async () => {
    await expect(recordClientPayment(input({ amount: 0 }))).resolves.toMatchObject({ ok: false });
    await expect(recordClientPayment(input({ method: "bitcoin" }))).resolves.toMatchObject({ ok: false });
    await expect(recordClientPayment(input({ clientId: "client-2" }))).resolves.toEqual({
      ok: false,
      error: "Forbidden",
    });
    expect(fake.db.writes).toEqual([]);
  });
});

describe("voidClientPayment", () => {
  beforeEach(() => {
    fake.seed({
      [BILLING]: {
        coachId: COACH,
        clientId: "client-1",
        planId: "plan-1",
        plan: { ...monthlyPlan },
        amount: null,
        startCivil: "2026-10-10",
        nextDueCivil: "2026-12-10",
        classesRemaining: null,
        reminderDaysBefore: 3,
        lastPaymentCivil: "2026-11-11",
        lastPaymentAmount: 25000,
      },
      "client_payments/p-old": payment({ paidCivil: "2026-10-10", amount: 24000 }),
      "client_payments/p-last": payment({ paidCivil: "2026-11-11" }),
      "client_payments/p-voided": payment({ paidCivil: "2026-11-20", voidedAt: ts("2026-11-20T00:00:00Z") }),
      "client_payments/p-other": payment({ coachId: OTHER, clientId: "client-2" }),
    });
  });

  it("anular el ÚLTIMO pago no anulado revierte el vencimiento y lastPayment* (un batch)", async () => {
    await expect(voidClientPayment({ paymentId: "p-last", reason: " error " })).resolves.toEqual({
      ok: true,
      revertedBilling: true,
    });
    expect(fake.doc("client_payments/p-last")).toMatchObject({ voidedAt: SERVER_TIMESTAMP, voidReason: "error" });
    expect(fake.doc(BILLING)).toMatchObject({
      nextDueCivil: "2026-11-10",
      lastPaymentCivil: "2026-10-10",
      lastPaymentAmount: 24000,
    });
    // Nunca se borra nada.
    expect(fake.db.writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("anular uno que NO es el último sólo marca el pago", async () => {
    await expect(voidClientPayment({ paymentId: "p-old" })).resolves.toEqual({
      ok: true,
      revertedBilling: false,
    });
    expect(fake.db.writes.map((w) => w.path)).toEqual(["client_payments/p-old"]);
    expect(fake.doc("client_payments/p-old")).toMatchObject({ voidReason: null });
    expect(fake.doc(BILLING)).toMatchObject({ nextDueCivil: "2026-12-10" });
  });

  it("no anula un pago de otro coach ni uno ya anulado", async () => {
    await expect(voidClientPayment({ paymentId: "p-other" })).resolves.toEqual({ ok: false, error: "Forbidden" });
    await expect(voidClientPayment({ paymentId: "p-voided" })).resolves.toEqual({
      ok: false,
      error: "This payment is already voided.",
    });
    expect(fake.db.writes).toEqual([]);
  });

  it("anula aunque el alumno ya no sea suyo (lo cargado queda del coach)", async () => {
    fake.seed({ "users/client-1": { role: "client", coachId: OTHER } });
    await expect(voidClientPayment({ paymentId: "p-last" })).resolves.toMatchObject({ ok: true });
  });
});

describe("billing por alumno", () => {
  beforeEach(() => {
    fake.seed({
      [BILLING]: {
        coachId: COACH,
        clientId: "client-1",
        planId: "plan-pack",
        plan: { ...monthlyPlan, kind: "class_pack", periodMonths: null, classCount: 8 },
        amount: null,
        startCivil: "2026-11-01",
        nextDueCivil: null,
        classesRemaining: 1,
        reminderDaysBefore: 3,
        lastPaymentCivil: null,
        lastPaymentAmount: null,
      },
      [`client_billing/${OTHER}_client-2`]: { coachId: OTHER, clientId: "client-2", planId: null, plan: null },
    });
  });

  it("descontar clase nunca baja de cero", async () => {
    await expect(consumeClientClass({ clientId: "client-1" })).resolves.toEqual({ ok: true, classesRemaining: 0 });
    await expect(consumeClientClass({ clientId: "client-1" })).resolves.toEqual({ ok: true, classesRemaining: 0 });
  });

  it("la corrección a mano escribe sólo vencimiento/saldo/aviso", async () => {
    await expect(
      updateClientBilling({ clientId: "client-1", nextDueCivil: "2026-12-01", classesRemaining: 4, reminderDaysBefore: 7 }),
    ).resolves.toEqual({ ok: true });
    expect(fake.db.writes).toEqual([
      {
        op: "update",
        path: BILLING,
        data: { nextDueCivil: "2026-12-01", classesRemaining: 4, reminderDaysBefore: 7, updatedAt: SERVER_TIMESTAMP },
      },
    ]);
  });

  it("sólo lee el billing propio: el de otro coach no existe para mí", async () => {
    await expect(getClientBilling("client-2")).resolves.toBeNull();
    expect(fake.db.reads).toEqual([`client_billing/${COACH}_client-2`]);
    const all = await listClientBillings();
    expect(all.map((b) => b.clientId)).toEqual(["client-1"]);
    await expect(consumeClientClass({ clientId: "client-2" })).resolves.toEqual({ ok: false, error: "Forbidden" });
  });
});

describe("historial", () => {
  beforeEach(() => {
    const seed: Record<string, Record<string, unknown>> = {};
    // 25 pagos en octubre (dos por día en algunos), 3 en noviembre, uno anulado.
    for (let i = 1; i <= 25; i += 1) {
      const day = String(Math.ceil(i / 2)).padStart(2, "0");
      seed[`client_payments/oct-${i}`] = payment({
        paidCivil: `2026-10-${day}`,
        method: i % 2 === 0 ? "cash" : "transfer",
        createdAt: ts(`2026-10-${day}T1${i % 2}:00:00Z`),
      });
    }
    seed["client_payments/nov-1"] = payment({ paidCivil: "2026-11-02", amount: 1000, currency: "USD" });
    seed["client_payments/nov-2"] = payment({ paidCivil: "2026-11-05", amount: 25000 });
    seed["client_payments/nov-3"] = payment({ paidCivil: "2026-11-06", amount: 9999, voidedAt: ts("2026-11-07T00:00:00Z") });
    seed["client_payments/foreign"] = payment({ coachId: OTHER, clientId: "client-2", paidCivil: "2026-11-09" });
    fake.seed(seed);
  });

  it("pagina sin partir un día y sin repetir ni perder pagos", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await listClientPayments({ cursor });
      seen.push(...page.payments.map((p) => p.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(28);
    expect(seen).not.toContain("foreign");
    expect(pages).toBe(2);
  });

  it("filtra por mes y por medio; el export trae todo lo filtrado", async () => {
    const nov = await listClientPayments({ month: "2026-11" });
    expect(nov.payments.map((p) => p.id)).toEqual(["nov-3", "nov-2", "nov-1"]);
    expect(nov.nextCursor).toBeNull();
    const cash = await listClientPaymentsForExport({ month: "2026-10", method: "cash" });
    expect(cash).toHaveLength(12);
    expect(cash.every((p) => p.method === "cash")).toBe(true);
  });

  it("cobrado este mes suma los no anulados por moneda", async () => {
    await expect(getCollectedThisMonth()).resolves.toEqual({
      month: "2026-11",
      totals: [
        { currency: "ARS", amount: 25000 },
        { currency: "USD", amount: 1000 },
      ],
    });
  });
});
