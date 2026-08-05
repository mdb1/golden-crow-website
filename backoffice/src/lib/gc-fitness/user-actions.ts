// user-actions.ts
//
// Server Actions for the GC Fitness trainer's OWN /users/{uid} self-write
// surface. Today this module exposes a single Action:
//
//   - updateChatQuickReplies(input) — write the trainer's CHAT-11 quick-reply
//     template list to their own /users/{session.uid}.chatQuickReplies.
//
// The full editor UI lands in P08-12 (the trainer Settings form). The
// Server Action ships here in P08-05 alongside the iOS writer + the
// firestore.rules whitelist extension so the wire path is end-to-end
// testable as soon as the form ships.
//
// SAME-WRITE-SHAPE invariant (Pitfall 7 — 10th reuse):
//   The iOS UserRepository.updateChatQuickReplies(_:) writer mirrors this
//   Server Action's wire shape — empty array → FieldValue.delete() so the
//   doc carries NO chatQuickReplies key (matches the Codable encoder's
//   omit-on-empty); non-empty → array replace; updatedAt always co-written
//   (Pitfall 9 inoculation, 7th reuse). Diverging the two writers would
//   silently split-brain the user doc between iOS sessions and backoffice
//   sessions.
//
// AUTH GATE:
//   getCurrentTrainer() — trainer role + email allowlist (P03-05). The
//   uid is resolved from `session.uid` AFTER the Zod parse so a tampered
//   input cannot surface a forged uid (T-08-05-03). The Firestore rule
//   layer (P08-05 affectedKeys whitelist extension) double-gates this
//   path via `uid == myUid()` + `affectedKeys.hasOnly([..., 'chatQuickReplies'])`.
//
// REFERENCE PATTERN: mirrors `habit-actions.ts` (P06-05) for the
// getCurrentTrainer integration + FieldValue.serverTimestamp + post-parse
// session-uid assignment; mirrors `chat-server-actions.ts` (P08-04) for
// the in-phase Server Action header style.
//
// Threat-register coverage (matches PLAN.md 08-05 <threat_model>):
//   T-08-05-01 (Tampering — cross-user write to another user's quick-reply set)
//     → docRef binds to `session.uid`, never to a caller-supplied uid; the
//       Zod schema does not accept a uid field at all (strip-unknown).
//       Rule layer double-gates via uid == myUid() on /users update.
//   T-08-05-02 (DoS — unbounded chatQuickReplies array growth)
//     → Zod schema caps at MAX 20 entries × MAX 240 chars each, trims
//       whitespace, drops empty strings post-trim. Defense in depth above
//       the unbounded rule-layer admission (rules have no per-field length
//       cap).
//   T-08-05-03 (Spoofing — caller-supplied uid in updateChatQuickReplies)
//     → uid resolved AFTER getCurrentTrainer() gate; never from caller
//       input. Same convention as createHabit's trainerId post-parse
//       assignment (T-06-05-01 mitigation).

"use server";

import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import {
  gcFitnessAuth,
  gcFitnessFirestore,
} from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import {
  clientAddedEvent,
  markCoachActivityDeleted,
  recordCoachActivityEvent,
} from "./coach-activity-log";
import {
  decideLinkOutcome,
  LinkRefusedError,
  type LinkOutcome,
  type LinkRefusalMode,
} from "./coach-link";
import { FirestoreCollections } from "./collections";
import { normalizeMirrorEmail } from "./email-normalization";

/**
 * Per-template length cap. 240 chars is generous for a quick-reply
 * ("Great job! See you tomorrow at the gym for a strong push session 💪"
 * is ~80 chars) — the cap exists to prevent a malicious trainer from
 * bloating their own user doc to abuse Firestore's per-doc 1 MiB limit
 * (T-08-05-02 DoS mitigation).
 */
const MAX_TEMPLATE_CHARS = 240;

/**
 * Per-trainer template-count cap. 20 is well above any realistic
 * one-tap-insert dropdown size (a trainer scrolling 20 items in a
 * dropdown already has UX problems); the cap exists for the same
 * doc-bloat DoS mitigation as `MAX_TEMPLATE_CHARS`.
 */
const MAX_TEMPLATES = 20;

const provisionClientSchema = z.object({
  email: z.string().trim().toLowerCase().email().transform(normalizeMirrorEmail),
  displayName: z.string().trim().max(120).optional(),
});

/**
 * Zod schema for `updateChatQuickReplies` input. Caps at 20 templates ×
 * 240 chars each, trims surrounding whitespace, and drops empty strings
 * post-trim so a trainer cannot push `["", "", ""]` to spend their
 * template budget on whitespace.
 *
 * Defense-in-depth note: the rule layer (P08-05) has NO per-field length
 * cap — the affectedKeys.hasOnly([..., 'chatQuickReplies']) admission is
 * unbounded by Firestore rules' static-syntax constraints (no
 * `.size().bytes()` predicate is portable across the v1 rule grammar).
 * The Server Action is therefore the SOLE enforcement of these caps;
 * the iOS writer does no validation by design (the iOS app never
 * surfaces an editor — clients always store nil).
 */
const updateChatQuickRepliesSchema = z.object({
  replies: z
    .array(z.string().max(MAX_TEMPLATE_CHARS))
    .max(MAX_TEMPLATES)
    .transform((arr) =>
      arr.map((s) => s.trim()).filter((s) => s.length > 0),
    ),
});

/**
 * Server Action: update `/users/{trainer.uid}.chatQuickReplies`.
 *
 * Trainer-only — `getCurrentTrainer()` is the gate; the rule layer
 * (P02-05 + P07-01 + P08-05) admits the write for any signed-in uid
 * but only trainer accounts have a UI surface (the backoffice Settings
 * form in P08-12).
 *
 * Wire shape mirrors `UserRepository.updateChatQuickReplies` (iOS,
 * P08-05):
 *   - Empty array → `FieldValue.delete()` (matches the Codable
 *     encoder's omit-on-empty so the doc carries NO chatQuickReplies
 *     key when no templates are set).
 *   - Non-empty → array replace.
 *   - `updatedAt` co-written via `serverTimestamp()` (Pitfall 9
 *     inoculation — 8th reuse).
 *
 * Mitigates: T-08-05-01 (cross-user write — docRef binds to
 * `session.uid`), T-08-05-02 (DoS via unbounded array growth — Zod cap
 * 20 × 240), T-08-05-03 (caller-supplied uid — never from input).
 */
export async function updateChatQuickReplies(
  input: unknown,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();

  // Zod-parse FIRST. The schema has no `uid` field at all; even if a
  // future schema rev accidentally accepts one, the docRef below
  // binds to `session.uid` (T-08-05-03).
  const parsed = updateChatQuickRepliesSchema.parse(input);

  const db = gcFitnessFirestore();
  const docRef = db.collection(FirestoreCollections.users).doc(session.uid);

  if (parsed.replies.length === 0) {
    // Empty → match the iOS writer's FieldValue.delete() so both
    // writers produce byte-identical wire diffs (the doc carries NO
    // chatQuickReplies key when no templates are set).
    await docRef.update({
      chatQuickReplies: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await docRef.update({
      chatQuickReplies: parsed.replies,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return { ok: true };
}

/**
 * 260523-kpt — Zod schema for `updatePreferredLocale` input. The `locale`
 * field is the ONLY accepted key; uid is resolved post-parse from
 * `getCurrentTrainer().uid` so a tampered payload cannot smuggle a
 * cross-user write (T-i18n-06 mitigation; same Pitfall 7 / T-08-05-03
 * pattern reused from updateChatQuickReplies).
 */
const updatePreferredLocaleSchema = z.object({
  locale: z.enum(["en", "es"]),
});

/**
 * 260523-kpt — Server Action: update `/users/{trainer.uid}.preferredLocale`
 * AND set the NEXT_LOCALE cookie in the same request so the next page
 * paint re-renders in the chosen locale without a Firestore round-trip.
 *
 * Trainer-only — `getCurrentTrainer()` is the gate; the rule layer
 * (firestore.rules — gc-fitness repo) admits self-write for any signed-in
 * uid AND pins the enum to {en, es} via a shape guard (defense in depth
 * above this Zod gate).
 *
 * Wire shape — INPUT: `{ locale: 'en' | 'es' }`. OUTPUT: `{ ok: true }`.
 * No other shape; no errorCode union; throws on Forbidden / Zod failure
 * (the caller catches and surfaces via toast).
 *
 * Cookie write — `httpOnly: false` matches the existing
 * /api/gc-fitness/locale route convention (Phase 13 decision retained).
 * `maxAge: 1 year` so a returning trainer's preference survives the
 * usual session cookie expiry.
 *
 * Threat coverage (PLAN 260523-kpt threat model):
 *   - T-i18n-01 (Tampering): Zod rejects any non-{en, es} value.
 *   - T-i18n-06 (Spoofing — caller-supplied uid): schema has NO uid field;
 *     docRef binds to `session.uid` post-getCurrentTrainer.
 */
export async function updatePreferredLocale(
  input: z.infer<typeof updatePreferredLocaleSchema>,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  // Zod-parse FIRST (defense in depth — even if the input type changes
  // upstream, the schema rejects anything outside the enum).
  const parsed = updatePreferredLocaleSchema.parse(input);

  const db = gcFitnessFirestore();
  await db
    .collection(FirestoreCollections.users)
    .doc(session.uid)
    .update({
      preferredLocale: parsed.locale,
      updatedAt: FieldValue.serverTimestamp(),
    });

  // Set the cookie in the same request so the immediate router.refresh()
  // (or next navigation) picks up the new locale without waiting for the
  // request.ts Firestore hydration step. The cookie is read by
  // src/i18n/request.ts on every subsequent request and short-circuits
  // the locale resolution chain at step 1.
  (await cookies()).set("NEXT_LOCALE", parsed.locale, {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax",
    httpOnly: false,
  });

  return { ok: true };
}

function fallbackName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart || email;
}

/**
 * D-02 refused-steal audit. A single support-triage server log line for a
 * refused coach-link conflict. Deliberately NOT written to the coach-activity
 * event log or the admin-operations log — those surface in the REQUESTING
 * coach's My-Activity feed and would leak the other coach's identity (threat
 * T-32-E2). The existingCoachId is safe ONLY here, in a server-side log line
 * the requesting coach can never read.
 */
function logLinkConflictRefused(params: {
  actorUid: string;
  targetEmail: string;
  targetUid: string | null;
  existingCoachId: string;
}): void {
  console.warn("[gc-fitness/coach-link] link_conflict_refused", params);
}

/**
 * CR-02 audit line for a refused trainer-target link attempt. Server-side
 * console only — same T-32-E2 confinement as logLinkConflictRefused: this
 * MUST NOT flow into the coach-activity event log, and the requesting coach
 * only ever sees the mode-keyed banner copy (which names the typed email,
 * never the fact that the doc belongs to a trainer's roster or claims).
 */
function logLinkTrainerTargetRefused(params: {
  actorUid: string;
  targetEmail: string;
  targetUid: string | null;
}): void {
  console.warn("[gc-fitness/coach-link] link_trainer_target_refused", params);
}

async function trainerProfile(
  uid: string,
  email: string,
): Promise<{ displayName: string; photoURL: string | null; bio: string | null }> {
  const auth = gcFitnessAuth();
  const [snap, authUser] = await Promise.all([
    gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(uid)
    .get(),
    auth.getUser(uid).catch(() => null),
  ]);
  const name = snap.exists ? snap.get("displayName") : undefined;
  const photoURL = snap.exists ? snap.get("photoURL") : undefined;
  const bio = snap.exists ? snap.get("bio") : undefined;
  return {
    displayName:
      typeof name === "string" && name.trim().length > 0
        ? name.trim()
        : fallbackName(email),
    photoURL:
      typeof photoURL === "string" && photoURL.trim().length > 0
        ? photoURL.trim()
        : typeof authUser?.photoURL === "string" && authUser.photoURL.trim().length > 0
          ? authUser.photoURL.trim()
        : null,
    bio:
      typeof bio === "string" && bio.trim().length > 0
        ? bio.trim()
        : null,
  };
}

async function fanOutCoachProfile(
  db: ReturnType<typeof gcFitnessFirestore>,
  coachId: string,
  displayName: string,
  photoURL: string | null,
  bio: string | null,
): Promise<void> {
  const updates = {
    coachDisplayName: displayName,
    coachPhotoURL: photoURL,
    coachBio: bio,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const [clientSnap, mirrorSnap] = await Promise.all([
    db.collection(FirestoreCollections.users)
      .where("coachId", "==", coachId)
      .get(),
    db.collection(FirestoreCollections.userMirror)
      .where("coachId", "==", coachId)
      .get(),
  ]);

  const docs = [...clientSnap.docs, ...mirrorSnap.docs];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) {
      batch.set(doc.ref, updates, { merge: true });
    }
    await batch.commit();
  }
}

const updateTrainerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  photoURL: z.string().trim().url().nullable().optional(),
  bio: z.string().trim().max(280).nullable().optional(),
});

export async function updateTrainerProfile(
  input: unknown,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const parsed = updateTrainerProfileSchema.parse(input);
  const db = gcFitnessFirestore();
  const docRef = db.collection(FirestoreCollections.users).doc(session.uid);
  const photoURL = parsed.photoURL ?? null;
  const bio = parsed.bio ?? null;
  await docRef.set(
    {
      email: session.email,
      displayName: parsed.displayName,
      photoURL,
      bio,
      coachBio: bio,
      role: "trainer",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await fanOutCoachProfile(db, session.uid, parsed.displayName, photoURL, bio);
  revalidateTag("gc-fitness-roster", "max");
  return { ok: true };
}

const updateClientNicknameSchema = z.object({
  clientId: z.string().trim().min(1),
  coachNickname: z.string().trim().max(120).nullable().optional(),
});

export async function updateClientNickname(
  input: unknown,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const parsed = updateClientNicknameSchema.parse(input);
  const db = gcFitnessFirestore();
  const clientRef = db.collection(FirestoreCollections.users).doc(parsed.clientId);
  const snap = await clientRef.get();
  if (!snap.exists || snap.get("coachId") !== session.uid) {
    throw new Error("Forbidden");
  }
  await clientRef.set(
    {
      coachNickname: parsed.coachNickname ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  revalidateTag("gc-fitness-roster", "max");
  return { ok: true };
}

/**
 * Server Action: attach a client email to the current trainer.
 *
 * If the email already has a Firebase Auth user, this creates/updates
 * `/users/{uid}` and sets custom claims so the iOS app can read/write under
 * the normal client rules immediately. If the email does not exist yet, it
 * creates `/user_mirror/{email}` for the first-sign-in provisioning path.
 *
 * REFUSALS ARE RETURN VALUES, NOT THROWN ERRORS (CR-03): production Next.js
 * masks Server-Action error messages (generic copy + digest), so a thrown
 * localized message renders as a generic error exactly in the auto-deployed
 * prod build. Expected refusals (conflict / self-add) come back as
 * `{ ok: false, mode }`; the form maps the mode to client-side translated
 * copy. The tx-internal throw is a sentinel (LinkRefusedError) whose only
 * job is aborting the transaction before any write.
 */
export async function provisionClient(input: unknown): Promise<
  | {
      ok: true;
      mode: "attached-existing-user" | "precreated-mirror" | "already-linked";
    }
  | { ok: false; mode: LinkRefusalMode }
> {
  const session = await getCurrentTrainer();
  const parsed = provisionClientSchema.parse(input);
  const db = gcFitnessFirestore();
  const auth = gcFitnessAuth();
  const coach = await trainerProfile(session.uid, session.email);
  const coachDisplayName = coach.displayName;
  const displayName = parsed.displayName || fallbackName(parsed.email);

  let authUser: Awaited<ReturnType<typeof auth.getUserByEmail>> | null = null;
  try {
    authUser = await auth.getUserByEmail(parsed.email);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }

  if (!authUser) {
    // MIRROR branch. A pre-existing `/user_mirror/{email}` owned by a DIFFERENT
    // coach is a second silent-steal vector (Pitfall 1) — gate it read-before-
    // write inside a transaction so a concurrent writer can't slip past.
    const mirrorRef = db
      .collection(FirestoreCollections.userMirror)
      .doc(parsed.email);
    let mirrorOutcomeKind: LinkOutcome["kind"];
    try {
      mirrorOutcomeKind = await db.runTransaction<LinkOutcome["kind"]>(
      async (tx) => {
        const mirrorSnap = await tx.get(mirrorRef);
        const outcome = decideLinkOutcome(
          mirrorSnap.exists
            ? (mirrorSnap.data() as {
                coachId?: string | null;
                autoAssignedCoach?: boolean;
                role?: string | null;
              })
            : null,
          session.uid,
        );
        if (outcome.kind === "trainerTarget") {
          // CR-02: mirror docs shouldn't carry role, but if one ever does,
          // refuse for the same reason as the /users branch below.
          logLinkTrainerTargetRefused({
            actorUid: session.uid,
            targetEmail: parsed.email,
            targetUid: null,
          });
          throw new LinkRefusedError("trainer-target");
        }
        if (outcome.kind === "conflict") {
          logLinkConflictRefused({
            actorUid: session.uid,
            targetEmail: parsed.email,
            targetUid: null,
            existingCoachId: outcome.currentCoachId,
          });
          // Sentinel throw INSIDE the tx → aborts before any write (CR-03:
          // caught below and converted to a { ok: false } result — the
          // message never travels to the browser, so prod masking is moot).
          throw new LinkRefusedError("conflict");
        }
        if (outcome.kind === "alreadyYours") {
          return "alreadyYours"; // no write — friendly no-op surfaced below
        }
        tx.set(
          mirrorRef,
          {
            email: parsed.email,
            displayName,
            coachId: session.uid,
            coachDisplayName,
            coachPhotoURL: coach.photoURL,
            coachBio: coach.bio,
            // CR-01: a claimed doc is no longer a stray. Without this delete,
            // `merge: true` preserves `autoAssignedCoach: true` and rule (3)
            // of decideLinkOutcome keeps the claimed target silently
            // stealable by any other coach. (The migration's other stray
            // fields — coachDisplayName/PhotoURL/Bio — are overwritten above.)
            autoAssignedCoach: FieldValue.delete(),
            pre_created: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return "link";
      },
      );
    } catch (err) {
      if (err instanceof LinkRefusedError) {
        return { ok: false, mode: err.mode };
      }
      throw err;
    }
    if (mirrorOutcomeKind === "alreadyYours") {
      return { ok: true, mode: "already-linked" };
    }
    // #682 — leave a coach-attributed trail. Best-effort by contract: a logging
    // failure must never turn a completed link into an error for the coach.
    await recordCoachActivityEvent(
      db,
      clientAddedEvent({
        trainerId: session.uid,
        email: parsed.email,
        displayName,
        clientId: null,
        mode: "precreated-mirror",
      }),
    );
    revalidateTag("gc-fitness-roster", "max");
    return { ok: true, mode: "precreated-mirror" };
  }

  if (authUser.uid === session.uid) {
    // CR-03: expected refusal → result, not a thrown (prod-masked) message.
    return { ok: false, mode: "self" };
  }

  // EXISTING-USER branch. Read-before-write the /users doc INSIDE the tx and
  // refuse a different-coach conflict. Claims are set only AFTER the tx commits
  // (below) so a refusal/abort can never leave claims pointing at a client
  // whose doc was never written (threat T-32-DIVERGE).
  const userRef = db.collection(FirestoreCollections.users).doc(authUser.uid);
  const chatRef = db.collection(FirestoreCollections.chats).doc(authUser.uid);
  let userOutcomeKind: LinkOutcome["kind"];
  try {
    userOutcomeKind = await db.runTransaction<LinkOutcome["kind"]>(
    async (tx) => {
      const userSnap = await tx.get(userRef);
      const data = userSnap.exists ? userSnap.data() ?? {} : {};
      const outcome = decideLinkOutcome(
        userSnap.exists
          ? (data as {
              coachId?: string | null;
              autoAssignedCoach?: boolean;
              role?: string | null;
            })
          : null,
        session.uid,
      );
      if (outcome.kind === "trainerTarget") {
        // CR-02: the target is another TRAINER's account — linking would
        // overwrite their doc (role → "client", coachId → this coach) and
        // then clobber their role claim post-commit, demoting and locking
        // them out. Refuse before any write.
        logLinkTrainerTargetRefused({
          actorUid: session.uid,
          targetEmail: parsed.email,
          targetUid: authUser.uid,
        });
        throw new LinkRefusedError("trainer-target");
      }
      if (outcome.kind === "conflict") {
        logLinkConflictRefused({
          actorUid: session.uid,
          targetEmail: parsed.email,
          targetUid: authUser.uid,
          existingCoachId: outcome.currentCoachId,
        });
        // Sentinel throw INSIDE the tx → aborts before any write; claims
        // still untouched (CR-03: converted to a result below).
        throw new LinkRefusedError("conflict");
      }
      if (outcome.kind === "alreadyYours") {
        // No doc writes; claims ARE (re-)synced post-commit — WR-01: the
        // idempotent setCustomUserClaims below heals a divergence left by a
        // prior post-commit claims failure when the trainer resubmits.
        return "alreadyYours";
      }
      // WR-02: read the chat doc INSIDE the tx (all tx reads must precede
      // writes) so createdAt can be create-only below — re-linking an
      // existing user must not reset the chat's original creation timestamp.
      const chatSnap = await tx.get(chatRef);
      tx.set(
        userRef,
        {
          email: parsed.email,
          displayName:
            parsed.displayName ||
            (typeof data.displayName === "string" &&
            data.displayName.length > 0
              ? data.displayName
              : authUser.displayName || displayName),
          photoURL: authUser.photoURL ?? data.photoURL ?? null,
          role: "client",
          coachId: session.uid,
          // CR-01: claiming a Phase-29 fallback-migrated stray MUST clear the
          // stray marker — otherwise the doc stays `{ coachId: <me>,
          // autoAssignedCoach: true }`, which decideLinkOutcome rule (3)
          // still classifies as claimable, so any other coach could silently
          // steal the client you just claimed (and the roster "NEW" badge
          // never clears). `merge: true` preserves absent fields, so an
          // explicit FieldValue.delete() is required.
          autoAssignedCoach: FieldValue.delete(),
          coachDisplayName,
          coachPhotoURL: coach.photoURL,
          coachBio: coach.bio,
          preferences: data.preferences ?? {},
          fcmTokens: data.fcmTokens ?? [],
          deleted: false,
          createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        chatRef,
        {
          clientId: authUser.uid,
          coachId: session.uid,
          // WR-02: no unreadCount here. `data` is the USER doc snapshot, so
          // `data.unreadCount ?? {}` was always {} — counters live on
          // /chats/{clientId} and merge:true preserves them; writing an
          // (accidentally empty) map only worked by the grace of merge
          // semantics and would wipe both parties' counters under any
          // future non-merge/flat-field write. createdAt is CREATE-ONLY:
          // claiming a stray with chat history must not reset it.
          ...(chatSnap.exists
            ? {}
            : { createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return "link";
    },
    );
  } catch (err) {
    if (err instanceof LinkRefusedError) {
      return { ok: false, mode: err.mode };
    }
    throw err;
  }

  // Claims AFTER the doc-write commit (T-32-DIVERGE): the benign direction
  // (doc written, claims lag) self-heals via the Phase 30 forced token refresh.
  //
  // WR-01: this ALSO runs on the alreadyYours path. If a previous submit
  // committed the tx but the claims call failed (network blip / Auth outage),
  // the trainer's natural recovery is to resubmit — which now resolves to
  // alreadyYours. Skipping claims there would leave the doc/claims divergence
  // unrepairable from the UI. The call is an idempotent no-op when claims
  // already match, so running it on every resolution of the existing-user
  // branch is safe and heals the divergence on retry.
  await auth.setCustomUserClaims(authUser.uid, {
    ...(authUser.customClaims ?? {}),
    role: "client",
    coachId: session.uid,
  });

  if (userOutcomeKind === "alreadyYours") {
    return { ok: true, mode: "already-linked" };
  }

  // #682 — same trail as the mirror branch above. The `/users/{uid}` write this
  // action performs DOES reach `audit_log`, but it is the client's own doc, so
  // that row reads as the client changing coach; this one names the coach.
  await recordCoachActivityEvent(
    db,
    clientAddedEvent({
      trainerId: session.uid,
      email: parsed.email,
      displayName,
      clientId: authUser.uid,
      mode: "attached-existing-user",
    }),
  );

  revalidateTag("gc-fitness-roster", "max");
  return { ok: true, mode: "attached-existing-user" };
}

/**
 * Server Action: read the current trainer's profile slice that the chat
 * UI needs — `chatQuickReplies` (CHAT-11 dropdown source) + `displayName`
 * (header label fallback). Returns an empty/zeroed shape if the user doc
 * doesn't exist yet (a brand-new trainer who has never opened Settings).
 *
 * Used by:
 *   - P08-12 QuickReplyDropdown (chat MessageInput sibling) — populates
 *     the one-tap-insert menu.
 *   - P08-12 Settings page (`/gc-fitness/settings`) — seeds the
 *     `QuickRepliesForm` initialReplies prop without exposing the full
 *     /users/{uid} payload to the client.
 *
 * AUTH GATE: `getCurrentTrainer()` — same trainer-role + email-allowlist
 * gate as `updateChatQuickReplies`. The trainer reads only their own
 * profile (T-08-12-01 mitigation — cross-trainer reads impossible since
 * `session.uid` binds the docRef; the caller cannot supply a uid).
 *
 * THREAT NOTE: This Action returns ONLY a hand-picked slice (uid +
 * displayName + chatQuickReplies). It does NOT return the full /users
 * doc — that would leak fields like email / FCM tokens / role metadata
 * to the client bundle unnecessarily. Keep the shape narrow.
 */
export async function getCurrentTrainerProfile(): Promise<{
  uid: string;
  displayName: string;
  photoURL: string | null;
  bio: string | null;
  chatQuickReplies: string[];
}> {
  const session = await getCurrentTrainer();
  const auth = gcFitnessAuth();
  const db = gcFitnessFirestore();
  const [snap, authUser] = await Promise.all([
    db
      .collection(FirestoreCollections.users)
      .doc(session.uid)
      .get(),
    auth.getUser(session.uid).catch(() => null),
  ]);
  if (!snap.exists) {
    return {
      uid: session.uid,
      displayName: "",
      photoURL: null,
      bio: null,
      chatQuickReplies: [],
    };
  }
  const data = snap.data() as {
    displayName?: string;
    photoURL?: string;
    bio?: string;
    chatQuickReplies?: string[];
  };
  return {
    uid: session.uid,
    displayName: data.displayName ?? "",
    photoURL:
      typeof data.photoURL === "string" && data.photoURL.trim().length > 0
        ? data.photoURL.trim()
        : typeof authUser?.photoURL === "string" && authUser.photoURL.trim().length > 0
          ? authUser.photoURL.trim()
        : null,
    bio:
      typeof data.bio === "string" && data.bio.trim().length > 0
        ? data.bio.trim()
        : null,
    chatQuickReplies: data.chatQuickReplies ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue #753 — a coach removing someone from their own roster
//
// Both operations already existed, but ONLY as admin god-mode tools in
// `admin-actions.ts` (`removePendingClientForCoach` / `unlinkClientFromCoach`),
// which means a coach who mistyped an invite email or whose client stopped
// training had to ask an operator. These are the coach-scoped twins: same wire
// effect, but the coach uid comes from `getCurrentTrainer()` instead of being a
// caller-supplied argument, so a coach can only ever act on their own roster.
//
// Neither deletes a person. `unlinkClient` clears the link and leaves the
// account (and its history) intact — the destructive
// `deleteClientCascade` stays admin-only on purpose.
// ─────────────────────────────────────────────────────────────────────────────

const removePendingClientSchema = z.object({
  email: z.string().trim().toLowerCase().email().transform(normalizeMirrorEmail),
});

/**
 * Delete a PENDING client — the `/user_mirror/{email}` placeholder a coach
 * created with `provisionClient` for someone who has never signed in.
 *
 * Also drops the content pre-loaded against that email. This is not tidiness:
 * `convertMirrorToCanonical` claims pre-loaded docs by `pendingEmail` on first
 * sign-in, so an orphaned assignment/habit would silently attach itself to the
 * person later — even if by then they belong to a DIFFERENT coach. Both queries
 * are scoped to `trainerId == me`, so a second coach's pre-loads for the same
 * email are never touched.
 *
 * Idempotent: removing an already-removed pending client is a no-op success,
 * which keeps a double-submit from turning into an error the coach has to read.
 */
export async function removePendingClient(input: unknown): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const parsed = removePendingClientSchema.parse(input);
  const db = gcFitnessFirestore();

  const mirrorRef = db
    .collection(FirestoreCollections.userMirror)
    .doc(parsed.email);
  const mirrorSnap = await mirrorRef.get();
  if (!mirrorSnap.exists) {
    revalidateTag("gc-fitness-roster", "max");
    return { ok: true };
  }
  if (mirrorSnap.get("coachId") !== session.uid) {
    throw new Error("Forbidden");
  }

  const [assignments, habits] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("trainerId", "==", session.uid)
      .where("pendingEmail", "==", parsed.email)
      .get(),
    db
      .collection(FirestoreCollections.habits)
      .where("trainerId", "==", session.uid)
      .where("pendingEmail", "==", parsed.email)
      .get(),
  ]);

  const batch = db.batch();
  for (const doc of [...assignments.docs, ...habits.docs]) batch.delete(doc.ref);
  batch.delete(mirrorRef);
  await batch.commit();

  // The roster row came from `clientAddedEvent`, keyed by (coach, email) — mark
  // that same event deleted so My Activity reads "Quitó un cliente" instead of
  // still advertising an add that has been undone. Best-effort by contract.
  await markCoachActivityDeleted(db, `client:${session.uid}:${parsed.email}`);
  revalidateTag("gc-fitness-roster", "max");
  return { ok: true };
}

const unlinkClientSchema = z.object({
  clientId: z.string().trim().min(6).max(128),
});

/**
 * Detach an ACTIVE client from the calling coach — "des-linkear", the inverse
 * of `provisionClient`. The person keeps their account, their history and the
 * program they were given; they simply become coach-less (self-serve) and drop
 * off this coach's roster.
 *
 * Mirrors `unlinkClientFromCoach` in `admin-actions.ts` field for field: clear
 * the link + the denormalized coach fields, clear `coachId` on the 1:1 chat doc
 * (which removes the thread from the ex-coach's inbox query and fails
 * `isChatParticipant` for them WITHOUT destroying the client's history — a later
 * re-link restores it), and resync the custom claim. The claim write is
 * fail-soft on purpose: the Firestore doc is the source of truth and the claim
 * catches up on the client's next token refresh.
 *
 * Side effect worth knowing before confirming: a coached user is entitled to
 * premium through their coach, so unlinking drops them to their own tier.
 */
export async function unlinkClient(input: unknown): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const parsed = unlinkClientSchema.parse(input);
  const db = gcFitnessFirestore();

  const clientRef = db.collection(FirestoreCollections.users).doc(parsed.clientId);
  const clientSnap = await clientRef.get();
  // Same shape as every other coach-scoped gate here: an unowned or missing
  // client is indistinguishable from the caller's point of view.
  if (!clientSnap.exists || clientSnap.get("coachId") !== session.uid) {
    throw new Error("Forbidden");
  }
  const clientEmail =
    typeof clientSnap.get("email") === "string" ? (clientSnap.get("email") as string) : null;

  const chatRef = db.collection(FirestoreCollections.chats).doc(parsed.clientId);
  const chatSnap = await chatRef.get();

  const batch = db.batch();
  batch.update(clientRef, {
    coachId: FieldValue.delete(),
    coachDisplayName: FieldValue.delete(),
    coachPhotoURL: FieldValue.delete(),
    coachBio: FieldValue.delete(),
    // The "auto-assigned, needs triage" marker is meaningless with no coach.
    autoAssignedCoach: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (chatSnap.exists) {
    batch.update(chatRef, {
      coachId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  try {
    const authUser = await gcFitnessAuth().getUser(parsed.clientId);
    const { coachId: _dropped, ...rest } = (authUser.customClaims ?? {}) as Record<
      string,
      unknown
    >;
    await gcFitnessAuth().setCustomUserClaims(parsed.clientId, {
      ...rest,
      role: "client",
    });
  } catch {
    // fail-soft — see the doc comment.
  }

  if (clientEmail) {
    await markCoachActivityDeleted(
      db,
      `client:${session.uid}:${normalizeMirrorEmail(clientEmail)}`,
    );
  }
  revalidateTag("gc-fitness-roster", "max");
  return { ok: true };
}
