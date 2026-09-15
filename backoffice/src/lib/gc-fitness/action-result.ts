// action-result.ts
//
// THE RULE: a Server Action that a coach can trigger must RETURN its failure,
// never throw it.
//
// WHY (#1104). Next.js redacts every error thrown out of a Server Action in a
// PRODUCTION build — the client receives an opaque `Error` whose message is
// literally "Minified React error #441", the digest-only Server-Components
// error. So this, which reads like careful error handling:
//
//     try { await createExercise(values) }
//     catch (err) { setError(err.message) }          // ← "Minified React error #441"
//
// shows the coach a React error code instead of "Enter a valid image link".
// It works perfectly in `next dev` (messages are not redacted there) and in
// Jest (the action is called in-process), which is exactly why it shipped:
// a pasted `data:image/jpeg;base64,…` in the thumbnail field tripped a Zod
// regex and the coach got a React error number with no idea what to fix.
//
// A returned value crosses the boundary intact. Hence `ActionResult`.
//
// CONVENTIONS
//   - `ok: true` carries the payload inline: `{ ok: true, id }`.
//   - `ok: false` carries `error`, a string that is SAFE AND USEFUL to show a
//     coach. Never put a stack, a Firestore path, or another user's uid in it.
//   - Programmer errors (misconfigured env, a bug) may still throw — those are
//     not something the coach can act on, and the generic toast is the right
//     surface for them.

import { z } from "zod";

export type ActionOk<T> = { ok: true } & T;
export type ActionFail = { ok: false; error: string };
export type ActionResult<T = object> = ActionOk<T> | ActionFail;

/** Copy for the cases where we genuinely have nothing specific to say. */
export const GENERIC_ACTION_ERROR = "Something went wrong. Try again.";

/**
 * Flattens a ZodError into one line a coach can act on.
 *
 * The messages themselves are the UI-SPEC validation copy locked in
 * `exercise-schema.ts` ("Enter a valid image link (https://…).", "Pick at
 * least one muscle group.") — they are written FOR this surface, so showing
 * them verbatim is the point. Prefixed with the field path only when it adds
 * information the message doesn't already carry.
 */
export function zodErrorToMessage(error: z.ZodError): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const issue of error.issues) {
    const message = issue.message.trim();
    if (!message || seen.has(message)) continue;
    seen.add(message);
    lines.push(message);
    if (lines.length === 3) break; // three is plenty for a toast / inline line
  }
  return lines.length > 0 ? lines.join(" ") : GENERIC_ACTION_ERROR;
}

/**
 * Converts anything thrown inside a Server Action into a returnable failure.
 *
 * `Error("Forbidden")` — the uniform auth-gate failure from `auth-helpers` —
 * is deliberately NOT expanded: the contract there is to never leak which
 * guard tripped.
 */
export function toActionFailure(err: unknown): ActionFail {
  if (err instanceof z.ZodError) {
    return { ok: false, error: zodErrorToMessage(err) };
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: GENERIC_ACTION_ERROR };
}
