// client-roster.ts
//
// Server Action that returns the calling trainer's client roster.
//
// This is a minimal v1 implementation introduced by P04-05 to unblock the
// schedule + bulk-assign UI surfaces. The P02 phase laid down the
// /users/{uid} schema with `role: "client"` + `coachId: <trainerUid>` (see
// `02-04-PLAN.md` line 180 + `02-RESEARCH.md` line 1199) but never shipped
// a Server-Action wrapper around it. P04-05 needs that wrapper:
//
//   - Schedule view: client picker dropdown (no clientId in URL → show roster).
//   - Bulk-assign: multi-select TanStack-Table populated with the same roster.
//
// Why not extend P02's auth-helpers.ts? auth-helpers owns session resolution,
// not a Firestore query. Keeping the roster query in its own module keeps the
// dependency graph linear and lets P05 + P08 + P10 import the helper without
// importing the auth surface.
//
// Threat-register coverage (04-05 PLAN.md):
//   T-04-22 — bulk-assign cross-roster denial. The bulk-assign Server Action
//             could (and should, in v2) cross-check the input clientIds
//             against this roster before constructing the WriteBatch. v1
//             relies on the Firestore rule layer for the truth — but a
//             cross-roster bulk assign would surface as PERMISSION_DENIED
//             on every write, aborting the atomic batch (T-04-22 mitigated
//             by the rule + atomicity). The UI uses this list to keep
//             trainers from seeing other-trainer clients in the first place.
//
// Doc shape (P02 schema):
//   /users/{uid} = {
//     uid: string,
//     email: string,
//     displayName: string,
//     role: "trainer" | "client",
//     coachId: string | null,    // required for clients, null for trainers
//     timezone?: string,         // IANA identifier (P04-06 will populate)
//     ...
//   }

"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { civilDateToday } from "./civil-date";
import { getTrainerTimezone } from "./trainer-timezone";
import {
  computeCompliance,
  logCountsAsCompleted,
  type HabitLogRow,
} from "./habit-compliance";
import type { HabitType } from "./habit-schema";
import {
  clientNeedsAttention,
  type AttentionReason,
} from "./client-attention";

export interface ClientRosterEntry {
  uid: string;
  email: string;
  displayName: string;
  timezone: string | null;
  photoURL: string | null;
  pendingProvisioning: boolean;
}

/**
 * Roster row aggregating last activity + this-week compliance + unread
 * chat count for a single client. Returned by `listClientsForRoster()`
 * for the trainer roster view (P11-05). Closes BO-07.
 *
 * Wire shape:
 *   - All timestamps are ISO-8601 strings (or null), NEVER Firestore
 *     Timestamp instances — the row is shipped from a Server Component
 *     to a client component, and Next.js requires the prop boundary be
 *     serializable.
 *   - `thisWeekComplianceRatio` is clamped to [0, 1].
 *   - `unreadChatCount` is the trainer's POV (`chats.unreadCount[trainerUid]`).
 */
export interface ClientRosterRow {
  uid: string;
  email: string;
  displayName: string;
  timezone: string | null;
  source: "active" | "pending";
  pendingProvisioning: boolean;
  /** ISO-8601 of the most recent activity across workout/habit/chat — or null if no activity. */
  lastActivityAt: string | null;
  /** Compliance ratio in [0, 1] averaged across this client's habits over the last 7 days. */
  thisWeekComplianceRatio: number;
  /** Unread chat messages for this trainer reading this client's thread. */
  unreadChatCount: number;
  /**
   * Missed workouts over the last 7 days, computed as
   * `max(0, assignedWorkouts - completedWorkouts)`. Added in 11-06.
   *
   * v1 approximation: 1 assignment is expected to produce 1 log; legitimate
   * re-do logs would over-count completed. V2 carry-forward: track an
   * explicit `assignment.status` field for granular accounting.
   */
  missedWorkoutsLast7Days: number;
  /**
   * Derived flag from `clientNeedsAttention()` predicate.
   * True iff the client has had zero activity for at least 3 days
   * (see NEEDS_ATTENTION_INACTIVITY_HOURS in client-attention.ts).
   */
  needsAttention: boolean;
  /** Reasons the predicate fired. Empty when `needsAttention === false`. */
  needsAttentionReasons: AttentionReason[];
  /** Habit completions in the last 7 calendar days (done / scheduled).
   *  "done" = non-deleted habit_logs whose civilDate falls in the window and
   *  whose value passes `boolCompleted`. "scheduled" = sum over the client's
   *  active habits of how many days the habit's cadence picked in the window. */
  habitsCompletedThisWeek: number;
  habitsScheduledThisWeek: number;
  /** Workouts in the calendar month containing today (client tz when known).
   *  "completed" = workout_logs with status==="completed" started in-month.
   *  "scheduled" = workout_assignments with scheduledFor in-month. */
  workoutsCompletedThisMonth: number;
  workoutsScheduledThisMonth: number;
  /** Goal counts on `/client_goals` bucketed by horizon. */
  goalsCount: { short: number; medium: number; long: number };
}

/**
 * Internal Firestore-fanning body for `listClients()`. Takes the trainer uid
 * as an EXPLICIT parameter — it must NOT call `getCurrentTrainer()` (which
 * reads the session cookie) because this runs inside `unstable_cache`, where
 * request cookies are unavailable.
 *
 * The trainer uid is passed as the function ARGUMENT so `unstable_cache` keys
 * each trainer's roster to a distinct cache entry (T-0z9-01 mitigation — no
 * cross-trainer roster leak).
 */
async function _fetchClientsForTrainer(
  trainerUid: string,
): Promise<ClientRosterEntry[]> {
  const db = gcFitnessFirestore();
  const [activeSnap, mirrorSnap] = await Promise.all([
    db
      .collection("users")
      .where("coachId", "==", trainerUid)
      .where("role", "==", "client")
      .get(),
    db
      .collection(FirestoreCollections.userMirror)
      .where("coachId", "==", trainerUid)
      .get(),
  ]);

  const activeRows: ClientRosterEntry[] = activeSnap.docs.map((d) => {
    const data = d.data() as {
      email?: string;
      displayName?: string;
      timezone?: string;
      photoURL?: string;
    };
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName ?? data.email ?? d.id,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      pendingProvisioning: false,
    };
  });

  const activeEmails = new Set(
    activeRows.map((row) => row.email.trim().toLowerCase()).filter(Boolean),
  );
  const pendingRows: ClientRosterEntry[] = mirrorSnap.docs
    .reduce<ClientRosterEntry[]>((rows, doc) => {
      const data = doc.data() as {
        email?: string;
        displayName?: string;
      };
      const email = (data.email ?? doc.id).trim().toLowerCase();
      if (!email || activeEmails.has(email)) {
        return rows;
      }
      rows.push({
        uid: `mirror:${doc.id}`,
        email,
        displayName:
          typeof data.displayName === "string" && data.displayName.trim().length > 0
            ? data.displayName.trim()
            : email,
        timezone: null,
        photoURL: null,
        pendingProvisioning: true,
      });
      return rows;
    }, []);

  const rows = [...activeRows, ...pendingRows];

  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }),
  );

  return rows;
}

/**
 * Cross-navigation TTL cache for the roster fan-out (FIX A, 0z9 / COST-RD1-A).
 *
 * `unstable_cache` is a DATA cache (not the full-route cache), so it survives
 * across the 6 force-dynamic gc-fitness pages and across separate requests
 * within the `revalidate` window — this is what actually collapses the
 * per-page `listClients()` reads. React `cache()` alone would only dedupe
 * within a single render pass.
 *
 * Cache key: `unstable_cache` keys on the static `keyParts` array PLUS the
 * serialized function arguments. We pass `trainerUid` as the argument so each
 * trainer gets a DISTINCT cache entry — per-trainer isolation, no cross-trainer
 * roster leak (T-0z9-01). The uid is resolved from the session cookie OUTSIDE
 * this cached fn (see `listClients` below).
 *
 * revalidate: 60 → a newly-added client appears within ≤60s while navigations
 * within the window reuse one fetch (2 Firestore reads) per trainer.
 */
const cachedFetchClients = unstable_cache(
  _fetchClientsForTrainer,
  ["gc-fitness-roster"],
  { revalidate: 60 },
);

/**
 * Lists every client whose `coachId` matches the calling trainer's UID.
 *
 * Returns a stable, sorted-by-displayName list — the UI can render it
 * directly into a Select or TanStack-Table without re-sorting.
 *
 * Caching (FIX A, 0z9):
 *   - The trainer uid is resolved here (cookie read via getCurrentTrainer())
 *     OUTSIDE the data cache, then passed to `cachedFetchClients(uid)` whose
 *     `unstable_cache` gives a 60s cross-navigation TTL keyed per trainer.
 *   - This public entry is wrapped in React `cache()` for free per-request
 *     dedupe (e.g. when both listClientsForRoster → listClients and a
 *     layout/page call it within ONE request).
 *
 * Exported signature is unchanged — all call sites compile + behave
 * identically except for the dedup/TTL.
 *
 * Errors:
 *   - Forbidden → no session / wrong role / not in allowlist
 *
 * v1 caveats:
 *   - No pagination. Cordero's roster is ~5k; a single query returns all
 *     docs, which is fine for trainer-side admin views. v2 may add cursor
 *     pagination if a single trainer's roster exceeds 1k.
 *   - No soft-delete filter at the query layer — clients deleted via the
 *     P02 onUserDeleted flow have their /users doc hard-removed, so there
 *     is no `deleted: true` filter to apply here.
 */
export const listClients = cache(
  async (): Promise<ClientRosterEntry[]> => {
    const trainer = await getCurrentTrainer();
    return cachedFetchClients(trainer.uid);
  },
);

/**
 * Trainer roster aggregator for `/gc-fitness/clients` (P11-05). Closes BO-07.
 *
 * For each client in the calling trainer's roster, fan out to Firestore:
 *   - lastActivityAt: max(workoutLog.startedAt, habitLog.loggedAt, chatMessage.createdAt)
 *   - thisWeekComplianceRatio: average of `computeCompliance(habit, last7Days)`
 *     across the client's assigned habits (deleted excluded)
 *   - unreadChatCount: `chats/{clientId}.unreadCount[trainer.uid]`
 *
 * Read budget (CONTEXT decision — v1 trainers have small rosters):
 *   - 50-client cap per call
 *   - Per client: 3 single-doc queries (last workout / habit / chat message)
 *     + 1 chat doc + 1 habits query + N habit_logs reads (one per habit, bound to 50)
 *   - Worst-case: 50 clients * ~5 reads = 250 reads + per-habit log fetches.
 *
 * V2 carry-forward: denormalize `lastActivityAt` onto `/users/{uid}` via
 * Cloud Function triggers so the roster collapses to a single query.
 *
 * Sort: lastActivityAt DESC (most recently active first). Clients with no
 * activity (`lastActivityAt === null`) go to the end, sorted by displayName.
 *
 * The implementation deliberately uses the camelCase field names locked in
 * `.planning/schemas/`:
 *   - `workout_logs.startedAt`     (Timestamp)
 *   - `habit_logs.loggedAt`        (Timestamp)
 *   - `chats/{cid}/messages.createdAt` (Timestamp)
 *   - `chats/{cid}.unreadCount`    (Map<string, number>)
 *   - `habits.clientId, type, targetValue, deleted`
 */
export async function listClientsForRoster(): Promise<ClientRosterRow[]> {
  const trainer = await getCurrentTrainer();
  const base = await listClients();
  const db = gcFitnessFirestore();
  const mirrorSnap = await db
    .collection(FirestoreCollections.userMirror)
    .where("coachId", "==", trainer.uid)
    .get();

  const activeEmails = new Set(
    base.map((client) => client.email.trim().toLowerCase()).filter(Boolean),
  );
  const activeClients = base.slice(0, 50);
  const pendingClients: ClientRosterEntry[] = mirrorSnap.docs
    .reduce<ClientRosterEntry[]>((rows, doc) => {
      const data = doc.data() as {
        email?: string;
        displayName?: string;
        coachId?: string;
        pre_created?: boolean;
      };
      const email = (data.email ?? doc.id).trim().toLowerCase();
      if (!email || activeEmails.has(email)) {
        return rows;
      }
      rows.push({
        uid: `mirror:${doc.id}`,
        email,
        displayName:
          typeof data.displayName === "string" && data.displayName.trim().length > 0
            ? data.displayName.trim()
            : email,
        timezone: null,
        photoURL: null,
        pendingProvisioning: true,
      });
      return rows;
    }, []);

  const clients = [...activeClients, ...pendingClients];

  // One-shot query: every goal in the trainer's roster, bucketed per client.
  // Cheaper than fanning out per-client (51+ clients = 1 query vs 51).
  const goalsByClient = new Map<
    string,
    { short: number; medium: number; long: number }
  >();
  try {
    const goalsSnap = await db
      .collection(FirestoreCollections.clientGoals)
      .where("coachId", "==", trainer.uid)
      .get();
    for (const doc of goalsSnap.docs) {
      const data = doc.data() as { clientId?: string; horizon?: string };
      const clientId = typeof data.clientId === "string" ? data.clientId : "";
      const horizon = data.horizon;
      if (!clientId) continue;
      const bucket = goalsByClient.get(clientId) ?? {
        short: 0,
        medium: 0,
        long: 0,
      };
      if (horizon === "short") bucket.short += 1;
      else if (horizon === "medium") bucket.medium += 1;
      else if (horizon === "long") bucket.long += 1;
      goalsByClient.set(clientId, bucket);
    }
  } catch {
    // Goals collection might be empty / missing rules — fail soft, render 0/0/0.
  }

  // Helper: pull the latest Date-valued field off a 1-doc snapshot.
  const latestDate = (
    snap: FirebaseFirestore.QuerySnapshot,
    field: string,
  ): Date | null => {
    const doc = snap.docs[0];
    if (!doc) return null;
    const raw = doc.get(field);
    if (raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
      return (raw as { toDate: () => Date }).toDate();
    }
    if (raw instanceof Date) return raw;
    if (typeof raw === "string") {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  // Resolve the trainer's own timezone ONCE so we never fall back to the
  // accidental server UTC zone for a client that has no stored timezone.
  const trainerTz = await getTrainerTimezone();

  const rows: ClientRosterRow[] = await Promise.all(
    clients.map(async (c): Promise<ClientRosterRow> => {
      // Compute "today" in the client's timezone so the 7-day compliance
      // window aligns with the client's civil-date semantics (matches
      // habit-compliance-actions.ts). When the client has no stored tz we
      // fall back to the trainer's own cookie tz rather than literal "UTC".
      const tzForToday = c.timezone ?? trainerTz;
      const today = civilDateToday(tzForToday);

      // 7-day window bounds. The assignments collection uses `scheduledFor`
      // as a CIVIL DATE STRING ("YYYY-MM-DD" — Pitfall 1 / Pitfall 8); we
      // compare lexicographically against `windowStartCivil`. The workout
      // logs use `startedAt` as a Firestore Timestamp; we pass a Date.
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const sevenDaysAgoDate = new Date(sevenDaysAgoMs);
      const windowStartCivil = civilDateToday(tzForToday, sevenDaysAgoDate);

      // Month window — civil-date strings clamped to the first/last day of
      // the calendar month containing `today`. `today` is "YYYY-MM-DD" so
      // slicing gives a "YYYY-MM" prefix; `<= prefix + "-31"` works because
      // civil-date strings compare lexicographically — May 31 sorts after
      // every May day and before any June day.
      const monthStartCivil = `${today.slice(0, 7)}-01`;
      const monthEndCivil = `${today.slice(0, 7)}-31`;

      const [
        latestWorkoutLog,
        recentHabitLogs,
        latestProgressPhoto,
        chatDocSnap,
        clientHabits,
        assignedLast7Snap,
        completedLast7Snap,
        assignedThisMonthSnap,
        completedThisMonthSnap,
      ] = await Promise.all([
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", c.uid)
          .orderBy("startedAt", "desc")
          .limit(1)
          .get(),
        // Habit logs reflect the client's own check-in; the dashboard's
        // "last action" feed surfaces them, so sorting must too.
        //
        // NO orderBy: some legacy/iOS-written habit logs are missing
        // `loggedAt` entirely (the canonical iOS writer populates it, but
        // older writes only have updatedAt/createdAt). An orderBy(loggedAt)
        // query silently EXCLUDES those docs — which is the bug that made
        // Nico Rey show "no activity" and Nico Carba show stale 19h-ago
        // despite habit_logs written today. We mirror the recent-logs
        // pattern: broad-fetch, compute max(updatedAt, createdAt, loggedAt)
        // per doc in memory. `limit(50)` is safely above any single client's
        // recent-window log count.
        db
          .collection(FirestoreCollections.habitLogs)
          .where("clientId", "==", c.uid)
          .limit(50)
          .get(),
        // Progress photos are a separate client surface — counts here too.
        db
          .collection(FirestoreCollections.progressPhotos)
          .where("clientId", "==", c.uid)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get()
          .catch(() => null),
        // Chat messages are intentionally NOT counted as "last action" —
        // a trainer-sent chat would otherwise bump the client to the top of
        // every roster (260528 bug). Mirrors the exclusion in
        // listRecentLogsForTrainer.
        db.collection(FirestoreCollections.chats).doc(c.uid).get(),
        db
          .collection(FirestoreCollections.habits)
          .where("clientId", "==", c.uid)
          .where("deleted", "==", false)
          // 260529 cost backstop: a roster row never needs more than a
          // sane ceiling of habits; the compliance math below tolerates the
          // cap (no real client carries >100 active habits). Bounds the
          // worst-case read on the (clientId, deleted, updatedAt) index.
          .limit(100)
          .get(),
        // 11-06: assignments scheduled in the last 7 civil days. scheduledFor
        // is a "YYYY-MM-DD" string — lexicographic comparison is correct
        // because civil-date strings sort identically to civil-date order.
        // 260529: upper-bound the range at `today`. Without it the query
        // returned EVERY future assignment too (recurring schedules run
        // months ahead), which (a) inflated `assignedCount` → wrong
        // `missedWorkoutsLast7Days`, and (b) read a unbounded slice per
        // client. The (clientId, scheduledFor) index serves the two-sided
        // range; it is confirmed deployed in production.
        db
          .collection(FirestoreCollections.workoutAssignments)
          .where("clientId", "==", c.uid)
          .where("scheduledFor", ">=", windowStartCivil)
          .where("scheduledFor", "<=", today)
          .get(),
        // 11-06: logs started in the last 7 days (Timestamp comparison).
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", c.uid)
          .orderBy("startedAt", "desc")
          .limit(50)
          .get(),
        // 260528: assignments scheduled IN this calendar month (string range).
        db
          .collection(FirestoreCollections.workoutAssignments)
          .where("clientId", "==", c.uid)
          .where("scheduledFor", ">=", monthStartCivil)
          .where("scheduledFor", "<=", monthEndCivil)
          .get(),
        // 260528: completed workout logs in this calendar month. We filter on
        // status to avoid counting `started`-only sessions; index is just
        // (clientId, startedAt) so we filter status in memory.
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", c.uid)
          .orderBy("startedAt", "desc")
          .limit(100)
          .get(),
      ]);

      const tsWorkout = latestDate(latestWorkoutLog, "startedAt");
      // Walk every habit-log doc and take the max event-time across the
      // three timestamp fields. Some docs only have updatedAt; others only
      // loggedAt — picking ANY non-null field is what makes the bug go
      // away (260528 bug). Reads the raw Timestamp via doc.get() so we
      // handle Firestore Timestamp + Date + ISO string identically.
      let tsHabit: Date | null = null;
      const habitTimestampFields = ["updatedAt", "createdAt", "loggedAt"] as const;
      for (const doc of recentHabitLogs.docs) {
        // Skip soft-deleted rows — recent-logs surface filters them too.
        if (doc.get("deleted") === true) continue;
        for (const field of habitTimestampFields) {
          const raw = doc.get(field);
          let candidate: Date | null = null;
          if (raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
            candidate = (raw as { toDate: () => Date }).toDate();
          } else if (raw instanceof Date) {
            candidate = raw;
          } else if (typeof raw === "string") {
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) candidate = parsed;
          }
          if (candidate && (!tsHabit || candidate > tsHabit)) {
            tsHabit = candidate;
          }
        }
      }
      const tsPhoto = latestProgressPhoto
        ? latestDate(latestProgressPhoto, "createdAt")
        : null;
      const candidates: Date[] = [tsWorkout, tsHabit, tsPhoto].filter(
        (d): d is Date => d instanceof Date,
      );
      const lastActivity =
        candidates.length > 0
          ? new Date(Math.max(...candidates.map((d) => d.getTime())))
          : null;

      // chats.unreadCount[trainerUid] — read ONLY the calling trainer's
      // counter (T-11-05-CHAT-UNREAD-SPOOF mitigation: never project a
      // different trainer's count).
      // 260524 — also tolerate the legacy flat top-level
      // `"unreadCount.{trainerUid}"` field that pre-fix Cloud Function writes
      // produced (see `readUnreadCountFromRaw` in chat-server-actions.ts).
      const chatData = (chatDocSnap.data() ?? {}) as Record<string, unknown>;
      const nestedMap =
        (chatData.unreadCount as Record<string, number> | undefined) ?? {};
      const legacyFlat = chatData[`unreadCount.${trainer.uid}`];
      const rawUnread =
        typeof nestedMap[trainer.uid] === "number"
          ? nestedMap[trainer.uid]
          : typeof legacyFlat === "number"
            ? (legacyFlat as number)
            : 0;
      const unreadChatCount = rawUnread > 0 ? rawUnread : 0;

      // This-week compliance — fetch up to 50 logs per habit (>>7 expected),
      // compute per-habit ratio via the Pattern-B pure function, then average.
      const habitDocs = clientHabits.docs;
      let complianceSum = 0;
      let complianceCount = 0;
      for (const hdoc of habitDocs) {
        const habit = hdoc.data() as {
          type?: HabitType;
          targetValue?: number;
        };
        const habitType: HabitType = (habit.type ?? "binary") as HabitType;
        const targetValue =
          typeof habit.targetValue === "number" ? habit.targetValue : undefined;

        const logsSnap = await db
          .collection(FirestoreCollections.habitLogs)
          .where("habitId", "==", hdoc.id)
          .orderBy("loggedAt", "desc")
          .limit(50)
          .get();

        const logs: HabitLogRow[] = logsSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            habitId: (data.habitId as string) ?? "",
            clientId: (data.clientId as string) ?? "",
            civilDate: (data.civilDate as string) ?? "",
            value: data.value as boolean | string | number,
            unit: typeof data.unit === "string" ? data.unit : undefined,
            deleted: data.deleted === true,
          };
        });

        const { ratio } = computeCompliance(
          habitType,
          logs,
          7,
          today,
          tzForToday,
          targetValue,
        );
        complianceSum += ratio;
        complianceCount += 1;
      }
      // Vacuous-compliance rule (11-06 decision): when the client has zero
      // assigned habits, the average is over an empty set. We default to
      // 1.0 (vacuously compliant) so the `clientNeedsAttention` predicate
      // does NOT flag the client for "low compliance" against an empty
      // habit set. The roster table's "This week" column clamps the
      // displayed percentage to [0, 100] regardless.
      const thisWeekComplianceRatio =
        complianceCount > 0 ? complianceSum / complianceCount : 1;

      // 11-06: derive missed workouts + needs-attention.
      const assignedCount = assignedLast7Snap.size;
      const completedCount = completedLast7Snap.docs.filter((doc) => {
        const raw = doc.get("startedAt");
        const startedAt =
          raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
            ? (raw as { toDate: () => Date }).toDate()
            : raw instanceof Date
              ? raw
              : null;
        return startedAt ? startedAt >= sevenDaysAgoDate : false;
      }).length;
      const missedWorkoutsLast7Days = Math.max(
        0,
        assignedCount - completedCount,
      );

      // 260528 — month-window workout counts. Assigned: every
      // `workout_assignments` doc whose `scheduledFor` falls in this calendar
      // month. Completed: every workout_log started in-month AND with
      // `status === "completed"` (a started-but-abandoned log doesn't count).
      const workoutsScheduledThisMonth = assignedThisMonthSnap.size;
      const workoutsCompletedThisMonth = completedThisMonthSnap.docs.filter(
        (doc) => {
          const raw = doc.get("startedAt");
          const startedAt =
            raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
              ? (raw as { toDate: () => Date }).toDate()
              : raw instanceof Date
                ? raw
                : null;
          if (!startedAt) return false;
          const civil = civilDateToday(tzForToday, startedAt);
          if (civil < monthStartCivil || civil > monthEndCivil) return false;
          const status = doc.get("status");
          return status === "completed";
        },
      ).length;

      // 260528 — habit counts for the trailing 7 days. "Scheduled" sums each
      // habit's cadence (daily=7; weekly with weekdays selected = how many of
      // those weekdays fall in the 7-day window; monthly=at most 1). Logs
      // already loaded in the per-habit compliance loop above provide the
      // "completed" count via `boolCompleted` over the same window.
      let habitsCompletedThisWeek = 0;
      let habitsScheduledThisWeek = 0;
      const windowDays: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        windowDays.push(civilDateToday(tzForToday, d));
      }
      const windowSet = new Set(windowDays);
      for (const hdoc of habitDocs) {
        const habit = hdoc.data() as {
          scheduleType?: string;
          scheduleCadence?: string;
          scheduleWeekdays?: number[];
          scheduleDayOfMonth?: number;
          scheduleMonthDays?: number[];
        };
        // scheduleType === "one-time" habits don't appear on per-day
        // checklists in the trailing-7 sense; skip them here.
        if (habit.scheduleType === "one-time") continue;
        const cadence = habit.scheduleCadence ?? "daily";
        if (cadence === "daily") {
          habitsScheduledThisWeek += 7;
        } else if (cadence === "weekly") {
          const weekdays = Array.isArray(habit.scheduleWeekdays)
            ? habit.scheduleWeekdays
            : [];
          // iOS uses 1=Mon..7=Sun; JS Date.getDay() uses 0=Sun..6=Sat.
          // Map iOS 7 → JS 0 (Sun), otherwise iOS N → JS N.
          const normalized = new Set(
            weekdays.map((d) => (d === 7 ? 0 : d)),
          );
          for (const civil of windowDays) {
            const [y, m, d] = civil.split("-").map(Number);
            const jsDay = new Date(y, m - 1, d).getDay();
            if (normalized.has(jsDay)) habitsScheduledThisWeek += 1;
          }
        } else if (cadence === "monthly") {
          const dayOfMonth = habit.scheduleDayOfMonth;
          const monthDays = Array.isArray(habit.scheduleMonthDays)
            ? habit.scheduleMonthDays
            : dayOfMonth
              ? [dayOfMonth]
              : [];
          for (const civil of windowDays) {
            const day = Number(civil.slice(8, 10));
            if (monthDays.includes(day)) habitsScheduledThisWeek += 1;
          }
        }
      }
      // Count completed habit logs in the 7-day window from the SAME logs
      // already loaded by the per-habit compliance loop above — re-querying
      // would double the read budget. The compliance loop runs first, so by
      // the time we're here `complianceCount`/`complianceSum` are populated
      // but we don't have direct access to the raw logs. Re-fetch the same
      // habit_logs by habit, but ONLY when there are habits to count — the
      // limit(50) per habit + clientHabits cap means this fan-out stays
      // bounded for v1 trainer rosters.
      for (const hdoc of habitDocs) {
        const habit = hdoc.data() as { type?: HabitType; targetValue?: number };
        const habitType: HabitType = (habit.type ?? "binary") as HabitType;
        const targetValue =
          typeof habit.targetValue === "number" ? habit.targetValue : undefined;
        const logsSnap = await db
          .collection(FirestoreCollections.habitLogs)
          .where("habitId", "==", hdoc.id)
          .orderBy("loggedAt", "desc")
          .limit(50)
          .get();
        for (const ldoc of logsSnap.docs) {
          const data = ldoc.data() as Record<string, unknown>;
          const civil = typeof data.civilDate === "string" ? data.civilDate : "";
          if (!windowSet.has(civil)) continue;
          const row: HabitLogRow = {
            habitId: (data.habitId as string) ?? "",
            clientId: (data.clientId as string) ?? "",
            civilDate: civil,
            value: data.value as boolean | string | number,
            unit: typeof data.unit === "string" ? data.unit : undefined,
            deleted: data.deleted === true,
          };
          if (!logCountsAsCompleted(row, habitType, targetValue)) continue;
          habitsCompletedThisWeek += 1;
        }
      }

      const goalsCount = goalsByClient.get(c.uid) ?? {
        short: 0,
        medium: 0,
        long: 0,
      };

      const isPending = c.uid.startsWith("mirror:");
      // Pending sign-in clients are never flagged at-risk: they have no
      // logged activity yet by definition, so the inactivity predicate
      // would always fire — that's noise, not a real signal.
      const attention = isPending
        ? { needsAttention: false, reasons: [] as AttentionReason[] }
        : clientNeedsAttention({
            lastActivityAtMs: lastActivity?.getTime() ?? null,
            nowMs: Date.now(),
          });

      return {
        uid: c.uid,
        email: c.email,
        displayName: c.displayName,
        timezone: c.timezone,
        source: isPending ? "pending" : "active",
        pendingProvisioning: isPending,
        lastActivityAt: lastActivity?.toISOString() ?? null,
        thisWeekComplianceRatio,
        unreadChatCount,
        missedWorkoutsLast7Days,
        needsAttention: attention.needsAttention,
        needsAttentionReasons: attention.reasons,
        habitsCompletedThisWeek,
        habitsScheduledThisWeek,
        workoutsCompletedThisMonth,
        workoutsScheduledThisMonth,
        goalsCount,
      };
    }),
  );

  // Sort: lastActivityAt DESC (ISO-8601 sorts lexicographically); nulls last;
  // tiebreaker by displayName ASC.
  rows.sort((a, b) => {
    if (a.pendingProvisioning !== b.pendingProvisioning) {
      return a.pendingProvisioning ? 1 : -1;
    }
    if (a.lastActivityAt && b.lastActivityAt) {
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    }
    if (a.lastActivityAt && !b.lastActivityAt) return -1;
    if (!a.lastActivityAt && b.lastActivityAt) return 1;
    return a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
  });

  return rows;
}
