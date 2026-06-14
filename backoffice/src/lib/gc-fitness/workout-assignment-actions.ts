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

import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { coachVisibleClientName } from "./client-name";
import { resolveExerciseDocsById } from "./exercise-resolution";

import {
  assignTemplateSchema,
  assignTemplateRecurringSchema,
  bulkAssignSchema,
  editAssignmentSchema,
  recurrenceSchema,
  CIVIL_DATE_REGEX,
  MAX_CLIENTS_PER_BATCH,
  MAX_OPS_PER_BATCH,
  OPS_PER_ASSIGNMENT,
} from "./workout-assignment-schema";
import { getCurrentTrainer } from "./auth-helpers";
import {
  changedWeightExerciseIds,
  exercisesOf,
} from "./weight-diff";
import {
  recordCoachActivityEvent,
  markCoachActivityDeleted,
  singleAssignmentEvent,
  seriesAssignmentEvent,
} from "./coach-activity-log";
import { FirestoreCollections } from "./collections";
import { normalizeMirrorEmail } from "./email-normalization";
import { civilDateFormat } from "./civil-date";
import { getTrainerTimezone } from "./trainer-timezone";

const TEMPLATES = FirestoreCollections.workoutTemplates;
const ASSIGNMENTS = FirestoreCollections.workoutAssignments;
const LOGS = FirestoreCollections.workoutLogs;
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
  const exerciseMap: Map<string, Record<string, unknown>> =
    exerciseIds.length > 0 ? await resolveExerciseDocsById(db, exerciseIds) : new Map();

  return {
    ...template,
    exercises: exercises.map((exercise) => {
      const exerciseId =
        typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
      const source = exerciseMap.get(exerciseId);
      const transitionRestSecondsRaw =
        exercise.transition_rest_seconds ?? exercise.transitionRestSeconds;
      const transitionRestSeconds =
        typeof transitionRestSecondsRaw === "number" &&
        Number.isFinite(transitionRestSecondsRaw)
          ? Math.max(0, Math.min(600, transitionRestSecondsRaw))
          : 60;
      return {
        ...exercise,
        transition_rest_seconds: transitionRestSeconds,
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
        transition_rest_seconds?: number;
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
      ...(override.transition_rest_seconds !== undefined
        ? { transition_rest_seconds: override.transition_rest_seconds }
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

function normalizeEditedWeights(opts: {
  raw: unknown;
  setCount: number;
  noWeight: boolean;
  fallbackCount?: number;
}): number[] {
  if (opts.noWeight) return [];
  const raw = Array.isArray(opts.raw) ? opts.raw : [];
  const length = Math.max(
    1,
    Math.min(10, opts.setCount || opts.fallbackCount || raw.length || 1),
  );
  return Array.from({ length }, (_, i) => {
    const n = raw[i];
    return typeof n === "number" && Number.isFinite(n)
      ? Math.max(0, Math.min(500, n))
      : 0;
  });
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
// Shared recurrence date-expansion (single + bulk call sites)
// ─────────────────────────────────────────────────────────────────────────────
//
// 260612-e9t (#175): `assignTemplateRecurring` and `bulkAssignTemplate` must
// expand a `RecurrenceRule` into the SAME set of civil dates for the SAME
// startDate/endDate — otherwise the two surfaces would silently drift. The
// matcher + civil-day walk below is the SINGLE source of truth; both client
// call sites invoke `expandRecurrenceDates`. (The inline matcher inside
// `assignTemplateRecurring*ToPending` is a separate pending-mirror path; this
// shared helper covers the canonical client paths.)

type ExpandableRecurrence =
  | { kind: "single" }
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number }
  | { kind: "weekly_days"; weekdays: number[] }
  | { kind: "every_n_days"; everyN: number }
  | { kind: "monthly"; dayOfMonth: number };

/** True when `date` (a civil-date string) matches `recurrence` anchored at `startDate`. */
function matchesRecurrence(
  recurrence: ExpandableRecurrence,
  startDate: string,
  date: string,
  dayIndex: number,
): boolean {
  switch (recurrence.kind) {
    case "single":
      return date === startDate;
    case "daily":
      return true;
    case "weekly":
      return dayIndex === recurrence.weekday;
    case "weekly_days":
      return recurrence.weekdays.includes(dayIndex);
    case "every_n_days": {
      const [y0, m0, d0] = startDate.split("-").map(Number);
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

/**
 * Expand a recurrence rule into the matching civil dates in
 * `[startDate, endDate ?? startDate + NO_END_HORIZON_DAYS]`, capped at
 * `MAX_RECURRING_OCCURRENCES`. Returns the dates in ascending order.
 */
function expandRecurrenceDates(
  recurrence: ExpandableRecurrence,
  startDate: string,
  endDate?: string,
): string[] {
  const hardWindowEnd = addCivilDays(startDate, NO_END_HORIZON_DAYS);
  const windowEnd = endDate ?? hardWindowEnd;
  const dates: string[] = [];
  for (let date = startDate; date <= windowEnd; date = addCivilDays(date, 1)) {
    if (
      matchesRecurrence(recurrence, startDate, date, dayOfWeekFromCivil(date))
    ) {
      dates.push(date);
      if (dates.length >= MAX_RECURRING_OCCURRENCES) break;
    }
  }
  return dates;
}

/**
 * Hard ceiling on total docs a single bulk-recurring submit may write
 * (clients × dates). Mirrors the spirit of MAX_RECURRING_OCCURRENCES (the
 * per-client cap) for the multi-client fan-out. 166 clients × 12 weekly
 * occurrences ≈ 2000 docs is comfortably under this; an "absurd" submit
 * (166 × daily-for-a-year capped at 104 = 17264) is rejected BEFORE any
 * commit so we never half-write a series. Chosen as a sane operational
 * ceiling, not a Firestore limit.
 */
const MAX_TOTAL_BULK_RECURRING_DOCS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// Per-exercise weight-prefill freshness anchor (prescriptionUpdatedAtByExerciseId)
// ─────────────────────────────────────────────────────────────────────────────
//
// simplify-weight-prefill: instead of bumping the doc-level
// `prescriptionUpdatedAt` (which resets the WHOLE workout for the client), we
// stamp ONLY the exerciseIds whose weights actually changed into the
// `prescriptionUpdatedAtByExerciseId` map. The resolver reads, per exercise,
// `prescriptionUpdatedAtByExerciseId[exId] ?? prescriptionUpdatedAt ?? createdAt`.
//
// We write each entry via a dotted field-path key (`prescriptionUpdatedAtByExerciseId.<exId>`)
// so an update touches only that entry, not the whole map. exerciseIds are slugs
// like "wger-123" (no dots/spaces), but Firestore field paths treat `.` `~` `/`
// `*` `[` `]` specially, so we GUARD: any id with one of those characters is
// merged via a read-modify-write of the whole map instead of a dotted path.

/** Firestore field-path-unsafe characters: `.` `~` `/` `*` `[` `]`. */
const UNSAFE_FIELD_PATH_RE = /[.~/*[\]]/;

/**
 * Build a Firestore update object that stamps `serverTimestamp()` for each
 * changed exerciseId into `prescriptionUpdatedAtByExerciseId`. Safe ids use a
 * dotted field-path key (single-entry merge); any id containing a field-path
 * special char falls back to merging the whole map (read from `existingMap`).
 * Returns `{}` when there are no changed ids (caller must not touch the map).
 */
function buildPerExerciseStampUpdate(
  changedIds: string[],
  existingMap: unknown,
): Record<string, unknown> {
  if (changedIds.length === 0) return {};
  const safe: string[] = [];
  const unsafe: string[] = [];
  for (const id of changedIds) {
    (UNSAFE_FIELD_PATH_RE.test(id) ? unsafe : safe).push(id);
  }
  const update: Record<string, unknown> = {};
  for (const id of safe) {
    update[`prescriptionUpdatedAtByExerciseId.${id}`] =
      FieldValue.serverTimestamp();
  }
  if (unsafe.length > 0) {
    // Merge the whole map (preserve existing entries) for the rare unsafe id.
    const merged: Record<string, unknown> =
      existingMap && typeof existingMap === "object"
        ? { ...(existingMap as Record<string, unknown>) }
        : {};
    for (const id of unsafe) merged[id] = FieldValue.serverTimestamp();
    update.prescriptionUpdatedAtByExerciseId = merged;
  }
  return update;
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
    // The coach is establishing the prescription right now — stamp it so the
    // shared weight-prefill rule can detect future plan changes (see
    // weight-prefill.ts / WeightPrefillResolver.swift).
    prescriptionUpdatedAt: FieldValue.serverTimestamp(),
  });

  await recordCoachActivityEvent(
    db,
    singleAssignmentEvent({
      trainerId: trainer.uid,
      assignmentId: docId,
      templateName: (customizedSnapshot as { name?: unknown }).name,
      clientId: parsed.clientId,
      pendingEmail: null,
      scheduledFor: parsed.scheduledFor,
    }),
  );

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
    // Prescription established now — weight-prefill freshness anchor.
    prescriptionUpdatedAt: FieldValue.serverTimestamp(),
  });

  await recordCoachActivityEvent(
    db,
    singleAssignmentEvent({
      trainerId: trainer.uid,
      assignmentId: docId,
      templateName: (templateSnapshot as { name?: unknown }).name,
      clientId: null,
      pendingEmail,
      scheduledFor: input.scheduledFor,
    }),
  );

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

  const templateSnapshot = applyExerciseOverrides(
    await templateSnapshotForAssignment(template),
    undefined,
  );

  // 260612-e9t (#175): decide single-date vs recurring expansion. A
  // `{kind:"single"}` rule (or no recurrence) keeps the byte-identical
  // single-date behavior; any other rule expands dates per the SHARED
  // `expandRecurrenceDates` helper (same matcher assignTemplateRecurring uses).
  const recurrence = parsed.recurrence as ExpandableRecurrence | undefined;
  const isRecurring =
    recurrence !== undefined && recurrence.kind !== "single";

  if (!isRecurring) {
    // ── No-recurrence path: ONE doc per client on parsed.scheduledFor in a
    // single atomic WriteBatch (byte-identical to the pre-260612 behavior:
    // same doc shape, singleAssignmentEvent per client, no seriesId/recurrence).
    const batch = db.batch();
    const ids: string[] = [];
    const ymd = parsed.scheduledFor.replace(/-/g, "");

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
        // Prescription established now — weight-prefill freshness anchor.
        prescriptionUpdatedAt: FieldValue.serverTimestamp(),
      });
      ids.push(docId);
    }

    // Atomic commit — throws on permission denial, network error, or rule
    // violation. The verbatim error message bubbles up to the trainer toast
    // (Pitfall 5 — no silent partial-success messaging). UID lists are never
    // included in the error (T-04-24 — count + verbatim error string only).
    await batch.commit();

    await Promise.all(
      parsed.clientIds.map((clientId, i) =>
        recordCoachActivityEvent(
          db,
          singleAssignmentEvent({
            trainerId: trainer.uid,
            assignmentId: ids[i],
            templateName: (templateSnapshot as { name?: unknown }).name,
            clientId,
            pendingEmail: null,
            scheduledFor: parsed.scheduledFor,
          }),
        ),
      ),
    );

    return { ids };
  }

  // ── Recurring path ──────────────────────────────────────────────────────
  // Expand dates ONCE (same for every client — they all share scheduledFor as
  // the anchor) then write one doc per (client × date). Each CLIENT gets its
  // OWN seriesId so cascade-delete / series-edit scope a single client's series.
  const dates = expandRecurrenceDates(
    recurrence,
    parsed.scheduledFor,
    parsed.endDate,
  );
  if (dates.length === 0) {
    throw new Error("No dates generated for that recurrence.");
  }

  // Total-ops guard: reject an absurd submit BEFORE any commit so we never
  // half-write a series across chunked batches (no all-or-nothing per-chunk
  // rollback). clients × dates is the doc count. The error is verbatim and
  // carries NO UID list (T-04-24).
  const totalDocs = parsed.clientIds.length * dates.length;
  if (totalDocs > MAX_TOTAL_BULK_RECURRING_DOCS) {
    throw new Error(
      `This recurring bulk-assign would write ${totalDocs} sessions, ` +
        `which exceeds the ${MAX_TOTAL_BULK_RECURRING_DOCS} limit. ` +
        `Reduce the client count, the date range, or the frequency.`,
    );
  }

  const recurrencePayload: Record<string, unknown> = recurrence;
  // Pre-generate a per-client seriesId so the coach_activity events (recorded
  // AFTER all commits succeed) reference the same series each client's docs
  // carry.
  const seriesIdByClient = new Map<string, string>(
    parsed.clientIds.map((clientId) => [clientId, randomUUID()]),
  );

  // Chunk writes across batches: Firestore caps a batch at 500 ops and each
  // assignment write costs OPS_PER_ASSIGNMENT(3), so flush every
  // floor(500/3)=166 SET ops. We accumulate (client × date) docs in submit
  // order and commit a batch whenever it fills.
  const SETS_PER_BATCH = Math.floor(MAX_OPS_PER_BATCH / OPS_PER_ASSIGNMENT); // 166
  const idsByClient = new Map<string, string[]>(
    parsed.clientIds.map((clientId) => [clientId, []]),
  );
  const allIds: string[] = [];

  let batch = db.batch();
  let opsInBatch = 0;
  for (const clientId of parsed.clientIds) {
    const seriesId = seriesIdByClient.get(clientId)!;
    for (const date of dates) {
      const ymd = date.replace(/-/g, "");
      const docId = `asg-${clientId}-${ymd}-${randomUUID()}`;
      const ref = db.collection(ASSIGNMENTS).doc(docId);
      batch.set(ref, {
        templateId: parsed.templateId,
        templateSnapshot, // SAME REFERENCE — immutable snapshot
        clientId,
        trainerId: trainer.uid,
        scheduledFor: date,
        scheduledTime: parsed.scheduledTime ?? null,
        meetingNotes: parsed.meetingNotes ?? null,
        timezone: parsed.timezone ?? null,
        status: "scheduled" as const,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        // Prescription established now — weight-prefill freshness anchor.
        prescriptionUpdatedAt: FieldValue.serverTimestamp(),
        recurrence: recurrencePayload,
        seriesId,
      });
      idsByClient.get(clientId)!.push(docId);
      allIds.push(docId);
      opsInBatch += 1;
      if (opsInBatch >= SETS_PER_BATCH) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  // Record ONE seriesAssignmentEvent per client AFTER all commits succeed
  // (mirrors assignTemplateRecurring + the single-path post-commit Promise.all).
  await Promise.all(
    parsed.clientIds.map((clientId) =>
      recordCoachActivityEvent(
        db,
        seriesAssignmentEvent({
          trainerId: trainer.uid,
          seriesId: seriesIdByClient.get(clientId)!,
          templateName: (templateSnapshot as { name?: unknown }).name,
          clientId,
          pendingEmail: null,
          recurrence: recurrencePayload,
          dates,
        }),
      ),
    ),
  );

  return { ids: allIds };
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

  // 260612-e9t (#175): date expansion now flows through the SHARED
  // `expandRecurrenceDates` helper (single source of truth with
  // bulkAssignTemplate). Same window cap + MAX_RECURRING_OCCURRENCES behavior.
  const dates = expandRecurrenceDates(
    recurrence,
    parsed.startDate,
    parsed.endDate,
  );
  if (dates.length === 0) {
    throw new Error("No dates generated for that recurrence.");
  }
  const windowStart = dates[0];
  const windowEnd =
    parsed.endDate ?? addCivilDays(parsed.startDate, NO_END_HORIZON_DAYS);

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
      // Prescription established now — weight-prefill freshness anchor.
      prescriptionUpdatedAt: FieldValue.serverTimestamp(),
      recurrence: recurrencePayload,
      seriesId,
    });
    ids.push(docId);
  }
  await batch.commit();

  await recordCoachActivityEvent(
    db,
    seriesAssignmentEvent({
      trainerId: trainer.uid,
      seriesId,
      templateName: (templateSnapshot as { name?: unknown }).name,
      clientId: parsed.clientId,
      pendingEmail: null,
      recurrence: recurrencePayload,
      dates,
    }),
  );

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
      // Prescription established now — weight-prefill freshness anchor.
      prescriptionUpdatedAt: FieldValue.serverTimestamp(),
      recurrence: recurrencePayload,
      seriesId,
    });
    ids.push(docId);
  }
  await batch.commit();

  await recordCoachActivityEvent(
    db,
    seriesAssignmentEvent({
      trainerId: trainer.uid,
      seriesId,
      templateName: (templateSnapshot as { name?: unknown }).name,
      clientId: null,
      pendingEmail,
      recurrence: recurrencePayload,
      dates,
    }),
  );

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
    // Cascade the delete to the workout log(s) this assignment produced, so a
    // completed/started workout the coach removes ALSO disappears from Recent
    // Logs and stops driving a calendar chip (it would otherwise orphan — the
    // "I keep seeing deleted workouts" bug). Only the single-doc path needs
    // this: the recurrence cascade below only deletes `scheduled` future docs,
    // which never have logs.
    await deleteWorkoutLogsForAssignment(db, trainer.uid, id);
    // A true single (no series) → surface the deletion in My Activity. Deleting
    // ONE occurrence of a series (seriesId set, no cascade) must NOT mark the
    // whole series deleted, so only act when there's no seriesId.
    if (!existing.seriesId) {
      await markCoachActivityDeleted(db, `asg:${id}`);
    }
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

  // Series-wide cascade from the series start removes the whole assignment →
  // mark the series event deleted so it shows as "eliminado" in My Activity.
  await markCoachActivityDeleted(db, `asg:${existing.seriesId}`);

  return { ok: true, deletedCount: querySnap.size };
}

/**
 * Deletes every workout_log produced by a given assignment. Called from the
 * single-doc delete path so removing a workout also removes its logged
 * actuals (cascade). The log FK is `assignment_id` (snake-case) on the iOS
 * wire; `assignmentId` (camel) is a legacy fallback — we query BOTH and dedupe
 * so no log is missed regardless of which field it carries. Trainer-ownership
 * is re-checked per doc (defense-in-depth; the rule layer enforces it too).
 * No-op when the assignment produced no logs (the common scheduled case).
 */
async function deleteWorkoutLogsForAssignment(
  db: FirebaseFirestore.Firestore,
  trainerUid: string,
  assignmentId: string,
): Promise<void> {
  if (!assignmentId) return;
  const [snakeSnap, camelSnap] = await Promise.all([
    db.collection(LOGS).where("assignment_id", "==", assignmentId).get(),
    db.collection(LOGS).where("assignmentId", "==", assignmentId).get(),
  ]);
  const refById = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of [...snakeSnap.docs, ...camelSnap.docs]) {
    if ((doc.data() as { trainerId?: string }).trainerId !== trainerUid) {
      continue;
    }
    refById.set(doc.id, doc.ref);
  }
  if (refById.size === 0) return;
  const batch = db.batch();
  for (const ref of refById.values()) batch.delete(ref);
  await batch.commit();
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

  const todayUtc = civilDateFormat(new Date(), await getTrainerTimezone());
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
    const data = doc.data() as {
      displayName?: string;
      email?: string;
      coachNickname?: string;
    };
    nameByUid.set(
      doc.id,
      coachVisibleClientName({
        uid: doc.id,
        displayName: data.displayName ?? data.email ?? doc.id,
        email: data.email ?? "",
        coachNickname: data.coachNickname ?? null,
      }),
    );
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
 * Notes/structure (reps/sets/rest/order/etc.) always flow through from the
 * template. WEIGHTS are governed by the `pushWeights` option:
 *   - pushWeights === false (DEFAULT): each assignment KEEPS its existing
 *     per-exercise `weightBySetKg` (matched by exerciseId); new exercises with
 *     no prior match take the template's weights. The `prescriptionUpdatedAt`
 *     freshness anchor is NOT bumped — clients keep their own weights, no
 *     "coach updated" alert.
 *   - pushWeights === true: weights are replaced from the template too, and the
 *     anchor is bumped — BUT only for assignments where a weight genuinely
 *     changed vs the prior snapshot (avoid spuriously alerting clients whose
 *     weights already match).
 *
 * The per-client per-exercise NOTE the trainer wrote for that student is always
 * preserved (personal annotation, not template content). Merge rule (per
 * exercise, matched by exerciseId then index):
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
  options?: { pushWeights?: boolean },
): Promise<{ updatedCount: number }> {
  // pushWeights defaults to FALSE: notes/structure/reps/rest flow through, but
  // each client KEEPS their own per-exercise weights and the freshness anchor
  // is left alone. Opting in (true) replaces weights from the template AND
  // bumps the anchor — but only for assignments whose weights genuinely
  // changed, so identical-weight clients aren't spuriously alerted.
  const pushWeights = options?.pushWeights === true;
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

  const todayUtc = civilDateFormat(new Date(), await getTrainerTimezone());
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
    // exerciseId → first existing weightBySetKg, so we can PRESERVE each
    // client's own weights when pushWeights is off (the default).
    const weightById = new Map<string, unknown>();
    for (const ex of existingExercises) {
      const id = typeof ex.exerciseId === "string" ? ex.exerciseId : "";
      if (id && !noteById.has(id)) noteById.set(id, ex.notes);
      if (id && !weightById.has(id)) weightById.set(id, ex.weightBySetKg);
    }
    const exercises = freshExercises.map((fresh, i) => {
      const byIndex = existingExercises[i];
      const matchesById = byIndex && byIndex.exerciseId === fresh.exerciseId;
      const freshId =
        typeof fresh.exerciseId === "string" ? fresh.exerciseId : "";
      const clientNote = matchesById
        ? byIndex.notes
        : noteById.get(freshId);
      const merged = mergeExerciseNote(clientNote, fresh.notes);
      const next = { ...fresh };
      if (merged !== undefined) {
        next.notes = merged;
      } else {
        delete next.notes;
      }
      // pushWeights OFF (default): keep the client's own weights for any
      // exercise that already existed on this assignment (matched by
      // exerciseId). New exercises with no prior match fall through to the
      // template's weights (already in `fresh`). pushWeights ON: leave the
      // template's weights in place (replace the client's).
      if (!pushWeights) {
        const matched = matchesById || weightById.has(freshId);
        if (matched) {
          const priorWeight = matchesById
            ? byIndex.weightBySetKg
            : weightById.get(freshId);
          if (priorWeight !== undefined) {
            next.weightBySetKg = priorWeight;
          } else {
            delete next.weightBySetKg;
          }
        }
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
      const docData = doc.data() as {
        templateSnapshot?: unknown;
        prescriptionUpdatedAtByExerciseId?: unknown;
      };
      const existing = docData.templateSnapshot;
      const nextSnapshot = snapshotForAssignment(existing);
      // Stamp the freshness anchor PER EXERCISE — only when the coach opted to
      // push weights AND only for the exercises whose weights genuinely changed
      // vs this assignment's prior snapshot. With pushWeights off the client
      // keeps their own weights, so nothing is stamped and no "coach updated"
      // alert fires. With it on, an exercise whose weight happens to already
      // match the template is skipped too — no point nagging on an unchanged
      // exercise. We no longer bump the doc-level `prescriptionUpdatedAt`.
      const changedIds = pushWeights
        ? changedWeightExerciseIds(
            exercisesOf(existing),
            exercisesOf(nextSnapshot),
          )
        : [];
      batch.update(doc.ref, {
        templateSnapshot: nextSnapshot,
        updatedAt: FieldValue.serverTimestamp(),
        ...buildPerExerciseStampUpdate(
          changedIds,
          docData.prescriptionUpdatedAtByExerciseId,
        ),
      });
    }
    await batch.commit();
  }

  return { updatedCount: targets.length };
}

/**
 * Edits the per-exercise prescription (reps/kg per set, rest, notes) baked into
 * an assignment's frozen snapshot. Scope:
 *   - "one"    → just this assignment
 *   - "series" → this + every future, still-scheduled assignment in the same
 *                series (a series is one client's recurring workout, so the
 *                edit applies uniformly). Past / started / completed docs are
 *                never touched.
 *
 * The edits are applied as full row objects in the current order. The
 * calendar editor can add/remove rows now, so the server action rewrites the
 * assignment snapshot's exercise array rather than patching a single index in
 * place.
 */
const editAssignmentExercisesSchema = z.object({
  scope: z.enum(["one", "series"]),
  exercises: z.array(z.object({}).passthrough()).max(50),
});

export async function editAssignmentExercises(
  id: string,
  inputRaw: unknown,
): Promise<{ ok: true; updatedCount: number }> {
  const trainer = await getCurrentTrainer();
  const input = editAssignmentExercisesSchema.parse(inputRaw);

  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Not found");
  const data = snap.data() as {
    trainerId?: string;
    seriesId?: string | null;
  };
  if (data.trainerId !== trainer.uid) throw new Error("Not your assignment.");

  const applyEdits = (snapshot: unknown): Record<string, unknown> => {
    const base =
      snapshot && typeof snapshot === "object"
        ? (snapshot as Record<string, unknown>)
        : {};
    const currentExercises = Array.isArray(base.exercises)
      ? (base.exercises as Array<Record<string, unknown>>)
      : [];
    const usesLegacyIndex = input.exercises.every(
      (edit) => "index" in edit && typeof edit.index === "number",
    );
    if (usesLegacyIndex) {
      const exercises = [...currentExercises];
      for (const edit of input.exercises as Array<Record<string, unknown>>) {
        const index = Number(edit.index);
        if (!Number.isFinite(index) || index < 0) continue;
        const current = exercises[index] ?? {};
        const repsBySet = Array.isArray(edit.repsBySet)
          ? (edit.repsBySet as number[])
          : [];
        const noWeight = edit.noWeight === true;
        const weightBySetKg = normalizeEditedWeights({
          raw: edit.weightBySetKg,
          setCount: repsBySet.length,
          noWeight,
          fallbackCount: Array.isArray((current as { weightBySetKg?: unknown }).weightBySetKg)
            ? ((current as { weightBySetKg?: unknown }).weightBySetKg as unknown[]).length
            : 0,
        });
        const restSeconds = Number(edit.rest_seconds);
        const transitionRestSeconds =
          edit.transition_rest_seconds !== undefined
            ? Number(edit.transition_rest_seconds)
            : undefined;
        const notes = typeof edit.notes === "string" ? edit.notes : "";
        exercises[index] = {
          ...current,
          sets: repsBySet.length,
          reps: repsBySet[0] ?? 0,
          repsBySet,
          weightBySetKg, // [] only when the explicit noWeight flag is on
          rest_seconds: Number.isFinite(restSeconds) ? restSeconds : 60,
          ...(Number.isFinite(transitionRestSeconds)
            ? { transition_rest_seconds: transitionRestSeconds }
            : {}),
          notes,
        };
      }
      return { ...base, exercises };
    }
    // Pair each incoming row with its snapshot twin by exerciseId (consumed
    // one-to-one so duplicates still pair). Positional pairing breaks as soon
    // as the dialog removes or reorders a row.
    const remaining = [...currentExercises];
    const exercises = (input.exercises as Array<Record<string, unknown>>).map(
      (edit) => {
      const exerciseId = typeof edit.exerciseId === "string" ? edit.exerciseId : "";
      const matchIdx = exerciseId
        ? remaining.findIndex((r) => r.exerciseId === exerciseId)
        : -1;
      const current =
        matchIdx >= 0 ? remaining.splice(matchIdx, 1)[0] : undefined;
      const editName =
        edit.name && typeof edit.name === "object"
          ? (edit.name as { en?: unknown; es?: unknown })
          : undefined;
      const currentName =
        current?.name && typeof current.name === "object"
          ? (current.name as { en?: unknown; es?: unknown })
          : undefined;
      // Keep the snapshot's localized names when the dialog sends blanks —
      // the editor only knows the single display string, so a wholesale
      // overwrite would wipe `name.es` for every pre-existing exercise.
      const name = {
        en:
          (typeof editName?.en === "string" && editName.en.trim().length > 0
            ? editName.en
            : undefined) ??
          (typeof currentName?.en === "string" ? currentName.en : ""),
        es:
          (typeof editName?.es === "string" && editName.es.trim().length > 0
            ? editName.es
            : undefined) ??
          (typeof currentName?.es === "string" ? currentName.es : ""),
      };
      const previewUrl =
        typeof edit.previewUrl === "string" ? edit.previewUrl : null;
      const repsBySet = Array.isArray(edit.repsBySet)
        ? (edit.repsBySet as number[])
        : [];
      const noWeight = edit.noWeight === true;
      const weightBySetKg = normalizeEditedWeights({
        raw: edit.weightBySetKg,
        setCount: repsBySet.length,
        noWeight,
        fallbackCount: Array.isArray(current?.weightBySetKg)
          ? (current?.weightBySetKg as unknown[]).length
          : 0,
      });
      const restSeconds = Number(edit.rest_seconds);
      const transitionRestSeconds =
        edit.transition_rest_seconds !== undefined
          ? Number(edit.transition_rest_seconds)
          : undefined;
      const metric = edit.metric === "time" ? "time" : "reps";
      const durationBySetSeconds = Array.isArray(edit.durationBySetSeconds)
        ? (edit.durationBySetSeconds as number[])
        : [];
      const durationSeconds =
        edit.durationSeconds === null || typeof edit.durationSeconds === "number"
          ? (edit.durationSeconds as number | null)
          : null;
      const supersetGroup =
        typeof edit.supersetGroup === "string" ? edit.supersetGroup : null;
      const merged: Record<string, unknown> = {
        ...(current ?? {}),
        exerciseId,
        name,
        // Media only for NEW exercises — existing rows keep their snapshot's
        // gifUrl/imageUrl/thumbnailURL (the dialog's previewUrl is a collapsed
        // single field and would clobber the distinct originals).
        ...(current
          ? {}
          : {
              gifUrl: previewUrl,
              imageUrl: previewUrl,
              thumbnailURL: previewUrl,
        }),
        sets: repsBySet.length,
        reps: repsBySet[0] ?? 0,
        repsBySet,
        weightBySetKg, // [] only when the explicit noWeight flag is on
        rest_seconds: Number.isFinite(restSeconds) ? restSeconds : 60,
        notes: typeof edit.notes === "string" ? edit.notes : "",
        metric,
        durationBySetSeconds,
        durationSeconds,
        supersetGroup,
      };
      if (Number.isFinite(transitionRestSeconds)) {
        merged.transition_rest_seconds = transitionRestSeconds;
      }
      if (noWeight) {
        merged.hasExplicitNoWeightPrescription = true;
      } else {
        delete merged.hasExplicitNoWeightPrescription;
      }
      return merged;
    },
    );
    return { ...base, exercises };
  };

  const targets: Array<{
    ref: FirebaseFirestore.DocumentReference;
    snapshot: unknown;
    existingMap: unknown;
  }> = [];
  if (input.scope === "series" && typeof data.seriesId === "string" && data.seriesId) {
    const today = civilDateFormat(new Date(), await getTrainerTimezone());
    const seriesSnap = await db
      .collection(ASSIGNMENTS)
      .where("trainerId", "==", trainer.uid)
      .where("seriesId", "==", data.seriesId)
      .get();
    for (const d of seriesSnap.docs) {
      const dd = d.data() as {
        scheduledFor?: string;
        status?: string;
        templateSnapshot?: unknown;
        prescriptionUpdatedAtByExerciseId?: unknown;
      };
      if (
        typeof dd.scheduledFor === "string" &&
        dd.scheduledFor >= today &&
        (!dd.status || dd.status === "scheduled")
      ) {
        targets.push({
          ref: d.ref,
          snapshot: dd.templateSnapshot,
          existingMap: dd.prescriptionUpdatedAtByExerciseId,
        });
      }
    }
    if (targets.length === 0) {
      const cur = snap.data() as {
        templateSnapshot?: unknown;
        prescriptionUpdatedAtByExerciseId?: unknown;
      };
      targets.push({
        ref,
        snapshot: cur.templateSnapshot,
        existingMap: cur.prescriptionUpdatedAtByExerciseId,
      });
    }
  } else {
    const cur = snap.data() as {
      templateSnapshot?: unknown;
      prescriptionUpdatedAtByExerciseId?: unknown;
    };
    targets.push({
      ref,
      snapshot: cur.templateSnapshot,
      existingMap: cur.prescriptionUpdatedAtByExerciseId,
    });
  }

  const batch = db.batch();
  for (const tgt of targets) {
    const nextSnapshot = applyEdits(tgt.snapshot);
    // Stamp the weight-prefill freshness anchor PER EXERCISE — only for the
    // exercises whose WEIGHTS actually changed vs the current snapshot. Each
    // client holds their own weights per exercise, so a notes-only (or
    // reps/rest-only) edit stamps nothing and leaves the rest untouched; the
    // client keeps their own weights on every exercise the coach didn't change.
    // We no longer bump the doc-level `prescriptionUpdatedAt` on edits — it
    // stays as the create baseline + legacy fallback.
    const changedIds = changedWeightExerciseIds(
      exercisesOf(tgt.snapshot),
      exercisesOf(nextSnapshot),
    );
    batch.update(tgt.ref, {
      templateSnapshot: nextSnapshot,
      updatedAt: FieldValue.serverTimestamp(),
      ...buildPerExerciseStampUpdate(changedIds, tgt.existingMap),
    });
  }
  await batch.commit();

  return { ok: true, updatedCount: targets.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// editAssignmentRecurrence — change which days a recurring series lands on,
// "from this occurrence forward" (de aquí en adelante).
// ─────────────────────────────────────────────────────────────────────────────
//
// The trainer opens ONE occurrence of a recurring series in the detail dialog
// (e.g. "Mon/Wed/Fri") and wants to switch it to "Mon/Fri" going forward
// without disturbing what already happened. Because a recurring assignment is
// not a single parent doc but a fan-out of per-date docs that share a
// `seriesId` (see assignTemplateRecurring), "edit the recurrence" is modeled as
// delete-future-scheduled + re-expand the new rule, mirroring the cascade-delete
// semantics of deleteAssignment(id, {cascadeFromDate}):
//
//   cutoff       = the viewed occurrence's scheduledFor (same anchor the delete
//                  dialog uses for "this and all future occurrences"). The detail
//                  dialog only surfaces this action for scheduled/started
//                  occurrences, so the cutoff is today-or-future in practice.
//   seriesStart  = earliest scheduledFor in the series — the anchor that keeps
//                  every_n_days phase stable across the edit.
//   windowEnd    = latest scheduledFor in the series — preserves the original
//                  horizon (no endDate is persisted on the docs, so the existing
//                  span IS the source of truth for "how far out").
//
// Past / started / completed / missed docs are never touched (status filter,
// exactly like the cascade delete). Per-occurrence exercise edits on future
// docs are intentionally NOT preserved — a recurrence change is structural; the
// new docs are seeded from the viewed occurrence's snapshot (the workout the
// trainer is looking at). Weight-prefill freshness anchors
// (prescriptionUpdatedAt[ByExerciseId]) are carried over from the anchor so an
// unchanged prescription does NOT reset the client's per-exercise weight prefill.
const editAssignmentRecurrenceSchema = z.object({
  recurrence: recurrenceSchema,
});

export async function editAssignmentRecurrence(
  id: string,
  inputRaw: unknown,
): Promise<{ ok: true; removedCount: number; createdCount: number }> {
  const trainer = await getCurrentTrainer();
  const input = editAssignmentRecurrenceSchema.parse(inputRaw);

  // "single" collapses a series to one date — that's a delete, not a recurrence
  // edit. The UI never offers it; reject defensively.
  if (input.recurrence.kind === "single") {
    throw new Error("Choose a recurring cadence (not a single date).");
  }
  const recurrence = input.recurrence as ExpandableRecurrence;

  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Not found");
  const anchor = snap.data() as {
    trainerId?: string;
    clientId?: string | null;
    pendingEmail?: string | null;
    templateId?: string;
    templateSnapshot?: unknown;
    scheduledFor?: string;
    scheduledTime?: string | null;
    meetingNotes?: string | null;
    timezone?: string | null;
    seriesId?: string | null;
    prescriptionUpdatedAt?: unknown;
    prescriptionUpdatedAtByExerciseId?: unknown;
  };
  if (anchor.trainerId !== trainer.uid) {
    throw new Error("Not your assignment.");
  }
  if (!anchor.seriesId || typeof anchor.seriesId !== "string") {
    throw new Error("This workout is not recurring — nothing to reschedule.");
  }
  const cutoff =
    typeof anchor.scheduledFor === "string" ? anchor.scheduledFor : "";
  if (!CIVIL_DATE_REGEX.test(cutoff)) {
    throw new Error("Assignment is missing a valid scheduled date.");
  }

  // Load the whole series for this trainer to derive the original window AND the
  // set of future-scheduled docs to replace.
  const seriesSnap = await db
    .collection(ASSIGNMENTS)
    .where("trainerId", "==", trainer.uid)
    .where("seriesId", "==", anchor.seriesId)
    .get();

  let seriesStart = cutoff;
  let windowEnd = cutoff;
  const toDelete: FirebaseFirestore.DocumentReference[] = [];
  const keptDates: string[] = [];
  for (const d of seriesSnap.docs) {
    const dd = d.data() as { scheduledFor?: string; status?: string };
    const when = typeof dd.scheduledFor === "string" ? dd.scheduledFor : "";
    if (!CIVIL_DATE_REGEX.test(when)) continue;
    if (when < seriesStart) seriesStart = when;
    if (when > windowEnd) windowEnd = when;
    const isFutureScheduled =
      when >= cutoff && (!dd.status || dd.status === "scheduled");
    if (isFutureScheduled) {
      toDelete.push(d.ref);
    } else {
      // Untouched docs (past, or started/completed/missed) keep their dates —
      // they form part of the post-edit series picture for the activity log.
      keptDates.push(when);
    }
  }

  // Re-expand the NEW rule over the original span, anchored at the series start
  // (keeps every_n_days phase), then keep only dates at/after the cutoff.
  const newDates = expandRecurrenceDates(
    recurrence,
    seriesStart,
    windowEnd,
  ).filter((date) => date >= cutoff);
  if (newDates.length === 0) {
    throw new Error(
      "The new recurrence produces no upcoming dates in this series.",
    );
  }

  const recurrencePayload: Record<string, unknown> = recurrence;
  const clientId = anchor.clientId ?? null;
  const idSegment =
    typeof clientId === "string" && clientId ? clientId : "pending";

  const batch = db.batch();
  for (const delRef of toDelete) {
    batch.delete(delRef);
  }
  for (const date of newDates) {
    const ymd = date.replace(/-/g, "");
    const docId = `asg-${idSegment}-${ymd}-${randomUUID()}`;
    const docRef = db.collection(ASSIGNMENTS).doc(docId);
    batch.set(docRef, {
      templateId: anchor.templateId ?? null,
      templateSnapshot: anchor.templateSnapshot ?? null,
      clientId,
      pendingEmail: anchor.pendingEmail ?? null,
      trainerId: trainer.uid,
      scheduledFor: date,
      scheduledTime: anchor.scheduledTime ?? null,
      meetingNotes: anchor.meetingNotes ?? null,
      timezone: anchor.timezone ?? null,
      status: "scheduled" as const,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Carry the prescription-freshness anchor so an unchanged prescription
      // does NOT reset the client's per-exercise weight prefill (the recurrence
      // change is structural, not a re-prescription).
      prescriptionUpdatedAt:
        anchor.prescriptionUpdatedAt ?? FieldValue.serverTimestamp(),
      ...(anchor.prescriptionUpdatedAtByExerciseId !== undefined
        ? {
            prescriptionUpdatedAtByExerciseId:
              anchor.prescriptionUpdatedAtByExerciseId,
          }
        : {}),
      recurrence: recurrencePayload,
      seriesId: anchor.seriesId,
    });
  }
  await batch.commit();

  // Re-record the series event so My Activity reflects the new date set. Same
  // eventId (`asg:${seriesId}`) → recordCoachActivityEvent merges in place.
  await recordCoachActivityEvent(
    db,
    seriesAssignmentEvent({
      trainerId: trainer.uid,
      seriesId: anchor.seriesId,
      templateName: (anchor.templateSnapshot as { name?: unknown })?.name,
      clientId,
      pendingEmail: anchor.pendingEmail ?? null,
      recurrence: recurrencePayload,
      dates: [...keptDates, ...newDates],
    }),
  );

  return {
    ok: true,
    removedCount: toDelete.length,
    createdCount: newDates.length,
  };
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
