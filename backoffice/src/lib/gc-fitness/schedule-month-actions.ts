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

function asIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function statusFromAssignment(
  scheduledFor: string,
  rawStatus: unknown,
  todayCivil: string,
): MonthWorkoutChip["status"] {
  const status = typeof rawStatus === "string" ? rawStatus : "scheduled";
  if (status === "completed" || status === "started" || status === "missed") {
    return status;
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
  if (scheduleType === "one-time") {
    const date = typeof habit.scheduleDate === "string" ? habit.scheduleDate : "";
    return date && date >= monthStart && date <= monthEnd ? [date] : [];
  }

  const cadence =
    typeof habit.scheduleCadence === "string" ? habit.scheduleCadence : "daily";
  const startDate =
    typeof habit.scheduleStartDate === "string"
      ? habit.scheduleStartDate
      : monthStart;
  const endDate =
    typeof habit.scheduleEndDate === "string"
      ? habit.scheduleEndDate
      : monthEnd;

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
  return out;
}

export async function listMonthForClients(input: {
  monthFirstCivil: string; // YYYY-MM-01
  clientIds: string[];
  todayCivil: string;
}): Promise<MonthCalendarPayload> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const monthStart = `${input.monthFirstCivil.slice(0, 7)}-01`;
  const monthEnd = lastDayOfMonth(monthStart);

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
      .limit(500)
      .get(),
    db
      .collection(HABITS)
      .where("clientId", "in", clientIds)
      .where("deleted", "==", false)
      .get(),
  ]);

  // Build a (clientId+civilDate) → log status map for assignment status flip.
  const logStatusByKey = new Map<string, MonthWorkoutChip["status"]>();
  for (const doc of logSnap.docs) {
    const data = doc.data() as {
      clientId?: string;
      assignmentId?: string;
      status?: string;
      startedAt?: unknown;
    };
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId) continue;
    const startedIso = asIso(data.startedAt);
    if (!startedIso) continue;
    // We key by (clientId, civilDate(startedAt)) — assignments are bucketed by
    // scheduledFor and a same-day log is the canonical "did the assigned thing".
    // The lib treats `civilDateFormat(d, "UTC")` as the day key (matches the
    // assignment civilDate).
    const civil = civilDateFormat(new Date(startedIso), "UTC");
    if (civil < monthStart || civil > monthEnd) continue;
    const key = `${clientId}:${civil}`;
    const status = data.status === "completed" ? "completed" : "started";
    // "completed" wins over "started" if a client had both.
    const existing = logStatusByKey.get(key);
    if (existing === "completed") continue;
    logStatusByKey.set(key, status);
  }

  const workoutsByDay: Record<string, MonthWorkoutChip[]> = {};
  for (const doc of assignSnap.docs) {
    const data = doc.data() as {
      clientId?: string;
      scheduledFor?: string;
      originallyScheduledFor?: string;
      templateSnapshot?: { name?: unknown; tag?: unknown };
      seriesId?: string | null;
      recurrence?: { kind?: string };
      status?: string;
    };
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
    const logStatus = logStatusByKey.get(`${clientId}:${civil}`);
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

  // Per-habit log fetch (limit 200 per habit) — bound is generous for any
  // single calendar month.
  const habitDocIds = Array.from(habitMetaById.keys());
  const logsByHabit = new Map<string, FirebaseFirestore.QuerySnapshot>();
  await Promise.all(
    habitDocIds.map(async (habitId) => {
      try {
        const snap = await db
          .collection(HABIT_LOGS)
          .where("habitId", "==", habitId)
          .limit(200)
          .get();
        logsByHabit.set(habitId, snap);
      } catch {
        // missing index / rule error — fall through to "all scheduled"
      }
    }),
  );

  const habitsByDay: Record<string, MonthHabitChip[]> = {};
  for (const [clientId, habits] of habitsByClient.entries()) {
    for (const habit of habits) {
      const habitId = String(habit.__id);
      const meta = habitMetaById.get(habitId);
      if (!meta) continue;
      const days = habitScheduledDays(habit, monthStart, monthEnd);
      const logs = logsByHabit.get(habitId);
      const logByCivil = new Map<string, HabitLogRow>();
      if (logs) {
        for (const ldoc of logs.docs) {
          const data = ldoc.data() as Record<string, unknown>;
          const civil =
            typeof data.civilDate === "string" ? data.civilDate : "";
          if (!civil || civil < monthStart || civil > monthEnd) continue;
          logByCivil.set(civil, {
            habitId: (data.habitId as string) ?? "",
            clientId: (data.clientId as string) ?? "",
            civilDate: civil,
            value: data.value as boolean | string | number,
            unit: typeof data.unit === "string" ? data.unit : undefined,
            deleted: data.deleted === true,
          });
        }
      }
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
