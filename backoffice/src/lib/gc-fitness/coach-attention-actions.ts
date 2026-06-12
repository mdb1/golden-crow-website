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
//   - listClients() then .filter(!pendingProvisioning).slice(0, 50)
//   - WORKOUTS: ONE windowed trainerId query (with the proven trainerId-only
//     limit(600) fallback on index error) — NEVER a per-client assignment
//     fan-out.
//   - HABITS: per-client capped reads (.where(clientId).limit(50)); a habit
//     "covers" a client when isHabitScheduledOn() is true on ANY of the 4
//     window dates (honors startsOn/endsOn/skippedDates/cadence).
// The whole thing is defensive: a single failing query degrades to partial /
// empty coverage and never throws to the page (the dashboard loads it behind
// safe(), but we also catch here so a habit-read failure can't zero the card).

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { listClients } from "./client-roster";
import { isHabitScheduledOn } from "./habit-schedule";
import { getTrainerTimezone } from "./trainer-timezone";

/** Number of days ahead (today inclusive) the urgency window spans. */
const WINDOW_DAYS = 4;
/** Cap on clients scanned + returned (mirrors getCoachPulse's 50). */
const MAX_CLIENTS = 50;

export interface UnassignedClientRow {
  uid: string;
  displayName: string;
  photoURL: string | null;
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

export async function listClientsWithNothingAssignedSoon(): Promise<
  UnassignedClientRow[]
> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clients = await listClients();
  const activeClients = clients
    .filter((c) => !c.pendingProvisioning)
    .slice(0, MAX_CLIENTS);
  if (activeClients.length === 0) return [];

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

  // ── HABITS: per-client capped reads. ─────────────────────────────────────
  const habitsPromises = activeClients.map((client) =>
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", client.uid)
      .limit(50)
      .get()
      .catch(logError(`habits clientId=${client.uid}`)),
  );

  const [assignmentsSnap, habitsSnaps] = await Promise.all([
    assignmentsPromise,
    Promise.all(habitsPromises),
  ]);

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

  // Clients with ≥1 habit active on ANY of the window dates. Soft-deleted
  // habits never count (the predicate ignores `deleted`, so guard here —
  // mirrors coach-pulse's habitScheduledOn wrapper).
  const coveredByHabit = new Set<string>();
  habitsSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = activeClients[idx]!;
    for (const doc of snap.docs) {
      const habit = doc.data() as Record<string, unknown>;
      if (habit.deleted === true) continue;
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

  return rows.slice(0, MAX_CLIENTS);
}
