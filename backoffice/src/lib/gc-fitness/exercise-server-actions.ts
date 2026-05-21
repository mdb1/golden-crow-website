// exercise-server-actions.ts
//
// Server Actions for the GC Fitness trainer Exercise CRUD surface. This module
// is the ONLY trainer-writable path to /exercises (Firestore rules from 03-03
// deny client-SDK writes). Every guarantee — allowlist enforcement, role
// check, ownership claim, source-immutability, 60-min signed URL pinned to
// video/mp4, 50 MB content-length cap — lives here.
//
// HISTORY:
//  - P03-06 shipped a STUB version (function names + signatures only) so the
//    trainer form + dropzone components could compile during Wave 2 parallel
//    execution.
//  - P03-05 (this commit) REPLACES that stub with the production
//    implementation:
//      * `getCurrentTrainer()` enforces allowlist + role (auth-helpers.ts).
//      * `createExercise` REJECTS (does not silently overwrite) inputs that
//        claim a different `ownerId` than the caller — threat-register
//        OWNERSHIP-CLAIM.
//      * Doc ID convention: `custom-${trainer.uid}-${crypto.randomUUID()}`
//        for trainer-authored docs (matches `wger-${uuid}` prefix scheme
//        from 03-CONTEXT.md and the security rule from 03-03).
//      * `mintExerciseMediaUploadUrl` validates the exerciseId starts with
//        `custom-${trainer.uid}-` (path-traversal defense — threat-register
//        PATH-TRAVERSAL).
//      * `duplicateExercise` INHERITS the source `mediaURL` (`gs://...`
//        path) — the trainer's first action after duplication is to play
//        the clip and decide whether to re-upload. Wiping it would force a
//        re-upload they may not need.
//
// Threat-register coverage (matches plan 03-05 <threat_model>):
//   T-03-05-ALLOWLIST-BYPASS   getCurrentTrainer()
//   T-03-05-OWNERSHIP-CLAIM    createExercise
//   T-03-05-CROSS-TRAINER-UPDATE  updateExercise + softDeleteExercise
//   T-03-05-WGER-MUTATION      updateExercise + softDeleteExercise
//   T-03-05-CONTENT-TYPE-SPOOF mintExerciseMediaUploadUrl (server pin only;
//                              client-side .type check lands in 03-06)
//   T-03-05-PATH-TRAVERSAL     mintExerciseMediaUploadUrl
//   T-03-05-COST-DOS           mintExerciseMediaUploadUrl

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";

import {
  exerciseSchema,
  exerciseUpdateSchema,
  type ExerciseInput,
} from "./exercise-schema";
import { getCurrentTrainer } from "./auth-helpers";

const COLLECTION = "exercises";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 60 minutes

// Cloud Storage bucket derived from the project ID env var. 03-CONTEXT.md
// locks the path: `exercises/{firestoreDocId}.mp4`. The bucket name is the
// `gs://` host (`gcfitness-3476b.firebasestorage.app`).
function getMediaBucketName(): string {
  const bucketName =
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
    "gcfitness-3476b.firebasestorage.app";
  return bucketName;
}

/**
 * Creates a NEW trainer-owned exercise.
 *
 * Source-immutability: the action ASSERTS the input claims
 * `source: "trainer"` (or omits the field — defaulted) and `ownerId` equal
 * to the calling trainer's UID. Sending `source: "wger"` or
 * `ownerId: "<another-trainer>"` is REJECTED with a descriptive error
 * (threat-register OWNERSHIP-CLAIM mitigation).
 *
 * Doc ID convention: `custom-${trainer.uid}-${crypto.randomUUID()}`.
 */
export async function createExercise(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();

  // Pre-Zod ownership guard: if the input explicitly claims an `ownerId`
  // OR a `source` that doesn't match the caller, reject. Silently
  // overwriting (as the 03-06 stub did) hides a bug class — an attacker
  // probing the API by sending `ownerId: "victim-uid"` should see a clear
  // 403, not a confusing 200.
  if (typeof input === "object" && input !== null) {
    const raw = input as { ownerId?: unknown; source?: unknown };
    if (
      typeof raw.ownerId === "string" &&
      raw.ownerId !== "" &&
      raw.ownerId !== trainer.uid
    ) {
      throw new Error("Trainers can only create exercises they own.");
    }
    if (
      typeof raw.source === "string" &&
      raw.source !== "" &&
      raw.source !== "trainer"
    ) {
      throw new Error("Trainers can only create exercises with source=trainer.");
    }
  }

  // Normalize source + ownerId to the caller before validation so the Zod
  // schema gets a fully-populated shape. The pre-check above already
  // rejected any conflicting incoming value.
  const normalized = {
    ...(typeof input === "object" && input !== null ? input : {}),
    source: "trainer" as const,
    ownerId: trainer.uid,
  };
  const data = exerciseSchema.parse(normalized) as ExerciseInput;

  const db = gcFitnessFirestore();
  const docId = `custom-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);
  await docRef.set({
    ...data,
    id: docId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  });

  return { id: docId };
}

/**
 * Updates an existing trainer-owned exercise.
 *
 * Pre-flight reads the existing doc and refuses if:
 *  - the doc doesn't exist (throws "Not found")
 *  - the doc's `source` is `"wger"` (throws "wger-seeded exercises are
 *    read-only" — threat-register WGER-MUTATION mitigation)
 *  - the doc's `ownerId` is not the caller (throws "Not your exercise" —
 *    threat-register CROSS-TRAINER-UPDATE mitigation)
 *
 * Bumps `version` via `FieldValue.increment(1)` and stamps `updatedAt`.
 * Strips any incoming `source` / `ownerId` keys from the patch — those
 * fields are immutable once the doc is created.
 */
export async function updateExercise(
  id: string,
  input: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as {
    source?: string;
    ownerId?: string | null;
  };
  if (existing.source === "wger") {
    throw new Error("wger-seeded exercises are read-only.");
  }
  if (existing.ownerId !== trainer.uid) {
    throw new Error("Not your exercise.");
  }

  const patch = exerciseUpdateSchema.parse(input);

  // Strip source / ownerId from the patch — they are immutable after
  // creation. The Zod schema accepts them (so the partial-update form can
  // round-trip a full read), but Firestore should never see them in the
  // update() payload.
  const safe = { ...patch };
  delete (safe as { source?: unknown }).source;
  delete (safe as { ownerId?: unknown }).ownerId;

  await docRef.update({
    ...safe,
    updatedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  });

  return { ok: true };
}

/**
 * Soft-deletes a trainer-owned exercise (sets `deleted: true`). Refuses on
 * the same grounds as `updateExercise`. Hard-delete is permanently gated
 * by Firestore rules from 03-03.
 */
export async function softDeleteExercise(
  id: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as {
    source?: string;
    ownerId?: string | null;
  };
  if (existing.source === "wger") {
    throw new Error("Cannot delete wger-seeded exercises.");
  }
  if (existing.ownerId !== trainer.uid) {
    throw new Error("Not your exercise.");
  }

  await docRef.update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * Copies any exercise (typically a wger doc) into a brand-new trainer-owned
 * doc so the trainer can customize. Field handling:
 *  - source → "trainer", ownerId → caller's UID (always overwritten).
 *  - name / description / muscleGroups / equipment → copied verbatim.
 *  - mediaURL / thumbnailURL → INHERITED. The trainer can re-upload later
 *    via the dropzone if they want their own clip; until then the source's
 *    `gs://` path stays usable (no broken-media regression).
 *  - version → 1, deleted → false, timestamps → server-side.
 */
export async function duplicateExercise(
  id: string,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const original = await db.collection(COLLECTION).doc(id).get();
  if (!original.exists) {
    throw new Error("Not found");
  }
  const data = original.data() as Record<string, unknown>;

  const newId = `custom-${trainer.uid}-${randomUUID()}`;
  const newRef = db.collection(COLLECTION).doc(newId);
  await newRef.set({
    ...data,
    id: newId,
    source: "trainer",
    ownerId: trainer.uid,
    // mediaURL + thumbnailURL inherited from source — see field handling
    // note in the docblock. The spread above already includes them.
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  });

  return { id: newId };
}

/**
 * Mints a 60-minute v4 signed URL pinned to `Content-Type: video/mp4` that
 * the client uses to PUT an MP4 directly to Cloud Storage.
 *
 * Defenses:
 *  - 50 MB `contentLength` cap (threat-register COST-DOS mitigation).
 *  - `exerciseId` MUST start with `custom-${trainer.uid}-` so a trainer
 *    cannot mint an upload URL for another trainer's exercise nor for a
 *    wger doc (threat-register PATH-TRAVERSAL mitigation). This is
 *    enforced unconditionally — even for not-yet-created docs — because
 *    the doc ID is constructed by `createExercise` with the same prefix,
 *    so a legitimate flow always satisfies it.
 *  - `contentType: 'video/mp4'` is pinned in the signed URL options. The
 *    browser MUST send a matching `Content-Type` header on the PUT or
 *    Cloud Storage will reject the upload (threat-register
 *    CONTENT-TYPE-SPOOF, server side).
 */
export async function mintExerciseMediaUploadUrl(input: {
  exerciseId: string;
  contentLength: number;
}): Promise<{ url: string; gsPath: string }> {
  const trainer = await getCurrentTrainer();

  const { exerciseId, contentLength } = input;
  if (!exerciseId || typeof exerciseId !== "string") {
    throw new Error("BadRequest: exerciseId is required.");
  }
  // Path-traversal defense — only allow uploads to the caller's own
  // `custom-${uid}-*` namespace.
  const allowedPrefix = `custom-${trainer.uid}-`;
  if (!exerciseId.startsWith(allowedPrefix)) {
    throw new Error(
      "Cannot upload to that path. exerciseId must belong to the caller.",
    );
  }
  // Cost-DoS guard — server-side validation in addition to the 25 MB
  // client gate the dropzone will enforce.
  if (
    typeof contentLength !== "number" ||
    !Number.isFinite(contentLength) ||
    contentLength <= 0
  ) {
    throw new Error("BadRequest: contentLength must be a positive number.");
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw new Error("File too large. The 50 MB upload ceiling was exceeded.");
  }

  const bucketName = getMediaBucketName();
  const bucket = gcFitnessStorage().bucket(bucketName);
  const objectPath = `exercises/${exerciseId}.mp4`;
  const file = bucket.file(objectPath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType: "video/mp4",
  });

  return {
    url,
    gsPath: `gs://${bucketName}/${objectPath}`,
  };
}
