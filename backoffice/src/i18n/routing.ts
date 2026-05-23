// Single source of truth for supported locales in the GC Fitness backoffice.
// Plan 13-03 — Phase 13 i18n.
//
// 'en' is the default (fallback for unknown / unspecified Accept-Language).
// 'es' is Argentine Spanish (matches iOS Plan 13-01 tone — "vos" where natural).
//
// Add new locales here AND ship a matching messages/{locale}.json file.

export const locales = ["en", "es"] as const;
export const defaultLocale = "en" as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "es";
}
