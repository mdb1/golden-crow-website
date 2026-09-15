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

const mockGet = jest.fn();
const mockOrderBy = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ orderBy: mockOrderBy }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: mockCollection })),
  gcFitnessStorage: jest.fn(),
}));

import { getTokens } from "next-firebase-auth-edge";

import { listExercisesForViewer } from "../exercise-list-actions";

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
  jest.clearAllMocks();
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
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("scopes to the uid on the VERIFIED TOKEN, not the browser session", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockGet.mockResolvedValue({
      docs: [
        exerciseDoc("1259", "wger", null),
        exerciseDoc("mine", "trainer", COACH_UID),
        exerciseDoc("theirs", "trainer", "another-coach"),
      ],
    });

    const { exercises } = await listExercisesForViewer();

    // The coach's own exercise is present — the regression that made it
    // vanish was reading the uid out of a browser SDK that Brave had put to
    // sleep, which returns null and hides every trainer-authored doc.
    expect(exercises.map((e) => e.id).sort()).toEqual(["1259", "mine"]);
  });

  it("drops curation-soft-deleted docs", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockGet.mockResolvedValue({
      docs: [
        exerciseDoc("alive", "wger", null),
        exerciseDoc("dead", "wger", null, {
          deletedAt: "2026-06-12T00:00:00.000Z",
        }),
      ],
    });

    const { exercises } = await listExercisesForViewer();

    expect(exercises.map((e) => e.id)).toEqual(["alive"]);
  });

  it("orders by updatedAt desc with no equality predicate", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockGet.mockResolvedValue({ docs: [] });

    await listExercisesForViewer();

    expect(mockCollection).toHaveBeenCalledWith("exercises");
    // A single orderBy is served by Firestore's automatic single-field index.
    // Adding a `where("deletedAt", "==", null)` here would BOTH need a
    // composite index AND match zero rows — `==` does not match docs where
    // the field is absent, which is the ~78 curation survivors. That combo
    // once rendered an empty picker (debug session picker-empty-deletedat).
    expect(mockOrderBy).toHaveBeenCalledWith("updatedAt", "desc");
    expect(mockOrderBy).toHaveBeenCalledTimes(1);
  });

  it("serves an admin who is not also a trainer", async () => {
    // The Firestore rule this replaces was `allow read: if isSignedIn()`.
    // Narrowing it to `getCurrentTrainer()` would have locked admins out of
    // the library they can reach today.
    mockedGetTokens.mockResolvedValue(fakeTokens("admin-uid", "admin"));
    mockGet.mockResolvedValue({ docs: [exerciseDoc("1259", "wger", null)] });

    const { exercises } = await listExercisesForViewer();

    expect(exercises.map((e) => e.id)).toEqual(["1259"]);
  });

  it("returns ISO strings, never Firestore Timestamps", async () => {
    // The rows cross the Server Action boundary, which only carries
    // serializable values — a live Timestamp object would arrive mangled.
    mockedGetTokens.mockResolvedValue(fakeTokens(COACH_UID));
    mockGet.mockResolvedValue({
      docs: [
        exerciseDoc("1259", "wger", null, {
          updatedAt: { toDate: () => new Date("2026-09-01T10:00:00.000Z") },
          createdAt: { toDate: () => new Date("2026-01-01T10:00:00.000Z") },
        }),
      ],
    });

    const { exercises } = await listExercisesForViewer();

    expect(exercises[0].updatedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(exercises[0].createdAt).toBe("2026-01-01T10:00:00.000Z");
  });
});
