// live-workout-actions.ts
//
// Server Actions for the backoffice live-workout (coach-run session) surface.
// The coach runs a client's scheduled workout live from the backoffice,
// logging weights/reps/rests, then finalizes it.
//
// SECURITY MODEL (see .planning/features/backoffice-live-workout/ROADMAP.md
// constraint #0): the backoffice writes via the Firebase Admin SDK, which
// BYPASSES firestore.rules. The real authorization boundary is THIS file —
// every action gates on `getCurrentTrainer()` and verifies the trainer owns
// the assignment/log it touches. `trainerId`/`clientId` are sourced from the
// server-read doc, NEVER from caller input.
//
// COACH IS THE SINGLE WRITER (D3): v1 assumes the client is not logging on
// iOS at the same time. We write the same `workout_logs` wire shape the iOS
// app writes (SetLog.swift / WorkoutLog.swift CodingKeys) so a finished
// session is indistinguishable from a phone-logged one downstream.

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore, gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { civilDateFormat } from "./civil-date";
import { getTrainerTimezone } from "./trainer-timezone";
import {
  finalizeSessionSchema,
  getClientExerciseNoteSchema,
  setClientExerciseNoteSchema,
  startSessionSchema,
  syncSessionSchema,
  type FinalizeSessionInput,
  type GetClientExerciseNoteInput,
  type SetClientExerciseNoteInput,
  type StartSessionInput,
  type SyncSessionInput,
} from "./live-workout-schema";
import {
  computeDurationSeconds,
  computeTotalVolumeKg,
} from "./live-workout-volume";
import type {
  ActiveSession,
  ActiveWorkoutSummary,
  LocalizedString,
  PreviousSessionMap,
  SessionExercise,
  SessionSetLog,
} from "./live-workout-types";

const ASSIGNMENTS = FirestoreCollections.workoutAssignments;
const LOGS = FirestoreCollections.workoutLogs;
const EXERCISES = FirestoreCollections.exercises;
const NOTES = FirestoreCollections.clientExerciseNotes;

/** Bound the previous-session history scan (iOS uses limit 20). */
const HISTORY_LIMIT = 20;
/** Safety cap on how many future assignments a single finalize rewrites. */
const MAX_FUTURE_PROPAGATION = 200;

// ── small coercion helpers ───────────────────────────────────────────────
function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function localized(v: unknown, fallback: string): LocalizedString {
  if (v && typeof v === "object" && typeof (v as { en?: unknown }).en === "string") {
    const obj = v as { en: string; es?: string };
    return { en: obj.en, es: typeof obj.es === "string" ? obj.es : undefined };
  }
  return { en: fallback };
}

function numArrayOrNull(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((n): n is number => typeof n === "number");
  return out.length > 0 ? out : null;
}

// ── media resolution (gs:// → 1h signed URL; https passes through) ─────────
async function signedUrlForPath(storagePath: string): Promise<string | null> {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const candidates = [
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.appspot.com` : undefined,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
  ].filter((v): v is string => Boolean(v));
  for (const bucketName of candidates) {
    try {
      const [url] = await gcFitnessStorage()
        .bucket(bucketName)
        .file(storagePath)
        .getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
      return url;
    } catch {
      /* try next bucket candidate */
    }
  }
  return null;
}

async function resolveMedia(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("gs://")) {
    // gs://<bucket>/<path...> — mint a signed URL from the in-bucket path.
    const withoutScheme = value.slice("gs://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash === -1) return null;
    const path = withoutScheme.slice(slash + 1);
    return signedUrlForPath(path);
  }
  return null;
}

// ── exercise enrichment (snapshot → SessionExercise[] with media) ──────────
async function buildSessionExercises(
  templateSnapshot: Record<string, unknown> | undefined | null,
  options?: { resolveMedia?: boolean },
): Promise<SessionExercise[]> {
  const raw = Array.isArray(templateSnapshot?.exercises)
    ? (templateSnapshot!.exercises as Array<Record<string, unknown>>)
    : [];
  if (raw.length === 0) return [];

  const shouldResolveMedia = options?.resolveMedia !== false;
  const db = gcFitnessFirestore();
  const ids = raw
    .map((e) => e.exerciseId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const docs = shouldResolveMedia && ids.length
    ? await db.getAll(...ids.map((id) => db.collection(EXERCISES).doc(id)))
    : [];
  const srcMap = shouldResolveMedia
    ? new Map(
        docs.map((d) => [d.id, (d.data() ?? {}) as Record<string, unknown>]),
      )
    : new Map<string, Record<string, unknown>>();

  const built = await Promise.all(
    raw.map(async (e, i): Promise<SessionExercise> => {
      const exerciseId = typeof e.exerciseId === "string" ? e.exerciseId : "";
      const src = srcMap.get(exerciseId) ?? {};
      const metric =
        e.metric === "time" || e.metric === "reps"
          ? (e.metric as "time" | "reps")
          : null;
      // Preview preference mirrors the exercise picker: imageUrl > gifUrl >
      // thumbnailURL. mediaURL is the (video) clip. gs:// values are signed.
      const [thumbnailURL, mediaURL] = shouldResolveMedia
        ? await Promise.all([
            resolveMedia(
              src.imageUrl ?? src.gifUrl ?? src.thumbnailURL ?? e.thumbnailURL,
            ),
            resolveMedia(src.mediaURL ?? e.mediaURL),
          ])
        : [null, null];
      return {
        exerciseId,
        name: localized(e.name ?? src.name, exerciseId),
        sets: num(e.sets, 1),
        reps: num(e.reps, 0),
        restSeconds: num(e.restSeconds ?? e.rest_seconds, 60),
        notes: typeof e.notes === "string" ? e.notes : null,
        order: num(e.order, i + 1),
        supersetGroup:
          typeof e.supersetGroup === "string" && e.supersetGroup.trim().length > 0
            ? e.supersetGroup
            : null,
        repsBySet: numArrayOrNull(e.repsBySet),
        weightBySetKg: numArrayOrNull(e.weightBySetKg),
        metric,
        durationBySetSeconds: numArrayOrNull(e.durationBySetSeconds),
        durationSeconds:
          typeof e.durationSeconds === "number" ? e.durationSeconds : null,
        mediaURL,
        thumbnailURL,
      };
    }),
  );
  return built.sort((a, b) => a.order - b.order);
}

// ── wire (snake_case) ↔ session (camelCase) set mapping ────────────────────
function wireSetToSession(s: Record<string, unknown>): SessionSetLog {
  return {
    id: String(s.id ?? ""),
    exerciseId: String(s.exerciseId ?? ""),
    setIndex: num(s.set_index, 0),
    weightKg: num(s.weight_kg, 0),
    reps: num(s.reps, 0),
    completedAt: toIso(s.completed_at) ?? new Date(0).toISOString(),
    isWarmup: s.is_warmup === true,
    clientLoggedAt: toIso(s.client_logged_at) ?? new Date(0).toISOString(),
    durationSeconds:
      typeof s.duration_seconds === "number" ? s.duration_seconds : null,
  };
}

function sessionSetToWire(s: SessionSetLog): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    id: s.id,
    exerciseId: s.exerciseId,
    set_index: s.setIndex,
    weight_kg: s.weightKg,
    reps: s.reps,
    completed_at: new Date(s.completedAt),
    is_warmup: s.isWarmup,
    client_logged_at: new Date(s.clientLoggedAt),
  };
  // Firestore rejects `undefined`; iOS omits the field on reps-based sets.
  if (typeof s.durationSeconds === "number" && s.durationSeconds > 0) {
    wire.duration_seconds = s.durationSeconds;
  }
  return wire;
}

async function buildActiveSession(
  logId: string,
  assignmentId: string,
  assignment: Record<string, unknown>,
  log: Record<string, unknown> | null,
  options?: { resolveMedia?: boolean },
  startedAtOverride?: string | null,
): Promise<ActiveSession> {
  const snapshot =
    (log?.templateSnapshot as Record<string, unknown> | undefined) ??
    (assignment.templateSnapshot as Record<string, unknown> | undefined) ??
    null;
  const exercises = await buildSessionExercises(snapshot, options);
  const sets = Array.isArray(log?.sets)
    ? (log!.sets as Array<Record<string, unknown>>).map(wireSetToSession)
    : [];
  return {
    logId,
    assignmentId,
    clientId: String(assignment.clientId ?? log?.clientId ?? ""),
    trainerId: String(assignment.trainerId ?? log?.trainerId ?? ""),
    workoutName: localized(
      (snapshot?.name as unknown) ?? undefined,
      "Workout",
    ),
    startedAt: startedAtOverride ?? toIso(log?.startedAt),
    status:
      (log?.status as ActiveSession["status"]) ?? "active",
    exercises,
    sets,
    meetingNotes:
      typeof assignment.meetingNotes === "string"
        ? assignment.meetingNotes
        : null,
    scheduledTime:
      typeof assignment.scheduledTime === "string"
        ? assignment.scheduledTime
        : null,
    scheduledFor: String(assignment.scheduledFor ?? ""),
    seriesId: typeof assignment.seriesId === "string" ? assignment.seriesId : null,
  };
}

function workoutNameToString(value: LocalizedString): string {
  return value.en || value.es || "Workout";
}

function summarizeActiveSession(
  session: ActiveSession,
  clientName: string,
): ActiveWorkoutSummary {
  const completedByExercise = new Map<string, number>();
  for (const set of session.sets) {
    completedByExercise.set(
      set.exerciseId,
      (completedByExercise.get(set.exerciseId) ?? 0) + 1,
    );
  }

  let currentExercise = session.exercises[0] ?? null;
  let totalSets = 0;
  let completedSets = 0;
  for (const ex of session.exercises) {
    const planned = Math.max(1, ex.sets);
    const completed = Math.min(
      planned,
      completedByExercise.get(ex.exerciseId) ?? 0,
    );
    totalSets += planned;
    completedSets += completed;
    currentExercise = ex;
    if (completed < planned) break;
  }

  const startedAt = session.startedAt;
  const elapsedSeconds = startedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))
    : 0;

  return {
    logId: session.logId,
    assignmentId: session.assignmentId,
    clientId: session.clientId,
    clientName,
    workoutName: workoutNameToString(session.workoutName),
    startedAt,
    elapsedSeconds,
    currentExerciseName: currentExercise
      ? workoutNameToString(currentExercise.name)
      : "Workout",
    currentSet: Math.min(totalSets || 1, completedSets + 1),
    totalSets: Math.max(1, totalSets),
    completedSets,
    progress: totalSets > 0 ? completedSets / totalSets : 0,
  };
}

export async function listActiveWorkoutSessionsForTrainer(): Promise<
  ActiveWorkoutSummary[]
> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const snap = await db.collection(LOGS).where("status", "==", "active").get();

  const summaries = new Map<string, ActiveWorkoutSummary>();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.trainerId !== trainer.uid) continue;
    const assignmentId =
      typeof data.assignment_id === "string" ? data.assignment_id : "";
    if (!assignmentId) continue;
    try {
      const { data: assignment } = await ownedAssignment(
        assignmentId,
        trainer.uid,
      );
      const session = await buildActiveSession(
        doc.id,
        assignmentId,
        assignment,
        data,
        { resolveMedia: false },
      );
      const clientSnap = await db.collection(FirestoreCollections.users).doc(session.clientId).get();
      const clientName =
        clientSnap.exists && typeof clientSnap.get("displayName") === "string"
          ? String(clientSnap.get("displayName"))
          : session.clientId;
      const summary = summarizeActiveSession(session, clientName);
      const existing = summaries.get(summary.assignmentId);
      if (!existing) {
        summaries.set(summary.assignmentId, summary);
        continue;
      }
      const existingMs = existing.startedAt ? Date.parse(existing.startedAt) : 0;
      const currentMs = summary.startedAt ? Date.parse(summary.startedAt) : 0;
      if (currentMs >= existingMs) {
        summaries.set(summary.assignmentId, summary);
      }
    } catch {
      /* stale or foreign assignment — skip it */
    }
  }

  return [...summaries.values()].sort((a, b) => {
    const aMs = a.startedAt ? Date.parse(a.startedAt) : 0;
    const bMs = b.startedAt ? Date.parse(b.startedAt) : 0;
    return bMs - aMs;
  });
}

// ── ownership-gated readers of the assignment + active log ─────────────────
async function ownedAssignment(assignmentId: string, trainerUid: string) {
  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(assignmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Assignment not found.");
  const data = snap.data() as Record<string, unknown>;
  if (data.trainerId !== trainerUid) throw new Error("Not your assignment.");
  return { ref, data };
}

async function ownedActiveLog(logId: string, trainerUid: string) {
  const db = gcFitnessFirestore();
  const ref = db.collection(LOGS).doc(logId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Session not found.");
  const data = snap.data() as Record<string, unknown>;
  if (data.trainerId !== trainerUid) throw new Error("Not your session.");
  return { ref, data };
}

// ───────────────────────────────────────────────────────────────────────────
// startWorkoutSession — create (or resume) the active log + mark assignment
// ───────────────────────────────────────────────────────────────────────────
export async function startWorkoutSession(
  input: StartSessionInput,
): Promise<ActiveSession> {
  const trainer = await getCurrentTrainer();
  const { assignmentId } = startSessionSchema.parse(input);
  const db = gcFitnessFirestore();

  const { ref: asgRef, data: asg } = await ownedAssignment(
    assignmentId,
    trainer.uid,
  );

  // Idempotent: reuse an existing active log for this assignment.
  const existing = await db
    .collection(LOGS)
    .where("assignment_id", "==", assignmentId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    if (asg.status === "scheduled") {
      await asgRef.update({
        status: "started",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return buildActiveSession(
      doc.id,
      assignmentId,
      asg,
      doc.data(),
      { resolveMedia: false },
    );
  }

  const logId = randomUUID();
  const now = FieldValue.serverTimestamp();
  await db
    .collection(LOGS)
      .doc(logId)
      .set({
        clientId: asg.clientId,
        trainerId: trainer.uid,
        source: "coach",
        assignment_id: assignmentId,
        templateSnapshot: asg.templateSnapshot ?? {},
        status: "active",
      sets: [],
      prs: [],
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

  if (asg.status === "scheduled") {
    await asgRef.update({ status: "started", updatedAt: now });
  }

  // Re-read the just-written log so startedAt resolves to a real instant.
  return buildActiveSession(
    logId,
    assignmentId,
    asg,
    {
      clientId: asg.clientId,
      trainerId: trainer.uid,
      source: "coach",
      assignment_id: assignmentId,
      templateSnapshot: asg.templateSnapshot ?? {},
      status: "active",
      sets: [],
      prs: [],
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    } as Record<string, unknown>,
    { resolveMedia: false },
    new Date().toISOString(),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// getActiveSessionForAssignment — resume support + entry-button state
// ───────────────────────────────────────────────────────────────────────────
export async function getActiveSessionForAssignment(
  assignmentId: string,
): Promise<ActiveSession | null> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const { data: asg } = await ownedAssignment(assignmentId, trainer.uid);

  const existing = await db
    .collection(LOGS)
    .where("assignment_id", "==", assignmentId)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (existing.empty) return null;
  const doc = existing.docs[0];
  return buildActiveSession(
    doc.id,
    assignmentId,
    asg,
    doc.data(),
    { resolveMedia: false },
  );
}

// ───────────────────────────────────────────────────────────────────────────
// syncWorkoutSession — persist in-progress sets (reload-resume resilience)
// ───────────────────────────────────────────────────────────────────────────
export async function syncWorkoutSession(
  input: SyncSessionInput,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const { logId, sets } = syncSessionSchema.parse(input);
  const { ref, data } = await ownedActiveLog(logId, trainer.uid);
  if (data.status !== "active") {
    throw new Error("Session already finalized.");
  }
  await ref.update({
    sets: sets.map(sessionSetToWire),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// finalizeWorkoutSession — write the completed log + optional recurrence
// propagation. The future-dated same-series assignments are rewritten to
// match the performed structure but STAY `scheduled` (never completed).
// ───────────────────────────────────────────────────────────────────────────
export async function finalizeWorkoutSession(
  input: FinalizeSessionInput,
): Promise<{ logId: string; futureUpdated: number }> {
  const trainer = await getCurrentTrainer();
  const parsed = finalizeSessionSchema.parse(input);
  const db = gcFitnessFirestore();
  const { ref: logRef, data: log } = await ownedActiveLog(
    parsed.logId,
    trainer.uid,
  );

  const assignmentId = String(log.assignment_id ?? "");
  const clientId = String(log.clientId ?? "");

  // Idempotent: a re-fired finalize on an already-completed log is a no-op.
  if (log.status === "completed") {
    return { logId: parsed.logId, futureUpdated: 0 };
  }

  const totalVolumeKg = computeTotalVolumeKg(parsed.sets);
  const durationSeconds = computeDurationSeconds(
    toIso(log.startedAt),
    Date.now(),
  );

  const finalize: Record<string, unknown> = {
    sets: parsed.sets.map(sessionSetToWire),
    status: "completed",
    total_volume_kg: totalVolumeKg,
    duration_seconds: durationSeconds,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof parsed.rpe === "number") finalize.rpe = parsed.rpe;
  if (typeof parsed.notes === "string" && parsed.notes.trim().length > 0) {
    finalize.notes = parsed.notes.trim();
  }
  await logRef.update(finalize);

  // Mark the assignment that produced this session completed.
  if (assignmentId) {
    await db
      .collection(ASSIGNMENTS)
      .doc(assignmentId)
      .update({ status: "completed", updatedAt: FieldValue.serverTimestamp() })
      .catch(() => {
        /* assignment may have been deleted mid-session — log is source of truth */
      });
  }

  let futureUpdated = 0;
  if (
    parsed.mode === "session_and_future" &&
    parsed.editedExercises &&
    parsed.editedExercises.length > 0 &&
    assignmentId
  ) {
    futureUpdated = await propagateToFutureRecurrence({
      currentAssignmentId: assignmentId,
      clientId,
      trainerUid: trainer.uid,
      editedExercises: parsed.editedExercises,
    });
  }

  return { logId: parsed.logId, futureUpdated };
}

// ───────────────────────────────────────────────────────────────────────────
// cancelWorkoutSession — abandon the active log and return the assignment to
// `scheduled` so the coach can restart it later without marking it complete.
// ───────────────────────────────────────────────────────────────────────────
export async function cancelWorkoutSession(
  input: { logId: string },
): Promise<{ logId: string }> {
  const trainer = await getCurrentTrainer();
  const logId = z.object({ logId: z.string().min(1) }).parse(input).logId;
  const db = gcFitnessFirestore();
  const { ref: logRef, data: log } = await ownedActiveLog(logId, trainer.uid);
  const assignmentId = String(log.assignment_id ?? "");
  if (!assignmentId) throw new Error("Assignment not found.");
  const assignmentRef = db.collection(ASSIGNMENTS).doc(assignmentId);

  await db.runTransaction(async (tx) => {
    const [logSnap, assignmentSnap] = await Promise.all([
      tx.get(logRef),
      tx.get(assignmentRef),
    ]);
    if (!logSnap.exists) throw new Error("Session not found.");
    const currentLog = logSnap.data() as Record<string, unknown>;
    if (currentLog.trainerId !== trainer.uid) throw new Error("Not your session.");
    if (currentLog.status !== "active") throw new Error("Session already finalized.");
    if (!assignmentSnap.exists) throw new Error("Assignment not found.");
    const currentAssignment = assignmentSnap.data() as Record<string, unknown>;
    if (currentAssignment.trainerId !== trainer.uid) {
      throw new Error("Not your assignment.");
    }

    tx.update(logRef, {
      status: "abandoned",
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(assignmentRef, {
      status: "scheduled",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { logId };
}

/**
 * Rewrite the `templateSnapshot.exercises` of this client's FUTURE-dated
 * assignments in the same recurring series so they match the just-performed
 * structure. Future assignments STAY `scheduled`. No-op when the source
 * assignment has no `seriesId` (a one-off has no future occurrences).
 */
async function propagateToFutureRecurrence(opts: {
  currentAssignmentId: string;
  clientId: string;
  trainerUid: string;
  editedExercises: NonNullable<FinalizeSessionInput["editedExercises"]>;
}): Promise<number> {
  const db = gcFitnessFirestore();
  const currentSnap = await db
    .collection(ASSIGNMENTS)
    .doc(opts.currentAssignmentId)
    .get();
  if (!currentSnap.exists) return 0;
  const current = currentSnap.data() as Record<string, unknown>;
  const seriesId =
    typeof current.seriesId === "string" ? current.seriesId : null;
  if (!seriesId) return 0;

  const timezone =
    typeof current.timezone === "string" ? current.timezone : "UTC";
  const todayCivil = civilDateFormat(new Date(), timezone);

  // Single equality query on seriesId; filter the rest in memory to avoid a
  // composite index requirement.
  const series = await db
    .collection(ASSIGNMENTS)
    .where("seriesId", "==", seriesId)
    .limit(MAX_FUTURE_PROPAGATION + 50)
    .get();

  // Rebuild the exercises with denormalized name/license from the library so
  // the future snapshots stay consistent with how assignTemplate writes them.
  const enriched = await enrichEditedExercises(opts.editedExercises);

  const batch = db.batch();
  let count = 0;
  for (const doc of series.docs) {
    if (doc.id === opts.currentAssignmentId) continue; // not the performed one
    const data = doc.data() as Record<string, unknown>;
    if (data.trainerId !== opts.trainerUid) continue;
    if (data.clientId !== opts.clientId) continue;
    if (data.status !== "scheduled") continue; // never touch completed/missed
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    if (scheduledFor <= todayCivil) continue; // strictly future only

    const existingSnapshot =
      (data.templateSnapshot as Record<string, unknown> | undefined) ?? {};
    batch.update(doc.ref, {
      templateSnapshot: { ...existingSnapshot, exercises: enriched },
      updatedAt: FieldValue.serverTimestamp(),
    });
    count += 1;
    if (count >= MAX_FUTURE_PROPAGATION) break;
  }

  if (count > 0) await batch.commit();
  return count;
}

/** Map edited session exercises to the wire snapshot exercise shape, joining
 *  the exercises library for denormalized name + license. */
async function enrichEditedExercises(
  edited: NonNullable<FinalizeSessionInput["editedExercises"]>,
): Promise<Array<Record<string, unknown>>> {
  const db = gcFitnessFirestore();
  const ids = edited
    .map((e) => e.exerciseId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const docs = ids.length
    ? await db.getAll(...ids.map((id) => db.collection(EXERCISES).doc(id)))
    : [];
  const srcMap = new Map(
    docs.map((d) => [d.id, (d.data() ?? {}) as Record<string, unknown>]),
  );

  return edited.map((e) => {
    const src = srcMap.get(e.exerciseId) ?? {};
    const out: Record<string, unknown> = {
      exerciseId: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
      restSeconds: e.restSeconds,
      notes: e.notes ?? null,
      order: e.order,
      name: localized(src.name, e.exerciseId),
      license: src.license ?? null,
    };
    if (e.supersetGroup) out.supersetGroup = e.supersetGroup;
    if (e.repsBySet) out.repsBySet = e.repsBySet;
    if (e.weightBySetKg) out.weightBySetKg = e.weightBySetKg;
    if (e.metric) out.metric = e.metric;
    if (e.durationBySetSeconds) out.durationBySetSeconds = e.durationBySetSeconds;
    if (typeof e.durationSeconds === "number") {
      out.durationSeconds = e.durationSeconds;
    }
    return out;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// getFutureRecurrenceInfo — preview of what "save to future recurrence" touches
// ───────────────────────────────────────────────────────────────────────────
export async function getFutureRecurrenceInfo(
  assignmentId: string,
): Promise<{ count: number; nextDates: string[] }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const snap = await db.collection(ASSIGNMENTS).doc(assignmentId).get();
  if (!snap.exists) return { count: 0, nextDates: [] };
  const current = snap.data() as Record<string, unknown>;
  if (current.trainerId !== trainer.uid) return { count: 0, nextDates: [] };
  const seriesId =
    typeof current.seriesId === "string" ? current.seriesId : null;
  if (!seriesId) return { count: 0, nextDates: [] };

  const timezone =
    typeof current.timezone === "string" ? current.timezone : "UTC";
  const todayCivil = civilDateFormat(new Date(), timezone);
  const clientId = String(current.clientId ?? "");

  const series = await db
    .collection(ASSIGNMENTS)
    .where("seriesId", "==", seriesId)
    .limit(MAX_FUTURE_PROPAGATION + 50)
    .get();

  const futureDates: string[] = [];
  for (const doc of series.docs) {
    if (doc.id === assignmentId) continue;
    const data = doc.data() as Record<string, unknown>;
    if (data.trainerId !== trainer.uid) continue;
    if (data.clientId !== clientId) continue;
    if (data.status !== "scheduled") continue;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    if (scheduledFor > todayCivil) futureDates.push(scheduledFor);
  }
  futureDates.sort();
  return { count: futureDates.length, nextDates: futureDates.slice(0, 3) };
}

// ───────────────────────────────────────────────────────────────────────────
// getPreviousSessionForClient — "ANTERIOR" column (most-recent perf/exercise)
// ───────────────────────────────────────────────────────────────────────────
export async function getPreviousSessionForClient(
  clientId: string,
): Promise<PreviousSessionMap> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  // Most-recent completed logs for this client (bounded). Ordered by
  // `startedAt` (NOT completedAt) to reuse the EXISTING composite index
  // `(clientId ASC, status ASC, startedAt DESC)` — avoids requiring an index
  // deploy. Filter by trainer in memory (trainer-of-record is denormalized).
  const snap = await db
    .collection(LOGS)
    .where("clientId", "==", clientId)
    .where("status", "==", "completed")
    .orderBy("startedAt", "desc")
    .limit(HISTORY_LIMIT)
    .get();

  const map: PreviousSessionMap = {};
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.trainerId !== trainer.uid) continue;
    const sets = Array.isArray(data.sets)
      ? (data.sets as Array<Record<string, unknown>>)
      : [];
    // Logs are newest-first; first time we see an exercise wins. Within a log
    // keep the heaviest working set as the representative "last time".
    for (const raw of sets) {
      if (raw.is_warmup === true) continue;
      const exerciseId = String(raw.exerciseId ?? "");
      if (!exerciseId || map[exerciseId]) continue;
      // find heaviest set for this exercise in this (most recent) log
      const sameExercise = sets.filter(
        (s) => s.exerciseId === exerciseId && s.is_warmup !== true,
      );
      const best = sameExercise.reduce((acc, s) =>
        num(s.weight_kg, 0) > num(acc.weight_kg, 0) ? s : acc,
      );
      map[exerciseId] = {
        weightKg: num(best.weight_kg, 0),
        reps: num(best.reps, 0),
        durationSeconds:
          typeof best.duration_seconds === "number"
            ? best.duration_seconds
            : null,
      };
    }
  }
  return map;
}

// ───────────────────────────────────────────────────────────────────────────
// listUpcomingScheduledWorkouts — pre-workout alerts (30/10/1 min) feed (#1)
// ───────────────────────────────────────────────────────────────────────────

/** Civil-date string shifted by N days, formatted in `tz`. */
function shiftCivilDate(days: number, tz: string): string {
  return civilDateFormat(new Date(Date.now() + days * 86_400_000), tz);
}

/**
 * Convert a wall-clock "YYYY-MM-DD" + "HH:mm" in IANA `tz` to a UTC epoch ms.
 * Two-step offset correction (handles DST to the minute we care about).
 */
function zonedWallTimeToEpochMs(
  civilDate: string,
  time: string,
  tz: string,
): number | null {
  const [y, mo, d] = civilDate.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const tzAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
  );
  const offset = tzAsUtc - utcGuess;
  return utcGuess - offset;
}

export interface UpcomingWorkout {
  assignmentId: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  scheduledFor: string;
  isToday: boolean;
  scheduledTime: string;
  /** UTC epoch ms of the scheduled start (client tz). */
  scheduledEpochMs: number;
  meetingNotes: string | null;
}

/**
 * Upcoming scheduled workouts (with a scheduledTime) for the current trainer
 * within the next ~12h. Powers the in-tab 30/10/1-minute countdown alerts.
 * Index-free: ranges on the single `scheduledFor` field, filters the rest in
 * memory (the 3-day window keeps the read small at current scale).
 */
export async function listUpcomingScheduledWorkouts(): Promise<UpcomingWorkout[]> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const tz = await getTrainerTimezone().catch(() => "UTC");
  const todayCivil = civilDateFormat(new Date(), tz);

  const lo = shiftCivilDate(-1, tz);
  const hi = shiftCivilDate(1, tz);
  const snap = await db
    .collection(ASSIGNMENTS)
    .where("scheduledFor", ">=", lo)
    .where("scheduledFor", "<=", hi)
    .get();

  const now = Date.now();
  const WINDOW_MS = 12 * 60 * 60 * 1000;
  const rows: Array<Omit<UpcomingWorkout, "clientName">> = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.trainerId !== trainer.uid) continue;
    if (data.status !== "scheduled" && data.status !== "started") continue;
    const scheduledTime =
      typeof data.scheduledTime === "string" ? data.scheduledTime : null;
    if (!scheduledTime) continue;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    const assignmentTz =
      typeof data.timezone === "string" ? data.timezone : tz;
    const epoch = zonedWallTimeToEpochMs(scheduledFor, scheduledTime, assignmentTz);
    if (epoch === null) continue;
    if (epoch < now - 2 * 60 * 1000 || epoch > now + WINDOW_MS) continue;
    const snapshot = data.templateSnapshot as Record<string, unknown> | undefined;
    rows.push({
      assignmentId: doc.id,
      clientId: String(data.clientId ?? ""),
      workoutName: localized(snapshot?.name, "Entrenamiento").en,
      scheduledFor,
      isToday: scheduledFor === todayCivil,
      scheduledTime,
      scheduledEpochMs: epoch,
      meetingNotes:
        typeof data.meetingNotes === "string" ? data.meetingNotes : null,
    });
  }

  // Resolve client display names.
  const clientIds = Array.from(new Set(rows.map((r) => r.clientId).filter(Boolean)));
  const userDocs = clientIds.length
    ? await db.getAll(
        ...clientIds.map((id) => db.collection(FirestoreCollections.users).doc(id)),
      )
    : [];
  const nameMap = new Map(
    userDocs.map((d) => [
      d.id,
      String((d.data() as { displayName?: unknown })?.displayName ?? "Cliente"),
    ]),
  );

  return rows
    .map((r) => ({ ...r, clientName: nameMap.get(r.clientId) ?? "Cliente" }))
    .sort((a, b) => a.scheduledEpochMs - b.scheduledEpochMs);
}

// ───────────────────────────────────────────────────────────────────────────
// client_exercise_notes (#7) — coach's private per-client per-exercise note
// ───────────────────────────────────────────────────────────────────────────
function noteDocId(trainerId: string, clientId: string, exerciseId: string) {
  return `${trainerId}_${clientId}_${exerciseId}`;
}

export async function getClientExerciseNote(
  input: GetClientExerciseNoteInput,
): Promise<{ note: string }> {
  const trainer = await getCurrentTrainer();
  const { clientId, exerciseId } = getClientExerciseNoteSchema.parse(input);
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(NOTES)
    .doc(noteDocId(trainer.uid, clientId, exerciseId))
    .get();
  const note = snap.exists ? String((snap.data() as { note?: unknown }).note ?? "") : "";
  return { note };
}

export async function setClientExerciseNote(
  input: SetClientExerciseNoteInput,
): Promise<{ note: string }> {
  const trainer = await getCurrentTrainer();
  const { clientId, exerciseId, note } = setClientExerciseNoteSchema.parse(input);
  const db = gcFitnessFirestore();
  const ref = db.collection(NOTES).doc(noteDocId(trainer.uid, clientId, exerciseId));
  const trimmed = note.trim();

  if (trimmed.length === 0) {
    await ref.delete().catch(() => {
      /* deleting a non-existent note is fine */
    });
    return { note: "" };
  }

  await ref.set(
    {
      trainerId: trainer.uid,
      clientId,
      exerciseId,
      note: trimmed,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { note: trimmed };
}
