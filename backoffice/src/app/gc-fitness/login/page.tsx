"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
} from "firebase/auth";
import { Activity, Dumbbell, LogIn, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { getGCFitnessAuth } from "@/lib/firebase/gc-fitness-client";
import { Button } from "@/components/ui/button";
import { HelperBanner } from "@/components/helper-banner";
import { BACKOFFICE_VERSION } from "@/lib/app-version";

// GC Fitness trainer sign-in. Surface B of the Phase 2 UI-SPEC.
//
// Flow:
//   1. Click "Sign in with Google" → signInWithPopup on the scoped gc-fitness
//      Firebase Web SDK (named app "gc-fitness", separate from MyDNAMap's
//      default app).
//   2. Resulting idToken POSTed to /api/gc-fitness/login via the
//      `Authorization: Bearer <idToken>` header. The route handler verifies
//      the token, checks the allowlist, and mints the session cookie via
//      next-firebase-auth-edge's setAuthCookies (which reads the idToken
//      from request.headers — the header transport is REQUIRED, not a body
//      field).
//   3. 403 from the route handler → redirect to /gc-fitness/forbidden.
//   4. 200 → redirect to /gc-fitness/dashboard (the proxy's allowlist
//      gate will pass because the email is allowlisted).
//
// Plan 13-03 — i18n via useTranslations('login'). Note: the login page is
// outside the NextIntlClientProvider scope rendered by `gc-fitness/layout.tsx`
// (it IS inside, but the shell is hidden via HIDDEN_SHELL_PATHS). The
// provider DOES wrap this page so useTranslations resolves correctly.
export default function GCFitnessLoginPage() {
  const t = useTranslations("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completeBackofficeSession(result: UserCredential) {
    const idToken = await result.user.getIdToken();
    const res = await fetch("/api/gc-fitness/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    window.location.href = "/gc-fitness/dashboard";
  }

  useEffect(() => {
    let cancelled = false;
    async function resumeRedirectSignIn() {
      const auth = getGCFitnessAuth();
      const result = await getRedirectResult(auth);
      if (!result || cancelled) return;
      await completeBackofficeSession(result);
    }
    resumeRedirectSignIn().catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : t("errorFallback"));
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  function shouldPreferRedirectFlow() {
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android/.test(ua);
  }

  async function readError(res: Response): Promise<string> {
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) return data.error;
    } catch {
      // The route should return JSON, but keep a stable fallback if it does not.
    }
    return t("errorFallback");
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const auth = getGCFitnessAuth();
      if (shouldPreferRedirectFlow()) {
        await signInWithRedirect(auth, provider);
        return;
      }
      const result = await signInWithPopup(auth, provider);
      await completeBackofficeSession(result);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "auth/popup-blocked") {
        try {
          const provider = new GoogleAuthProvider();
          const auth = getGCFitnessAuth();
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          setError(
            redirectErr instanceof Error ? redirectErr.message : t("errorFallback"),
          );
          return;
        }
      }
      setError(err instanceof Error ? err.message : t("errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-[1.5rem] border bg-card p-7 shadow-sm sm:p-9">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground [&>svg]:size-8">
            <Dumbbell />
          </span>
          <div className="space-y-1">
            {/* TODO i18n: brand name */}
            <p className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Coach Portal
            </p>
            <p className="text-sm font-medium text-primary">GC Fitness</p>
          </div>
        </div>

        {/* Title + subtitle */}
        <div className="mt-7 space-y-1.5 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {error ? (
          <div className="mt-6">
            <HelperBanner title={t("errorTitle")} tone="red">
              {error}
            </HelperBanner>
          </div>
        ) : null}

        {/* Google sign-in CTA */}
        <div className="mt-7 space-y-4">
          <Button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="h-12 w-full justify-center rounded-full text-base"
          >
            {loading ? (
              <Activity className="size-5 animate-spin" />
            ) : (
              <LogIn className="size-5" />
            )}
            {loading ? t("signingIn") : t("googleCta")}
          </Button>

          <div className="flex items-start gap-3 rounded-2xl border bg-muted/40 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)] [&>svg]:size-5">
              <ShieldCheck />
            </span>
            <p className="text-sm leading-6 text-muted-foreground">
              {/* TODO i18n: authorized-trainers-only helper */}
              Solo entrenadores autorizados pueden iniciar sesión con su cuenta
              de Google habilitada.
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          GC Fitness · v{BACKOFFICE_VERSION}
        </p>
      </div>
    </main>
  );
}
