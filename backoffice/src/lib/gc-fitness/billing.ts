// billing.ts — gc-fitness #1540: pagos y cobros de los alumnos (manual).
//
// GEMELO de:
//   gc-fitness/iOS/Packages/GCFitnessCore/…/Billing.swift
//   gc-fitness/android/core/…/Billing.kt
//   gc-fitness/functions/src/billing/billing.ts
// Los cuatro lados implementan la MISMA semántica (spec común de #1540) y tienen la
// misma tabla de casos en sus tests. Un cambio acá sin el cambio allá hace que el
// backoffice diga «Vencido» y el teléfono del coach «Al día» para el mismo alumno.
//
// Todo es puro: fechas como strings civiles `YYYY-MM-DD`, sin `Date` del host ni zona
// horaria (el «hoy» lo resuelve quien llama, en la zona del coach — #747).

import { civilDaysBetween, parseCivilYMD } from "./civil-date";

export const BILLING_PLAN_KINDS = [
  "per_class",
  "class_pack",
  "per_routine",
  "monthly",
  "months_pack",
  "custom",
] as const;
export type BillingPlanKind = (typeof BILLING_PLAN_KINDS)[number];

export const BILLING_MODALITIES = ["online", "in_person", "hybrid"] as const;
export type BillingModality = (typeof BILLING_MODALITIES)[number];

export const PAYMENT_METHODS = ["cash", "transfer", "mercadopago", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_COVERS_KINDS = ["months", "classes", "routine", "other"] as const;
export type PaymentCoversKind = (typeof PAYMENT_COVERS_KINDS)[number];

export type BillingState = "none" | "up_to_date" | "due_soon" | "overdue";

/** Snapshot del plan guardado en `client_billing.plan` al asignarlo. */
export interface BillingPlanSnapshot {
  name: string;
  kind: BillingPlanKind;
  modality: BillingModality | null;
  amount: number;
  currency: string;
  periodMonths: number | null;
  classCount: number | null;
  description: string | null;
}

/** Los campos de `client_billing` que leen las funciones puras. */
export interface BillingLike {
  planId: string | null;
  plan: BillingPlanSnapshot | null;
  startCivil: string | null;
  nextDueCivil: string | null;
  classesRemaining: number | null;
  reminderDaysBefore: number;
}

export interface PaymentCovers {
  kind: PaymentCoversKind;
  months: number | null;
  classes: number | null;
}

export interface BillingStatus {
  state: BillingState;
  days: number;
}

export interface BillingDueUpdate {
  nextDueCivil: string | null;
  classesRemaining: number | null;
}

export const DEFAULT_REMINDER_DAYS_BEFORE = 3;

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function daysInMonth(year: number, month: number): number {
  // month 1..12; día 0 del mes siguiente = último día de este.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Suma `n` meses (puede ser negativo) a una fecha civil: mismo día del mes, y si ese
 * día no existe, el último día del mes destino (31 ene + 1 = 28/29 feb; 29 feb + 12 =
 * 28 feb). Devuelve la entrada sin cambios si no es una fecha civil válida.
 */
export function addMonths(civil: string, n: number): string {
  const ymd = parseCivilYMD(civil);
  if (!ymd) return civil;
  const total = ymd.year * 12 + (ymd.month - 1) + Math.trunc(n);
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  const day = Math.min(ymd.day, daysInMonth(year, month));
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function isClassBased(kind: BillingPlanKind | undefined | null): boolean {
  return kind === "class_pack" || kind === "per_class";
}

/** Estado de cobro de un alumno, en el orden exacto de la spec. */
export function status(billing: BillingLike | null | undefined, today: string): BillingStatus {
  if (!billing || (billing.planId == null && billing.plan == null)) {
    return { state: "none", days: 0 };
  }
  if (isClassBased(billing.plan?.kind)) {
    const remaining = billing.classesRemaining ?? 0;
    if (remaining <= 0) return { state: "overdue", days: 0 };
    return { state: "up_to_date", days: remaining };
  }
  if (billing.nextDueCivil == null) {
    return { state: "up_to_date", days: 0 };
  }
  const d = civilDaysBetween(today, billing.nextDueCivil);
  if (d === null) return { state: "up_to_date", days: 0 };
  if (d < 0) return { state: "overdue", days: -d };
  if (d <= billing.reminderDaysBefore) return { state: "due_soon", days: d };
  return { state: "up_to_date", days: d };
}

function coveredMonths(billing: BillingLike, covers: PaymentCovers): number {
  return covers.months ?? billing.plan?.periodMonths ?? 1;
}

function coveredClasses(billing: BillingLike, covers: PaymentCovers): number {
  return covers.classes ?? billing.plan?.classCount ?? 1;
}

/**
 * Efecto de registrar un pago. Pagar por adelantado corre desde el vencimiento
 * VIGENTE, no desde hoy.
 */
export function applyPayment(
  billing: BillingLike,
  covers: PaymentCovers,
  paidCivil: string,
): BillingDueUpdate {
  const current: BillingDueUpdate = {
    nextDueCivil: billing.nextDueCivil,
    classesRemaining: billing.classesRemaining,
  };
  if (covers.kind === "months") {
    const base = billing.nextDueCivil ?? billing.startCivil ?? paidCivil;
    return { ...current, nextDueCivil: addMonths(base, coveredMonths(billing, covers)) };
  }
  if (covers.kind === "classes") {
    return {
      ...current,
      classesRemaining: (billing.classesRemaining ?? 0) + coveredClasses(billing, covers),
    };
  }
  return current;
}

/** La inversa exacta de `applyPayment` (para anular el último pago). */
export function revertPayment(billing: BillingLike, covers: PaymentCovers): BillingDueUpdate {
  const current: BillingDueUpdate = {
    nextDueCivil: billing.nextDueCivil,
    classesRemaining: billing.classesRemaining,
  };
  if (covers.kind === "months") {
    if (billing.nextDueCivil == null) return current;
    return {
      ...current,
      nextDueCivil: addMonths(billing.nextDueCivil, -coveredMonths(billing, covers)),
    };
  }
  if (covers.kind === "classes") {
    return {
      ...current,
      classesRemaining: Math.max(
        0,
        (billing.classesRemaining ?? 0) - coveredClasses(billing, covers),
      ),
    };
  }
  return current;
}

/** Descuenta una clase del saldo (nunca por debajo de cero). */
export function consumeClass(billing: Pick<BillingLike, "classesRemaining">): number {
  return Math.max(0, (billing.classesRemaining ?? 0) - 1);
}

/**
 * Qué cubre por defecto un pago según el tipo de plan (el prellenado de «Registrar
 * pago»): mensual ⇒ 1 mes; pack ⇒ N meses; clases ⇒ classCount.
 */
export function defaultCovers(plan: BillingPlanSnapshot | null | undefined): PaymentCovers {
  switch (plan?.kind) {
    case "monthly":
      return { kind: "months", months: plan.periodMonths ?? 1, classes: null };
    case "months_pack":
      return { kind: "months", months: plan.periodMonths ?? 1, classes: null };
    case "class_pack":
      return { kind: "classes", months: null, classes: plan.classCount ?? 1 };
    case "per_class":
      return { kind: "classes", months: null, classes: 1 };
    case "per_routine":
      return { kind: "routine", months: null, classes: null };
    case "custom":
      return plan.periodMonths != null
        ? { kind: "months", months: plan.periodMonths, classes: null }
        : { kind: "other", months: null, classes: null };
    default:
      return { kind: "other", months: null, classes: null };
  }
}

/** Monto efectivo del alumno: el precio especial si lo tiene, si no el del plan. */
export function effectiveAmount(billing: {
  amount?: number | null;
  plan: BillingPlanSnapshot | null;
} | null | undefined): number | null {
  if (!billing) return null;
  if (typeof billing.amount === "number") return billing.amount;
  return billing.plan?.amount ?? null;
}

/**
 * Monto con el formateador de moneda de la plataforma (`$ 25.000` en es-AR). Es la
 * ÚNICA parte del recordatorio que puede diferir entre plataformas.
 */
export function formatBillingAmount(lang: "es" | "en", amount: number, currency: string): string {
  const locale = lang === "es" ? "es-AR" : "en-US";
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDueDate(lang: "es" | "en", civil: string): string | null {
  const ymd = parseCivilYMD(civil);
  if (!ymd) return null;
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));
  // es: «16 de noviembre» (d de MMMM) · en: «November 16» (MMMM d).
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/** Texto que el coach comparte por WhatsApp / share sheet (sin push al alumno). */
export function reminderText(
  lang: "es" | "en",
  coachName: string,
  clientFirstName: string,
  amount: number,
  currency: string,
  dueCivil?: string | null,
): string {
  const money = formatBillingAmount(lang, amount, currency);
  const due = dueCivil ? formatDueDate(lang, dueCivil) : null;
  if (lang === "es") {
    const dueClause = due ? `que vence el ${due}` : "pendiente";
    return `Hola ${clientFirstName}! Te recuerdo el pago de ${money} ${dueClause}. ¡Gracias! — ${coachName}`;
  }
  const dueClause = due ? `due on ${due}` : "that is pending";
  return `Hi ${clientFirstName}! A reminder about your ${money} payment ${dueClause}. Thanks! — ${coachName}`;
}

/** Link de WhatsApp con el texto ya escrito (el coach elige el contacto). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
