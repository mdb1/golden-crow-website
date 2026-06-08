// __tests__/habit-actions.test.ts
// Auth/ownership/trainerId-tampering tests for the 5 Server Actions in
// `habit-actions.ts`.
//
// Plan 06-05 contract (T-06-05-01 .. T-06-05-07 threat register):
//  - createHabit must SET trainerId from `getCurrentTrainer().uid`, NEVER
//    from client input — even when input claims a different trainerId.
//  - createHabit Zod-parses BEFORE the Firestore write — habits are
//    binary-only, so a non-binary type is rejected before any write.
//  - updateHabit rejects cross-trainer updates (T-06-05-02).
//  - updateHabit builds the patch from an affectedKeys whitelist — clientId,
//    trainerId, type, createdAt, seedSource NEVER appear in the patch.
//  - softDeleteHabit sets `deleted: true`, never hard-deletes (T-06-05-06).
//  - listHabitsForTrainer filters by trainerId == session.uid (T-06-05-05),
//    excludes soft-deleted, orders by updatedAt desc, limits to 200.
//  - listHabitsForClient filters by clientId+deleted, additionally
//    post-filters cross-trainer rows defense-in-depth.
//
// All Firebase Admin + next-firebase-auth-edge surfaces are mocked — no
// live Firestore writes during these tests. Pattern adopted verbatim from
// `workout-template-actions.test.ts` (P04-04).

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
const mockDoc = jest.fn(() => ({
  set: mockSet,
  update: mockUpdate,
  get: mockGet,
}));
const mockOrderBy = jest.fn();
const mockWhere = jest.fn();
const mockLimit = jest.fn();
const mockQueryGet = jest.fn();
// Chainable query shape — where().where().orderBy().limit().get()
const queryChain: {
  where: (...args: unknown[]) => typeof queryChain;
  orderBy: (...args: unknown[]) => typeof queryChain;
  limit: (...args: unknown[]) => typeof queryChain;
  get: () => unknown;
} = {
  where: (...args: unknown[]) => {
    mockWhere(...args);
    return queryChain;
  },
  orderBy: (...args: unknown[]) => {
    mockOrderBy(...args);
    return queryChain;
  },
  limit: (...args: unknown[]) => {
    mockLimit(...args);
    return queryChain;
  },
  get: () => mockQueryGet(),
};
const mockCollection = jest.fn(() => ({
  doc: mockDoc,
  where: queryChain.where,
  orderBy: queryChain.orderBy,
  limit: queryChain.limit,
  get: () => mockQueryGet(),
}));

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: mockCollection,
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
  createHabit,
  updateHabit,
  softDeleteHabit,
  deleteHabitRecurrenceFromDate,
  getHabit,
  listHabitsForTrainer,
  listHabitsForClient,
} from "../habit-actions";
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

function fakeHabitSnapshot(opts: {
  exists: boolean;
  trainerId?: string | null;
  type?: "binary";
  id?: string;
  startsOn?: string;
}) {
  return {
    exists: opts.exists,
    id: opts.id ?? "hab-abc",
    data: () => ({
      trainerId: opts.trainerId,
      type: opts.type ?? "binary",
      clientId: "uid-client-abc",
      name: { en: "Test", es: "Prueba" },
      reminderEnabled: false,
      deleted: false,
      ...(opts.startsOn ? { startsOn: opts.startsOn } : {}),
    }),
    get: (field: string) =>
      ({
        trainerId: opts.trainerId,
        type: opts.type ?? "binary",
        clientId: "uid-client-abc",
        name: { en: "Test", es: "Prueba" },
        reminderEnabled: false,
        deleted: false,
        ...(opts.startsOn ? { startsOn: opts.startsOn } : {}),
      })[field],
  } as unknown as DocumentSnapshot;
}

function fakeUserSnapshot(opts: { exists: boolean; coachId?: string }) {
  return {
    exists: opts.exists,
    get: (field: string) => (field === "coachId" ? opts.coachId : undefined),
    data: () => ({ coachId: opts.coachId }),
  } as unknown as DocumentSnapshot;
}

function fakeQuerySnapshot(
  docs: Array<{
    id: string;
    trainerId: string;
    clientId?: string;
    type?: "binary";
    deleted?: boolean;
    reminderEnabled?: boolean;
  }>,
): QuerySnapshot {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => ({
        trainerId: d.trainerId,
        clientId: d.clientId ?? "uid-client-abc",
        type: d.type ?? "binary",
        name: { en: d.id, es: d.id },
        reminderEnabled: d.reminderEnabled ?? false,
        deleted: d.deleted ?? false,
        updatedAt: { toDate: () => new Date("2026-05-19T00:00:00Z") },
        createdAt: { toDate: () => new Date("2026-05-19T00:00:00Z") },
      }),
    })),
  } as unknown as QuerySnapshot;
}

const VALID_BINARY_HABIT_INPUT = {
  clientId: "uid-client-abc",
  type: "binary" as const,
  name: { en: "Stretch", es: "Estirar" },
  reminderEnabled: false,
};

// A non-binary (legacy) type → rejected by the binary-only enum before any
// Firestore write.
const NON_BINARY_INPUT = {
  clientId: "uid-client-abc",
  type: "numeric",
  name: { en: "Water", es: "Agua" },
  reminderEnabled: false,
} as unknown;

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

describe("createHabit", () => {
  // T01 — happy path: trainerId set from SESSION, deleted=false, timestamps stamped
  it("T01 — creates a habit with trainerId from session (T-06-05-01)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    const result = await createHabit(VALID_BINARY_HABIT_INPUT);

    expect(result.id).toMatch(new RegExp(`^hab-${ALLOWED_UID}-`));
    expect(mockSet).toHaveBeenCalled();
    const payload = mockSet.mock.calls[0][0];
    expect(payload.trainerId).toBe(ALLOWED_UID);
    expect(payload.clientId).toBe("uid-client-abc");
    expect(payload.type).toBe("binary");
    expect(payload.deleted).toBe(false);
    expect(payload.createdAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(payload.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  // T02 — non-binary type → ZodError thrown, never writes (binary-only)
  it("T02 — rejects a non-binary habit type BEFORE Firestore", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    await expect(createHabit(NON_BINARY_INPUT)).rejects.toThrow();
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T03 — unauthorized (no session) → Forbidden propagates
  it("T03 — propagates Forbidden when no session is present", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(createHabit(VALID_BINARY_HABIT_INPUT)).rejects.toThrow(
      /forbidden/i,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  // T04 — client-provided trainerId is ignored — written doc carries session.uid
  it("T04 — ignores client-provided trainerId (T-06-05-01)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    const tamperedInput = {
      ...VALID_BINARY_HABIT_INPUT,
      trainerId: "victim-trainer-uid",
    } as unknown;
    await createHabit(tamperedInput);

    expect(mockSet).toHaveBeenCalled();
    const payload = mockSet.mock.calls[0][0];
    expect(payload.trainerId).toBe(ALLOWED_UID);
    expect(payload.trainerId).not.toBe("victim-trainer-uid");
  });

  // T04b — reusability: a habit authored from scratch ALSO writes a reusable
  // trainer template, and the assignment back-links to it via sourceTemplateId.
  it("T04b — also creates a reusable template and links the assignment to it", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    await createHabit(VALID_BINARY_HABIT_INPUT);

    // The template collection is written to.
    expect(mockCollection).toHaveBeenCalledWith("habit_templates");

    // The habit (first set) links to the new template.
    const habitPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof habitPayload.sourceTemplateId).toBe("string");
    expect(habitPayload.sourceTemplateId as string).toMatch(
      new RegExp(`^habit-template-${ALLOWED_UID}-`),
    );

    // The template (second set) is a trainer-scoped, client-less copy.
    const templatePayload = mockSet.mock.calls[1][0] as Record<string, unknown>;
    expect(templatePayload.scope).toBe("trainer");
    expect(templatePayload.trainerId).toBe(ALLOWED_UID);
    expect(templatePayload.clientId).toBeUndefined();
    expect(templatePayload.id).toBe(habitPayload.sourceTemplateId);
  });

  // T04c — a habit assigned FROM an existing template does NOT spawn a
  // duplicate template; it just reuses the provided sourceTemplateId.
  it("T04c — does not create a template when sourceTemplateId is provided", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockSet.mockResolvedValue(undefined);

    await createHabit({
      ...VALID_BINARY_HABIT_INPUT,
      sourceTemplateId: "habit-template-trainer-A-existing",
    });

    expect(mockCollection).not.toHaveBeenCalledWith("habit_templates");
    const habitPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(habitPayload.sourceTemplateId).toBe(
      "habit-template-trainer-A-existing",
    );
    // No trainer-scoped template doc among the writes.
    for (const call of mockSet.mock.calls) {
      expect((call[0] as Record<string, unknown>).scope).not.toBe("trainer");
    }
  });
});

describe("updateHabit", () => {
  // T05 — cross-trainer update rejected (T-06-05-02)
  it("T05 — rejects updates on habits owned by a different trainer", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({
        exists: true,
        trainerId: "different-trainer-uid",
        type: "binary",
      }),
    );

    await expect(
      updateHabit("hab-different-trainer-uid-abc", {
        name: { en: "Hijack", es: "Hijack" },
        reminderEnabled: false,
      }),
    ).rejects.toThrow(/not your habit/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // T06 — happy path: patch built from whitelist; trainerId NEVER in patch;
  // updatedAt stamped
  it("T06 — patches whitelisted fields only and stamps updatedAt (T-06-05-02 defense)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({
        exists: true,
        trainerId: ALLOWED_UID,
        type: "binary",
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await updateHabit(`hab-${ALLOWED_UID}-abc`, {
      name: { en: "New name", es: "Nuevo nombre" },
      reminderEnabled: true,
      reminderTime: "07:30",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.name).toEqual({ en: "New name", es: "Nuevo nombre" });
    expect(patch.reminderEnabled).toBe(true);
    expect(patch.reminderTime).toBe("07:30");
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    // Immutable fields MUST NOT appear in the patch.
    expect(patch.trainerId).toBeUndefined();
    expect(patch.clientId).toBeUndefined();
    expect(patch.type).toBeUndefined();
    expect(patch.createdAt).toBeUndefined();
    expect(patch.seedSource).toBeUndefined();
  });

  // T07 — update silently strips an attempted type-override (Zod .omit + .strip)
  it("T07 — strips attempted type-override on update input", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({
        exists: true,
        trainerId: ALLOWED_UID,
        type: "binary",
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await updateHabit(`hab-${ALLOWED_UID}-abc`, {
      name: { en: "ok", es: "ok" },
      reminderEnabled: false,
      type: "weight",
      trainerId: "victim-uid",
    } as unknown);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.type).toBeUndefined();
    expect(patch.trainerId).toBeUndefined();
  });

  // T08 — doc not found → throws Not found
  it("T08 — throws Not found when the habit doc is absent", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeHabitSnapshot({ exists: false }));

    await expect(
      updateHabit("hab-missing", {
        name: { en: "X", es: "X" },
        reminderEnabled: false,
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("softDeleteHabit", () => {
  // T09 — happy path: sets deleted: true, never hard-deletes (T-06-05-06)
  it("T09 — sets deleted=true without calling a hard delete", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({
        exists: true,
        trainerId: ALLOWED_UID,
      }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await softDeleteHabit(`hab-${ALLOWED_UID}-abc`);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.deleted).toBe(true);
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  // T10 — ownership refusal — cross-trainer soft-delete blocked
  it("T10 — rejects soft-delete when caller is not the doc's trainerId", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({
        exists: true,
        trainerId: "different-trainer-uid",
      }),
    );

    await expect(
      softDeleteHabit("hab-different-trainer-uid-abc"),
    ).rejects.toThrow(/not your habit/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteHabitRecurrenceFromDate", () => {
  // Caps endsOn to the day BEFORE the tapped date — past stays, future goes.
  it("sets endsOn = (fromCivilDate − 1 day), preserving past occurrences", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({ exists: true, trainerId: ALLOWED_UID, startsOn: "2026-01-01" }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await deleteHabitRecurrenceFromDate(`hab-${ALLOWED_UID}-abc`, "2026-05-20");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.endsOn).toBe("2026-05-19");
    expect(patch.deleted).toBeUndefined();
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  // Deleting from at/before the start has no past to keep → full soft-delete.
  it("falls back to deleted=true when the cutoff precedes startsOn", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({ exists: true, trainerId: ALLOWED_UID, startsOn: "2026-05-20" }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await deleteHabitRecurrenceFromDate(`hab-${ALLOWED_UID}-abc`, "2026-05-20");

    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.deleted).toBe(true);
    expect(patch.endsOn).toBeUndefined();
  });

  it("rejects when caller is not the doc's trainerId", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeHabitSnapshot({ exists: true, trainerId: "different-trainer-uid" }),
    );

    await expect(
      deleteHabitRecurrenceFromDate("hab-different-trainer-uid-abc", "2026-05-20"),
    ).rejects.toThrow(/not your habit/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("listHabitsForTrainer", () => {
  // T11 — filters by trainerId == session.uid + deleted == false + ordered by updatedAt desc + limit 200
  it("T11 — queries by trainerId+deleted+updatedAt desc+limit 200 (T-06-05-05 / -07)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue(
      fakeQuerySnapshot([
        { id: "hab-A", trainerId: ALLOWED_UID },
        { id: "hab-B", trainerId: ALLOWED_UID },
      ]),
    );

    const result = await listHabitsForTrainer();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("hab-A");
    expect(mockWhere).toHaveBeenCalledWith(
      "trainerId",
      "==",
      ALLOWED_UID,
    );
    expect(mockWhere).toHaveBeenCalledWith("deleted", "==", false);
    expect(mockOrderBy).toHaveBeenCalledWith("updatedAt", "desc");
    expect(mockLimit).toHaveBeenCalledWith(200);
  });

  // T12 — projects ISO-stringified timestamps
  it("T12 — projects rows with ISO-stringified timestamps", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue(
      fakeQuerySnapshot([
        { id: "hab-A", trainerId: ALLOWED_UID },
      ]),
    );

    const result = await listHabitsForTrainer();
    expect(result[0].createdAt).toBe("2026-05-19T00:00:00.000Z");
    expect(result[0].updatedAt).toBe("2026-05-19T00:00:00.000Z");
  });

  // T13 — no session → Forbidden, query never runs
  it("T13 — throws Forbidden when there's no session, never running the query", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(listHabitsForTrainer()).rejects.toThrow(/forbidden/i);
    expect(mockQueryGet).not.toHaveBeenCalled();
  });
});

describe("listHabitsForClient", () => {
  // T14 — filters by clientId + deleted; defense-in-depth strips cross-trainer rows
  it("T14 — strips cross-trainer rows post-query (defense in depth)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue(
      fakeQuerySnapshot([
        { id: "hab-mine", trainerId: ALLOWED_UID, clientId: "uid-X" },
        {
          id: "hab-other",
          trainerId: "other-trainer-uid",
          clientId: "uid-X",
        },
      ]),
    );

    const result = await listHabitsForClient("uid-X");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("hab-mine");
    expect(mockWhere).toHaveBeenCalledWith("clientId", "==", "uid-X");
    expect(mockWhere).toHaveBeenCalledWith("deleted", "==", false);
    expect(mockLimit).toHaveBeenCalledWith(200);
  });
});

describe("getHabit", () => {
  it("allows the current coach to open an old-coach habit for their transferred client", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet
      .mockResolvedValueOnce(
        fakeHabitSnapshot({ exists: true, trainerId: "previous-coach" }),
      )
      .mockResolvedValueOnce(fakeUserSnapshot({ exists: true, coachId: ALLOWED_UID }));

    const result = await getHabit("hab-transfer-old");

    expect(result.id).toBe("hab-abc");
    expect(result.trainerId).toBe("previous-coach");
  });
});
