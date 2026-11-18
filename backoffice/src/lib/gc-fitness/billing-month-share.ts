// billing-month-share.ts — gc-fitness #1696, «Imagen del mes». Pure: builds the `ShareCardModel`
// that the EXISTING share-card renderer (`components/gc-fitness/share-workout-card.tsx`) rasterizes
// — the same pipeline as the end-of-workout cards. Corvo supplies the words (headline,
// recommendation, which 3 stats); the numbers come from the portal's own dashboard (`statValue`).
//
// Stat formatting (same as the apps' card): money without decimals, compact from 1 000 000
// («$ 1,2 M»); counts as integers; the month-over-month delta as a signed integer percent with a
// real minus sign (U+2212); a stat without data as «—».

import type { ShareCardModel } from "@/components/gc-fitness/share-workout-card";

import type { BillingCard, CardStatKey, StatValue } from "./billing-ai";

type Lang = "es" | "en";
const localeOf = (lang: Lang) => (lang === "es" ? "es-AR" : "en-US");
const MINUS = "−";

export function formatCardStat(value: StatValue, lang: Lang): string {
  const locale = localeOf(lang);
  switch (value.kind) {
    case "money": {
      try {
        const currency = new Intl.NumberFormat(locale, {
          style: "currency",
          currency: value.currency,
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        });
        if (Math.abs(value.value) < 1_000_000) return currency.format(Math.round(value.value));
        // Compact keeps the SAME symbol + spacing as the plain amount («$ 1,2 M» next to
        // «$ 120.000»): Intl's compact currency drops the es-AR space («$1,2 M»).
        const parts = currency.formatToParts(1);
        const prefix = parts.slice(0, parts.findIndex((p) => p.type === "integer")).map((p) => p.value).join("");
        const number = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value.value);
        return `${prefix}${number}`;
      } catch {
        return `${Math.round(value.value)} ${value.currency}`;
      }
    }
    case "count":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value.value);
    case "delta":
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" })
        .format(value.value)
        .replace("-", MINUS);
    default:
      return "—";
  }
}

/** `YYYY-MM` → «noviembre de 2026» / "November 2026". */
export function monthTitle(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(localeOf(lang), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface BillingMonthShareInput {
  card: BillingCard;
  month: string;
  coachName: string;
  lang: Lang;
  /** The value of each stat key, from the dashboard (`statValue(key, dashboard)`). */
  values: Record<CardStatKey, StatValue> | ((key: CardStatKey) => StatValue);
  labels: {
    /** «Mi mes · {month}» with the month already in. */
    eyebrow: string;
    /** «La recomendación de Corvo». */
    recommendation: string;
    stat: (key: CardStatKey) => string;
  };
}

export function buildBillingMonthShareModel(input: BillingMonthShareInput): ShareCardModel {
  const valueOf = typeof input.values === "function" ? input.values : (k: CardStatKey) => (input.values as Record<CardStatKey, StatValue>)[k];
  return {
    eyebrow: input.labels.eyebrow,
    completionA11y: "",
    showCompletionCheck: false,
    progressiveOverloadLabel: null,
    title: input.card.headline,
    subLine: input.coachName.trim() || null,
    stats: input.card.stats.map((key) => ({
      value: formatCardStat(valueOf(key) ?? { kind: "none" }, input.lang),
      label: input.labels.stat(key),
      fit: true,
    })),
    exercises: [],
    dateLine: null,
    fileDate: input.month,
    downloadFileName: `corvo-mi-mes-${input.month}`,
    shareTitle: input.card.headline,
    rowsCaption: input.labels.recommendation,
    note: input.card.recommendation,
  };
}
