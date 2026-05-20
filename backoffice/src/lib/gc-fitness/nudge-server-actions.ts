// nudge-server-actions.ts
//
// Server Action wrapper for the P10-07 `sendTrainerNudge` HTTPS callable.
// The backoffice NudgeButton component (P10-08) invokes the action; the
// action gates on the trainer session, validates the input via the shared
// Zod schema, then forwards the call to the Cloud Function via a signed
// HTTPS request using the trainer's Firebase Auth ID token as a Bearer
// header.
//
// ─────────────────────────────────────────────────────────────────────────
//  AUTH GATES (defense in depth).
// ─────────────────────────────────────────────────────────────────────────
//   (1) Local trainer session check via `getCurrentTrainer()` — uniform
//       `"Forbidden"` error on any failure (cookie missing / role !==
//       trainer / email not in allowlist).
//   (2) Local Zod parse via `nudgeInputSchema.parse(...)` — Pitfall 7
//       17th reuse, same caps as the server-side guards in 10-07. Defense
//       in depth: the form rejects first, this action rejects second, the
//       callable rejects last.
//   (3) Trigger-boundary auth in 10-07: `request.auth` required +
//       `role === 'trainer'` custom claim + `email_verified === true`.
//       Re-verified server-side by the callable runtime when it decodes
//       the Bearer token we forward here.
//   (4) Recipient-client membership check in 10-07's DI core:
//       `clientData.coachId === trainerUid`. Defense in depth against
//       Admin SDK bypassing Firestore rules.
//
// ─────────────────────────────────────────────────────────────────────────
//  CALLABLE INVOCATION STRATEGY.
// ─────────────────────────────────────────────────────────────────────────
//   The Firebase Admin SDK does NOT expose a high-level `httpsCallable`
//   API for SERVER → callable invocations (it's for client-side use
//   only). The canonical server-to-callable pattern is to invoke the
//   callable's HTTPS endpoint directly with the user's ID token as a
//   Bearer header, and the wire-shape body `{ data: <input> }`. The
//   callable runtime decodes the token and populates `request.auth` for
//   the 3-layer auth gate in 10-07. The response wire-shape is
//   `{ result: <returnValue> }` (success) or `{ error: { message, ... } }`
//   (failure).
//
//   Reference: https://firebase.google.com/docs/functions/callable-reference
//
//   We re-read the cookie + decoded token via `getTokens()` rather than
//   `getCurrentTrainer()` because the latter does not expose the RAW ID
//   token (only the decoded payload). The two reads are cheap (the cookie
//   value is in-process; no external IO) — duplicated cost is negligible.
//   A future refactor MAY hoist the raw-token plumbing into auth-helpers
//   if 3+ Server Actions need it; YAGNI for now.
//
// ─────────────────────────────────────────────────────────────────────────
//  RESULT CONTRACT.
// ─────────────────────────────────────────────────────────────────────────
//   Returns the callable's verbatim payload:
//     { ok: boolean, decision: string }
//   Per 10-07's contract:
//     - `send_now` / `queued`            → ok: true
//     - `dropped:no_tokens`              → ok: true (client has no device)
//     - `dropped:preferences_off`        → ok: false (user opted out)
//     - `dropped:daily_cap`              → ok: false (today's quota hit)
//     - `dropped:total_cap`              → ok: false (today's total hit)
//     - `dropped:missing_user`           → ok: false (client doc gone)
//
// ─────────────────────────────────────────────────────────────────────────
//  Pitfall 7 (17th reuse) — same-source-of-truth contract.
// ─────────────────────────────────────────────────────────────────────────
//   The Zod schema imported here MIRRORS the server-side validation in
//   `functions/src/push/sendTrainerNudge.ts`. See `nudge-schema.ts` for
//   the chronological table of prior reuses.
//
// ─────────────────────────────────────────────────────────────────────────
//  Threat-register coverage (matches PLAN.md 10-08 <threat_model>):
// ─────────────────────────────────────────────────────────────────────────
//   T-10-08-EOP (non-trainer hits the action) — `getCurrentTrainer()` at
//     entry; uniform "Forbidden" error.
//   T-10-08-INJECTION (extra keys in payload) — `nudgeInputSchema` is
//     `.strict()`; unknown keys rejected.
//   T-10-08-DRIFT (length cap drift between surfaces) — Pitfall 7 mirror.
//   T-10-08-XSS, T-10-08-TOAST-LEAK, T-10-08-CALLABLE-URL — accepted.

"use server";

import "server-only";

import { cookies } from "next/headers";
import { getTokens } from "next-firebase-auth-edge";

import { getCurrentTrainer } from "./auth-helpers";
import { nudgeInputSchema } from "./nudge-schema";

/**
 * Wire-shape mirror of the 10-07 callable's `SendTrainerNudgeResult`.
 * Kept verbatim so the UI doesn't have to translate two shapes.
 */
export interface NudgeActionResult {
  /**
   * `true` when the trainer's action succeeded from the trainer's POV:
   * - push sent now, OR
   * - push queued for quiet-hours-end, OR
   * - dropped:no_tokens (client has no device — not the trainer's problem).
   *
   * `false` when the push was dropped for a reason the trainer should
   * know about (preferences off, daily/total cap, missing user).
   */
  ok: boolean;
  /**
   * One of: `send_now` | `queued` | `dropped:<reason>` per 10-07's
   * `EnqueueDecision` → `NudgeActionResult` translation.
   */
  decision: string;
}

/**
 * The Functions region for gc-fitness callables — pinned to `us-central1`
 * in 10-07 (matches every other gc-fitness Cloud Function).
 */
const FUNCTIONS_REGION = "us-central1";

/**
 * Default project ID for `gcfitness-3476b`. The env var
 * `NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID` is the source of truth
 * (matches the rest of `auth-helpers.ts` / `gc-fitness-admin.ts`).
 */
function functionsProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "gc-fitness/nudge-server-actions: NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID is not set",
    );
  }
  return projectId;
}

/**
 * Reads the trainer's raw Firebase Auth ID token from the cookie via
 * `next-firebase-auth-edge`'s `getTokens()`. Mirrors the same env-var
 * loading pattern as `auth-helpers.ts` so a misconfigured deployment
 * fails loudly with a descriptive error rather than a generic "no cookie"
 * state.
 *
 * Returns the raw ID token string. Throws `Error("Forbidden")` if the
 * cookie is missing (matches `getCurrentTrainer()`'s contract so callers
 * can use a single catch-all message).
 */
async function readTrainerIdToken(): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY;
  const cookieSignatureKey = process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

  if (
    !apiKey ||
    !cookieSignatureKey ||
    !projectId ||
    !clientEmail ||
    !privateKeyB64
  ) {
    throw new Error(
      "gc-fitness/nudge-server-actions: server misconfigured — required env vars missing.",
    );
  }

  const tokens = await getTokens(await cookies(), {
    apiKey,
    cookieName: "GcFitnessAuthToken",
    cookieSignatureKeys: [cookieSignatureKey],
    serviceAccount: {
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
    },
  });

  if (!tokens?.token) {
    throw new Error("Forbidden");
  }
  return tokens.token;
}

/**
 * Builds the canonical v2 HTTPS endpoint URL for a callable function:
 *   `https://<region>-<projectId>.cloudfunctions.net/<functionName>`
 *
 * V2 functions ALSO get a Cloud Run URL (`https://<name>-<hash>-<region>.a.run.app`),
 * but the `cloudfunctions.net` alias is stable across deploys and does
 * not require us to plumb the hash. The alias works for both v1 + v2
 * callables.
 */
function buildCallableUrl(functionName: string): string {
  return `https://${FUNCTIONS_REGION}-${functionsProjectId()}.cloudfunctions.net/${functionName}`;
}

/**
 * Invokes a v2 HTTPS callable using the trainer's ID token as a Bearer
 * header. Wire shape:
 *   Request:  POST { "data": <input> }
 *             Authorization: Bearer <idToken>
 *   Response: 200 { "result": <returnValue> }
 *          OR error { "error": { "message": "...", "status": "..." } }
 *
 * Throws with a descriptive message on non-2xx HTTP, or when the
 * response body carries an `error` payload.
 */
async function invokeCallable<TInput, TResult>(
  functionName: string,
  input: TInput,
  idToken: string,
): Promise<TResult> {
  const url = buildCallableUrl(functionName);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: input }),
    // Server Action runs server-side; Next.js' fetch cache MUST NOT
    // memoize this POST. Explicitly disable cache.
    cache: "no-store",
  });

  // Try to parse the body first — callable error responses ARE JSON
  // even on non-2xx status (the callable runtime's error envelope).
  let parsed:
    | { result?: TResult; error?: { message?: string; status?: string } }
    | undefined;
  try {
    parsed = (await response.json()) as typeof parsed;
  } catch {
    // Body wasn't JSON; fall through to the non-2xx branch below.
  }

  if (!response.ok) {
    const detail =
      parsed?.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`${functionName} callable failed: ${detail}`);
  }

  if (parsed?.error) {
    throw new Error(`${functionName}: ${parsed.error.message ?? "unknown error"}`);
  }

  if (parsed?.result === undefined) {
    throw new Error(`${functionName} callable returned no result`);
  }

  return parsed.result;
}

/**
 * Server Action: send a trainer-initiated push notification ("nudge")
 * to a client. Invoked by the NudgeButton component in the chat header.
 *
 * Pipeline:
 *   1. `getCurrentTrainer()` — trainer-session gate (uniform "Forbidden"
 *      error on cookie / role / allowlist failure).
 *   2. `nudgeInputSchema.parse(input)` — local validation mirror
 *      (Pitfall 7 — same caps as 10-07). Throws on invalid input
 *      BEFORE the network round-trip.
 *   3. Read the raw trainer ID token from the cookie.
 *   4. Invoke `sendTrainerNudge` callable with the ID token as Bearer.
 *   5. Return the callable's `{ ok, decision }` payload verbatim.
 *
 * Errors thrown from this function are surfaced to the NudgeButton's
 * submit handler, which renders a sonner toast describing the failure.
 */
export async function sendTrainerNudge(
  input: unknown,
): Promise<NudgeActionResult> {
  // (1) Trainer-session gate.
  const session = await getCurrentTrainer();

  // (2) Local Zod parse (Pitfall 7 mirror) — fail-fast before the
  // network round-trip.
  const parsed = nudgeInputSchema.parse(input);

  // (3) Read the raw ID token from the cookie (`getCurrentTrainer()`
  // returned only the decoded payload).
  const idToken = await readTrainerIdToken();

  // (4) Invoke the callable.
  try {
    const result = await invokeCallable<typeof parsed, NudgeActionResult>(
      "sendTrainerNudge",
      parsed,
      idToken,
    );
    // eslint-disable-next-line no-console
    console.info("[sendTrainerNudge] decision", {
      trainerUid: session.uid,
      clientId: parsed.clientId,
      decision: result.decision,
      ok: result.ok,
    });
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[sendTrainerNudge] callable invocation failed", {
      trainerUid: session.uid,
      clientId: parsed.clientId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
