// payment-notice.ts — gc-fitness #1697: el «Aviso de pago» de UN cliente, como datos.
//
// Gemelo de lo que arman las apps (iOS `PaymentNotice`, Android `PaymentNotice`): MISMA
// entrada ⇒ MISMA tarjeta. Nada acá depende de «hoy» ni del reloj: el vencimiento es el
// `nextDueCivil` del cobro (los planes por clases no tienen vencimiento ⇒ «Pendiente») y el
// texto es `reminderText` con los datos de cobro, el mismo del «Recordar».
//
// No se llama «factura»: en Argentina la factura es un comprobante fiscal y esto no lo es.

import {
  effectiveAmount,
  formatBillingAmount,
  normalizedPaymentDetails,
  noticeDueDate,
  reminderText,
} from "./billing";
import { planHasClassBalance, type ClientBillingView } from "./payments-model";

export interface PaymentNoticeModel {
  clientName: string;
  coachName: string;
  planName: string | null;
  /** «$ 25.000» (el formateador de la plataforma, como en el resto de Cobros). */
  amountLabel: string;
  /** «16 de noviembre de 2026»; null = «Pendiente». */
  dueLabel: string | null;
  /** Los datos de cobro normalizados; null = el coach no cargó nada. */
  details: string | null;
  /** El texto que acompaña la imagen (WhatsApp, copiar, el pie del chat). */
  text: string;
  /** Nombre del archivo descargado, sin extensión. */
  fileStem: string;
}

/** El vencimiento que imprime el aviso: ninguno para un plan por clases. */
export function noticeDueCivil(billing: ClientBillingView | null): string | null {
  if (!billing) return null;
  if (planHasClassBalance(billing.plan ?? null)) return null;
  return billing.nextDueCivil ?? null;
}

function slug(value: string): string {
  const s = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "cliente";
}

export function buildPaymentNotice(input: {
  lang: "es" | "en";
  clientName: string;
  clientFirstName: string;
  coachName: string;
  billing: ClientBillingView | null;
  paymentDetails: string | null | undefined;
}): PaymentNoticeModel {
  const { lang, billing } = input;
  const amount = effectiveAmount(billing) ?? 0;
  const currency = billing?.plan?.currency ?? "ARS";
  const due = noticeDueCivil(billing);
  const details = normalizedPaymentDetails(input.paymentDetails);
  return {
    clientName: input.clientName,
    coachName: input.coachName,
    planName: billing?.plan?.name ?? null,
    amountLabel: formatBillingAmount(lang, amount, currency),
    dueLabel: due ? noticeDueDate(due, lang) : null,
    details,
    text: reminderText(lang, input.coachName, input.clientFirstName, amount, currency, due, details),
    fileStem: `${lang === "es" ? "aviso-de-pago" : "payment-notice"}-${slug(input.clientName)}${due ? `-${due}` : ""}`,
  };
}
