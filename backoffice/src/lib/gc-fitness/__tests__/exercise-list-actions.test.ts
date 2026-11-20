// exercise-list-actions.test.ts
//
// #1104 — the exercise library is read SERVER-SIDE now. This suite pins the
// two properties that were actually broken in a coach's browser:
//
//   1. AUTHENTICATION COMES FROM THE COOKIE. The library used to be read with
//      the BROWSER Firestore SDK, which authenticates with a Firebase-Auth
//      session persisted in the browser's IndexedDB — a completely different
//      credential from the `GcFitnessAuthToken` cookie that got the coach onto
//      the page. Brave on mobile partitions/evicts that storage, so
//      `auth.currentUser` came back `null` on a valid session and
//      `allow read: if isSignedIn()` denied the read. The coach saw "No se
//      pudieron cargar los ejercicios" on a page that had just rendered.
//
//   2. THE VIEWER UID COMES FROM THE VERIFIED TOKEN. The old code took it from
//      `auth.currentUser?.uid`, and the #552 scope hides every
//      `source: "trainer"` doc when that is null — so even had the read
//      succeeded, the coach's OWN exercises would have been missing from every
//      picker with no error anywhere.
//
// The scope rule itself is tested in `exercises-listener-scope.test.ts`; here
// we only assert that this action feeds it the right uid and the right docs.

jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({}),
}));
jest.mock("next-firebase-auth-edge", () => ({
  getTokens: jest.fn(),
}));

// #495 — the action runs TWO queries now: `where("source","in",[…])` for the
// shared catalog (cached) and `where("ownerId","==",uid)` for the caller's own
// docs. The fake answers each from one in-memory doc list (`mockDocs`), so a
// test states the COLLECTION and the assertions see what each query returned.
let mockDocs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
const mockWhere = jest.fn((field: string, op: string, value: unknown) => ({
  get: jest.fn(async () => ({
    docs: mockDocs.filter((d) => {
      const v = d.data()[field];
      return op === "in" ? (value as unknown[]).includes(v) : v === value;
    }),
  })),
}));
const mockOrderBy = jest.fn();
const mockCollection = jest.fn(() => ({ where: mockWhere, orderBy: mockOrderBy }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: mockCollection })),
  gcFitnessStorage: jest.fn(),
}));
// unstable_cache needs Next's incremental cache; in Jest it is a pass-through.
// (Created inside the factory: the cached reader is built at import time,
// before any top-level `const` of this file is initialized.)
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn: unknown) => fn),
}));

import { getTokens } from "next-firebase-auth-edge";

import { listExercisesForViewer } from "../exercise-list-actions";
import { projectExercisesForViewer, type ExerciseDocLike } from "../exercise-row";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const COACH_UID = "coach-uid-1";

function fakeTokens(uid: string, role: string | undefined = "trainer") {
  return {
    token: "fake-token",
    decodedToken: { uid, email: "coach@example.com", role },
  } as unknown as Awaited<ReturnType<typeof getTokens>>;
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function exerciseDoc(
  id: string,
  source: string,
  ownerId: string | null,
  extra: Record<string, unknown> = {},
) {
  return doc(id, {
    name: { en: id, es: "" },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    source,
    ownerId,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  });
}

beforeEach(() => {
  mockWhere.mockClear();
  mockOrderBy.mockClear();
  mockCollection.mockClear();
  mockDocs = [];
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY = "fake-api-key";
  process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY = "fake-cookie-sig";
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
  process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL =
    "admin@gcfitness-3476b.iam.gserviceaccount.com";
  process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY =
    Buffer.from("fake-private-key").toString("base64");
});

describe("listExercisesForViewer", () => {
  it("refuses a caller with no session cookie", async () => {
    mockedGetTokens.mockResolvedValue(null);

    await expect(listExercisesForViewer()).rejects.toThrow(/forbidden/i);
    // No read is even attempted — an unauthenticated caller must not cost us
    // a full-collection scan of the shared library.
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it("scopes to the uid on the VERIFIED TOKEN, not the browser session", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockDocs = [
        exerciseDoc("1259", "wger", null),
        exerciseDoc("mine", "trainer", COACH_UID),
        exerciseDoc("theirs", "trainer", "another-coach"),
      ];

    const { exercises } = await listExercisesForViewer();

    // The coach's own exercise is present — the regression that made it
    // vanish was reading the uid out of a browser SDK that Brave had put to
    // sleep, which returns null and hides every trainer-authored doc.
    expect(exercises.map((e) => e.id).sort()).toEqual(["1259", "mine"]);
  });

  it("drops curation-soft-deleted docs", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockDocs = [
        exerciseDoc("alive", "wger", null),
        exerciseDoc("dead", "wger", null, {
          deletedAt: "2026-06-12T00:00:00.000Z",
        }),
      ];

    const { exercises } = await listExercisesForViewer();

    expect(exercises.map((e) => e.id)).toEqual(["alive"]);
  });

  it("#495 — reads the cached shared catalog + `ownerId == me`, never the whole collection", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));

    await listExercisesForViewer();

    expect(mockCollection).toHaveBeenCalledWith("exercises");
    expect(mockWhere.mock.calls).toEqual([
      ["source", "in", ["wger", "free-exercise-db"]],
      ["ownerId", "==", COACH_UID],
    ]);
    // No orderBy: equality / `in` alone are served by the automatic
    // single-field indexes (an orderBy on top would need a composite).
    // And still no `where("deletedAt","==",null)` — `==` does not match a
    // MISSING field, which once rendered an empty picker.
    expect(mockOrderBy).not.toHaveBeenCalled();
    // The shared half is cached under a tag the purge path revalidates.
    const { unstable_cache } = jest.requireMock("next/cache") as { unstable_cache: jest.Mock };
    expect(unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["gc-fitness-shared-exercise-catalog-v1"],
      { tags: ["gc-fitness:standard-exercises"], revalidate: 3600 },
    );
  });

  it("#495 — returns EXACTLY what the old full scan returned (same rows, same order)", async () => {
    const OTHER = "another-coach";
    const ts = (iso: string) => ({ toDate: () => new Date(iso) });
    const fixture = [
      exerciseDoc("w-old", "wger", null, { updatedAt: ts("2026-01-01T00:00:00.000Z") }),
      exerciseDoc("w-new", "wger", null, { updatedAt: ts("2026-09-01T00:00:00.000Z") }),
      exerciseDoc("f-1", "free-exercise-db", null, { updatedAt: ts("2026-05-01T00:00:00.000Z") }),
      exerciseDoc("f-tie-a", "free-exercise-db", null, { updatedAt: ts("2026-05-01T00:00:00.000Z") }),
      exerciseDoc("f-dead", "free-exercise-db", null, { deletedAt: ts("2026-06-01T00:00:00.000Z") }),
      exerciseDoc("w-owned-by-other", "wger", OTHER),
      exerciseDoc("mine", "trainer", COACH_UID, { updatedAt: ts("2026-07-01T00:00:00.000Z") }),
      exerciseDoc("mine-dead", "trainer", COACH_UID, { deletedAt: "2026-07-02T00:00:00.000Z" }),
      exerciseDoc("mine-manual", "manual", COACH_UID, { updatedAt: ts("2026-03-01T00:00:00.000Z") }),
      exerciseDoc("mine-wger", "wger", COACH_UID, { updatedAt: ts("2026-02-01T00:00:00.000Z") }),
      exerciseDoc("theirs", "trainer", OTHER),
      exerciseDoc("alias", "standard_alias", null),
      exerciseDoc("unknown-source-mine", "marketing-seed", COACH_UID),
      // No updatedAt at all: the old orderBy excluded these silently.
      doc("no-updated-at", { name: { en: "x", es: "" }, source: "wger", ownerId: null }),
      doc("mine-no-updated-at", { name: { en: "y", es: "" }, source: "trainer", ownerId: COACH_UID }),
      exerciseDoc("null-updated-at", "wger", null, { updatedAt: null }),
    ];
    // The old read, reproduced: Firestore's orderBy("updatedAt","desc") drops
    // docs WITHOUT the field, sorts the rest desc with a `__name__ desc`
    // tie-break, then the viewer projection runs over all of it.
    const iso = (v: unknown) =>
      v && typeof (v as { toDate?: unknown }).toDate === "function"
        ? (v as { toDate: () => Date }).toDate().toISOString()
        : (v as string | null);
    const oldScan = fixture
      .filter((d) => d.data().updatedAt !== undefined)
      .sort((a, b) => {
        const au = iso(a.data().updatedAt);
        const bu = iso(b.data().updatedAt);
        if (au !== bu) {
          if (au === null) return 1;
          if (bu === null) return -1;
          return au < bu ? 1 : -1;
        }
        return a.id < b.id ? 1 : -1;
      });
    const expected = projectExercisesForViewer(oldScan as ExerciseDocLike[], COACH_UID);

    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockDocs = fixture;
    const { exercises } = await listExercisesForViewer();

    expect(exercises).toEqual(expected);
    // Sanity: the fixture really exercises every branch.
    expect(expected.map((e) => e.id)).toEqual(
      expect.arrayContaining(["w-new", "mine", "mine-manual", "mine-wger", "w-owned-by-other", "unknown-source-mine"]),
    );
    expect(expected.map((e) => e.id)).not.toContain("theirs");
    expect(expected.map((e) => e.id)).not.toContain("no-updated-at");
  });

  it("serves an admin who is not also a trainer", async () => {
    // The Firestore rule this replaces was `allow read: if isSignedIn()`.
    // Narrowing it to `getCurrentTrainer()` would have locked admins out of
    // the library they can reach today.
    mockedGetTokens.mockResolvedValue(fakeTokens("admin-uid", "admin"));
    mockDocs = [exerciseDoc("1259", "wger", null)];

    const { exercises } = await listExercisesForViewer();

    expect(exercises.map((e) => e.id)).toEqual(["1259"]);
  });

  it("returns ISO strings, never Firestore Timestamps", async () => {
    // The rows cross the Server Action boundary, which only carries
    // serializable values — a live Timestamp object would arrive mangled.
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockDocs = [
      exerciseDoc("1259", "wger", null, {
        updatedAt: { toDate: () => new Date("2026-09-01T10:00:00.000Z") },
        createdAt: { toDate: () => new Date("2026-01-01T10:00:00.000Z") },
      }),
    ];

    const { exercises } = await listExercisesForViewer();

    expect(exercises[0].updatedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(exercises[0].createdAt).toBe("2026-01-01T10:00:00.000Z");
  });
});
