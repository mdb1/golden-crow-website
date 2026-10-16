// exercise-server-actions.ts
//
// Server Actions for the Corvo trainer Exercise CRUD surface. This module
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
//   T-03-05-COST-DOS           mintExerciseMediaUploadUrl (declared size) +
//                              assertUploadedMediaAcceptable (real size, #451)

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";

import {
  toActionFailure,
  type ActionResult,
} from "./action-result";
import {
  templatesUsingExercise,
  type TemplateForUsage,
} from "./library-usage-counts";
import {
  exerciseSchema,
  exerciseUpdateSchema,
  type ExerciseInput,
} from "./exercise-schema";
import { getCurrentTrainer } from "./auth-helpers";
import {
  recordCoachActivityEvent,
  markCoachActivityDeleted,
  exerciseCreatedEvent,
} from "./coach-activity-log";

const COLLECTION = "exercises";
const TEMPLATES_COLLECTION = "workout_templates";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_THUMBNAIL_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 60 minutes

// Allowed image content types for thumbnail uploads. Keys are the MIME
// strings the client MUST send (and that the signed URL is pinned to);
// values are the extension we append to the object path so the bucket
// layout stays human-readable.
const THUMBNAIL_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Cloud Storage bucket derived from the project ID env var. 03-CONTEXT.md
// locks the path: `exercises/{firestoreDocId}.mp4`. The bucket name is the
// `gs://` host (`gcfitness-3476b.firebasestorage.app`).
function getMediaBucketName(): string {
  const bucketName =
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
    "gcfitness-3476b.firebasestorage.app";
  return bucketName;
}

// ── Uploaded-media guard (#451) ─────────────────────────────────────────────
//
// The caps in `mintExercise{Media,Thumbnail}UploadUrl` only check the size the
// CALLER DECLARES; the v4 signed write URL does not bind it, so a 1-byte
// declaration could upload any size for 60 minutes. Binding the range into the
// signature would need the browser to send an extra header (and break tabs
// opened before a deploy), so the cap is enforced where the object becomes
// REACHABLE instead: before `createExercise` / `updateExercise` persist a
// `gs://` path that one of those URLs minted, we read the object's real
// metadata. Oversize or wrong content type → the object is deleted (when it
// sits in the caller's own namespace) and the save is refused with copy the
// form already surfaces (`result.error` → toast description).
//
// Scope: only `exercises/custom-*` objects in our media bucket — the paths the
// mint actions produce. Standard / library / wger media and external https
// thumbnails are left alone. One `getMetadata` per newly attached path (an
// unchanged value on update is not re-checked); no `getAll` (fails on Vercel).

type UploadKind = "video" | "thumbnail";

function mintedObjectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const prefix = `gs://${getMediaBucketName()}/`;
  if (!value.startsWith(prefix)) return null;
  const objectPath = value.slice(prefix.length);
  return objectPath.startsWith(`${COLLECTION}/custom-`) ? objectPath : null;
}

async function assertUploadedObjectAcceptable(
  trainerUid: string,
  kind: UploadKind,
  value: unknown,
): Promise<void> {
  const objectPath = mintedObjectPath(value);
  if (!objectPath) return;

  const file = gcFitnessStorage().bucket(getMediaBucketName()).file(objectPath);
  let size: number;
  let contentType: string;
  try {
    const [metadata] = await file.getMetadata();
    size = Number(metadata.size);
    contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
  } catch (err) {
    console.error("[exercise-server-actions] upload metadata read failed", objectPath, err);
    throw new Error(
      kind === "video"
        ? "The uploaded video couldn't be found. Upload it again."
        : "The uploaded thumbnail couldn't be found. Upload it again.",
    );
  }

  let problem: string | null = null;
  if (kind === "video") {
    if (contentType !== "video/mp4") problem = "The video must be an MP4 file.";
    else if (!Number.isFinite(size) || size > MAX_UPLOAD_BYTES)
      problem = "The video is larger than 50 MB. Upload a smaller file.";
  } else {
    if (!Object.hasOwn(THUMBNAIL_CONTENT_TYPES, contentType))
      problem = "The thumbnail must be a JPEG, PNG, WebP or GIF image.";
    else if (!Number.isFinite(size) || size > MAX_THUMBNAIL_UPLOAD_BYTES)
      problem = "The thumbnail is larger than 5 MB. Upload a smaller image.";
  }
  if (!problem) return;

  // Only remove what the caller could have uploaded: their own namespace.
  if (objectPath.startsWith(`${COLLECTION}/custom-${trainerUid}-`)) {
    try {
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      console.error("[exercise-server-actions] rejected upload delete failed", objectPath, err);
    }
  }
  throw new Error(problem);
}

async function assertUploadedMediaAcceptable(
  trainerUid: string,
  next: { mediaURL?: unknown; thumbnailURL?: unknown },
  previous?: { mediaURL?: unknown; thumbnailURL?: unknown },
): Promise<void> {
  if (next.mediaURL !== undefined && next.mediaURL !== previous?.mediaURL) {
    await assertUploadedObjectAcceptable(trainerUid, "video", next.mediaURL);
  }
  if (next.thumbnailURL !== undefined && next.thumbnailURL !== previous?.thumbnailURL) {
    await assertUploadedObjectAcceptable(trainerUid, "thumbnail", next.thumbnailURL);
  }
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
async function createExerciseImpl(
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

  const raw = z
    .object({
      id: z.string().trim().min(1).optional(),
    })
    .passthrough()
    .parse(input);

  // Normalize source + ownerId to the caller before validation so the Zod
  // schema gets a fully-populated shape. The pre-check above already
  // rejected any conflicting incoming value.
  const normalized = {
    ...raw,
    source: "trainer" as const,
    ownerId: trainer.uid,
  };
  const data = exerciseSchema.parse(normalized) as ExerciseInput;
  // #451 — the real size / type of any uploaded media, before it is persisted.
  await assertUploadedMediaAcceptable(trainer.uid, data);

  const db = gcFitnessFirestore();
  const allowedPrefix = `custom-${trainer.uid}-`;
  const docId =
    raw.id && raw.id.startsWith(allowedPrefix)
      ? raw.id
      : `custom-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);
  // #1307 — a missing/null factor is simply not written (absent ⇒ resolved
  // from equipment + muscle at finalize); the Admin SDK rejects `undefined`.
  const { bodyweightLoadFactor, ...rest } = data;
  await docRef.set({
    ...rest,
    ...(typeof bodyweightLoadFactor === "number" ? { bodyweightLoadFactor } : {}),
    id: docId,
    // #741 — ver la nota en el update de edición.
    updatedBy: trainer.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  });

  await recordCoachActivityEvent(
    db,
    exerciseCreatedEvent({ trainerId: trainer.uid, exerciseId: docId, name: data.name }),
  );

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
async function updateExerciseImpl(
  id: string,
  input: unknown,
): Promise<void> {
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
    mediaURL?: unknown;
    thumbnailURL?: unknown;
  };
  if (existing.source !== "trainer") {
    throw new Error("library exercises are read-only.");
  }
  if (existing.ownerId !== trainer.uid) {
    throw new Error("Not your exercise.");
  }

  const patch = exerciseUpdateSchema.parse(input);
  // #451 — only a NEWLY attached path is checked; an unchanged value was
  // checked when it was first saved.
  await assertUploadedMediaAcceptable(trainer.uid, patch, existing);

  // Strip source / ownerId from the patch — they are immutable after
  // creation. The Zod schema accepts them (so the partial-update form can
  // round-trip a full read), but Firestore should never see them in the
  // update() payload.
  const safe = { ...patch };
  delete (safe as { source?: unknown }).source;
  delete (safe as { ownerId?: unknown }).ownerId;
  // #1307 — `null` clears the explicit factor (back to the equipment/muscle
  // default); `undefined` leaves it alone (never sent to the Admin SDK).
  const factorPatch: Record<string, unknown> = {};
  if (safe.bodyweightLoadFactor === null) {
    factorPatch.bodyweightLoadFactor = FieldValue.delete();
  } else if (typeof safe.bodyweightLoadFactor === "number") {
    factorPatch.bodyweightLoadFactor = safe.bodyweightLoadFactor;
  }
  delete (safe as { bodyweightLoadFactor?: unknown }).bodyweightLoadFactor;

  await docRef.update({
    ...safe,
    ...factorPatch,
    // #741 — quién tocó el documento. Sin esto, una edición de un ejercicio de la
    // BIBLIOTECA COMPARTIDA queda sin atribuir en el feed de Monitoring: no tiene
    // `ownerId` (por diseño) y el `audit_log` que escribe la Function no puede saber
    // quién fue, porque el backoffice escribe el doc directo. El dato no se perdía al
    // mostrarlo, no existía en la escritura.
    updatedBy: trainer.uid,
    updatedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  });
}

/**
 * Soft-deletes a trainer-owned exercise (sets `deleted: true`). Refuses on
 * the same grounds as `updateExercise`. Hard-delete is permanently gated
 * by Firestore rules from 03-03.
 */
async function softDeleteExerciseImpl(
  id: string,
): Promise<void> {
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
  if (existing.source !== "trainer") {
    throw new Error("Cannot delete library exercises.");
  }
  if (existing.ownerId !== trainer.uid) {
    throw new Error("Not your exercise.");
  }

  // gc-fitness#1078 — THE GUARD. A soft-delete used to be the safe path, and
  // it wasn't: a curation pass soft-deleted 12 exercises that live routines
  // were using, and those rows went on rendering as "Ejercicio 3" — no name,
  // no media, no error — inside the programs of real coaches whose clients
  // were training them. The mobile resolver had nothing to fall back to.
  //
  // `firestore.rules` has forbidden HARD-deleting an exercise since P03-03 for
  // exactly this reason ("workout templates reference exercises by id"); this
  // closes the other half of the same hole.
  //
  // Reading every template costs one full-collection scan (~256 docs). Delete
  // is a rare, deliberate action — the scan is cheaper than a dangling
  // reference nobody notices for four months.
  const blockers = templatesUsingExercise(
    (await db.collection(TEMPLATES_COLLECTION).get()).docs.map(
      (d) => ({ id: d.id, ...(d.data() as object) }) as TemplateForUsage,
    ),
    id,
  );
  if (blockers.length > 0) {
    // Name the routines: the only way past this block is to open them and swap
    // the exercise out, so a bare count would leave the coach hunting.
    const named = blockers.slice(0, 5).map((t) => t.name).join(", ");
    const rest = blockers.length > 5 ? ` and ${blockers.length - 5} more` : "";
    throw new Error(
      `Still used by ${blockers.length} routine${blockers.length === 1 ? "" : "s"}: ` +
        `${named}${rest}. Remove it from them first.`,
    );
  }

  await docRef.update({
    deleted: true,
    updatedBy: trainer.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await markCoachActivityDeleted(db, `exr:${id}`);
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
async function duplicateExerciseImpl(
  id: string,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const original = await db.collection(COLLECTION).doc(id).get();
  if (!original.exists) {
    throw new Error("Not found");
  }
  const data = original.data() as Record<string, unknown>;
  const { tags: _tags, ...copyable } = data;

  const newId = `custom-${trainer.uid}-${randomUUID()}`;
  const newRef = db.collection(COLLECTION).doc(newId);
  await newRef.set({
    ...copyable,
    id: newId,
    source: "trainer",
    ownerId: trainer.uid,
    updatedBy: trainer.uid,
    // mediaURL + thumbnailURL inherited from source — see field handling
    // note in the docblock. The spread above already includes them.
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  });

  return { id: newId };
}

// ── The coach-facing boundary ───────────────────────────────────────────────
//
// Everything above throws; everything below RETURNS its failure. That is not
// stylistic: Next.js redacts an error thrown out of a Server Action in a
// production build, and the client receives "Minified React error #441"
// instead of the message. A coach who pasted a base64 data-URI into the
// thumbnail field got that React code instead of "Enter a valid image link
// (https://…)" — the Zod copy written for exactly that mistake. See
// `action-result.ts`.
//
// KEEP THE SPLIT. The `*Impl` functions stay throw-based so the policy checks
// read as guard clauses; the exported wrappers are the only thing the browser
// can call, and they can only return.

/**
 * Creates a NEW trainer-owned exercise. See `createExerciseImpl` for the
 * ownership + source-immutability contract.
 */
export async function createExercise(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { id } = await createExerciseImpl(input);
    return { ok: true, id };
  } catch (err) {
    console.error("[exercise-server-actions] createExercise failed", err);
    return toActionFailure(err);
  }
}

/** Updates an existing trainer-owned exercise. */
export async function updateExercise(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    await updateExerciseImpl(id, input);
    return { ok: true };
  } catch (err) {
    console.error("[exercise-server-actions] updateExercise failed", err);
    return toActionFailure(err);
  }
}

/** Soft-deletes a trainer-owned exercise (`deleted: true`). */
export async function softDeleteExercise(id: string): Promise<ActionResult> {
  try {
    await softDeleteExerciseImpl(id);
    return { ok: true };
  } catch (err) {
    console.error("[exercise-server-actions] softDeleteExercise failed", err);
    return toActionFailure(err);
  }
}

/** Copies any exercise into a new trainer-owned doc. */
export async function duplicateExercise(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { id: newId } = await duplicateExerciseImpl(id);
    return { ok: true, id: newId };
  } catch (err) {
    console.error("[exercise-server-actions] duplicateExercise failed", err);
    return toActionFailure(err);
  }
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

/**
 * Mints a 60-minute v4 signed URL pinned to an image content type that the
 * client uses to PUT a thumbnail directly to Cloud Storage. Mirrors
 * `mintExerciseMediaUploadUrl` for the thumbnail field — same threat
 * register coverage, narrower size cap and content-type set:
 *
 *  - 5 MB `contentLength` cap (threat-register COST-DOS mitigation);
 *    thumbnails are tiny static images, so 5 MB is generous.
 *  - `exerciseId` MUST start with `custom-${trainer.uid}-` so a trainer
 *    cannot mint an upload URL for another trainer's exercise nor for a
 *    wger doc (threat-register PATH-TRAVERSAL mitigation).
 *  - `contentType` MUST be one of `image/jpeg | image/png | image/webp |
 *    image/gif`, pinned in the signed URL options (threat-register
 *    CONTENT-TYPE-SPOOF, server side). The browser MUST send a matching
 *    `Content-Type` header on the PUT or Cloud Storage will reject.
 *
 * Object path: `exercises/${exerciseId}-thumb.${ext}` — the `-thumb`
 * suffix keeps thumbnails distinct from the `${exerciseId}.mp4` video
 * objects under the same prefix.
 */
export async function mintExerciseThumbnailUploadUrl(input: {
  exerciseId: string;
  contentLength: number;
  contentType: string;
}): Promise<{ url: string; gsPath: string }> {
  const trainer = await getCurrentTrainer();

  const { exerciseId, contentLength, contentType } = input;
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
  // Cost-DoS guard — server-side validation in addition to the 5 MB
  // client gate the dropzone enforces.
  if (
    typeof contentLength !== "number" ||
    !Number.isFinite(contentLength) ||
    contentLength <= 0
  ) {
    throw new Error("BadRequest: contentLength must be a positive number.");
  }
  if (contentLength > MAX_THUMBNAIL_UPLOAD_BYTES) {
    throw new Error("File too large. The 5 MB thumbnail ceiling was exceeded.");
  }
  // Content-type guard — must be a known image MIME we'll pin to the
  // signed URL. Anything else is a client bug or a spoof attempt.
  // Own keys only: "constructor"/"toString"/"__proto__" are truthy inherited
  // properties of the object literal and used to pass this check (#451).
  const ext = Object.hasOwn(THUMBNAIL_CONTENT_TYPES, contentType)
    ? THUMBNAIL_CONTENT_TYPES[contentType]
    : undefined;
  if (!ext) {
    throw new Error(
      "BadRequest: contentType must be one of image/jpeg, image/png, image/webp, image/gif.",
    );
  }

  const bucketName = getMediaBucketName();
  const bucket = gcFitnessStorage().bucket(bucketName);
  const objectPath = `exercises/${exerciseId}-thumb.${ext}`;
  const file = bucket.file(objectPath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType,
  });

  return {
    url,
    gsPath: `gs://${bucketName}/${objectPath}`,
  };
}
