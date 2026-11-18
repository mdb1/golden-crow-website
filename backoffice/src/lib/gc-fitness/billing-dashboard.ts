// billing-dashboard.ts — gc-fitness #1695: el tablero de cobros del coach (métricas,
// serie de 12 meses, MRR y proyecciones a 3/6/12 meses) + el filtro de «Facturación».
//
// GEMELO de:
//   gc-fitness/iOS/Packages/GCFitnessCore/…/BillingDashboard.swift (`BillingDashboard` + `BillingExport`)
//   gc-fitness/android/core/…/algorithms/BillingDashboard.kt
// Los tres corren la MISMA tabla: `__tests__/twin-vectors/billing-dashboard-vectors.json`, copia
// fijada del archivo único de gc-fitness `twin-vectors/` (drift: `scripts/check-twin-vectors.py`).
// El CSV del tablero es el mismo `buildPaymentsCsv` del historial (payments-model.ts), que ya es
// el gemelo TS del CSV de las apps.
//
// Definiciones (iguales en los tres lados):
//   - Ventana: pagos NO anulados con `paidCivil >= loadFrom(today)` (1° del mes de 14 meses atrás)
//     y mes <= el actual. La serie son los 12 meses que terminan en el actual; los 3 primeros
//     meses cargados sólo sirven para clasificar (no se cuentan altas ahí).
//   - Cobertura de un pago: `covers.kind == months` ⇒ `addMonths(paidCivil, max(1, months ?? 1))`;
//     cualquier otro (clases / rutina / otro) ⇒ un mes.
//   - Racha activa por cliente (pagos por paidCivil, id): un pago hasta `fin de cobertura + 30 días`
//     la extiende; uno posterior la cierra (baja = fin + 31 días) y abre otra.
//   - La ÚLTIMA racha usa el `client_billing` actual: plan por clases con saldo > 0 ⇒ abierta;
//     plan con `nextDueCivil` ⇒ fin = max(nextDueCivil, inicio), gracia 30; plan sin eso ⇒
//     cobertura, gracia 30; SIN plan (sin billing o plan sacado) ⇒ gracia 0. Baja = fin + gracia
//     + 1; si cae después de hoy, la racha sigue abierta.
//   - Nuevos en M = rachas que empiezan en M (un cliente que vuelve cuenta como nuevo).
//     Bajas en M = rachas cuya baja cae en M (y <= hoy).
//   - Tasa de baja = Σ bajas de los 6 meses COMPLETOS anteriores al actual ÷ Σ activos al cierre
//     del mes previo a cada uno; null si ese denominador es 0; tope 1.
//   - Proyección = Σ_{k=1..h} mrr·(1−r)^k (iterativa), por moneda, NUNCA mezcladas.
// Todo puro: fechas civiles `YYYY-MM-DD`, sin `Date` del host.

import { status, type BillingPlanSnapshot, type PaymentCovers } from "./billing";

export const DASHBOARD_GRACE_DAYS = 30;
export const DASHBOARD_SERIES_MONTHS = 12;
export const DASHBOARD_LOOKBACK_MONTHS = 3;
export const DASHBOARD_CHURN_WINDOW_MONTHS = 6;
export const DASHBOARD_HORIZONS = [3, 6, 12] as const;

const METHOD_ORDER = ["cash", "transfer", "mercadopago", "card", "other"] as const;

/** Lo que el tablero lee de un pago (estructural: `ClientPaymentView` lo cumple). */
export interface DashboardPayment {
  id: string;
  clientId: string;
  amount: number;
  currency: string | null;
  paidCivil: string;
  method: string;
  covers: PaymentCovers | null;
  planName?: string | null;
  voidedAt: string | null;
}

/** Lo que el tablero lee de un billing (estructural: `ClientBillingView` lo cumple). */
export interface DashboardBilling {
  clientId: string;
  planId: string | null;
  plan: BillingPlanSnapshot | null;
  amount: number | null;
  startCivil: string | null;
  nextDueCivil: string | null;
  classesRemaining: number | null;
  reminderDaysBefore: number | null;
}

export interface Money {
  currency: string;
  amount: number;
}

export interface MethodAmount {
  currency: string;
  method: string;
  amount: number;
}

export interface MonthStats {
  month: string;
  collected: Money[];
  payments: number;
  paying: number;
  newClients: number;
  churned: number;
  activeAtEnd: number;
  avgTicket: Money[];
  byMethod: MethodAmount[];
}

export interface StatusCounts {
  upToDate: number;
  dueSoon: number;
  overdue: number;
}

export interface Rates {
  optimistic: number;
  expected: number;
  pessimistic: number;
}

export interface Horizon {
  months: number;
  optimistic: number;
  expected: number;
  pessimistic: number;
}

export interface Projection {
  currency: string;
  mrr: number;
  horizons: Horizon[];
}

export interface BillingDashboard {
  month: string;
  previousMonth: string;
  loadFrom: string;
  primaryCurrency: string;
  series: MonthStats[];
  statusCounts: StatusCounts;
  mrr: Money[];
  recurringClients: number;
  churnRate: number | null;
  rates: Rates;
  projections: Projection[];
}

// ── fechas civiles (aritmética entera pura) ────────────────────────────────────

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function parse(civil: string): [number, number, number] {
  const [y, m, d] = civil.split("-").map(Number);
  return [y, m, d];
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Días desde 1970-01-01 (algoritmo de Hinnant). */
function dayNumber(civil: string): number {
  let [y] = parse(civil);
  const [, m, d] = parse(civil);
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilOf(dayNum: number): string {
  const z = dayNum + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y += 1;
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function addDaysCivil(civil: string, n: number): string {
  return civilOf(dayNumber(civil) + n);
}

function addMonthsCivil(civil: string, n: number): string {
  const [y, m, d] = parse(civil);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = total - yy * 12 + 1;
  return `${pad(yy, 4)}-${pad(mm, 2)}-${pad(Math.min(d, daysInMonth(yy, mm)), 2)}`;
}

function addMonthsYM(ym: string, n: number): string {
  return addMonthsCivil(`${ym}-01`, n).slice(0, 7);
}

function lastDay(ym: string): string {
  return `${ym}-${pad(daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))), 2)}`;
}

const maxCivil = (a: string, b: string) => (a >= b ? a : b);
const minCivil = (a: string, b: string) => (a <= b ? a : b);

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ── piezas ─────────────────────────────────────────────────────────────────────

/** Los 12 meses `YYYY-MM` de la serie, el más viejo primero. */
export function seriesMonths(today: string): string[] {
  const cur = today.slice(0, 7);
  return Array.from({ length: DASHBOARD_SERIES_MONTHS }, (_, i) => addMonthsYM(cur, -(DASHBOARD_SERIES_MONTHS - 1 - i)));
}

/** Desde qué `paidCivil` se cargan los pagos (12 meses + 3 de contexto). */
export function loadFromCivil(today: string): string {
  return `${addMonthsYM(today.slice(0, 7), -(DASHBOARD_SERIES_MONTHS - 1 + DASHBOARD_LOOKBACK_MONTHS))}-01`;
}

/** Hasta qué día cubre un pago. */
export function coverEnd(payment: Pick<DashboardPayment, "paidCivil" | "covers">): string {
  const covers = payment.covers;
  if (covers?.kind === "months") return addMonthsCivil(payment.paidCivil, Math.max(1, covers.months || 1));
  return addMonthsCivil(payment.paidCivil, 1);
}

/** Σ_{k=1..months} mrr·(1−rate)^k, iterativa, redondeada a centavos. */
export function project(mrr: number, rate: number, months: number): number {
  let factor = 1;
  let total = 0;
  for (let k = 0; k < months; k++) {
    factor *= 1 - rate;
    total += mrr * factor;
  }
  return round2(total);
}

function hasPlan(b: DashboardBilling | undefined): b is DashboardBilling {
  return !!b && (b.planId != null || b.plan != null);
}

function isClassBased(kind: string | undefined): boolean {
  return kind === "per_class" || kind === "class_pack";
}

function periodMonths(b: DashboardBilling): number | null {
  const plan = b.plan;
  if (!plan) return null;
  if (plan.kind === "monthly" || plan.kind === "months_pack") return Math.max(1, plan.periodMonths || 1);
  if (plan.kind === "custom" && plan.periodMonths) return Math.max(1, plan.periodMonths);
  return null;
}

function methodOf(method: string): string {
  return (METHOD_ORDER as readonly string[]).includes(method) ? method : "other";
}

interface Span {
  clientId: string;
  start: string;
  churn: string | null;
}

function byCivilThenId(a: DashboardPayment, b: DashboardPayment): number {
  if (a.paidCivil !== b.paidCivil) return a.paidCivil < b.paidCivil ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildSpans(live: DashboardPayment[], billings: DashboardBilling[], today: string): Span[] {
  const byClient = new Map<string, DashboardPayment[]>();
  for (const p of live) {
    const list = byClient.get(p.clientId) ?? [];
    list.push(p);
    byClient.set(p.clientId, list);
  }
  const billingOf = new Map<string, DashboardBilling>();
  for (const b of billings) if (!billingOf.has(b.clientId)) billingOf.set(b.clientId, b);

  const spans: Span[] = [];
  for (const clientId of [...byClient.keys()].sort()) {
    const ps = byClient.get(clientId)!;
    let start = ps[0].paidCivil;
    let end = coverEnd(ps[0]);
    for (const p of ps.slice(1)) {
      if (p.paidCivil <= addDaysCivil(end, DASHBOARD_GRACE_DAYS)) {
        end = maxCivil(end, coverEnd(p));
      } else {
        spans.push({ clientId, start, churn: addDaysCivil(end, DASHBOARD_GRACE_DAYS + 1) });
        start = p.paidCivil;
        end = coverEnd(p);
      }
    }
    const b = billingOf.get(clientId);
    let grace = DASHBOARD_GRACE_DAYS;
    let open = false;
    if (hasPlan(b)) {
      if (isClassBased(b.plan?.kind)) {
        if ((b.classesRemaining ?? 0) > 0) open = true;
      } else if (b.nextDueCivil) {
        end = maxCivil(b.nextDueCivil, start);
      }
    } else {
      grace = 0;
    }
    let churn: string | null = open ? null : addDaysCivil(end, grace + 1);
    if (churn !== null && churn > today) churn = null;
    spans.push({ clientId, start, churn });
  }
  return spans;
}

function perCurrency(sums: Map<string, number>): Money[] {
  return [...sums.keys()].sort().map((currency) => ({ currency, amount: round2(sums.get(currency)!) }));
}

function topCurrency(sums: Map<string, number>): string | null {
  const keys = [...sums.keys()].sort((a, b) => {
    const d = sums.get(b)! - sums.get(a)!;
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
  return keys[0] ?? null;
}

// ── el tablero ─────────────────────────────────────────────────────────────────

/**
 * El tablero completo. `billings` = los de los clientes ACTUALES (no pendientes de alta);
 * `payments` = todos los de la ventana (los anulados se descartan acá).
 */
export function computeBillingDashboard(
  payments: DashboardPayment[],
  billings: DashboardBilling[],
  today: string,
): BillingDashboard {
  const loadFrom = loadFromCivil(today);
  const current = today.slice(0, 7);
  const live = payments
    .filter((p) => !p.voidedAt && p.paidCivil >= loadFrom && p.paidCivil.slice(0, 7) <= current)
    .sort(byCivilThenId);
  const spans = buildSpans(live, billings, today);
  const months = seriesMonths(today);
  const seriesStart = `${months[0]}-01`;

  const activeAtEnd = (m: string) => {
    const e = minCivil(lastDay(m), today);
    return spans.filter((s) => s.start <= e && (s.churn === null || s.churn > e)).length;
  };

  const series: MonthStats[] = months.map((m) => {
    const mp = live.filter((p) => p.paidCivil.slice(0, 7) === m);
    const collected = new Map<string, number>();
    const count = new Map<string, number>();
    const methods = new Map<string, number>();
    for (const p of mp) {
      const c = p.currency || "ARS";
      collected.set(c, (collected.get(c) ?? 0) + p.amount);
      count.set(c, (count.get(c) ?? 0) + 1);
      const key = `${c}\u0000${methodOf(p.method)}`;
      methods.set(key, (methods.get(key) ?? 0) + p.amount);
    }
    const currencies = [...collected.keys()].sort();
    const byMethod: MethodAmount[] = [];
    for (const c of currencies) {
      for (const method of METHOD_ORDER) {
        const v = methods.get(`${c}\u0000${method}`);
        if (v !== undefined) byMethod.push({ currency: c, method, amount: round2(v) });
      }
    }
    return {
      month: m,
      collected: perCurrency(collected),
      payments: mp.length,
      paying: new Set(mp.map((p) => p.clientId)).size,
      newClients: spans.filter((s) => s.start.slice(0, 7) === m && s.start >= seriesStart).length,
      churned: spans.filter((s) => s.churn !== null && s.churn.slice(0, 7) === m).length,
      activeAtEnd: activeAtEnd(m),
      avgTicket: currencies.map((c) => ({ currency: c, amount: round2(collected.get(c)! / count.get(c)!) })),
      byMethod,
    };
  });

  let churned = 0;
  let base = 0;
  for (let i = DASHBOARD_SERIES_MONTHS - 1 - DASHBOARD_CHURN_WINDOW_MONTHS; i < DASHBOARD_SERIES_MONTHS - 1; i++) {
    churned += series[i].churned;
    base += series[i - 1].activeAtEnd;
  }
  const churnRate = base === 0 ? null : Math.min(1, churned / base);

  const mrr = new Map<string, number>();
  let recurringClients = 0;
  const statusCounts: StatusCounts = { upToDate: 0, dueSoon: 0, overdue: 0 };
  for (const b of billings) {
    const st = status(
      {
        planId: b.planId,
        plan: b.plan,
        startCivil: b.startCivil,
        nextDueCivil: b.nextDueCivil,
        classesRemaining: b.classesRemaining,
        reminderDaysBefore: b.reminderDaysBefore ?? 3,
      },
      today,
    ).state;
    if (st === "up_to_date") statusCounts.upToDate += 1;
    else if (st === "due_soon") statusCounts.dueSoon += 1;
    else if (st === "overdue") statusCounts.overdue += 1;
    if (!hasPlan(b) || !b.plan) continue;
    const pm = periodMonths(b);
    if (pm === null) continue;
    if (b.nextDueCivil && dayNumber(today) - dayNumber(b.nextDueCivil) > DASHBOARD_GRACE_DAYS) continue;
    const amount = b.amount ?? b.plan.amount ?? 0;
    const c = b.plan.currency || "ARS";
    mrr.set(c, (mrr.get(c) ?? 0) + amount / pm);
    recurringClients += 1;
  }
  const mrrList = perCurrency(mrr);

  const expected = churnRate ?? 0;
  const rates: Rates = {
    optimistic: expected * 0.5,
    expected,
    pessimistic: Math.min(1, Math.max(expected * 1.5, expected + 0.03)),
  };
  const projections: Projection[] = mrrList.map((item) => ({
    currency: item.currency,
    mrr: item.amount,
    horizons: DASHBOARD_HORIZONS.map((months) => ({
      months,
      optimistic: project(item.amount, rates.optimistic, months),
      expected: project(item.amount, rates.expected, months),
      pessimistic: project(item.amount, rates.pessimistic, months),
    })),
  }));

  const totals = new Map<string, number>();
  for (const p of live) {
    const c = p.currency || "ARS";
    totals.set(c, (totals.get(c) ?? 0) + p.amount);
  }
  const primaryCurrency = topCurrency(totals) ?? topCurrency(mrr) ?? "ARS";

  return {
    month: months[months.length - 1],
    previousMonth: months[months.length - 2],
    loadFrom,
    primaryCurrency,
    series,
    statusCounts,
    mrr: mrrList,
    recurringClients,
    churnRate,
    rates,
    projections,
  };
}

// ── Facturación (filtro + opciones; el CSV es `buildPaymentsCsv`) ──────────────

export interface BillingFilter {
  month?: string | null;
  clientId?: string | null;
  planName?: string | null;
  method?: string | null;
}

export function matchesBillingFilter(p: DashboardPayment, f: BillingFilter): boolean {
  if (f.month && !p.paidCivil.startsWith(`${f.month}-`)) return false;
  if (f.clientId && p.clientId !== f.clientId) return false;
  if (f.planName && (p.planName ?? "") !== f.planName) return false;
  if (f.method && methodOf(p.method) !== f.method) return false;
  return true;
}

/** Lo que pasa el filtro, el más nuevo primero (paidCivil desc, id desc). */
export function filterBillingPayments<T extends DashboardPayment>(payments: T[], f: BillingFilter): T[] {
  return payments.filter((p) => matchesBillingFilter(p, f)).sort((a, b) => -byCivilThenId(a, b));
}

/** Los nombres de plan de la ventana, ordenados (para el filtro «Plan»). */
export function billingPlanOptions(payments: Array<Pick<DashboardPayment, "planName">>): string[] {
  return [...new Set(payments.map((p) => p.planName).filter((n): n is string => !!n))].sort();
}

/** Los meses `YYYY-MM` que aparecen en la ventana, el más nuevo primero. */
export function billingMonthOptions(payments: Array<Pick<DashboardPayment, "paidCivil">>): string[] {
  return [...new Set(payments.map((p) => p.paidCivil.slice(0, 7)))].sort().reverse();
}
