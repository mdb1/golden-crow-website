// __tests__/exercise-server-actions.test.ts
// Auth/ownership/allowlist + signed-URL minting tests for the 5 trainer-facing
// Server Actions defined in `exercise-server-actions.ts`.
//
// Plan 03-05 contract:
//  - Every action must enforce `getCurrentTrainer()` BEFORE touching Firestore /
//    Storage. Bypass attempts must throw "Forbidden" with NO Admin SDK call.
//  - `updateExercise` and `softDeleteExercise` must reject mutations against
//    wger-seeded docs (immutability), and mutations against docs the caller
//    doesn't own.
//  - `mintExerciseMediaUploadUrl` must pin contentType=video/mp4, expires in
//    ≤60 minutes, refuse contentLength > 50 MB (cost-DoS guard, Pitfall 8).
//  - `duplicateExercise` clones a wger doc into a trainer-owned `custom-*` doc.
//
// All Firebase Admin + next-firebase-auth-edge surfaces are mocked — no live
// Firestore writes happen during these tests.

// Mock module shape declarations — placed BEFORE the module imports below so
// the resolver returns the mocks instead of the real modules.
jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({}),
}));
jest.mock("next-firebase-auth-edge", () => ({
  getTokens: jest.fn(),
}));

// Mock the scoped admin app + Firestore/Storage surfaces.
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({
  set: mockSet,
  update: mockUpdate,
  get: mockGet,
}));
const mockCollection = jest.fn(() => ({
  doc: mockDoc,
}));
const mockGetSignedUrl = jest.fn();
const mockFile = jest.fn(() => ({
  getSignedUrl: mockGetSignedUrl,
}));
const mockBucket = jest.fn(() => ({
  file: mockFile,
}));

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  gcFitnessStorage: jest.fn(() => ({
    bucket: mockBucket,
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP_SENTINEL"),
    increment: jest.fn((n: number) => ({ __increment: n })),
  },
}));

import type { DocumentSnapshot } from "firebase-admin/firestore";

// Imported after mocks so the SUT picks up the mocked modules.
import {
  createExercise,
  updateExercise,
  softDeleteExercise,
  duplicateExercise,
  mintExerciseMediaUploadUrl,
} from "../exercise-server-actions";
import { getTokens } from "next-firebase-auth-edge";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const ALLOWED_EMAIL = "trainer@example.com";
const ALLOWED_UID = "trainer-uid-1";

function fakeTokens(opts: {
  email?: string;
  uid?: string;
  role?: string | undefined;
}) {
  return {
    token: "fake-token",
    decodedToken: {
      uid: opts.uid ?? ALLOWED_UID,
      email: opts.email ?? ALLOWED_EMAIL,
      // The role custom claim — proxy.ts checks `decodedToken.role === "trainer"`.
      role: opts.role,
    },
  } as unknown as Awaited<ReturnType<typeof getTokens>>;
}

function fakeSnapshot(opts: {
  exists: boolean;
  source?: "wger" | "trainer";
  ownerId?: string | null;
  name?: { en: string; es: string };
  description?: { en: string; es: string };
  muscleGroups?: string[];
  equipment?: string[];
  mediaURL?: string | null;
}) {
  const data = {
    source: opts.source,
    ownerId: opts.ownerId,
    name: opts.name ?? { en: "Push Up", es: "Flexión" },
    description: opts.description ?? {
      en: "Push up.",
      es: "Flexión.",
    },
    muscleGroups: opts.muscleGroups ?? ["chest"],
    equipment: opts.equipment ?? ["bodyweight"],
    mediaURL: opts.mediaURL ?? null,
  };
  return {
    exists: opts.exists,
    data: () => data,
  } as unknown as DocumentSnapshot;
}

const VALID_EXERCISE_INPUT = {
  name: { en: "Goblet Squat", es: "Sentadilla Goblet" },
  description: {
    en: "Hold a kettlebell to your chest and squat.",
    es: "Sostén una kettlebell contra el pecho y haz sentadillas.",
  },
  muscleGroups: ["quadriceps"],
  equipment: ["kettlebell"],
  mediaURL: null,
  thumbnailURL: null,
  source: "trainer",
  ownerId: ALLOWED_UID,
  version: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GC_FITNESS_TEAM_ALLOWLIST = ALLOWED_EMAIL;
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY = "fake-api-key";
  process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY = "fake-cookie-sig";
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
  process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL =
    "admin@gcfitness-3476b.iam.gserviceaccount.com";
  // Admin private key — base64-encoded "fake-private-key" placeholder. Never
  // used to actually verify a token in these tests because getTokens is mocked.
  process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY =
    Buffer.from("fake-private-key").toString("base64");
});

describe("createExercise", () => {
  // T1: no session token → Forbidden
  it("throws Forbidden when no session cookie is present", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(createExercise(VALID_EXERCISE_INPUT)).rejects.toThrow(
      /forbidden/i,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T2: token present but email not in allowlist → Forbidden
  it("throws Forbidden when email is not in GC_FITNESS_TEAM_ALLOWLIST", async () => {
    mockedGetTokens.mockResolvedValue(
      fakeTokens({ email: "outsider@example.com", role: "trainer" }),
    );
    await expect(createExercise(VALID_EXERCISE_INPUT)).rejects.toThrow(
      /forbidden/i,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T3: token + email OK but role != trainer → Forbidden
  it("throws Forbidden when role custom claim is not 'trainer'", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "client" }));
    await expect(createExercise(VALID_EXERCISE_INPUT)).rejects.toThrow(
      /forbidden/i,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T4: happy path — allowlisted trainer, role=trainer
  it("creates a trainer-owned doc with source=trainer + ownerId=trainer.uid", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    const result = await createExercise(VALID_EXERCISE_INPUT);

    expect(result.id).toMatch(new RegExp(`^custom-${ALLOWED_UID}-`));
    expect(mockSet).toHaveBeenCalledTimes(1);
    const setPayload = mockSet.mock.calls[0][0];
    expect(setPayload.source).toBe("trainer");
    expect(setPayload.ownerId).toBe(ALLOWED_UID);
    expect(setPayload.createdAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(setPayload.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(setPayload.version).toBe(1);
    expect(setPayload.deleted).toBe(false);
  });

  // T5: ownership claim attack — trainer asks for someone else's ownerId
  it("rejects when the input claims a different ownerId than the caller", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    await expect(
      createExercise({
        ...VALID_EXERCISE_INPUT,
        ownerId: "someone-else",
      }),
    ).rejects.toThrow(/can only create exercises they own/i);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("updateExercise", () => {
  // T6: cross-trainer update — trainer A tries to edit trainer B's doc
  it("rejects when caller is not the doc's owner (BEFORE any update call)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeSnapshot({
        exists: true,
        source: "trainer",
        ownerId: "different-trainer-uid",
      }),
    );

    await expect(
      updateExercise("custom-different-trainer-uid-abc", {
        name: { en: "Hijack", es: "Hijack" },
      }),
    ).rejects.toThrow(/not your exercise/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // T7: trainer tries to update a wger doc (immutable source)
  it("rejects when target doc has source=wger", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeSnapshot({ exists: true, source: "wger", ownerId: null }),
    );

    await expect(
      updateExercise("wger-abc", {
        name: { en: "Edited", es: "Edited" },
      }),
    ).rejects.toThrow(/wger-seeded exercises are read-only/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // T8: happy path — version increment + updatedAt set
  it("calls update with FieldValue.increment(1) on version + serverTimestamp on updatedAt", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeSnapshot({
        exists: true,
        source: "trainer",
        ownerId: ALLOWED_UID,
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await updateExercise(`custom-${ALLOWED_UID}-abc`, {
      name: { en: "New Name", es: "Nuevo Nombre" },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.version).toEqual({ __increment: 1 });
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(patch.name).toEqual({ en: "New Name", es: "Nuevo Nombre" });
    // The action MUST NOT echo back source / ownerId in the patch (immutable).
    expect(patch.source).toBeUndefined();
    expect(patch.ownerId).toBeUndefined();
  });
});

describe("softDeleteExercise", () => {
  // T9: happy path — soft-delete sets deleted: true, NEVER hard-deletes
  it("sets deleted=true without calling a hard delete", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeSnapshot({
        exists: true,
        source: "trainer",
        ownerId: ALLOWED_UID,
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await softDeleteExercise(`custom-${ALLOWED_UID}-abc`);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.deleted).toBe(true);
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    // Per 03-CONTEXT.md "Hard-delete deferred" — never call doc.delete().
  });

  // T10: cannot soft-delete wger docs
  it("rejects when target doc has source=wger", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeSnapshot({ exists: true, source: "wger", ownerId: null }),
    );

    await expect(softDeleteExercise("wger-abc")).rejects.toThrow(
      /cannot delete wger-seeded exercises/i,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("mintExerciseMediaUploadUrl", () => {
  // T11: returns v4 signed URL pinned to video/mp4 with ≤60-min expiry
  it("returns a signed URL with contentType=video/mp4 and expiry within 60 minutes", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-url"]);

    const before = Date.now();
    const result = await mintExerciseMediaUploadUrl({
      exerciseId: `custom-${ALLOWED_UID}-abc`,
      contentLength: 10 * 1024 * 1024,
    });
    const after = Date.now();

    expect(result.url).toBe("https://storage.googleapis.com/signed-url");
    expect(result.gsPath).toBe(
      `gs://gcfitness-3476b.firebasestorage.app/exercises/custom-${ALLOWED_UID}-abc.mp4`,
    );
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const opts = mockGetSignedUrl.mock.calls[0][0];
    expect(opts.version).toBe("v4");
    expect(opts.action).toBe("write");
    expect(opts.contentType).toBe("video/mp4");
    // Expires must be in the future and ≤60 minutes from now.
    expect(opts.expires).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
    expect(opts.expires).toBeLessThanOrEqual(after + 60 * 60 * 1000);
  });

  // T12: contentLength > 50 MB → cost-DoS guard
  it("throws File too large when contentLength exceeds 50 MB", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    await expect(
      mintExerciseMediaUploadUrl({
        exerciseId: `custom-${ALLOWED_UID}-abc`,
        contentLength: 51 * 1024 * 1024,
      }),
    ).rejects.toThrow(/file too large/i);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  // T13: non-allowlisted user
  it("throws Forbidden when caller email is not in the allowlist", async () => {
    mockedGetTokens.mockResolvedValue(
      fakeTokens({ email: "outsider@example.com", role: "trainer" }),
    );
    await expect(
      mintExerciseMediaUploadUrl({
        exerciseId: `custom-${ALLOWED_UID}-abc`,
        contentLength: 1024,
      }),
    ).rejects.toThrow(/forbidden/i);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  // Path-traversal defense — exerciseId must start with caller's custom- prefix
  it("rejects an exerciseId not prefixed with the caller's UID (path traversal)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    await expect(
      mintExerciseMediaUploadUrl({
        exerciseId: "custom-someone-else-abc",
        contentLength: 1024,
      }),
    ).rejects.toThrow(/cannot upload to that path/i);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});

describe("duplicateExercise", () => {
  // T14: duplicating a wger doc creates a new trainer-owned custom doc
  it("clones a wger doc into a new custom-<uid>-* doc with source=trainer", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeSnapshot({
        exists: true,
        source: "wger",
        ownerId: null,
        name: { en: "Bench Press", es: "Press de Banca" },
        description: { en: "Push.", es: "Empuja." },
        muscleGroups: ["chest"],
        equipment: ["barbell", "bench"],
        mediaURL: "gs://gcfitness-3476b.firebasestorage.app/exercises/wger-abc.mp4",
      }),
    );
    mockSet.mockResolvedValue(undefined);

    const result = await duplicateExercise("wger-abc");
    expect(result.id).toMatch(new RegExp(`^custom-${ALLOWED_UID}-`));
    expect(mockSet).toHaveBeenCalledTimes(1);
    const payload = mockSet.mock.calls[0][0];
    expect(payload.source).toBe("trainer");
    expect(payload.ownerId).toBe(ALLOWED_UID);
    expect(payload.name).toEqual({ en: "Bench Press", es: "Press de Banca" });
    expect(payload.muscleGroups).toEqual(["chest"]);
    expect(payload.equipment).toEqual(["barbell", "bench"]);
    expect(payload.mediaURL).toBe(
      "gs://gcfitness-3476b.firebasestorage.app/exercises/wger-abc.mp4",
    );
    expect(payload.version).toBe(1);
    expect(payload.deleted).toBe(false);
  });
});
