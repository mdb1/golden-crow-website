"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { listClients, type ClientRosterEntry } from "./client-roster";

export interface DailyMetric {
  civilDate: string;
  weekdayLabel: string;
  numerator: number;
  denominator: number;
  percentage: number;
}

export interface CoachPulse {
  habitDaily: DailyMetric[];
  workoutDaily: DailyMetric[];
  weekHabitPct: number;
  weekWorkoutPct: number;
  atRiskCount: number;
  weeklyVolumeKg: number;
  weeklyVolumeSets: number;
  topPerformer: { uid: string; name: string; pct: number } | null;
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
  const startsOn =
    typeof habit.startsOn === "string" && habit.startsOn.length > 0
      ? habit.startsOn
      : null;
  const endsOn =
    typeof habit.endsOn === "string" && habit.endsOn.length > 0
      ? habit.endsOn
      : null;
  if (startsOn && civilDate < startsOn) return false;
  if (endsOn && civilDate > endsOn) return false;

  const scheduleType =
    habit.scheduleType === "one-time" ? "one-time" : "recurring";
  if (scheduleType === "one-time") {
    return startsOn ? civilDate === startsOn : true;
  }
  const cadence =
    habit.scheduleCadence === "weekly" || habit.scheduleCadence === "monthly"
      ? habit.scheduleCadence
      : "daily";
  if (cadence === "daily") return true;
  const date = new Date(`${civilDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[])
      : [];
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const legacyWeekday = weekday === 7 ? 1 : weekday + 1;
    return weekdays.includes(weekday) || weekdays.includes(legacyWeekday);
  }
  const monthDays = Array.isArray(habit.scheduleMonthDays)
    ? (habit.scheduleMonthDays as number[])
    : typeof habit.scheduleDayOfMonth === "number"
      ? [habit.scheduleDayOfMonth]
      : [1];
  return monthDays.includes(date.getUTCDate());
}

function habitLogCountsAsCompleted(
  data: Record<string, unknown>,
  habit: Record<string, unknown> | undefined,
): boolean {
  if (data.deleted === true) return false;
  const value = data.value;
  const habitType =
    typeof habit?.type === "string" ? (habit!.type as string) : "binary";
  switch (habitType) {
    case "multi-choice":
      return typeof value === "string" && value.trim().length > 0;
    case "numeric": {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return false;
      }
      const target =
        typeof habit?.targetValue === "number"
          ? (habit!.targetValue as number)
          : null;
      return target === null ? true : value >= target;
    }
    case "weight":
      return typeof value === "number" && Number.isFinite(value) && value > 0;
    case "binary":
    default:
      return value === true;
  }
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
  const trainerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
      atRiskCount: 0,
      weeklyVolumeKg: 0,
      weeklyVolumeSets: 0,
      topPerformer: null,
      customExerciseCount: 0,
    };
  }

  const habitsPromises = activeClients.map((client) =>
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", client.uid)
      .limit(50)
      .get()
      .catch(() => null),
  );
  const habitLogsPromises = activeClients.map((client) =>
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", client.uid)
      .where("civilDate", ">=", windowStart)
      .get()
      .catch(() => null),
  );
  const assignmentsPromise = db
    .collection(FirestoreCollections.workoutAssignments)
    .where("trainerId", "==", trainer.uid)
    .where("scheduledFor", ">=", windowStart)
    .get()
    .catch(() => null);
  const workoutLogsPromise = db
    .collection(FirestoreCollections.workoutLogs)
    .where("trainerId", "==", trainer.uid)
    .orderBy("startedAt", "desc")
    .limit(400)
    .get()
    .catch(() => null);
  const customExercisesPromise = db
    .collection(FirestoreCollections.exercises)
    .where("source", "==", "trainer")
    .where("ownerId", "==", trainer.uid)
    .count()
    .get()
    .catch(() => null);

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

  // ===== Volume across week (completed sets only) =====
  let weeklyVolumeKg = 0;
  let weeklyVolumeSets = 0;
  logsInWindow.forEach((row) => {
    row.sets.forEach((s) => {
      if (!s.completed) return;
      weeklyVolumeSets += 1;
      if (s.weight > 0 && s.reps > 0) weeklyVolumeKg += s.weight * s.reps;
    });
  });

  // ===== At risk: no activity in 3+ days =====
  const atRiskCutoffMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const latestActivityByClient = new Map<string, number>();
  logsInWindow.forEach((row) => {
    const ms = row.startedAt.getTime();
    const prev = latestActivityByClient.get(row.clientId) ?? 0;
    if (ms > prev) latestActivityByClient.set(row.clientId, ms);
  });
  habitLogsSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = activeClients[idx]!;
    snap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (data.deleted === true) return;
      const t =
        asDate(data.loggedAt) ??
        asDate(data.updatedAt) ??
        asDate(data.createdAt);
      if (!t) return;
      const ms = t.getTime();
      const prev = latestActivityByClient.get(client.uid) ?? 0;
      if (ms > prev) latestActivityByClient.set(client.uid, ms);
    });
  });
  const atRiskCount = activeClients.reduce((acc, client) => {
    const latest = latestActivityByClient.get(client.uid) ?? 0;
    return latest < atRiskCutoffMs ? acc + 1 : acc;
  }, 0);

  // ===== Top performer (highest combined % over the week) =====
  const perClientHabit = new Map<string, { num: number; den: number }>();
  windowDays.forEach((civilDate) => {
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
      const bucket = perClientHabit.get(client.uid) ?? { num: 0, den: 0 };
      bucket.num += counted.size;
      bucket.den += scheduledIds.size;
      perClientHabit.set(client.uid, bucket);
    });
  });

  const topPerformer = pickTopPerformer(activeClients, perClientHabit);

  return {
    habitDaily,
    workoutDaily,
    weekHabitPct: rollup(habitDaily),
    weekWorkoutPct: rollup(workoutDaily),
    atRiskCount,
    weeklyVolumeKg: Math.round(weeklyVolumeKg),
    weeklyVolumeSets,
    topPerformer,
    customExerciseCount,
  };
}

function pickTopPerformer(
  clients: ClientRosterEntry[],
  perClientHabit: Map<string, { num: number; den: number }>,
): CoachPulse["topPerformer"] {
  let best: { uid: string; name: string; pct: number } | null = null;
  perClientHabit.forEach((stat, uid) => {
    if (stat.den === 0) return;
    const pct = Math.round((stat.num / stat.den) * 100);
    if (!best || pct > best.pct) {
      const client = clients.find((c) => c.uid === uid);
      if (!client) return;
      best = { uid, name: client.displayName, pct };
    }
  });
  return best;
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
