// billing-ai.ts — gc-fitness #1696: «Analizar facturación con IA» e «Imagen del mes» (Corvo).
//
// GEMELO de iOS `GCFitnessCore/CoachBillingAI.swift` y Android `:core` `CoachBillingAI.kt`; la
// misma tabla, `__tests__/twin-vectors/billing-ai-vectors.json` (copia fijada de gc-fitness
// `twin-vectors/`). Lo puro del cliente del callable `analyzeCoachBilling`
// (gc-fitness/functions/src/coachAI/billingAnalysis.ts): el payload (SÓLO agregados del tablero
// #1695 — sin nombres, ids ni notas), el cupo mensual, la decodificación de la respuesta / del doc
// guardado y el valor de cada dato de la tarjeta.
//
// La tarjeta: Corvo elige titular, recomendación y QUÉ 3 datos mostrar (claves de una lista fija);
// los NÚMEROS los pone el portal desde su propio tablero (`statValue`) — nunca el modelo.
//
// Wire (escrito SÓLO por el callable):
//   coach_ai_billing/{coachId}                 { usage: { month, analysis, card } }
//   coach_ai_billing/{coachId}/months/{YYYY-MM} { analysis: {summary, risks[], actions[], generatedAt},
//                                                card: {headline, stats[3], recommendation, generatedAt} }

import type { BillingDashboard, MonthStats, Projection } from "./billing-dashboard";

export const COACH_AI_BILLING_COLLECTION = "coach_ai_billing";
export const ANALYZE_COACH_BILLING_FUNCTION = "analyzeCoachBilling";

export type BillingAIKind = "analysis" | "card";
export const BILLING_AI_KINDS: readonly BillingAIKind[] = ["analysis", "card"];

/** Twin de `BILLING_AI_LIMITS` del servidor, hasta que una respuesta traiga los vigentes. */
export const DEFAULT_BILLING_AI_LIMITS: Readonly<Record<BillingAIKind, number>> = { analysis: 5, card: 5 };

export const CARD_STAT_KEYS = [
  "collected",
  "collectedDelta",
  "mrr",
  "paying",
  "newClients",
  "churned",
  "avgTicket",
  "projection3",
  "projection6",
  "projection12",
] as const;
export type CardStatKey = (typeof CARD_STAT_KEYS)[number];

// ── helpers del tablero ──────────────────────────────────────────────────────

const collectedIn = (m: MonthStats, c: string) => m.collected.find((x) => x.currency === c)?.amount ?? 0;
const avgTicketIn = (m: MonthStats, c: string) => m.avgTicket.find((x) => x.currency === c)?.amount ?? null;
const mrrIn = (d: BillingDashboard, c: string) => d.mrr.find((x) => x.currency === c)?.amount ?? 0;
const projectionIn = (d: BillingDashboard, c: string): Projection | null =>
  d.projections.find((p) => p.currency === c) ?? null;
const currentOf = (d: BillingDashboard) => d.series[d.series.length - 1];
const previousOf = (d: BillingDashboard) => d.series[d.series.length - 2];

/** Las monedas con algo que mostrar además de la principal (cobrado este mes o MRR). */
export function otherCurrencies(d: BillingDashboard): string[] {
  const all = new Set([...currentOf(d).collected.map((m) => m.currency), ...d.mrr.map((m) => m.currency)]);
  all.delete(d.primaryCurrency);
  return [...all].sort();
}

// ── payload ──────────────────────────────────────────────────────────────────

/** Lo único que viaja al servidor: números de este mes y del anterior en la moneda principal. */
export function billingAIPayload(d: BillingDashboard): Record<string, unknown> {
  const cur = d.primaryCurrency;
  const month = (m: MonthStats) => ({
    collected: collectedIn(m, cur),
    payments: m.payments,
    paying: m.paying,
    newClients: m.newClients,
    churned: m.churned,
    avgTicket: avgTicketIn(m, cur),
  });
  const current = currentOf(d);
  return {
    month: d.month,
    previousMonth: d.previousMonth,
    currency: cur,
    current: month(current),
    previous: month(previousOf(d)),
    mrr: mrrIn(d, cur),
    recurringClients: d.recurringClients,
    churnRate: d.churnRate === null ? null : Math.round(d.churnRate * 10_000) / 10_000,
    statusCounts: {
      upToDate: d.statusCounts.upToDate,
      dueSoon: d.statusCounts.dueSoon,
      overdue: d.statusCounts.overdue,
    },
    byMethod: current.byMethod.filter((m) => m.currency === cur).map((m) => ({ method: m.method, amount: m.amount })),
    projections: (projectionIn(d, cur)?.horizons ?? []).map((h) => ({
      months: h.months,
      optimistic: h.optimistic,
      expected: h.expected,
      pessimistic: h.pessimistic,
    })),
    series: d.series.map((m) => ({ month: m.month, collected: collectedIn(m, cur) })),
    otherCurrencies: otherCurrencies(d).map((c) => ({ currency: c, collected: collectedIn(current, c), mrr: mrrIn(d, c) })),
  };
}

// ── datos de la tarjeta ──────────────────────────────────────────────────────

export type StatValue =
  | { kind: "money"; value: number; currency: string }
  | { kind: "count"; value: number }
  /** Fracción con signo (0,12 = +12 %). */
  | { kind: "delta"; value: number }
  | { kind: "none" };

export function statValue(key: string, d: BillingDashboard): StatValue {
  const cur = d.primaryCurrency;
  const current = currentOf(d);
  switch (key) {
    case "collected":
      return { kind: "money", value: collectedIn(current, cur), currency: cur };
    case "collectedDelta": {
      const before = collectedIn(previousOf(d), cur);
      if (!(before > 0)) return { kind: "none" };
      return { kind: "delta", value: (collectedIn(current, cur) - before) / before };
    }
    case "mrr":
      return { kind: "money", value: mrrIn(d, cur), currency: cur };
    case "paying":
      return { kind: "count", value: current.paying };
    case "newClients":
      return { kind: "count", value: current.newClients };
    case "churned":
      return { kind: "count", value: current.churned };
    case "avgTicket": {
      const v = avgTicketIn(current, cur);
      return v === null ? { kind: "none" } : { kind: "money", value: v, currency: cur };
    }
    case "projection3":
    case "projection6":
    case "projection12": {
      const months = Number(key.slice("projection".length));
      const h = projectionIn(d, cur)?.horizons.find((x) => x.months === months);
      return h ? { kind: "money", value: h.expected, currency: cur } : { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}

// ── resultado ────────────────────────────────────────────────────────────────

export interface BillingAnalysis {
  summary: string;
  risks: string[];
  actions: string[];
  generatedAtISO: string | null;
}

export interface BillingCard {
  headline: string;
  stats: CardStatKey[];
  recommendation: string;
  generatedAtISO: string | null;
}

export interface BillingAIQuotaEntry {
  limit: number;
  used: number;
  remaining: number;
}

export interface BillingAIQuota {
  month: string;
  analysis: BillingAIQuotaEntry;
  card: BillingAIQuotaEntry;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function entry(limit: number, used: number): BillingAIQuotaEntry {
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/** `coach_ai_billing/{coach}.usage` → el cupo de `month` (otro mes ⇒ 0 usados). */
export function billingAIQuota(
  usage: unknown,
  month: string,
  limits: Readonly<Record<BillingAIKind, number>> = DEFAULT_BILLING_AI_LIMITS,
): BillingAIQuota {
  const map = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : null;
  const same = map?.month === month;
  const used = (k: BillingAIKind) => {
    const n = same ? num(map?.[k]) : null;
    return n !== null && n > 0 ? Math.floor(n) : 0;
  };
  return { month, analysis: entry(limits.analysis, used("analysis")), card: entry(limits.card, used("card")) };
}

/** `{month, analysis:{limit,used}, card:{limit,used}}` (respuesta o detalles de un error). */
export function decodeBillingAIQuota(raw: unknown): BillingAIQuota | null {
  if (!raw || typeof raw !== "object") return null;
  const map = raw as Record<string, unknown>;
  if (typeof map.month !== "string") return null;
  const one = (k: BillingAIKind) => {
    const e = map[k];
    if (!e || typeof e !== "object") return null;
    const limit = num((e as Record<string, unknown>).limit);
    const used = num((e as Record<string, unknown>).used);
    return limit === null || used === null ? null : entry(Math.trunc(limit), Math.trunc(used));
  };
  const analysis = one("analysis");
  const card = one("card");
  return analysis && card ? { month: map.month, analysis, card } : null;
}

function strings(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function isoOf(raw: unknown, fallback: string | null): string | null {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof (raw as { toDate?: unknown }).toDate === "function") {
    return ((raw as { toDate: () => Date }).toDate()).toISOString();
  }
  return fallback;
}

export function decodeBillingAnalysis(raw: unknown, generatedAtISO: string | null = null): BillingAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const map = raw as Record<string, unknown>;
  const summary = typeof map.summary === "string" ? map.summary.trim() : "";
  if (!summary) return null;
  return {
    summary,
    risks: strings(map.risks),
    actions: strings(map.actions),
    generatedAtISO: isoOf(map.generatedAt, generatedAtISO),
  };
}

export function decodeBillingCard(raw: unknown, generatedAtISO: string | null = null): BillingCard | null {
  if (!raw || typeof raw !== "object") return null;
  const map = raw as Record<string, unknown>;
  const headline = typeof map.headline === "string" ? map.headline.trim() : "";
  const recommendation = typeof map.recommendation === "string" ? map.recommendation.trim() : "";
  const seen = new Set<string>();
  const stats = (Array.isArray(map.stats) ? map.stats : [])
    .filter((s): s is string => typeof s === "string")
    .filter((s) => (CARD_STAT_KEYS as readonly string[]).includes(s) && !seen.has(s) && (seen.add(s), true)) as CardStatKey[];
  // Claves desconocidas y repetidas se descartan; tienen que quedar exactamente 3 (como en las apps).
  if (!headline || !recommendation || stats.length !== 3) return null;
  return { headline, stats, recommendation, generatedAtISO: isoOf(map.generatedAt, generatedAtISO) };
}

/** Un error del callable → qué muestra la pantalla (mismo criterio que el resumen semanal). */
export type BillingAIErrorKind = "quota" | "forbidden" | "unavailable" | "invalid_metrics" | "generic";

export function billingAIErrorKind(code: string | null | undefined, details: unknown): BillingAIErrorKind {
  const reason =
    details && typeof details === "object" ? (details as Record<string, unknown>).reason : undefined;
  const status = (code ?? "").toLowerCase().replace(/_/g, "-");
  if (reason === "quota" || status === "resource-exhausted") return "quota";
  if (status === "permission-denied" || status === "unauthenticated") return "forbidden";
  if (reason === "invalid_metrics") return "invalid_metrics";
  if (reason === "upstream" || reason === "timeout" || status === "unavailable" || status === "deadline-exceeded") {
    return "unavailable";
  }
  return "generic";
}

export function billingCallableUrl(projectId: string, region = "us-central1"): string {
  return `https://${region}-${projectId}.cloudfunctions.net/${ANALYZE_COACH_BILLING_FUNCTION}`;
}
