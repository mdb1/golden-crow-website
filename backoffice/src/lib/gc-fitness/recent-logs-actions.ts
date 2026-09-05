"use server";

import { FieldPath } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentAdmin, getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { coerceLegacyHabitLogValue } from "./habit-compliance";
import {
  adminCanViewClientUnderCoach,
  isCoachlessClientRow,
} from "./coachless-user-model";
import { FirestoreCollections } from "./collections";
import {
  getWorkoutHeartRateSeries,
  type WorkoutHeartRateSeries,
} from "./workout-heart-rate";
import {
  listClients,
  type ClientRosterEntry,
} from "./client-roster";
import { coachVisibleClientName } from "./client-name";
import { resolveExerciseDocsById } from "./exercise-resolution";
import { flattenLogPRs, previousRecordsByExercise } from "./personal-records";
import { isHabitScheduledOn } from "./habit-schedule";
import { getTrainerTimezone } from "./trainer-timezone";
// quick-260714-m57 (#403) — effective per-set type (setType ?? is_warmup) for
// the "Detalle de series" badges + warmup exclusions.
import { effectiveSetType, type SetType } from "./set-type";

export type RecentLogCategory =
  | "habit"
  | "workout"
  | "reschedule"
  | "reminder"
  | "photo"
  | "weight"
  | "signup"
  | "profile"
  /**
   * #785 — the athlete put a workout on their OWN calendar (#392
   * `selfAssigned`, `trainerId === clientId`).
   *
   * Reported against a coach-less user whose profile showed two rows — a body
   * weight and the first sign-in — while the admin timeline showed him
   * self-assigning three workouts the same day. Everything they schedule for
   * themselves was invisible on the one page that is supposed to say what they
   * do, because the feed only ever spoke about workouts once they were
   * FINISHED.
   *
   * Deliberately self-assignments only: a coach's own assignments are not news
   * to the coach reading the feed, and adding them would bury the rows that
   * are.
   */
  | "assignment"
  /**
   * The athlete marked their meals for a day (`nutrition_logs`).
   *
   * Nutrition had a card of its own on the profile but was absent from the FEED, which is
   * the one place that answers "what did this person do". So a client ticking every meal
   * for three weeks produced the same timeline as one who never opened the tab — the
   * adherence number moved and nothing said why.
   *
   * One row per DAY, not per meal: six taps in a day is one act, and six rows would bury
   * every workout and habit under it.
   */
  | "nutrition";

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
  profile?: {
    changedFields: string[];
  };
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
    /**
     * #576 — el atleta hizo este entrenamiento en modo sobrecarga progresiva: la app le subió
     * la prescripción set a set en vez de darle la del plan.
     *
     * Le importa al coach y no es deducible de los números: un log en modo sobrecarga tiene
     * reps o kilos por encima de lo que el coach prescribió, y sin esto se lee como que el
     * cliente hizo la suya. Wire snake_case `progressive_overload` (iOS/Android).
     */
    progressiveOverload: boolean;
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
  /** The BPM series written by the client's app at finish, or null when the
   *  workout has none — the common case, since most sessions are logged without
   *  a watch. See lib/gc-fitness/workout-heart-rate.ts. */
  heartRate: WorkoutHeartRateSeries | null;
  /** Athlete self-reported free-form notes from the post-workout summary. */
  athleteNotes: string | null;
  /** Origin of the workout log: coach-run backoffice session or client-run iOS session. */
  source?: "coach" | "client";
  /**
   * #576 — hecho en modo sobrecarga progresiva. Wire snake_case `progressive_overload`.
   * Ausente en todo log anterior al modo ⇒ `false`, que es lo correcto.
   */
  progressiveOverload: boolean;
  sets: Array<{
    index: number;
    setLogId: string;
    exerciseId: string;
    exerciseName: string;
    /**
     * Effective exercise metric for rendering logged actuals. Prefer the
     * template snapshot, then the exercise library, and finally a logged or
     * prescribed duration. Legacy logs may still carry reps/weight fields for
     * time exercises, so consumers must branch on this instead of field
     * presence alone.
     */
    metric: "reps" | "time";
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
     * 260529-mrp — True when this set is a warmup. DISPLAY ONLY as of #565:
     * warm-ups now count toward the share card's Volumen / Series / top-set /
     * 1RM math exactly like any other set (mirroring iOS + Android), so this
     * flag only drives the "W" marker and the dimmed row. Wire field
     * `is_warmup` (iOS, snake_case); `isWarmup` camel fallback mirrors the
     * existing weight_kg ?? weight / duration_seconds ?? durationSeconds
     * pattern. Defaults to false when absent (pre-warmup-flag logs).
     */
    isWarmup: boolean;
    /**
     * quick-260714-m57 (#403) — EFFECTIVE set type resolved via
     * `effectiveSetType` (valid non-normal `set_type` wins; else the legacy
     * warmup flag). Powers the W/F/D badge in "Detalle de series". Always
     * consistent with `isWarmup` (`isWarmup === (setType === "warmup")`).
     */
    setType: SetType;
    /** True when this set matches a PR row in the parent workout log's prs[]. */
    isPR: boolean;
    /** Stored Epley estimated 1RM (kg) when isPR === true. */
    prEstimatedOneRM: number | null;
    /**
     * The record this PR beat (issue #405) — the client's most recent PR for
     * this exercise from a session BEFORE this one. Null when this is the
     * exercise's first PR or when `isPR` is false.
     */
    prPrevious: {
      weightKg: number;
      reps: number;
      estimatedOneRM: number;
      durationSeconds: number | null;
    } | null;
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

function numericArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];
}

function setIndexFromLog(set: Record<string, unknown>): number | null {
  const raw = numeric(set.set_index ?? set.setIndex);
  return raw !== null ? Math.max(0, Math.floor(raw)) : null;
}

function prescribedDurationForSet(
  templateExercise: Record<string, unknown> | undefined,
  setIndex: number,
): number | null {
  if (!templateExercise) return null;
  const bySet = numericArray(templateExercise.durationBySetSeconds);
  return bySet[setIndex] ?? numeric(templateExercise.durationSeconds);
}

function effectiveSetMetric(opts: {
  templateExercise: Record<string, unknown> | undefined;
  sourceExercise: Record<string, unknown> | undefined;
  loggedDurationSeconds: number | null;
  prescribedDurationSeconds: number | null;
}): "reps" | "time" {
  if (opts.loggedDurationSeconds !== null && opts.loggedDurationSeconds > 0) {
    return "time";
  }
  if (opts.templateExercise?.metric === "time") return "time";
  if (opts.templateExercise?.metric === "reps") return "reps";
  if (opts.sourceExercise?.metric === "time") return "time";
  if (
    opts.prescribedDurationSeconds !== null &&
    opts.prescribedDurationSeconds > 0
  ) {
    return "time";
  }
  return "reps";
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
 * `isHabitActiveOnDate` helper that lived in client-daily-timeline-actions.ts
 * until #309 deleted it; kept inlined here.
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
  return coerceLegacyHabitLogValue(data.value);
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
   * from the trainer-wide scans to index-safe `where(clientId==)`
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
  // Empty on the trainer-wide path by design — see the read block's comment.
  let nutritionSnaps: FirebaseFirestore.QuerySnapshot[] = [];
  let photoSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let weightSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let profileSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let habitsSnaps: Array<FirebaseFirestore.QuerySnapshot | null>;
  let trainerAssignmentsSnap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] };
  // Set in page mode: true when any time-series source returned a FULL page,
  // i.e. there may be older rows beyond this window.
  let anySourceFull = false;
  // 260611-t1y — the page-mode category filter, visible to the in-memory
  // derivation blocks below. reschedule + reminder now share the same fetched
  // assignment docs, so when ONE category is selected we must gate each
  // derivation to its own category (else the other leaks in). Null ⇒ legacy
  // mode / "all": both derivations run.
  const pageTypeFilter = pageMode?.typeFilter ?? null;
  const wantCategory = (cat: RecentLogCategory) =>
    !pageTypeFilter || pageTypeFilter === cat;

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
    const profileSnapsP = want("profile")
      ? Promise.all(
          clients.map((c) =>
            ranged(
              db
                .collection(FirestoreCollections.users)
                .doc(c.uid)
                .collection(FirestoreCollections.profileEvents),
              "eventAt",
            )
              .get()
              .catch(() => null),
          ),
        )
      : Promise.resolve([] as Array<FirebaseFirestore.QuerySnapshot | null>);
    // Reschedules order/cursor by `scheduledFor` (a "YYYY-MM-DD" civil string,
    // lexically sortable) as a proxy for `updatedAt` — see boundary caveats.
    // 260611-t1y: reminder rows are ALSO derived from these same assignment docs
    // (in-memory, no extra query/index), so fetch them when EITHER category is
    // wanted.
    const assignSnapsP = want("reschedule") || want("reminder") || want("assignment")
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
    // #949 follow-up — nutrition days. Same shape as the habit read above: ordered and
    // cursored by `civilDate`, with the same fallback for an index still building.
    //
    // ⚠️ Only the PAGINATED (single-client) path reads these, which is every per-client
    // feed — the admin drill-down and the coach's client profile. The trainer-wide
    // dashboard feed below does NOT, deliberately: it fans out over the whole roster and
    // one row per client per day would drown the rows a coach opens that feed for.
    const nutritionSnapsP = want("nutrition")
      ? Promise.all(
          clients.map((c) => {
            let q: FirebaseFirestore.Query = db
              .collection(FirestoreCollections.nutritionLogs)
              .where("clientId", "==", c.uid);
            if (cursorCivil) q = q.where("civilDate", "<=", cursorCivil);
            return q
              .orderBy("civilDate", "desc")
              .limit(limit)
              .get()
              .catch(() =>
                db
                  .collection(FirestoreCollections.nutritionLogs)
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
      profileSnapsR,
      assignSnapsR,
      habitSnapsR,
      usersSnapR,
      habitsMasterR,
      nutritionSnapsR,
    ] = await Promise.all([
      workoutSnapsP,
      photoSnapsP,
      weightSnapsP,
      profileSnapsP,
      assignSnapsP,
      habitSnapsP,
      usersP,
      habitsMasterP,
      nutritionSnapsP,
    ]);

    workoutLogsSnap = { docs: workoutSnaps.flatMap((s) => s.docs) };
    trainerAssignmentsSnap = {
      docs: assignSnapsR.flatMap((s) => s?.docs ?? []),
    };
    usersSnap = usersSnapR;
    habitLogsSnaps = habitSnapsR;
    photoSnaps = photoSnapsR;
    weightSnaps = weightSnapsR;
    profileSnaps = profileSnapsR;
    habitsSnaps = habitsMasterR;
    nutritionSnaps = nutritionSnapsR;

    const sourceFull = (
      snaps: Array<FirebaseFirestore.QuerySnapshot | null>,
    ) => snaps.some((s) => (s?.size ?? 0) >= limit);
    anySourceFull =
      sourceFull(workoutSnaps) ||
      sourceFull(habitSnapsR) ||
      sourceFull(photoSnapsR) ||
      sourceFull(weightSnapsR) ||
      sourceFull(profileSnapsR) ||
      sourceFull(nutritionSnaps);
  } else {
    // #434 follow-up: fan out workout_logs per roster client (by clientId)
    // instead of a single `trainerId ==` query, so CLIENT-CREATED ("self")
    // workouts — whose trainerId is the client's own uid, not the coach's —
    // appear in the dashboard/recent-logs feed too (the paginated branch
    // already keys off clientId). Each per-client query is bounded and
    // .catch-guarded like the other fan-outs in this branch. No new index:
    // single-field `clientId` is auto-indexed.
    const workoutLogsPromise = Promise.all(
      clients.map((client) =>
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", client.uid)
          .limit(150)
          .get()
          .catch(() => null),
      ),
    );
    // Trainer-scoped assignments — used to surface the "client moved
    // workout from X to Y" reschedule activity. No orderBy keeps this on
    // the existing single-field trainerId index; we filter in memory to
    // the docs that carry originallyScheduledFor (always a small subset).
    const trainerAssignmentsPromise = db
      .collection(FirestoreCollections.workoutAssignments)
      .where("trainerId", "==", params.trainerId)
      .limit(150)
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
    const profilePromises = clients.map((client) =>
      db
        .collection(FirestoreCollections.users)
        .doc(client.uid)
        .collection(FirestoreCollections.profileEvents)
        .orderBy("eventAt", "desc")
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

    let workoutLogsFanout: Array<FirebaseFirestore.QuerySnapshot | null> = [];
    [
      workoutLogsFanout,
      usersSnap,
      habitLogsSnaps,
      photoSnaps,
      weightSnaps,
      profileSnaps,
      habitsSnaps,
      trainerAssignmentsSnap,
    ] = await Promise.all([
      workoutLogsPromise,
      usersSnapPromise,
      Promise.all(habitLogPromises),
      Promise.all(photoPromises),
      Promise.all(weightPromises),
      Promise.all(profilePromises),
      Promise.all(habitsPromises),
      trainerAssignmentsPromise,
    ]);
    // Flatten the per-client fan-out into the single `{ docs }` shape the rest
    // of the function consumes (same shape the paginated branch produces).
    workoutLogsSnap = {
      docs: workoutLogsFanout.flatMap((snap) => snap?.docs ?? []),
    };
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
      habitNames.set(doc.id, localizedText(data.name, "Hábito"));
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
      habitNames.set(doc.id, localizedText(doc.get("name"), "Hábito"));
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
      title: `${nameByClientId.get(clientId) ?? clientId} completó su primer ingreso`,
      detail: "Cliente pendiente convertido en usuario activo",
      workoutLogId: null,
    });
  });

  profileSnaps.forEach((snap) => {
    if (!snap) return;
    snap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const clientId = typeof data.clientId === "string" ? data.clientId : doc.ref.parent.parent?.id ?? "";
      if (!clientId || !nameByClientId.has(clientId)) return;
      const eventAt = asIso(data.eventAt) ?? asIso(data.updatedAt) ?? asIso(data.createdAt);
      if (!eventAt) return;
      const changedFields = Array.isArray(data.changedFields)
        ? (data.changedFields as unknown[]).filter(
            (field): field is string =>
              typeof field === "string" &&
              ["displayName", "photoURL", "birthDate"].includes(field),
          )
        : [];
      const fieldLabels = changedFields.map((field) => {
        switch (field) {
          case "displayName":
            return "nombre";
          case "photoURL":
            return "foto";
          case "birthDate":
            return "cumpleaños";
          default:
            return field;
        }
      });
      const detail =
        fieldLabels.length > 0
          ? `Actualizó ${fieldLabels.join(", ")}`
          : "Actualizó el perfil";
      rows.push({
        id: `profile:${clientId}:${doc.id}`,
        category: "profile",
        eventAt,
        clientId,
        clientName: nameByClientId.get(clientId) ?? clientId,
        clientPhotoURL: photoByClientId.get(clientId) ?? null,
        title: `${nameByClientId.get(clientId) ?? clientId} - Perfil actualizado`,
        detail,
        workoutLogId: null,
        profile: { changedFields },
      });
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
      "Entrenamiento",
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
      plannedSets > 0 ? `${sets}/${plannedSets} series` : `${sets} series`;

    rows.push({
      id: `workout:${doc.id}`,
      category: "workout",
      eventAt: completedAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
      title: `${nameByClientId.get(clientId) ?? clientId} - Entrenamiento completado: ${templateName}`,
      detail: `${templateName} · ${setsLabel}`,
      workoutLogId: doc.id,
      workout: {
        completedSets: sets,
        plannedSets: plannedSets > 0 ? plannedSets : null,
        rpe,
        hasNotes,
        source,
        progressiveOverload: data.progressive_overload === true,
      },
    });
  });

  // Reschedule activity — any trainer-owned assignment carrying a
  // non-empty `originallyScheduledFor` that differs from `scheduledFor`
  // means the athlete shifted the workout from the iOS surface (either
  // via the calendar long-press or the "start and move to today" flow).
  // We surface this as its own feed entry so the trainer sees the
  // change without having to compare days manually.
  if (wantCategory("reschedule")) trainerAssignmentsSnap.docs.forEach((doc) => {
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
      "Entrenamiento",
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
      title: `${nameByClientId.get(clientId) ?? clientId} movió ${templateName} de ${fromLabel} a ${toLabel}`,
      detail: `Originalmente ${fromLabel} → ${toLabel}`,
      workoutLogId: null,
    });
  });

  // #785 — the athlete scheduled a workout for themselves.
  //
  // Derived from the SAME `trainerAssignmentsSnap` the two passes around it use
  // — no extra query, no new index. The gate is the #392 shape
  // (`trainerId === clientId`), not the `selfAssigned` flag, so pre-flag docs
  // still qualify; a coach's own assignments are excluded on purpose (see the
  // `"assignment"` category doc).
  if (wantCategory("assignment")) trainerAssignmentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;
    if (data.trainerId !== clientId) return;
    // `createdAt` is when they scheduled it — NOT `updatedAt`, which every
    // later write to the doc (the move, the finish, the prescription
    // write-back) would bump, walking a two-week-old plan back to the top of
    // the feed each time it is touched.
    const eventAt = asIso(data.createdAt) ?? asIso(data.updatedAt);
    if (!eventAt) return;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    const templateName = localizedText(
      (data.templateSnapshot as { name?: unknown } | undefined)?.name,
      "Entrenamiento",
    );
    const plannedExercises = Array.isArray(
      (data.templateSnapshot as { exercises?: unknown } | undefined)?.exercises,
    )
      ? ((data.templateSnapshot as { exercises: unknown[] }).exercises.length)
      : 0;
    const name = nameByClientId.get(clientId) ?? clientId;
    rows.push({
      id: `assignment:${doc.id}`,
      category: "assignment",
      eventAt,
      clientId,
      clientName: name,
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
      title: `${name} se asignó ${templateName}`,
      // The date is the point of a scheduled workout, and "Entreno libre" says
      // nothing on its own — so an empty routine says so rather than pretending
      // to be a plan (#541, same reason the calendar chip carries a summary).
      detail: [
        scheduledFor ? `Para ${formatCivilDateEsAr(scheduledFor)}` : null,
        plannedExercises > 0
          ? `${plannedExercises} ejercicio${plannedExercises === 1 ? "" : "s"}`
          : "Entreno libre (lo arma mientras entrena)",
      ]
        .filter(Boolean)
        .join(" · "),
      workoutLogId: null,
    });
  });

  // 260611-t1y (issue mdb1/gc-fitness#200 item 4, companion PR #274) — reminder
  // activity. When a client edits a workout's reminder from iOS, the iOS write
  // stamps reminderUpdatedAt (+ reminderEnabled/reminderTime/reminderScope) onto
  // the workout_assignments doc. We surface that to the coach as its own feed
  // row, derived in-memory from the SAME trainerAssignmentsSnap.docs the
  // reschedule pass above uses — presence of reminderUpdatedAt is the gate.
  //
  // DEPLOY-SAFETY: reminder rows are derived purely from the workout_assignments
  // docs this feed ALREADY fetches (legacy trainerId scan + paged per-client
  // scheduledFor window). We do NOT add a reminderUpdatedAt-ordered query or any
  // new composite index. A reminder edit on a far-FUTURE assignment that falls
  // outside the feed's scheduledFor window won't appear here — accepted limitation.
  //
  // BOTH feed paths populate trainerAssignmentsSnap.docs — the legacy
  // listRecentLogsForTrainer trainerId scan AND the paged buildRecentLogs
  // page-mode per-client scan — so this single derivation block covers BOTH; no
  // per-path special-casing needed.
  //
  // SERIES DEDUPE: a series-scope edit is batched onto N docs sharing seriesId
  // with the SAME reminderUpdatedAt. We key by `${seriesId}:${eventAt}` for
  // series edits (keeping the first doc seen) so a batched write yields ONE row;
  // non-series edits key on the doc id.
  const reminderRowsByKey = new Map<string, RecentLogRow>();
  if (wantCategory("reminder")) trainerAssignmentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;
    const eventAt = asIso(data.reminderUpdatedAt);
    if (!eventAt) return; // gate: presence means the client edited the reminder

    const reminderEnabled =
      typeof data.reminderEnabled === "boolean" ? data.reminderEnabled : null;
    const reminderTime =
      typeof data.reminderTime === "string" ? data.reminderTime : null;
    const reminderScope =
      data.reminderScope === "series" || data.reminderScope === "single"
        ? data.reminderScope
        : null;
    const seriesId = typeof data.seriesId === "string" ? data.seriesId : null;
    const templateName = localizedText(
      (data.templateSnapshot as { name?: unknown } | undefined)?.name,
      "Entrenamiento",
    );
    const clientName = nameByClientId.get(clientId) ?? clientId;

    const groupingKey =
      seriesId && reminderScope === "series"
        ? `${seriesId}:${eventAt}`
        : doc.id;
    if (reminderRowsByKey.has(groupingKey)) return; // keep first doc per series

    const isSeries = reminderScope === "series";
    const seriesSuffix = isSeries ? " (toda la serie)" : "";
    let detail: string;
    if (reminderEnabled === false) {
      detail = `El cliente desactivó el recordatorio de ${templateName}${seriesSuffix}`;
    } else if (reminderTime) {
      detail = `El cliente cambió el recordatorio de ${templateName} a las ${reminderTime}${seriesSuffix}`;
    } else {
      detail = `El cliente cambió el recordatorio de ${templateName}${seriesSuffix}`;
    }

    reminderRowsByKey.set(groupingKey, {
      id: `reminder:${groupingKey}`,
      category: "reminder",
      eventAt,
      clientId,
      clientName,
      clientPhotoURL: photoByClientId.get(clientId) ?? null,
      title: `${clientName} cambió el recordatorio de ${templateName}`,
      detail,
      workoutLogId: null,
    });
  });
  reminderRowsByKey.forEach((row) => rows.push(row));

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
    const habitName = habitNames.get(habitId) ?? "Hábito";
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
      titleSuffix = `. ${progress.done}/${progress.total} hábitos completados hoy`;
      if (isPerfectDay) titlePrefix = "🎯 ";
    } else if (isPerfectDay) {
      // Past day that hit 100% — celebrate, but no partial counts on history.
      titlePrefix = "🎯 ";
      titleSuffix = `. Todos los ${progress!.total} hábitos completados ese día`;
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
        ? `${titlePrefix}${nameByClientId.get(clientId) ?? clientId} completó: ${habitName}${titleSuffix}`
        : `${nameByClientId.get(clientId) ?? clientId} actualizó: ${habitName}${titleSuffix}`,
      detail: completed ? "Completado" : "Actualización pendiente",
      workoutLogId: null,
      forCivilDate,
    });
  });

  // #949 follow-up — one row per nutrition DAY.
  //
  // `done` is the ONLY status that counts as compliance: `different` means they ate
  // something else and `missed` that they did not eat it, and neither scores. The detail
  // therefore reads "3 de 5", never "5 de 5 registradas" — a day where every meal was
  // touched but only three were on plan is not a complete day, and printing it as one
  // would flatter the number the coach is reading.
  nutritionSnaps.forEach((snap) => {
    snap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const clientId = typeof data.clientId === "string" ? data.clientId : "";
      if (!clientId) return;
      // `updatedAt` is the mark instant; `createdAt` covers a day created and never
      // touched again. Without either there is no point on the timeline to place the row,
      // and a row with an invented instant sorts somewhere arbitrary.
      const eventAt = asIso(data.updatedAt) ?? asIso(data.createdAt);
      if (!eventAt) return;

      const meals = (data.meals ?? {}) as Record<string, { status?: unknown } | undefined>;
      const entries = Object.values(meals);
      const total = entries.length;
      if (total === 0) return; // a created-but-untouched day is not activity
      const done = entries.filter((meal) => meal?.status === "done").length;
      const civilDate = typeof data.civilDate === "string" ? data.civilDate : "";

      const name = nameByClientId.get(clientId) ?? clientId;
      rows.push({
        id: `nutrition:${doc.id}`,
        category: "nutrition",
        eventAt,
        clientId,
        clientName: name,
        clientPhotoURL: photoByClientId.get(clientId) ?? null,
        title: `${name} registró sus comidas`,
        detail: `${done} de ${total} comidas según el plan`,
        workoutLogId: null,
        // Same backdating rule the habit rows use: the app lets people mark a past day, so
        // a row whose civil date differs from the day it was marked must say which day it
        // is FOR instead of masquerading as today's activity.
        forCivilDate:
          civilDate && civilDate !== civilDateFormat(new Date(eventAt), trainerTz)
            ? civilDate
            : undefined,
      });
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
      title: `${nameByClientId.get(bucket.clientId) ?? bucket.clientId} - Subió fotos de progreso`,
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
        title: `${nameByClientId.get(client.uid) ?? client.uid} - Registró peso corporal`,
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
    // Point reads, NOT db.getAll: getAll/batchGet is unreliable in this
    // serverless (Vercel) setup (issue #166 / PR #186). This confirmation is
    // load-bearing for #434 — a client-created ("self") workout's assignment
    // (trainerId === clientId) is never in the trainer-scoped
    // `trainerAssignmentsSnap`, so its FK is ALWAYS "unknown" here and would be
    // dropped as orphaned if the existence check silently failed.
    const docs = await Promise.all(
      unknownFks.map((fk) =>
        db
          .collection(FirestoreCollections.workoutAssignments)
          .doc(fk)
          .get()
          .catch(() => null),
      ),
    );
    docs.forEach((d) => {
      if (d?.exists) existingAssignmentIds.add(d.id);
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
async function loadClientRosterEntry(clientId: string): Promise<{
  entry: ClientRosterEntry;
  coachId: string | null;
  role: string | null;
  deleted: boolean;
} | null> {
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
      createdAt:
        typeof data.createdAt === "string"
          ? data.createdAt
          : data.createdAt &&
              typeof (data.createdAt as { toDate?: () => Date }).toDate ===
                "function"
            ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
            : null,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      birthDate: typeof data.birthDate === "string" ? data.birthDate : null,
      coachNickname:
        typeof data.coachNickname === "string" ? data.coachNickname : null,
      pendingProvisioning: false,
      autoAssignedCoach: data.autoAssignedCoach === true,
    },
    coachId,
    role: typeof data.role === "string" ? data.role : null,
    deleted: data.deleted === true,
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
  filterClientId: string | string[] | null = null,
  typeFilter: RecentLogCategory | null = null,
): Promise<RecentLogsResult> {
  const trainer = await getCurrentTrainer();
  const [allClients, timezone] = await Promise.all([
    listClients(),
    getTrainerTimezone(),
  ]);
  const filterClientIds =
    filterClientId === null
      ? null
      : Array.isArray(filterClientId)
        ? filterClientId
        : [filterClientId];
  const filterClientSet = filterClientIds ? new Set(filterClientIds) : null;
  const clients = filterClientSet
    ? allClients.filter((c) => filterClientSet.has(c.uid))
    : allClients;
  // A client filter that matches nobody on this roster ⇒ empty feed (the URL/
  // dropdown can't read a client outside the trainer's roster).
  if (filterClientSet && clients.length === 0) {
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
 *
 * Coach-less users are admitted via `coachId === clientId` (they are their own
 * trainer-of-record — see `adminCanViewClientUnderCoach`). That sentinel is
 * also the CORRECT `trainerId` to scan by: their self-created content carries
 * `trainerId === clientId` (#392 selfAssigned).
 */
export async function listRecentLogsForClientAsAdmin(
  coachId: string,
  clientId: string,
  cursor: string | null = null,
  pageSize: number = RECENT_LOGS_PAGE_SIZE,
): Promise<RecentLogsResult> {
  await getCurrentAdmin();
  const loaded = await loadClientRosterEntry(clientId);
  if (
    !loaded ||
    !adminCanViewClientUnderCoach({
      coachUidInPath: coachId,
      clientId,
      clientCoachId: loaded.coachId,
      clientRole: loaded.role,
      clientDeleted: loaded.deleted,
    })
  ) {
    throw new Error("Not found");
  }
  // A coach-less user has no coach whose cookie tz we could borrow, so their
  // own profile timezone drives the civil-date bucketing; the admin cookie tz
  // is the fallback for the coached path (unchanged).
  const timezone = loaded.coachId
    ? await getTrainerTimezone()
    : (loaded.entry.timezone ?? (await getTrainerTimezone()));
  return buildRecentLogs({
    trainerId: coachId,
    clients: [loaded.entry],
    timezone,
    page: { cursor, pageSize },
  });
}

/**
 * Issue #434: a coach may view a workout log when they are the log's `trainerId`
 * OR the coach-of-record for the log's client. Client-created ("self") workouts
 * (issue #392) carry `trainerId === clientId === <client uid>`, so the bare
 * `trainerId === coach` equality 404s them even though the log shows up in the
 * coach's recent-logs feed (which filters by `clientId`). Resolving the client's
 * `coachId` — the same fallback habits use in `currentTrainerCanManageHabit` —
 * admits them. The lookup is scoped to the coach's own clients, so no cross-coach
 * leak. (The backoffice reads via the Admin SDK, so Firestore rules are bypassed;
 * this app-side check is the only gate.)
 */
async function coachCanAccessLog(
  db: FirebaseFirestore.Firestore,
  coachUid: string,
  data: { trainerId?: unknown; clientId?: unknown },
): Promise<boolean> {
  if (data.trainerId === coachUid) return true;
  const clientId =
    typeof data.clientId === "string" && data.clientId.trim().length > 0
      ? data.clientId.trim()
      : null;
  if (!clientId) return false;
  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  return clientSnap.exists && clientSnap.get("coachId") === coachUid;
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
  if (!(await coachCanAccessLog(db, trainer.uid, data))) {
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
  // Self-created logs of a coach-less user already pass via `trainerId ===
  // coachId` (they are their own trainer-of-record). The extra branch covers
  // logs written while the user still HAD a coach, which would otherwise 404
  // from their coach-less profile — admin-only, and only for a uid that is
  // both the path uid and an active coach-less client.
  const accessible =
    (await coachCanAccessLog(db, coachId, data)) ||
    (data.clientId === coachId && (await isActiveCoachlessClient(db, coachId)));
  if (!accessible) {
    throw new Error("Workout log not found.");
  }

  return buildWorkoutLogDetail(db, coachId, logSnap.id, data);
}

/** True when `/users/{uid}` is an active client with no coach. */
async function isActiveCoachlessClient(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<boolean> {
  const snap = await db.collection(FirestoreCollections.users).doc(uid).get();
  if (!snap.exists) return false;
  return isCoachlessClientRow({
    role: typeof snap.get("role") === "string" ? snap.get("role") : null,
    coachId: typeof snap.get("coachId") === "string" ? snap.get("coachId") : null,
    deleted: snap.get("deleted") === true,
  });
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

  // Ownership + completed filter in memory (see index note above). Ownership
  // resolves the client's coachId too (issue #434 — client-created "self"
  // workouts carry trainerId === clientId), so the share card shows the actuals
  // of a self-assigned workout the same way it does a trainer-assigned one.
  const ownedAndCompleted = await Promise.all(
    allDocs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      if (!(await coachCanAccessLog(db, trainer.uid, data))) return false;
      // A log is "completed" when it carries a completedAt (status mirrors it).
      return data.status === "completed" || asIso(data.completedAt) !== null;
    }),
  );
  const completed = allDocs.filter((_, i) => ownedAndCompleted[i]);
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
  const clientData = clientSnap.data() as {
    displayName?: string;
    email?: string;
    coachNickname?: string;
  } | undefined;
  const clientName = coachVisibleClientName({
    uid: clientId,
    displayName: clientData?.displayName ?? clientId,
    email: clientData?.email ?? "",
    coachNickname: clientData?.coachNickname ?? null,
  });
  // Render all log timestamps in the CLIENT's timezone (mirrors the
  // assertOwnsClient pattern the deleted client-daily-timeline-actions used):
  // prefer the
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
    "Entrenamiento",
  );
  const startedAt = asIso(data.startedAt);
  const completedAt = asIso(data.completedAt);

  const rawSets = Array.isArray(data.sets)
    ? (data.sets as Array<Record<string, unknown>>)
    : [];
  const templateExercises =
    (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
      ?.exercises ?? [];
  const templateExerciseIds = templateExercises
    .map((exercise) => exercise.exerciseId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const exerciseMap: Map<string, Record<string, unknown>> =
    templateExerciseIds.length > 0
      ? await resolveExerciseDocsById(db, templateExerciseIds)
      : new Map();

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

  // #405 part (a): for every PR in THIS log, find the record it beat — the
  // client's most recent PR for the same exercise from an EARLIER session. Only
  // runs when the log actually has PRs (keeps the extra read off non-PR logs).
  const prPrevBySetLogId = new Map<
    string,
    { weightKg: number; reps: number; estimatedOneRM: number; durationSeconds: number | null }
  >();
  if (rawPrs.length > 0) {
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    const startedAt = asDate(data.startedAt) ?? asDate(data.createdAt);
    const prExerciseIds = new Set(
      rawPrs
        .map((pr) => (typeof pr.exerciseId === "string" ? pr.exerciseId : ""))
        .filter((id) => id.length > 0),
    );
    if (clientId && startedAt && prExerciseIds.size > 0) {
      // Earlier logs only (startedAt <) — reuses the (clientId, startedAt) index.
      const earlierSnap = await db
        .collection(FirestoreCollections.workoutLogs)
        .where("clientId", "==", clientId)
        .where("startedAt", "<", startedAt)
        .orderBy("startedAt", "desc")
        .limit(200)
        .get();
      const earlierPrs = earlierSnap.docs.flatMap((d) =>
        flattenLogPRs(d.data() as Record<string, unknown>),
      );
      const prevByExercise = previousRecordsByExercise(earlierPrs, prExerciseIds);
      for (const pr of rawPrs) {
        const exId = typeof pr.exerciseId === "string" ? pr.exerciseId : "";
        const setLogId =
          typeof pr.set_log_id === "string"
            ? pr.set_log_id
            : typeof pr.setLogId === "string"
              ? pr.setLogId
              : "";
        const prev = exId ? prevByExercise.get(exId) : undefined;
        if (setLogId && prev) {
          prPrevBySetLogId.set(setLogId, {
            weightKg: prev.weightKg,
            reps: prev.reps,
            estimatedOneRM: prev.estimatedOneRM,
            durationSeconds: prev.durationSeconds,
          });
        }
      }
    }
  }

  // One extra point read on a single-workout page. Deliberately NOT folded into
  // the log doc: the coach's client-profile trend widgets fetch up to 500 logs
  // at once, and a few hundred samples per doc would turn that into megabytes
  // for a chart no list view draws.
  const heartRate = await getWorkoutHeartRateSeries(db, logId);

  const nextSetIndexByExercise = new Map<string, number>();
  const sets = rawSets.map((set, index) => {
    const exerciseId = typeof set.exerciseId === "string" ? set.exerciseId : "";
    const fallbackSetKey = exerciseId || `row-${index}`;
    const fallbackSetIndex = nextSetIndexByExercise.get(fallbackSetKey) ?? 0;
    nextSetIndexByExercise.set(fallbackSetKey, fallbackSetIndex + 1);
    const setIndex = setIndexFromLog(set) ?? fallbackSetIndex;
    const templateExercise = exerciseId
      ? templateExerciseById.get(exerciseId)
      : undefined;
    const sourceExercise = exerciseId ? exerciseMap.get(exerciseId) : undefined;
    const exerciseName = localizedText(
      sourceExercise?.name ?? templateExercise?.name,
      `Exercise ${index + 1}`,
    );
    const setLogId = typeof set.id === "string" ? set.id : "";
    const pr = setLogId ? prBySetLogId.get(setLogId) : undefined;
    // quick-260714-m57 (#403) — effective type: a valid non-normal
    // `set_type` wins; unknown strings and legacy docs fall back to the
    // warmup flag. Hardens the share-card warmup exclusion too (a
    // set_type-only warmup now resolves isWarmup=true).
    const setTypeEffective = effectiveSetType({
      set_type: typeof set.set_type === "string" ? set.set_type : null,
      is_warmup: set.is_warmup === true || set.isWarmup === true,
    });
    const loggedDurationSeconds = numeric(set.duration_seconds ?? set.durationSeconds);
    const prescribedDurationSeconds = prescribedDurationForSet(
      templateExercise,
      setIndex,
    );
    const metric = effectiveSetMetric({
      templateExercise,
      sourceExercise,
      loggedDurationSeconds,
      prescribedDurationSeconds,
    });
    const durationSeconds =
      loggedDurationSeconds ?? (metric === "time" ? prescribedDurationSeconds : null);
    return {
      index: index + 1,
      setLogId,
      exerciseId,
      exerciseName,
      metric,
      reps: numeric(set.reps),
      // Wire field is `weight_kg` (iOS); keep `weight` as a legacy fallback.
      weight: numeric(set.weight_kg ?? set.weight),
      // 26-03 — Wire field is `duration_seconds` (iOS, snake_case per
      // PATTERNS.md §15 + Shared 3); keep `durationSeconds` as a
      // legacy/camel fallback mirroring the weight_kg ?? weight pattern
      // above. Null when the set was reps-based or pre-26-04 (no field
      // on the doc).
      durationSeconds,
      // Wire field is `completed_at` (iOS); keep `completedAt` as a legacy fallback.
      completedAt: asIso(set.completed_at ?? set.completedAt),
      // 260529-mrp — the share card excludes warmups from Volumen / Series /
      // top-set / 1RM, matching the iOS twin. quick-260714-m57 (#403):
      // derived from the EFFECTIVE type so `set_type:"warmup"`-only sets are
      // excluded too (sync invariant holds by construction).
      isWarmup: setTypeEffective === "warmup",
      setType: setTypeEffective,
      isPR: Boolean(pr),
      prEstimatedOneRM: pr?.estimatedOneRM ?? null,
      prPrevious: pr ? (prPrevBySetLogId.get(setLogId) ?? null) : null,
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
    heartRate,
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
    // Estricto `=== true` y no truthy: el campo es un booleano en el wire, y un string vacío o
    // un 0 que se colara desde un cliente viejo no debe encender una insignia.
    progressiveOverload: data.progressive_overload === true,
    sets,
  };
}
