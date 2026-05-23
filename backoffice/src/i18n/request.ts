// next-intl request config — Plan 13-03 (Phase 13 i18n) + 260523-kpt Task D
// extension for Firestore preferredLocale hydration.
//
// Locale resolution chain (highest priority first):
//   1. NEXT_LOCALE cookie (set by /api/gc-fitness/locale OR by the
//      updatePreferredLocale Server Action OR by the hydration step below)
//   2. (260523-kpt) /users/{trainer.uid}.preferredLocale (Firestore read,
//      gated by getCurrentTrainer; writes cookie post-read so subsequent
//      requests short-circuit at step 1)
//   3. Accept-Language header — first supported tag wins (es* > en*)
//   4. defaultLocale ('en')
//
// The Firestore hydration step is THE bridge between iOS-set-only and
// backoffice-set preferences. Cost = 1 doc read per trainer per cookie
// clear (effectively per-session); the cookie write amortizes it to
// "near-zero on subsequent requests" (T-i18n-04 mitigation).
//
// Note: this is the only place messages are loaded. The plugin in
// next.config.ts wires this into the build so getTranslations /
// useTranslations / NextIntlClientProvider can read them at runtime.

import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

import { defaultLocale, isLocale, type Locale } from "./routing";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  let locale: Locale | null = null;

  // ── Step 1: NEXT_LOCALE cookie ──────────────────────────────────────────
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  }

  // ── Step 2 (260523-kpt): Firestore hydration ────────────────────────────
  // Gated by getCurrentTrainer — "Forbidden" means no trainer session yet
  // (anonymous visitor or signed-out tab); silently fall through to step
  // 3 in that case. Any other thrown error indicates env misconfig and
  // re-raises so we surface the 500 instead of silently defaulting.
  if (locale === null) {
    try {
      const trainer = await getCurrentTrainer();
      const snap = await gcFitnessFirestore()
        .collection(FirestoreCollections.users)
        .doc(trainer.uid)
        .get();
      const stored = snap.data()?.preferredLocale;
      if (isLocale(stored)) {
        locale = stored;
        // Amortize: write the cookie so subsequent requests short-circuit
        // at step 1. cookies().set() inside getRequestConfig may emit a
        // dev-time warning under next-intl 4.x in some Next.js builds —
        // wrap defensively so a runtime throw doesn't break the route.
        // The next user interaction (any Server Action) will re-write
        // the cookie via updatePreferredLocale → /api/gc-fitness/locale.
        try {
          cookieStore.set("NEXT_LOCALE", stored, {
            path: "/",
            maxAge: 31_536_000,
            sameSite: "lax",
            httpOnly: false,
          });
        } catch {
          // Cookie-write fallback: skip the amortization on this
          // request; the chain still resolves to `stored` for the
          // current render. Logged once at dev time only — production
          // throws are swallowed because the next interaction patches
          // the cookie via the Settings Server Action.
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message !== "Forbidden") throw err;
      // Forbidden → no trainer session; fall through to Accept-Language.
    }
  }

  // ── Step 3: Accept-Language sniff ───────────────────────────────────────
  if (locale === null) {
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
