"use server";

import { gcFitnessFirestore, gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { civilDateFormat } from "./civil-date";
import { getTrainerTimezone } from "./trainer-timezone";
import { buildClientDailyTimelineDates } from "./client-daily-timeline-utils";
import type { ProgressPhotoRow } from "./progress-photo-actions";

export interface ClientDailyTimelineDay {
  date: string;
  workouts: Array<{
    id: string;
    name: string;
    status: string;
    scheduledFor: string;
    /**
     * Trainer's ORIGINAL civil-date when the client moved the workout
     * to a different day from the iOS app. Null when the workout is
     * still on its original slot. Drives the "Originalmente X, el
     * cliente lo movió a Y" disclaimer in the daily timeline cell.
     */
    originallyScheduledFor: string | null;
    scheduledTime: string | null;
    meetingNotes: string | null;
    // 260522-ki7 Task F: shared uuid across docs in a recurring series.
    // null on non-recurring assignments AND on legacy docs until backfill
    // (Task B). Consumers use presence to decide whether to render the
    // recurring radio in WorkoutAssignmentDeleteDialog.
    seriesId?: string | null;
  }>;
  workoutLogs: Array<{
    id: string;
    name: string;
    startedAt: string | null;
    setCount: number;
  }>;
  habits: Array<{
    id: string;
    name: string;
    completed: boolean;
    value: string;
    future: boolean;
  }>;
  reminders: Array<{
    id: string;
    name: string;
    time: string | null;
    cadence: string | null;
    completed: boolean;
    future: boolean;
  }>;
  photos: ProgressPhotoRow[];
  messages: Array<{
    id: string;
    body: string;
    sender: "coach" | "client";
    createdAt: string | null;
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string | null;
  }>;
}

export interface ClientDailyTimeline {
  days: ClientDailyTimelineDay[];
  notes: string;
}

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIso(v: unknown): string | null {
  return toDate(v)?.toISOString() ?? null;
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

async function signedUrlForPath(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const candidates = [
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.appspot.com` : undefined,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const bucketName of candidates) {
    try {
      const [url] = await gcFitnessStorage()
        .bucket(bucketName)
        .file(storagePath)
        .getSignedUrl({
          action: "read",
          expires: Date.now() + 60 * 60 * 1000,
        });
      return url;
    } catch {
      // Try next bucket candidate.
    }
  }

  return null;
}

/**
 * Parity-match of the iOS `HabitSchedule.isActive(_:on:)` filter in
 * `Packages/GCFitnessCore/Sources/GCFitnessCore/HabitSchedule.swift` (gc-fitness
 * commits 195f199 + aea7aca). Determines whether a habit is scheduled to
 * appear on `civilDate` ("YYYY-MM-DD") based on its `schedule*` fields.
 *
 * Same field semantics as Swift:
 *   - `startsOn` / `endsOn`: civil-date window bounds (inclusive).
 *   - `scheduleType`: "one-time" → only `startsOn`. Otherwise "recurring".
 *   - `scheduleCadence`: "daily" | "weekly" | "monthly".
 *   - `scheduleWeekdays`: Mon=1 … Sun=7 (ISO-like). JS `getUTCDay()` returns
 *     Sun=0 … Sat=6, mapped here to match Swift's `weekday == 1 ? 7 : weekday - 1`.
 *   - `scheduleMonthDays` (preferred, multi-day) or legacy `scheduleDayOfMonth`.
 */
function isHabitActiveOnDate(
  habit: Record<string, unknown>,
  civilDate: string,
): boolean {
  const startsOn =
    typeof habit.startsOn === "string" && habit.startsOn.length > 0
      ? habit.startsOn
      : null;
  const endsOn =
    typeof habit.endsOn === "string" && habit.endsOn.length > 0
      ? habit.endsOn
      : null;

  if (startsOn && civilDate < startsOn) {
    return false;
  }
  if (endsOn && civilDate > endsOn) {
    return false;
  }

  const scheduleType =
    habit.scheduleType === "one-time" ? "one-time" : "recurring";
  if (scheduleType === "one-time") {
    return startsOn ? civilDate === startsOn : true;
  }

  const cadence =
    habit.scheduleCadence === "weekly" ||
    habit.scheduleCadence === "monthly"
      ? habit.scheduleCadence
      : "daily";
  if (cadence === "daily") {
    return true;
  }
  const date = new Date(`${civilDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[])
      : [];
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    // Backward compatibility: older backoffice builds stored weekdays as
    // Sun=1..Sat=7. Current canonical mapping is Mon=1..Sun=7.
    // Accept both so pre-fix habits render on the correct days without
    // forcing an immediate data migration.
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

function createEmptyDay(date: string): ClientDailyTimelineDay {
  return {
    date,
    workouts: [],
    workoutLogs: [],
    habits: [],
    reminders: [],
    photos: [],
    messages: [],
    notes: [],
  };
}

/**
 * Verifies the coach owns the client AND returns the client's IANA timezone
 * for civil-day bucketing. Resolves to the client's stored
 * `/users/{clientId}.timezone` when present, otherwise the trainer's own
 * cookie tz (which itself falls back to "UTC"). Returning the tz here avoids
 * a second /users read per request.
 */
async function assertOwnsClient(coachId: string, clientId: string): Promise<string> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachId) {
    throw new Error("Forbidden");
  }
  const storedTz = snap.get("timezone");
  return (typeof storedTz === "string" && storedTz) || (await getTrainerTimezone());
}

export async function getClientDailyTimeline(
  clientId: string,
): Promise<ClientDailyTimeline> {
  const trainer = await getCurrentTrainer();
  const clientTz = await assertOwnsClient(trainer.uid, clientId);

  const db = gcFitnessFirestore();
  const dates = buildClientDailyTimelineDates(clientTz);
  const start = dates[0];
  const end = dates[dates.length - 1];
  const days = new Map<string, ClientDailyTimelineDay>(
    dates.map((date) => [date, createEmptyDay(date)]),
  );

  const [
    assignmentsSnap,
    workoutLogsSnap,
    habitsSnap,
    habitLogsSnap,
    photosSnap,
    messagesSnap,
    notesSnap,
  ] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("clientId", "==", clientId)
      .where("scheduledFor", ">=", start)
      .where("scheduledFor", "<=", end)
      .orderBy("scheduledFor", "asc")
      .get(),
    db
      .collection(FirestoreCollections.workoutLogs)
      .where("clientId", "==", clientId)
      .orderBy("startedAt", "desc")
      .limit(60)
      .get(),
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", clientId)
      .where("deleted", "==", false)
      .get(),
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", clientId)
      .where("civilDate", ">=", start)
      .orderBy("civilDate", "desc")
      .get(),
    db
      .collection(FirestoreCollections.progressPhotos)
      .where("clientId", "==", clientId)
      .orderBy("createdAt", "desc")
      .limit(90)
      .get(),
    db
      .collection(FirestoreCollections.chats)
      .doc(clientId)
      .collection(FirestoreCollections.messages)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get(),
    db
      .collection(FirestoreCollections.clientNotes)
      .doc(`${trainer.uid}_${clientId}`)
      .get(),
  ]);

  const habitNames = new Map<string, string>();
  const habitsById = new Map<string, Record<string, unknown>>();
  habitsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    habitNames.set(doc.id, localizedText(data.name, "Habit"));
    habitsById.set(doc.id, data);
  });

  const habitLogsByDay = new Map<string, Map<string, Record<string, unknown>>>();

  habitLogsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const day = String(data.civilDate ?? "");
    const habitId = String(data.habitId ?? "");
    if (!day || !habitId) return;
    if (!habitLogsByDay.has(day)) {
      habitLogsByDay.set(day, new Map());
    }
    habitLogsByDay.get(day)?.set(habitId, data);
  });

  assignmentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const day = String(data.scheduledFor ?? "");
    const row = days.get(day);
    if (!row) return;
    row.workouts.push({
      id: doc.id,
      name: localizedText((data.templateSnapshot as { name?: unknown } | undefined)?.name, "Workout"),
      status: String(data.status ?? "scheduled"),
      scheduledFor: day,
      originallyScheduledFor:
        typeof data.originallyScheduledFor === "string" &&
        data.originallyScheduledFor.length > 0 &&
        data.originallyScheduledFor !== day
          ? data.originallyScheduledFor
          : null,
      scheduledTime: typeof data.scheduledTime === "string" ? data.scheduledTime : null,
      meetingNotes: typeof data.meetingNotes === "string" ? data.meetingNotes : null,
      seriesId: typeof data.seriesId === "string" ? data.seriesId : null,
    });
  });

  workoutLogsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const startedAt = toDate(data.startedAt);
    if (!startedAt) return;
    const day = civilDateFormat(startedAt, clientTz);
    const row = days.get(day);
    if (!row) return;
    row.workoutLogs.push({
      id: doc.id,
      name: localizedText((data.templateSnapshot as { name?: unknown } | undefined)?.name, "Workout"),
      startedAt: startedAt.toISOString(),
      setCount: Array.isArray(data.sets) ? data.sets.length : 0,
    });
  });

  photosSnap.docs.forEach((doc) => {
    const data = doc.data();
    const checkInDate = typeof data.checkInDate === "string" ? data.checkInDate : null;
    const createdAt = toDate(data.createdAt);
    const day = checkInDate ?? (createdAt ? civilDateFormat(createdAt, clientTz) : "");
    const row = days.get(day);
    if (!row) return;
    row.photos.push({
      id: doc.id,
      caption: typeof data.caption === "string" ? data.caption : null,
      storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
      url: null,
      angle: data.angle === "front" || data.angle === "side" || data.angle === "back"
        ? data.angle
        : null,
      checkInDate,
      setId: typeof data.setId === "string" ? data.setId : null,
      createdAt: toIso(data.createdAt),
      takenAt: toIso(data.takenAt),
    });
  });

  messagesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const createdAt = toDate(data.createdAt);
    if (!createdAt) return;
    const day = civilDateFormat(createdAt, clientTz);
    const row = days.get(day);
    if (!row) return;
    const kind = String(data.kind ?? "text");
    row.messages.push({
      id: doc.id,
      body:
        typeof data.text === "string" && data.text.trim()
          ? data.text
          : kind === "image"
            ? "Image"
            : kind === "voice"
              ? "Voice message"
              : "Message",
      sender: data.senderId === trainer.uid ? "coach" : "client",
      createdAt: createdAt.toISOString(),
    });
  });

  const noteEntries = notesSnap.exists && Array.isArray(notesSnap.get("entries"))
    ? (notesSnap.get("entries") as Array<Record<string, unknown>>)
    : [];
  noteEntries.forEach((entry, index) => {
    const day = typeof entry.date === "string" ? entry.date : "";
    const row = days.get(day);
    if (!row) return;
    const createdAtValue = entry.createdAt as
      | { toDate?: () => Date }
      | string
      | null
      | undefined;
    row.notes.push({
      id: `${day}-${index}`,
      body: typeof entry.notes === "string" ? entry.notes : "",
      createdAt:
        createdAtValue && typeof createdAtValue === "object" && typeof createdAtValue.toDate === "function"
          ? createdAtValue.toDate().toISOString()
          : typeof createdAtValue === "string"
            ? createdAtValue
            : null,
    });
  });

  const todayCivil = civilDateFormat(new Date(), clientTz);
  for (const [day, row] of days.entries()) {
    for (const [habitId, habit] of habitsById.entries()) {
      // Mirror the iOS HabitSchedule.isActive filter so a monthly habit
      // (e.g. "Cargar FOTOS" on day 22) or a weekly habit (e.g. "Training"
      // Mon/Wed/Fri) doesn't surface on days that don't match its schedule.
      const scheduledForDay = isHabitActiveOnDate(habit, day);
      if (!scheduledForDay) continue;
      const log = habitLogsByDay.get(day)?.get(habitId);
      const completed = Boolean(log && log.deleted !== true && log.value !== false);
      const future = day > todayCivil;
      row.habits.push({
        id: habitId,
        name: habitNames.get(habitId) ?? "Habit",
        completed,
        value:
          typeof log?.value === "string" || typeof log?.value === "number"
            ? String(log?.value)
            : completed
              ? "done"
              : future
                ? "scheduled"
                : "pending",
        future,
      });
      if (habit.reminderEnabled === true) {
        row.reminders.push({
          id: `${habitId}-${day}`,
          name: habitNames.get(habitId) ?? "Reminder",
          time: typeof habit.reminderTime === "string" ? habit.reminderTime : null,
          cadence:
            habit.reminderCadence === "weekly" ||
            habit.reminderCadence === "monthly"
              ? habit.reminderCadence
              : "daily",
          completed,
          future,
        });
      }
    }
    row.habits.sort((a, b) => a.name.localeCompare(b.name));
    row.reminders.sort((a, b) => a.name.localeCompare(b.name));
    await Promise.all(
      row.photos.map(async (photo) => {
        photo.url = await signedUrlForPath(photo.storagePath);
      }),
    );
  }

  return {
    days: Array.from(days.values()),
    notes: "",
  };
}

export async function getClientDailyTimelineDay(
  clientId: string,
  civilDate: string,
): Promise<ClientDailyTimelineDay> {
  const trainer = await getCurrentTrainer();
  const clientTz = await assertOwnsClient(trainer.uid, clientId);

  const db = gcFitnessFirestore();
  const day = createEmptyDay(civilDate);
  const todayCivil = civilDateFormat(new Date(), clientTz);
  // The civilDate arg is a client-tz civil day, but the workoutLogs +
  // messages queries below use UTC instant bounds. A client-tz day can map
  // to a UTC instant window shifted by up to ±1 day, so we widen the query
  // bounds ±24h to fetch all candidate events, then filter in memory below
  // by the client-tz civil day. Without widening, boundary events near
  // local midnight would be dropped.
  const dayStart = new Date(Date.parse(`${civilDate}T00:00:00.000Z`) - 86400000);
  const dayEnd = new Date(Date.parse(`${civilDate}T23:59:59.999Z`) + 86400000);

  const [
    assignmentsSnap,
    workoutLogsSnap,
    habitsSnap,
    habitLogsSnap,
    photosSnap,
    messagesSnap,
    notesSnap,
  ] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("clientId", "==", clientId)
      .where("scheduledFor", "==", civilDate)
      .get(),
    db
      .collection(FirestoreCollections.workoutLogs)
      .where("clientId", "==", clientId)
      .where("startedAt", ">=", dayStart)
      .where("startedAt", "<=", dayEnd)
      .orderBy("startedAt", "desc")
      .get(),
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", clientId)
      .where("deleted", "==", false)
      .get(),
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", clientId)
      .where("civilDate", "==", civilDate)
      .get(),
    db
      .collection(FirestoreCollections.progressPhotos)
      .where("clientId", "==", clientId)
      .where("checkInDate", "==", civilDate)
      .get(),
    db
      .collection(FirestoreCollections.chats)
      .doc(clientId)
      .collection(FirestoreCollections.messages)
      .where("createdAt", ">=", dayStart)
      .where("createdAt", "<=", dayEnd)
      .orderBy("createdAt", "desc")
      .get(),
    db
      .collection(FirestoreCollections.clientNotes)
      .doc(`${trainer.uid}_${clientId}`)
      .get(),
  ]);

  const habitNames = new Map<string, string>();
  const habitsById = new Map<string, Record<string, unknown>>();
  habitsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    habitNames.set(doc.id, localizedText(data.name, "Habit"));
    habitsById.set(doc.id, data);
  });

  const habitLogsByHabit = new Map<string, Record<string, unknown>>();
  habitLogsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const habitId = String(data.habitId ?? "");
    if (!habitId) return;
    habitLogsByHabit.set(habitId, data);
  });

  assignmentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    day.workouts.push({
      id: doc.id,
      name: localizedText((data.templateSnapshot as { name?: unknown } | undefined)?.name, "Workout"),
      status: String(data.status ?? "scheduled"),
      scheduledFor: civilDate,
      originallyScheduledFor:
        typeof data.originallyScheduledFor === "string" &&
        data.originallyScheduledFor.length > 0 &&
        data.originallyScheduledFor !== civilDate
          ? data.originallyScheduledFor
          : null,
      scheduledTime: typeof data.scheduledTime === "string" ? data.scheduledTime : null,
      meetingNotes: typeof data.meetingNotes === "string" ? data.meetingNotes : null,
      seriesId: typeof data.seriesId === "string" ? data.seriesId : null,
    });
  });

  workoutLogsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const startedAt = toDate(data.startedAt);
    if (!startedAt) return;
    if (civilDateFormat(startedAt, clientTz) !== civilDate) return;
    day.workoutLogs.push({
      id: doc.id,
      name: localizedText((data.templateSnapshot as { name?: unknown } | undefined)?.name, "Workout"),
      startedAt: startedAt.toISOString(),
      setCount: Array.isArray(data.sets) ? data.sets.length : 0,
    });
  });

  photosSnap.docs.forEach((doc) => {
    const data = doc.data();
    const createdAt = toDate(data.createdAt);
    const dayKey = typeof data.checkInDate === "string"
      ? data.checkInDate
      : createdAt
        ? civilDateFormat(createdAt, clientTz)
        : "";
    if (dayKey !== civilDate) return;
    day.photos.push({
      id: doc.id,
      caption: typeof data.caption === "string" ? data.caption : null,
      storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
      url: null,
      angle: data.angle === "front" || data.angle === "side" || data.angle === "back"
        ? data.angle
        : null,
      checkInDate: typeof data.checkInDate === "string" ? data.checkInDate : null,
      setId: typeof data.setId === "string" ? data.setId : null,
      createdAt: toIso(data.createdAt),
      takenAt: toIso(data.takenAt),
    });
  });

  messagesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const createdAt = toDate(data.createdAt);
    if (!createdAt) return;
    if (civilDateFormat(createdAt, clientTz) !== civilDate) return;
    day.messages.push({
      id: doc.id,
      body:
        typeof data.text === "string" && data.text.trim()
          ? data.text
          : String(data.kind ?? "text") === "image"
            ? "Image"
            : String(data.kind ?? "text") === "voice"
              ? "Voice message"
              : "Message",
      sender: data.senderId === trainer.uid ? "coach" : "client",
      createdAt: createdAt.toISOString(),
    });
  });

  const noteEntries = notesSnap.exists && Array.isArray(notesSnap.get("entries"))
    ? (notesSnap.get("entries") as Array<Record<string, unknown>>)
    : [];
  noteEntries.forEach((entry, index) => {
    const dayKey = typeof entry.date === "string" ? entry.date : "";
    if (dayKey !== civilDate) return;
    const createdAtValue = entry.createdAt as
      | { toDate?: () => Date }
      | string
      | null
      | undefined;
    day.notes.push({
      id: `${dayKey}-${index}`,
      body: typeof entry.notes === "string" ? entry.notes : "",
      createdAt:
        createdAtValue && typeof createdAtValue === "object" && typeof createdAtValue.toDate === "function"
          ? createdAtValue.toDate().toISOString()
          : typeof createdAtValue === "string"
            ? createdAtValue
            : null,
    });
  });

  for (const [habitId, habit] of habitsById.entries()) {
    // Mirror the iOS HabitSchedule.isActive filter so a monthly habit
    // (e.g. "Cargar FOTOS" on day 22) or a weekly habit (e.g. "Training"
    // Mon/Wed/Fri) doesn't surface on days that don't match its schedule.
    const scheduledForDay = isHabitActiveOnDate(habit, civilDate);
    if (!scheduledForDay) continue;
    const log = habitLogsByHabit.get(habitId);
    const completed = Boolean(log && log.deleted !== true && log.value !== false);
    const future = civilDate > todayCivil;
    day.habits.push({
      id: habitId,
      name: habitNames.get(habitId) ?? "Habit",
      completed,
      value:
        typeof log?.value === "string" || typeof log?.value === "number"
          ? String(log?.value)
          : completed
            ? "done"
            : future
              ? "scheduled"
              : "pending",
      future,
    });
    if (habit.reminderEnabled === true) {
      day.reminders.push({
        id: `${habitId}-${civilDate}`,
        name: habitNames.get(habitId) ?? "Reminder",
        time: typeof habit.reminderTime === "string" ? habit.reminderTime : null,
        cadence:
          habit.reminderCadence === "weekly" ||
          habit.reminderCadence === "monthly"
            ? habit.reminderCadence
            : "daily",
        completed,
        future,
      });
    }
  }

  day.habits.sort((a, b) => a.name.localeCompare(b.name));
  day.reminders.sort((a, b) => a.name.localeCompare(b.name));
  await Promise.all(
    day.photos.map(async (photo) => {
      photo.url = await signedUrlForPath(photo.storagePath);
    }),
  );

  return day;
}
