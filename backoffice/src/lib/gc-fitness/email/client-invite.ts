// client-invite.ts — issue #970. Send the email and record what happened.
//
// Sits between the Server Actions and the transport so all THREE callers share
// one behavior: the `precreated-mirror` branch of `provisionClient`, its
// `attached-existing-user` branch, and the coach's resend button.
//
// ── This function never throws, and that is the design ──────────────────────
// A mail failure must not turn a completed client-add into an error for the
// coach: the client IS linked, the roster IS correct, and re-running
// `provisionClient` to "retry the email" would do nothing (a re-add of a client
// already yours resolves to `alreadyYours` and writes nothing). So a failure is
// recorded on the doc and surfaced as a resend button — not raised.
//
// ── The marker fields, and what they are NOT for ────────────────────────────
// Dedup was already solved before this feature existed: `decideLinkOutcome`
// answers `alreadyYours` when the target is already this coach's client, and
// both `provisionClient` branches return `already-linked` WITHOUT writing. So a
// coach re-adding the same email — fat finger, double submit, fixing the name —
// cannot re-send by construction.
//
// `inviteEmailStatus` / `inviteEmailSentAt` therefore exist so the coach can SEE
// whether it went out and when, and so the resend button has something to
// rate-limit against. Reading them as a dedup guard would be reading them wrong.

import "server-only";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";

import {
  buildClientInviteEmail,
  type InviteEmailKind,
  type InviteEmailLocale,
} from "./invite-email";
import { sendMail } from "./smtp";

/**
 * `skipped` — no SMTP configured (local, CI, preview). Nothing was attempted,
 * and that is deliberate: a preview deploy emailing a real roster would be an
 * incident, not a test.
 */
export type InviteEmailStatus = "sent" | "failed" | "skipped";

export interface DeliverClientInviteInput {
  to: string;
  kind: InviteEmailKind;
  clientName?: string | null;
  coachName: string;
  /** Replies land on the coach; a no-reply mailbox helps nobody here. */
  coachEmail?: string | null;
  locale: InviteEmailLocale;
  /**
   * `/user_mirror/{email}` for a pending client, `/users/{uid}` for one who
   * already had an account. `update` (not `set`) on purpose — if the doc
   * vanished under us, failing is better than resurrecting it as a stub
   * carrying nothing but invite bookkeeping.
   */
  markerRef: DocumentReference;
}

export async function deliverClientInvite(
  input: DeliverClientInviteInput,
): Promise<InviteEmailStatus> {
  const email = buildClientInviteEmail({
    kind: input.kind,
    clientEmail: input.to,
    clientName: input.clientName,
    coachName: input.coachName,
    locale: input.locale,
  });

  const result = await sendMail({
    to: input.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    ...(input.coachEmail ? { replyTo: input.coachEmail } : {}),
  });

  const status: InviteEmailStatus = result.ok
    ? "sent"
    : result.reason === "disabled"
      ? "skipped"
      : "failed";

  if (!result.ok && result.reason === "failed") {
    // The detail is for the server log ONLY. Next.js masks Server-Action error
    // messages in production anyway, and an SMTP error string can carry the
    // sending mailbox — neither belongs in the browser.
    console.warn("[gc-fitness/invite-email] send failed", {
      kind: input.kind,
      detail: result.detail,
    });
  }

  try {
    await input.markerRef.update({
      inviteEmailStatus: status,
      inviteEmailLastAttemptAt: FieldValue.serverTimestamp(),
      // `gcFitnessFirestore` does NOT set ignoreUndefinedProperties, so a
      // `cond ? x : undefined` field would throw. Conditional spread instead.
      ...(status === "sent"
        ? { inviteEmailSentAt: FieldValue.serverTimestamp() }
        : {}),
    });
  } catch (err) {
    // The mail may well have gone out; only the bookkeeping failed. Log and
    // move on — the alternative is failing an add that already succeeded.
    console.warn("[gc-fitness/invite-email] marker write failed", err);
  }

  return status;
}
