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
import { FirestoreCollections } from "./collections";

const COLLECTION = FirestoreCollections.workoutTemplates;

/**
 * Shape returned by `listWorkoutTemplates` — denormalized projection used
 * by the trainer-library list view. Timestamps are converted to ISO strings
 * so React state stays serializable across the Server Action boundary.
 */
export interface WorkoutTemplateRow {
  id: string;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  tag: WorkoutTag;
  exerciseCount: number;
  trainerId: string;
  isStandard: boolean;
  deleted: boolean;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
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

  await docRef.set({
    ...data,
    id: docId,
    trainerId: trainer.uid, // T-04-14: ALWAYS from session, NEVER from input.
    isStandard: false,
    version: 1, // T-04-15: server-side; never from input.
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

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
  await docRef.set({
    name: source.name ?? { en: "", es: "" },
    description: source.description ?? { en: "", es: "" },
    tag: typeof source.tag === "string" ? source.tag : "custom",
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
  await docRef.set({
    name: suffixedName,
    description: source.description ?? { en: "", es: "" },
    tag: typeof source.tag === "string" ? source.tag : "custom",
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
    return {
      id: d.id,
      name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
      description: data.description as { en: string; es: string } | undefined,
      tag: (data.tag as WorkoutTag) ?? "custom",
      exerciseCount: exercises.length,
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
    templates = templates.filter((t) => t.tag === opts.tag);
  }

  templates.sort((a, b) => {
    const aTs = a.updatedAt ?? "";
    const bTs = b.updatedAt ?? "";
    return aTs < bTs ? 1 : aTs > bTs ? -1 : 0;
  });

  return { templates };
}
