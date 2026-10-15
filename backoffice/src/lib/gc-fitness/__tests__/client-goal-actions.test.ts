// client-goal-actions.test.ts — coach-authored client goals. Admin SDK
// bypasses rules, so ownership lives in the actions: create/list check
// users/{clientId}.coachId; update checks client_goals/{id}.coachId.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

import { SERVER_TIMESTAMP, fake, ts } from "@/lib/test-utils/fake-firestore-cov-a";

import {
  createClientGoal,
  listClientGoals,
  updateClientGoal,
} from "../client-goal-actions";

const COACH = "coach-A";
const OTHER = "coach-B";

beforeEach(() => {
  fake.reset();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH },
    "users/client-2": { role: "client", coachId: OTHER },
    "client_goals/g-mine": {
      clientId: "client-1",
      coachId: COACH,
      horizon: "long",
      title: "Run 10k",
      status: "active",
      createdAt: ts("2026-09-01T00:00:00Z"),
      updatedAt: ts("2026-10-01T00:00:00Z"),
    },
    "client_goals/g-theirs": {
      clientId: "client-2",
      coachId: OTHER,
      horizon: "short",
      title: "Theirs",
      status: "active",
      updatedAt: ts("2026-10-02T00:00:00Z"),
    },
  });
});

describe("auth gate", () => {
  it.each([
    ["listClientGoals", () => listClientGoals("client-1")],
    ["createClientGoal", () => createClientGoal({ clientId: "client-1", horizon: "short", title: "x" })],
    ["updateClientGoal", () => updateClientGoal({ goalId: "g-mine", title: "x" })],
  ])("%s rejects a non-trainer before any read", async (_n, call) => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(call()).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.writes).toEqual([]);
  });
});

describe("listClientGoals", () => {
  it("rejects another coach's / a missing client without querying goals", async () => {
    await expect(listClientGoals("client-2")).rejects.toThrow("Forbidden");
    await expect(listClientGoals("ghost")).rejects.toThrow("Forbidden");
    expect(fake.db.queries).toEqual([]);
  });

  it("queries scoped to coachId AND clientId, and projects rows with defaults", async () => {
    fake.seed({
      // Same client, different coach (pre-transfer leftovers) — excluded.
      "client_goals/g-old-coach": { clientId: "client-1", coachId: OTHER, updatedAt: ts("2026-10-09T00:00:00Z") },
      "client_goals/g-weird": {
        clientId: "client-1",
        coachId: COACH,
        horizon: "bogus",
        status: "bogus",
        description: 3,
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
    });
    const rows = await listClientGoals("client-1");
    expect(fake.db.queries[0]).toMatchObject({
      path: "client_goals",
      filters: [
        ["coachId", "==", COACH],
        ["clientId", "==", "client-1"],
      ],
      orders: [["updatedAt", "desc"]],
      limit: 50,
    });
    expect(rows).toEqual([
      {
        id: "g-mine",
        clientId: "client-1",
        coachId: COACH,
        horizon: "long",
        title: "Run 10k",
        description: null,
        targetDate: null,
        status: "active",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "g-weird",
        clientId: "client-1",
        coachId: COACH,
        horizon: "short",
        title: "",
        description: null,
        targetDate: null,
        status: "active",
        createdAt: null,
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
    ]);
  });
});

describe("createClientGoal", () => {
  it("rejects another coach's client and writes nothing", async () => {
    await expect(
      createClientGoal({ clientId: "client-2", horizon: "short", title: "x" }),
    ).rejects.toThrow("Forbidden");
    expect(fake.db.writes).toEqual([]);
  });

  it.each([
    ["bad horizon", { clientId: "client-1", horizon: "forever", title: "x" }],
    ["empty title", { clientId: "client-1", horizon: "short", title: "  " }],
    ["title too long", { clientId: "client-1", horizon: "short", title: "x".repeat(121) }],
    ["bad targetDate", { clientId: "client-1", horizon: "short", title: "x", targetDate: "15/10/2026" }],
    ["missing clientId", { horizon: "short", title: "x" }],
  ])("rejects invalid input (%s) before any read", async (_n, input) => {
    await expect(createClientGoal(input)).rejects.toThrow();
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.writes).toEqual([]);
  });

  it("writes the goal with coachId from the session (caller coachId/status ignored)", async () => {
    const { id } = await createClientGoal({
      clientId: "client-1",
      horizon: "medium",
      title: "  Squat 100  ",
      description: "by spring",
      targetDate: "2027-03-01",
      coachId: OTHER,
      status: "completed",
    });
    expect(id).toMatch(new RegExp(`^goal-${COACH}-[0-9a-f-]{36}$`));
    expect(fake.db.writes).toEqual([
      {
        op: "set",
        path: `client_goals/${id}`,
        options: undefined,
        data: {
          id,
          clientId: "client-1",
          coachId: COACH,
          horizon: "medium",
          title: "Squat 100",
          description: "by spring",
          targetDate: "2027-03-01",
          status: "active",
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        },
      },
    ]);
  });

  it("omits empty optional fields", async () => {
    await createClientGoal({ clientId: "client-1", horizon: "short", title: "x", description: "" });
    expect(fake.db.writes[0].data).not.toHaveProperty("description");
    expect(fake.db.writes[0].data).not.toHaveProperty("targetDate");
  });
});

describe("updateClientGoal", () => {
  it("rejects another coach's goal and a missing goal; nothing written", async () => {
    await expect(updateClientGoal({ goalId: "g-theirs", title: "pwned" })).rejects.toThrow(
      "Forbidden",
    );
    await expect(updateClientGoal({ goalId: "nope", title: "x" })).rejects.toThrow("Forbidden");
    expect(fake.db.writes).toEqual([]);
    expect(fake.doc("client_goals/g-theirs")?.title).toBe("Theirs");
  });

  it.each([
    ["bad status", { goalId: "g-mine", status: "deleted" }],
    ["empty goalId", { goalId: " " }],
    ["bad horizon", { goalId: "g-mine", horizon: "x" }],
  ])("rejects invalid input (%s) before any read", async (_n, input) => {
    await expect(updateClientGoal(input)).rejects.toThrow();
    expect(fake.db.reads).toEqual([]);
  });

  it("patches only provided fields; clientId/coachId cannot be re-pointed", async () => {
    await updateClientGoal({
      goalId: "g-mine",
      status: "completed",
      title: "Run 21k",
      clientId: "client-2",
      coachId: OTHER,
    });
    expect(fake.db.writes).toEqual([
      {
        op: "update",
        path: "client_goals/g-mine",
        data: { updatedAt: SERVER_TIMESTAMP, title: "Run 21k", status: "completed" },
      },
    ]);
  });

  it("writes every editable field when all are provided", async () => {
    await updateClientGoal({
      goalId: "g-mine",
      horizon: "short",
      title: "t",
      description: "d",
      targetDate: "2027-01-01",
      status: "archived",
    });
    expect(fake.db.writes[0].data).toEqual({
      updatedAt: SERVER_TIMESTAMP,
      horizon: "short",
      title: "t",
      description: "d",
      targetDate: "2027-01-01",
      status: "archived",
    });
  });

  // SECURITY GAP: createClientGoal and listClientGoals both re-check
  // users/{clientId}.coachId === session.uid, but updateClientGoal only checks
  // the GOAL doc's coachId. After a client is transferred from coach A to
  // coach B, coach A (who can no longer list the client's goals) can still
  // edit/complete/archive goals about that client by goal id.
  it.failing("rejects editing a goal about a client that is no longer the caller's", async () => {
    fake.seed({ "users/client-1": { role: "client", coachId: OTHER } });
    await expect(updateClientGoal({ goalId: "g-mine", status: "archived" })).rejects.toThrow(
      "Forbidden",
    );
    expect(fake.db.writes).toEqual([]);
  });
});
