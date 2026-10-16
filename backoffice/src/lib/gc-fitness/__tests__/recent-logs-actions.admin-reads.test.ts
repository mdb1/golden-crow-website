// __tests__/recent-logs-actions.admin-reads.test.ts
//
// The two admin god-mode reads in recent-logs-actions.ts —
// listRecentLogsForClientAsAdmin and getWorkoutLogDetailAsAdmin — executed
// against the in-memory Firestore from fake-firestore-c with the REAL
// auth-helpers over a mocked getTokens, so the test proves the ADMIN gate is
// the one being called (a trainer-only token must be refused before any read)
// and that the path's coachId really scopes what an admin can open.

import {
  FakeFirestore,
  FakeTimestamp,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
// fake-c has no FieldPath; the roster signup read filters by documentId(),
// which the fake treats as a plain (absent) field — it simply matches nothing.
jest.mock("firebase-admin/firestore", () => ({
  ...jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
  FieldPath: { documentId: () => "__name__" },
}));

import { getTokens } from "next-firebase-auth-edge";

import {
  getWorkoutLogDetailAsAdmin,
  listRecentLogsForClientAsAdmin,
} from "../recent-logs-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

const ts = (iso: string) => new FakeTimestamp(Date.parse(iso));

function seedLog(id: string, data: Record<string, unknown>) {
  db.seed(`workout_logs/${id}`, {
    status: "completed",
    startedAt: ts("2026-06-14T10:00:00Z"),
    completedAt: ts("2026-06-14T11:00:00Z"),
    sets: [],
    templateSnapshot: { name: { en: "Legs", es: "Piernas" }, exercises: [] },
    ...data,
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("admin-1", ["admin"]);

  db.seed("users/coach-a", { role: "trainer", displayName: "Coach A" });
  db.seed("users/client-a1", { role: "client", coachId: "coach-a", displayName: "Ana", email: "ana@example.com" });
  db.seed("users/solo", { role: "client", displayName: "Solo" }); // coach-less
  db.seed("users/solo-del", { role: "client", displayName: "Gone", deleted: true });

  db.seed("workout_assignments/asg-1", { trainerId: "coach-a", clientId: "client-a1", scheduledFor: "2026-06-14", status: "completed" });
  seedLog("log-a1", { trainerId: "coach-a", clientId: "client-a1", assignment_id: "asg-1" });
  seedLog("log-b", { trainerId: "coach-b", clientId: "client-b1" });
  seedLog("log-solo-old", { trainerId: "old-coach", clientId: "solo" }); // written while solo still had a coach
});

afterEach(() => jest.useRealTimers());

describe("admin gate", () => {
  it.each([
    ["signed out", null],
    ["trainer-only token", ["trainer"]],
    ["client token", ["client"]],
  ])("%s → Forbidden before any Firestore read", async (_label, roles) => {
    if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
    else signInAs("coach-a", roles);
    await expect(listRecentLogsForClientAsAdmin("coach-a", "client-a1")).rejects.toThrow("Forbidden");
    await expect(getWorkoutLogDetailAsAdmin("coach-a", "log-a1")).rejects.toThrow("Forbidden");
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe("listRecentLogsForClientAsAdmin", () => {
  it("an admin reads a client under its real coach (read-only, scanned by that coach's trainerId)", async () => {
    const out = await listRecentLogsForClientAsAdmin("coach-a", "client-a1");
    expect(out.clients).toEqual([{ id: "client-a1", name: "Ana", photoURL: null }]);
    expect(JSON.stringify(out.logs)).toContain("log-a1");
    expect(JSON.stringify(out)).not.toContain("log-b");
    expect(db.writes).toEqual([]);
    expect(db.reads).toContain("users/client-a1");
  });

  it("a coach-less user is admitted as their own trainer-of-record", async () => {
    await expect(listRecentLogsForClientAsAdmin("solo", "solo")).resolves.toBeDefined();
    expect(db.writes).toEqual([]);
  });

  it.each([
    ["a coach the client does not belong to", "coach-b", "client-a1"],
    ["a coached client addressed as coach-less", "client-a1", "client-a1"],
    ["a deleted coach-less user", "solo-del", "solo-del"],
    ["a missing client", "coach-a", "ghost"],
  ])("refuses %s with Not found and no log query", async (_label, coachId, clientId) => {
    await expect(listRecentLogsForClientAsAdmin(coachId, clientId)).rejects.toThrow("Not found");
    expect(db.queries).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe("getWorkoutLogDetailAsAdmin", () => {
  it("returns the detail of a log owned by the coach in the path", async () => {
    const detail = await getWorkoutLogDetailAsAdmin("coach-a", "log-a1");
    expect(detail).toMatchObject({ id: "log-a1" });
    expect(db.writes).toEqual([]);
  });

  it("a coach-less user's historical log (written under a previous coach) opens from their own profile", async () => {
    await expect(getWorkoutLogDetailAsAdmin("solo", "log-solo-old")).resolves.toMatchObject({ id: "log-solo-old" });
  });

  it.each([
    ["another coach's log under coach-a's path", "coach-a", "log-b"],
    ["a coached client's log addressed through a foreign path", "coach-b", "log-a1"],
    ["a missing log", "coach-a", "ghost"],
  ])("refuses %s with 'Workout log not found.'", async (_label, coachId, logId) => {
    await expect(getWorkoutLogDetailAsAdmin(coachId, logId)).rejects.toThrow("Workout log not found.");
    expect(db.writes).toEqual([]);
  });
});
