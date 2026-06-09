"use server";

// schedule-month-actions.ts
//
// Server Actions powering the unified month calendar at /gc-fitness/schedule.
//
// listMonthForClients(monthCivilFirst, clientIds[]) returns a per-day,
// per-client roll-up: workout assignments, workout-log statuses (so we can
// render done/missed/scheduled badges), habits, and habit logs that
// determine each habit's day-by-day status.
//
// Move semantics live alongside the read: moveAssignment(id, scope, newDate)
// implements the three scopes the trainer can pick when dragging a chip:
//   - "one"     : move just this occurrence
//   - "future"  : move this occurrence AND every still-scheduled future
//                 occurrence in the same series, shifting them by the same
//                 day-delta the trainer applied to this occurrence
//   - "all"     : same as "future" but starts from the EARLIEST scheduled
//                 doc in the series, not just from the dragged date

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { civilDateFormat } from "./civil-date";
import { coachVisibleClientName } from "./client-name";
import { logCountsAsCompleted, type HabitLogRow } from "./habit-compliance";
import type { HabitType } from "./habit-schema";

const ASSIGNMENTS = FirestoreCollections.workoutAssignments;
const LOGS = FirestoreCollections.workoutLogs;
const HABITS = FirestoreCollections.habits;
const HABIT_LOGS = FirestoreCollections.habitLogs;

export interface MonthWorkoutChip {
  id: string;
  clientId: string;
  scheduledFor: string; // YYYY-MM-DD
  /**
   * Trainer's ORIGINAL civil-date when the client moved the workout
   * to a different day from the iOS app. Null when the workout still
   * sits where the trainer placed it. Drives the "originalmente X,
   * el cliente lo movió a Y" disclaimer in the chip tooltip.
   */
  originallyScheduledFor: string | null;
  templateName: string;
  templateTag: string | null;
  status: "scheduled" | "started" | "completed" | "missed";
  seriesId: string | null;
  recurrenceKind: string | null;
}

export interface MonthHabitChip {
  id: string;
  clientId: string;
  civilDate: string;
  habitName: string;
  status: "done" | "missed" | "scheduled";
}

export interface MonthCalendarPayload {
  monthStart: string; // YYYY-MM-01
  monthEnd: string; // YYYY-MM-{lastDay}
  // Pre-bucketed per civilDate. The UI iterates the calendar grid and
  // looks up these keys directly — no in-component filtering loop.
  workoutsByDay: Record<string, MonthWorkoutChip[]>;
  habitsByDay: Record<string, MonthHabitChip[]>;
}

function lastDayOfMonth(monthCivilFirst: string): string {
  const [y, m] = monthCivilFirst.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthCivilFirst.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function addCivilDays(civilDate: string, days: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return civilDateFormat(shifted, "UTC");
}

function dayDelta(fromCivil: string, toCivil: string): number {
  const [y0, m0, d0] = fromCivil.split("-").map(Number);
  const [y1, m1, d1] = toCivil.split("-").map(Number);
  return Math.round(
    (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / 86_400_000,
  );
}

function jsWeekdayFromCivil(civil: string): number {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function statusFromAssignment(
  scheduledFor: string,
  rawStatus: unknown,
  todayCivil: string,
): MonthWorkoutChip["status"] {
  const status = typeof rawStatus === "string" ? rawStatus : "scheduled";
  if (status === "completed" || status === "missed") {
    return status;
  }
  if (status === "started") {
    return "scheduled";
  }
  // scheduled, but in the past → missed (trainer-side visual). We don't
  // mutate the doc here — the calendar's "missed" badge is computed.
  if (scheduledFor < todayCivil) return "missed";
  return "scheduled";
}

/**
 * Computes which civil-dates in [monthStart, monthEnd] a habit is
 * scheduled on, based on its `scheduleType` + cadence fields. Mirrors the
 * roster's per-week sum but expanded across the whole month so the UI can
 * render scheduled pills on the right days.
 */
function habitScheduledDays(
  habit: Record<string, unknown>,
  monthStart: string,
  monthEnd: string,
): string[] {
  const scheduleType =
    typeof habit.scheduleType === "string" ? habit.scheduleType : "recurring";
  // Honor the habit's `startsOn` even for one-time habits — that's the
  // single civil date the habit lives on.
  const startsOn =
    typeof habit.startsOn === "string" && habit.startsOn.length > 0
      ? habit.startsOn
      : null;
  const endsOn =
    typeof habit.endsOn === "string" && habit.endsOn.length > 0
      ? habit.endsOn
      : null;
  // No startsOn → derive an implicit start from `createdAt` (Firestore
  // Timestamp). That stops the calendar from rendering a habit as
  // "missed" on every day before it was even created — the bug the
  // operator saw with brand-new "Latita" / "120g prote" habits showing
  // red ⊗ rows on May 1-17 even though they were created on May 28.
  let implicitStart: string | null = null;
  const createdAt = habit.createdAt;
  if (
    createdAt &&
    typeof (createdAt as { toDate?: () => Date }).toDate === "function"
  ) {
    const d = (createdAt as { toDate: () => Date }).toDate();
    if (!Number.isNaN(d.getTime())) {
      implicitStart = civilDateFormat(d, "UTC");
    }
  }

  // Civil dates the trainer removed from this habit's recurrence ("quitar de
  // este día"). Filtered out of every generated occurrence below.
  const skipped = Array.isArray(habit.skippedDates)
    ? new Set((habit.skippedDates as unknown[]).filter((d) => typeof d === "string") as string[])
    : null;

  if (scheduleType === "one-time") {
    const date = startsOn ?? "";
    if (skipped?.has(date)) return [];
    return date && date >= monthStart && date <= monthEnd ? [date] : [];
  }

  const cadence =
    typeof habit.scheduleCadence === "string" ? habit.scheduleCadence : "daily";
  const startDate = startsOn ?? implicitStart ?? monthStart;
  const endDate = endsOn ?? monthEnd;

  const lo = startDate > monthStart ? startDate : monthStart;
  const hi = endDate < monthEnd ? endDate : monthEnd;
  if (lo > hi) return [];

  const out: string[] = [];
  if (cadence === "daily") {
    for (let d = lo; d <= hi; d = addCivilDays(d, 1)) out.push(d);
  } else if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[])
      : [];
    // iOS: 1=Mon..7=Sun ; JS getDay: 0=Sun..6=Sat — map 7→0 otherwise N→N.
    const jsWeekdays = new Set(weekdays.map((n) => (n === 7 ? 0 : n)));
    for (let d = lo; d <= hi; d = addCivilDays(d, 1)) {
      if (jsWeekdays.has(jsWeekdayFromCivil(d))) out.push(d);
    }
  } else if (cadence === "monthly") {
    const monthDays = Array.isArray(habit.scheduleMonthDays)
      ? (habit.scheduleMonthDays as number[])
      : typeof habit.scheduleDayOfMonth === "number"
        ? [habit.scheduleDayOfMonth as number]
        : [];
    const set = new Set(monthDays);
    for (let d = lo; d <= hi; d = addCivilDays(d, 1)) {
      const day = Number(d.slice(8, 10));
      if (set.has(day)) out.push(d);
    }
  }
  return skipped ? out.filter((d) => !skipped.has(d)) : out;
}

export interface AssignmentExercise {
  index: number;
  exerciseId: string;
  exerciseName: string;
  previewUrl: string | null;
  sets: number;
  reps: number;
  rest_seconds: number;
  transition_rest_seconds: number;
  notes: string;
  repsBySet: number[];
  weightBySetKg: number[];
  supersetGroup: string | null;
  /**
   * 26-03 — Effective metric snapshotted on the assignment doc. Reads
   * from the per-exercise `metric` field on the templateSnapshot.
   * Missing field decodes to "reps" so legacy assignment docs render
   * the existing Reps column unchanged.
   */
  metric: "reps" | "time";
  /** 26-03 — Per-set duration prescription (seconds) for time-based
   *  exercises. Empty array for reps-based or legacy docs. */
  durationBySetSeconds: number[];
  /** 26-03 — Exercise-level duration fallback (seconds). Null when not
   *  prescribed (reps-based) or unset on a time exercise. */
  durationSeconds: number | null;
}

export interface AssignmentDetail {
  id: string;
  clientId: string;
  clientName: string;
  /** Coach (logged-in trainer) display name for the share card sub-line.
   *  Resolved from `/users/{trainerId}.displayName`. Null when unavailable
   *  — never a raw UID (the share card omits the coach segment gracefully).
   *  Mirrors `WorkoutLogDetail.coachName` (recent-logs-actions). */
  coachName: string | null;
  scheduledFor: string;
  scheduledTime: string | null;
  status: "scheduled" | "started" | "completed" | "missed";
  templateName: string;
  templateTag: string | null;
  meetingNotes: string | null;
  seriesId: string | null;
  recurrence: Record<string, unknown> | null;
  exercises: AssignmentExercise[];
  /**
   * The client's MOST RECENT completed set values, per exerciseId — used by the
   * edit dialog to show the coach a "Último: 50kg × 10" hint next to each set
   * row. Per exercise, the array is the non-warmup sets of the latest completed
   * `workout_logs` doc that logged that exercise, sorted by setIndex. Absent
   * when the client has no logged history for the exercise.
   */
  lastLoggedSetsByExerciseId?: Record<
    string,
    Array<{ weightKg: number; reps: number }>
  >;
}

export async function getAssignmentDetail(id: string): Promise<AssignmentDetail> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Not found");
  const data = snap.data() as Record<string, unknown>;
  if (data.trainerId !== trainer.uid) throw new Error("Not your assignment.");

  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  let clientName = clientId;
  if (clientId) {
    const userSnap = await db
      .collection(FirestoreCollections.users)
      .doc(clientId)
      .get();
    const userData = userSnap.data() as {
      displayName?: string;
      email?: string;
      coachNickname?: string;
    } | undefined;
    clientName = coachVisibleClientName({
      uid: clientId,
      displayName: userData?.displayName ?? userData?.email ?? clientId,
      email: userData?.email ?? "",
      coachNickname: userData?.coachNickname ?? null,
    });
  }

  // 260529-ltm — the logged-in trainer IS the coach. Resolve their
  // displayName for the share card sub-line. Degrade to null (never a raw
  // UID) when the doc/field is missing — the card omits the coach segment.
  // Mirrors getWorkoutLogDetail's coachName resolution exactly.
  const trainerSnap = await db
    .collection(FirestoreCollections.users)
    .doc(trainer.uid)
    .get();
  const rawCoachName = trainerSnap.get("displayName");
  const coachName =
    typeof rawCoachName === "string" && rawCoachName.trim().length > 0
      ? rawCoachName.trim()
      : null;

  const snapshot = (data.templateSnapshot ?? {}) as {
    name?: unknown;
    tag?: unknown;
    exercises?: Array<Record<string, unknown>>;
  };
  const rawName = snapshot.name;
  const templateName =
    typeof rawName === "string"
      ? rawName
      : (rawName as { en?: string; es?: string } | undefined)?.en ??
        (rawName as { en?: string; es?: string } | undefined)?.es ??
        "Workout";
  const templateTag =
    typeof snapshot.tag === "string" ? snapshot.tag : null;
  const exercises = Array.isArray(snapshot.exercises) ? snapshot.exercises : [];

  // Q2 — the client's most recent logged set values per exercise, so the edit
  // dialog can hint "Último: 50kg × 10" beside each set. The trainer reads
  // their own client's logs (same access the live session uses).
  const lastLoggedSetsByExerciseId = clientId
    ? await fetchLastLoggedSetsByExercise(db, trainer.uid, clientId)
    : {};

  return {
    id: snap.id,
    clientId,
    clientName,
    coachName,
    scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
    scheduledTime:
      typeof data.scheduledTime === "string" ? data.scheduledTime : null,
    status:
      ((data.status as AssignmentDetail["status"]) ?? "scheduled"),
    templateName,
    templateTag,
    meetingNotes:
      typeof data.meetingNotes === "string" ? data.meetingNotes : null,
    seriesId:
      typeof data.seriesId === "string" ? data.seriesId : null,
    recurrence:
      data.recurrence && typeof data.recurrence === "object"
        ? (data.recurrence as Record<string, unknown>)
        : null,
    exercises: exercises.map((ex, idx) => {
      const exId = typeof ex.exerciseId === "string" ? ex.exerciseId : "";
      const nameField = ex.name as { en?: string; es?: string } | string | undefined;
      const exerciseName =
        typeof nameField === "string"
          ? nameField
          : nameField?.en ?? nameField?.es ?? exId ?? `Exercise ${idx + 1}`;
      return {
        index: idx,
        exerciseId: exId,
        exerciseName,
        previewUrl:
          typeof ex.gifUrl === "string"
            ? ex.gifUrl
            : typeof ex.imageUrl === "string"
              ? (ex.imageUrl as string)
              : typeof ex.thumbnailURL === "string"
                ? (ex.thumbnailURL as string)
                : null,
        sets:
          typeof ex.sets === "number" && Number.isFinite(ex.sets) ? ex.sets : 3,
        reps:
          typeof ex.reps === "number" && Number.isFinite(ex.reps) ? ex.reps : 0,
        rest_seconds:
          typeof ex.rest_seconds === "number" && Number.isFinite(ex.rest_seconds)
            ? ex.rest_seconds
            : 60,
        transition_rest_seconds:
          typeof ex.transition_rest_seconds === "number" &&
          Number.isFinite(ex.transition_rest_seconds)
            ? ex.transition_rest_seconds
            : 60,
        notes: typeof ex.notes === "string" ? ex.notes : "",
        repsBySet: Array.isArray(ex.repsBySet)
          ? (ex.repsBySet as number[]).filter((n) => Number.isFinite(n))
          : [],
        weightBySetKg: Array.isArray(ex.weightBySetKg)
          ? (ex.weightBySetKg as number[]).filter((n) => Number.isFinite(n))
          : [],
        supersetGroup:
          typeof ex.supersetGroup === "string" &&
          ex.supersetGroup.trim().length > 0
            ? ex.supersetGroup.trim()
            : null,
        // 26-03 — Forgiving metric decode (PATTERNS.md §18 + Shared 5).
        // Unknown / absent values fall back to "reps" so every legacy
        // assignment doc renders the existing Reps column unchanged.
        metric: ex.metric === "time" ? "time" : "reps",
        durationBySetSeconds: Array.isArray(ex.durationBySetSeconds)
          ? (ex.durationBySetSeconds as number[]).filter((n) =>
              Number.isFinite(n),
            )
          : [],
        durationSeconds:
          typeof ex.durationSeconds === "number" &&
          Number.isFinite(ex.durationSeconds)
            ? ex.durationSeconds
            : null,
      };
    }),
    lastLoggedSetsByExerciseId,
  };
}

/**
 * Build `exerciseId → [{ weightKg, reps }]` from the client's MOST RECENT
 * completed `workout_logs`. For each exercise the first (newest) log we see
 * that logged it wins; within that log we keep the non-warmup sets sorted by
 * `set_index`. Ordered by `startedAt DESC` to reuse the existing
 * `(clientId, status, startedAt DESC)` composite index (no new index). Trainer
 * ownership is filtered in memory (trainer-of-record is denormalized on logs).
 */
async function fetchLastLoggedSetsByExercise(
  db: FirebaseFirestore.Firestore,
  trainerUid: string,
  clientId: string,
): Promise<Record<string, Array<{ weightKg: number; reps: number }>>> {
  const HISTORY_LIMIT = 20;
  const out: Record<string, Array<{ weightKg: number; reps: number }>> = {};
  try {
    const snap = await db
      .collection(LOGS)
      .where("clientId", "==", clientId)
      .where("status", "==", "completed")
      .orderBy("startedAt", "desc")
      .limit(HISTORY_LIMIT)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.trainerId !== trainerUid) continue;
      const sets = Array.isArray(data.sets)
        ? (data.sets as Array<Record<string, unknown>>)
        : [];
      // Group this log's working sets by exerciseId. Logs are newest-first, so
      // the FIRST log that has an exercise wins (skip if already populated).
      const byExercise = new Map<
        string,
        Array<{ setIndex: number; weightKg: number; reps: number }>
      >();
      for (const raw of sets) {
        if (raw.is_warmup === true) continue;
        const exerciseId =
          typeof raw.exerciseId === "string" ? raw.exerciseId : "";
        if (!exerciseId) continue;
        const setIndex =
          typeof raw.set_index === "number" && Number.isFinite(raw.set_index)
            ? raw.set_index
            : 0;
        const weightKg =
          typeof raw.weight_kg === "number" && Number.isFinite(raw.weight_kg)
            ? raw.weight_kg
            : 0;
        const reps =
          typeof raw.reps === "number" && Number.isFinite(raw.reps)
            ? raw.reps
            : 0;
        (byExercise.get(exerciseId) ?? byExercise.set(exerciseId, []).get(exerciseId))!.push(
          { setIndex, weightKg, reps },
        );
      }
      for (const [exerciseId, rows] of byExercise.entries()) {
        if (out[exerciseId]) continue; // an earlier (newer) log already set it
        rows.sort((a, b) => a.setIndex - b.setIndex);
        out[exerciseId] = rows.map((r) => ({
          weightKg: r.weightKg,
          reps: r.reps,
        }));
      }
    }
  } catch {
    // Missing index / rule error — degrade to no history (the hint just won't
    // render). Never block the dialog from loading the prescription itself.
  }
  return out;
}

export async function listMonthForClients(input: {
  /** Month mode: any day in the target month (YYYY-MM-01 typical). */
  monthFirstCivil?: string;
  /** Range mode (week / 3-day views): explicit inclusive civil-date bounds. */
  startCivil?: string;
  endCivil?: string;
  clientIds: string[];
  todayCivil: string;
}): Promise<MonthCalendarPayload> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  // Either an explicit [startCivil, endCivil] range (week / 3-day views) or a
  // whole month derived from monthFirstCivil (default month view). The rest of
  // this function only ever reads monthStart / monthEnd, so both modes share
  // the exact same query + habit-expansion path.
  const monthStart =
    input.startCivil ??
    `${(input.monthFirstCivil ?? input.todayCivil).slice(0, 7)}-01`;
  const monthEnd =
    input.endCivil ?? lastDayOfMonth(`${monthStart.slice(0, 7)}-01`);

  if (input.clientIds.length === 0) {
    return { monthStart, monthEnd, workoutsByDay: {}, habitsByDay: {} };
  }

  // Firestore IN supports max 30 values; trainers with > 30 active filter
  // chips at once is hypothetical — cap defensively.
  const clientIds = input.clientIds.slice(0, 30);

  // Pull every assignment in the month for the requested clients.
  // Composite index used: (clientId ASC, scheduledFor ASC) — already
  // deployed. We intentionally omit a redundant trainerId equality from the
  // query: clientIds are derived from the trainer's own roster on the caller
  // (auth-helpers + ownership-checked roster), AND Firestore Rules from 04-02
  // enforce trainerId == auth.uid on reads. Adding `trainerId ==` here would
  // require a third-axis composite (trainerId, clientId, scheduledFor) for
  // no gain.
  const [assignSnap, logSnap, habitSnap] = await Promise.all([
    db
      .collection(ASSIGNMENTS)
      .where("clientId", "in", clientIds)
      .where("scheduledFor", ">=", monthStart)
      .where("scheduledFor", "<=", monthEnd)
      .get(),
    // Same reasoning as the assignments query above: clientIds are roster-
    // scoped on the caller and rules enforce ownership, so the redundant
    // trainerId equality (which would require a new composite index) is
    // dropped. Index used: (clientId, startedAt DESC).
    db
      .collection(LOGS)
      .where("clientId", "in", clientIds)
      .orderBy("startedAt", "desc")
      .limit(200)
      .get(),
    db
      .collection(HABITS)
      .where("clientId", "in", clientIds)
      .where("deleted", "==", false)
      .get(),
  ]);

  // Build an assignmentId → log status map for the assignment status flip.
  //
  // We key by assignmentId — the log's FK to the exact assignment it logs —
  // NOT by (clientId, day). A workout log is the canonical record of "the
  // client did THIS assignment". Keying by (clientId, day) was a bug: it
  // flipped EVERY assignment on a given day to completed the moment the client
  // logged any single workout that day (e.g. "Piernas B" rendered green/done
  // when it was never completed, just because another workout was logged that
  // day — 260528). `assignmentId` is a required, immutable field on every log.
  const logStatusByAssignment = new Map<string, MonthWorkoutChip["status"]>();
  for (const doc of logSnap.docs) {
    const data = doc.data() as {
      assignmentId?: string;
      status?: string;
    };
    const assignmentId =
      typeof data.assignmentId === "string" ? data.assignmentId : "";
    if (!assignmentId) continue;
    const status = data.status === "completed" ? "completed" : "started";
    // "completed" wins over "started" if both exist for the same assignment.
    if (logStatusByAssignment.get(assignmentId) === "completed") continue;
    logStatusByAssignment.set(assignmentId, status);
  }

  const workoutsByDay: Record<string, MonthWorkoutChip[]> = {};
  for (const doc of assignSnap.docs) {
    const data = doc.data() as {
      trainerId?: string;
      clientId?: string;
      scheduledFor?: string;
      originallyScheduledFor?: string;
      templateSnapshot?: { name?: unknown; tag?: unknown };
      seriesId?: string | null;
      recurrence?: { kind?: string };
      status?: string;
    };
    if (data.trainerId !== trainer.uid) continue;
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    const civil = typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    if (!clientId || !civil) continue;
    const snapName = data.templateSnapshot?.name;
    const templateName =
      typeof snapName === "string"
        ? snapName
        : (snapName as { en?: string; es?: string } | undefined)?.en ??
          (snapName as { en?: string; es?: string } | undefined)?.es ??
          "Workout";
    const tag =
      typeof data.templateSnapshot?.tag === "string"
        ? data.templateSnapshot.tag
        : null;
    const logStatus = logStatusByAssignment.get(doc.id);
    const status: MonthWorkoutChip["status"] = logStatus
      ? logStatus
      : statusFromAssignment(civil, data.status, input.todayCivil);
    const originalCivil =
      typeof data.originallyScheduledFor === "string" &&
      data.originallyScheduledFor.length > 0 &&
      data.originallyScheduledFor !== civil
        ? data.originallyScheduledFor
        : null;
    const chip: MonthWorkoutChip = {
      id: doc.id,
      clientId,
      scheduledFor: civil,
      originallyScheduledFor: originalCivil,
      templateName,
      templateTag: tag,
      status,
      seriesId: data.seriesId ?? null,
      recurrenceKind:
        data.recurrence && typeof data.recurrence.kind === "string"
          ? data.recurrence.kind
          : null,
    };
    (workoutsByDay[civil] ??= []).push(chip);
  }
  for (const list of Object.values(workoutsByDay)) {
    list.sort((a, b) => a.templateName.localeCompare(b.templateName));
  }

  // Habits — compute scheduled days per habit, then walk habit_logs to flip
  // each scheduled-day's status to done/missed/scheduled.
  const habitsByClient = new Map<string, Array<Record<string, unknown>>>();
  const habitMetaById = new Map<
    string,
    { name: string; type: HabitType; targetValue: number | undefined }
  >();
  for (const doc of habitSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId) continue;
    (habitsByClient.get(clientId) ?? habitsByClient.set(clientId, []).get(clientId))!.push({
      ...data,
      __id: doc.id,
    });
    const rawName = data.name;
    const name =
      typeof rawName === "string"
        ? rawName
        : (rawName as { en?: string; es?: string } | undefined)?.en ??
          (rawName as { en?: string; es?: string } | undefined)?.es ??
          "Habit";
    habitMetaById.set(doc.id, {
      name,
      type: ((typeof data.type === "string" ? data.type : "binary") as HabitType),
      targetValue:
        typeof data.targetValue === "number" ? (data.targetValue as number) : undefined,
    });
  }

  // 260531-fwc COST: ONE batched habit_logs query for ALL clients' logs in the
  // month (served by the (clientId, civilDate) index) replaces the old per-habit
  // fan-out — one `where(habitId==).limit(200)` query PER habit. `clientId in`
  // mirrors the assignments/habits queries above; civilDate is range-bounded to
  // the month so we read only the days this view renders. Grouped by habitId →
  // (civilDate → latest log) below. Fallback to "all scheduled" on index/rule
  // error (same degrade as the old per-habit try/catch).
  const logByCivilByHabit = new Map<string, Map<string, HabitLogRow>>();
  try {
    const monthHabitLogsSnap = await db
      .collection(HABIT_LOGS)
      .where("clientId", "in", clientIds)
      .where("civilDate", ">=", monthStart)
      .where("civilDate", "<=", monthEnd)
      .get();
    for (const ldoc of monthHabitLogsSnap.docs) {
      const data = ldoc.data() as Record<string, unknown>;
      const habitId = typeof data.habitId === "string" ? data.habitId : "";
      const civil = typeof data.civilDate === "string" ? data.civilDate : "";
      if (!habitId || !civil) continue;
      const row: HabitLogRow = {
        habitId,
        clientId: (data.clientId as string) ?? "",
        civilDate: civil,
        value: data.value === true,
        unit: typeof data.unit === "string" ? data.unit : undefined,
        deleted: data.deleted === true,
      };
      let byCivil = logByCivilByHabit.get(habitId);
      if (!byCivil) {
        byCivil = new Map<string, HabitLogRow>();
        logByCivilByHabit.set(habitId, byCivil);
      }
      byCivil.set(civil, row);
    }
  } catch {
    // missing index / rule error — fall through to "all scheduled"
  }

  const habitsByDay: Record<string, MonthHabitChip[]> = {};
  for (const [clientId, habits] of habitsByClient.entries()) {
    for (const habit of habits) {
      const habitId = String(habit.__id);
      const meta = habitMetaById.get(habitId);
      if (!meta) continue;
      const days = habitScheduledDays(habit, monthStart, monthEnd);
      // 260531-fwc: logs precomputed from the single batched month query above
      // (already range-bounded to monthStart..monthEnd).
      const logByCivil =
        logByCivilByHabit.get(habitId) ?? new Map<string, HabitLogRow>();
      for (const civil of days) {
        const log = logByCivil.get(civil);
        const status: MonthHabitChip["status"] = log
          ? logCountsAsCompleted(log, meta.type, meta.targetValue)
            ? "done"
            : civil < input.todayCivil
              ? "missed"
              : "scheduled"
          : civil < input.todayCivil
            ? "missed"
            : "scheduled";
        (habitsByDay[civil] ??= []).push({
          id: `${habitId}:${civil}`,
          clientId,
          civilDate: civil,
          habitName: meta.name,
          status,
        });
      }
    }
  }
  for (const list of Object.values(habitsByDay)) {
    list.sort((a, b) => a.habitName.localeCompare(b.habitName));
  }

  return { monthStart, monthEnd, workoutsByDay, habitsByDay };
}

/**
 * Moves a workout assignment to a new civil date. Three scopes mirror the
 * UI's drag-prompt:
 *   - "one"     : single-doc update
 *   - "future"  : shift this + every scheduled future doc in the series by
 *                 the day-delta between origin and target
 *   - "all"     : shift every scheduled doc in the series (regardless of date)
 *
 * Past, started, or completed docs are NEVER moved — the trainer would
 * destroy logged work otherwise.
 */
export async function moveAssignment(input: {
  id: string;
  newScheduledFor: string;
  scope: "one" | "future" | "all";
}): Promise<{ ok: true; movedCount: number }> {
  const trainer = await getCurrentTrainer();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newScheduledFor)) {
    throw new Error("Invalid civil date.");
  }
  const db = gcFitnessFirestore();
  const ref = db.collection(ASSIGNMENTS).doc(input.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Not found");
  const existing = snap.data() as {
    trainerId?: string;
    scheduledFor?: string;
    seriesId?: string | null;
    status?: string;
  };
  if (existing.trainerId !== trainer.uid) throw new Error("Not your assignment.");
  const originDate =
    typeof existing.scheduledFor === "string" ? existing.scheduledFor : "";
  if (!originDate) throw new Error("Origin date missing.");

  if (input.scope === "one" || !existing.seriesId) {
    await ref.update({
      scheduledFor: input.newScheduledFor,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, movedCount: 1 };
  }

  // Series move. Fetch every scheduled doc in the series; depending on
  // scope, filter to "from this date onward" or "all".
  const seriesSnap = await db
    .collection(ASSIGNMENTS)
    .where("seriesId", "==", existing.seriesId)
    .where("status", "==", "scheduled")
    .get();
  const delta = dayDelta(originDate, input.newScheduledFor);
  const docs = seriesSnap.docs.filter((doc) => {
    const data = doc.data() as { trainerId?: string; scheduledFor?: string };
    if (data.trainerId !== trainer.uid) return false;
    if (typeof data.scheduledFor !== "string") return false;
    if (input.scope === "future") return data.scheduledFor >= originDate;
    return true;
  });

  const batch = db.batch();
  for (const doc of docs) {
    const data = doc.data() as { scheduledFor?: string };
    const current = typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    if (!current) continue;
    const next = addCivilDays(current, delta);
    batch.update(doc.ref, {
      scheduledFor: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { ok: true, movedCount: docs.length };
}
