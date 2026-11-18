// overview-format.ts — #534: the small formatters the admin coach-detail sections share.
// Pure (no React, no next-intl): callers pass the locale.

import { formatBillingAmount, type BillingState } from "@/lib/gc-fitness/billing";
import { parseCivilYMD } from "@/lib/gc-fitness/civil-date";

export type Lang = "es" | "en";

export const langOf = (locale: string): Lang => (locale.startsWith("es") ? "es" : "en");

export function money(lang: Lang, amount: number | null, currency: string | null): string {
  if (amount === null || !currency) return "—";
  return formatBillingAmount(lang, amount, currency);
}

/** «16 nov 2026» / «Nov 16, 2026» for a civil date (no time zone math). */
export function civilLabel(lang: Lang, civil: string | null): string {
  if (!civil) return "—";
  const ymd = parseCivilYMD(civil);
  if (!ymd) return civil;
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)));
}

/** An instant, in the given zone. */
export function instantLabel(lang: Lang, ms: number | string | null, timeZone: string, withTime = false): string {
  if (ms === null) return "—";
  const date = typeof ms === "string" ? new Date(ms) : new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone,
  }).format(date);
}

/** «2026-11» → «nov 26» / «Nov 26». */
export function monthLabel(lang: Lang, month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function billingBadgeVariant(state: BillingState): "destructive" | "warning" | "success" | "secondary" {
  switch (state) {
    case "overdue":
      return "destructive";
    case "due_soon":
      return "warning";
    case "up_to_date":
      return "success";
    default:
      return "secondary";
  }
}
