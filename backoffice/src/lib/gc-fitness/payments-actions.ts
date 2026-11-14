"use server";

// payments-actions.ts — gc-fitness #1540: pagos y cobros de los alumnos (manual).
//
// Admin SDK ⇒ las reglas NO corren acá: cada action re-valida a mano lo que las reglas
// exigen a las apps.
//   - Todo doc que se lee o se toca tiene `coachId == uid` de la sesión.
//   - CREAR algo para un alumno (billing nuevo, pago) exige que hoy sea SU alumno
//     (`users/{clientId}.coachId == uid`). Lo ya creado queda del coach que lo cargó
//     aunque el alumno se vaya (decisión del dueño): anular un pago viejo sólo pide que
//     el pago sea suyo.
//   - Registrar = UNA transacción (billing leído + pago + billing, #487); anular = UN
//     batch (pago + billing), como lo hacen las apps.
//   - El Admin SDK tira con `undefined`: todo opcional se escribe como `null`.
//
// "use server" ⇒ sólo se exportan funciones async (#785). Los esquemas, decoders y el
// CSV viven en `payments-model.ts`; la lógica de vencimientos es el gemelo `billing.ts`.
// Toda action que dispara un coach DEVUELVE su error (`ActionResult`, #1104).

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { toActionFailure, type ActionResult } from "./action-result";
import { getCurrentTrainer } from "./auth-helpers";
import {
  applyPayment,
  consumeClass,
  revertPayment,
  type BillingLike,
} from "./billing";
import { civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import {
  PAYMENTS_PAGE_SIZE,
  assignPlanInputSchema,
  comparePaymentsDesc,
  decodeBilling,
  decodePayment,
  decodePlan,
  monthBounds,
  normalizePlanInput,
  paymentFiltersSchema,
  planHasClassBalance,
  planIsPeriodic,
  recordPaymentInputSchema,
  sumByCurrency,
  updateBillingInputSchema,
  voidPaymentInputSchema,
  type ClientBillingView,
  type ClientPaymentView,
  type PaymentFilters,
  type PaymentPlan,
  type PaymentsPage,
} from "./payments-model";
import { getTrainerTimezone } from "./trainer-timezone";

type Db = ReturnType<typeof gcFitnessFirestore>;
type Raw = Record<string, unknown>;

function billingDocId(coachId: string, clientId: string): string {
  return `${coachId}_${clientId}`;
}

/** El alumno es HOY de este coach (users/{clientId}.coachId == uid). */
async function assertCurrentClient(db: Db, coachId: string, clientId: string): Promise<void> {
  // Un `mirror:` (alumno pendiente de alta) no tiene users/{id}: no se le cobra todavía.
  const snap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  if (!snap.exists || snap.get("coachId") !== coachId) {
    throw new Error("Forbidden");
  }
}

function toBillingLike(view: ClientBillingView): BillingLike {
  return {
    planId: view.planId,
    plan: view.plan,
    startCivil: view.startCivil,
    nextDueCivil: view.nextDueCivil,
    classesRemaining: view.classesRemaining,
    reminderDaysBefore: view.reminderDaysBefore,
  };
}

// ── Planes ───────────────────────────────────────────────────────────────────────

/** La biblioteca del coach: activos primero, por nombre; los archivados al final. */
export async function listPaymentPlans(): Promise<PaymentPlan[]> {
  const trainer = await getCurrentTrainer();
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.coachPaymentPlans)
    .where("coachId", "==", trainer.uid)
    .get();
  return snap.docs
    .map((d) => decodePlan(d.id, d.data() as Raw))
    .sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function savePaymentPlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const trainer = await getCurrentTrainer();
    const { id, ...fields } = normalizePlanInput(input);
    const db = gcFitnessFirestore();
    const plans = db.collection(FirestoreCollections.coachPaymentPlans);
    const now = FieldValue.serverTimestamp();
    if (id) {
      const ref = plans.doc(id);
      const snap = await ref.get();
      if (!snap.exists || snap.get("coachId") !== trainer.uid) throw new Error("Forbidden");
      await ref.update({ ...fields, updatedAt: now });
      return { ok: true, id };
    }
    const ref = plans.doc();
    await ref.set({
      coachId: trainer.uid,
      ...fields,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    return toActionFailure(err);
  }
}

export async function setPaymentPlanArchived(input: {
  planId: string;
  archived: boolean;
}): Promise<ActionResult> {
  try {
    const trainer = await getCurrentTrainer();
    if (typeof input?.planId !== "string" || !input.planId || typeof input.archived !== "boolean") {
      throw new Error("Invalid plan.");
    }
    const ref = gcFitnessFirestore()
      .collection(FirestoreCollections.coachPaymentPlans)
      .doc(input.planId);
    const snap = await ref.get();
    if (!snap.exists || snap.get("coachId") !== trainer.uid) throw new Error("Forbidden");
    await ref.update({ archived: input.archived, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  } catch (err) {
    return toActionFailure(err);
  }
}

// ── Billing por alumno ───────────────────────────────────────────────────────────

/** Todos los `client_billing` del coach (una query: `coachId == uid`). */
export async function listClientBillings(): Promise<ClientBillingView[]> {
  const trainer = await getCurrentTrainer();
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.clientBilling)
    .where("coachId", "==", trainer.uid)
    .get();
  return snap.docs.map((d) => decodeBilling(d.data() as Raw));
}

/** El billing de un alumno con este coach, o null si nunca se le asignó nada. */
export async function getClientBilling(clientId: string): Promise<ClientBillingView | null> {
  const trainer = await getCurrentTrainer();
  if (typeof clientId !== "string" || !clientId) throw new Error("Forbidden");
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.clientBilling)
    .doc(billingDocId(trainer.uid, clientId))
    .get();
  if (!snap.exists || snap.get("coachId") !== trainer.uid) return null;
  return decodeBilling(snap.data() as Raw);
}

/**
 * Asigna (o cambia, o quita con `planId: null`) el plan de un alumno. Guarda un
 * SNAPSHOT del plan: editar la biblioteca después no le cambia el precio a nadie.
 */
export async function assignClientPlan(input: unknown): Promise<ActionResult> {
  try {
    const trainer = await getCurrentTrainer();
    const parsed = assignPlanInputSchema.parse(input);
    const db = gcFitnessFirestore();
    await assertCurrentClient(db, trainer.uid, parsed.clientId);

    let plan: ReturnType<typeof decodePlan> | null = null;
    if (parsed.planId) {
      const planSnap = await db
        .collection(FirestoreCollections.coachPaymentPlans)
        .doc(parsed.planId)
        .get();
      if (!planSnap.exists || planSnap.get("coachId") !== trainer.uid) {
        throw new Error("Forbidden");
      }
      plan = decodePlan(planSnap.id, planSnap.data() as Raw);
    }

    const ref = db
      .collection(FirestoreCollections.clientBilling)
      .doc(billingDocId(trainer.uid, parsed.clientId));
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? decodeBilling(existingSnap.data() as Raw) : null;

    const today = civilDateToday(await getTrainerTimezone());
    const startCivil = plan ? (parsed.startCivil ?? existing?.startCivil ?? today) : null;
    // Un plan con periodo vence por primera vez el día que arranca (el primer pago lo
    // corre un período); el coach puede fijar otra fecha en el diálogo.
    const nextDueCivil = !plan || !planIsPeriodic(plan)
      ? null
      : parsed.nextDueCivil !== undefined
        ? parsed.nextDueCivil
        : (existing?.nextDueCivil ?? startCivil);
    const classesRemaining = plan && planHasClassBalance(plan)
      ? (existing?.classesRemaining ?? 0)
      : null;

    const snapshot = plan
      ? {
          name: plan.name,
          kind: plan.kind,
          modality: plan.modality,
          amount: plan.amount,
          currency: plan.currency,
          periodMonths: plan.periodMonths,
          classCount: plan.classCount,
          description: plan.description,
        }
      : null;
    const now = FieldValue.serverTimestamp();
    const fields = {
      planId: plan ? plan.id : null,
      plan: snapshot,
      amount: plan ? (parsed.amount ?? null) : null,
      startCivil,
      nextDueCivil,
      classesRemaining,
      reminderDaysBefore: parsed.reminderDaysBefore,
      updatedAt: now,
    };
    if (existingSnap.exists) {
      if (existingSnap.get("coachId") !== trainer.uid) throw new Error("Forbidden");
      await ref.update(fields);
    } else {
      await ref.set({
        coachId: trainer.uid,
        clientId: parsed.clientId,
        ...fields,
        lastPaymentCivil: null,
        lastPaymentAmount: null,
        createdAt: now,
      });
    }
    return { ok: true };
  } catch (err) {
    return toActionFailure(err);
  }
}

/** Corrección a mano: vencimiento, saldo de clases y días de aviso. */
export async function updateClientBilling(input: unknown): Promise<ActionResult> {
  try {
    const trainer = await getCurrentTrainer();
    const parsed = updateBillingInputSchema.parse(input);
    const ref = gcFitnessFirestore()
      .collection(FirestoreCollections.clientBilling)
      .doc(billingDocId(trainer.uid, parsed.clientId));
    const snap = await ref.get();
    if (!snap.exists || snap.get("coachId") !== trainer.uid) throw new Error("Forbidden");
    await ref.update({
      nextDueCivil: parsed.nextDueCivil,
      classesRemaining: parsed.classesRemaining,
      reminderDaysBefore: parsed.reminderDaysBefore,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return toActionFailure(err);
  }
}

/** «Descontar clase»: una clase menos del saldo (nunca por debajo de cero). */
export async function consumeClientClass(input: {
  clientId: string;
}): Promise<ActionResult<{ classesRemaining: number }>> {
  try {
    const trainer = await getCurrentTrainer();
    if (typeof input?.clientId !== "string" || !input.clientId) throw new Error("Forbidden");
    const db = gcFitnessFirestore();
    const ref = db
      .collection(FirestoreCollections.clientBilling)
      .doc(billingDocId(trainer.uid, input.clientId));
    // #487: read-modify-write INSIDE a transaction. The old get → update let two
    // concurrent "descontar clase" (web + app, or two tabs) both read N and both
    // write N-1 — one class lost. Not `FieldValue.increment(-1)`: the balance
    // must clamp at zero (`consumeClass`), which an increment can't express.
    const classesRemaining = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("coachId") !== trainer.uid) throw new Error("Forbidden");
      const next = consumeClass(decodeBilling(snap.data() as Raw));
      tx.update(ref, { classesRemaining: next, updatedAt: FieldValue.serverTimestamp() });
      return next;
    });
    return { ok: true, classesRemaining };
  } catch (err) {
    return toActionFailure(err);
  }
}

// ── Pagos ────────────────────────────────────────────────────────────────────────

/**
 * Registra un pago: UN batch con el pago nuevo + el billing movido por
 * `Billing.applyPayment` + `lastPayment*`. Sin billing previo (alumno sin plan) se crea
 * uno sin plan que sólo guarda el último pago.
 */
export async function recordClientPayment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const trainer = await getCurrentTrainer();
    const parsed = recordPaymentInputSchema.parse(input);
    const db = gcFitnessFirestore();
    await assertCurrentClient(db, trainer.uid, parsed.clientId);

    const billingRef = db
      .collection(FirestoreCollections.clientBilling)
      .doc(billingDocId(trainer.uid, parsed.clientId));
    // #487: an idempotency key (one per open of the dialog) makes the payment doc id
    // deterministic, so a retried / double-submitted "Registrar pago" lands on the SAME
    // doc instead of recording the payment twice. Prefixed with the coach uid so two
    // coaches can never collide on a key.
    const payments = db.collection(FirestoreCollections.clientPayments);
    const paymentRef = parsed.requestId
      ? payments.doc(`${trainer.uid}_${parsed.requestId}`)
      : payments.doc();

    // #487: billing read + payment create + billing update in ONE transaction. The old
    // read → batch let a concurrent payment / class consume (web + app) move the billing
    // between the read and the write; the loser's update was computed from a stale
    // `nextDueCivil` / `classesRemaining` and overwrote it.
    await db.runTransaction(async (tx) => {
      const billingSnap = await tx.get(billingRef);
      if (billingSnap.exists && billingSnap.get("coachId") !== trainer.uid) {
        throw new Error("Forbidden");
      }
      if (parsed.requestId) {
        const existing = await tx.get(paymentRef);
        if (existing.exists) {
          if (existing.get("coachId") !== trainer.uid) throw new Error("Forbidden");
          return; // already recorded by an earlier submit with this key
        }
      }
      const billing = billingSnap.exists ? decodeBilling(billingSnap.data() as Raw) : null;
      const now = FieldValue.serverTimestamp();
      tx.set(paymentRef, {
        coachId: trainer.uid,
        clientId: parsed.clientId,
        amount: parsed.amount,
        currency: parsed.currency ?? billing?.plan?.currency ?? "ARS",
        paidCivil: parsed.paidCivil,
        method: parsed.method,
        methodNote: parsed.methodNote,
        covers: parsed.covers,
        planName: billing?.plan?.name ?? null,
        note: parsed.note,
        createdAt: now,
        voidedAt: null,
        voidReason: null,
      });
      if (billing) {
        // Sin plan no hay vencimiento que correr: sólo se guarda el último pago.
        const hasPlan = billing.planId != null || billing.plan != null;
        const due = hasPlan
          ? applyPayment(toBillingLike(billing), parsed.covers, parsed.paidCivil)
          : { nextDueCivil: billing.nextDueCivil, classesRemaining: billing.classesRemaining };
        tx.update(billingRef, {
          nextDueCivil: due.nextDueCivil,
          classesRemaining: due.classesRemaining,
          lastPaymentCivil: parsed.paidCivil,
          lastPaymentAmount: parsed.amount,
          updatedAt: now,
        });
      } else {
        tx.set(billingRef, {
          coachId: trainer.uid,
          clientId: parsed.clientId,
          planId: null,
          plan: null,
          amount: null,
          startCivil: null,
          nextDueCivil: null,
          classesRemaining: null,
          reminderDaysBefore: 3,
          lastPaymentCivil: parsed.paidCivil,
          lastPaymentAmount: parsed.amount,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    return { ok: true, id: paymentRef.id };
  } catch (err) {
    return toActionFailure(err);
  }
}

async function nonVoidedPaymentsOf(
  db: Db,
  coachId: string,
  clientId: string,
): Promise<ClientPaymentView[]> {
  const snap = await db
    .collection(FirestoreCollections.clientPayments)
    .where("coachId", "==", coachId)
    .where("clientId", "==", clientId)
    .get();
  return snap.docs
    .map((d) => decodePayment(d.id, d.data() as Raw))
    .filter((p) => !p.voidedAt)
    .sort(comparePaymentsDesc);
}

/**
 * Anula un pago (no se borra: queda en el historial). Si era el ÚLTIMO pago no anulado
 * del alumno, el mismo batch revierte su efecto en el billing (`Billing.revertPayment`)
 * y `lastPayment*` pasa al pago anterior; si no, sólo se marca el pago y el coach
 * corrige el vencimiento a mano.
 */
export async function voidClientPayment(
  input: unknown,
): Promise<ActionResult<{ revertedBilling: boolean }>> {
  try {
    const trainer = await getCurrentTrainer();
    const parsed = voidPaymentInputSchema.parse(input);
    const db = gcFitnessFirestore();
    const paymentRef = db.collection(FirestoreCollections.clientPayments).doc(parsed.paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists || paymentSnap.get("coachId") !== trainer.uid) {
      throw new Error("Forbidden");
    }
    const payment = decodePayment(paymentSnap.id, paymentSnap.data() as Raw);
    if (payment.voidedAt) throw new Error("This payment is already voided.");

    const live = await nonVoidedPaymentsOf(db, trainer.uid, payment.clientId);
    const isLast = live.length > 0 && live[0]!.id === payment.id;

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.update(paymentRef, { voidedAt: now, voidReason: parsed.reason });

    let revertedBilling = false;
    if (isLast) {
      const billingRef = db
        .collection(FirestoreCollections.clientBilling)
        .doc(billingDocId(trainer.uid, payment.clientId));
      const billingSnap = await billingRef.get();
      if (billingSnap.exists && billingSnap.get("coachId") === trainer.uid) {
        const billing = decodeBilling(billingSnap.data() as Raw);
        const due = revertPayment(toBillingLike(billing), payment.covers);
        const previous = live[1] ?? null;
        batch.update(billingRef, {
          nextDueCivil: due.nextDueCivil,
          classesRemaining: due.classesRemaining,
          lastPaymentCivil: previous ? previous.paidCivil : null,
          lastPaymentAmount: previous ? previous.amount : null,
          updatedAt: now,
        });
        revertedBilling = true;
      }
    }
    await batch.commit();
    return { ok: true, revertedBilling };
  } catch (err) {
    return toActionFailure(err);
  }
}

/**
 * Una página del historial, filtrable por alumno / mes / medio.
 *
 * Paginación por `paidCivil` (cursor exclusivo): la query trae `pageSize` pagos por
 * fecha desc, y el ÚLTIMO día de la página se completa con una query de igualdad para
 * no partir un día entre dos páginas. Índices: (coachId, paidCivil DESC) y (coachId,
 * clientId, paidCivil DESC) — los de la spec. El medio se filtra en memoria (sin un
 * índice más), juntando páginas hasta llenar una.
 */
async function queryPaymentsPage(
  db: Db,
  coachId: string,
  filters: PaymentFilters,
  cursor: string | null,
  pageSize: number,
): Promise<PaymentsPage> {
  const base = () => {
    let q = db
      .collection(FirestoreCollections.clientPayments)
      .where("coachId", "==", coachId);
    if (filters.clientId) q = q.where("clientId", "==", filters.clientId);
    return q;
  };
  let q = base();
  if (filters.month) {
    const { start, end } = monthBounds(filters.month);
    q = q.where("paidCivil", ">=", start).where("paidCivil", "<=", end);
  }
  if (cursor) q = q.where("paidCivil", "<", cursor);
  const first = await q.orderBy("paidCivil", "desc").limit(pageSize).get();
  const firstRows = first.docs.map((d) => decodePayment(d.id, d.data() as Raw));
  if (firstRows.length < pageSize) {
    return { payments: firstRows.sort(comparePaymentsDesc), nextCursor: null };
  }
  const lastDay = firstRows[firstRows.length - 1]!.paidCivil;
  const daySnap = await base().where("paidCivil", "==", lastDay).get();
  const rows = [
    ...firstRows.filter((p) => p.paidCivil !== lastDay),
    ...daySnap.docs.map((d) => decodePayment(d.id, d.data() as Raw)),
  ].sort(comparePaymentsDesc);
  return { payments: rows, nextCursor: lastDay };
}

const MAX_FILTER_ROUNDS = 10;

export async function listClientPayments(input: unknown = {}): Promise<PaymentsPage> {
  const trainer = await getCurrentTrainer();
  const parsed = paymentFiltersSchema.parse(input ?? {});
  const db = gcFitnessFirestore();
  const filters: PaymentFilters = {
    clientId: parsed.clientId ?? null,
    month: parsed.month ?? null,
    method: parsed.method ?? null,
  };
  let cursor = parsed.cursor ?? null;
  const out: ClientPaymentView[] = [];
  for (let round = 0; round < MAX_FILTER_ROUNDS; round += 1) {
    const page = await queryPaymentsPage(db, trainer.uid, filters, cursor, PAYMENTS_PAGE_SIZE);
    out.push(...page.payments.filter((p) => !filters.method || p.method === filters.method));
    cursor = page.nextCursor;
    if (!cursor || out.length >= PAYMENTS_PAGE_SIZE) break;
  }
  return { payments: out, nextCursor: cursor };
}

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 5000;

/** Todo el historial filtrado, para «Exportar CSV» (acotado a 5000 filas). */
export async function listClientPaymentsForExport(input: unknown = {}): Promise<ClientPaymentView[]> {
  const trainer = await getCurrentTrainer();
  const parsed = paymentFiltersSchema.parse(input ?? {});
  const db = gcFitnessFirestore();
  const filters: PaymentFilters = {
    clientId: parsed.clientId ?? null,
    month: parsed.month ?? null,
    method: parsed.method ?? null,
  };
  const out: ClientPaymentView[] = [];
  let cursor: string | null = null;
  do {
    const page = await queryPaymentsPage(db, trainer.uid, filters, cursor, EXPORT_PAGE_SIZE);
    out.push(...page.payments.filter((p) => !filters.method || p.method === filters.method));
    cursor = page.nextCursor;
  } while (cursor && out.length < EXPORT_MAX_ROWS);
  return out.slice(0, EXPORT_MAX_ROWS);
}

/** «Cobrado este mes» (pagos no anulados del mes civil del coach), por moneda. */
export async function getCollectedThisMonth(): Promise<{
  month: string;
  totals: Array<{ currency: string; amount: number }>;
}> {
  const trainer = await getCurrentTrainer();
  const month = civilDateToday(await getTrainerTimezone()).slice(0, 7);
  const { start, end } = monthBounds(month);
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.clientPayments)
    .where("coachId", "==", trainer.uid)
    .where("paidCivil", ">=", start)
    .where("paidCivil", "<=", end)
    // El orden igual al índice de la spec (coachId ASC, paidCivil DESC).
    .orderBy("paidCivil", "desc")
    .get();
  const payments = snap.docs.map((d) => decodePayment(d.id, d.data() as Raw));
  return { month, totals: sumByCurrency(payments) };
}

/** El nombre del coach para firmar el recordatorio («— Ana»). */
export async function getCoachDisplayName(): Promise<string> {
  const trainer = await getCurrentTrainer();
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(trainer.uid)
    .get();
  const name = snap.exists ? snap.get("displayName") : null;
  if (typeof name === "string" && name.trim()) return name.trim();
  return trainer.email.split("@")[0] ?? "";
}
