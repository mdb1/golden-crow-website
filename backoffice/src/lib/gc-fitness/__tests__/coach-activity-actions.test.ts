// __tests__/coach-activity-actions.test.ts
//
// "Mi Actividad" feed (coach-activity-actions.ts). Read-only, but it is the
// only thing between a coach and other coaches' activity/chat: every query is
// scoped to the SESSION uid (coach_activity.trainerId, messages.senderId,
// users.coachId), and a caller-supplied `clientId` filter can only NARROW that
// scope, never widen it. Client names come exclusively from the caller's own
// roster.

import {
  FakeFirestore,
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

import { getTokens } from "next-firebase-auth-edge";

import {
  listMyActivityClients,
  listMyCoachActivityPage,
} from "../coach-activity-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

let db: FakeFirestore;
let warnSpy: jest.SpyInstance;

function at(minute: number): Date {
  return new Date(Date.UTC(2026, 5, 15, 12, minute));
}

function seedWorld() {
  // roster
  db.seed("users/c1", { coachId: "coach-a", displayName: "Ana", coachNickname: "Anita" });
  db.seed("users/c2", { coachId: "coach-a", email: "bob@example.com" });
  db.seed("users/x1", { coachId: "coach-b", displayName: "Xenia (B's client)" });
  // coach_activity
  db.seed("coach_activity/e1", {
    trainerId: "coach-a", clientId: "c1", kind: "habit_assignment",
    title: "Hábito asignado: Agua", occurredAt: at(10),
  });
  db.seed("coach_activity/e2", {
    trainerId: "coach-a", clientId: "c2", kind: "workout_assignment",
    title: "Workout asignado: Piernas", deleted: true, occurredAt: at(20),
  });
  db.seed("coach_activity/e3", {
    trainerId: "coach-a", clientId: "c1", kind: "workout_rest_edited",
    title: "rest edited by client", occurredAt: at(30),
  });
  db.seed("coach_activity/e4", {
    trainerId: "coach-b", clientId: "x1", kind: "note",
    title: "B's private note", occurredAt: at(40),
  });
  db.seed("coach_activity/e5", {
    trainerId: "coach-a", pendingEmail: "new@example.com", kind: "client_added",
    title: "Cliente agregado", occurredAt: at(5),
  });
  // chat — sent by coach-a to c1, by coach-b to x1, and by c1 to coach-a
  db.seed("chats/c1/messages/m1", { senderId: "coach-a", text: "hola Ana", createdAt: at(15) });
  db.seed("chats/c1/messages/m2", { senderId: "c1", text: "client message", createdAt: at(16) });
  db.seed("chats/x1/messages/m3", { senderId: "coach-b", text: "B to Xenia", createdAt: at(17) });
  db.seed("chats/c2/messages/m4", { senderId: "coach-a", kind: "voice", createdAt: at(18) });
}

beforeEach(() => {
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  mockedGetTokens.mockResolvedValue(tokensFor("coach-a", ["trainer"]) as never);
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  seedWorld();
});

afterEach(() => warnSpy.mockRestore());

describe("auth gate", () => {
  it("rejects signed-out and non-trainer callers before any query", async () => {
    mockedGetTokens.mockResolvedValue(null as never);
    await expect(listMyCoachActivityPage()).rejects.toThrow("Forbidden");
    await expect(listMyActivityClients()).rejects.toThrow("Forbidden");
    mockedGetTokens.mockResolvedValue(tokensFor("admin-1", ["admin"]) as never);
    await expect(listMyCoachActivityPage()).rejects.toThrow("Forbidden");
    expect(db.queries).toEqual([]);
  });
});

describe("listMyCoachActivityPage", () => {
  it("returns only the caller's events and SENT messages, newest first, never another coach's", async () => {
    const page = await listMyCoachActivityPage();
    expect(page.rows.map((r) => r.id)).toEqual([
      "coachevt:e2",
      "chat:c2:m4",
      "chat:c1:m1",
      "coachevt:e1",
      "coachevt:e5",
    ]);
    const blob = JSON.stringify(page);
    expect(blob).not.toContain("coach-b");
    expect(blob).not.toContain("Xenia");
    expect(blob).not.toContain("client message");
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("scopes every query to the session uid", async () => {
    await listMyCoachActivityPage();
    const byColl = Object.fromEntries(db.queries.map((q) => [q.collection, q.filters]));
    expect(byColl["users"]).toEqual([{ field: "coachId", op: "==", value: "coach-a" }]);
    expect(byColl["coach_activity"]).toEqual([{ field: "trainerId", op: "==", value: "coach-a" }]);
    expect(byColl["group:messages"]).toEqual([{ field: "senderId", op: "==", value: "coach-a" }]);
  });

  it("projects rows: nickname-first names, deleted relabel, chat labels, pending email", async () => {
    const { rows } = await listMyCoachActivityPage();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["coachevt:e1"]).toMatchObject({
      kind: "habit_assignment",
      clientId: "c1",
      clientName: "Anita",
      title: "Hábito asignado: Agua",
      occurredAt: at(10).toISOString(),
      groupCount: 1,
    });
    expect(byId["coachevt:e2"]).toMatchObject({
      deleted: true,
      title: "Workout eliminado: Piernas",
      clientName: "bob@example.com",
    });
    expect(byId["chat:c1:m1"]).toMatchObject({ kind: "chat", title: "Mensaje enviado", detail: "hola Ana" });
    expect(byId["chat:c2:m4"]).toMatchObject({ title: "Audio enviado", detail: null });
    expect(byId["coachevt:e5"]).toMatchObject({ clientId: null, clientName: "new@example.com" });
  });

  it("drops the client's own workout_rest_edited events", async () => {
    const { rows } = await listMyCoachActivityPage();
    expect(rows.find((r) => r.id === "coachevt:e3")).toBeUndefined();
  });

  it("a clientId filter for ANOTHER coach's client returns nothing of theirs", async () => {
    const page = await listMyCoachActivityPage(null, 20, "x1");
    expect(page.rows).toEqual([]);
    const activityQuery = db.queries.find((q) => q.collection === "coach_activity");
    expect(activityQuery?.filters).toEqual([
      { field: "trainerId", op: "==", value: "coach-a" },
      { field: "clientId", op: "==", value: "x1" },
    ]);
  });

  it("a clientId filter narrows both events and chat to that client", async () => {
    const page = await listMyCoachActivityPage(null, 20, "c1");
    expect(page.rows.map((r) => r.id)).toEqual(["chat:c1:m1", "coachevt:e1"]);
  });

  it("a kind filter is applied in-query and excludes chat", async () => {
    const page = await listMyCoachActivityPage(null, 20, null, "workout_assignment");
    expect(page.rows.map((r) => r.id)).toEqual(["coachevt:e2"]);
    expect(db.queries.some((q) => q.collection === "group:messages")).toBe(false);
  });

  it("kind=chat reads only messages; clientId+kind filters kind in memory", async () => {
    const chatOnly = await listMyCoachActivityPage(null, 20, null, "chat");
    expect(chatOnly.rows.every((r) => r.kind === "chat")).toBe(true);
    expect(db.queries.some((q) => q.collection === "coach_activity")).toBe(false);

    const both = await listMyCoachActivityPage(null, 20, "c1", "workout_assignment");
    expect(both.rows).toEqual([]);
  });

  it("pages with a cursor and clamps the page size", async () => {
    const first = await listMyCoachActivityPage(null, 2);
    expect(first.rows).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe(at(18).toISOString());

    const second = await listMyCoachActivityPage(first.nextCursor, 2);
    expect(second.rows.map((r) => r.id)).toEqual(["chat:c1:m1", "coachevt:e1"]);
    const q = db.queries.filter((x) => x.collection === "coach_activity").pop();
    expect(q?.filters).toContainEqual({ field: "occurredAt", op: "<", value: at(18) });

    const tiny = await listMyCoachActivityPage(null, 0);
    expect(tiny.rows).toHaveLength(1);
    // an unparseable cursor is ignored, not trusted
    const bad = await listMyCoachActivityPage("not-a-date", 100);
    expect(bad.rows).toHaveLength(5);
  });

  it("degrades (no throw) when a source query fails", async () => {
    db.failQueryWhen((q) => q.collection === "coach_activity");
    db.failQueryWhen((q) => q.collection === "group:messages");
    const page = await listMyCoachActivityPage();
    expect(page.rows).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("folds a grouped bulk action into one row with groupCount", async () => {
    db.seed("coach_activity/g1", {
      trainerId: "coach-a", clientId: "c1", kind: "nutrition_plan", title: "Plan", groupId: "G", occurredAt: at(50),
    });
    db.seed("coach_activity/g2", {
      trainerId: "coach-a", clientId: "c2", kind: "nutrition_plan", title: "Plan", groupId: "G", occurredAt: at(50),
    });
    const { rows } = await listMyCoachActivityPage();
    const grouped = rows.filter((r) => r.groupId === "G");
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupCount).toBe(2);
  });
});

describe("listMyActivityClients", () => {
  it("lists only the caller's roster, sorted by visible name", async () => {
    await expect(listMyActivityClients()).resolves.toEqual([
      { id: "c1", name: "Anita" },
      { id: "c2", name: "bob@example.com" },
    ]);
    expect(db.queries).toEqual([
      expect.objectContaining({
        collection: "users",
        filters: [{ field: "coachId", op: "==", value: "coach-a" }],
      }),
    ]);
  });
});
