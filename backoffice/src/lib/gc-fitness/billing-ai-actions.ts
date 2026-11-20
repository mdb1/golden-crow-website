"use server";

// billing-ai-actions.ts — gc-fitness #1696, «Analizar facturación con IA» e «Imagen del mes».
//
// Archivo PROPIO (no mueve ningún id de las actions existentes, #382). "use server" ⇒ sólo
// funciones async (#785); lo puro vive en billing-ai.ts. Las dos DEVUELVEN su error (#1104).
//
//   getBillingAIState()     → lo guardado de este mes (análisis y tarjeta) + el cupo, leídos con
//       el Admin SDK de `coach_ai_billing/{coach}` y `.../months/{YYYY-MM}`. Sin modelo.
//   runBillingAI({ kind })  → arma el tablero EN EL SERVIDOR (las mismas lecturas y el mismo
//       gemelo que la pestaña), saca el payload de agregados (`billingAIPayload`: sin nombres,
//       ids, notas ni planes) y llama al callable `analyzeCoachBilling` por HTTPS con el ID token
//       del coach, como `coach-ai-summary-actions.ts` con `coachWeeklySummary`. El callable es
//       dueño de todo lo que importa: el rol, la validación de los números, el cupo mensual,
//       el modelo y lo que se guarda. La key del modelo nunca toca Vercel.

import { getLocale } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer, getCurrentTrainerIdToken } from "./auth-helpers";
import {
  billingAIErrorKind,
  billingAIPayload,
  billingAIQuota,
  billingCallableUrl,
  COACH_AI_BILLING_COLLECTION,
  decodeBillingAIQuota,
  decodeBillingAnalysis,
  decodeBillingCard,
  type BillingAIErrorKind,
  type BillingAIKind,
  type BillingAIQuota,
  type BillingAnalysis,
  type BillingCard,
} from "./billing-ai";
import { getBillingDashboardData } from "./billing-dashboard-actions";
import { civilDateToday } from "./civil-date";
import { getCoachDisplayName } from "./payments-actions";
import { getTrainerTimezone } from "./trainer-timezone";

export type BillingAIStateResult =
  | {
      ok: true;
      month: string;
      coachName: string;
      analysis: BillingAnalysis | null;
      card: BillingCard | null;
      quota: BillingAIQuota;
    }
  | { ok: false; error: BillingAIErrorKind };

export type BillingAIRunResult =
  | {
      ok: true;
      kind: BillingAIKind;
      month: string;
      analysis: BillingAnalysis | null;
      card: BillingCard | null;
      quota: BillingAIQuota;
    }
  | { ok: false; error: BillingAIErrorKind; quota?: BillingAIQuota };

function isForbidden(err: unknown): boolean {
  return err instanceof Error && err.message === "Forbidden";
}

export async function getBillingAIState(): Promise<BillingAIStateResult> {
  try {
    const trainer = await getCurrentTrainer();
    const month = civilDateToday(await getTrainerTimezone()).slice(0, 7);
    const coachRef = gcFitnessFirestore().collection(COACH_AI_BILLING_COLLECTION).doc(trainer.uid);
    const [coachSnap, monthSnap, coachName] = await Promise.all([
      coachRef.get(),
      coachRef.collection("months").doc(month).get(),
      getCoachDisplayName(),
    ]);
    const stored = monthSnap.exists ? (monthSnap.data() as Record<string, unknown>) : {};
    return {
      ok: true,
      month,
      coachName,
      analysis: decodeBillingAnalysis(stored.analysis),
      card: decodeBillingCard(stored.card),
      quota: billingAIQuota(coachSnap.exists ? coachSnap.get("usage") : null, month),
    };
  } catch (err) {
    if (isForbidden(err)) return { ok: false, error: "forbidden" };
    console.warn("[billing-ai] load failed", err);
    return { ok: false, error: "generic" };
  }
}

export async function runBillingAI(input: { kind: BillingAIKind }): Promise<BillingAIRunResult> {
  try {
    const kind = input?.kind;
    if (kind !== "analysis" && kind !== "card") return { ok: false, error: "generic" };
    const { idToken } = await getCurrentTrainerIdToken();
    const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
    if (!projectId) return { ok: false, error: "generic" };

    const dashboard = await getBillingDashboardData();
    if (!dashboard.ok) return { ok: false, error: dashboard.error === "Forbidden" ? "forbidden" : "generic" };
    const locale = (await getLocale().catch(() => "es")) === "en" ? "en" : "es";
    const timezone = await getTrainerTimezone();

    const response = await fetch(billingCallableUrl(projectId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        data: { kind, locale, timezone, metrics: billingAIPayload(dashboard.data.dashboard) },
      }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      result?: { kind?: unknown; month?: unknown; analysis?: unknown; card?: unknown; quota?: unknown; generatedAtISO?: unknown };
      error?: { status?: string; details?: unknown };
    } | null;

    if (!response.ok || !body?.result) {
      const error = billingAIErrorKind(body?.error?.status, body?.error?.details);
      const quota = decodeBillingAIQuota(body?.error?.details);
      return { ok: false, error, ...(quota ? { quota } : {}) };
    }
    const r = body.result;
    const generatedAt = typeof r.generatedAtISO === "string" ? r.generatedAtISO : null;
    const analysis = kind === "analysis" ? decodeBillingAnalysis(r.analysis, generatedAt) : null;
    const card = kind === "card" ? decodeBillingCard(r.card, generatedAt) : null;
    const quota = decodeBillingAIQuota(r.quota);
    if ((!analysis && !card) || !quota) return { ok: false, error: "generic" };
    return {
      ok: true,
      kind,
      month: typeof r.month === "string" ? r.month : quota.month,
      analysis,
      card,
      quota,
    };
  } catch (err) {
    if (isForbidden(err)) return { ok: false, error: "forbidden" };
    console.warn("[billing-ai] run failed", err);
    return { ok: false, error: "generic" };
  }
}
