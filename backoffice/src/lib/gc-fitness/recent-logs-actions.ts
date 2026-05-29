"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { listClients } from "./client-roster";
import { getTrainerTimezone } from "./trainer-timezone";

export type RecentLogCategory =
  | "habit"
  | "workout"
  | "reschedule"
  | "photo"
  | "weight"
  | "signup";

export interface RecentLogRow {
  id: string;
  category: RecentLogCategory;
  eventAt: string;
  clientId: string;
  clientName: string;
  title: string;
  detail: string;
  workoutLogId: string | null;
  /** Present only on workout rows — drives the sets / RPE / notes chips. */
  workout?: {
    completedSets: number;
    /** Sum of the snapshot's planned sets; null when the snapshot is absent. */
    plannedSets: number | null;
    /** Athlete self-reported effort 1–10, or null. */
    rpe: number | null;
    /** True when the athlete left post-workout notes. */
    hasNotes: boolean;
  };
}

export interface WorkoutLogDetail {
  id: string;
  clientId: string;
  clientName: string;
  /** IANA timezone of the CLIENT who performed the workout (e.g.
   *  "America/Argentina/Buenos_Aires"). Read from `/users/{clientId}.timezone`,
   *  falling back to the trainer's tz. All log timestamps must be rendered in
   *  this zone — the page is a server component, so a missing timeZone renders
   *  in the Vercel host tz (UTC). */
  clientTimezone: string;
  /** Coach (logged-in trainer) display name for the share card sub-line.
   *  Resolved from `/users/{trainerId}.displayName`. Null when unavailable
   *  — never a raw UID (the share card omits the coach segment gracefully). */
  coachName: string | null;
  workoutName: string;
  startedAt: string | null;
  completedAt: string | null;
  status: "completed" | "started";
  setCount: number;
  completedSetCount: number;
  exerciseCount: number;
  /** Stored workout duration (seconds), read from the log doc. iOS writes the
   *  authoritative elapsed time as `duration_seconds`; legacy `durationSeconds`
   *  camel fallback mirrors the existing weight_kg ?? weight pattern. The share
   *  card prefers this over completedAt − startedAt (which is unreliable).
   *  Null when the field is absent (e.g. an in-progress / legacy log). */
  durationSeconds: number | null;
  /** Athlete self-reported RPE (1-10), captured on the iOS post-workout
   *  summary. Optional; null when the user dismissed the slider. */
  rpe: number | null;
  /** Athlete self-reported free-form notes from the post-workout summary. */
  athleteNotes: string | null;
  sets: Array<{
    index: number;
    setLogId: string;
    exerciseId: string;
    exerciseName: string;
    reps: number | null;
    weight: number | null;
    /**
     * 26-03 — Per-set elapsed duration (seconds) for time-based
     * exercises. Snake-case wire field `duration_seconds` (iOS); legacy
     * `durationSeconds` camel fallback mirrors the existing
     * weight_kg ?? weight pattern. Null when the set was a reps-based
     * exercise (or a legacy log written before 26-04 ships).
     */
    durationSeconds: number | null;
    completedAt: string | null;
    /**
     * 260529-mrp — True when this set is a warmup (excluded from the share
     * card's Volumen / Series / top-set / 1RM math, mirroring iOS, which
     * skips warmups for those stats). Wire field `is_warmup` (iOS,
     * snake_case); `isWarmup` camel fallback mirrors the existing
     * weight_kg ?? weight / duration_seconds ?? durationSeconds pattern.
     * Defaults to false when absent (pre-warmup-flag logs).
     */
    isWarmup: boolean;
    /** True when this set matches a PR row in the parent workout log's prs[]. */
    isPR: boolean;
    /** Stored Epley estimated 1RM (kg) when isPR === true. */
    prEstimatedOneRM: number | null;
    /** Snapshot superset label (e.g. "A"); null for standalone exercises. */
    supersetGroup: string | null;
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
 * Format a `"YYYY-MM-DD"` civil-date as a Spanish weekday + day label
 * ("lunes 26 may"). UTC-anchored parse keeps the labelled weekday
 * stable across server / client timezones.
 */
function formatCivilDateEsAr(civilDate: string): string {
  const parts = civilDate.split("-");
  if (parts.length !== 3) return civilDate;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return civilDate;
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
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
  // Trainer-scoped assignments — used to surface the "client moved
  // workout from X to Y" reschedule activity. No orderBy keeps this on
  // the existing single-field trainerId index; we filter in memory to
  // the docs that carry originallyScheduledFor (always a small subset).
  const trainerAssignmentsPromise = db
    .collection(FirestoreCollections.workoutAssignments)
    .where("trainerId", "==", trainer.uid)
    .limit(600)
    .get();
  const usersSnapPromise = db
    .collection(FirestoreCollections.users)
    .where("coachId", "==", trainer.uid)
    .where("role", "==", "client")
    .limit(400)
    .get();

  // Some historical habit logs are missing/incorrect `coachId`.
  // Query per roster client instead of filtering by coachId so we include
  // those legacy rows.
  //
  // 260529 COST — window the per-client habit-log fan-out to a recent
  // civil-date horizon instead of an arbitrary `limit(200)`. This feed is
  // RECENT activity and the consumer below ALREADY skips any log lacking
  // `civilDate` (see latestLogByHabitDay), so a `civilDate` range drops no
  // doc the feed would have rendered — and it's MORE correct than the old
  // unordered limit(200) (which returned 200 arbitrary docs by id, not the
  // most recent, for a heavy logger). Served by the live
  // `habit_logs (clientId, civilDate)` index. `limit(200)` stays as a
  // backstop so behaviour never exceeds the prior worst case.
  const recentHabitWindowStartCivil = civilDateToday(
    await getTrainerTimezone(),
    new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
  );
  const habitLogPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", client.uid)
      .where("civilDate", ">=", recentHabitWindowStartCivil)
      .limit(200)
      .get()
      // 260529 RESILIENCE: the windowed query needs the
      // `habit_logs (clientId, civilDate)` composite index. While that index
      // is still BUILDING (or if it is ever dropped) the query throws
      // FAILED_PRECONDITION — and this fan-out has no other guard, so an
      // uncaught throw 500s BOTH the dashboard and recent-logs (both call
      // listRecentLogsForTrainer). Degrade to the pre-260529 unwindowed
      // query, always served by the single-field `clientId` index, so the
      // feed renders instead of crashing. Once the index is READY the
      // primary (cheaper) query succeeds and the fallback never runs.
      .catch(() =>
        db
          .collection(FirestoreCollections.habitLogs)
          .where("clientId", "==", client.uid)
          .limit(200)
          .get(),
      ),
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
    usersSnap,
    habitLogsSnaps,
    photoSnaps,
    weightSnaps,
    habitsSnaps,
    trainerAssignmentsSnap,
  ] = await Promise.all([
    workoutLogsPromise,
    usersSnapPromise,
    Promise.all(habitLogPromises),
    Promise.all(photoPromises),
    Promise.all(weightPromises),
    Promise.all(habitsPromises),
    trainerAssignmentsPromise,
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

  // 260524 — habit progress per (clientId, civilDate) so each habit row
  // can render the right day's status. Today rows show "X/Y habits done
  // today" + 🎯 on a perfect day; past rows show 🎯 only when the day
  // was perfect (no partial counts on history — too noisy). Computed
  // from data already in memory: no extra Firestore queries.
  //
  // 260528 — dedupe by (habitId, civilDate) FIRST. Legacy and re-toggle
  // flows can leave several docs targeting the same pair (older auto-id
  // doc + new composite-id doc, or two writes that raced under a flaky
  // connection). Without this dedupe, an old `value: true, deleted: false`
  // would still be counted toward `done` even after the client tapped
  // un-mark — because the un-mark only flipped one of the docs. Picking
  // the latest write (`updatedAt` if present, else `createdAt`) is the
  // canonical "what the user last said about this habit on this day".
  const todayCivil = civilDateToday(await getTrainerTimezone());

  function logTimestampMs(doc: FirebaseFirestore.QueryDocumentSnapshot): number {
    const iso =
      asIso(doc.get("updatedAt")) ??
      asIso(doc.get("createdAt")) ??
      asIso(doc.get("loggedAt"));
    if (!iso) return 0;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  const latestLogByHabitDay = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot
  >();
  habitLogs.forEach((doc) => {
    const data = doc.data();
    const hid = typeof data.habitId === "string" ? data.habitId : "";
    const civ = typeof data.civilDate === "string" ? data.civilDate : "";
    if (!hid || !civ) return;
    const pairKey = `${hid}:${civ}`;
    const existing = latestLogByHabitDay.get(pairKey);
    if (!existing || logTimestampMs(doc) > logTimestampMs(existing)) {
      latestLogByHabitDay.set(pairKey, doc);
    }
  });

  const logsByClientDay = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot[]
  >();
  latestLogByHabitDay.forEach((doc) => {
    const data = doc.data();
    if (data.deleted === true) return;
    const cid = typeof data.clientId === "string" ? data.clientId : "";
    const civ = typeof data.civilDate === "string" ? data.civilDate : "";
    if (!cid || !civ) return;
    const key = `${cid}:${civ}`;
    const bucket = logsByClientDay.get(key);
    if (bucket) bucket.push(doc);
    else logsByClientDay.set(key, [doc]);
  });
  const habitProgressByDay = new Map<
    string,
    { done: number; total: number }
  >();
  // Walk by (clientId, civilDate) — including days where the bucket is
  // empty because every habit got toggled off. Without the empty-day
  // pass, a day where the user un-marked every habit would silently fall
  // back to `progress=undefined`, and the calling row code would skip
  // any "0/Y" suffix or render stale state from the last refresh.
  const dayKeysWithScheduledHabits = new Set<string>();
  habitsByClientId.forEach((habits, clientId) => {
    if (habits.length === 0) return;
    // We only emit progress for civil dates we actually observed logs on
    // OR for `today` — the recent-logs feed never renders a row for a
    // day that had no habit activity at all.
    const observedKeys = Array.from(logsByClientDay.keys()).filter((k) =>
      k.startsWith(`${clientId}:`),
    );
    observedKeys.forEach((k) => dayKeysWithScheduledHabits.add(k));
    // Always evaluate today so the row generated for any older log that
    // happens to be from today renders an accurate "0/Y today" suffix.
    dayKeysWithScheduledHabits.add(`${clientId}:${todayCivil}`);
    void habits;
  });
  dayKeysWithScheduledHabits.forEach((key) => {
    const sep = key.indexOf(":");
    if (sep < 0) return;
    const clientId = key.slice(0, sep);
    const civilDate = key.slice(sep + 1);
    const habits = habitsByClientId.get(clientId) ?? [];
    if (habits.length === 0) return;
    const habitById = new Map(
      habits.map((h) => [typeof h.id === "string" ? h.id : "", h]),
    );
    const scheduledIds = new Set<string>();
    habits.forEach((h) => {
      const id = typeof h.id === "string" ? h.id : "";
      if (id && habitScheduledOn(h, civilDate)) scheduledIds.add(id);
    });
    if (scheduledIds.size === 0) return;
    const dayLogs = logsByClientDay.get(key) ?? [];
    let done = 0;
    for (const doc of dayLogs) {
      const data = doc.data();
      const habitId = typeof data.habitId === "string" ? data.habitId : "";
      if (!scheduledIds.has(habitId)) continue;
      const habit = habitById.get(habitId);
      if (habit && habitLogCountsAsCompleted(data, habit)) done += 1;
    }
    habitProgressByDay.set(key, { done, total: scheduledIds.size });
  });

  const rows: RecentLogRow[] = [];

  usersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = doc.id;
    if (!nameByClientId.has(clientId)) return;
    const createdAt = asIso(data.createdAt);
    if (!createdAt) return;
    rows.push({
      id: `signup:${clientId}`,
      category: "signup",
      eventAt: createdAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title: `${nameByClientId.get(clientId) ?? clientId} completed first sign-in`,
      detail: "Pending client converted to active user",
      workoutLogId: null,
    });
  });

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
    const snapshotExercises = (
      data.templateSnapshot as { exercises?: unknown } | undefined
    )?.exercises;
    const plannedSets = Array.isArray(snapshotExercises)
      ? (snapshotExercises as Array<{ sets?: unknown }>).reduce(
          (sum, ex) => sum + (typeof ex.sets === "number" ? ex.sets : 0),
          0,
        )
      : 0;
    const rpe =
      typeof data.rpe === "number" &&
      Number.isFinite(data.rpe) &&
      data.rpe >= 1 &&
      data.rpe <= 10
        ? Math.round(data.rpe)
        : null;
    const hasNotes =
      typeof data.notes === "string" && data.notes.trim().length > 0;
    const setsLabel =
      plannedSets > 0 ? `${sets}/${plannedSets} sets` : `${sets} sets`;

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
      detail: `${templateName} · ${setsLabel}`,
      workoutLogId: doc.id,
      workout: {
        completedSets: sets,
        plannedSets: plannedSets > 0 ? plannedSets : null,
        rpe,
        hasNotes,
      },
    });
  });

  // Reschedule activity — any trainer-owned assignment carrying a
  // non-empty `originallyScheduledFor` that differs from `scheduledFor`
  // means the athlete shifted the workout from the iOS surface (either
  // via the calendar long-press or the "start and move to today" flow).
  // We surface this as its own feed entry so the trainer sees the
  // change without having to compare days manually.
  trainerAssignmentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    const originallyScheduledFor =
      typeof data.originallyScheduledFor === "string"
        ? data.originallyScheduledFor
        : "";
    if (!scheduledFor || !originallyScheduledFor) return;
    if (scheduledFor === originallyScheduledFor) return;
    // updatedAt is bumped by every assignment write, so it tracks the
    // moment the move (or the most recent reschedule + lifecycle flip)
    // landed. Fall back to createdAt for ancient docs lacking the field.
    const eventAt = asIso(data.updatedAt) ?? asIso(data.createdAt);
    if (!eventAt) return;
    const templateName = localizedText(
      (data.templateSnapshot as { name?: unknown } | undefined)?.name,
      "Workout",
    );
    const fromLabel = formatCivilDateEsAr(originallyScheduledFor);
    const toLabel = formatCivilDateEsAr(scheduledFor);
    rows.push({
      id: `reschedule:${doc.id}`,
      category: "reschedule",
      eventAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title: `${nameByClientId.get(clientId) ?? clientId} moved ${templateName} from ${fromLabel} to ${toLabel}`,
      detail: `Originally ${fromLabel} → ${toLabel}`,
      workoutLogId: null,
    });
  });

  // 260528 — iterate the LATEST log per (habitId, civilDate) instead of
  // every raw habit_log doc. Duplicates from legacy auto-id writes were
  // emitting multiple rows for the same pair (the user saw two
  // "completed: 1 Fruit" entries on the feed) AND the older duplicate
  // could still count toward `done` because it carried `value: true`
  // even after the user un-marked the newer one. See the dedupe note
  // upstream of the bucket builder.
  latestLogByHabitDay.forEach((doc) => {
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
    // Use the LOG's civilDate (not "today") so historical rows reflect
    // their own day's status — never today's. This was the BUG: a Tuesday
    // row was showing Thursday's "1/3 today" counter.
    const habitCivilDate =
      typeof data.civilDate === "string" ? data.civilDate : "";
    const progress = habitCivilDate
      ? habitProgressByDay.get(`${clientId}:${habitCivilDate}`)
      : undefined;
    const isPerfectDay =
      progress && progress.total > 0 && progress.done >= progress.total;
    const isToday = habitCivilDate === todayCivil;
    let titlePrefix = "";
    let titleSuffix = "";
    if (progress && isToday) {
      titleSuffix = `. ${progress.done}/${progress.total} habits done today`;
      if (isPerfectDay) titlePrefix = "🎯 ";
    } else if (isPerfectDay) {
      // Past day that hit 100% — celebrate, but no partial counts on history.
      titlePrefix = "🎯 ";
      titleSuffix = `. All ${progress!.total} habits done that day`;
    }

    rows.push({
      id: `habit:${doc.id}`,
      category: "habit",
      eventAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title: completed
        ? `${titlePrefix}${nameByClientId.get(clientId) ?? clientId} completed: ${habitName}${titleSuffix}`
        : `${nameByClientId.get(clientId) ?? clientId} updated: ${habitName}${titleSuffix}`,
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
  // Resolved once before the (sync) forEach — getTrainerTimezone() is async
  // and cannot be awaited inside the callback.
  const photoTrainerTz = await getTrainerTimezone();
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
          : civilDateFormat(new Date(createdIso), photoTrainerTz);
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

  return buildWorkoutLogDetail(db, trainer.uid, logSnap.id, data);
}

/**
 * 260529-ltm — fetch the COMPLETED workout-log's detail BY assignmentId,
 * powering the calendar share card's "completed → share actuals" branch.
 *
 * The calendar dialog only knows the assignmentId (not the logId), so we look
 * up the log via the log's `assignmentId` FK — the SAME FK the month view keys
 * its logStatusByAssignment map on. Returns the most-recently-started
 * completed log when several exist; null when none.
 *
 * NO new composite index: we query the EXISTING single-field `assignmentId`
 * equality index (Firestore auto-indexes every single field), then filter to
 * `status === "completed"` and pick the newest by startedAt IN MEMORY. Adding
 * `.where("status","==","completed").orderBy("startedAt","desc")` would have
 * required a new (assignmentId, status, startedAt) composite — which we must
 * NOT add (it lives in the gc-fitness repo's firestore.indexes.json, off-limits
 * here). The per-assignment log count is tiny (1–2 docs), so the in-memory
 * filter is free.
 */
export async function getWorkoutLogDetailByAssignment(
  assignmentId: string,
): Promise<WorkoutLogDetail | null> {
  if (!assignmentId) return null;
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("assignmentId", "==", assignmentId)
    .get();
  if (snap.empty) return null;

  // Trainer-ownership + completed filter in memory (see index note above).
  const completed = snap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    if (data.trainerId !== trainer.uid) return false;
    // A log is "completed" when it carries a completedAt (status mirrors it).
    return data.status === "completed" || asIso(data.completedAt) !== null;
  });
  if (completed.length === 0) return null;

  // Most recent by startedAt (fall back to completedAt), so re-logged
  // assignments share the latest actuals.
  completed.sort((a, b) => {
    const aData = a.data() as Record<string, unknown>;
    const bData = b.data() as Record<string, unknown>;
    const aMs = isoOrEpoch(asIso(aData.startedAt) ?? asIso(aData.completedAt));
    const bMs = isoOrEpoch(asIso(bData.startedAt) ?? asIso(bData.completedAt));
    return bMs - aMs;
  });

  const chosen = completed[0];
  return buildWorkoutLogDetail(
    db,
    trainer.uid,
    chosen.id,
    chosen.data() as Record<string, unknown>,
  );
}

/**
 * Single builder for `WorkoutLogDetail` — shared by `getWorkoutLogDetail` (by
 * logId) and `getWorkoutLogDetailByAssignment` (by assignmentId FK). Callers
 * are responsible for the existence + trainer-ownership checks BEFORE calling
 * this (both paths verify `trainerId === trainerUid`).
 */
async function buildWorkoutLogDetail(
  db: FirebaseFirestore.Firestore,
  trainerUid: string,
  logId: string,
  data: Record<string, unknown>,
): Promise<WorkoutLogDetail> {
  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  if (!clientId) {
    throw new Error("Workout log missing client.");
  }

  const clientSnap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  const clientData = clientSnap.data() as { displayName?: string } | undefined;
  const clientName = clientData?.displayName ?? clientId;
  // Render all log timestamps in the CLIENT's timezone (mirrors the
  // assertOwnsClient pattern in client-daily-timeline-actions.ts): prefer the
  // client's stored IANA tz, else fall back to the trainer's. Without this the
  // server component formats in UTC and the date/times are wrong (#tz).
  const storedClientTz = clientSnap.get("timezone");
  const clientTimezone =
    (typeof storedClientTz === "string" && storedClientTz) ||
    (await getTrainerTimezone());

  // 260529-ltm — the logged-in trainer IS the coach. Resolve their
  // displayName for the share card sub-line. Degrade to null (never a raw
  // UID) when the doc/field is missing — the card omits the coach segment.
  const trainerSnap = await db
    .collection(FirestoreCollections.users)
    .doc(trainerUid)
    .get();
  const rawCoachName = trainerSnap.get("displayName");
  const coachName =
    typeof rawCoachName === "string" && rawCoachName.trim().length > 0
      ? rawCoachName.trim()
      : null;

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

  // Map set_log_id → PR record so we can flag PR sets in the UI without a
  // second query. Per PRRecord schema, every PR carries `set_log_id`.
  const rawPrs = Array.isArray(data.prs)
    ? (data.prs as Array<Record<string, unknown>>)
    : [];
  const prBySetLogId = new Map<string, { estimatedOneRM: number | null }>();
  for (const pr of rawPrs) {
    const setLogId =
      typeof pr.set_log_id === "string"
        ? pr.set_log_id
        : typeof pr.setLogId === "string"
          ? pr.setLogId
          : "";
    if (!setLogId) continue;
    const e1rm = numeric(pr.estimated_one_rm ?? pr.estimatedOneRM);
    prBySetLogId.set(setLogId, { estimatedOneRM: e1rm });
  }

  const sets = rawSets.map((set, index) => {
    const exerciseId = typeof set.exerciseId === "string" ? set.exerciseId : "";
    const templateExercise = exerciseId
      ? templateExerciseById.get(exerciseId)
      : undefined;
    const exerciseName = localizedText(templateExercise?.name, `Exercise ${index + 1}`);
    const setLogId = typeof set.id === "string" ? set.id : "";
    const pr = setLogId ? prBySetLogId.get(setLogId) : undefined;
    return {
      index: index + 1,
      setLogId,
      exerciseId,
      exerciseName,
      reps: numeric(set.reps),
      // Wire field is `weight_kg` (iOS); keep `weight` as a legacy fallback.
      weight: numeric(set.weight_kg ?? set.weight),
      // 26-03 — Wire field is `duration_seconds` (iOS, snake_case per
      // PATTERNS.md §15 + Shared 3); keep `durationSeconds` as a
      // legacy/camel fallback mirroring the weight_kg ?? weight pattern
      // above. Null when the set was reps-based or pre-26-04 (no field
      // on the doc).
      durationSeconds: numeric(set.duration_seconds ?? set.durationSeconds),
      // Wire field is `completed_at` (iOS); keep `completedAt` as a legacy fallback.
      completedAt: asIso(set.completed_at ?? set.completedAt),
      // 260529-mrp — Wire field is `is_warmup` (iOS, snake_case); keep
      // `isWarmup` as a camel fallback mirroring the weight_kg ?? weight
      // pattern. The share card excludes warmups from Volumen / Series /
      // top-set / 1RM, matching the iOS twin.
      isWarmup: Boolean(set.is_warmup ?? set.isWarmup),
      isPR: Boolean(pr),
      prEstimatedOneRM: pr?.estimatedOneRM ?? null,
      supersetGroup:
        typeof templateExercise?.supersetGroup === "string" &&
        (templateExercise.supersetGroup as string).trim().length > 0
          ? (templateExercise.supersetGroup as string).trim()
          : null,
    };
  });

  const rpeRaw = numeric(data.rpe);
  const rpe =
    rpeRaw !== null && Number.isInteger(rpeRaw) && rpeRaw >= 1 && rpeRaw <= 10
      ? rpeRaw
      : null;
  const athleteNotes =
    typeof data.notes === "string" && data.notes.trim().length > 0
      ? data.notes.trim()
      : null;

  return {
    id: logId,
    clientId,
    clientName,
    clientTimezone,
    coachName,
    workoutName,
    startedAt,
    completedAt,
    status: completedAt ? "completed" : "started",
    setCount: sets.length,
    completedSetCount: sets.filter((s) => Boolean(s.completedAt)).length,
    exerciseCount: templateExercises.length,
    // Wire field is `duration_seconds` (iOS, snake_case); keep `durationSeconds`
    // as a legacy/camel fallback mirroring the weight_kg ?? weight pattern. This
    // is the authoritative stored elapsed time the share card prefers.
    durationSeconds: numeric(data.duration_seconds ?? data.durationSeconds),
    rpe,
    athleteNotes,
    sets,
  };
}
