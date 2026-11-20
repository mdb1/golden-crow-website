// gc-fitness #1695 — formato del Tablero de cobros (puro, sin React): montos por moneda,
// porcentajes y la etiqueta corta de un mes. Lo comparten las tarjetas, los gráficos y sus
// tablas de lectura.

import { formatBillingAmount } from "@/lib/gc-fitness/billing";
import type { Money } from "@/lib/gc-fitness/billing-dashboard";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";

export type Lang = "es" | "en";

const localeOf = (lang: Lang) => (lang === "es" ? "es-AR" : "en-US");

/** El monto de `currency` en una lista por moneda (0 si no está). */
export function amountIn(list: Money[], currency: string): number {
  return list.find((m) => m.currency === currency)?.amount ?? 0;
}

export function money(lang: Lang, amount: number, currency: string): string {
  return formatBillingAmount(lang, amount, currency);
}

/** Tasa 0–1 → «7,7 %» / "7.7%" (hasta un decimal). */
export function percent(lang: Lang, rate: number): string {
  return new Intl.NumberFormat(localeOf(lang), { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

/** Variación 0–1 → «+12 %» / "−5%" (entero, con signo). */
export function signedPercent(lang: Lang, delta: number): string {
  return new Intl.NumberFormat(localeOf(lang), {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(delta);
}

/** `YYYY-MM` → «nov» / "Nov" (con el año corto si no es el del mes actual). */
export function monthLabel(lang: Lang, ym: string, currentYm: string): string {
  const sameYear = ym.slice(0, 4) === currentYm.slice(0, 4);
  return formatCivilDateLabel(
    `${ym}-01`,
    sameYear ? { month: "short" } : { month: "short", year: "2-digit" },
    localeOf(lang),
  );
}

/** Variación del mes contra el anterior, o null si el anterior fue 0. */
export function monthDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

/** Descarga un CSV en el navegador. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
