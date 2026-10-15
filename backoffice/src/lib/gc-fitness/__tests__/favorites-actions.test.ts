// __tests__/favorites-actions.test.ts
//
// Authz + write-shape tests for `favorites-actions.ts` (#297). The doc id is
// ALWAYS the session uid — a coach can only read / write `coach_favorites/{own
// uid}`. Auth runs through the REAL auth-helpers over a mocked getTokens.

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
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import { listFavorites, toggleFavorite } from "../favorites-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

let db: FakeFirestore;

beforeEach(() => {
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);
});

describe("auth gate", () => {
  it("rejects a signed-out caller on both actions and writes nothing", async () => {
    mockedGetTokens.mockResolvedValue(null as never);
    await expect(listFavorites()).rejects.toThrow("Forbidden");
    await expect(toggleFavorite("exercise", "ex-1", true)).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });

  it("rejects a signed-in non-trainer (client / admin-only) caller", async () => {
    signInAs("client-1", []);
    await expect(toggleFavorite("exercise", "ex-1", true)).rejects.toThrow("Forbidden");
    signInAs("admin-1", ["admin"]);
    await expect(listFavorites()).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });
});

describe("listFavorites", () => {
  it("reads ONLY coach_favorites/{session uid}", async () => {
    db.seed("coach_favorites/coach-a", { exerciseIds: ["ex-1"], workoutTemplateIds: ["w"] });
    db.seed("coach_favorites/coach-b", { exerciseIds: ["ex-of-b"] });
    await expect(listFavorites()).resolves.toEqual({
      exerciseIds: ["ex-1"],
      workoutTemplateIds: ["w"],
      habitTemplateIds: [],
    });
    expect(db.reads).toEqual(["coach_favorites/coach-a"]);
  });

  it("returns empty arrays when the coach has no doc yet", async () => {
    db.seed("coach_favorites/coach-b", { exerciseIds: ["ex-of-b"] });
    await expect(listFavorites()).resolves.toEqual({
      exerciseIds: [],
      workoutTemplateIds: [],
      habitTemplateIds: [],
    });
  });
});

describe("toggleFavorite", () => {
  it("rejects a blank id before any write", async () => {
    await expect(toggleFavorite("exercise", "   ", true)).rejects.toThrow(
      "BadRequest: id is required.",
    );
    await expect(
      toggleFavorite("exercise", 42 as unknown as string, true),
    ).rejects.toThrow("BadRequest");
    expect(db.writes).toEqual([]);
  });

  it("stars into the caller's OWN doc with a merge arrayUnion on only that kind's field", async () => {
    db.seed("coach_favorites/coach-a", { workoutTemplateIds: ["w1"] });
    const result = await toggleFavorite("exercise", "ex-9", true);

    expect(db.writes).toEqual([
      {
        op: "set",
        path: "coach_favorites/coach-a",
        merge: true,
        via: "direct",
        data: {
          exerciseIds: { __fv: "arrayUnion", values: ["ex-9"] },
          updatedAt: { __fv: "serverTimestamp" },
        },
      },
    ]);
    // Other kinds untouched; result reflects the merged doc.
    expect(result).toEqual({
      exerciseIds: ["ex-9"],
      workoutTemplateIds: ["w1"],
      habitTemplateIds: [],
    });
  });

  it("un-stars with arrayRemove and maps each kind to its own field", async () => {
    db.seed("coach_favorites/coach-a", { habitTemplateIds: ["h1", "h2"] });
    const result = await toggleFavorite("habitTemplate", "h1", false);
    expect(db.writes[0].data).toEqual({
      habitTemplateIds: { __fv: "arrayRemove", values: ["h1"] },
      updatedAt: { __fv: "serverTimestamp" },
    });
    expect(result.habitTemplateIds).toEqual(["h2"]);

    await toggleFavorite("workoutTemplate", "w7", true);
    expect(Object.keys(db.writes[1].data ?? {})).toEqual(["workoutTemplateIds", "updatedAt"]);
  });

  it("never touches another coach's favorites doc", async () => {
    db.seed("coach_favorites/coach-b", { exerciseIds: ["keep"] });
    await toggleFavorite("exercise", "ex-1", true);
    expect(db.writes.map((w) => w.path)).toEqual(["coach_favorites/coach-a"]);
    expect(db.doc("coach_favorites/coach-b")).toEqual({ exerciseIds: ["keep"] });
  });
});
