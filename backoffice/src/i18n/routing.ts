// Single source of truth for supported locales in the GC Fitness backoffice.
// Plan 13-03 — Phase 13 i18n.
//
// 'es' (Argentine Spanish, "vos" where natural) is the default: the Coach
// Portal is a Spanish-first product (matches the reference design + iOS Plan
// 13-01 tone). English is opt-in via the language toggle (cookie /
// preferredLocale). An English-only browser with no explicit preference still
// lands on Spanish — see the Accept-Language `else` branch in request.ts, which
// falls back to this defaultLocale.
//
// Add new locales here AND ship a matching messages/{locale}.json file.

export const locales = ["en", "es"] as const;
export const defaultLocale = "es" as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "es";
}
