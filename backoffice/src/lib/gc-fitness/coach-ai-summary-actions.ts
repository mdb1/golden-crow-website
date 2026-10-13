"use server";

// coach-ai-summary-actions.ts — gc-fitness #1347, «Resumen de la semana (IA)».
//
// Two coach-facing Server Actions. Both RETURN their failure (`ActionResult`,
// see action-result.ts / #1104) — a thrown error reaches a production browser
// as "Minified React error #441".
//
//   loadCoachWeeklySummary(clientId)      → the cached summary of this ISO
//       week (if any) + today's quota. Admin SDK reads only; no model call.
//   generateCoachWeeklySummary(clientId, { force })
//       → calls the `coachWeeklySummary` callable over HTTPS with the coach's
//       own Firebase ID token. The callable owns EVERYTHING that matters:
//       ownership, consent (only data the coach already sees), the 20/day
//       quota, the cache and the model call. The model key never touches
//       Vercel.
//
// Only async functions are exported from this file ("use server"); the pure
// helpers live in coach-ai-summary-model.ts.

import { getLocale } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer, getCurrentTrainerIdToken } from "./auth-helpers";
import { civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { getTrainerTimezone } from "./trainer-timezone";
import {
  callableUrl,
  classifyCallableError,
  COACH_AI_SUMMARIES_COLLECTION,
  decodeCoachSummary,
  isoWeekKey,
  quotaFromUsed,
  readSummaryUsage,
  type CoachSummaryErrorKind,
  type CoachSummaryQuota,
  type CoachWeeklySummary,
} from "./coach-ai-summary-model";

export type CoachSummaryLoadResult =
  | {
      ok: true;
      summary: CoachWeeklySummary | null;
      quota: CoachSummaryQuota;
    }
  | { ok: false; error: CoachSummaryErrorKind };

export type CoachSummaryGenerateResult =
  | {
      ok: true;
      cached: boolean;
      summary: CoachWeeklySummary;
      quota: CoachSummaryQuota;
    }
  | { ok: false; error: CoachSummaryErrorKind; quota?: CoachSummaryQuota };

async function ownedClientTimezone(
  coachUid: string,
  clientId: string,
): Promise<string | null> {
  if (!clientId || clientId.includes("/") || clientId.startsWith("mirror:")) {
    return null;
  }
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachUid) return null;
  const tz = snap.get("timezone");
  return typeof tz === "string" && tz.trim() ? tz : "";
}

export async function loadCoachWeeklySummary(
  clientId: string,
): Promise<CoachSummaryLoadResult> {
  try {
    const trainer = await getCurrentTrainer();
    const clientTz = await ownedClientTimezone(trainer.uid, clientId);
    if (clientTz === null) return { ok: false, error: "forbidden" };
    const coachTz = await getTrainerTimezone();
    const week = isoWeekKey(civilDateToday(clientTz || coachTz));
    const coachRef = gcFitnessFirestore()
      .collection(COACH_AI_SUMMARIES_COLLECTION)
      .doc(trainer.uid);
    const [weekSnap, coachSnap] = await Promise.all([
      coachRef.collection("clients").doc(clientId).collection("weeks").doc(week).get(),
      coachRef.get(),
    ]);
    const used = readSummaryUsage(
      coachSnap.exists ? coachSnap.get("usage") : null,
      civilDateToday(coachTz),
    );
    return {
      ok: true,
      summary: weekSnap.exists
        ? decodeCoachSummary(weekSnap.data() as Record<string, unknown>)
        : null,
      quota: quotaFromUsed(used),
    };
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return { ok: false, error: "forbidden" };
    }
    console.warn("[coach-ai-summary] load failed", err);
    return { ok: false, error: "generic" };
  }
}

export async function generateCoachWeeklySummary(
  clientId: string,
  options: { force?: boolean } = {},
): Promise<CoachSummaryGenerateResult> {
  try {
    const { idToken } = await getCurrentTrainerIdToken();
    const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
    if (!projectId) return { ok: false, error: "generic" };
    const locale = (await getLocale().catch(() => "es")) === "en" ? "en" : "es";
    const timezone = await getTrainerTimezone();

    const response = await fetch(callableUrl(projectId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        data: { clientId, locale, timezone, force: options.force === true },
      }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      result?: {
        cached?: unknown;
        summary?: Record<string, unknown>;
        quota?: { used?: unknown };
      };
      error?: { status?: string; details?: unknown };
    } | null;

    if (!response.ok || !body?.result) {
      const error = classifyCallableError(body?.error?.status, body?.error?.details);
      const details = body?.error?.details as { used?: unknown } | undefined;
      return {
        ok: false,
        error,
        ...(error === "quota" && typeof details?.used === "number"
          ? { quota: quotaFromUsed(details.used) }
          : {}),
      };
    }
    const summary = decodeCoachSummary(body.result.summary);
    if (!summary) return { ok: false, error: "generic" };
    const used = body.result.quota?.used;
    return {
      ok: true,
      cached: body.result.cached === true,
      summary,
      quota: quotaFromUsed(typeof used === "number" ? used : 0),
    };
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return { ok: false, error: "forbidden" };
    }
    console.warn("[coach-ai-summary] generate failed", err);
    return { ok: false, error: "generic" };
  }
}
