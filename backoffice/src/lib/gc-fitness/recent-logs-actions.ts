"use server";

import { FieldPath } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentAdmin, getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { listClients, type ClientRosterEntry } from "./client-roster";
import { isHabitScheduledOn } from "./habit-schedule";
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
  /** Client profile photo (`users/{uid}.photoURL`) — Google photo or Storage
   *  upload, or null. Rendered as a cached avatar next to the client name. */
  clientPhotoURL: string | null;
  title: string;
  detail: string;
  workoutLogId: string | null;
  /** Habit rows only — the habit's TARGET civil date ("YYYY-MM-DD"), set ONLY
   *  when the completion was BACKDATED (marked on a different civil day than the
   *  habit belongs to). The iOS app lets clients tick past-day habits, so a
   *  May-29 habit marked May 30 would otherwise read as a May-30 activity. The
   *  feed renders this as a "For <date>" badge so the trainer sees which day the
   *  habit is actually for. Absent on on-time completions and non-habit rows. */
  forCivilDate?: string;
  /** Present only on workout rows — drives the sets / RPE / notes chips. */
  workout?: {
    completedSets: number;
    /** Sum of the snapshot's planned sets; null when the snapshot is absent. */
    plannedSets: number | null;
    /** Athlete self-reported effort 1–10, or null. */
    rpe: number | null;
    /** True when the athlete left post-workout notes. */
    hasNotes: boolean;
    /** Origin of the workout log: coach-run backoffice session or client-run iOS session. */
    source?: "coach" | "client";
  };
}

/**
 * Return shape for the recent-activity feed. `nextCursor` / `hasMore` drive the
 * single-client time-cursor pagination (260531-fwc); they are `null` / `false`
 * for the legacy trainer-wide path (which returns the full unpaginated set).
 */
export interface RecentLogsResult {
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string; photoURL: string | null }>;
  /** ISO `eventAt` of the last returned row — pass back as the next page cursor. */
  nextCursor: string | null;
  /** True when another page may exist (caller can request more). */
  hasMore: boolean;
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
  status: "completed";
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
  /** Origin of the workout log: coach-run backoffice session or client-run iOS session. */
  source?: "coach" | "client";
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
  return isHabitScheduledOn(habit, civilDate);
}

/**
 * Mirrors `logCountsAsCompleted` from habit-compliance.ts (kept inline so
 * recent-logs-actions doesn't add a deep import path). Habits are binary-only:
 * a log counts as "done" iff it isn't soft-deleted AND its `value` is `true`.
 */
function habitLogCountsAsCompleted(
  data: Record<string, unknown>,
  _habit: Record<string, unknown> | undefined,
): boolean {
  if (data.deleted === true) return false;
  return data.value === true;
}

/**
 * Shared core for the recent-activity feed. Builds the row set for a given
 * trainer id and an EXPLICIT client roster subset — both passed in (not
 * resolved from the session) so the same logic serves three callers:
 *   - listRecentLogsForTrainer()       → full roster, trainer session
 *   - listRecentLogsForClient(id)      → single client, trainer session
 *   - listRecentLogsForClientAsAdmin() → single client, admin god-mode
 *
 * Scoping to a single client needs NO query change: every row builder below
 * filters by `nameByClientId.has(clientId)`, and the per-client fan-outs
 * iterate `params.clients` — so a one-element roster yields exactly that
 * client's activity. `trainerId` scopes the trainer-wide workout-log /
 * assignment / signup queries (for god-mode it is the coach's uid).
 */
async function buildRecentLogs(params: {
  trainerId: string;
  clients: ClientRosterEntry[];
  timezone: string;
  /**
   * 260531-fwc — time-cursor pagination. When present, every source switches
   * from the trainer-wide `limit(600)` scans to index-safe `where(clientId==)`
   * per-client cursor queries bounded to `pageSize` (fanned out across the
   * roster — works for one client OR many). Absent ⇒ the legacy trainer-wide
   * load-everything path (still used by the dashboard), unchanged.
   *
   * `typeFilter` (optional) restricts the feed to ONE category server-side by
   * only querying that source — so a "photos" filter never reads workout logs.
   */
  page?: {
    cursor: string | null;
    pageSize: number;
    typeFilter?: RecentLogCategory | null;
  };
}): Promise<RecentLogsResult> {
  const db = gcFitnessFirestore();

  const clients = params.clients;
  const nameByClientId = new Map(clients.map((c) => [c.uid, c.displayName]));
  const photoByClientId = new Map<string, string | null>(
    clients.map((c) => [c.uid, c.photoURL]),
  );
  const clientList = clients.map((c) => ({
    id: c.uid,
    name: c.displayName,
    photoURL: c.photoURL,
  }));

  const pageMode = params.page ?? null;

  // Only `.docs` is read off these downstream, so a structural type lets page
  // mode hand back merged per-client docs or an empty `{ docs: [] }`.
  let workoutLogsSnap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] };
  let usersSnap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] };
  let habitLogsSnaps: FirebaseFirestore.QuerySnapshot[];
  let photoSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let weightSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let habitsSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let trainerAssignmentsSnap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] };
  // Set in page mode: true when any time-series source returned a FULL page,
  // i.e. there may be older rows beyond this window.
  let anySourceFull = false;

  if (pageMode) {
    // 260531-fwc — time-cursor window, fanned out PER client across the roster
    // (one client or many). Each source is queried newest-first, bounded to
    // `pageSize`, filtered to `field <= cursor` after page 1. Uses ONLY existing
    // composite indexes:
    //   workout_logs        (clientId, startedAt DESC)
    //   habit_logs          (clientId, civilDate DESC)   [+ fallback]
    //   progress_photos     (clientId, createdAt DESC)
    //   workout_assignments (clientId, scheduledFor DESC, __name__)
    //   body_weight_logs    recordedAt (single-field, subcollection)
    //   users signup rows   fetched by documentId / coachId (page 1 only)
    // The merge sorts by computed `eventAt` and the CLIENT dedupes by row.id, so
    // an inclusive `<=` boundary never drops or duplicates a row. See the
    // boundary caveats documented on the wrapper actions.
    const limit = pageMode.pageSize;
    const typeFilter = pageMode.typeFilter ?? null;
    const want = (cat: RecentLogCategory) => !typeFilter || typeFilter === cat;
    const cursorDate = pageMode.cursor ? asDate(pageMode.cursor) : null;
    const cursorCivil = cursorDate
      ? civilDateFormat(cursorDate, params.timezone)
      : null;
    const isFirstPage = !cursorDate;

    // Apply the `<= cursor` range (after page 1) + newest-first order + bound,
    // for sources whose cursor field is a real timestamp.
    const ranged = (q: FirebaseFirestore.Query, field: string) =>
      (cursorDate ? q.where(field, "<=", cursorDate) : q)
        .orderBy(field, "desc")
        .limit(limit);

    // Per-client fan-out for each (wanted) source — fired concurrently. A
    // skipped (filtered-out) source yields an empty result so its category
    // simply produces no rows in the assembly below.
    const workoutSnapsP = want("workout")
      ? Promise.all(
          clients.map((c) =>
            ranged(
              db
                .collection(FirestoreCollections.workoutLogs)
                .where("clientId", "==", c.uid),
              "startedAt",
            ).get(),
          ),
        )
      : Promise.resolve([] as FirebaseFirestore.QuerySnapshot[]);
    const photoSnapsP = want("photo")
      ? Promise.all(
          clients.map((c) =>
            ranged(
              db
                .collection(FirestoreCollections.progressPhotos)
                .where("clientId", "==", c.uid),
              "createdAt",
            )
              .get()
              .catch(() => null),
          ),
        )
      : Promise.resolve([] as Array<FirebaseFirestore.QuerySnapshot | null>);
    const weightSnapsP = want("weight")
      ? Promise.all(
          clients.map((c) =>
            ranged(
              db
                .collection(FirestoreCollections.users)
                .doc(c.uid)
                .collection("body_weight_logs"),
              "recordedAt",
            )
              .get()
              .catch(() => null),
          ),
        )
      : Promise.resolve([] as Array<FirebaseFirestore.QuerySnapshot | null>);
    // Reschedules order/cursor by `scheduledFor` (a "YYYY-MM-DD" civil string,
    // lexically sortable) as a proxy for `updatedAt` — see boundary caveats.
    const assignSnapsP = want("reschedule")
      ? Promise.all(
          clients.map((c) => {
            let q: FirebaseFirestore.Query = db
              .collection(FirestoreCollections.workoutAssignments)
              .where("clientId", "==", c.uid);
            if (cursorCivil) q = q.where("scheduledFor", "<=", cursorCivil);
            return q
              .orderBy("scheduledFor", "desc")
              .limit(limit)
              .get()
              .catch(() => null);
          }),
        )
      : Promise.resolve([] as Array<FirebaseFirestore.QuerySnapshot | null>);
    // Habit logs order/cursor by `civilDate`, with the 260529 fallback for an
    // index still building.
    const habitSnapsP = want("habit")
      ? Promise.all(
          clients.map((c) => {
            let q: FirebaseFirestore.Query = db
              .collection(FirestoreCollections.habitLogs)
              .where("clientId", "==", c.uid);
            if (cursorCivil) q = q.where("civilDate", "<=", cursorCivil);
            return q
              .orderBy("civilDate", "desc")
              .limit(limit)
              .get()
              .catch(() =>
                db
                  .collection(FirestoreCollections.habitLogs)
                  .where("clientId", "==", c.uid)
                  .limit(limit)
                  .get(),
              );
          }),
        )
      : Promise.resolve([] as FirebaseFirestore.QuerySnapshot[]);
    // Habits master (for the progress badge) — only needed when habit rows show.
    const habitsMasterP = want("habit")
      ? Promise.all(
          clients.map((c) =>
            db
              .collection(FirestoreCollections.habits)
              .where("clientId", "==", c.uid)
              .limit(50)
              .get()
              .catch(() => null),
          ),
        )
      : Promise.resolve([] as Array<FirebaseFirestore.QuerySnapshot | null>);
    // Signup rows: account-creation events are old, so we only emit them on
    // page 1 (cursor === null). Fetched by documentId for a small roster (the
    // exact client docs), else the coachId+role roster query (bounded).
    const usersP =
      want("signup") && isFirstPage
        ? clients.length <= 30
          ? db
              .collection(FirestoreCollections.users)
              .where(
                FieldPath.documentId(),
                "in",
                clients.map((c) => c.uid),
              )
              .get()
          : db
              .collection(FirestoreCollections.users)
              .where("coachId", "==", params.trainerId)
              .where("role", "==", "client")
              .limit(400)
              .get()
        : Promise.resolve({
            docs: [] as FirebaseFirestore.QueryDocumentSnapshot[],
          });

    const [
      workoutSnaps,
      photoSnapsR,
      weightSnapsR,
      assignSnapsR,
      habitSnapsR,
      usersSnapR,
      habitsMasterR,
    ] = await Promise.all([
      workoutSnapsP,
      photoSnapsP,
      weightSnapsP,
      assignSnapsP,
      habitSnapsP,
      usersP,
      habitsMasterP,
    ]);

    workoutLogsSnap = { docs: workoutSnaps.flatMap((s) => s.docs) };
    trainerAssignmentsSnap = {
      docs: assignSnapsR.flatMap((s) => s?.docs ?? []),
    };
    usersSnap = usersSnapR;
    habitLogsSnaps = habitSnapsR;
    photoSnaps = photoSnapsR;
    weightSnaps = weightSnapsR;
    habitsSnaps = habitsMasterR;

    const sourceFull = (
      snaps: Array<FirebaseFirestore.QuerySnapshot | null>,
    ) => snaps.some((s) => (s?.size ?? 0) >= limit);
    anySourceFull =
      sourceFull(workoutSnaps) ||
      sourceFull(habitSnapsR) ||
      sourceFull(photoSnapsR) ||
      sourceFull(weightSnapsR);
  } else {
    const workoutLogsPromise = db
      .collection(FirestoreCollections.workoutLogs)
      .where("trainerId", "==", params.trainerId)
      .limit(600)
      .get();
    // Trainer-scoped assignments — used to surface the "client moved
    // workout from X to Y" reschedule activity. No orderBy keeps this on
    // the existing single-field trainerId index; we filter in memory to
    // the docs that carry originallyScheduledFor (always a small subset).
    const trainerAssignmentsPromise = db
      .collection(FirestoreCollections.workoutAssignments)
      .where("trainerId", "==", params.trainerId)
      .limit(600)
      .get();
    const usersSnapPromise = db
      .collection(FirestoreCollections.users)
      .where("coachId", "==", params.trainerId)
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
      params.timezone,
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

    [
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
  }

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
  const trainerTz = params.timezone;
  const todayCivil = civilDateToday(trainerTz);

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

  // Orphan-log cleanup: when a coach deletes a workout, deleteAssignment now
  // cascades the workout_logs too (workout-assignment-actions.ts), so new
  // deletes vanish here automatically. But logs orphaned BEFORE that cascade
  // shipped still exist with an assignment_id pointing at a now-deleted
  // assignment — the "I keep seeing workouts the coach deleted" bug. We hide
  // any workout row whose assignment FK no longer resolves to an existing
  // assignment. `existingAssignmentIds` seeds from the already-loaded trainer
  // assignments (free); FKs not in that set are confirmed via a single getAll
  // below so a truncated assignment page never falsely hides a valid log.
  const existingAssignmentIds = new Set<string>(
    trainerAssignmentsSnap.docs.map((d) => d.id),
  );
  const workoutFkByRowId = new Map<string, string>();

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
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
      title: `${nameByClientId.get(clientId) ?? clientId} completed first sign-in`,
      detail: "Pending client converted to active user",
      workoutLogId: null,
    });
  });

  workoutLogsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;

    // Defensive: skip any log explicitly soft-deleted (mirrors the habit-log
    // skip below). Logs don't carry this today, but it's the cheapest guard.
    if (data.deleted === true) return;

    // Capture the assignment FK (snake-case `assignment_id` is the iOS wire
    // field; `assignmentId` is the legacy camel fallback) so the orphan filter
    // below can drop rows whose assignment was deleted.
    const assignmentFk =
      typeof data.assignment_id === "string"
        ? data.assignment_id
        : typeof data.assignmentId === "string"
          ? data.assignmentId
          : "";
    if (assignmentFk) {
      workoutFkByRowId.set(`workout:${doc.id}`, assignmentFk);
    }

    const startedAt =
      asIso(data.startedAt) ??
      asIso(data.createdAt) ??
      asIso(data.updatedAt);
    if (!startedAt) return;

    const completedAt = asIso(data.completedAt);
    if (!completedAt) return;
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
    const source =
      data.source === "coach" ? "coach" : "client";
    const setsLabel =
      plannedSets > 0 ? `${sets}/${plannedSets} sets` : `${sets} sets`;

    rows.push({
      id: `workout:${doc.id}`,
      category: "workout",
      eventAt: completedAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
      title: `${nameByClientId.get(clientId) ?? clientId} - Workout completed: ${templateName}`,
      detail: `${templateName} · ${setsLabel}`,
      workoutLogId: doc.id,
      workout: {
        completedSets: sets,
        plannedSets: plannedSets > 0 ? plannedSets : null,
        rpe,
        hasNotes,
        source,
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
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
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

    // BACKDATED detection — the iOS app lets clients tick PAST-day habits, so a
    // habit whose civilDate is May 29 can be marked on May 30. `eventAt` is the
    // mark instant; its civil date in the trainer's tz is the day the client
    // actually logged. When that differs from the habit's own civilDate the row
    // is backdated, and we surface the target day so it doesn't masquerade as
    // today's activity. On-time completions leave `forCivilDate` undefined.
    const markedCivil = habitCivilDate
      ? civilDateFormat(new Date(eventAt), trainerTz)
      : "";
    const forCivilDate =
      habitCivilDate && habitCivilDate !== markedCivil
        ? habitCivilDate
        : undefined;

    rows.push({
      id: `habit:${doc.id}`,
      category: "habit",
      eventAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
      title: completed
        ? `${titlePrefix}${nameByClientId.get(clientId) ?? clientId} completed: ${habitName}${titleSuffix}`
        : `${nameByClientId.get(clientId) ?? clientId} updated: ${habitName}${titleSuffix}`,
      detail: completed ? "Completed" : "Pending update",
      workoutLogId: null,
      forCivilDate,
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
  const photoTrainerTz = params.timezone;
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
      clientPhotoURL: photoByClientId.get(bucket.clientId) ?? null,
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
        clientPhotoURL: photoByClientId.get(client.uid) ?? null,
        title: `${nameByClientId.get(client.uid) ?? client.uid} - Logged body weight`,
        detail: `${kg.toFixed(1)} kg`,
        workoutLogId: null,
      });
    });
  });

  // Confirm any workout FK not already known to exist (e.g. an assignment
  // beyond the loaded page) via a single batched getAll, so we only treat a
  // log as orphaned when its assignment REALLY no longer exists.
  const unknownFks = Array.from(new Set(workoutFkByRowId.values())).filter(
    (fk) => !existingAssignmentIds.has(fk),
  );
  if (unknownFks.length > 0) {
    const refs = unknownFks.map((fk) =>
      db.collection(FirestoreCollections.workoutAssignments).doc(fk),
    );
    const docs = await db.getAll(...refs);
    docs.forEach((d) => {
      if (d.exists) existingAssignmentIds.add(d.id);
    });
  }

  const visibleRows = rows.filter((row) => {
    const fk = workoutFkByRowId.get(row.id);
    // Non-workout rows, and workout rows with no FK, are always kept.
    if (!fk) return true;
    return existingAssignmentIds.has(fk);
  });

  visibleRows.sort((a, b) => isoOrEpoch(b.eventAt) - isoOrEpoch(a.eventAt));

  if (pageMode) {
    // Take the page; `nextCursor` is the oldest shown row's eventAt. `hasMore`
    // is true when a time-series source returned a full page OR we merged more
    // candidates than fit (e.g. signup/reschedule rows pushed past the cut).
    const shown = visibleRows.slice(0, pageMode.pageSize);
    const nextCursor =
      shown.length > 0 ? shown[shown.length - 1].eventAt : null;
    const hasMore = anySourceFull || visibleRows.length > pageMode.pageSize;
    return { logs: shown, clients: clientList, nextCursor, hasMore };
  }

  return {
    logs: visibleRows,
    clients: clientList,
    nextCursor: null,
    hasMore: false,
  };
}

/**
 * Build a single-client roster entry from the canonical /users doc. Returns
 * null when the doc is missing. `coachId` is returned alongside so callers can
 * authorize (trainer ownership / admin coach-match) without a second read.
 */
async function loadClientRosterEntry(
  clientId: string,
): Promise<{ entry: ClientRosterEntry; coachId: string | null } | null> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const coachId = typeof data.coachId === "string" ? data.coachId : null;
  const email = typeof data.email === "string" ? data.email : "";
  const displayName =
    typeof data.displayName === "string" && data.displayName.trim().length > 0
      ? data.displayName
      : email || clientId;
  return {
    entry: {
      uid: clientId,
      email,
      displayName,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      pendingProvisioning: false,
    },
    coachId,
  };
}

/**
 * Full-roster recent activity feed for the calling trainer — LEGACY
 * load-everything path. Still used by the DASHBOARD, which needs the latest
 * activity row for EVERY client (broad coverage), not a recent page. The
 * paginated `/recent-logs` feed uses `listRecentLogsForTrainerPage` instead.
 */
export async function listRecentLogsForTrainer(): Promise<RecentLogsResult> {
  const trainer = await getCurrentTrainer();
  const [clients, timezone] = await Promise.all([
    listClients(),
    getTrainerTimezone(),
  ]);
  return buildRecentLogs({ trainerId: trainer.uid, clients, timezone });
}

/**
 * 260531-fwc — PAGINATED full-roster feed for the `/recent-logs` page. Fans the
 * time-cursor window out across the whole roster (index-safe per-client queries,
 * `pageSize` rows/page). `filterClientId` scopes to one client (cheapest path);
 * `typeFilter` restricts to one category server-side. Also doubles as the
 * component's "load more" + filter-refetch server action.
 *
 * Returns the FULL roster in `clients` only on the unfiltered first page (for
 * the filter dropdown); callers keep that list and ignore it on later calls.
 */
export async function listRecentLogsForTrainerPage(
  cursor: string | null = null,
  pageSize: number = RECENT_LOGS_PAGE_SIZE,
  filterClientId: string | null = null,
  typeFilter: RecentLogCategory | null = null,
): Promise<RecentLogsResult> {
  const trainer = await getCurrentTrainer();
  const [allClients, timezone] = await Promise.all([
    listClients(),
    getTrainerTimezone(),
  ]);
  const clients = filterClientId
    ? allClients.filter((c) => c.uid === filterClientId)
    : allClients;
  // A client filter that matches nobody on this roster ⇒ empty feed (the URL/
  // dropdown can't read a client outside the trainer's roster).
  if (filterClientId && clients.length === 0) {
    return {
      logs: [],
      clients: allClients.map((c) => ({
        id: c.uid,
        name: c.displayName,
        photoURL: c.photoURL,
      })),
      nextCursor: null,
      hasMore: false,
    };
  }
  return buildRecentLogs({
    trainerId: trainer.uid,
    clients,
    timezone,
    page: { cursor, pageSize, typeFilter },
  });
}

/** Default rows per page for the single-client time-cursor feed (260531-fwc). */
const RECENT_LOGS_PAGE_SIZE = 20;

/**
 * Recent activity for ONE client, scoped to the calling trainer
 * (ownership-gated). 260531-fwc — paginated by a time cursor instead of loading
 * everything: page 1 is `cursor = null`; pass the returned `nextCursor` (and the
 * same `pageSize`) to fetch the next window on demand. This same action doubles
 * as the client component's "load more" call.
 *
 * BOUNDARY CAVEATS (low-impact, only at a window edge — see buildRecentLogs):
 * workout rows order by `startedAt` but sort by `completedAt`; reschedule rows
 * order by `scheduledFor` but sort by `updatedAt`; the habit "all done that day"
 * badge can undercount on the oldest loaded day if split across the edge; a
 * photo check-in split across the edge can render twice. An affected row surfaces
 * one page later — never lost (inclusive `<=` cursor + client dedupe by id).
 */
export async function listRecentLogsForClient(
  clientId: string,
  cursor: string | null = null,
  pageSize: number = RECENT_LOGS_PAGE_SIZE,
): Promise<RecentLogsResult> {
  const trainer = await getCurrentTrainer();
  const loaded = await loadClientRosterEntry(clientId);
  if (!loaded || loaded.coachId !== trainer.uid) {
    throw new Error("Forbidden");
  }
  const timezone = await getTrainerTimezone();
  return buildRecentLogs({
    trainerId: trainer.uid,
    clients: [loaded.entry],
    timezone,
    page: { cursor, pageSize },
  });
}

/**
 * Admin god-mode (read-only): recent activity for ONE client of a SPECIFIC
 * coach. Verifies the client really belongs to `coachId` so the URL can't be
 * edited to read a client outside the coach being inspected.
 */
export async function listRecentLogsForClientAsAdmin(
  coachId: string,
  clientId: string,
  cursor: string | null = null,
  pageSize: number = RECENT_LOGS_PAGE_SIZE,
): Promise<RecentLogsResult> {
  await getCurrentAdmin();
  const loaded = await loadClientRosterEntry(clientId);
  if (!loaded || loaded.coachId !== coachId) {
    throw new Error("Not found");
  }
  const timezone = await getTrainerTimezone();
  return buildRecentLogs({
    trainerId: coachId,
    clients: [loaded.entry],
    timezone,
    page: { cursor, pageSize },
  });
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
 * Admin god-mode (read-only): workout-log detail for a specific COACH's log.
 * Mirrors getWorkoutLogDetail but gates on admin and verifies the log belongs
 * to `coachId` so the URL can't be edited to read another coach's logs.
 */
export async function getWorkoutLogDetailAsAdmin(
  coachId: string,
  workoutLogId: string,
): Promise<WorkoutLogDetail> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();

  const logSnap = await db
    .collection(FirestoreCollections.workoutLogs)
    .doc(workoutLogId)
    .get();
  if (!logSnap.exists) {
    throw new Error("Workout log not found.");
  }

  const data = logSnap.data() as Record<string, unknown>;
  if (data.trainerId !== coachId) {
    throw new Error("Workout log not found.");
  }

  return buildWorkoutLogDetail(db, coachId, logSnap.id, data);
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

  // FK field name: iOS writes the log's assignment FK as snake_case
  // `assignment_id` (WorkoutLogRepository.swift). Older backoffice code keyed
  // off camel `assignmentId`. Query BOTH and merge so the lookup works
  // regardless of which field a given doc carries — without this, the snake-
  // case docs returned nothing and the calendar dialog silently fell back to
  // the prescribed card instead of the logged actuals (the reported bug).
  const [snakeSnap, camelSnap] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutLogs)
      .where("assignment_id", "==", assignmentId)
      .get(),
    db
      .collection(FirestoreCollections.workoutLogs)
      .where("assignmentId", "==", assignmentId)
      .get(),
  ]);
  const docById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of [...snakeSnap.docs, ...camelSnap.docs]) docById.set(d.id, d);
  if (docById.size === 0) return null;
  const allDocs = Array.from(docById.values());

  // Trainer-ownership + completed filter in memory (see index note above).
  const completed = allDocs.filter((d) => {
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
  const source = data.source === "coach" ? "coach" : "client";

  return {
    id: logId,
    clientId,
    clientName,
    clientTimezone,
    coachName,
    workoutName,
    startedAt,
    completedAt,
    status: "completed",
    setCount: sets.length,
    completedSetCount: sets.filter((s) => Boolean(s.completedAt)).length,
    exerciseCount: templateExercises.length,
    // Wire field is `duration_seconds` (iOS, snake_case); keep `durationSeconds`
    // as a legacy/camel fallback mirroring the weight_kg ?? weight pattern. This
    // is the authoritative stored elapsed time the share card prefers.
    durationSeconds: numeric(data.duration_seconds ?? data.durationSeconds),
    rpe,
    athleteNotes,
    source,
    sets,
  };
}
