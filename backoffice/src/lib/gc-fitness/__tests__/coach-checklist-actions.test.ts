// __tests__/coach-checklist-actions.test.ts
//
// Authz + write-shape tests for the coach checklist (#1237 / C1). Ownership is
// STRUCTURAL: every read/write goes through `users/{session uid}/coach_checklist`,
// so a coach naming another coach's item id can only ever address a doc under
// their OWN subcollection. These tests pin that path scoping.
//
// clientIds decision: the linked `clientIds` are NOT checked against the
// coach's roster. That is NOT treated as a security gap: the ids are stored
// only on the coach's own private reminder doc (no other user can read it —
// firestore.rules scopes `users/{uid}/coach_checklist` to its owner), nothing
// is written to or read from the linked client, and display names are resolved
// ONLY from the coach's own roster (`listClients`), so a foreign uid renders
// as the raw uid and leaks no name. Pinned below.

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
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "America/Argentina/Buenos_Aires"),
}));
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClients: jest.fn(),
}));

import { revalidatePath } from "next/cache";
import { getTokens } from "next-firebase-auth-edge";

import { listClients } from "@/lib/gc-fitness/client-roster";
import {
  createCoachChecklistItem,
  deleteCoachChecklistItem,
  listCoachChecklistItems,
  listPendingChecklistItems,
  setCoachChecklistItemCompleted,
  updateCoachChecklistItem,
} from "../coach-checklist-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
const mockedRevalidate = revalidatePath as jest.MockedFunction<typeof revalidatePath>;
const mockedListClients = listClients as unknown as jest.Mock;

const OWN = "users/coach-a/coach_checklist";
const OTHER = "users/coach-b/coach_checklist";

let db: FakeFirestore;

beforeEach(() => {
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  mockedGetTokens.mockResolvedValue(tokensFor("coach-a", ["trainer"]) as never);
  mockedRevalidate.mockReset();
  mockedListClients.mockReset();
  mockedListClients.mockResolvedValue([{ uid: "c1", displayName: "Ana" }]);
});

afterEach(() => {
  jest.useRealTimers();
});

function expectRevalidatedBoth() {
  expect(mockedRevalidate.mock.calls).toEqual([
    ["/gc-fitness/checklist"],
    ["/gc-fitness/dashboard"],
  ]);
}

describe("auth gate", () => {
  it.each([
    ["list", () => listCoachChecklistItems()],
    ["listPending", () => listPendingChecklistItems()],
    ["create", () => createCoachChecklistItem({ title: "x" })],
    ["update", () => updateCoachChecklistItem("i1", { title: "x" })],
    ["complete", () => setCoachChecklistItemCompleted("i1", true)],
    ["delete", () => deleteCoachChecklistItem("i1")],
  ])("%s rejects a signed-out caller and writes nothing", async (_n, run) => {
    mockedGetTokens.mockResolvedValue(null as never);
    await expect(run()).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(mockedRevalidate).not.toHaveBeenCalled();
  });

  it("rejects a non-trainer (client) token", async () => {
    mockedGetTokens.mockResolvedValue(tokensFor("client-1", ["client"]) as never);
    await expect(createCoachChecklistItem({ title: "x" })).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });
});

describe("createCoachChecklistItem", () => {
  it.each([
    ["empty title", { title: "   " }],
    ["title too long", { title: "x".repeat(161) }],
    ["unknown recurrence", { title: "x", recurrence: "hourly" }],
    ["weekday out of range", { title: "x", recurrence: "weekly", recurrenceWeekdays: [8] }],
    ["too many clients", { title: "x", clientIds: Array.from({ length: 51 }, (_, i) => `c${i}`) }],
    ["not an object", "title"],
  ])("rejects %s before any write", async (_n, input) => {
    await expect(createCoachChecklistItem(input)).rejects.toThrow();
    expect(db.writes).toEqual([]);
    expect(mockedRevalidate).not.toHaveBeenCalled();
  });

  it("writes under users/{session uid}/coach_checklist with the coach-zone due instant", async () => {
    await expect(
      createCoachChecklistItem({
        title: "  Call Ana  ",
        notes: "about knee",
        dueDate: "2026-06-20",
        dueTime: "18:00",
        clientIds: ["c1"],
      }),
    ).resolves.toEqual({ ok: true });

    expect(db.writes).toHaveLength(1);
    const w = db.writes[0];
    expect(w.op).toBe("set");
    expect(w.path.startsWith(`${OWN}/`)).toBe(true);
    expect(w.data).toEqual({
      title: "Call Ana",
      notes: "about knee",
      clientIds: ["c1"],
      recurrence: "none",
      // 18:00 in Buenos Aires (UTC-3) — #747, never the server's UTC.
      dueAt: new Date("2026-06-20T21:00:00.000Z"),
      completed: false,
      createdAt: { __fv: "serverTimestamp" },
      updatedAt: { __fv: "serverTimestamp" },
    });
    expectRevalidatedBoth();
  });

  it("defaults a missing/garbled time to 09:00 and omits empty optional fields", async () => {
    await createCoachChecklistItem({ title: "x", dueDate: "2026-06-20", dueTime: "9pm" });
    expect(db.writes[0].data).toEqual({
      title: "x",
      recurrence: "none",
      dueAt: new Date("2026-06-20T12:00:00.000Z"),
      completed: false,
      createdAt: { __fv: "serverTimestamp" },
      updatedAt: { __fv: "serverTimestamp" },
    });
  });

  it("keeps only the recurrence fields that apply (weekly keeps weekdays, drops month days)", async () => {
    await createCoachChecklistItem({
      title: "x",
      recurrence: "weekly",
      recurrenceWeekdays: [1, 3],
      recurrenceMonthDays: [5],
      recurrenceEndsOn: "2026-07-01",
    });
    const data = db.writes[0].data ?? {};
    expect(data.recurrence).toBe("weekly");
    expect(data.recurrenceWeekdays).toEqual([1, 3]);
    expect(data).not.toHaveProperty("recurrenceMonthDays");
    // last second of 2026-07-01 in the coach's zone
    expect(data.recurrenceEndsAt).toEqual(new Date("2026-07-02T02:59:59.000Z"));
    expect(data.dueAt).toBeNull();
  });

  it("a non-recurring item never stores an end date", async () => {
    await createCoachChecklistItem({ title: "x", recurrenceEndsOn: "2026-07-01" });
    expect(db.writes[0].data).not.toHaveProperty("recurrenceEndsAt");
  });

  it("stores a clientId that is NOT on the roster, only on the coach's own doc (decision: not a gap)", async () => {
    await createCoachChecklistItem({ title: "x", clientIds: ["someone-elses-client"] });
    expect(db.writes.map((w) => w.path.split("/").slice(0, 3).join("/"))).toEqual([OWN]);
    // nothing is written anywhere near the referenced client
    expect(db.writes.some((w) => w.path.includes("someone-elses-client"))).toBe(false);
  });
});

describe("updateCoachChecklistItem", () => {
  it("rejects an empty item id / invalid body before any write", async () => {
    await expect(updateCoachChecklistItem("", { title: "x" })).rejects.toThrow();
    await expect(updateCoachChecklistItem("i1", { title: "" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("updates ONLY the caller's own doc and clears removed fields with FieldValue.delete", async () => {
    db.seed(`${OWN}/i1`, { title: "old", notes: "n", clientId: "legacy", completed: true });
    await updateCoachChecklistItem("i1", { title: "new", recurrence: "monthly", recurrenceMonthDays: [15] });
    expect(db.writes).toEqual([
      {
        op: "update",
        path: `${OWN}/i1`,
        via: "direct",
        data: {
          title: "new",
          notes: { __fv: "delete" },
          clientIds: { __fv: "delete" },
          clientId: { __fv: "delete" },
          recurrence: "monthly",
          recurrenceEndsAt: { __fv: "delete" },
          recurrenceWeekdays: { __fv: "delete" },
          recurrenceMonthDays: [15],
          dueAt: null,
          updatedAt: { __fv: "serverTimestamp" },
        },
      },
    ]);
    // `completed` untouched
    expect(db.doc(`${OWN}/i1`)?.completed).toBe(true);
    expectRevalidatedBoth();
  });

  it("an item id that only exists under ANOTHER coach is never reached", async () => {
    db.seed(`${OTHER}/i1`, { title: "theirs" });
    await expect(updateCoachChecklistItem("i1", { title: "hijack" })).rejects.toThrow(/NOT_FOUND/);
    expect(db.doc(`${OTHER}/i1`)).toEqual({ title: "theirs" });
    expect(db.writes.every((w) => w.path.startsWith(`${OWN}/`))).toBe(true);
  });
});

describe("setCoachChecklistItemCompleted", () => {
  it("marks a one-off item completed with a server timestamp", async () => {
    db.seed(`${OWN}/i1`, { title: "x", recurrence: "none", completed: false });
    await setCoachChecklistItemCompleted("i1", true);
    expect(db.writes).toEqual([
      {
        op: "update",
        path: `${OWN}/i1`,
        via: "direct",
        data: {
          completed: true,
          completedAt: { __fv: "serverTimestamp" },
          updatedAt: { __fv: "serverTimestamp" },
        },
      },
    ]);
    expectRevalidatedBoth();
  });

  it("un-completing deletes completedAt", async () => {
    db.seed(`${OWN}/i1`, { title: "x", completed: true });
    await setCoachChecklistItemCompleted("i1", false);
    expect(db.writes[0].data).toEqual({
      completed: false,
      completedAt: { __fv: "delete" },
      updatedAt: { __fv: "serverTimestamp" },
    });
  });

  it("a recurring daily item rolls its due date forward instead of completing", async () => {
    db.seed(`${OWN}/i1`, {
      recurrence: "daily",
      dueAt: FakeTimestamp.fromDate(new Date("2026-06-20T21:00:00Z")),
      completed: false,
    });
    await setCoachChecklistItemCompleted("i1", true);
    expect(db.writes[0].data).toEqual({
      dueAt: new Date("2026-06-21T21:00:00.000Z"),
      completed: false,
      completedAt: { __fv: "delete" },
      updatedAt: { __fv: "serverTimestamp" },
    });
  });

  it("a weekly item jumps to the next selected weekday", async () => {
    // 2026-06-15 is a Monday (UTC). Selected: Thursday (4).
    db.seed(`${OWN}/i1`, {
      recurrence: "weekly",
      recurrenceWeekdays: [4],
      dueAt: new Date("2026-06-15T15:00:00Z"),
    });
    await setCoachChecklistItemCompleted("i1", true);
    expect((db.writes[0].data?.dueAt as Date).getDay()).toBe(4);
  });

  it("a monthly item jumps to the next selected day of month", async () => {
    db.seed(`${OWN}/i1`, {
      recurrence: "monthly",
      recurrenceMonthDays: [1],
      dueAt: "2026-06-15T15:00:00.000Z",
    });
    await setCoachChecklistItemCompleted("i1", true);
    expect((db.writes[0].data?.dueAt as Date).getDate()).toBe(1);
  });

  it("a recurring item past its end date completes for good", async () => {
    db.seed(`${OWN}/i1`, {
      recurrence: "daily",
      dueAt: new Date("2026-06-20T21:00:00Z"),
      recurrenceEndsAt: new Date("2026-06-21T02:59:59Z"),
    });
    await setCoachChecklistItemCompleted("i1", true);
    expect(db.writes[0].data).toMatchObject({ completed: true });
  });

  it("only reads/writes under the caller's own subcollection", async () => {
    db.seed(`${OTHER}/i1`, { title: "theirs", recurrence: "daily", dueAt: new Date() });
    await expect(setCoachChecklistItemCompleted("i1", true)).rejects.toThrow(/NOT_FOUND/);
    expect(db.reads).toEqual([`${OWN}/i1`]);
    expect(db.doc(`${OTHER}/i1`)?.title).toBe("theirs");
  });

  it("rejects a blank id before any read", async () => {
    await expect(setCoachChecklistItemCompleted(" ", true)).rejects.toThrow();
    expect(db.reads).toEqual([]);
  });
});

describe("deleteCoachChecklistItem", () => {
  it("deletes the caller's item and revalidates both surfaces", async () => {
    db.seed(`${OWN}/i1`, { title: "mine" });
    await expect(deleteCoachChecklistItem("i1")).resolves.toEqual({ ok: true });
    expect(db.writes).toEqual([{ op: "delete", path: `${OWN}/i1`, via: "direct" }]);
    expectRevalidatedBoth();
  });

  it("cannot delete another coach's item with the same id", async () => {
    db.seed(`${OTHER}/i1`, { title: "theirs" });
    await deleteCoachChecklistItem("i1");
    expect(db.doc(`${OTHER}/i1`)).toEqual({ title: "theirs" });
    expect(db.writes.map((w) => w.path)).toEqual([`${OWN}/i1`]);
  });

  it("rejects an invalid id before any write", async () => {
    await expect(deleteCoachChecklistItem(undefined)).rejects.toThrow();
    await expect(deleteCoachChecklistItem("x".repeat(161))).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});

describe("listCoachChecklistItems", () => {
  it("lists only the caller's items, open first, with names from the OWN roster only", async () => {
    db.seed(`${OWN}/a`, {
      title: "done one",
      completed: true,
      dueAt: new Date("2026-06-01T12:00:00Z"),
      clientIds: ["c1"],
    });
    db.seed(`${OWN}/b`, {
      title: "open one",
      notes: "   ",
      dueAt: new Date("2026-06-02T12:00:00Z"),
      clientId: "foreign-uid", // legacy single field, not on the roster
      recurrence: "weekly",
      recurrenceWeekdays: [1, 9, "x"],
      recurrenceEndsAt: new Date("2026-07-02T02:59:59Z"),
    });
    db.seed(`${OTHER}/z`, { title: "not mine", dueAt: new Date("2026-06-01T00:00:00Z") });

    const rows = await listCoachChecklistItems();
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows[0]).toMatchObject({
      title: "open one",
      notes: null,
      clients: [{ id: "foreign-uid", name: "foreign-uid" }],
      recurrence: "weekly",
      recurrenceWeekdays: [1],
      recurrenceEndsOn: "2026-07-01",
    });
    expect(rows[1].clients).toEqual([{ id: "c1", name: "Ana" }]);
    expect(db.queries).toEqual([
      expect.objectContaining({ collection: OWN, limit: 50 }),
    ]);
  });

  it("falls back to raw uids when the roster read fails", async () => {
    mockedListClients.mockRejectedValue(new Error("boom"));
    db.seed(`${OWN}/a`, { title: "x", dueAt: new Date(), clientIds: ["c1"] });
    const rows = await listCoachChecklistItems();
    expect(rows[0].clients).toEqual([{ id: "c1", name: "c1" }]);
  });

  it("skips the roster read entirely when no item links a client", async () => {
    db.seed(`${OWN}/a`, { dueAt: new Date() });
    const rows = await listCoachChecklistItems();
    expect(rows[0].title).toBe("Reminder");
    expect(mockedListClients).not.toHaveBeenCalled();
  });
});

describe("listPendingChecklistItems", () => {
  it("buckets incomplete dated items into overdue / today in the coach's zone", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    // 01:00Z on the 16th is still the 15th in Buenos Aires.
    jest.setSystemTime(new Date("2026-06-16T01:00:00Z"));
    db.seed(`${OWN}/today`, { title: "t", dueAt: new Date("2026-06-15T20:00:00Z") });
    db.seed(`${OWN}/old`, { title: "o", dueAt: new Date("2026-06-10T20:00:00Z") });
    db.seed(`${OWN}/future`, { title: "f", dueAt: new Date("2026-06-17T20:00:00Z") });
    db.seed(`${OWN}/done`, { title: "d", completed: true, dueAt: new Date("2026-06-10T20:00:00Z") });
    db.seed(`${OWN}/undated`, { title: "u", dueAt: null });

    const pending = await listPendingChecklistItems();
    expect(pending.map((p) => [p.id, p.bucket])).toEqual([
      ["old", "overdue"],
      ["today", "today"],
    ]);
  });
});
