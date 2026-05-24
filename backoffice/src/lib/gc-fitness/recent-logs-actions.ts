"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { listClients } from "./client-roster";

export type RecentLogCategory = "habit" | "workout" | "photo" | "weight";

export interface RecentLogRow {
  id: string;
  category: RecentLogCategory;
  eventAt: string;
  clientId: string;
  clientName: string;
  title: string;
  detail: string;
  workoutLogId: string | null;
}

export interface WorkoutLogDetail {
  id: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  startedAt: string | null;
  completedAt: string | null;
  status: "completed" | "started";
  setCount: number;
  completedSetCount: number;
  exerciseCount: number;
  sets: Array<{
    index: number;
    exerciseName: string;
    reps: number | null;
    weight: number | null;
    completedAt: string | null;
  }>;
}

function asDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value && typeof value === "object") {
    const maybe = value as {
      _seconds?: unknown;
      _nanoseconds?: unknown;
      seconds?: unknown;
      nanoseconds?: unknown;
    };
    const rawSeconds =
      typeof maybe._seconds === "number"
        ? maybe._seconds
        : typeof maybe.seconds === "number"
          ? maybe.seconds
          : null;
    const rawNanos =
      typeof maybe._nanoseconds === "number"
        ? maybe._nanoseconds
        : typeof maybe.nanoseconds === "number"
          ? maybe.nanoseconds
          : 0;
    if (rawSeconds !== null) {
      const millis = rawSeconds * 1000 + Math.floor(rawNanos / 1_000_000);
      const d = new Date(millis);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Normalize both epoch-millis and epoch-seconds payloads.
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function asIso(value: unknown): string | null {
  return asDate(value)?.toISOString() ?? null;
}

function localizedText(value: unknown, fallback = "Untitled"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.en === "string" && localized.en.trim()) return localized.en;
    if (typeof localized.es === "string" && localized.es.trim()) return localized.es;
  }
  return fallback;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function boolCompleted(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    return v !== "0" && v !== "false" && v !== "pending";
  }
  return false;
}

function isoOrEpoch(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Whether a habit doc is scheduled on a given civil date. Mirrors the
 * `isHabitActiveOnDate` helper in client-daily-timeline-actions.ts —
 * inlined here to avoid widening the timeline module's export surface.
 * Supports the legacy Sun=1..Sat=7 weekday mapping alongside the canonical
 * Mon=1..Sun=7 so pre-fix habits render on the correct day.
 */
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

/**
 * Mirrors `logCountsAsCompleted` from habit-compliance.ts (kept inline so
 * recent-logs-actions doesn't add a deep import path). A log counts as
 * "done" iff it's not soft-deleted AND its `value` reads as completed for
 * the habit's type. Numeric habits with a targetValue require value >=
 * target; numeric habits without a target accept value > 0.
 */
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
        typeof habit?.targetValue === "number" ? (habit!.targetValue as number) : null;
      return target === null ? true : value >= target;
    }
    case "weight":
      return typeof value === "number" && Number.isFinite(value) && value > 0;
    case "binary":
    default:
      return value === true;
  }
}

export async function listRecentLogsForTrainer(): Promise<{
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string }>;
}> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clients = await listClients();
  const nameByClientId = new Map(clients.map((c) => [c.uid, c.displayName]));
  const clientList = clients.map((c) => ({ id: c.uid, name: c.displayName }));

  const workoutLogsPromise = db
    .collection(FirestoreCollections.workoutLogs)
    .where("trainerId", "==", trainer.uid)
    .limit(600)
    .get();

  // Some historical habit logs are missing/incorrect `coachId`.
  // Query per roster client instead of filtering by coachId so we include
  // those legacy rows.
  const habitLogPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", client.uid)
      .limit(200)
      .get(),
  );

  // Per-client fan-out for progress-photo uploads + body-weight logs.
  // Chat messages are intentionally NOT surfaced here — Phase 15 unread
  // badges (BADGE-04 sidebar global counter + per-thread pills) cover
  // the "client said something" surface natively.
  const photoPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.progressPhotos)
      .where("clientId", "==", client.uid)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  );
  const weightPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.users)
      .doc(client.uid)
      .collection("body_weight_logs")
      .orderBy("recordedAt", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  );

  // Habits master list — needed to compute "habits scheduled today" per
  // client for the "1/3 habits done today" badge appended to each habit
  // row. Bounded by clients × ~25 habits typical = small.
  const habitsPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", client.uid)
      .limit(50)
      .get()
      .catch(() => null),
  );

  const [
    workoutLogsSnap,
    habitLogsSnaps,
    photoSnaps,
    weightSnaps,
    habitsSnaps,
  ] = await Promise.all([
    workoutLogsPromise,
    Promise.all(habitLogPromises),
    Promise.all(photoPromises),
    Promise.all(weightPromises),
    Promise.all(habitsPromises),
  ]);

  // Rewrap as a flat array so the rest of the function (which expects
  // a single habitLogsSnaps[] flatten step) is unchanged.
  const _legacyHabitsSnapsRest = habitLogsSnaps;

  const habitLogDocs = _legacyHabitsSnapsRest.flatMap((snap) => snap.docs);

  const habitLogsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of habitLogDocs) {
    habitLogsById.set(doc.id, doc);
  }
  const habitLogs = Array.from(habitLogsById.values());

  const habitIds = new Set<string>();
  habitLogs.forEach((doc) => {
    const habitId = doc.get("habitId");
    if (typeof habitId === "string" && habitId.length > 0) {
      habitIds.add(habitId);
    }
  });

  // Build a per-client habits map AND populate habitNames in one pass —
  // the habits master fan-out (one query per client) is already done.
  const habitsByClientId = new Map<string, Record<string, unknown>[]>();
  const habitNames = new Map<string, string>();
  habitsSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = clients[idx];
    if (!client) return;
    const rows: Record<string, unknown>[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      rows.push({ ...data, id: doc.id });
      habitNames.set(doc.id, localizedText(data.name, "Habit"));
    });
    habitsByClientId.set(client.uid, rows);
  });
  // Fallback: any habitId referenced by a habit_log but not present in the
  // master snapshot (legacy or cross-coach) — fetch on demand via getAll.
  const missingHabitIds = Array.from(habitIds).filter(
    (id) => !habitNames.has(id),
  );
  if (missingHabitIds.length > 0) {
    const refs = missingHabitIds.map((id) =>
      db.collection(FirestoreCollections.habits).doc(id),
    );
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => {
      if (!doc.exists) return;
      habitNames.set(doc.id, localizedText(doc.get("name"), "Habit"));
    });
  }

  // 260524 — per-client habit progress for today. Map clientId → "done/total"
  // so each habit row can render "1/3 habits done today" + a celebratory
  // emoji when the client hits 100%. "today" uses the trainer's local zone
  // (Pitfall 1 acceptable here: this is a UX badge for the trainer, not a
  // wire format — falling back to UTC is harmless on edge cases).
  const todayCivil = civilDateToday(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const todayHabitProgress = new Map<string, { done: number; total: number }>();
  clients.forEach((client) => {
    const habits = habitsByClientId.get(client.uid) ?? [];
    const scheduledTodayIds = new Set<string>();
    habits.forEach((h) => {
      const id = typeof h.id === "string" ? h.id : "";
      if (id && habitScheduledOn(h, todayCivil)) {
        scheduledTodayIds.add(id);
      }
    });
    const habitById = new Map(
      habits.map((h) => [typeof h.id === "string" ? h.id : "", h]),
    );
    let done = 0;
    habitLogs.forEach((doc) => {
      const data = doc.data();
      if (data.clientId !== client.uid) return;
      const habitId = typeof data.habitId === "string" ? data.habitId : "";
      if (!scheduledTodayIds.has(habitId)) return;
      const logCivil = typeof data.civilDate === "string" ? data.civilDate : "";
      if (logCivil !== todayCivil) return;
      const habit = habitById.get(habitId);
      if (habit && habitLogCountsAsCompleted(data, habit)) done += 1;
    });
    if (scheduledTodayIds.size > 0) {
      todayHabitProgress.set(client.uid, {
        done,
        total: scheduledTodayIds.size,
      });
    }
  });

  const rows: RecentLogRow[] = [];

  workoutLogsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;

    const startedAt =
      asIso(data.startedAt) ??
      asIso(data.createdAt) ??
      asIso(data.updatedAt);
    if (!startedAt) return;

    const completedAt = asIso(data.completedAt);
    const status: "completed" | "started" = completedAt ? "completed" : "started";
    const templateName = localizedText(
      (data.templateSnapshot as { name?: unknown } | undefined)?.name,
      "Workout",
    );
    const sets = Array.isArray(data.sets) ? data.sets.length : 0;

    rows.push({
      id: `workout:${doc.id}`,
      category: "workout",
      eventAt: completedAt ?? startedAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title:
        status === "completed"
          ? `${nameByClientId.get(clientId) ?? clientId} - Workout completed: ${templateName}`
          : `${nameByClientId.get(clientId) ?? clientId} - Workout started: ${templateName}`,
      detail: `${templateName} · ${sets} sets`,
      workoutLogId: doc.id,
    });
  });

  habitLogs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;

    // 260522-ook — skip soft-deleted habit logs. The iOS surface's
    // `unrecordLog` (HabitRepository.swift) updates the doc with
    // `deleted: true` instead of hard-deleting, which kept the row
    // visible in the feed as a misleading "Habit updated / Pending
    // update" entry even though the client had explicitly un-checked
    // their previous mark. From the trainer's POV the cleanest
    // semantic is "the activity didn't happen", so the row disappears
    // rather than rendering as a pending action.
    if (data.deleted === true) return;

    // Use write-time first so "recent logs" reflects when the coach/client
    // actually changed the habit, not just the civil-date bucket timestamp.
    const eventAt =
      asIso(data.updatedAt) ??
      asIso(data.createdAt) ??
      asIso(data.loggedAt);
    if (!eventAt) return;

    const habitId = typeof data.habitId === "string" ? data.habitId : "";
    const habitName = habitNames.get(habitId) ?? "Habit";
    const completed = boolCompleted(data.value);
    const progress = todayHabitProgress.get(clientId);
    const isPerfectDay = progress && progress.total > 0 && progress.done >= progress.total;
    // "1/3 habits done today" suffix on the title; 🎯 prefix on a perfect day.
    const progressSuffix = progress
      ? `. ${progress.done}/${progress.total} habits done today`
      : "";
    const perfectPrefix = isPerfectDay ? "🎯 " : "";

    rows.push({
      id: `habit:${doc.id}`,
      category: "habit",
      eventAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title: completed
        ? `${perfectPrefix}${nameByClientId.get(clientId) ?? clientId} completed: ${habitName}${progressSuffix}`
        : `${nameByClientId.get(clientId) ?? clientId} updated: ${habitName}${progressSuffix}`,
      detail: completed ? "Completed" : "Pending update",
      workoutLogId: null,
    });
  });

  // 260524 — progress-photo uploads. The iOS check-in upload loop writes
  // one /progress_photos doc per angle (front + side + back), so a single
  // check-in surfaces as 3 docs. Group by (clientId, civilDate of the
  // check-in) so the trainer sees ONE row per session listing the angles
  // covered. Falls back to the createdAt civil date when checkInDate is
  // missing.
  type PhotoBucket = {
    clientId: string;
    civilDate: string;
    latestIso: string;
    angles: Set<string>;
    captions: Set<string>;
    docIds: string[];
  };
  const photoBuckets = new Map<string, PhotoBucket>();
  photoSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = clients[idx];
    if (!client) return;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const createdIso = asIso(data.createdAt) ?? asIso(data.checkInDate);
      if (!createdIso) return;
      const checkInCivil =
        typeof data.checkInDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.checkInDate)
          ? data.checkInDate.slice(0, 10)
          : civilDateFormat(
              new Date(createdIso),
              Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            );
      const key = `${client.uid}:${checkInCivil}`;
      let bucket = photoBuckets.get(key);
      if (!bucket) {
        bucket = {
          clientId: client.uid,
          civilDate: checkInCivil,
          latestIso: createdIso,
          angles: new Set(),
          captions: new Set(),
          docIds: [],
        };
        photoBuckets.set(key, bucket);
      }
      if (Date.parse(createdIso) > Date.parse(bucket.latestIso)) {
        bucket.latestIso = createdIso;
      }
      const angle = typeof data.angle === "string" ? data.angle : "photo";
      bucket.angles.add(angle);
      const caption = typeof data.caption === "string" ? data.caption.trim() : "";
      if (caption) bucket.captions.add(caption);
      bucket.docIds.push(doc.id);
    });
  });
  // Canonical order for the angles row so it always reads "front · side · back".
  const ANGLE_ORDER = ["front", "side", "back"];
  function sortAngles(angles: Set<string>): string[] {
    const inOrder = ANGLE_ORDER.filter((a) => angles.has(a));
    const extras = Array.from(angles).filter((a) => !ANGLE_ORDER.includes(a));
    return [...inOrder, ...extras];
  }
  photoBuckets.forEach((bucket) => {
    const angles = sortAngles(bucket.angles);
    const detail = bucket.captions.size > 0
      ? `${angles.join(" · ")} · ${Array.from(bucket.captions).join(" / ")}`
      : angles.join(" · ");
    const sortedDocIds = [...bucket.docIds].sort();
    rows.push({
      id: `photo:${bucket.clientId}:${bucket.civilDate}:${sortedDocIds[0] ?? "none"}`,
      category: "photo",
      eventAt: bucket.latestIso,
      clientId: bucket.clientId,
      clientName: nameByClientId.get(bucket.clientId) ?? bucket.clientId,
      title: `${nameByClientId.get(bucket.clientId) ?? bucket.clientId} - Uploaded progress photos`,
      detail,
      workoutLogId: null,
    });
  });

  // 260524 — body-weight logs. Each row is one measurement.
  weightSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = clients[idx];
    if (!client) return;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const eventAt = asIso(data.recordedAt) ?? asIso(data.createdAt);
      if (!eventAt) return;
      const kg = numeric(data.valueKg);
      if (kg === null) return;
      rows.push({
        id: `weight:${client.uid}:${doc.id}`,
        category: "weight",
        eventAt,
        clientId: client.uid,
        clientName: nameByClientId.get(client.uid) ?? client.uid,
        title: `${nameByClientId.get(client.uid) ?? client.uid} - Logged body weight`,
        detail: `${kg.toFixed(1)} kg`,
        workoutLogId: null,
      });
    });
  });

  rows.sort((a, b) => isoOrEpoch(b.eventAt) - isoOrEpoch(a.eventAt));

  return {
    logs: rows,
    clients: clientList,
  };
}

export async function getWorkoutLogDetail(
  workoutLogId: string,
): Promise<WorkoutLogDetail> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const logSnap = await db
    .collection(FirestoreCollections.workoutLogs)
    .doc(workoutLogId)
    .get();
  if (!logSnap.exists) {
    throw new Error("Workout log not found.");
  }

  const data = logSnap.data() as Record<string, unknown>;
  if (data.trainerId !== trainer.uid) {
    throw new Error("Forbidden");
  }

  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  if (!clientId) {
    throw new Error("Workout log missing client.");
  }

  const clientSnap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  const clientData = clientSnap.data() as { displayName?: string } | undefined;
  const clientName = clientData?.displayName ?? clientId;

  const workoutName = localizedText(
    (data.templateSnapshot as { name?: unknown } | undefined)?.name,
    "Workout",
  );
  const startedAt = asIso(data.startedAt);
  const completedAt = asIso(data.completedAt);

  const rawSets = Array.isArray(data.sets)
    ? (data.sets as Array<Record<string, unknown>>)
    : [];
  const templateExercises =
    (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
      ?.exercises ?? [];

  // iOS writes sets keyed by `exerciseId` (string), not by index — see
  // gc-fitness/GCFitness/Core/Firebase/WorkoutLogRepository.swift:303.
  const templateExerciseById = new Map<string, Record<string, unknown>>();
  for (const exercise of templateExercises) {
    const exId = typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
    if (exId) templateExerciseById.set(exId, exercise);
  }

  const sets = rawSets.map((set, index) => {
    const exerciseId = typeof set.exerciseId === "string" ? set.exerciseId : "";
    const templateExercise = exerciseId
      ? templateExerciseById.get(exerciseId)
      : undefined;
    const exerciseName = localizedText(templateExercise?.name, `Exercise ${index + 1}`);
    return {
      index: index + 1,
      exerciseName,
      reps: numeric(set.reps),
      // Wire field is `weight_kg` (iOS); keep `weight` as a legacy fallback.
      weight: numeric(set.weight_kg ?? set.weight),
      // Wire field is `completed_at` (iOS); keep `completedAt` as a legacy fallback.
      completedAt: asIso(set.completed_at ?? set.completedAt),
    };
  });

  return {
    id: logSnap.id,
    clientId,
    clientName,
    workoutName,
    startedAt,
    completedAt,
    status: completedAt ? "completed" : "started",
    setCount: sets.length,
    completedSetCount: sets.filter((s) => Boolean(s.completedAt)).length,
    exerciseCount: templateExercises.length,
    sets,
  };
}
