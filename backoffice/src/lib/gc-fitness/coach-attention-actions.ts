"use server";

// coach-attention-actions.ts
//
// 260612-e9t (#245): dashboard urgency card data source. Returns the active
// clients who have NOTHING assigned in the next 4 days — no upcoming workout
// assignment AND no habit active in that window — so the trainer can assign
// before the client slips through the cracks.
//
// BOUNDED READS (Firestore cost is an active concern — see STATE.md "Firestore
// cost reduction"). This mirrors `getCoachPulse`'s read budget EXACTLY:
//   - listClients() then .filter(!pendingProvisioning).slice(0, 150) — #513:
//     was 50 and cut SILENTLY; now the same 150 as the mobile callable
//     (`coachAttention.ts` ATTENTION_MAX_CLIENTS, #1588) and a bigger roster
//     comes back `truncated` so the card can say "first 150 checked".
//   - WORKOUTS: ONE windowed trainerId query (with the proven trainerId-only
//     limit(600) fallback on index error) — NEVER a per-client assignment
//     fan-out.
//   - HABITS: per-client capped reads (.where(clientId).limit(50)), only for
//     the clients no workout already covers, in waves of HABITS_FANOUT_BATCH
//     (#513 — 150 parallel queries would be a burst; #484 does the same); a habit
//     "covers" a client when isHabitScheduledOn() is true on ANY of the 4
//     window dates (honors startsOn/endsOn/skippedDates/cadence).
// The whole thing is defensive: a single failing query degrades to partial /
// empty coverage and never throws to the page (the dashboard loads it behind
// safe(), but we also catch here so a habit-read failure can't zero the card).

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { assignedBy } from "./assigned-by";
import { FirestoreCollections } from "./collections";
import { listClients } from "./client-roster";
import { mapInBatches } from "./map-in-batches";
import { isHabitScheduledOn } from "./habit-schedule";
import { getTrainerTimezone } from "./trainer-timezone";

/** Number of days ahead (today inclusive) the urgency window spans. */
const WINDOW_DAYS = 4;
/**
 * Cap on clients scanned. #513 — twin of the callable's ATTENTION_MAX_CLIENTS
 * (gc-fitness `functions/src/coach/coachAttention.ts`, #1588): 150, and a
 * bigger roster is reported as `truncated` instead of silently cut.
 */
const MAX_CLIENTS = 150;
/** Concurrent per-client habit reads (same wave size as the roster's fan-out). */
const HABITS_FANOUT_BATCH = 25;

export interface UnassignedClientRow {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export interface UnassignedClientsResult {
  rows: UnassignedClientRow[];
  /** True when the coach has more than MAX_CLIENTS active clients: only the
   *  first `scanned` were checked. */
  truncated: boolean;
  /** How many active clients were checked. */
  scanned: number;
}

/**
 * Build the civil-date window [today, today+WINDOW_DAYS-1] in the trainer's tz.
 * Uses noon-UTC date arithmetic like coach-pulse-actions' buildWindowDays —
 * civil dates map to exactly one day regardless of zone, so this is DST-safe.
 */
function buildWindowDays(timezone: string): string[] {
  const today = civilDateToday(timezone);
  const todayDate = new Date(`${today}T12:00:00Z`);
  const days: string[] = [];
  for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
    const day = new Date(todayDate.getTime() + offset * 24 * 60 * 60 * 1000);
    days.push(civilDateFormat(day, timezone));
  }
  return days;
}

export async function listClientsWithNothingAssignedSoon(): Promise<UnassignedClientsResult> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clients = await listClients();
  const allActive = clients.filter((c) => !c.pendingProvisioning);
  const activeClients = allActive.slice(0, MAX_CLIENTS);
  const truncated = allActive.length > MAX_CLIENTS;
  if (activeClients.length === 0) return { rows: [], truncated: false, scanned: 0 };

  const trainerTz = await getTrainerTimezone();
  const windowDays = buildWindowDays(trainerTz);
  const windowStart = windowDays[0]!;
  const windowEnd = windowDays[windowDays.length - 1]!;

  const logError = (label: string) => (err: unknown) => {
    console.error(`[coach-attention] ${label} failed`, err);
    return null;
  };

  // ── WORKOUTS: ONE windowed trainerId query (verbatim shape from
  // coach-pulse-actions). Falls back to the trainerId-only limit(600) + an
  // in-memory window filter when the (trainerId, scheduledFor) composite index
  // is still building, so an index build can't silently mark everyone covered
  // (false negatives) or everyone uncovered (false positives). ──────────────
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

  const assignmentsSnap = await assignmentsPromise;

  // Clients with ≥1 workout assignment landing in [windowStart, windowEnd].
  // The in-memory window filter is a no-op for the indexed query (already
  // windowed) and the necessary trim for the trainerId-only fallback.
  const coveredByWorkout = new Set<string>();
  for (const doc of assignmentsSnap?.docs ?? []) {
    const data = doc.data() as Record<string, unknown>;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!scheduledFor || !clientId) continue;
    if (scheduledFor < windowStart || scheduledFor > windowEnd) continue;
    coveredByWorkout.add(clientId);
  }

  // ── HABITS: per-client capped reads, only for the clients no workout
  // already covers (a habit can't uncover them), in bounded waves. ─────────
  const needHabitCheck = activeClients.filter((c) => !coveredByWorkout.has(c.uid));
  const habitsSnaps = await mapInBatches(needHabitCheck, HABITS_FANOUT_BATCH, (client) =>
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", client.uid)
      .limit(50)
      .get()
      .catch(logError(`habits clientId=${client.uid}`)),
  );

  // Clients with ≥1 habit active on ANY of the window dates. Soft-deleted
  // habits never count (the predicate ignores `deleted`, so guard here —
  // mirrors coach-pulse's habitScheduledOn wrapper).
  const coveredByHabit = new Set<string>();
  habitsSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = needHabitCheck[idx]!;
    for (const doc of snap.docs) {
      const habit = doc.data() as Record<string, unknown>;
      if (habit.deleted === true) continue;
      // #1504 — a former coach's habit doesn't mean this client is covered.
      if (assignedBy(habit, { coachId: trainer.uid }) === "former") continue;
      const activeInWindow = windowDays.some((d) =>
        isHabitScheduledOn(habit, d),
      );
      if (activeInWindow) {
        coveredByHabit.add(client.uid);
        break;
      }
    }
  });

  // Result = active clients covered by NEITHER a workout NOR an active habit.
  const rows: UnassignedClientRow[] = activeClients
    .filter(
      (c) => !coveredByWorkout.has(c.uid) && !coveredByHabit.has(c.uid),
    )
    .map((c) => ({
      uid: c.uid,
      displayName: c.displayName,
      photoURL: c.photoURL,
    }));

  return { rows, truncated, scanned: activeClients.length };
}
