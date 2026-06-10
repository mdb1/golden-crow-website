"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { listClients, type ClientRosterEntry } from "./client-roster";
import { coerceLegacyHabitLogValue } from "./habit-compliance";
import { isHabitScheduledOn } from "./habit-schedule";
import { getTrainerTimezone } from "./trainer-timezone";

export interface DailyMetric {
  civilDate: string;
  weekdayLabel: string;
  numerator: number;
  denominator: number;
  percentage: number;
}

export interface PerformerRow {
  uid: string;
  name: string;
  /** Client profile photo (`users/{uid}.photoURL`) — Google photo or Storage
   *  upload, or null. Rendered as a cached avatar in the performers list. */
  photoURL: string | null;
  pct: number;
  numerator: number;
  denominator: number;
}

export interface CoachPulse {
  habitDaily: DailyMetric[];
  workoutDaily: DailyMetric[];
  weekHabitPct: number;
  weekWorkoutPct: number;
  topPerformersWeek: PerformerRow[];
  topPerformersToday: PerformerRow[];
  customExerciseCount: number;
}

const WEEKDAY_LABELS_EN = ["S", "M", "T", "W", "T", "F", "S"] as const;

function asDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function habitScheduledOn(
  habit: Record<string, unknown>,
  civilDate: string,
): boolean {
  if (habit.deleted === true) return false;
  return isHabitScheduledOn(habit, civilDate);
}

function habitLogCountsAsCompleted(
  data: Record<string, unknown>,
  _habit: Record<string, unknown> | undefined,
): boolean {
  // Habits are binary-only: a log counts iff it isn't soft-deleted AND its
  // value is `true`. Mirrors `logCountsAsCompleted` in habit-compliance.ts.
  if (data.deleted === true) return false;
  return coerceLegacyHabitLogValue(data.value);
}

function buildWindowDays(timezone: string): string[] {
  const today = civilDateToday(timezone);
  const todayDate = new Date(`${today}T12:00:00Z`);
  const days: string[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(todayDate.getTime() - offset * 24 * 60 * 60 * 1000);
    days.push(civilDateFormat(day, timezone));
  }
  return days;
}

function weekdayLabel(civilDate: string): string {
  const date = new Date(`${civilDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return WEEKDAY_LABELS_EN[date.getUTCDay()] ?? "";
}

function rollup(metrics: DailyMetric[]): number {
  const num = metrics.reduce((acc, m) => acc + m.numerator, 0);
  const den = metrics.reduce((acc, m) => acc + m.denominator, 0);
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

export async function getCoachPulse(): Promise<CoachPulse> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const clients = await listClients();
  const activeClients = clients
    .filter((c) => !c.pendingProvisioning)
    .slice(0, 50);
  const trainerTz = await getTrainerTimezone();
  const windowDays = buildWindowDays(trainerTz);
  const windowStart = windowDays[0]!;
  const windowEnd = windowDays[windowDays.length - 1]!;
  const windowStartDate = new Date(`${windowStart}T00:00:00Z`);
  const windowEndDate = new Date(`${windowEnd}T23:59:59Z`);
  const todayCivil = windowEnd;

  if (activeClients.length === 0) {
    return {
      habitDaily: windowDays.map((d) => emptyMetric(d)),
      workoutDaily: windowDays.map((d) => emptyMetric(d)),
      weekHabitPct: 0,
      weekWorkoutPct: 0,
      topPerformersWeek: [],
      topPerformersToday: [],
      customExerciseCount: 0,
    };
  }

  // COST (260529): the pulse only ever consumes data INSIDE the
  // [windowStart, windowEnd] civil-date window (habitDaily/workoutDaily
  // below). Previously every fan-out fetched a broad slice (habit_logs
  // limit 400/client, assignments limit 600) and discarded the rest in
  // memory — ~20k habit_log reads per dashboard load for a 50-client book.
  // We now push the window into the query using composite indexes that are
  // CONFIRMED DEPLOYED in production (`firebase firestore:indexes`):
  //   - habit_logs        (clientId ASC, civilDate DESC)   ✓ live
  //   - workout_assignments (trainerId ASC, scheduledFor ASC) ✓ live
  // `scheduledFor` + `civilDate` are "YYYY-MM-DD" strings, so the
  // lexicographic range matches civil-date order exactly. The trailing
  // `.limit(...)` stays as a safety backstop; the window keeps it cold.
  // workout_logs has NO (trainerId, startedAt) index, so it keeps the
  // single-where + in-memory window slice (see logsInWindow below).
  const logError = (label: string) => (err: unknown) => {
    console.error(`[coach-pulse] ${label} failed`, err);
    return null;
  };
  const habitsPromises = activeClients.map((client) =>
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", client.uid)
      .limit(50)
      .get()
      .catch(logError(`habits clientId=${client.uid}`)),
  );
  // 260529 RESILIENCE — see also recent-logs-actions.ts. The windowed query
  // needs the `habit_logs (clientId, civilDate)` composite index. While that
  // index is BUILDING (the original 260529 outage) the query throws
  // FAILED_PRECONDITION. The PREVIOUS handler `.catch → null` turned that into
  // a SILENT all-zero pulse (0% week, empty bars, empty top performers) — wrong
  // numbers that look real, which is worse than a visible error. Instead, fall
  // back to the pre-windowing query (single-field `clientId`, always indexed)
  // and let the in-memory `civ < windowStart || civ > windowEnd` filter below
  // (see logsByClientDay) trim to the window — semantically identical output,
  // just more reads. Only `.catch → null` if even the fallback fails.
  const habitLogsPromises = activeClients.map((client) =>
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", client.uid)
      .where("civilDate", ">=", windowStart)
      .where("civilDate", "<=", windowEnd)
      .limit(400)
      .get()
      .catch(() =>
        db
          .collection(FirestoreCollections.habitLogs)
          .where("clientId", "==", client.uid)
          .limit(400)
          .get()
          .catch(logError(`habit_logs clientId=${client.uid}`)),
      ),
  );
  // Same pattern: windowed assignments need `workout_assignments
  // (trainerId, scheduledFor)`. Fall back to the trainerId-only query (the
  // in-memory `scheduledFor < windowStart || > windowEnd` filter below already
  // trims it) so an index build can't silently zero the workout bars.
  const assignmentsPromise = db
    .collection(FirestoreCollections.workoutAssignments)
    .where("trainerId", "==", trainer.uid)
    .where("scheduledFor", ">=", windowStart)
    .where("scheduledFor", "<=", windowEnd)
    .limit(600)
    .get()
    .catch(() =>
      db
        .collection(FirestoreCollections.workoutAssignments)
        .where("trainerId", "==", trainer.uid)
        .limit(600)
        .get()
        .catch(logError("workout_assignments")),
    );
  const workoutLogsPromise = db
    .collection(FirestoreCollections.workoutLogs)
    .where("trainerId", "==", trainer.uid)
    .limit(600)
    .get()
    .catch(logError("workout_logs"));
  const customExercisesPromise = db
    .collection(FirestoreCollections.exercises)
    .where("source", "==", "trainer")
    .where("ownerId", "==", trainer.uid)
    .count()
    .get()
    .catch(logError("custom_exercises_count"));

  const [
    habitsSnaps,
    habitLogsSnaps,
    assignmentsSnap,
    workoutLogsSnap,
    customExerciseCountSnap,
  ] = await Promise.all([
    Promise.all(habitsPromises),
    Promise.all(habitLogsPromises),
    assignmentsPromise,
    workoutLogsPromise,
    customExercisesPromise,
  ]);

  const customExerciseCount = customExerciseCountSnap
    ? customExerciseCountSnap.data().count
    : 0;

  // ===== Habits per day =====
  const habitsByClient = new Map<
    string,
    Array<Record<string, unknown> & { id: string }>
  >();
  habitsSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = activeClients[idx]!;
    habitsByClient.set(
      client.uid,
      snap.docs.map((doc) => ({ ...(doc.data() as Record<string, unknown>), id: doc.id })),
    );
  });

  const logsByClientDay = new Map<
    string,
    Array<{ habitId: string; data: Record<string, unknown> }>
  >();
  habitLogsSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = activeClients[idx]!;
    snap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const civ = typeof data.civilDate === "string" ? data.civilDate : "";
      if (!civ || civ < windowStart || civ > windowEnd) return;
      const habitId = typeof data.habitId === "string" ? data.habitId : "";
      const key = `${client.uid}:${civ}`;
      const bucket = logsByClientDay.get(key);
      const entry = { habitId, data };
      if (bucket) bucket.push(entry);
      else logsByClientDay.set(key, [entry]);
    });
  });

  const habitDaily: DailyMetric[] = windowDays.map((civilDate) => {
    let scheduled = 0;
    let done = 0;
    activeClients.forEach((client) => {
      const habits = habitsByClient.get(client.uid) ?? [];
      const habitById = new Map(habits.map((h) => [h.id, h]));
      const scheduledIds = new Set<string>();
      habits.forEach((h) => {
        if (habitScheduledOn(h, civilDate)) scheduledIds.add(h.id);
      });
      if (scheduledIds.size === 0) return;
      scheduled += scheduledIds.size;
      const dayLogs = logsByClientDay.get(`${client.uid}:${civilDate}`) ?? [];
      const countedHabitIds = new Set<string>();
      dayLogs.forEach(({ habitId, data }) => {
        if (!scheduledIds.has(habitId)) return;
        if (countedHabitIds.has(habitId)) return;
        const habit = habitById.get(habitId);
        if (habit && habitLogCountsAsCompleted(data, habit)) {
          countedHabitIds.add(habitId);
        }
      });
      done += countedHabitIds.size;
    });
    return {
      civilDate,
      weekdayLabel: weekdayLabel(civilDate),
      numerator: done,
      denominator: scheduled,
      percentage: scheduled === 0 ? 0 : Math.round((done / scheduled) * 100),
    };
  });

  // ===== Workouts per day =====
  type Assignment = { clientId: string; scheduledFor: string };
  const assignments: Assignment[] = (assignmentsSnap?.docs ?? [])
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const scheduledFor =
        typeof data.scheduledFor === "string" ? data.scheduledFor : "";
      const clientId = typeof data.clientId === "string" ? data.clientId : "";
      if (!scheduledFor || !clientId) return null;
      if (scheduledFor < windowStart || scheduledFor > windowEnd) return null;
      return { clientId, scheduledFor };
    })
    .filter((row): row is Assignment => row !== null);

  const assignmentsByDay = new Map<string, Assignment[]>();
  assignments.forEach((row) => {
    const bucket = assignmentsByDay.get(row.scheduledFor);
    if (bucket) bucket.push(row);
    else assignmentsByDay.set(row.scheduledFor, [row]);
  });

  // Group workout logs by (clientId, civilDate) — count one completion per day per client.
  type WorkoutLog = {
    clientId: string;
    civilDate: string;
    startedAt: Date;
    completed: boolean;
    sets: Array<{ reps: number; weight: number; completed: boolean }>;
  };
  const workoutLogs: WorkoutLog[] = (workoutLogsSnap?.docs ?? [])
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const clientId =
        typeof data.clientId === "string" ? data.clientId : "";
      if (!clientId) return null;
      const startedAt = asDate(data.startedAt) ?? asDate(data.createdAt);
      if (!startedAt) return null;
      const civilDate = civilDateFormat(startedAt, trainerTz);
      const completedAt = asDate(data.completedAt);
      const rawSets = Array.isArray(data.sets)
        ? (data.sets as Array<Record<string, unknown>>)
        : [];
      const sets = rawSets.map((s) => ({
        reps: numeric(s.reps),
        weight: numeric(s.weight_kg ?? s.weight),
        completed: Boolean(s.completed_at ?? s.completedAt),
      }));
      return {
        clientId,
        civilDate,
        startedAt,
        completed: Boolean(completedAt),
        sets,
      } satisfies WorkoutLog;
    })
    .filter((row): row is WorkoutLog => row !== null);

  const logsInWindow = workoutLogs.filter(
    (row) =>
      row.startedAt >= windowStartDate && row.startedAt <= windowEndDate,
  );
  const completionByClientDay = new Set<string>();
  logsInWindow.forEach((row) => {
    if (row.completed) completionByClientDay.add(`${row.clientId}:${row.civilDate}`);
  });

  const workoutDaily: DailyMetric[] = windowDays.map((civilDate) => {
    const todays = assignmentsByDay.get(civilDate) ?? [];
    const clientAssignedToday = new Set(todays.map((a) => a.clientId));
    const assigned = clientAssignedToday.size;
    let done = 0;
    clientAssignedToday.forEach((clientId) => {
      if (completionByClientDay.has(`${clientId}:${civilDate}`)) done += 1;
    });
    return {
      civilDate,
      weekdayLabel: weekdayLabel(civilDate),
      numerator: done,
      denominator: assigned,
      percentage: assigned === 0 ? 0 : Math.round((done / assigned) * 100),
    };
  });

  // NOTE: at-risk is derived in the dashboard page from the same staleRows
  // array that powers the "Needs attention" panel, so the KPI tile and the
  // panel can never disagree. We deliberately do NOT compute it here from
  // habit + workout logs because that source omits chat messages and
  // progress photos (both of which the roster aggregator counts as activity).

  // ===== Top performers (week + today) — both ranked by habit compliance =====
  const perClientWeek = new Map<string, { num: number; den: number }>();
  const perClientToday = new Map<string, { num: number; den: number }>();
  windowDays.forEach((civilDate) => {
    const isToday = civilDate === todayCivil;
    activeClients.forEach((client) => {
      const habits = habitsByClient.get(client.uid) ?? [];
      const habitById = new Map(habits.map((h) => [h.id, h]));
      const scheduledIds = new Set<string>();
      habits.forEach((h) => {
        if (habitScheduledOn(h, civilDate)) scheduledIds.add(h.id);
      });
      if (scheduledIds.size === 0) return;
      const dayLogs = logsByClientDay.get(`${client.uid}:${civilDate}`) ?? [];
      const counted = new Set<string>();
      dayLogs.forEach(({ habitId, data }) => {
        if (!scheduledIds.has(habitId)) return;
        if (counted.has(habitId)) return;
        const habit = habitById.get(habitId);
        if (habit && habitLogCountsAsCompleted(data, habit)) counted.add(habitId);
      });
      const weekBucket = perClientWeek.get(client.uid) ?? { num: 0, den: 0 };
      weekBucket.num += counted.size;
      weekBucket.den += scheduledIds.size;
      perClientWeek.set(client.uid, weekBucket);
      if (isToday) {
        perClientToday.set(client.uid, {
          num: counted.size,
          den: scheduledIds.size,
        });
      }
    });
  });

  const topPerformersWeek = pickTopPerformers(activeClients, perClientWeek);
  const topPerformersToday = pickTopPerformers(activeClients, perClientToday);

  return {
    habitDaily,
    workoutDaily,
    weekHabitPct: rollup(habitDaily),
    weekWorkoutPct: rollup(workoutDaily),
    topPerformersWeek,
    topPerformersToday,
    customExerciseCount,
  };
}

function pickTopPerformers(
  clients: ClientRosterEntry[],
  perClientHabit: Map<string, { num: number; den: number }>,
): PerformerRow[] {
  const rows: PerformerRow[] = [];
  perClientHabit.forEach((stat, uid) => {
    if (stat.den === 0) return;
    const pct = Math.round((stat.num / stat.den) * 100);
    if (pct <= 0) return;
    const client = clients.find((c) => c.uid === uid);
    if (!client) return;
    rows.push({
      uid,
      name: client.displayName,
      photoURL: client.photoURL,
      pct,
      numerator: stat.num,
      denominator: stat.den,
    });
  });
  rows.sort((a, b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return rows.slice(0, 3);
}

function emptyMetric(civilDate: string): DailyMetric {
  return {
    civilDate,
    weekdayLabel: weekdayLabel(civilDate),
    numerator: 0,
    denominator: 0,
    percentage: 0,
  };
}
