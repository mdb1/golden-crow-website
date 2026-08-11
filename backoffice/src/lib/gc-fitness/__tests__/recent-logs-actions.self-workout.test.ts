// __tests__/recent-logs-actions.self-workout.test.ts
//
// Issue #434: a coach opening a CLIENT-CREATED ("self") workout log 404'd.
// Self-assigned workouts (issue #392) carry trainerId === clientId === the
// client's own uid, so the old `data.trainerId !== trainer.uid` gate in
// getWorkoutLogDetail always threw "Forbidden" → notFound(). The fix resolves
// the client's coachId (like habits' currentTrainerCanManageHabit).
//
// These tests lock: (1) a self-log whose client belongs to the coach is
// accessible, (2) a plain trainer-owned log stays accessible, (3) a log whose
// client is NOT the coach's is still rejected (no cross-coach leak).

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "coach1", email: "coach@x.com" })),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { getWorkoutLogDetail } from "../recent-logs-actions";
import { FirestoreCollections } from "../collections";

function docSnap(exists: boolean, data: Record<string, unknown>, id = "") {
  return {
    exists,
    id: (data.__id as string) ?? id,
    data: () => data,
    get: (field: string) => data[field],
  };
}

/**
 * Minimal Firestore mock: resolves `collection(name).doc(id).get()` from a
 * fixture map keyed by `${name}/${id}`.
 */
function makeDb(fixtures: Record<string, Record<string, unknown> | null>) {
  // Subcollection support exists for `workout_logs/{id}/metrics/heartRate`: the
  // detail builder reads the workout's heart-rate series. A fixture key of
  // "workout_logs/{id}/metrics/heartRate" seeds one; absent, the read resolves
  // to a missing doc, which is the common case (no watch → no chart).
  const docRef = (path: string) => ({
    get: async () => {
      const data = fixtures[path];
      const id = path.split("/").pop() ?? "";
      return data ? docSnap(true, data, id) : docSnap(false, {}, id);
    },
    collection: (sub: string) => ({
      doc: (subId: string) => docRef(`${path}/${sub}/${subId}`),
    }),
  });
  return {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
  };
}

const WL = FirestoreCollections.workoutLogs;
const USERS = FirestoreCollections.users;
const EXERCISES = FirestoreCollections.exercises;

const SELF_LOG_ID = "log-asg-client1-20260710-self-abc-123";
const selfLog = {
  __id: SELF_LOG_ID,
  clientId: "client1",
  trainerId: "client1", // self-assigned: trainerId === clientId
  status: "completed",
  sets: [],
  templateSnapshot: { name: "Resistiré", exercises: [] },
  startedAt: null,
  completedAt: null,
};

describe("getWorkoutLogDetail — client-created (self) workouts (#434)", () => {
  it("lets the coach open a self-log for their own client", async () => {
    mockState.db = makeDb({
      [`${WL}/${SELF_LOG_ID}`]: selfLog,
      [`${USERS}/client1`]: {
        displayName: "Client One",
        email: "client1@x.com",
        coachId: "coach1",
        timezone: "UTC",
      },
      [`${USERS}/coach1`]: { displayName: "Coach One" },
    });

    const detail = await getWorkoutLogDetail(SELF_LOG_ID);
    expect(detail.workoutName).toBe("Resistiré");
    expect(detail.clientName).toBeTruthy();
  });

  it("still lets the coach open a normal trainer-owned log", async () => {
    const id = "log-normal-1";
    mockState.db = makeDb({
      [`${WL}/${id}`]: {
        __id: id,
        clientId: "client1",
        trainerId: "coach1", // trainer-owned
        status: "completed",
        sets: [],
        templateSnapshot: { name: "Pecho", exercises: [] },
      },
      [`${USERS}/client1`]: { displayName: "Client One", coachId: "coach1" },
      [`${USERS}/coach1`]: { displayName: "Coach One" },
    });

    const detail = await getWorkoutLogDetail(id);
    expect(detail.workoutName).toBe("Pecho");
  });

  it("marks legacy time-exercise set logs as time and falls back to prescribed duration", async () => {
    const id = "log-time-legacy-1";
    mockState.db = makeDb({
      [`${WL}/${id}`]: {
        __id: id,
        clientId: "client1",
        trainerId: "coach1",
        status: "completed",
        sets: [
          {
            id: "set-plank-1",
            exerciseId: "plank",
            set_index: 0,
            reps: 10,
            weight_kg: 20,
            completed_at: "2026-07-14T15:00:00.000Z",
          },
        ],
        templateSnapshot: {
          name: "Core",
          exercises: [
            {
              exerciseId: "plank",
              sets: 1,
              reps: 0,
              durationSeconds: 45,
            },
          ],
        },
      },
      [`${USERS}/client1`]: { displayName: "Client One", coachId: "coach1" },
      [`${USERS}/coach1`]: { displayName: "Coach One" },
      [`${EXERCISES}/plank`]: {
        name: { en: "Plank", es: "Plancha" },
        metric: "time",
      },
    });

    const detail = await getWorkoutLogDetail(id);

    expect(detail.sets[0]).toMatchObject({
      exerciseName: "Plank",
      metric: "time",
      reps: 10,
      weight: 20,
      durationSeconds: 45,
    });
  });

  it("rejects a log whose client is not the coach's (no cross-coach leak)", async () => {
    const id = "log-foreign-1";
    mockState.db = makeDb({
      [`${WL}/${id}`]: {
        __id: id,
        clientId: "clientX",
        trainerId: "clientX", // self-log, but of another coach's client
        status: "completed",
        sets: [],
        templateSnapshot: { name: "Ajena", exercises: [] },
      },
      [`${USERS}/clientX`]: { displayName: "Other", coachId: "someoneElse" },
    });

    await expect(getWorkoutLogDetail(id)).rejects.toThrow("Forbidden");
  });
});
