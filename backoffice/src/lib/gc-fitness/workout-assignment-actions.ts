// workout-assignment-actions.ts
//
// Server Actions for the GC Fitness trainer workout-assignment surface
// (single + bulk assign, narrow edit, hard delete, list queries).
//
// Plan 04-05 contract (see PLAN.md + 04-RESEARCH.md Pattern 4):
//  - trainerId is ALWAYS sourced from `getCurrentTrainer().uid`, NEVER from
//    client input (T-04-22 / OWNERSHIP-CLAIM mitigation).
//  - scheduledFor is a CIVIL DATE STRING (Pitfall 1) — Zod regex + rule
//    layer regex from 04-02 both enforce. NEVER a Timestamp.
//  - bulkAssignTemplate fans out via a SINGLE Firestore WriteBatch (Pattern 4)
//    — atomic, capped at 166 clients per submit (Pitfall 5: 500 ops / 3
//    ops per assignment).
//  - templateSnapshot is a full denormalized copy of the source template
//    (WTPL-07 snapshot immutability) — read template ONCE per bulk call,
//    embed in every assignment doc.
//  - editAssignmentScheduledFor is the ONLY edit path (supplemental decision 1).
//    Mirrors rule-layer affectedKeys whitelist from 04-02 exactly.
//
// Threat-register coverage (04-05 PLAN.md):
//  T-04-20 (Tampering — scheduledFor as Timestamp)         Zod regex + rule
//  T-04-21 (Tampering — templateSnapshot via edit path)    editAssignmentSchema.strict()
//  T-04-22 (EOP — cross-trainer templateId)                template.trainerId check
//  T-04-23 (Tampering — > 166 clientIds bypass cap)        Zod max(166) + assert
//  T-04-24 (Information Disclosure — UID leak in toast)    Server-side log only

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  assignTemplateSchema,
  bulkAssignSchema,
  editAssignmentSchema,
  MAX_CLIENTS_PER_BATCH,
} from "./workout-assignment-schema";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { civilDateFormat } from "./civil-date";

const TEMPLATES = FirestoreCollections.workoutTemplates;
const ASSIGNMENTS = FirestoreCollections.workoutAssignments;

/**
 * Row shape returned by the list queries. Firestore Timestamps are converted
 * to ISO strings so the result is JSON-serializable across the RSC ↔ client
 * boundary (Server Actions get serialized like API responses).
 */
export interface WorkoutAssignmentRow {
  id: string;
  templateId: string;
  templateSnapshot: unknown;
  clientId: string;
  trainerId: string;
  scheduledFor: string;
  timezone?: string | null;
  status: "scheduled" | "started" | "completed" | "missed";
  createdAt: string | null;
  updatedAt: string | null;
}

// Coerce Firestore Timestamp | string | undefined to an ISO string (or null).
function toIso(v: unknown): string | null {
  if (
    v &&
    typeof (v as { toDate?: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return null;
}

function snapToRow(d: {
  id: string;
  data: () => Record<string, unknown>;
}): WorkoutAssignmentRow {
  const data = d.data();
  return {
    id: d.id,
    templateId: String(data.templateId ?? ""),
    templateSnapshot: data.templateSnapshot,
    clientId: String(data.clientId ?? ""),
    trainerId: String(data.trainerId ?? ""),
    scheduledFor: String(data.scheduledFor ?? ""),
    timezone:
      typeof data.timezone === "string" ? data.timezone : null,
    status:
      (data.status as WorkoutAssignmentRow["status"]) ?? "scheduled",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Add `n` civil-date days to a "YYYY-MM-DD" string and return the new
 * civil-date string. Pure-arithmetic helper — formats the result via the
 * `civilDateFormat()` twin from civil-date.ts so the output is guaranteed
 * to be zero-padded "YYYY-MM-DD" (Pitfall 1 — never reach for
 * `toISOString().slice(0,10)` even in this internal helper).
 *
 * Implementation: parse the input as UTC midnight, add n*86400000ms, then
 * format via `civilDateFormat(..., "UTC")`. UTC is the correct zone here
 * because the underlying Date is UTC-midnight by construction — there is
 * no wall-clock instant being formatted. Using `civilDateFormat` (not
 * `toISOString()`) keeps the source-contract gate satisfied and routes
 * every civil-date-string emission through the same code path.
 */
function addCivilDays(civilDate: string, days: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  // Construct at UTC midnight so the arithmetic is exact-day.
  const utcMidnight = Date.UTC(y, m - 1, d);
  const shifted = new Date(utcMidnight + days * 86_400_000);
  return civilDateFormat(shifted, "UTC");
}

// ─────────────────────────────────────────────────────────────────────────────
// assignTemplate — single-client write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assigns a workout template to a single client on a single civil date.
 *
 * Flow:
 *  1. `getCurrentTrainer()` enforces allowlist + role.
 *  2. Zod parses input — rejects malformed civilDate / empty ids.
 *  3. Read the template ONCE; assert `template.trainerId === trainer.uid`.
 *  4. Write a single assignment doc with the FULL `templateSnapshot`
 *     (denormalized — WTPL-07 immutability invariant).
 */
export async function assignTemplate(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const parsed = assignTemplateSchema.parse(input);

  const db = gcFitnessFirestore();
  const templateSnap = await db
    .collection(TEMPLATES)
    .doc(parsed.templateId)
    .get();
  if (!templateSnap.exists) {
    throw new Error("Template not found.");
  }
  const template = templateSnap.data() as { trainerId?: string } & Record<
    string,
    unknown
  >;
  if (template.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  // Doc-id convention from schemas/workout-assignments.md:
  //   asg-${clientUid}-${YYYYMMDD}-${uuid}
  const ymd = parsed.scheduledFor.replace(/-/g, "");
  const docId = `asg-${parsed.clientId}-${ymd}-${randomUUID()}`;
  const ref = db.collection(ASSIGNMENTS).doc(docId);

  await ref.set({
    templateId: parsed.templateId,
    templateSnapshot: template,
    clientId: parsed.clientId,
    trainerId: trainer.uid,
    scheduledFor: parsed.scheduledFor, // STRING — Pitfall 1
    timezone: parsed.timezone ?? null,
    status: "scheduled" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

// ─────────────────────────────────────────────────────────────────────────────
// bulkAssignTemplate — N-client atomic WriteBatch (SC#2 acceptance surface)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assigns a workout template to N clients on a single civil date in ONE
 * atomic Firestore WriteBatch (Pattern 4). Either all N docs commit or NONE
 * commit — there is no partial-success state by construction.
 *
 * Caps:
 *  - Zod max(166) — enforced at parse time.
 *  - Defensive runtime cap re-asserted before WriteBatch construction.
 *
 * Doc-id pattern per client: `asg-${clientId}-${YYYYMMDD}-${uuid}` — unique
 * even if two clients get the same template on the same day.
 *
 * Errors:
 *  - Forbidden     → no session / wrong role / not allowlisted
 *  - "Not your template." → template.trainerId mismatch (T-04-05)
 *  - "Template not found." → template doesn't exist
 *  - Verbatim Firestore error on `batch.commit()` rejection (Pitfall 5 —
 *    surface partial-failure as full failure, never silently truncate).
 */
export async function bulkAssignTemplate(
  input: unknown,
): Promise<{ ids: string[] }> {
  const trainer = await getCurrentTrainer();
  const parsed = bulkAssignSchema.parse(input);

  // Defense-in-depth — Zod already capped at MAX_CLIENTS_PER_BATCH, but a
  // future refactor could widen the schema; this guard is the rule-layer
  // equivalent of `affectedKeys.hasOnly`.
  if (parsed.clientIds.length > MAX_CLIENTS_PER_BATCH) {
    throw new Error(
      `Bulk-assign supports at most ${MAX_CLIENTS_PER_BATCH} clients per submit.`,
    );
  }

  const db = gcFitnessFirestore();

  // 1) Read the template ONCE — server-side denormalization at this instant.
  // Every assignment doc carries the SAME snapshot byte-for-byte (asserted
  // by the SC#2 test).
  const templateSnap = await db
    .collection(TEMPLATES)
    .doc(parsed.templateId)
    .get();
  if (!templateSnap.exists) {
    throw new Error("Template not found.");
  }
  const template = templateSnap.data() as { trainerId?: string } & Record<
    string,
    unknown
  >;
  if (template.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  // 2) Build the batch.
  const batch = db.batch();
  const ids: string[] = [];
  const ymd = parsed.scheduledFor.replace(/-/g, "");

  for (const clientId of parsed.clientIds) {
    const docId = `asg-${clientId}-${ymd}-${randomUUID()}`;
    const ref = db.collection(ASSIGNMENTS).doc(docId);
    batch.set(ref, {
      templateId: parsed.templateId,
      templateSnapshot: template, // SAME REFERENCE — immutable snapshot
      clientId,
      trainerId: trainer.uid,
      scheduledFor: parsed.scheduledFor,
      timezone: parsed.timezone ?? null,
      status: "scheduled" as const,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    ids.push(docId);
  }

  // 3) Atomic commit — throws on permission denial, network error, or rule
  // violation. The verbatim error message bubbles up to the trainer toast
  // (Pitfall 5 — no silent partial-success messaging). UID lists are never
  // included in the error (T-04-24 — count + verbatim error string only).
  await batch.commit();

  return { ids };
}

// ─────────────────────────────────────────────────────────────────────────────
// editAssignmentScheduledFor — the ONLY edit path (supplemental decision 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-schedules an existing assignment. The ONLY mutable field is
 * `scheduledFor` (per supplemental decision 1 in 04-05-PLAN.md) — the
 * Server Action mirrors the rule-layer whitelist
 *   `affectedKeys().hasOnly(['scheduledFor', 'updatedAt'])`
 * from 04-02. Any attempt to send other fields is rejected by Zod's
 * `.strict()` BEFORE the Firestore update would surface a PERMISSION_DENIED.
 *
 * Ownership: the caller must be the assignment's `trainerId`. The rule
 * layer would reject otherwise; checking here gives a clearer error.
 */
export async function editAssignmentScheduledFor(
  id: string,
  input: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsed = editAssignmentSchema.parse(input);

  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { trainerId?: string };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your assignment.");
  }

  await ref.update({
    scheduledFor: parsed.scheduledFor,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteAssignment — narrow trainer-owned hard delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard-deletes a trainer-owned assignment. The rule layer (04-02) permits
 * hard delete only on `request.auth.uid == resource.data.trainerId`.
 *
 * v1 uses this narrowly — the schedule view "remove from this day" button.
 * P05 will route most "client missed this" intent through a status flip to
 * `"missed"` instead.
 */
export async function deleteAssignment(
  id: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { trainerId?: string };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your assignment.");
  }

  await ref.delete();

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// listAssignmentsForClientWeek — composite index #3 (clientId, scheduledFor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the 7-day window of assignments for `clientId` starting at
 * `weekStart` (a civil-date "YYYY-MM-DD" string; Monday by convention).
 *
 * Index: `(clientId ASC, scheduledFor ASC)` from 04-01 (index #3).
 *
 * Authentication: enforced via `getCurrentTrainer()`. The rule layer
 * further enforces read scoping (trainer or client only); since the
 * Admin SDK bypasses rules, this list never returns assignments outside
 * the caller's roster only because the caller-side UX already scopes by
 * `clientId`. A future P10 hardening pass may add explicit roster checks
 * here when the `users/{uid}.coachId` field is queryable.
 */
export async function listAssignmentsForClientWeek(
  clientId: string,
  weekStart: string,
): Promise<WorkoutAssignmentRow[]> {
  await getCurrentTrainer();

  const weekEnd = addCivilDays(weekStart, 6);
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(ASSIGNMENTS)
    .where("clientId", "==", clientId)
    .where("scheduledFor", ">=", weekStart)
    .where("scheduledFor", "<=", weekEnd)
    .orderBy("scheduledFor", "asc")
    .get();

  return (snap.docs as unknown as Array<{
    id: string;
    data: () => Record<string, unknown>;
  }>).map(snapToRow);
}

// ─────────────────────────────────────────────────────────────────────────────
// listAssignmentsForTrainerDay — composite index #4 (trainerId, scheduledFor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns every assignment for the calling trainer on a single civil date.
 * Used by the per-day overview surface on the schedule view.
 *
 * Index: `(trainerId ASC, scheduledFor ASC)` from 04-01 (index #4).
 */
export async function listAssignmentsForTrainerDay(
  date: string,
): Promise<WorkoutAssignmentRow[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection(ASSIGNMENTS)
    .where("trainerId", "==", trainer.uid)
    .where("scheduledFor", "==", date)
    .orderBy("scheduledFor", "asc")
    .get();

  return (snap.docs as unknown as Array<{
    id: string;
    data: () => Record<string, unknown>;
  }>).map(snapToRow);
}
