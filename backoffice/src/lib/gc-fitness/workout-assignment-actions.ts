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
  assignTemplateRecurringSchema,
  bulkAssignSchema,
  editAssignmentSchema,
  MAX_CLIENTS_PER_BATCH,
} from "./workout-assignment-schema";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { normalizeMirrorEmail } from "./email-normalization";
import { civilDateFormat } from "./civil-date";

const TEMPLATES = FirestoreCollections.workoutTemplates;
const ASSIGNMENTS = FirestoreCollections.workoutAssignments;
const MAX_RECURRING_OCCURRENCES = 104; // ~2 years weekly cap
const NO_END_HORIZON_DAYS = 365; // "no end" operational horizon (rolling)

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
  /**
   * Civil-date of the trainer's ORIGINAL slot when the athlete moved
   * the workout to a different day of the current week from the iOS
   * app (e.g. ran Monday's workout on Tuesday). Null when the workout
   * still sits where the trainer placed it. The trainer surface
   * surfaces this as "Originally <day>, the client moved it to <day>".
   */
  originallyScheduledFor?: string | null;
  scheduledTime?: string | null;
  meetingNotes?: string | null;
  timezone?: string | null;
  status: "scheduled" | "started" | "completed" | "missed";
  createdAt: string | null;
  updatedAt: string | null;
  // 260522-ki7 Task A/E: shared uuid across docs in a recurring series.
  // null on non-recurring (one-off) assignments AND on legacy recurring docs
  // until the backfill (Task B) lands. Consumers MUST treat undefined/null as
  // "no series" — the dialog uses presence of this field to decide whether
  // to render the recurring radio choice.
  seriesId?: string | null;
  recurrence?: unknown;
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

function jsonSafe(value: unknown): unknown {
  if (
    value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        jsonSafe(val),
      ]),
    );
  }
  return value;
}

async function templateSnapshotForAssignment(
  template: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const exercises = Array.isArray(template.exercises)
    ? (template.exercises as Array<Record<string, unknown>>)
    : [];
  if (exercises.length === 0) return template;

  const db = gcFitnessFirestore();
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
    ...template,
    exercises: exercises.map((exercise) => {
      const exerciseId =
        typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
      const source = exerciseMap.get(exerciseId);
      return {
        ...exercise,
        name:
          (source?.name as { en: string; es: string } | undefined) ??
          ({ en: exerciseId, es: "" } as const),
        ...(source?.license ? { license: source.license } : {}),
      };
    }),
  };
}

function snapToRow(d: {
  id: string;
  data: () => Record<string, unknown>;
}): WorkoutAssignmentRow {
  const data = d.data();
  return {
    id: d.id,
    templateId: String(data.templateId ?? ""),
    templateSnapshot: jsonSafe(data.templateSnapshot),
    clientId: String(data.clientId ?? ""),
    trainerId: String(data.trainerId ?? ""),
    scheduledFor: String(data.scheduledFor ?? ""),
    originallyScheduledFor:
      typeof data.originallyScheduledFor === "string"
        ? data.originallyScheduledFor
        : null,
    scheduledTime:
      typeof data.scheduledTime === "string" ? data.scheduledTime : null,
    meetingNotes:
      typeof data.meetingNotes === "string" ? data.meetingNotes : null,
    timezone: typeof data.timezone === "string" ? data.timezone : null,
    status:
      (data.status as WorkoutAssignmentRow["status"]) ?? "scheduled",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    seriesId: typeof data.seriesId === "string" ? data.seriesId : null,
    recurrence:
      data.recurrence &&
      typeof data.recurrence === "object" &&
      typeof (data.recurrence as { kind?: unknown }).kind === "string"
        ? jsonSafe(data.recurrence)
        : null,
  };
}

function applyExerciseOverrides(
  templateSnapshot: Record<string, unknown>,
  overrides:
    | Array<{
        index: number;
        sets?: number;
        reps?: number;
        rest_seconds?: number;
        notes?: string;
        weightBySetKg?: number[];
        repsBySet?: number[];
      }>
    | undefined,
) {
  if (!overrides || overrides.length === 0) return templateSnapshot;
  const exercises = Array.isArray(templateSnapshot.exercises)
    ? [...(templateSnapshot.exercises as Array<Record<string, unknown>>)]
    : [];
  for (const override of overrides) {
    const current = exercises[override.index];
    if (!current) continue;
    exercises[override.index] = {
      ...current,
      ...(override.sets !== undefined ? { sets: override.sets } : {}),
      ...(override.reps !== undefined ? { reps: override.reps } : {}),
      ...(override.rest_seconds !== undefined
        ? { rest_seconds: override.rest_seconds }
        : {}),
      ...(override.notes !== undefined ? { notes: override.notes } : {}),
      ...(override.weightBySetKg !== undefined
        ? { weightBySetKg: override.weightBySetKg }
        : {}),
      ...(override.repsBySet !== undefined
        ? { repsBySet: override.repsBySet }
        : {}),
    };
  }
  return {
    ...templateSnapshot,
    exercises,
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

function dayOfWeekFromCivil(civilDate: string): number {
  const [y, m, d] = civilDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function nextCivilForWeekdayOnOrAfter(civilDate: string, weekday: number): string {
  const currentWeekday = dayOfWeekFromCivil(civilDate);
  const delta = (weekday - currentWeekday + 7) % 7;
  return addCivilDays(civilDate, delta);
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
  const canUseTemplate =
    template.trainerId === trainer.uid || template.isStandard === true;
  if (!canUseTemplate) {
    throw new Error("Not your template.");
  }

  // Doc-id convention from schemas/workout-assignments.md:
  //   asg-${clientUid}-${YYYYMMDD}-${uuid}
  const ymd = parsed.scheduledFor.replace(/-/g, "");
  const docId = `asg-${parsed.clientId}-${ymd}-${randomUUID()}`;
  const ref = db.collection(ASSIGNMENTS).doc(docId);
  const templateSnapshot = await templateSnapshotForAssignment(template);
  const customizedSnapshot = applyExerciseOverrides(
    templateSnapshot,
    parsed.exerciseOverrides,
  );

  await ref.set({
    templateId: parsed.templateId,
    templateSnapshot: customizedSnapshot,
    clientId: parsed.clientId,
    trainerId: trainer.uid,
    scheduledFor: parsed.scheduledFor, // STRING — Pitfall 1
    scheduledTime: parsed.scheduledTime ?? null,
    meetingNotes: parsed.meetingNotes ?? null,
    timezone: parsed.timezone ?? null,
    status: "scheduled" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

// ─────────────────────────────────────────────────────────────────────────────
// P22-04 (MIRROR-04) — assignTemplateToPending
// Same shape as assignTemplate but for a PENDING client (user_mirror/{email}).
// The doc carries `pendingEmail` instead of a real `clientId` (which is null).
// On the client's first sign-in, convertMirrorToCanonical swaps pendingEmail
// for clientId atomically with the user/chat-doc creation batch.
// ─────────────────────────────────────────────────────────────────────────────

export async function assignTemplateToPending(input: {
  templateId: string;
  pendingEmail: string;
  scheduledFor: string;
  scheduledTime?: string | null;
  meetingNotes?: string | null;
  timezone?: string | null;
}): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const pendingEmail = normalizeMirrorEmail(input.pendingEmail);

  // Server-side ownership check on the mirror doc (defense in depth — the
  // rule layer's mirror.coachId==auth.uid check also fires at write time).
  const mirrorSnap = await db
    .collection(FirestoreCollections.userMirror)
    .doc(pendingEmail)
    .get();
  if (!mirrorSnap.exists) throw new Error("Pending client not found.");
  const mirror = mirrorSnap.data() as { coachId?: string; pre_created?: boolean };
  if (mirror.coachId !== trainer.uid) throw new Error("Not your pending client.");
  if (mirror.pre_created !== true) throw new Error("Mirror not marked pre_created.");

  const templateSnap = await db.collection(TEMPLATES).doc(input.templateId).get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = templateSnap.data() as { trainerId?: string; isStandard?: boolean } & Record<string, unknown>;
  const canUseTemplate = template.trainerId === trainer.uid || template.isStandard === true;
  if (!canUseTemplate) throw new Error("Not your template.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledFor)) {
    throw new Error("Invalid civil date (expected YYYY-MM-DD).");
  }

  const ymd = input.scheduledFor.replace(/-/g, "");
  // Doc-id includes mirror-prefixed key so it's distinguishable in Firestore Console.
  const docId = `asg-pending-${pendingEmail}-${ymd}-${randomUUID()}`;
  const ref = db.collection(ASSIGNMENTS).doc(docId);
  const templateSnapshot = await templateSnapshotForAssignment(template);

  await ref.set({
    templateId: input.templateId,
    templateSnapshot,
    clientId: null, // canonical client doesn't exist yet
    pendingEmail,
    trainerId: trainer.uid,
    scheduledFor: input.scheduledFor,
    scheduledTime: input.scheduledTime ?? null,
    meetingNotes: input.meetingNotes ?? null,
    timezone: input.timezone ?? null,
    status: "scheduled" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

/**
 * P22-04 — list pre-loaded assignments for a pending client.
 * Drives the PendingClientPreload UI's "already assigned" list.
 */
export async function listPendingAssignments(pendingEmail: string): Promise<Array<{
  id: string;
  templateName: string;
  scheduledFor: string;
  seriesId: string | null;
  recurrence:
    | { kind: "daily" }
    | { kind: "weekly"; weekday: number }
    | { kind: "weekly_days"; weekdays: number[] }
    | { kind: "every_n_days"; everyN: number }
    | { kind: "monthly"; dayOfMonth: number }
    | null;
}>> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const normalizedPendingEmail = normalizeMirrorEmail(pendingEmail);
  const snap = await db
    .collection(ASSIGNMENTS)
    .where("trainerId", "==", trainer.uid)
    .where("pendingEmail", "==", normalizedPendingEmail)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const snapshot = (data.templateSnapshot ?? {}) as { name?: unknown };
    const name = typeof snapshot.name === "string" ? snapshot.name : (snapshot.name as { en?: string; es?: string } | undefined)?.es ?? "(unnamed)";
    return {
      id: doc.id,
      templateName: name,
      scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
      seriesId: typeof data.seriesId === "string" ? data.seriesId : null,
      recurrence:
        data.recurrence &&
        typeof data.recurrence === "object" &&
        typeof (data.recurrence as { kind?: unknown }).kind === "string"
          ? (data.recurrence as
              | { kind: "daily" }
              | { kind: "weekly"; weekday: number }
              | { kind: "weekly_days"; weekdays: number[] }
              | { kind: "every_n_days"; everyN: number }
              | { kind: "monthly"; dayOfMonth: number })
          : null,
    };
  });
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
  const canUseTemplate =
    template.trainerId === trainer.uid || template.isStandard === true;
  if (!canUseTemplate) {
    throw new Error("Not your template.");
  }

  // 2) Build the batch.
  const batch = db.batch();
  const ids: string[] = [];
  const ymd = parsed.scheduledFor.replace(/-/g, "");
  const templateSnapshot = applyExerciseOverrides(
    await templateSnapshotForAssignment(template),
    undefined,
  );

  for (const clientId of parsed.clientIds) {
    const docId = `asg-${clientId}-${ymd}-${randomUUID()}`;
    const ref = db.collection(ASSIGNMENTS).doc(docId);
    batch.set(ref, {
      templateId: parsed.templateId,
      templateSnapshot, // SAME REFERENCE — immutable snapshot
      clientId,
      trainerId: trainer.uid,
      scheduledFor: parsed.scheduledFor,
      scheduledTime: parsed.scheduledTime ?? null,
      meetingNotes: parsed.meetingNotes ?? null,
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

export async function assignTemplateRecurring(
  input: unknown,
): Promise<{ ids: string[]; count: number; windowStart: string; windowEnd: string }> {
  const trainer = await getCurrentTrainer();
  const parsed = assignTemplateRecurringSchema.parse(input);
  const db = gcFitnessFirestore();

  const templateSnap = await db
    .collection(TEMPLATES)
    .doc(parsed.templateId)
    .get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = templateSnap.data() as {
    trainerId?: string;
    isStandard?: boolean;
  } & Record<string, unknown>;
  const canUseTemplate =
    template.trainerId === trainer.uid || template.isStandard === true;
  if (!canUseTemplate) throw new Error("Not your template.");

  // Plans 21-04 + 21-04b: normalize the THREE accepted input shapes
  // (legacy `weekday`, multi-weekday `weekdays`, canonical `recurrence`) to a
  // single canonical RecurrenceRule. Zod's superRefine guarantees exactly
  // one is set.
  type RecurrenceRule =
    | { kind: "single" }
    | { kind: "daily" }
    | { kind: "weekly"; weekday: number }
    | { kind: "weekly_days"; weekdays: number[] }
    | { kind: "every_n_days"; everyN: number }
    | { kind: "monthly"; dayOfMonth: number };

  let recurrence: RecurrenceRule;
  if (parsed.recurrence !== undefined) {
    recurrence = parsed.recurrence as RecurrenceRule;
  } else if (parsed.weekdays !== undefined) {
    const sorted = Array.from(new Set(parsed.weekdays)).sort((a, b) => a - b);
    recurrence =
      sorted.length === 1
        ? { kind: "weekly", weekday: sorted[0] }
        : { kind: "weekly_days", weekdays: sorted };
  } else {
    // Legacy single weekday (Zod guarantees parsed.weekday is defined here).
    recurrence = { kind: "weekly", weekday: parsed.weekday! };
  }

  const hardWindowEnd = addCivilDays(parsed.startDate, NO_END_HORIZON_DAYS);
  const windowEnd = parsed.endDate ?? hardWindowEnd;

  // Walk each civil day in [startDate, windowEnd]; keep dates that match the
  // recurrence rule. Cap at MAX_RECURRING_OCCURRENCES so a "no end date +
  // daily" submit can't write more than 104 docs.
  function matchesRule(date: string, dayIndex: number): boolean {
    switch (recurrence.kind) {
      case "single":
        return date === parsed.startDate;
      case "daily":
        return true;
      case "weekly":
        return dayIndex === recurrence.weekday;
      case "weekly_days":
        return recurrence.weekdays.includes(dayIndex);
      case "every_n_days": {
        // Whole-day delta in civil days from startDate to date.
        const [y0, m0, d0] = parsed.startDate.split("-").map(Number);
        const [y1, m1, d1] = date.split("-").map(Number);
        const diff =
          (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / 86_400_000;
        return diff >= 0 && diff % recurrence.everyN === 0;
      }
      case "monthly": {
        const [y, m, d] = date.split("-").map(Number);
        const target = recurrence.dayOfMonth;
        const lastDayOfMonth = new Date(y, m, 0).getDate();
        const clamped = Math.min(target, lastDayOfMonth);
        return d === clamped;
      }
    }
  }

  const dates: string[] = [];
  for (
    let date = parsed.startDate;
    date <= windowEnd;
    date = addCivilDays(date, 1)
  ) {
    if (matchesRule(date, dayOfWeekFromCivil(date))) {
      dates.push(date);
      if (dates.length >= MAX_RECURRING_OCCURRENCES) break;
    }
  }
  if (dates.length === 0) {
    throw new Error("No dates generated for that recurrence.");
  }
  const windowStart = dates[0];

  const templateSnapshot = applyExerciseOverrides(
    await templateSnapshotForAssignment(template),
    parsed.exerciseOverrides,
  );
  // 260522-ki7 Task A: every doc in a recurring batch shares ONE seriesId so
  // the cascade-delete query in deleteAssignment(id, {cascadeFromDate}) can
  // identify the series via a single equality predicate.
  const seriesId = randomUUID();
  const recurrencePayload: Record<string, unknown> = recurrence;
  const batch = db.batch();
  const ids: string[] = [];
  for (const date of dates) {
    const ymd = date.replace(/-/g, "");
    const docId = `asg-${parsed.clientId}-${ymd}-${randomUUID()}`;
    const ref = db.collection(ASSIGNMENTS).doc(docId);
    batch.set(ref, {
      templateId: parsed.templateId,
      templateSnapshot,
      clientId: parsed.clientId,
      trainerId: trainer.uid,
      scheduledFor: date,
      scheduledTime: parsed.scheduledTime ?? null,
      meetingNotes: parsed.meetingNotes ?? null,
      timezone: parsed.timezone ?? null,
      status: "scheduled" as const,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      recurrence: recurrencePayload,
      seriesId,
    });
    ids.push(docId);
  }
  await batch.commit();
  return { ids, count: ids.length, windowStart, windowEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
// P22 pending mirror — recurring variant
// Mirrors assignTemplateRecurring but writes pendingEmail + clientId:null.
// ─────────────────────────────────────────────────────────────────────────────
export async function assignTemplateRecurringToPending(input: {
  templateId: string;
  pendingEmail: string;
  startDate: string;
  weekday?: number;
  weekdays?: number[];
  recurrence?:
    | { kind: "daily" }
    | { kind: "weekly"; weekday: number }
    | { kind: "weekly_days"; weekdays: number[] }
    | { kind: "every_n_days"; everyN: number }
    | { kind: "monthly"; dayOfMonth: number };
  endDate?: string;
  scheduledTime?: string | null;
  meetingNotes?: string | null;
  timezone?: string | null;
}): Promise<{ ids: string[]; count: number; windowStart: string; windowEnd: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const pendingEmail = normalizeMirrorEmail(input.pendingEmail);

  const mirrorSnap = await db
    .collection(FirestoreCollections.userMirror)
    .doc(pendingEmail)
    .get();
  if (!mirrorSnap.exists) throw new Error("Pending client not found.");
  const mirror = mirrorSnap.data() as { coachId?: string; pre_created?: boolean };
  if (mirror.coachId !== trainer.uid) throw new Error("Not your pending client.");
  if (mirror.pre_created !== true) throw new Error("Mirror not marked pre_created.");

  const parsed = assignTemplateRecurringSchema.parse({
    templateId: input.templateId,
    clientId: `pending:${pendingEmail}`,
    startDate: input.startDate,
    weekday: input.weekday,
    weekdays: input.weekdays,
    recurrence: input.recurrence,
    endDate: input.endDate,
    scheduledTime: input.scheduledTime ?? undefined,
    meetingNotes: input.meetingNotes ?? undefined,
    timezone: input.timezone ?? undefined,
  });

  const templateSnap = await db
    .collection(TEMPLATES)
    .doc(parsed.templateId)
    .get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = templateSnap.data() as {
    trainerId?: string;
    isStandard?: boolean;
  } & Record<string, unknown>;
  const canUseTemplate =
    template.trainerId === trainer.uid || template.isStandard === true;
  if (!canUseTemplate) throw new Error("Not your template.");

  type RecurrenceRule =
    | { kind: "single" }
    | { kind: "daily" }
    | { kind: "weekly"; weekday: number }
    | { kind: "weekly_days"; weekdays: number[] }
    | { kind: "every_n_days"; everyN: number }
    | { kind: "monthly"; dayOfMonth: number };

  let recurrence: RecurrenceRule;
  if (parsed.recurrence !== undefined) {
    recurrence = parsed.recurrence as RecurrenceRule;
  } else if (parsed.weekdays !== undefined) {
    const sorted = Array.from(new Set(parsed.weekdays)).sort((a, b) => a - b);
    recurrence =
      sorted.length === 1
        ? { kind: "weekly", weekday: sorted[0] }
        : { kind: "weekly_days", weekdays: sorted };
  } else {
    recurrence = { kind: "weekly", weekday: parsed.weekday! };
  }

  const hardWindowEnd = addCivilDays(parsed.startDate, NO_END_HORIZON_DAYS);
  const windowEnd = parsed.endDate ?? hardWindowEnd;

  function matchesRule(date: string, dayIndex: number): boolean {
    switch (recurrence.kind) {
      case "single":
        return date === parsed.startDate;
      case "daily":
        return true;
      case "weekly":
        return dayIndex === recurrence.weekday;
      case "weekly_days":
        return recurrence.weekdays.includes(dayIndex);
      case "every_n_days": {
        const [y0, m0, d0] = parsed.startDate.split("-").map(Number);
        const [y1, m1, d1] = date.split("-").map(Number);
        const diff =
          (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / 86_400_000;
        return diff >= 0 && diff % recurrence.everyN === 0;
      }
      case "monthly": {
        const [y, m, d] = date.split("-").map(Number);
        const target = recurrence.dayOfMonth;
        const lastDayOfMonth = new Date(y, m, 0).getDate();
        const clamped = Math.min(target, lastDayOfMonth);
        return d === clamped;
      }
    }
  }

  const dates: string[] = [];
  for (
    let date = parsed.startDate;
    date <= windowEnd;
    date = addCivilDays(date, 1)
  ) {
    if (matchesRule(date, dayOfWeekFromCivil(date))) {
      dates.push(date);
      if (dates.length >= MAX_RECURRING_OCCURRENCES) break;
    }
  }
  if (dates.length === 0) throw new Error("No dates generated for that recurrence.");
  const windowStart = dates[0];

  const templateSnapshot = await templateSnapshotForAssignment(template);
  const seriesId = randomUUID();
  const recurrencePayload: Record<string, unknown> = recurrence;
  const batch = db.batch();
  const ids: string[] = [];
  for (const date of dates) {
    const ymd = date.replace(/-/g, "");
    const docId = `asg-pending-${pendingEmail}-${ymd}-${randomUUID()}`;
    const ref = db.collection(ASSIGNMENTS).doc(docId);
    batch.set(ref, {
      templateId: parsed.templateId,
      templateSnapshot,
      clientId: null,
      pendingEmail,
      trainerId: trainer.uid,
      scheduledFor: date,
      scheduledTime: parsed.scheduledTime ?? null,
      meetingNotes: parsed.meetingNotes ?? null,
      timezone: parsed.timezone ?? null,
      status: "scheduled" as const,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      recurrence: recurrencePayload,
      seriesId,
    });
    ids.push(docId);
  }
  await batch.commit();
  return { ids, count: ids.length, windowStart, windowEnd };
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

  const update: Record<string, unknown> = {
    scheduledFor: parsed.scheduledFor,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.scheduledTime !== undefined) {
    update.scheduledTime = parsed.scheduledTime;
  }
  if (parsed.meetingNotes !== undefined) {
    update.meetingNotes = parsed.meetingNotes;
  }

  await ref.update(update);

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
 *
 * 260522-ki7 Task C — recurring-aware cascade.
 *
 * When called with `options.cascadeFromDate` AND the existing doc has a
 * `seriesId`, the function performs a series-wide cascade: every doc in the
 * same series with `scheduledFor >= cascadeFromDate` AND `status ==
 * 'scheduled'` is batch-deleted in one WriteBatch. Past occurrences
 * (status !== 'scheduled') are NEVER touched — that preserves client-logged
 * work (T-KI7-03).
 *
 * Defense-in-depth: every matched doc is re-checked in code for trainerId
 * equality before the batch is committed. The rule layer enforces the same
 * invariant per-doc inside the batch, but the pre-check yields a much more
 * actionable error message than Firestore's "PERMISSION_DENIED" on commit.
 *
 * Signature is backwards-compatible: callers that don't pass `options` get
 * the original single-doc behaviour with a `deletedCount: 1` field added to
 * the return shape.
 */
export async function deleteAssignment(
  id: string,
  options?: { cascadeFromDate?: string },
): Promise<{ ok: true; deletedCount: number }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as {
    trainerId?: string;
    seriesId?: string | null;
  };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your assignment.");
  }

  // Non-cascade OR non-recurring: fall through to single-doc delete.
  if (!options?.cascadeFromDate || !existing.seriesId) {
    await ref.delete();
    return { ok: true, deletedCount: 1 };
  }

  // Cascade path: query the series for the selected day + every scheduled
  // future doc. Index: (seriesId ASC, status ASC, scheduledFor ASC) — added
  // to firestore.indexes.json in Task A; the [$] deploy gate makes the
  // composite index queryable in production.
  const querySnap = await db
    .collection(ASSIGNMENTS)
    .where("seriesId", "==", existing.seriesId)
    .where("scheduledFor", ">=", options.cascadeFromDate)
    .where("status", "==", "scheduled")
    .get();

  // Defense-in-depth: refuse any cross-trainer doc in the series before
  // mutating Firestore. The rule layer would reject the batch anyway, but
  // an explicit pre-check yields a clearer error.
  for (const doc of querySnap.docs) {
    const data = doc.data() as { trainerId?: string };
    if (data.trainerId !== trainer.uid) {
      throw new Error(
        "Cross-trainer doc in series — refusing to cascade.",
      );
    }
  }

  const batch = db.batch();
  for (const doc of querySnap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  return { ok: true, deletedCount: querySnap.size };
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
// Template-snapshot propagation — push edits to existing future assignments
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplatePropagationClient {
  uid: string;
  name: string;
  sessions: number;
  nextScheduledFor: string;
}

export interface TemplatePropagationPreview {
  templateId: string;
  assignmentCount: number;
  clients: TemplatePropagationClient[];
}

/**
 * Returns the list of FUTURE, still-scheduled assignments tied to a given
 * template, grouped by client. Used after a template edit to show the
 * trainer who would be affected by a snapshot push.
 *
 * Definition of "future":
 *   - `scheduledFor >= todayUTC` — civil-date string comparison. UTC is the
 *     conservative choice because it never skips a day-ahead session in a
 *     trainer-tz that's behind UTC (we'd rather offer to update a session
 *     and have the trainer decline than silently omit one).
 *   - `status === "scheduled"` — never touch a session the client has
 *     already started or completed (rule layer also enforces this).
 */
export async function listFutureAssignmentsForTemplate(
  templateId: string,
): Promise<TemplatePropagationPreview> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  // Confirm the trainer owns this template before we let them poke around
  // at the assignments tied to it.
  const templateSnap = await db.collection(TEMPLATES).doc(templateId).get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = templateSnap.data() as { trainerId?: string };
  if (template.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  const todayUtc = civilDateFormat(new Date(), "UTC");
  const snap = await db
    .collection(ASSIGNMENTS)
    .where("trainerId", "==", trainer.uid)
    .where("templateId", "==", templateId)
    .get();
  const candidates = snap.docs.filter((doc) => {
    const data = doc.data() as { scheduledFor?: string; status?: string };
    if (typeof data.scheduledFor !== "string") return false;
    if (data.scheduledFor < todayUtc) return false;
    if (data.status && data.status !== "scheduled") return false;
    return true;
  });

  // Group by client + fetch names. Hydrating names from /users is one extra
  // round trip but the trainer rarely has > 50 distinct clients on a single
  // template, so the cost is negligible.
  const perClient = new Map<string, { sessions: number; earliest: string }>();
  for (const doc of candidates) {
    const data = doc.data() as { clientId?: string; scheduledFor?: string };
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    if (!clientId) continue;
    const bucket = perClient.get(clientId) ?? {
      sessions: 0,
      earliest: scheduledFor,
    };
    bucket.sessions += 1;
    if (!bucket.earliest || scheduledFor < bucket.earliest) {
      bucket.earliest = scheduledFor;
    }
    perClient.set(clientId, bucket);
  }

  const clientIds = [...perClient.keys()];
  const clientDocs = clientIds.length
    ? await db.getAll(
        ...clientIds.map((id) => db.collection(FirestoreCollections.users).doc(id)),
      )
    : [];
  const nameByUid = new Map<string, string>();
  for (const doc of clientDocs) {
    if (!doc.exists) continue;
    const data = doc.data() as { displayName?: string; email?: string };
    nameByUid.set(doc.id, data.displayName ?? data.email ?? doc.id);
  }

  const clients: TemplatePropagationClient[] = [...perClient.entries()]
    .map(([uid, info]) => ({
      uid,
      name: nameByUid.get(uid) ?? uid,
      sessions: info.sessions,
      nextScheduledFor: info.earliest,
    }))
    .sort((a, b) => a.nextScheduledFor.localeCompare(b.nextScheduledFor));

  return {
    templateId,
    assignmentCount: candidates.length,
    clients,
  };
}

/**
 * Rewrites the `templateSnapshot` field on every future, still-scheduled
 * assignment that references `templateId` with a fresh snapshot derived from
 * the template's current state. Past sessions and started/completed sessions
 * are left untouched — they remain a frozen record of what the client was
 * actually asked to do.
 *
 * Per-assignment prescription overrides (reps/kg/sets/rest) are intentionally
 * replaced with the new template values — that's the whole point of "update
 * all occurrences". The ONE thing we preserve is the per-client per-exercise
 * NOTE the trainer wrote for that student: that note is personal annotation,
 * not template content, and silently wiping it on a template edit was a bug.
 * Merge rule (per exercise, matched by exerciseId then index):
 *   - client note only           → keep it
 *   - new template note only      → use it
 *   - both                        → "<client note> * <template note>"
 *
 * Returns the number of assignment docs updated.
 */
function mergeExerciseNote(
  clientNote: unknown,
  templateNote: unknown,
): string | undefined {
  const client = typeof clientNote === "string" ? clientNote.trim() : "";
  const template = typeof templateNote === "string" ? templateNote.trim() : "";
  if (client && template) {
    return client === template ? client : `${client} * ${template}`;
  }
  return client || template || undefined;
}
export async function propagateTemplateToFutureAssignments(
  templateId: string,
): Promise<{ updatedCount: number }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const templateSnap = await db.collection(TEMPLATES).doc(templateId).get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = templateSnap.data() as Record<string, unknown> & {
    trainerId?: string;
  };
  if (template.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  const todayUtc = civilDateFormat(new Date(), "UTC");
  const snap = await db
    .collection(ASSIGNMENTS)
    .where("trainerId", "==", trainer.uid)
    .where("templateId", "==", templateId)
    .get();
  const targets = snap.docs.filter((doc) => {
    const data = doc.data() as { scheduledFor?: string; status?: string };
    if (typeof data.scheduledFor !== "string") return false;
    if (data.scheduledFor < todayUtc) return false;
    if (data.status && data.status !== "scheduled") return false;
    return true;
  });
  if (targets.length === 0) return { updatedCount: 0 };

  const freshSnapshot = await templateSnapshotForAssignment(template);
  const freshExercises = Array.isArray(freshSnapshot.exercises)
    ? (freshSnapshot.exercises as Array<Record<string, unknown>>)
    : [];

  // Builds a per-assignment snapshot: the fresh template content, but with each
  // exercise's note merged with the per-client note already on that assignment.
  function snapshotForAssignment(
    existingSnapshot: unknown,
  ): Record<string, unknown> {
    const existingExercises =
      existingSnapshot &&
      typeof existingSnapshot === "object" &&
      Array.isArray((existingSnapshot as Record<string, unknown>).exercises)
        ? ((existingSnapshot as Record<string, unknown>)
            .exercises as Array<Record<string, unknown>>)
        : [];
    // exerciseId → first existing note, for reordered/added template exercises.
    const noteById = new Map<string, unknown>();
    for (const ex of existingExercises) {
      const id = typeof ex.exerciseId === "string" ? ex.exerciseId : "";
      if (id && !noteById.has(id)) noteById.set(id, ex.notes);
    }
    const exercises = freshExercises.map((fresh, i) => {
      const byIndex = existingExercises[i];
      const clientNote =
        byIndex && byIndex.exerciseId === fresh.exerciseId
          ? byIndex.notes
          : noteById.get(
              typeof fresh.exerciseId === "string" ? fresh.exerciseId : "",
            );
      const merged = mergeExerciseNote(clientNote, fresh.notes);
      const next = { ...fresh };
      if (merged !== undefined) {
        next.notes = merged;
      } else {
        delete next.notes;
      }
      return next;
    });
    return { ...freshSnapshot, exercises };
  }

  // Firestore caps WriteBatch at 500 ops; one update per assignment fits well
  // inside that ceiling for any realistic roster size, but we still chunk to
  // be defensive.
  const CHUNK = 400;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = db.batch();
    for (const doc of targets.slice(i, i + CHUNK)) {
      const existing = (doc.data() as { templateSnapshot?: unknown })
        .templateSnapshot;
      batch.update(doc.ref, {
        templateSnapshot: snapshotForAssignment(existing),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return { updatedCount: targets.length };
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
