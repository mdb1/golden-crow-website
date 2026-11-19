"use server";

// payment-details-actions.ts — gc-fitness #1697: los «Datos de cobro» del coach (alias, CBU,
// banco, link de pago), el texto libre que sale en el «Aviso de pago» y en el «Recordar».
//
// Vive en `users/{coachUid}.paymentDetails` (string ≤ 500 o null) — el mismo campo que las
// apps escriben con el SDK del cliente (la regla de `users/{uid}` lo admite sólo en el doc
// propio). Admin SDK ⇒ las reglas NO corren acá: la action escribe SIEMPRE el doc de la
// sesión, nunca uno que venga del input, y re-valida el tope.
//
// Archivo nuevo a propósito (#382): agregar actions a un módulo nuevo no mueve el ID de
// ninguna existente. "use server" ⇒ sólo funciones async exportadas (#785). Toda action que
// dispara un coach DEVUELVE su error (`ActionResult`, #1104).

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { toActionFailure, type ActionResult } from "./action-result";
import { getCurrentTrainer } from "./auth-helpers";
import { PAYMENT_DETAILS_MAX_LENGTH, normalizedPaymentDetails } from "./billing";
import { FirestoreCollections } from "./collections";

const inputSchema = z.object({
  paymentDetails: z.string().max(PAYMENT_DETAILS_MAX_LENGTH * 4).nullable(),
});

/** Los datos de cobro del coach de la sesión (null = no cargó nada). */
export async function getCoachPaymentDetails(): Promise<string | null> {
  const trainer = await getCurrentTrainer();
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(trainer.uid)
    .get();
  const raw = snap.exists ? snap.get("paymentDetails") : null;
  return typeof raw === "string" ? normalizedPaymentDetails(raw) : null;
}

/**
 * Guarda los datos de cobro en el doc PROPIO. En blanco = `null` (se borran). Más de 500
 * caracteres (después de normalizar) se rechaza, igual que la regla para las apps.
 */
export async function updateCoachPaymentDetails(
  input: unknown,
): Promise<ActionResult<{ paymentDetails: string | null }>> {
  try {
    const trainer = await getCurrentTrainer();
    const parsed = inputSchema.parse(input);
    const value = normalizedPaymentDetails(parsed.paymentDetails);
    if (value !== null && value.length > PAYMENT_DETAILS_MAX_LENGTH) {
      return { ok: false, error: `Up to ${PAYMENT_DETAILS_MAX_LENGTH} characters.` };
    }
    await gcFitnessFirestore()
      .collection(FirestoreCollections.users)
      .doc(trainer.uid)
      .set({ paymentDetails: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, paymentDetails: value };
  } catch (err) {
    return toActionFailure(err);
  }
}
