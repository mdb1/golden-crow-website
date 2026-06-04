// workout-template-actions.ts
//
// Server Actions for the GC Fitness trainer Workout Template CRUD surface.
// This module is the ONLY trainer-writable path to /workout_templates
// (Firestore rules from P04-02 deny client-SDK writes). Every guarantee —
// allowlist enforcement, role check, trainerId set from session, version
// increment, ownership-scoped list query — lives here.
//
// Threat-register coverage (matches PLAN.md 04-04 <threat_model>):
//   T-04-14 (EoP — client claims trainerId)        → trainerId from session
//   T-04-15 (Tampering — client claims version)     → version computed server-side
//   T-04-16 (InfoDisclosure — list leak across trainers) → where trainerId == session.uid
//   T-04-17 (Tampering — malformed payload)         → Zod parse before any DB op
//   T-04-18 (Repudiation — hard-delete to hide history) → soft-delete only
//   T-04-19 (DoS — 10,000-exercise template)        → Zod max(30) exercises
//
// REFERENCE PATTERN: mirrors `exercise-server-actions.ts` (P03-05) verbatim
// for `getCurrentTrainer()` integration, FieldValue.serverTimestamp /
// increment usage, and the doc-id scheme.

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  workoutTemplateSchema,
  workoutTemplateUpdateSchema,
  type WorkoutTag,
} from "./workout-template-schema";
import { getCurrentTrainer } from "./auth-helpers";
import {
  recordCoachActivityEvent,
  markCoachActivityDeleted,
  templateCreatedEvent,
} from "./coach-activity-log";
import { FirestoreCollections } from "./collections";
import { estimateTemplateDurationMinutesFromRaw } from "./workout-duration-estimate";

const COLLECTION = FirestoreCollections.workoutTemplates;

/**
 * Read the multi-tag list from a raw Firestore doc, falling back to the
 * legacy single `tag` field for rows authored before multi-tag landed.
 * Returns at least one tag — "custom" if the source has nothing usable.
 */
function readTagsFromSource(source: Record<string, unknown>): string[] {
  if (Array.isArray(source.tags)) {
    const cleaned = (source.tags as unknown[])
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
    if (cleaned.length > 0) return cleaned;
  }
  if (typeof source.tag === "string" && source.tag.trim().length > 0) {
    return [source.tag.trim()];
  }
  return ["custom"];
}

function readTransitionRestSeconds(source: Record<string, unknown>): number {
  const raw = source.transition_rest_seconds ?? source.transitionRestSeconds;
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.min(600, raw))
    : 60;
}

/**
 * Shape returned by `listWorkoutTemplates` — denormalized projection used
 * by the trainer-library list view. Timestamps are converted to ISO strings
 * so React state stays serializable across the Server Action boundary.
 */
export interface WorkoutTemplateRow {
  id: string;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  endsOn?: string;
  /** Legacy single-tag mirror. Always equal to `tags[0]` (or "custom"
   *  when tags is empty). Kept so iOS clients reading the old field stay
   *  working until they migrate. */
  tag: WorkoutTag;
  /** Multi-tag list (canonical going forward). May be `[]` if the row is
   *  legacy data from before multi-tag landed — list code should fall
   *  back to `[tag]` in that case. */
  tags: WorkoutTag[];
  exerciseCount: number;
  /** Estimated whole-minutes duration of the prescription (work + rest +
   *  per-set setup overhead + transitions). 0 when there are no exercises.
   *  Computed via the iOS-twin estimator — see workout-duration-estimate.ts. */
  estimatedDurationMinutes: number;
  trainerId: string;
  isStandard: boolean;
  deleted: boolean;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WorkoutTemplateExerciseDetail {
  index: number;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  rest_seconds: number;
  transition_rest_seconds: number;
  notes?: string;
  repsBySet?: number[];
  weightBySetKg?: number[];
  /** Preview URL — preferred chain gifUrl → imageUrl → thumbnailURL. The
   *  assign-template-modal renders ExercisePreviewThumb with this so the
   *  trainer can hover-preview the exercise without leaving the modal. */
  previewUrl: string | null;
  /** Free-form superset group label (e.g. "A", "B"). Trainer renders
   *  adjacent exercises sharing the same label as a superset block. */
  supersetGroup?: string | null;
  /**
   * 26-03 — Per-template metric override carried on the template doc.
   * `undefined` means "inherit from the source exercise". Consumers
   * (assign-template-modal) cascade as
   *   effectiveMetric = override.metric ?? templateMetric ?? exerciseMetric ?? "reps"
   * (PATTERNS.md §17 + Shared 1).
   */
  metric?: "reps" | "time";
  /**
   * 26-03 — Source-exercise metric (Exercise.metric, defaulted to
   * "reps"). Pre-resolved server-side via the same exerciseMap getAll()
   * batch that resolves `exerciseName` and `previewUrl`, so the modal
   * doesn't need its own Firestore listener to compute the cascade.
   */
  sourceMetric: "reps" | "time";
  /** 26-03 — Per-set duration prescription (seconds) for time-based
   *  exercises. Same shape as `repsBySet`. */
  durationBySetSeconds?: number[];
  /** 26-03 — Exercise-level duration fallback (seconds). Same shape
   *  as `reps` for the time branch. */
  durationSeconds?: number;
}

/**
 * Coerces a Firestore Timestamp (or any value exposing `.toDate()`) to an
 * ISO string. Returns null for missing / unknown shapes.
 */
function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return null;
}

/**
 * Creates a NEW trainer-owned workout template.
 *
 * Server-side guarantees:
 *   - `trainerId` ALWAYS set from `getCurrentTrainer().uid` — T-04-14.
 *   - `version` ALWAYS set to 1 — T-04-15.
 *   - `createdAt` / `updatedAt` are server timestamps.
 *   - `deleted` defaults to false.
 *   - Doc id follows the canonical `tpl-${trainerUid}-${uuid}` scheme.
 *
 * Zod-parses BEFORE any Firestore write so an empty `exercises` array,
 * `sets > 10`, or `reps as string` are caught client-of-DB — T-04-17, T-04-19.
 */
export async function createWorkoutTemplate(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();

  // Zod-parse FIRST. Unknown keys (trainerId / version / deleted / etc.) are
  // stripped silently — the schema's surface is what we trust.
  const data = workoutTemplateSchema.parse(input);

  const db = gcFitnessFirestore();
  const docId = `tpl-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);

  // Multi-tag dual-write: `tags` is the canonical list; `tag` is the
  // legacy single-tag mirror (= tags[0] ?? "custom") kept so iOS clients
  // reading the old field stay working until they migrate to tags[].
  const tagsList = data.tags.length > 0 ? data.tags : [data.tag];
  const legacyTag = tagsList[0] ?? "custom";

  await docRef.set({
    ...data,
    tag: legacyTag,
    tags: tagsList,
    id: docId,
    trainerId: trainer.uid, // T-04-14: ALWAYS from session, NEVER from input.
    isStandard: false,
    version: 1, // T-04-15: server-side; never from input.
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recordCoachActivityEvent(
    db,
    templateCreatedEvent({ trainerId: trainer.uid, templateId: docId, name: data.name }),
  );

  return { id: docId };
}

/**
 * Creates a trainer-owned copy of a standard template.
 *
 * This is the "edit without mutating global standard" path.
 */
export async function forkStandardWorkoutTemplate(
  id: string,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const sourceRef = db.collection(COLLECTION).doc(id);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new Error("Template not found");
  }
  const source = sourceSnap.data() as Record<string, unknown>;
  const isStandard = source.isStandard === true;
  if (!isStandard) {
    const ownerId = typeof source.trainerId === "string" ? source.trainerId : "";
    if (ownerId !== trainer.uid) {
      throw new Error("Not your template.");
    }
    return { id };
  }

  const docId = `tpl-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);
  const sourceTags = readTagsFromSource(source);
  await docRef.set({
    name: source.name ?? { en: "", es: "" },
    description: source.description ?? { en: "", es: "" },
    endsOn: typeof source.endsOn === "string" ? source.endsOn : undefined,
    tag: sourceTags[0] ?? "custom",
    tags: sourceTags,
    exercises: Array.isArray(source.exercises) ? source.exercises : [],
    id: docId,
    trainerId: trainer.uid,
    isStandard: false,
    sourceTemplateId: id,
    version: 1,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

// ─────────────────────────────────────────────────────────────────────────────
// P21 (Backoffice Workout Authoring v2) — duplicateWorkoutTemplate
// Duplicates an existing trainer-owned workout template with " (copia)"
// suffixed onto the ES + EN name slots. Behaves like forkStandardWorkoutTemplate
// but works for the trainer's OWN templates (not just isStandard==true).
// ─────────────────────────────────────────────────────────────────────────────

export async function duplicateWorkoutTemplate(
  id: string,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const sourceRef = db.collection(COLLECTION).doc(id);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new Error("Template not found");
  }
  const source = sourceSnap.data() as Record<string, unknown>;
  // Trainer owns it OR it's a standard template (in which case behave like fork).
  const ownerId = typeof source.trainerId === "string" ? source.trainerId : "";
  const isStandard = source.isStandard === true;
  if (!isStandard && ownerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  const sourceName = (source.name ?? { en: "", es: "" }) as { en?: string; es?: string };
  const suffixedName = {
    en: `${sourceName.en ?? ""} (copy)`.trim(),
    es: `${sourceName.es ?? ""} (copia)`.trim(),
  };

  const docId = `tpl-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);
  const sourceTags = readTagsFromSource(source);
  await docRef.set({
    name: suffixedName,
    description: source.description ?? { en: "", es: "" },
    endsOn: typeof source.endsOn === "string" ? source.endsOn : undefined,
    tag: sourceTags[0] ?? "custom",
    tags: sourceTags,
    exercises: Array.isArray(source.exercises) ? source.exercises : [],
    id: docId,
    trainerId: trainer.uid,
    isStandard: false, // duplicates are always trainer-owned forks
    sourceTemplateId: id,
    version: 1,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

/**
 * Updates an existing trainer-owned workout template.
 *
 * Pre-flight reads the existing doc and refuses if:
 *  - the doc doesn't exist (throws "Not found")
 *  - the doc's `trainerId` isn't the caller (throws "Not your template" —
 *    T-04-16 defense in depth alongside the rule layer)
 *
 * Bumps `version` via `FieldValue.increment(1)` and stamps `updatedAt`.
 * Strips `trainerId`, `createdAt`, `version`, `deleted`, `id` from the
 * patch — those fields are server-controlled and immutable through
 * trainer-facing writes.
 */
export async function updateWorkoutTemplate(
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
  const existing = snap.data() as { trainerId?: string };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  const patch = workoutTemplateUpdateSchema.parse(input);

  await docRef.update({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  });

  return { ok: true };
}

/**
 * Soft-deletes a trainer-owned template (sets `deleted: true`). Refuses on
 * cross-trainer ownership. Hard-delete is gated by Firestore rules (P04-02)
 * AND by this action — T-04-18.
 */
export async function softDeleteWorkoutTemplate(
  id: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { trainerId?: string };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  await docRef.update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await markCoachActivityDeleted(db, `tpl:${id}`);

  return { ok: true };
}

/**
 * Lists the calling trainer's workout templates.
 *
 *  - Filters by `trainerId == session.uid` — T-04-16.
 *  - Excludes soft-deleted by default. `includeDeleted: true` opts in.
 *  - Optional tag filter (`{ tag: "push" }`).
 *  - Ordered by `updatedAt DESC` to surface the most recently edited
 *    templates first (matches composite index #1 from P04-01).
 *
 * Returns a serializable `WorkoutTemplateRow[]` projection — never the raw
 * Firestore doc with Timestamps (which would break Next.js Server Action
 * serialization).
 */
export async function listWorkoutTemplates(opts?: {
  tag?: WorkoutTag;
  includeDeleted?: boolean;
}): Promise<{ templates: WorkoutTemplateRow[] }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  // Keep list queries index-light: query by ownership/global flag only and
  // apply tag/deleted/sort in memory. This avoids extra composite-index
  // requirements for trainer accounts.
  const ownQ = db.collection(COLLECTION).where("trainerId", "==", trainer.uid);
  const standardQ = db.collection(COLLECTION).where("isStandard", "==", true);
  const [ownSnap, standardSnap] = await Promise.all([ownQ.get(), standardQ.get()]);
  const mergedDocs = [...ownSnap.docs, ...standardSnap.docs];
  const dedup = new Map(mergedDocs.map((d) => [d.id, d]));
  let templates: WorkoutTemplateRow[] = [...dedup.values()].map((d) => {
    const data = d.data() as Record<string, unknown>;
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];
    const tags = readTagsFromSource(data);
    return {
      id: d.id,
      name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
      description: data.description as { en: string; es: string } | undefined,
      endsOn: typeof data.endsOn === "string" ? data.endsOn : undefined,
      // Legacy mirror: prefer the explicit `tag` field; fall back to tags[0].
      tag: (data.tag as WorkoutTag) ?? tags[0] ?? "custom",
      tags,
      exerciseCount: exercises.length,
      estimatedDurationMinutes: estimateTemplateDurationMinutesFromRaw(exercises),
      trainerId: (data.trainerId as string) ?? "",
      isStandard: data.isStandard === true,
      deleted: data.deleted === true,
      version: typeof data.version === "number" ? data.version : 1,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };
  });

  if (!opts?.includeDeleted) {
    templates = templates.filter((t) => !t.deleted);
  }
  if (opts?.tag) {
    // Match any-of: a query-time tag matches if it appears in tags[] OR
    // equals the legacy `tag` field (covers pre-multi-tag rows).
    templates = templates.filter((t) =>
      t.tags.includes(opts.tag as string) || t.tag === opts.tag,
    );
  }

  templates.sort((a, b) => {
    const aTs = a.updatedAt ?? "";
    const bTs = b.updatedAt ?? "";
    return aTs < bTs ? 1 : aTs > bTs ? -1 : 0;
  });

  return { templates };
}

export async function getWorkoutTemplateForAssignment(templateId: string): Promise<{
  id: string;
  name: { en: string; es: string };
  exercises: WorkoutTemplateExerciseDetail[];
}> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const snap = await db.collection(COLLECTION).doc(templateId).get();
  if (!snap.exists) throw new Error("Template not found.");
  const data = snap.data() as Record<string, unknown>;
  const canUseTemplate =
    data.trainerId === trainer.uid || data.isStandard === true;
  if (!canUseTemplate) throw new Error("Not your template.");

  const exercises = Array.isArray(data.exercises)
    ? (data.exercises as Array<Record<string, unknown>>)
    : [];
  const exerciseIds = exercises
    .map((exercise) => exercise.exerciseId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const exerciseDocs =
    exerciseIds.length > 0
      ? await db.getAll(
          ...exerciseIds.map((id) =>
            db.collection(FirestoreCollections.exercises).doc(id),
          ),
        )
      : [];
  const exerciseMap = new Map(
    exerciseDocs.map((doc) => [doc.id, doc.data() as Record<string, unknown>]),
  );

  return {
    id: snap.id,
    name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
    exercises: exercises.map((exercise, index) => {
      const exerciseId =
        typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
      const source = exerciseMap.get(exerciseId);
      const sourceName = source?.name as { en?: string; es?: string } | undefined;
      const exerciseName =
        sourceName?.en || sourceName?.es || exerciseId || `Exercise ${index + 1}`;
      // 26-03 — Surface metric + duration fields so the modal can
      // resolve `effectiveMetric = override ?? template ?? source ??
      // "reps"` without spawning its own Firestore listener. The
      // `source` lookup above already runs via getAll() so this is a
      // zero-cost addition.
      const rawTemplateMetric = exercise.metric;
      const templateMetric: "reps" | "time" | undefined =
        rawTemplateMetric === "reps" || rawTemplateMetric === "time"
          ? rawTemplateMetric
          : undefined;
      const rawSourceMetric = source?.metric;
      const sourceMetric: "reps" | "time" =
        rawSourceMetric === "time" ? "time" : "reps";
      const durationBySetSeconds = Array.isArray(exercise.durationBySetSeconds)
        ? (exercise.durationBySetSeconds as number[]).filter((n) =>
            Number.isFinite(n),
          )
        : [];
      const durationSecondsRaw = exercise.durationSeconds;
      const durationSeconds =
        typeof durationSecondsRaw === "number" &&
        Number.isFinite(durationSecondsRaw)
          ? durationSecondsRaw
          : undefined;
      const transitionRestSeconds = readTransitionRestSeconds(exercise);
      return {
        index,
        exerciseId,
        exerciseName,
        sets:
          typeof exercise.sets === "number" && Number.isFinite(exercise.sets)
            ? exercise.sets
            : 3,
        reps:
          typeof exercise.reps === "number" && Number.isFinite(exercise.reps)
            ? exercise.reps
            : 10,
        rest_seconds:
          typeof exercise.rest_seconds === "number" &&
          Number.isFinite(exercise.rest_seconds)
            ? exercise.rest_seconds
            : 60,
        transition_rest_seconds: transitionRestSeconds,
        notes: typeof exercise.notes === "string" ? exercise.notes : "",
        repsBySet: Array.isArray(exercise.repsBySet)
          ? (exercise.repsBySet as number[]).filter((n) => Number.isFinite(n))
          : [],
        weightBySetKg: Array.isArray(exercise.weightBySetKg)
          ? (exercise.weightBySetKg as number[]).filter((n) => Number.isFinite(n))
          : [],
        previewUrl: extractPreviewUrl(source),
        supersetGroup:
          typeof exercise.supersetGroup === "string" &&
          exercise.supersetGroup.trim().length > 0
            ? exercise.supersetGroup.trim()
            : null,
        ...(templateMetric !== undefined ? { metric: templateMetric } : {}),
        sourceMetric,
        ...(durationBySetSeconds.length > 0
          ? { durationBySetSeconds }
          : {}),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      };
    }),
  };
}

/**
 * Pick the canonical preview URL for an exercise doc. Mirrors the picker's
 * `previewSrc` priority (gifUrl → imageUrl → thumbnailURL). Returns `null`
 * for legacy / quick-create exercises that don't have any media yet, so the
 * caller can render a fallback (Dumbbell icon in ExercisePreviewThumb).
 */
function extractPreviewUrl(
  source: Record<string, unknown> | undefined,
): string | null {
  if (!source) return null;
  const pick = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim().length > 0 ? raw : null;
  return pick(source.gifUrl) ?? pick(source.imageUrl) ?? pick(source.thumbnailURL);
}
