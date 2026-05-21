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

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { civilDateToday } from "./civil-date";
import {
  computeCompliance,
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
   * Derived flag from `clientNeedsAttention()` predicate (11-06).
   * True iff `missedWorkoutsLast7Days >= 2` OR `thisWeekComplianceRatio < 0.6`.
   */
  needsAttention: boolean;
  /** Reasons the predicate fired. Empty when `needsAttention === false`. */
  needsAttentionReasons: AttentionReason[];
}

/**
 * Lists every client whose `coachId` matches the calling trainer's UID.
 *
 * Returns a stable, sorted-by-displayName list — the UI can render it
 * directly into a Select or TanStack-Table without re-sorting.
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
export async function listClients(): Promise<ClientRosterEntry[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection("users")
    .where("coachId", "==", trainer.uid)
    .where("role", "==", "client")
    .get();

  const rows: ClientRosterEntry[] = snap.docs.map((d) => {
    const data = d.data() as {
      email?: string;
      displayName?: string;
      timezone?: string;
    };
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName ?? data.email ?? d.id,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
    };
  });

  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }),
  );

  return rows;
}

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
      });
      return rows;
    }, []);

  const clients = [...activeClients, ...pendingClients];

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

  const rows: ClientRosterRow[] = await Promise.all(
    clients.map(async (c): Promise<ClientRosterRow> => {
      // Compute "today" in the client's timezone so the 7-day compliance
      // window aligns with the client's civil-date semantics (matches
      // habit-compliance-actions.ts which uses "UTC" — we pass the client's
      // tz here when available for tighter alignment).
      const tzForToday = c.timezone ?? "UTC";
      const today = civilDateToday(tzForToday);

      // 7-day window bounds. The assignments collection uses `scheduledFor`
      // as a CIVIL DATE STRING ("YYYY-MM-DD" — Pitfall 1 / Pitfall 8); we
      // compare lexicographically against `windowStartCivil`. The workout
      // logs use `startedAt` as a Firestore Timestamp; we pass a Date.
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const sevenDaysAgoDate = new Date(sevenDaysAgoMs);
      const windowStartCivil = civilDateToday(tzForToday, sevenDaysAgoDate);

      const [
        latestWorkoutLog,
        latestChatMessage,
        chatDocSnap,
        clientHabits,
        assignedLast7Snap,
        completedLast7Snap,
      ] = await Promise.all([
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", c.uid)
          .orderBy("startedAt", "desc")
          .limit(1)
          .get(),
        db
          .collection(FirestoreCollections.chats)
          .doc(c.uid)
          .collection(FirestoreCollections.messages)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get(),
        db.collection(FirestoreCollections.chats).doc(c.uid).get(),
        db
          .collection(FirestoreCollections.habits)
          .where("clientId", "==", c.uid)
          .where("deleted", "==", false)
          .get(),
        // 11-06: assignments scheduled in the last 7 civil days. scheduledFor
        // is a "YYYY-MM-DD" string — lexicographic >= comparison is correct
        // because civil-date strings sort identically to civil-date order.
        db
          .collection(FirestoreCollections.workoutAssignments)
          .where("clientId", "==", c.uid)
          .where("scheduledFor", ">=", windowStartCivil)
          .get(),
        // 11-06: logs started in the last 7 days (Timestamp comparison).
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", c.uid)
          .orderBy("startedAt", "desc")
          .limit(50)
          .get(),
      ]);

      const tsWorkout = latestDate(latestWorkoutLog, "startedAt");
      const tsChat = latestDate(latestChatMessage, "createdAt");
      const candidates: Date[] = [tsWorkout, tsChat].filter(
        (d): d is Date => d instanceof Date,
      );
      const lastActivity =
        candidates.length > 0
          ? new Date(Math.max(...candidates.map((d) => d.getTime())))
          : null;

      // chats.unreadCount[trainerUid] — read ONLY the calling trainer's
      // counter (T-11-05-CHAT-UNREAD-SPOOF mitigation: never project a
      // different trainer's count).
      const chatData = chatDocSnap.data();
      const unreadMap = (chatData?.unreadCount ?? {}) as Record<string, number>;
      const rawUnread = unreadMap[trainer.uid];
      const unreadChatCount =
        typeof rawUnread === "number" && rawUnread > 0 ? rawUnread : 0;

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
      const attention = clientNeedsAttention({
        missedWorkoutsLast7Days,
        complianceRatioLast7Days: thisWeekComplianceRatio,
      });

      return {
        uid: c.uid,
        email: c.email,
        displayName: c.displayName,
        timezone: c.timezone,
        source: c.uid.startsWith("mirror:") ? "pending" : "active",
        pendingProvisioning: c.uid.startsWith("mirror:"),
        lastActivityAt: lastActivity?.toISOString() ?? null,
        thisWeekComplianceRatio,
        unreadChatCount,
        missedWorkoutsLast7Days,
        needsAttention: attention.needsAttention,
        needsAttentionReasons: attention.reasons,
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
