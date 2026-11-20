"use server";

// coach-broadcast-actions.ts — golden-crow-website #500, «Mandar mensaje» a
// varios clientes desde el roster.
//
// One Server Action that forwards to the gc-fitness callable
// `broadcastCoachMessage` (mdb1/gc-fitness#1617) with the coach's OWN Firebase
// ID token. The callable owns everything that matters: input validation,
// ownership (skips uids that are not this coach's clients), the 10/24h quota
// and the per-chat writes (`onMessageCreated` then does inbox + push). This
// file deliberately re-implements none of it.
//
// It RETURNS its failure (`ActionResult` style, see action-result.ts / #1104)
// — a thrown error reaches a production browser as "Minified React error #441".
//
// Only async functions are exported from this file ("use server"); the pure
// helpers live in coach-broadcast-model.ts.

import { getCurrentTrainerIdToken } from "./auth-helpers";
import {
  broadcastCallableUrl,
  classifyBroadcastError,
  decodeBroadcastResult,
  type BroadcastErrorKind,
} from "./coach-broadcast-model";

export type CoachBroadcastResult =
  | { ok: true; sent: number; skipped: number; remaining: number }
  | { ok: false; error: BroadcastErrorKind };

export async function sendCoachBroadcast(
  clientIds: string[],
  text: string,
): Promise<CoachBroadcastResult> {
  try {
    if (!Array.isArray(clientIds) || typeof text !== "string") {
      return { ok: false, error: "generic" };
    }
    const { idToken } = await getCurrentTrainerIdToken();
    const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
    if (!projectId) return { ok: false, error: "generic" };

    const response = await fetch(broadcastCallableUrl(projectId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: { clientIds, text } }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      result?: unknown;
      error?: { status?: string; details?: unknown };
    } | null;

    if (!response.ok || !body?.result) {
      return {
        ok: false,
        error: classifyBroadcastError(body?.error?.status, body?.error?.details),
      };
    }
    const decoded = decodeBroadcastResult(body.result);
    if (!decoded) return { ok: false, error: "generic" };
    return {
      ok: true,
      sent: decoded.sent,
      // Only the COUNT crosses back — never another person's uid in the UI.
      skipped: decoded.skipped.length,
      remaining: decoded.remaining,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return { ok: false, error: "forbidden" };
    }
    console.warn("[coach-broadcast] send failed", err);
    return { ok: false, error: "generic" };
  }
}
