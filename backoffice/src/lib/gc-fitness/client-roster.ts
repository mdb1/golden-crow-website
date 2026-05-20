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
  /** ISO-8601 of the most recent activity across workout/habit/chat — or null if no activity. */
  lastActivityAt: string | null;
  /** Compliance ratio in [0, 1] averaged across this client's habits over the last 7 days. */
  thisWeekComplianceRatio: number;
  /** Unread chat messages for this trainer reading this client's thread. */
  unreadChatCount: number;
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
  // Cap at 50 — v1 trainer rosters are small (see CONTEXT decision; V2 paginates).
  const clients = base.slice(0, 50);

  const db = gcFitnessFirestore();

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

      const [
        latestWorkoutLog,
        latestHabitLog,
        latestChatMessage,
        chatDocSnap,
        clientHabits,
      ] = await Promise.all([
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", c.uid)
          .orderBy("startedAt", "desc")
          .limit(1)
          .get(),
        db
          .collection(FirestoreCollections.habitLogs)
          .where("clientId", "==", c.uid)
          .orderBy("loggedAt", "desc")
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
      ]);

      const tsWorkout = latestDate(latestWorkoutLog, "startedAt");
      const tsHabit = latestDate(latestHabitLog, "loggedAt");
      const tsChat = latestDate(latestChatMessage, "createdAt");
      const candidates: Date[] = [tsWorkout, tsHabit, tsChat].filter(
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
      const thisWeekComplianceRatio =
        complianceCount > 0 ? complianceSum / complianceCount : 0;

      return {
        uid: c.uid,
        email: c.email,
        displayName: c.displayName,
        timezone: c.timezone,
        lastActivityAt: lastActivity?.toISOString() ?? null,
        thisWeekComplianceRatio,
        unreadChatCount,
      };
    }),
  );

  // Sort: lastActivityAt DESC (ISO-8601 sorts lexicographically); nulls last;
  // tiebreaker by displayName ASC.
  rows.sort((a, b) => {
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
