// habit-actions.ts
//
// Server Actions for the GC Fitness trainer Habit CRUD surface.
// This module is the ONLY trainer-writable path to /habits (Firestore rules
// from P06-03 deny client-SDK writes). Every guarantee — allowlist
// enforcement, trainerId set from session, soft-delete-only deletes,
// ownership-scoped list query — lives here.
//
// Threat-register coverage (matches PLAN.md 06-05 <threat_model>):
//   T-06-05-01 (EoP — client forges trainerId on create)
//     → trainerId is added AFTER Zod parse from session.uid. Zod schema
//       strips unknown keys, so a tampered input `trainerId` never survives.
//   T-06-05-02 (Tampering — update foreign trainer's habit)
//     → get()-based ownership precondition before update; throws Forbidden.
//       Defense in depth before the rule layer (P06-03).
//   T-06-05-03 (Tampering — multi-choice without options)
//     → Zod superRefine in habit-schema.ts fails on parse.
//   T-06-05-04 (Tampering — weight habit with targetValue)
//     → Zod superRefine fails on parse.
//   T-06-05-05 (InfoDisclosure — cross-trainer list leak)
//     → listHabitsForTrainer scopes by trainerId == session.uid.
//       listHabitsForClient relies on rule-layer read precondition.
//   T-06-05-06 (Repudiation — hard delete)
//     → softDeleteHabit only; no hardDeleteHabit export.
//   T-06-05-07 (DoS — unbounded list)
//     → .limit(200) on every list query.
//
// REFERENCE PATTERN: mirrors `workout-template-actions.ts` (P04-04) verbatim
// for getCurrentTrainer integration, FieldValue.serverTimestamp usage, and
// the doc-id scheme (`hab-${trainerUid}-${randomUUID()}`).

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  habitCreateSchema,
  habitUpdateSchemaForType,
  type HabitType,
} from "./habit-schema";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const COLLECTION = FirestoreCollections.habits;

/**
 * Shape returned by `listHabitsForTrainer` and `listHabitsForClient` —
 * denormalized projection used by trainer-facing list views. Timestamps are
 * converted to ISO strings so React state stays serializable across the
 * Server Action boundary.
 *
 * Field names mirror the wire shape declared in `.planning/schemas/habits.md`
 * (camelCase end-to-end per P06-02 post-fix + P06-03 rules).
 */
export interface HabitRow {
  id: string;
  clientId: string;
  trainerId: string;
  type: HabitType;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  options?: string[];
  targetValue?: number;
  unit?: string;
  reminderTime?: string;
  reminderEnabled: boolean;
  seedSource?: string;
  deleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Coerces a Firestore Timestamp (or any value exposing `.toDate()`) to an
 * ISO string. Returns null for missing / unknown shapes. Mirrors the
 * `toIso` helper from `workout-template-actions.ts` verbatim.
 */
function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return null;
}

/**
 * Projects a raw Firestore doc to the serializable `HabitRow` shape.
 * Centralized so list + future single-doc reads stay consistent.
 */
function projectHabitRow(
  id: string,
  data: Record<string, unknown>,
): HabitRow {
  return {
    id,
    clientId: (data.clientId as string) ?? "",
    trainerId: (data.trainerId as string) ?? "",
    type: (data.type as HabitType) ?? "binary",
    name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
    description: data.description as { en: string; es: string } | undefined,
    options: Array.isArray(data.options)
      ? (data.options as string[])
      : undefined,
    targetValue:
      typeof data.targetValue === "number" ? data.targetValue : undefined,
    unit: typeof data.unit === "string" ? data.unit : undefined,
    reminderTime:
      typeof data.reminderTime === "string" ? data.reminderTime : undefined,
    reminderEnabled: data.reminderEnabled === true,
    seedSource:
      typeof data.seedSource === "string" ? data.seedSource : undefined,
    deleted: data.deleted === true,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Creates a NEW trainer-owned habit assigned to a specific client.
 *
 * Server-side guarantees:
 *   - `trainerId` ALWAYS set from `getCurrentTrainer().uid` — T-06-05-01.
 *   - `deleted` defaults to false.
 *   - `createdAt` / `updatedAt` are server timestamps.
 *   - Doc id follows the canonical `hab-${trainerUid}-${uuid}` scheme.
 *
 * Zod-parses BEFORE any Firestore write so multi-choice-without-options,
 * weight-with-targetValue, malformed reminderTime, etc. are caught
 * client-of-DB — T-06-05-03 / -04.
 */
export async function createHabit(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();

  // Zod-parse FIRST. Unknown keys (trainerId / seedSource / deleted / etc.)
  // are stripped silently — the schema's surface is what we trust. We add
  // trainerId from the session AFTER the parse so a tampered input cannot
  // surface even if a future schema rev accidentally accepts the field.
  const data = habitCreateSchema.parse(input);

  const db = gcFitnessFirestore();
  const docId = `hab-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);

  await docRef.set({
    ...data,
    id: docId,
    trainerId: trainer.uid, // T-06-05-01: ALWAYS from session, NEVER from input.
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

/**
 * Updates an existing trainer-owned habit.
 *
 * Pre-flight reads the existing doc and refuses if:
 *  - the doc doesn't exist (throws "Not found")
 *  - the doc's `trainerId` isn't the caller (throws "Not your habit" —
 *    T-06-05-02 defense in depth before the rule layer)
 *
 * Parses against `habitUpdateSchemaForType(existingType)` so the same
 * type-conditional refinements (multi-choice⇒options, weight⇒no targetValue,
 * reminderEnabled⇒reminderTime) apply on update even though the immutable
 * `type` field is stripped from the input.
 *
 * The patch is built field-by-field from a whitelist matching the
 * affectedKeys list in P06-03 rules — clientId, trainerId, type,
 * createdAt, seedSource are NEVER in the patch.
 */
export async function updateHabit(
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
    trainerId?: string;
    type?: HabitType;
  };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your habit.");
  }

  const existingType: HabitType = (existing.type as HabitType) ?? "binary";
  const parsed = habitUpdateSchemaForType(existingType).parse(input) as {
    name: { en: string; es: string };
    description?: { en: string; es: string };
    options?: string[];
    targetValue?: number;
    unit?: string;
    reminderTime?: string;
    reminderEnabled: boolean;
  };

  // Field-by-field whitelist (matches P06-03 affectedKeys.hasOnly([...]))
  // — no `...spread` of `parsed` because we want zero risk of an unknown
  // key surviving on update if a future Zod version starts allowing extras.
  const patch: Record<string, unknown> = {
    name: parsed.name,
    reminderEnabled: parsed.reminderEnabled,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.description !== undefined) {
    patch.description = parsed.description;
  }
  if (parsed.options !== undefined) {
    patch.options = parsed.options;
  }
  if (parsed.targetValue !== undefined) {
    patch.targetValue = parsed.targetValue;
  }
  if (parsed.unit !== undefined) {
    patch.unit = parsed.unit;
  }
  if (parsed.reminderTime !== undefined) {
    patch.reminderTime = parsed.reminderTime;
  }

  await docRef.update(patch);

  return { ok: true };
}

/**
 * Soft-deletes a trainer-owned habit (sets `deleted: true`). Refuses on
 * cross-trainer ownership. Hard-delete is gated by Firestore rules
 * (P06-03 — `allow delete: if false`) AND by this module — T-06-05-06.
 */
export async function softDeleteHabit(
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
    throw new Error("Not your habit.");
  }

  await docRef.update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * Lists the calling trainer's habits across every client.
 *
 *  - Filters by `trainerId == session.uid` — T-06-05-05.
 *  - Excludes soft-deleted via `deleted == false` (matches P06-01 composite
 *    index #2: `trainerId+deleted+updatedAt DESC`).
 *  - Ordered by `updatedAt DESC`.
 *  - Bounded at 200 — T-06-05-07 (pagination deferred to v2).
 *
 * Returns a serializable `HabitRow[]` projection — never the raw Firestore
 * doc with Timestamps (which would break Next.js Server Action serialization).
 */
export async function listHabitsForTrainer(): Promise<HabitRow[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("trainerId", "==", trainer.uid)
    .where("deleted", "==", false)
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get();

  return snap.docs.map((d) =>
    projectHabitRow(d.id, d.data() as Record<string, unknown>),
  );
}

/**
 * Lists habits assigned to a single client by the calling trainer.
 *
 * Implementation note (Plan-Task 2 choice (b)): the query scopes by
 * `clientId + deleted` and lets the rule layer (P06-03) enforce the
 * `trainerId == auth.uid` precondition on read. Rationale:
 *   - A 4-field composite index would otherwise be required
 *     (`clientId+trainerId+deleted+updatedAt DESC`); not declared in
 *     `firestore.indexes.json` from P06-01.
 *   - The rule layer is sufficient: any returned doc must already satisfy
 *     `trainerId == auth.uid OR clientId == auth.uid`. Since this Server
 *     Action is invoked by an authed trainer (getCurrentTrainer guard),
 *     a doc owned by a different trainer would surface as a
 *     PERMISSION_DENIED on Firestore-rule evaluation — except that the
 *     Admin SDK bypasses rules, so we re-enforce here at the application
 *     layer via the post-query filter.
 *
 * Defense-in-depth: we additionally filter the result client-of-DB to
 * `row.trainerId === session.uid` so a misbehaving rule (or a future rule
 * relaxation) cannot leak cross-trainer habits.
 *
 *  - Bounded at 200 — T-06-05-07.
 *  - Excludes soft-deleted.
 */
export async function listHabitsForClient(
  clientId: string,
): Promise<HabitRow[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("clientId", "==", clientId)
    .where("deleted", "==", false)
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get();

  const rows = snap.docs.map((d) =>
    projectHabitRow(d.id, d.data() as Record<string, unknown>),
  );
  // Defense-in-depth: Admin SDK bypasses rules; re-check ownership here.
  return rows.filter((r) => r.trainerId === trainer.uid);
}
