// next-intl request config — Plan 13-03 (Phase 13 i18n).
//
// Locale resolution chain (highest priority first):
//   1. NEXT_LOCALE cookie (set by /api/gc-fitness/locale on language-picker selection)
//   2. Accept-Language header — first supported tag wins (es* > en*)
//   3. defaultLocale ('en')
//
// Note: this is the only place messages are loaded. The plugin in next.config.ts
// wires this into the build so getTranslations / useTranslations / NextIntlClientProvider
// can read them at runtime.

import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { defaultLocale, isLocale, type Locale } from "./routing";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  let locale: Locale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    // Accept-Language sniff — first supported locale prefix wins.
    const acceptLanguage = (await headers()).get("accept-language") ?? "";
    const preferred = acceptLanguage
      .split(",")
      .map((s) => s.split(";")[0]?.trim().toLowerCase() ?? "")
      .find((tag) => tag.startsWith("es") || tag.startsWith("en"));
    if (preferred?.startsWith("es")) {
      locale = "es";
    } else {
      locale = defaultLocale;
    }
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
  };
});
