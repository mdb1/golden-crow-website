// coach-link.ts
//
// PURE decision helper for the provisionClient conflict gate (Phase 32,
// LINK-01). This module is intentionally I/O-free: no Admin SDK, no
// Firestore, no "use server" — it takes the freshly-read target doc (a
// /users/{uid} doc OR a /user_mirror/{email} doc) plus the requesting
// coach's session uid and returns the link decision. Keeping it pure makes
// the steal-vector logic jest-testable in isolation and lets BOTH
// provisionClient branches (existing-user + mirror) share one authority.
//
// Outcomes (D-01 / 32-CONTEXT.md):
//   - link         → coach-less target OR a claimable stray → safe to write.
//   - alreadyYours → the target is already YOUR client → friendly no-op.
//   - conflict     → the target has a DIFFERENT real coach → REFUSE (no
//                    writes); the caller routes the coach to support. The
//                    currentCoachId is for server-side audit ONLY and MUST
//                    NEVER be forwarded to the requesting coach (enumeration
//                    disclosure is bounded — threat T-32-ENUM / T-32-E2).
//
// Claimable stray = `autoAssignedCoach === true` (a doc field mirroring the
// Phase 29 fallback-coach migration predicate) — a fallback-coached user is
// claimable without conflict. We deliberately do NOT import or reference the
// functions-repo fallback-coach uid: the predicate is the boolean field, not
// a hardcoded uid comparison.

export type LinkOutcome =
  | { kind: "link" }
  | { kind: "alreadyYours" }
  | { kind: "conflict"; currentCoachId: string }
  // CR-02: the target doc is a TRAINER account. A trainer email can never be
  // linked as a client — without this refusal, a coach typing another
  // trainer's email would overwrite their user doc (role → "client",
  // coachId → attacker) and, post-commit, clobber their role claim,
  // demoting them to a client and locking them out of the backoffice.
  | { kind: "trainerTarget" };

/**
 * Refusal modes surfaced to the ProvisionClientForm as a RETURN VALUE, never
 * as a thrown Error message (CR-03): Next.js masks Server-Action error
 * messages in production builds ("An error occurred in the Server
 * Components render..." + digest), so localized copy carried on
 * `err.message` degrades to a generic string exactly in prod. The form maps
 * each mode to its own client-side translation key instead.
 */
export type LinkRefusalMode = "conflict" | "trainer-target" | "self";

/**
 * Sentinel thrown INSIDE the provisionClient transactions to abort them
 * before any write (the Admin SDK aborts a tx whose body throws, and does
 * not retry non-contention errors). provisionClient catches this sentinel
 * and converts it into a `{ ok: false, mode }` result — the message is
 * intentionally NOT user-facing (see LinkRefusalMode).
 */
export class LinkRefusedError extends Error {
  constructor(public readonly mode: LinkRefusalMode) {
    super(`link refused: ${mode}`);
    this.name = "LinkRefusedError";
  }
}

export interface LinkTargetDoc {
  coachId?: string | null;
  autoAssignedCoach?: boolean;
  role?: string | null;
}

/**
 * Decide how a coach's "add client by email" request should resolve against
 * the freshly-read target doc. Pure — call this INSIDE a transaction on the
 * tx-read snapshot so the decision is authoritative against concurrent
 * writers (T-32-TOCTOU).
 */
export function decideLinkOutcome(
  existing: LinkTargetDoc | null,
  sessionUid: string,
): LinkOutcome {
  // (0) CR-02: a trainer account is never a linkable client — refuse before
  // any other rule (a trainer doc usually has NO coachId, which rule (1)
  // would otherwise happily classify as "link" and demote the trainer).
  // Wins over alreadyYours/stray too: no coachId combination makes
  // overwriting a trainer doc acceptable.
  if (existing?.role === "trainer") {
    return { kind: "trainerTarget" };
  }

  // (1) Normalize: empty / whitespace-only coachId is treated as no coach.
  const coachId = existing?.coachId?.trim() || null;
  if (!coachId) {
    return { kind: "link" };
  }

  // (2) Already your client — friendly no-op (wins over the stray rule).
  if (coachId === sessionUid) {
    return { kind: "alreadyYours" };
  }

  // (3) Claimable stray — a fallback-auto-assigned coach is claimable.
  if (existing?.autoAssignedCoach === true) {
    return { kind: "link" };
  }

  // (4) A different real coach owns this client — refuse.
  return { kind: "conflict", currentCoachId: coachId };
}
