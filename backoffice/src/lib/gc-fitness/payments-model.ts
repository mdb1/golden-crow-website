// payments-model.ts — gc-fitness #1540: pagos y cobros de los alumnos (manual).
//
// Lo que NO puede vivir en `payments-actions.ts` ("use server" ⇒ sólo exports async,
// #785): los esquemas de entrada, la normalización de un plan según su tipo, los
// decodificadores de los documentos (Timestamp → ISO para cruzar a un client
// component) y el armado del CSV. Todo puro.
//
// Los nombres de campos y los valores de los enums son el contrato común con las
// reglas, las functions y las dos apps: NO se cambian acá sin cambiarlos allá.

import { z } from "zod";

import {
  BILLING_MODALITIES,
  BILLING_PLAN_KINDS,
  DEFAULT_REMINDER_DAYS_BEFORE,
  PAYMENT_COVERS_KINDS,
  PAYMENT_METHODS,
  type BillingModality,
  type BillingPlanKind,
  type BillingPlanSnapshot,
  type PaymentCovers,
  type PaymentMethod,
} from "./billing";

// ── Tipos que cruzan al cliente (serializables) ─────────────────────────────────

export interface PaymentPlan extends BillingPlanSnapshot {
  id: string;
  archived: boolean;
}

export interface ClientBillingView {
  clientId: string;
  planId: string | null;
  plan: BillingPlanSnapshot | null;
  amount: number | null;
  startCivil: string | null;
  nextDueCivil: string | null;
  classesRemaining: number | null;
  reminderDaysBefore: number;
  lastPaymentCivil: string | null;
  lastPaymentAmount: number | null;
}

export interface ClientPaymentView {
  id: string;
  clientId: string;
  amount: number;
  currency: string;
  paidCivil: string;
  method: PaymentMethod;
  methodNote: string | null;
  covers: PaymentCovers;
  planName: string | null;
  note: string | null;
  createdAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface PaymentsPage {
  payments: ClientPaymentView[];
  /** `paidCivil` desde el que sigue la próxima página (exclusivo), o null. */
  nextCursor: string | null;
}

export interface PaymentFilters {
  clientId?: string | null;
  /** `YYYY-MM` */
  month?: string | null;
  method?: PaymentMethod | null;
}

// ── Esquemas de entrada ──────────────────────────────────────────────────────────

const CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const civilDate = z.string().regex(CIVIL, "Enter a valid date.");
const money = z
  .number()
  .finite()
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
    message: "Use at most two decimals.",
  });
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code (ARS, USD…).");
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((s) => {
      const trimmed = (s ?? "").trim();
      return trimmed.length > 0 ? trimmed : null;
    });
const clientIdSchema = z.string().trim().min(1).max(160);

export const paymentPlanInputSchema = z.object({
  id: z.string().trim().min(1).max(160).nullish(),
  name: z.string().trim().min(1, "Enter a name.").max(80),
  kind: z.enum(BILLING_PLAN_KINDS),
  modality: z.enum(BILLING_MODALITIES).nullish(),
  amount: money.min(0, "The amount can't be negative."),
  currency: currency.default("ARS"),
  periodMonths: z.number().int().nullish(),
  classCount: z.number().int().nullish(),
  description: optionalText(1000),
});
export type PaymentPlanInput = z.input<typeof paymentPlanInputSchema>;

/** Los campos de `coach_payment_plans` (sin coachId/archived/timestamps). */
export type NormalizedPlanFields = BillingPlanSnapshot;

/**
 * Normaliza `periodMonths` / `classCount` según el tipo (tabla de la spec):
 * monthly ⇒ 1 · months_pack ⇒ 2–24 · custom ⇒ 1–24 o null · class_pack ⇒ clases 1–200 ·
 * el resto, null. Tira un Error con un mensaje mostrable si no cumple.
 */
export function normalizePlanInput(input: unknown): NormalizedPlanFields & { id: string | null } {
  const parsed = paymentPlanInputSchema.parse(input);
  let periodMonths: number | null = null;
  let classCount: number | null = null;
  switch (parsed.kind) {
    case "monthly":
      periodMonths = 1;
      break;
    case "months_pack":
      periodMonths = parsed.periodMonths ?? null;
      if (periodMonths == null || periodMonths < 2 || periodMonths > 24) {
        throw new Error("A multi-month pack covers 2 to 24 months.");
      }
      break;
    case "custom":
      periodMonths = parsed.periodMonths ?? null;
      if (periodMonths != null && (periodMonths < 1 || periodMonths > 24)) {
        throw new Error("The period must be 1 to 24 months.");
      }
      break;
    case "class_pack":
      classCount = parsed.classCount ?? null;
      if (classCount == null || classCount < 1 || classCount > 200) {
        throw new Error("A class pack has 1 to 200 classes.");
      }
      break;
    default:
      break;
  }
  return {
    id: parsed.id ?? null,
    name: parsed.name,
    kind: parsed.kind,
    modality: parsed.modality ?? null,
    amount: parsed.amount,
    currency: parsed.currency,
    periodMonths,
    classCount,
    description: parsed.description,
  };
}

/** True si el plan genera vencimientos (`nextDueCivil`). */
export function planIsPeriodic(plan: Pick<BillingPlanSnapshot, "kind" | "periodMonths"> | null): boolean {
  if (!plan) return false;
  if (plan.kind === "monthly" || plan.kind === "months_pack") return true;
  return plan.kind === "custom" && plan.periodMonths != null;
}

/** True si el plan lleva saldo de clases. */
export function planHasClassBalance(plan: Pick<BillingPlanSnapshot, "kind"> | null): boolean {
  return plan?.kind === "class_pack" || plan?.kind === "per_class";
}

export const assignPlanInputSchema = z.object({
  clientId: clientIdSchema,
  planId: z.string().trim().min(1).max(160).nullable(),
  /** Precio especial; null ⇒ el del plan. */
  amount: money.min(0).nullish(),
  startCivil: civilDate.nullish(),
  /** undefined ⇒ se calcula (el vigente o el inicio); null ⇒ sin vencimiento. */
  nextDueCivil: civilDate.nullish(),
  reminderDaysBefore: z.number().int().min(0).max(30).default(DEFAULT_REMINDER_DAYS_BEFORE),
});
export type AssignPlanInput = z.input<typeof assignPlanInputSchema>;

export const coversSchema = z
  .object({
    kind: z.enum(PAYMENT_COVERS_KINDS),
    months: z.number().int().min(1).max(24).nullish(),
    classes: z.number().int().min(1).max(200).nullish(),
  })
  .transform((c): PaymentCovers => ({
    kind: c.kind,
    months: c.kind === "months" ? (c.months ?? null) : null,
    classes: c.kind === "classes" ? (c.classes ?? null) : null,
  }));

export const recordPaymentInputSchema = z.object({
  clientId: clientIdSchema,
  amount: money.refine((n) => n > 0, { message: "The amount must be greater than zero." }),
  currency: currency.nullish(),
  paidCivil: civilDate,
  method: z.enum(PAYMENT_METHODS),
  methodNote: optionalText(120),
  covers: coversSchema,
  note: optionalText(500),
});
export type RecordPaymentInput = z.input<typeof recordPaymentInputSchema>;

export const voidPaymentInputSchema = z.object({
  paymentId: z.string().trim().min(1).max(160),
  reason: optionalText(200),
});

export const updateBillingInputSchema = z.object({
  clientId: clientIdSchema,
  nextDueCivil: civilDate.nullable(),
  classesRemaining: z.number().int().min(0).max(10000).nullable(),
  reminderDaysBefore: z.number().int().min(0).max(30),
});

export const paymentFiltersSchema = z.object({
  clientId: clientIdSchema.nullish(),
  month: z.string().regex(MONTH).nullish(),
  method: z.enum(PAYMENT_METHODS).nullish(),
  cursor: civilDate.nullish(),
});

export const PAYMENTS_PAGE_SIZE = 20;

// ── Decodificadores ──────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

export function isoOf(value: unknown): string | null {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return typeof value === "string" ? value : null;
}

function oneOf<T extends string>(values: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function decodePlanSnapshot(raw: unknown): BillingPlanSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return {
    name: str(r.name) ?? "",
    kind: oneOf<BillingPlanKind>(BILLING_PLAN_KINDS, r.kind, "custom"),
    modality: typeof r.modality === "string" && (BILLING_MODALITIES as readonly string[]).includes(r.modality)
      ? (r.modality as BillingModality)
      : null,
    amount: num(r.amount) ?? 0,
    currency: str(r.currency) ?? "ARS",
    periodMonths: int(r.periodMonths),
    classCount: int(r.classCount),
    description: str(r.description),
  };
}

export function decodePlan(id: string, raw: Raw): PaymentPlan {
  const snap = decodePlanSnapshot(raw) as BillingPlanSnapshot;
  return { id, ...snap, archived: raw.archived === true };
}

export function decodeBilling(raw: Raw): ClientBillingView {
  const reminder = int(raw.reminderDaysBefore);
  return {
    clientId: str(raw.clientId) ?? "",
    planId: str(raw.planId),
    plan: decodePlanSnapshot(raw.plan),
    amount: num(raw.amount),
    startCivil: str(raw.startCivil),
    nextDueCivil: str(raw.nextDueCivil),
    classesRemaining: int(raw.classesRemaining),
    reminderDaysBefore: reminder ?? DEFAULT_REMINDER_DAYS_BEFORE,
    lastPaymentCivil: str(raw.lastPaymentCivil),
    lastPaymentAmount: num(raw.lastPaymentAmount),
  };
}

export function decodeCovers(raw: unknown): PaymentCovers {
  const r = raw && typeof raw === "object" ? (raw as Raw) : {};
  return {
    kind: oneOf(PAYMENT_COVERS_KINDS, r.kind, "other"),
    months: int(r.months),
    classes: int(r.classes),
  };
}

export function decodePayment(id: string, raw: Raw): ClientPaymentView {
  return {
    id,
    clientId: str(raw.clientId) ?? "",
    amount: num(raw.amount) ?? 0,
    currency: str(raw.currency) ?? "ARS",
    paidCivil: str(raw.paidCivil) ?? "",
    method: oneOf(PAYMENT_METHODS, raw.method, "other"),
    methodNote: str(raw.methodNote),
    covers: decodeCovers(raw.covers),
    planName: str(raw.planName),
    note: str(raw.note),
    createdAt: isoOf(raw.createdAt),
    voidedAt: raw.voidedAt == null ? null : (isoOf(raw.voidedAt) ?? "voided"),
    voidReason: str(raw.voidReason),
  };
}

/** Orden del historial: fecha del pago (desc) y, dentro del día, el registrado último primero. */
export function comparePaymentsDesc(a: ClientPaymentView, b: ClientPaymentView): number {
  if (a.paidCivil !== b.paidCivil) return a.paidCivil < b.paidCivil ? 1 : -1;
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return ca < cb ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Suma de lo cobrado (pagos no anulados), por moneda. */
export function sumByCurrency(payments: ClientPaymentView[]): Array<{ currency: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const p of payments) {
    if (p.voidedAt) continue;
    totals.set(p.currency, Math.round(((totals.get(p.currency) ?? 0) + p.amount) * 100) / 100);
  }
  return [...totals.entries()]
    .map(([c, amount]) => ({ currency: c, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Primer y último día civil de un mes `YYYY-MM` (para las queries por rango). */
export function monthBounds(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-31` };
}

// ── CSV ──────────────────────────────────────────────────────────────────────────

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Una celda que empieza con = + - @ se ejecuta como fórmula en una planilla.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof value !== "number" ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface PaymentsCsvLabels {
  headers: [string, string, string, string, string, string, string, string, string, string];
  clientName: (clientId: string) => string;
  method: (method: PaymentMethod) => string;
  covers: (covers: PaymentCovers) => string;
  voided: string;
}

/** CSV del historial (RFC 4180, `\r\n`, con BOM para que Excel lea los acentos). */
export function buildPaymentsCsv(payments: ClientPaymentView[], labels: PaymentsCsvLabels): string {
  const lines = [labels.headers.map(csvCell).join(",")];
  for (const p of payments) {
    lines.push(
      [
        p.paidCivil,
        labels.clientName(p.clientId),
        p.amount,
        p.currency,
        labels.method(p.method),
        p.methodNote,
        labels.covers(p.covers),
        p.planName,
        p.note,
        p.voidedAt ? labels.voided : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ── Entrada de montos ────────────────────────────────────────────────────────────

const MONEY_ES_GROUPED = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;
const MONEY_EN_GROUPED = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;
const MONEY_SIMPLE = /^(\d+([.,]\d{1,2})?|[.,]\d{1,2})$/;

/**
 * Texto de un campo de monto → número, o NaN. A diferencia de `parseDecimalInput`
 * (pesos corporales, donde «2.000» es 2), acá un grupo de miles con punto ES miles:
 * en ARS «25.000» son veinticinco mil, no veinticinco.
 */
export function parseMoneyInput(raw: string): number {
  const text = raw.trim().replace(/[\s$]/g, "");
  if (MONEY_ES_GROUPED.test(text)) return Number(text.replace(/\./g, "").replace(",", "."));
  if (MONEY_EN_GROUPED.test(text)) return Number(text.replace(/,/g, ""));
  if (MONEY_SIMPLE.test(text)) return Number(text.replace(",", "."));
  return Number.NaN;
}

// ── Tablero de cobros ────────────────────────────────────────────────────────────

/** Nombre de pila para el saludo del recordatorio: apodo, o la 1ª palabra del nombre. */
export function clientFirstName(client: {
  displayName: string;
  email: string;
  coachNickname?: string | null;
}): string {
  const nickname = client.coachNickname?.trim();
  if (nickname) return nickname;
  const first = client.displayName.trim().split(/\s+/)[0];
  if (first) return first;
  return client.email.split("@")[0] ?? "";
}
