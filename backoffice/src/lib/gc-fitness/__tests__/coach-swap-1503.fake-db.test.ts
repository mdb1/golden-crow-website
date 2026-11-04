// __tests__/coach-swap-1503.fake-db.test.ts
//
// #1503 (P0 privacy) — after a coach swap (users/C.coachId OLD → NEW) every doc
// OLD authored for C keeps `trainerId == OLD`. The backoffice authorised by that
// frozen field, so OLD kept moving, deleting, editing and propagating onto C's
// plan, saw C in the template pills / assignment lists / countdown alerts, and
// could open the logs C wrote AFTER the swap. Every case below runs as OLD
// against the in-memory Firestore and asserts the refusal — and that NOTHING
// was written — plus that OLD's current client (C2) still works unchanged.

import { FakeFirestore, setGcFitnessAuthEnv, tokensFor } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import {
  countTemplateAssignments,
  deleteAssignment,
  editAssignmentExercises,
  editAssignmentScheduledFor,
  listAssignmentsForTrainerDay,
  listFutureAssignmentsForTemplate,
  listWorkoutAssignmentGroups,
  propagateTemplateToFutureAssignments,
} from "../workout-assignment-actions";
import { getAssignmentDetail, moveAssignment } from "../schedule-month-actions";
import {
  getFutureRecurrenceInfo,
  getPreviousSessionForClient,
  startWorkoutSession,
} from "../live-workout-actions";
import { listHabitsForClient, listHabitsForTrainer } from "../habit-actions";
import { getWorkoutLogDetail } from "../recent-logs-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

const OLD = "coach-old";
const NEW = "coach-new";
const C = "client-left"; // was OLD's, now NEW's
const C2 = "client-stays"; // still OLD's
const DAY = "2026-06-20";

const snapshot = {
  name: { en: "Legs", es: "Piernas" },
  exercises: [{ exerciseId: "ex-squat", sets: 3, reps: 5, weightBySetKg: [60, 60, 60] }],
};

function assignment(clientId: string, extra: Record<string, unknown> = {}) {
  return {
    trainerId: OLD,
    clientId,
    templateId: "t-old",
    templateSnapshot: snapshot,
    scheduledFor: DAY,
    scheduledTime: "09:00",
    timezone: "UTC",
    status: "scheduled",
    seriesId: null,
    ...extra,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  mockedGetTokens.mockResolvedValue(tokensFor(OLD, ["trainer"]) as never);

  db.seed(`users/${OLD}`, { role: "trainer", timezone: "UTC" });
  db.seed(`users/${NEW}`, { role: "trainer" });
  db.seed(`users/${C}`, { role: "client", coachId: NEW, displayName: "Left" });
  db.seed(`users/${C2}`, { role: "client", coachId: OLD, displayName: "Stays" });
  db.seed("exercises/ex-squat", { name: { en: "Squat", es: "Sentadilla" } });
  db.seed("workout_templates/t-old", { trainerId: OLD, name: { en: "Legs", es: "Piernas" }, exercises: snapshot.exercises });

  db.seed("workout_assignments/a-left", assignment(C));
  db.seed("workout_assignments/a-stays", assignment(C2));
  db.seed("workout_logs/log-after-swap", {
    trainerId: OLD,
    clientId: C,
    assignment_id: "a-left",
    status: "completed",
    sets: [],
    startedAt: new Date("2026-06-14T10:00:00Z"),
    completedAt: new Date("2026-06-14T11:00:00Z"),
  });
  db.seed("habits/h-left", { trainerId: OLD, clientId: C, type: "binary", name: { en: "W", es: "A" }, deleted: false, updatedAt: new Date() });
  db.seed("habits/h-stays", { trainerId: OLD, clientId: C2, type: "binary", name: { en: "W", es: "A" }, deleted: false, updatedAt: new Date() });
});

afterEach(() => {
  jest.useRealTimers();
});

const writesTo = (id: string) => db.writes.filter((w) => JSON.stringify(w).includes(id));

describe("#1503 — OLD on a client who moved to NEW: refused, nothing written", () => {
  it("editAssignmentScheduledFor", async () => {
    await expect(editAssignmentScheduledFor("a-left", { scheduledFor: "2026-06-21" })).rejects.toThrow("Not your client.");
    expect(writesTo("a-left")).toEqual([]);
  });

  it("deleteAssignment", async () => {
    await expect(deleteAssignment("a-left")).rejects.toThrow("Not your client.");
    expect(db.doc("workout_assignments/a-left")).toBeDefined();
  });

  it("editAssignmentExercises", async () => {
    await expect(editAssignmentExercises("a-left", { scope: "one", exercises: [] })).rejects.toThrow("Not your client.");
    expect(writesTo("a-left")).toEqual([]);
  });

  it("moveAssignment (month calendar)", async () => {
    await expect(moveAssignment({ id: "a-left", newScheduledFor: "2026-06-22", scope: "one" })).rejects.toThrow("Not your client.");
    expect(writesTo("a-left")).toEqual([]);
  });

  it("getAssignmentDetail", async () => {
    await expect(getAssignmentDetail("a-left")).rejects.toThrow("Not your client.");
  });

  it("startWorkoutSession (live workout) — no log, no status flip", async () => {
    await expect(startWorkoutSession({ assignmentId: "a-left" } as never)).rejects.toThrow("Not your client.");
    expect(db.doc("workout_assignments/a-left")?.status).toBe("scheduled");
  });

  it("getFutureRecurrenceInfo + getPreviousSessionForClient return nothing", async () => {
    await expect(getFutureRecurrenceInfo("a-left")).resolves.toEqual({ count: 0, nextDates: [] });
    await expect(getPreviousSessionForClient(C)).resolves.toEqual({});
  });

  it("getWorkoutLogDetail — not even the log written AFTER the swap (it carries OLD's trainerId)", async () => {
    await expect(getWorkoutLogDetail("log-after-swap")).rejects.toThrow();
  });

  it("propagateTemplateToFutureAssignments rewrites only the current client's future workout", async () => {
    const out = await propagateTemplateToFutureAssignments("t-old");
    expect(out.updatedCount).toBe(1);
    expect(writesTo("a-left")).toEqual([]);
    expect(writesTo("a-stays").length).toBeGreaterThan(0);
  });
});

describe("#1503 — OLD's listings, pills and alerts no longer show the client who left", () => {
  it("template propagation preview", async () => {
    const preview = await listFutureAssignmentsForTemplate("t-old");
    expect(preview.clients.map((c) => c.uid)).toEqual([C2]);
    expect(preview.assignmentCount).toBe(1);
  });

  it("«N asignaciones» pill + Asignaciones view + trainer day", async () => {
    await expect(countTemplateAssignments()).resolves.toEqual({ "t-old": 1 });
    const groups = await listWorkoutAssignmentGroups();
    expect(groups.flatMap((g) => g.clients.map((c) => c.uid))).toEqual([C2]);
    const day = await listAssignmentsForTrainerDay(DAY);
    expect(day.map((r) => r.id)).toEqual(["a-stays"]);
  });

  it("habits: trainer list and the ex-client's list", async () => {
    const mine = await listHabitsForTrainer();
    expect(mine.map((h) => h.id)).toEqual(["h-stays"]);
    await expect(listHabitsForClient(C)).resolves.toEqual([]);
  });
});

describe("#1503 — the current client is unaffected", () => {
  it("moves, opens and previews C2's workout as before", async () => {
    await expect(editAssignmentScheduledFor("a-stays", { scheduledFor: "2026-06-21" })).resolves.toEqual({ ok: true });
    expect(db.doc("workout_assignments/a-stays")?.scheduledFor).toBe("2026-06-21");
    await expect(getAssignmentDetail("a-stays")).resolves.toMatchObject({ clientId: C2 });
  });
});
