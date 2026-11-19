"use server";

// billing-dashboard-actions.ts — gc-fitness #1695: los datos del «Tablero» de /payments.
//
// Archivo PROPIO a propósito: agregar la action acá no mueve ningún id de las de
// `payments-actions.ts` (deploy skew, #382). "use server" ⇒ sólo funciones async (#785).
// Devuelve su error (`ActionResult`, #1104).
//
// Lecturas: el roster (cacheado), UNA query de billings (`coachId == uid`) y UNA de pagos
// `coachId == uid, paidCivil >= loadFrom` ordenada `paidCivil desc` — la forma del índice
// (coachId ASC, paidCivil DESC) ya desplegado: no hace falta índice nuevo. Tope 5000 pagos.
// El cálculo es el gemelo puro `billing-dashboard.ts` (mismo resultado que las apps).

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { toActionFailure, type ActionResult } from "./action-result";
import { getCurrentTrainer } from "./auth-helpers";
import { computeBillingDashboard, loadFromCivil, type BillingDashboard } from "./billing-dashboard";
import { civilDateToday } from "./civil-date";
import { coachVisibleClientName } from "./client-name";
import { listClients } from "./client-roster";
import { FirestoreCollections } from "./collections";
import { decodeBilling, decodePayment, type ClientPaymentView } from "./payments-model";
import { getTrainerTimezone } from "./trainer-timezone";

type Raw = Record<string, unknown>;

const DASHBOARD_MAX_PAYMENTS = 5000;

export interface BillingDashboardData {
  todayCivil: string;
  dashboard: BillingDashboard;
  /** Los pagos de la ventana (anulados incluidos, para la tabla de Facturación y el CSV). */
  payments: ClientPaymentView[];
  /** Los clientes actuales (para el filtro y los nombres del CSV). */
  clients: Array<{ id: string; name: string }>;
  /** true si la ventana tenía más pagos que el tope (el tablero mira los 5000 más nuevos). */
  truncated: boolean;
}

export async function getBillingDashboardData(): Promise<ActionResult<{ data: BillingDashboardData }>> {
  try {
    const trainer = await getCurrentTrainer();
    const db = gcFitnessFirestore();
    const [roster, timezone] = await Promise.all([listClients(), getTrainerTimezone()]);
    const todayCivil = civilDateToday(timezone);
    const loadFrom = loadFromCivil(todayCivil);
    const [billingSnap, paymentSnap] = await Promise.all([
      db.collection(FirestoreCollections.clientBilling).where("coachId", "==", trainer.uid).get(),
      db
        .collection(FirestoreCollections.clientPayments)
        .where("coachId", "==", trainer.uid)
        .where("paidCivil", ">=", loadFrom)
        .orderBy("paidCivil", "desc")
        .limit(DASHBOARD_MAX_PAYMENTS)
        .get(),
    ]);

    // Sólo clientes reales y actuales: a un pendiente de alta todavía no se le cobra, y el
    // billing de un ex cliente no suma al MRR ni a los contadores.
    const clients = roster.filter((c) => !c.pendingProvisioning);
    const current = new Set(clients.map((c) => c.uid));
    const billings = billingSnap.docs.map((d) => decodeBilling(d.data() as Raw)).filter((b) => current.has(b.clientId));
    const payments = paymentSnap.docs.map((d) => decodePayment(d.id, d.data() as Raw));

    return {
      ok: true,
      data: {
        todayCivil,
        dashboard: computeBillingDashboard(payments, billings, todayCivil),
        payments,
        clients: clients.map((c) => ({ id: c.uid, name: coachVisibleClientName(c) })),
        truncated: payments.length >= DASHBOARD_MAX_PAYMENTS,
      },
    };
  } catch (err) {
    return toActionFailure(err);
  }
}
