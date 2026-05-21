import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import type { LoggedExercise, WorkoutSessionRecord } from "../types/gym.types.js";

const GYM_WORKOUT_SESSIONS_COLLECTION = "gym_workout_sessions";

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimestampToIso(value: unknown): string {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return new Date().toISOString();
}

function sessionsRef(uid: string) {
  return adminDb
    .collection(GYM_WORKOUT_SESSIONS_COLLECTION)
    .doc(uid)
    .collection("sessions");
}

function toWorkoutSessionRecord(
  id: string,
  data: Record<string, unknown>
): WorkoutSessionRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    planId: normalizeOptionalString(data.planId) ?? "",
    dayId: normalizeOptionalString(data.dayId) ?? "",
    dayLabel: normalizeOptionalString(data.dayLabel) ?? "",
    date: normalizeTimestampToIso(data.date),
    durationSeconds:
      typeof data.durationSeconds === "number" ? data.durationSeconds : undefined,
    exercises: Array.isArray(data.exercises)
      ? (data.exercises as LoggedExercise[])
      : [],
    notes: normalizeOptionalString(data.notes),
  };
}

export async function listWorkoutSessions(
  uid: string
): Promise<WorkoutSessionRecord[]> {
  const snapshot = await sessionsRef(uid).orderBy("date", "desc").get();
  return snapshot.docs.map(doc =>
    toWorkoutSessionRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

