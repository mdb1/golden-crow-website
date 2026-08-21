"use server";

// invite-actions.ts — issue #970. Resend the client email.
//
// ⚠️ Every export in this file MUST be `async`. Jest does not enforce the
// `"use server"` directive, so a synchronous export passes the entire suite and
// then fails `next build` with "Server Actions must be async functions" — and
// `main` auto-deploys, so that is a broken production deploy with 1500+ green
// tests (#785). Pure helpers belong in `./email/invite-email.ts`.
//
// ── Why a resend exists at all ──────────────────────────────────────────────
// The invitation is a single shot by decision (#970 answer 4: no N-day
// reminder). That makes the failure modes — it landed in spam, they deleted it,
// the mailbox bounced, SMTP was down when the client was added — unrecoverable
// without a manual retry. This is that retry, and it is also the only repair
// path for an `inviteEmailStatus: "failed"`, because re-adding the client would
// resolve to `alreadyYours` and write nothing.
//
// ── Rate limit ──────────────────────────────────────────────────────────────
// One send per RESEND_COOLDOWN_MINUTES per client. Not an abuse control — the
// caller is an authenticated coach acting on their own roster — but a
// double-click guard: a Server Action button that looks unresponsive for the
// two seconds an SMTP handshake takes gets clicked again, and the client should
// not receive the same email three times because of it.

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { deliverClientInvite, type InviteEmailStatus } from "./email/client-invite";
import { inviteEmailLocale } from "./email/locale";
import { normalizeMirrorEmail } from "./email-normalization";
import { resolveCoachDisplayName } from "./email/coach-name";

const RESEND_COOLDOWN_MINUTES = 5;

const resendSchema = z.object({
  /**
   * The pending client's mirror doc id, i.e. the normalized address. Present
   * only for the pending branch.
   */
  email: z.string().trim().toLowerCase().email().transform(normalizeMirrorEmail).optional(),
  /** The active client's uid. Present only for the already-a-user branch. */
  clientId: z.string().trim().min(6).max(128).optional(),
});

export type ResendInviteResult =
  | { ok: true; status: InviteEmailStatus }
  | { ok: false; reason: "cooldown" | "no-target" };

/**
 * Resend the client email for ONE client of the calling coach.
 *
 * Ownership is re-checked server-side against the doc, not taken from the
 * caller: a coach may only mail their own roster, and the email address is read
 * from the document rather than accepted as input so this can never be turned
 * into a "send mail to an arbitrary address from our domain" endpoint.
 */
export async function resendClientInvite(
  input: unknown,
): Promise<ResendInviteResult> {
  const session = await getCurrentTrainer();
  const parsed = resendSchema.parse(input);
  const db = gcFitnessFirestore();

  const target = parsed.clientId
    ? {
        ref: db.collection(FirestoreCollections.users).doc(parsed.clientId),
        kind: "linked" as const,
      }
    : parsed.email
      ? {
          ref: db.collection(FirestoreCollections.userMirror).doc(parsed.email),
          kind: "download" as const,
        }
      : null;
  if (!target) return { ok: false, reason: "no-target" };

  const snap = await target.ref.get();
  if (!snap.exists) return { ok: false, reason: "no-target" };
  if (snap.get("coachId") !== session.uid) throw new Error("Forbidden");

  // Read the address from the DOC. On the mirror branch the doc id is already
  // the normalized address, so `email` is only a nicety there; on the users
  // branch it is the only source.
  const to =
    (typeof snap.get("email") === "string" ? (snap.get("email") as string) : "") ||
    (parsed.email ?? "");
  if (!to) return { ok: false, reason: "no-target" };

  const lastAttempt = snap.get("inviteEmailLastAttemptAt") as
    | { toMillis?: () => number }
    | undefined;
  const lastAttemptMs =
    typeof lastAttempt?.toMillis === "function" ? lastAttempt.toMillis() : 0;
  if (Date.now() - lastAttemptMs < RESEND_COOLDOWN_MINUTES * 60_000) {
    return { ok: false, reason: "cooldown" };
  }

  const coachName = await resolveCoachDisplayName(session.uid, session.email);
  const displayName =
    (typeof snap.get("displayName") === "string"
      ? (snap.get("displayName") as string)
      : "") || null;

  const status = await deliverClientInvite({
    to,
    kind: target.kind,
    clientName: displayName,
    coachName,
    coachEmail: session.email,
    locale: await inviteEmailLocale(),
    markerRef: target.ref,
  });

  revalidateTag("gc-fitness-roster", "max");
  return { ok: true, status };
}
