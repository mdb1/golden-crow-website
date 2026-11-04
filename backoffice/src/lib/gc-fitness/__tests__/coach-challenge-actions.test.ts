// __tests__/coach-challenge-actions.test.ts — gc-fitness #1475 (S6): authz + write shape of
// the coach-challenge Server Actions. Members come ONLY from the signed-in coach's roster
// (pending `mirror:` entries excluded), delete only touches the coach's OWN coach-origin docs,
// and the list reads with equality filters only (no composite index) and sorts in memory.

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
  createCoachChallenge,
  deleteCoachChallenge,
  listCoachChallenges,
} from "../coach-challenge-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
const mockedListClients = listClients as unknown as jest.Mock;
const mockedRevalidate = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

const NOW = new Date("2026-08-20T15:00:00Z");
let db: FakeFirestore;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] });
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  mockedGetTokens.mockResolvedValue(tokensFor("coach-a", ["trainer"]) as never);
  mockedRevalidate.mockReset();
  mockedListClients.mockReset();
  mockedListClients.mockResolvedValue([
    { uid: "c1", displayName: "Ana", pendingProvisioning: false },
    { uid: "c2", displayName: "Beto", pendingProvisioning: false },
    { uid: "mirror:pend", displayName: "Pendiente", pendingProvisioning: true },
    { uid: "bad_uid", displayName: "Raro", pendingProvisioning: false },
  ]);
});

afterEach(() => {
  jest.useRealTimers();
});

const validForm = {
  name: "  Agosto a full ",
  kind: "workouts",
  cadence: "weekly",
  target: 3,
  startDate: "2026-08-21",
  endDate: "2026-09-03",
};

function challengeDocs(): Array<[string, Record<string, unknown>]> {
  return [...db.store.entries()].filter(([path]) => path.startsWith("social_challenges/"));
}

describe("createCoachChallenge", () => {
  it("writes the coach doc for the roster's real clients", async () => {
    const result = await createCoachChallenge(validForm);
    expect(result.ok).toBe(true);
    const docs = challengeDocs();
    expect(docs).toHaveLength(1);
    const [path, data] = docs[0];
    expect(result.ok && path).toBe(`social_challenges/${result.ok ? result.id : ""}`);
    expect(data).toMatchObject({
      origin: "coach",
      creatorUid: "coach-a",
      name: "Agosto a full",
      kind: "workouts",
      cadence: "weekly",
      target: 3,
      durationDays: 14,
      timezone: "America/Argentina/Buenos_Aires",
      status: "active",
      memberUids: ["c1", "c2"],
      hidden: false,
      startPushPending: true,
    });
    expect((data.startsAt as FakeTimestamp).toMillis()).toBe(Date.parse("2026-08-21T03:00:00Z"));
    expect((data.endsAt as FakeTimestamp).toMillis()).toBe(Date.parse("2026-09-04T03:00:00Z"));
    expect(data.createdAt).toBeInstanceOf(FakeTimestamp);
    expect((data.members as Record<string, unknown>).c1).toEqual({
      status: "invited",
      progress: 0,
      weeks: [0, 0],
      completedAt: null,
      joinedAt: null,
      invitedBy: "coach-a",
      handle: "",
      displayName: "",
      photoURL: null,
    });
    expect(Object.keys(data.members as object).sort()).toEqual(["c1", "c2"]);
    expect(mockedRevalidate).toHaveBeenCalledWith("/gc-fitness/challenges");
  });

  it("returns (not throws) a field.reason code and writes nothing on invalid input", async () => {
    await expect(createCoachChallenge({ ...validForm, endDate: "2026-09-04" })).resolves.toEqual({
      ok: false,
      error: "endDate.notWeeks",
    });
    await expect(createCoachChallenge({ ...validForm, name: "a\nb" })).resolves.toEqual({
      ok: false,
      error: "name.invalid",
    });
    expect(challengeDocs()).toHaveLength(0);
  });

  it("refuses when the coach has no real clients", async () => {
    mockedListClients.mockResolvedValue([{ uid: "mirror:p", displayName: "P", pendingProvisioning: true }]);
    await expect(createCoachChallenge(validForm)).resolves.toEqual({ ok: false, error: "members.noMembers" });
    expect(challengeDocs()).toHaveLength(0);
  });

  it("rejects a non-trainer session", async () => {
    mockedGetTokens.mockResolvedValue(tokensFor("client-x", []) as never);
    await expect(createCoachChallenge(validForm)).rejects.toThrow("Forbidden");
    expect(challengeDocs()).toHaveLength(0);
  });
});

describe("deleteCoachChallenge", () => {
  beforeEach(() => {
    db.seed("social_challenges/mine", { origin: "coach", creatorUid: "coach-a" });
    db.seed("social_challenges/theirs", { origin: "coach", creatorUid: "coach-b" });
    db.seed("social_challenges/friends", { creatorUid: "coach-a" });
  });

  it("deletes the coach's own coach-origin challenge", async () => {
    await expect(deleteCoachChallenge("mine")).resolves.toEqual({ ok: true });
    expect(db.doc("social_challenges/mine")).toBeUndefined();
  });

  it("does not touch another coach's or a friends challenge, nor a missing / malformed id", async () => {
    for (const id of ["theirs", "friends", "missing", "../x", "", 7]) {
      await expect(deleteCoachChallenge(id)).resolves.toEqual({ ok: false, error: "notFound" });
    }
    expect(db.doc("social_challenges/theirs")).toBeDefined();
    expect(db.doc("social_challenges/friends")).toBeDefined();
  });
});

describe("listCoachChallenges", () => {
  const ts = (iso: string) => new FakeTimestamp(Date.parse(iso));

  it("lists only the coach's coach-origin challenges with equality filters, active first", async () => {
    const base = {
      origin: "coach",
      creatorUid: "coach-a",
      kind: "workouts",
      cadence: "total",
      target: 4,
      timezone: "America/Argentina/Buenos_Aires",
      status: "active",
      hidden: false,
    };
    db.seed("social_challenges/ended", {
      ...base,
      name: "Julio",
      startsAt: ts("2026-07-01T03:00:00Z"),
      endsAt: ts("2026-07-08T03:00:00Z"),
      memberUids: ["c1"],
      members: { c1: { status: "joined", progress: 2, completedAt: null, joinedAt: ts("2026-07-02T00:00:00Z"), displayName: "" } },
    });
    db.seed("social_challenges/live", {
      ...base,
      name: "Agosto",
      startsAt: ts("2026-08-19T03:00:00Z"),
      endsAt: ts("2026-08-26T03:00:00Z"),
      memberUids: ["c1", "c2"],
      members: {
        c1: { status: "invited", progress: 0, completedAt: null, joinedAt: null, displayName: "" },
        c2: { status: "joined", progress: 1, completedAt: null, joinedAt: ts("2026-08-19T10:00:00Z"), displayName: "Beto B." },
      },
    });
    db.seed("social_challenges/other-coach", { ...base, creatorUid: "coach-b", name: "X", startsAt: ts("2026-08-19T03:00:00Z"), endsAt: ts("2026-08-26T03:00:00Z") });
    db.seed("social_challenges/friends", { ...base, origin: undefined, name: "F", startsAt: ts("2026-08-19T03:00:00Z"), endsAt: ts("2026-08-26T03:00:00Z") });

    const list = await listCoachChallenges();
    expect(list.map((c) => [c.id, c.status])).toEqual([
      ["live", "active"],
      ["ended", "ended"],
    ]);
    expect(list[0]).toMatchObject({ invitedCount: 2, joinedCount: 1, pendingCount: 1 });
    expect(list[0].standings).toEqual([
      { uid: "c2", rank: 1, name: "Beto B.", progress: 1, weeksTotal: 0, completedAt: null },
    ]);
    // Fallback al nombre del roster cuando el miembro unido no trae displayName.
    expect(list[1].standings[0].name).toBe("Ana");

    const queries = db.queries.filter((q) => q.collection === "social_challenges");
    expect(queries).toHaveLength(1);
    expect(queries[0].orderBy).toEqual([]);
    expect(queries[0].filters).toEqual([
      { field: "creatorUid", op: "==", value: "coach-a" },
      { field: "origin", op: "==", value: "coach" },
    ]);
  });
});
