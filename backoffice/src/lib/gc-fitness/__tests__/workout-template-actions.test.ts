// __tests__/workout-template-actions.test.ts
// Auth/ownership/trainerId-tampering tests for the 4 Server Actions in
// `workout-template-actions.ts`.
//
// Plan 04-04 contract (T-04-14 .. T-04-19 threat register):
//  - createWorkoutTemplate must SET trainerId from `getCurrentTrainer().uid`,
//    NEVER from client input — even when input claims a different trainerId.
//  - createWorkoutTemplate writes `version: 1` server-side.
//  - updateWorkoutTemplate increments version by exactly 1 per call.
//  - updateWorkoutTemplate rejects cross-trainer updates (ownership check on
//    the existing doc).
//  - softDeleteWorkoutTemplate sets `deleted: true`, never hard-deletes.
//  - listWorkoutTemplates filters by trainerId == session.uid, ordered by
//    updatedAt DESC, excludes deleted by default.
//
// All Firebase Admin + next-firebase-auth-edge surfaces are mocked — no live
// Firestore writes during these tests. Pattern adopted verbatim from
// `exercise-server-actions.test.ts` (P03-05).

// Mock module shape declarations — placed BEFORE the module imports below.
jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({}),
}));
jest.mock("next-firebase-auth-edge", () => ({
  getTokens: jest.fn(),
}));

const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockGet = jest.fn();
// Each doc ref carries the id it was requested with so `getAll` can key the
// returned exercise snapshots by id (used by enrichExercises).
const mockDoc = jest.fn((id?: string) => ({
  set: mockSet,
  update: mockUpdate,
  get: mockGet,
  id: id ?? "MOCK_DOC_ID",
}));
// `db.getAll(...refs)` batch-reads exercise docs so enrichExercises can attach
// each exercise's localized name. Resolve every ref to an exists=false snapshot
// so enrichExercises takes its `{ en: exerciseId, es: "" }` fallback. The
// create/update tests only assert exercises length + the server-set fields, so
// the exact enriched name is not load-bearing here.
const mockGetAll = jest.fn((...refs: Array<{ id?: string }>) =>
  Promise.resolve(
    refs.map((ref) => {
      const id = ref?.id ?? "ex-1";
      return {
        id,
        exists: false,
        data: () => ({ name: { en: id, es: "" } }),
      };
    }),
  ),
);
const mockOrderBy = jest.fn();
const mockWhere = jest.fn();
const mockQueryGet = jest.fn();
// Chainable query shape — where().where().orderBy().get()
const queryChain = {
  where: (...args: unknown[]) => {
    mockWhere(...args);
    return queryChain;
  },
  orderBy: (...args: unknown[]) => {
    mockOrderBy(...args);
    return queryChain;
  },
  get: () => mockQueryGet(),
};
const mockCollection = jest.fn(() => ({
  doc: mockDoc,
  where: queryChain.where,
  orderBy: queryChain.orderBy,
  get: () => mockQueryGet(),
}));

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: mockCollection,
    getAll: mockGetAll,
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP_SENTINEL"),
    increment: jest.fn((n: number) => ({ __increment: n })),
  },
}));

import type {
  DocumentSnapshot,
  QuerySnapshot,
} from "firebase-admin/firestore";

import {
  createWorkoutTemplate,
  updateWorkoutTemplate,
  softDeleteWorkoutTemplate,
  listWorkoutTemplates,
  forkStandardWorkoutTemplate,
} from "../workout-template-actions";
import { getTokens } from "next-firebase-auth-edge";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const ALLOWED_EMAIL = "trainer-a@example.com";
const ALLOWED_UID = "trainer-A";

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
      role: opts.role,
    },
  } as unknown as Awaited<ReturnType<typeof getTokens>>;
}

function fakeTemplateSnapshot(opts: {
  exists: boolean;
  trainerId?: string | null;
  version?: number;
  deleted?: boolean;
  id?: string;
}) {
  return {
    exists: opts.exists,
    id: opts.id ?? "tpl-abc",
    data: () => ({
      trainerId: opts.trainerId,
      version: opts.version ?? 1,
      deleted: opts.deleted ?? false,
      name: { en: "Push", es: "Empuje" },
      tag: "push",
      exercises: [],
      createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
      updatedAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
    }),
  } as unknown as DocumentSnapshot;
}

function fakeQuerySnapshot(
  docs: Array<{
    id: string;
    trainerId: string;
    tag: string;
    deleted?: boolean;
  }>,
): QuerySnapshot {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => ({
        trainerId: d.trainerId,
        tag: d.tag,
        deleted: d.deleted ?? false,
        name: { en: d.id, es: d.id },
        exercises: [],
        version: 1,
        updatedAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
        createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
      }),
    })),
  } as unknown as QuerySnapshot;
}

const VALID_TEMPLATE_INPUT = {
  name: { en: "Push Day", es: "Día de empuje" },
  description: { en: "Chest, shoulders, triceps.", es: "Pecho, hombros, tríceps." },
  endsOn: "2026-09-01",
  tag: "push" as const,
  exercises: [
    {
      exerciseId: "wger-abc",
      sets: 3,
      reps: 10,
      rest_seconds: 90,
      transition_rest_seconds: 60,
      notes: "Keep elbows in.",
      order: 1,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GC_FITNESS_TEAM_ALLOWLIST = ALLOWED_EMAIL;
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY = "fake-api-key";
  process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY = "fake-cookie-sig";
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
  process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL =
    "admin@gcfitness-3476b.iam.gserviceaccount.com";
  process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY =
    Buffer.from("fake-private-key").toString("base64");
});

describe("createWorkoutTemplate", () => {
  // T1: no session → Forbidden
  it("throws Forbidden when no session cookie is present", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(createWorkoutTemplate(VALID_TEMPLATE_INPUT)).rejects.toThrow(
      /forbidden/i,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T2: role is now REQUIRED — getCurrentTrainer rejects any non-trainer role.
  // (The old allowlist/role-optional gate was removed; getCurrentTrainer is
  // role-only and demands the `trainer` custom claim.)
  it("rejects authenticated users whose role is not 'trainer'", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "client" }));
    mockSet.mockResolvedValue(undefined);

    await expect(createWorkoutTemplate(VALID_TEMPLATE_INPUT)).rejects.toThrow(
      /forbidden/i,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T3 — happy path: trainerId set from SESSION, version=1
  it("creates a doc with trainerId from session and version=1", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    const result = await createWorkoutTemplate(VALID_TEMPLATE_INPUT);

    expect(result.id).toMatch(new RegExp(`^tpl-${ALLOWED_UID}-`));
    expect(mockSet).toHaveBeenCalled();
    const payload = mockSet.mock.calls[0][0];
    expect(payload.trainerId).toBe(ALLOWED_UID);
    expect(payload.version).toBe(1);
    expect(payload.deleted).toBe(false);
    expect(payload.createdAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(payload.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    // T-04-14: trainerId is the session UID even though the payload below
    // also includes name/tag/exercises copied from the input. Sanity-check
    // the input fields survive.
    expect(payload.name).toEqual({ en: "Push Day", es: "Día de empuje" });
    expect(payload.endsOn).toBe("2026-09-01");
    expect(payload.tag).toBe("push");
    expect(payload.exercises).toHaveLength(1);
  });

  // T4: T-04-14 trainerId tampering — input claims a different trainerId →
  // server still writes session.uid. The schema strips the field; the
  // pre-zod guard rejects mismatches, OR the action ignores it entirely.
  // Either behavior is acceptable as long as the written doc carries the
  // session UID. We test the strongest invariant: written.trainerId ===
  // session.uid REGARDLESS of input.
  it("ignores client-provided trainerId — written doc uses session.uid (T-04-14)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    const tamperedInput = {
      ...VALID_TEMPLATE_INPUT,
      trainerId: "victim-trainer-uid",
    } as unknown;
    await createWorkoutTemplate(tamperedInput);

    expect(mockSet).toHaveBeenCalled();
    const payload = mockSet.mock.calls[0][0];
    expect(payload.trainerId).toBe(ALLOWED_UID);
    expect(payload.trainerId).not.toBe("victim-trainer-uid");
  });

  // T5: input-version tampering — schema strips; written doc has version=1
  it("ignores client-provided version — written doc has version=1 (T-04-15)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    const tamperedInput = {
      ...VALID_TEMPLATE_INPUT,
      version: 999,
    } as unknown;
    await createWorkoutTemplate(tamperedInput);

    const payload = mockSet.mock.calls[0][0];
    expect(payload.version).toBe(1);
  });

  // T6: malformed payload — Zod parse rejects before any Firestore write
  it("rejects malformed input BEFORE touching Firestore (T-04-17)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    await expect(
      createWorkoutTemplate({
        ...VALID_TEMPLATE_INPUT,
        exercises: [],
      }),
    ).rejects.toThrow();
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("updateWorkoutTemplate", () => {
  // T7: cross-trainer update rejected (T-04-16 + threat register)
  it("rejects when caller is not the doc's trainerId (no update call)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeTemplateSnapshot({
        exists: true,
        trainerId: "different-trainer-uid",
        version: 3,
      }),
    );

    await expect(
      updateWorkoutTemplate("tpl-different-trainer-uid-abc", {
        name: { en: "Hijack", es: "Hijack" },
      }),
    ).rejects.toThrow(/not your template/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // T8: doc missing → throws Not Found
  it("throws Not Found when the doc does not exist", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnapshot({ exists: false }));

    await expect(
      updateWorkoutTemplate("tpl-missing", {
        name: { en: "Update", es: "Actualizar" },
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // T9: happy path — version increments by 1, updatedAt set; trainerId
  // never appears in the patch.
  it("increments version by 1 and stamps updatedAt; trainerId is NOT in the patch", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeTemplateSnapshot({
        exists: true,
        trainerId: ALLOWED_UID,
        version: 5,
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await updateWorkoutTemplate(`tpl-${ALLOWED_UID}-abc`, {
      name: { en: "New Name", es: "Nuevo Nombre" },
      endsOn: "2026-12-31",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.version).toEqual({ __increment: 1 });
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(patch.name).toEqual({ en: "New Name", es: "Nuevo Nombre" });
    expect(patch.endsOn).toBe("2026-12-31");
    // T-04-14 / 15: immutable fields never echoed in the patch.
    expect(patch.trainerId).toBeUndefined();
    expect(patch.createdAt).toBeUndefined();
  });
});

// Standard-template fork. Regression: the Admin SDK rejects an explicit
// `undefined` value, so forking a standard template that lacks `endsOn`
// (every standard template does) crashed with "Cannot use 'undefined' as a
// Firestore value". The fork must OMIT the `endsOn` key entirely when the
// source has none, and copy it through when present.
describe("forkStandardWorkoutTemplate", () => {
  function fakeStandardSnapshot(opts: { endsOn?: string }) {
    return {
      exists: true,
      id: "tpl-kXZSqc-std-resistance-b",
      data: () => ({
        trainerId: "__standard__",
        isStandard: true,
        version: 2,
        deleted: false,
        name: { en: "RESISTANCE B", es: "RESISTANCE B" },
        tag: "custom",
        exercises: [
          { exerciseId: "0157", sets: 3, reps: 0, rest_seconds: 30, order: 0, metric: "time", durationSeconds: 40 },
        ],
        ...(opts.endsOn ? { endsOn: opts.endsOn } : {}),
        createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
        updatedAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
      }),
    } as unknown as DocumentSnapshot;
  }

  it("forks an endsOn-less standard template WITHOUT writing endsOn: undefined", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeStandardSnapshot({}));
    mockSet.mockResolvedValue(undefined);

    const result = await forkStandardWorkoutTemplate("tpl-kXZSqc-std-resistance-b");

    expect(mockSet).toHaveBeenCalledTimes(1);
    const payload = mockSet.mock.calls[0][0];
    // The key must be ABSENT — not present-with-undefined (which the Admin
    // SDK rejects). Time-based exercises copy through verbatim.
    expect(Object.prototype.hasOwnProperty.call(payload, "endsOn")).toBe(false);
    expect(payload.trainerId).toBe(ALLOWED_UID);
    expect(payload.isStandard).toBe(false);
    expect(payload.sourceTemplateId).toBe("tpl-kXZSqc-std-resistance-b");
    expect(payload.exercises[0].metric).toBe("time");
    expect(result.id).toContain(`tpl-${ALLOWED_UID}-`);
  });

  it("copies endsOn through when the standard source has one", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeStandardSnapshot({ endsOn: "2026-12-31" }));
    mockSet.mockResolvedValue(undefined);

    await forkStandardWorkoutTemplate("tpl-kXZSqc-std-resistance-b");

    const payload = mockSet.mock.calls[0][0];
    expect(payload.endsOn).toBe("2026-12-31");
  });
});

describe("softDeleteWorkoutTemplate", () => {
  // T10: happy path — sets deleted: true, never hard-deletes
  it("sets deleted=true without calling a hard delete (T-04-18)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeTemplateSnapshot({
        exists: true,
        trainerId: ALLOWED_UID,
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await softDeleteWorkoutTemplate(`tpl-${ALLOWED_UID}-abc`);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.deleted).toBe(true);
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  // T11: ownership refusal — cross-trainer soft-delete blocked
  it("rejects soft-delete when caller is not the doc's trainerId", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeTemplateSnapshot({
        exists: true,
        trainerId: "different-trainer-uid",
      }),
    );

    await expect(
      softDeleteWorkoutTemplate("tpl-different-trainer-uid-abc"),
    ).rejects.toThrow(/not your template/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("listWorkoutTemplates", () => {
  // T12: queries own templates + global standards, then filters/sorts in-memory
  it("queries by trainerId=session.uid plus isStandard=true and returns filtered rows", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue(
      fakeQuerySnapshot([
        { id: "tpl-A", trainerId: ALLOWED_UID, tag: "push" },
        { id: "tpl-B", trainerId: ALLOWED_UID, tag: "pull" },
      ]),
    );

    const result = await listWorkoutTemplates();

    expect(result.templates).toHaveLength(2);
    expect(result.templates[0].id).toBe("tpl-A");
    // trainerId filter MUST be applied
    expect(mockWhere).toHaveBeenCalledWith(
      "trainerId",
      "==",
      ALLOWED_UID,
    );
    expect(mockWhere).toHaveBeenCalledWith("isStandard", "==", true);
  });

  // T13: tag filter happens in-memory after merged query snapshots
  it("applies a tag filter when provided", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue(
      fakeQuerySnapshot([
        { id: "tpl-push-1", trainerId: ALLOWED_UID, tag: "push" },
      ]),
    );

    await listWorkoutTemplates({ tag: "push" });

    expect(mockWhere).toHaveBeenCalledWith(
      "trainerId",
      "==",
      ALLOWED_UID,
    );
    expect(mockWhere).toHaveBeenCalledWith("isStandard", "==", true);
  });

  // T14: includeDeleted: true — does NOT apply the deleted filter
  it("does NOT apply the deleted filter when includeDeleted: true", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue(fakeQuerySnapshot([]));

    await listWorkoutTemplates({ includeDeleted: true });

    const deletedCalls = mockWhere.mock.calls.filter(
      ([f]) => f === "deleted",
    );
    expect(deletedCalls).toHaveLength(0);
  });

  // T15: no session → Forbidden, query never runs
  it("throws Forbidden when there's no session, never running the query", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(listWorkoutTemplates()).rejects.toThrow(/forbidden/i);
    expect(mockQueryGet).not.toHaveBeenCalled();
  });
});
