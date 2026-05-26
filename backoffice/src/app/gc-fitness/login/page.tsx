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
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Dumbbell,
  LogIn,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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
    <main className="auth-liquid-canvas fixed inset-0 isolate min-h-screen w-full overflow-x-hidden overflow-y-auto text-slate-950">
      <div className="auth-liquid-flow" aria-hidden />
      <div className="auth-liquid-sheen" aria-hidden />

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <section className="auth-login-stage relative mx-auto grid w-full max-w-[1240px] gap-5 rounded-[2rem] p-4 sm:p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.78fr)] lg:p-6">
          <aside className="auth-brand-panel flex min-h-[520px] flex-col gap-6 rounded-[1.65rem] p-5 sm:p-7 lg:min-h-[610px] lg:p-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)]">
              <CheckCircle2 className="size-4 text-amber-500" />
              Operaciones GC Fitness
            </div>

            <div className="max-w-[680px] space-y-5">
              <h1 className="font-heading text-4xl font-semibold leading-[1.08] text-slate-950">
                Gestioná tus atletas desde un único panel de trabajo.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-700">
                Asigná rutinas y hábitos, revisá adherencia, seguí progreso y
                respondé mensajes con el contexto completo del cliente en una
                sola vista.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="auth-feature-card rounded-2xl p-4">
                <Dumbbell className="size-5 text-cyan-700" />
                <p className="mt-4 text-sm font-semibold text-slate-950">
                  Planificación precisa
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Creá y asigná plantillas de entrenamiento con series,
                  repeticiones, descanso y orden de ejercicios definidos.
                </p>
              </div>
              <div className="auth-feature-card rounded-2xl p-4">
                <BarChart3 className="size-5 text-emerald-700" />
                <p className="mt-4 text-sm font-semibold text-slate-950">
                  Visibilidad de progreso
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Monitoreá adherencia, PRs e historial para tomar decisiones de
                  coaching rápidas y basadas en datos.
                </p>
              </div>
              <div className="auth-feature-card rounded-2xl p-4">
                <MessageSquareText className="size-5 text-amber-600" />
                <p className="mt-4 text-sm font-semibold text-slate-950">
                  Comunicación centralizada
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Mantené feedback, ajustes de rutina y seguimiento de
                  accountability dentro de un canal seguro.
                </p>
              </div>
            </div>

            <div className="auth-path-card mt-auto rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-950">
                Control de acceso
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                Solo entrenadores aprobados pueden iniciar sesión. Si tu cuenta
                de Google todavía no está habilitada, contactá al administrador
                de GC Fitness.
              </p>
            </div>
          </aside>

          <section className="auth-login-panel relative flex w-full flex-col gap-6 rounded-[1.6rem] p-5 sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="section-eyebrow text-slate-500">Secure backoffice</p>
                <h2 className="font-heading text-3xl font-semibold tracking-normal text-slate-950">
                  {t("title")}
                </h2>
                <p className="text-sm leading-6 text-slate-600">{t("subtitle")}</p>
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-900/10 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Backoffice v{BACKOFFICE_VERSION}
              </div>
            </div>

            {error ? (
              <HelperBanner title={t("errorTitle")} tone="red">
                {error}
              </HelperBanner>
            ) : null}

            <div className="space-y-4">
              <Button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="h-11 w-full justify-center rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              >
                {loading ? (
                  <Activity className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {loading ? t("signingIn") : t("googleCta")}
              </Button>

              <div className="auth-login-glass rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white/65 text-emerald-700">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">
                      Acceso con Google
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Ingresá con tu cuenta de Google autorizada para acceder a
                      las herramientas de entrenador y operaciones de clientes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                GC Fitness
              </span>
              <span>v{BACKOFFICE_VERSION}</span>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
