// __tests__/workout-assignment-actions.test.ts
// Server-Action behavior tests for the 6 workout-assignment Server Actions
// shipped by 04-05. All Firebase Admin + next-firebase-auth-edge surfaces
// are mocked — no live Firestore writes happen during these tests.
//
// SC#2 (load-bearing acceptance test):
//   bulkAssignTemplate(10 clients) writes EXACTLY 10 set() calls + EXACTLY
//   1 batch.commit() — proves the atomic WriteBatch fan-out from
//   04-RESEARCH.md §Pattern 4.
//
// Threat-register coverage (04-05 PLAN.md):
//   T-04-20  scheduledFor regex guard (Zod + rule)
//   T-04-21  templateSnapshot mutation rejected on edit
//   T-04-22  cross-trainer clientIds rejected before WriteBatch construction
//   T-04-23  > 166 clients rejected at parse time
//   T-04-24  bulk error response is generic (count + verbatim error, no UID lists)

// Mock module shape declarations — placed BEFORE the SUT import so Jest
// resolves the mocks instead of the real modules.
jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({}),
}));
jest.mock("next-firebase-auth-edge", () => ({
  getTokens: jest.fn(),
}));

// Firebase Admin mocks — fine-grained so we can assert on call counts,
// payloads, and batch behaviour.
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();

// Each doc ref carries the id it was requested with so `getAll` (and the
// templateSnapshot exercise-name enrichment that calls it) can key the
// returned snapshots by exercise id.
const mockDoc = jest.fn((id?: string) => ({
  set: mockSet,
  update: mockUpdate,
  delete: mockDelete,
  get: mockGet,
  id: id ?? "MOCK_DOC_ID",
}));

// `db.getAll(...refs)` batch-reads the exercise docs that
// templateSnapshotForAssignment uses to enrich each exercise's localized name.
// Resolve every ref to an exists=false snapshot so the enrichment takes its
// `{ en: exerciseId, es: "" }` fallback and adds NO license (the original
// exercise's license survives via spread). VALID_TEMPLATE's exercise(s) carry
// the matching fallback name so the denormalized snapshot equals VALID_TEMPLATE.
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

const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockQueryGet = jest.fn();

const mockCollection = jest.fn(() => {
  const col = {
    doc: mockDoc,
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockQueryGet,
  };
  return col;
});

// `where()` and `orderBy()` are chainable in the real SDK — return a query
// shape that re-exposes the same chain methods plus `.get()`.
mockWhere.mockImplementation(() => ({
  where: mockWhere,
  orderBy: mockOrderBy,
  get: mockQueryGet,
}));
mockOrderBy.mockImplementation(() => ({
  where: mockWhere,
  orderBy: mockOrderBy,
  get: mockQueryGet,
}));

const mockBatchSet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = jest.fn(() => ({
  set: mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
}));

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
    getAll: mockGetAll,
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP_SENTINEL"),
  },
}));

// SUT — imported AFTER mocks so it picks them up.
import {
  assignTemplate,
  bulkAssignTemplate,
  editAssignmentScheduledFor,
  editAssignmentExercises,
  deleteAssignment,
  listAssignmentsForClientWeek,
  listAssignmentsForTrainerDay,
} from "../workout-assignment-actions";
import { getTokens } from "next-firebase-auth-edge";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const ALLOWED_EMAIL = "trainer@example.com";
const ALLOWED_UID = "trainer-uid-1";
const OTHER_TRAINER_UID = "trainer-uid-2";
const CLIENT_UID = "client-uid-1";

function fakeTokens(opts: {
  email?: string;
  uid?: string;
  role?: string;
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

// A minimal but full-fidelity template snapshot (matches workout-templates.md
// field shape — name, description, tag, exercises, version).
const VALID_TEMPLATE = {
  trainerId: ALLOWED_UID,
  name: { en: "Push Day", es: "Día de Empuje" },
  description: { en: "Chest + tris", es: "Pecho + tríceps" },
  tag: "push",
  exercises: [
    {
      exerciseId: "ex-1",
      sets: 3,
      reps: 10,
      restSeconds: 90,
      transition_rest_seconds: 60,
      notes: null,
      order: 0,
      license: { spdx: "CC-BY-SA-3.0", author: "wger", sourceUrl: null },
      // templateSnapshotForAssignment enriches each exercise with a localized
      // name from the exercise doc (or this `{ en: exerciseId, es: "" }`
      // fallback when the doc is missing — see the mockGetAll above). The
      // denormalized snapshot therefore carries this field; declaring it here
      // keeps the `toEqual(VALID_TEMPLATE)` snapshot assertions exact.
      name: { en: "ex-1", es: "" },
    },
  ],
  version: 1,
};

function fakeTemplateSnap(opts: { exists: boolean; data?: object }) {
  return {
    exists: opts.exists,
    data: () => opts.data ?? VALID_TEMPLATE,
  };
}

function fakeAssignmentSnap(opts: {
  exists: boolean;
  trainerId?: string;
  clientId?: string;
  scheduledFor?: string;
  seriesId?: string | null;
}) {
  const data: Record<string, unknown> = {
    trainerId: opts.trainerId ?? ALLOWED_UID,
    clientId: opts.clientId ?? CLIENT_UID,
    scheduledFor: opts.scheduledFor ?? "2026-06-01",
    templateId: "tpl-abc",
    templateSnapshot: VALID_TEMPLATE,
    status: "scheduled",
  };
  if (opts.seriesId !== undefined) {
    data.seriesId = opts.seriesId;
  }
  return {
    exists: opts.exists,
    data: () => data,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GC_FITNESS_TEAM_ALLOWLIST = ALLOWED_EMAIL;
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY = "fake-api-key";
  process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY = "fake-cookie-sig";
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
  process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL =
    "admin@gcfitness-3476b.iam.gserviceaccount.com";
  process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY = Buffer.from(
    "fake-private-key",
  ).toString("base64");

  // Re-install where/orderBy chain after clearAllMocks blows them away.
  mockWhere.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockQueryGet,
  }));
  mockOrderBy.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockQueryGet,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// assignTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("assignTemplate", () => {
  it("throws Forbidden when no session cookie present", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(
      assignTemplate({
        templateId: "tpl-abc",
        clientId: CLIENT_UID,
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow(/forbidden/i);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("writes a full templateSnapshot denormalized into the assignment doc", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockSet.mockResolvedValue(undefined);

    await assignTemplate({
      templateId: "tpl-abc",
      clientId: CLIENT_UID,
      scheduledFor: "2026-06-01",
      timezone: "America/Mexico_City",
      exerciseOverrides: [
        {
          index: 0,
          rest_seconds: 45,
          transition_rest_seconds: 75,
          notes: "Tempo control",
        },
      ],
    });

    // calls[0] is the assignment doc write; a 2nd set() writes the
    // best-effort coach_activity event log (see coach-activity-log.ts).
    expect(mockSet).toHaveBeenCalled();
    const payload = mockSet.mock.calls[0][0];
    expect(payload.templateSnapshot.exercises[0].rest_seconds).toBe(45);
    expect(payload.templateSnapshot.exercises[0].transition_rest_seconds).toBe(75);
    expect(payload.templateId).toBe("tpl-abc");
    expect(payload.clientId).toBe(CLIENT_UID);
    expect(payload.trainerId).toBe(ALLOWED_UID);
    expect(payload.scheduledFor).toBe("2026-06-01");
    expect(payload.timezone).toBe("America/Mexico_City");
    expect(payload.status).toBe("scheduled");
    expect(payload.createdAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(payload.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("writes scheduledFor verbatim as a string (Pitfall 1 — no Timestamp conversion)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockSet.mockResolvedValue(undefined);

    await assignTemplate({
      templateId: "tpl-abc",
      clientId: CLIENT_UID,
      scheduledFor: "2026-06-01",
    });

    const payload = mockSet.mock.calls[0][0];
    expect(typeof payload.scheduledFor).toBe("string");
    expect(payload.scheduledFor).toBe("2026-06-01");
  });

  it("rejects trainerId tampering — payload trainerId always comes from session", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockSet.mockResolvedValue(undefined);

    // The Zod schema doesn't define trainerId — Zod will silently drop it.
    // If a hostile caller sneaks one in, the Server Action still uses
    // `getCurrentTrainer().uid` for the written field. We cast to `unknown`
    // so the test compiles without a typed shape.
    const hostileInput: unknown = {
      templateId: "tpl-abc",
      clientId: CLIENT_UID,
      scheduledFor: "2026-06-01",
      trainerId: "evil-uid",
    };
    await assignTemplate(hostileInput);

    const payload = mockSet.mock.calls[0][0];
    expect(payload.trainerId).toBe(ALLOWED_UID);
  });

  it("rejects when template trainerId does not match the caller", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeTemplateSnap({
        exists: true,
        data: { ...VALID_TEMPLATE, trainerId: OTHER_TRAINER_UID },
      }),
    );

    await expect(
      assignTemplate({
        templateId: "tpl-abc",
        clientId: CLIENT_UID,
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow(/not your template/i);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("rejects when template does not exist", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: false, data: {} }));

    await expect(
      assignTemplate({
        templateId: "tpl-missing",
        clientId: CLIENT_UID,
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow(/template not found/i);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("rejects malformed scheduledFor at Zod parse time (BEFORE Firestore read)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));

    await expect(
      assignTemplate({
        templateId: "tpl-abc",
        clientId: CLIENT_UID,
        scheduledFor: "2026-6-1",
      }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// bulkAssignTemplate — the SC#2 acceptance test surface
// ─────────────────────────────────────────────────────────────────────────────

describe("bulkAssignTemplate", () => {
  it("writes EXACTLY 10 batch.set() + EXACTLY 1 batch.commit() for 10 clients (SC#2)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    const clientIds = Array.from({ length: 10 }, (_, i) => `client-${i}`);
    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds,
      scheduledFor: "2026-06-01",
    });

    expect(result.ids).toHaveLength(10);
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(10);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("every doc carries the SAME templateSnapshot (byte-for-byte same version)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    const clientIds = Array.from({ length: 5 }, (_, i) => `client-${i}`);
    await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds,
      scheduledFor: "2026-06-01",
    });

    expect(mockBatchSet).toHaveBeenCalledTimes(5);
    const snapshots = mockBatchSet.mock.calls.map(
      (call) => call[1].templateSnapshot,
    );
    // All snapshots are the same reference (template was read once).
    for (const snap of snapshots) {
      expect(snap).toEqual(VALID_TEMPLATE);
    }
  });

  it("rejects bulkAssign when commit rejects — atomic rollback (no partial state)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockRejectedValue(
      new Error("ABORTED: too much contention on these documents"),
    );

    const clientIds = ["c1", "c2", "c3"];
    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds,
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow(/aborted/i);
    // The Server Action surfaces the verbatim error (Pitfall 5 — no silent
    // partial-success messaging). The "no docs written" guarantee is
    // structural — WriteBatch.commit() is atomic at the Firestore layer.
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("rejects 167 clients at Zod parse time (no Firestore read)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));

    const clientIds = Array.from({ length: 167 }, (_, i) => `c-${i}`);
    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds,
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("rejects bulkAssign with empty clientIds at Zod parse time", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));

    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds: [],
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow();
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("rejects when template trainerId does not match the caller (T-04-05)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeTemplateSnap({
        exists: true,
        data: { ...VALID_TEMPLATE, trainerId: OTHER_TRAINER_UID },
      }),
    );

    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds: ["c1", "c2"],
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow(/not your template/i);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("rejects Forbidden when no session", async () => {
    mockedGetTokens.mockResolvedValue(null);
    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds: ["c1"],
        scheduledFor: "2026-06-01",
      }),
    ).rejects.toThrow(/forbidden/i);
  });

  it("generates a unique doc-id pattern asg-{clientId}-{YYYYMMDD}-{uuid} per client", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds: ["clientA", "clientB"],
      scheduledFor: "2026-06-01",
    });

    expect(result.ids).toHaveLength(2);
    expect(result.ids[0]).toMatch(/^asg-clientA-20260601-/);
    expect(result.ids[1]).toMatch(/^asg-clientB-20260601-/);
    // Unique suffixes per doc (otherwise two clients on the same day would
    // collide on overwriting writes).
    expect(result.ids[0]).not.toBe(result.ids[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// editAssignmentScheduledFor — narrow edit path (supplemental decision 1)
// ─────────────────────────────────────────────────────────────────────────────

describe("editAssignmentScheduledFor", () => {
  it("updates only scheduledFor + updatedAt (matches rule whitelist)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({ exists: true, trainerId: ALLOWED_UID }),
    );
    mockUpdate.mockResolvedValue(undefined);

    await editAssignmentScheduledFor("asg-abc", {
      scheduledFor: "2026-06-15",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(Object.keys(patch).sort()).toEqual(["scheduledFor", "updatedAt"]);
    expect(patch.scheduledFor).toBe("2026-06-15");
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("rejects edit with templateSnapshot in input (Zod .strict() — WTPL-07)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));

    const hostileEdit: unknown = {
      scheduledFor: "2026-06-15",
      templateSnapshot: { name: { en: "evil", es: "evil" } },
    };
    await expect(
      editAssignmentScheduledFor("asg-abc", hostileEdit),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects edit when caller is not the assignment's trainer", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: OTHER_TRAINER_UID,
      }),
    );

    await expect(
      editAssignmentScheduledFor("asg-abc", {
        scheduledFor: "2026-06-15",
      }),
    ).rejects.toThrow(/not your assignment/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects edit when assignment does not exist", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({ exists: false }),
    );

    await expect(
      editAssignmentScheduledFor("asg-missing", {
        scheduledFor: "2026-06-15",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("editAssignmentExercises", () => {
  it("preserves and writes transition rest in the assignment snapshot", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({ exists: true, trainerId: ALLOWED_UID }),
    );
    mockBatchCommit.mockResolvedValue(undefined);

    await editAssignmentExercises("asg-abc", {
      scope: "one",
      exercises: [
        {
          index: 0,
          repsBySet: [10, 10],
          weightBySetKg: [0, 0],
          rest_seconds: 45,
          transition_rest_seconds: 60,
          notes: "Keep tempo",
        },
      ],
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.templateSnapshot.exercises[0].rest_seconds).toBe(45);
    expect(patch.templateSnapshot.exercises[0].transition_rest_seconds).toBe(60);
    expect(patch.templateSnapshot.exercises[0].sets).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteAssignment — narrow trainer-owned hard delete (rule layer allows it)
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteAssignment", () => {
  it("hard-deletes the assignment when caller owns it (backwards-compat one-arg form returns deletedCount=1)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({ exists: true, trainerId: ALLOWED_UID }),
    );
    mockDelete.mockResolvedValue(undefined);
    // Single-delete now ALSO queries workout_logs to cascade-delete the
    // assignment's logs — no logs here, so the queries resolve empty.
    mockQueryGet.mockResolvedValue({ docs: [] });

    const result = await deleteAssignment("asg-abc");

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, deletedCount: 1 });
  });

  it("cascades the delete to the assignment's workout log(s)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({ exists: true, trainerId: ALLOWED_UID }),
    );
    mockDelete.mockResolvedValue(undefined);
    const batchDelete = jest.fn();
    mockBatch.mockImplementation(() => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      delete: batchDelete,
      commit: mockBatchCommit,
    }));
    mockBatchCommit.mockResolvedValue(undefined);
    // Both the snake (`assignment_id`) and camel (`assignmentId`) FK queries
    // return the SAME owned log doc; dedupe by id → exactly one batch delete.
    mockQueryGet.mockResolvedValue({
      docs: [
        {
          id: "log-1",
          ref: { id: "log-1" },
          data: () => ({ trainerId: ALLOWED_UID }),
        },
      ],
    });

    const result = await deleteAssignment("asg-abc");

    expect(mockDelete).toHaveBeenCalledTimes(1); // the assignment doc
    expect(batchDelete).toHaveBeenCalledTimes(1); // the deduped log
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, deletedCount: 1 });
  });

  it("rejects delete when caller is not the trainer", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: OTHER_TRAINER_UID,
      }),
    );

    await expect(deleteAssignment("asg-abc")).rejects.toThrow(
      /not your assignment/i,
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // 260522-ki7 Task C — cascadeFromDate path.
  it("cascadeFromDate on non-recurring doc (no seriesId) → falls back to single delete", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: ALLOWED_UID,
        // no seriesId
      }),
    );
    mockDelete.mockResolvedValue(undefined);
    // Single-delete path cascades to logs (none here → empty).
    mockQueryGet.mockResolvedValue({ docs: [] });

    const result = await deleteAssignment("asg-x", {
      cascadeFromDate: "2026-06-01",
    });

    // Falls back to single-doc delete; no batch.commit (no logs to cascade).
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, deletedCount: 1 });
  });

  it("cascadeFromDate on recurring doc → batch deletes selected + future scheduled", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: ALLOWED_UID,
        seriesId: "ser-1",
      }),
    );
    const batchDelete = jest.fn();
    mockBatch.mockImplementation(() => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      delete: batchDelete,
      commit: mockBatchCommit,
    }));
    mockBatchCommit.mockResolvedValue(undefined);
    // Three docs returned by the cascade query (selected + 2 future), all owned
    // by the caller, all status='scheduled'.
    mockQueryGet.mockResolvedValue({
      size: 3,
      docs: [
        {
          ref: { id: "asg-1" },
          data: () => ({ trainerId: ALLOWED_UID, status: "scheduled" }),
        },
        {
          ref: { id: "asg-2" },
          data: () => ({ trainerId: ALLOWED_UID, status: "scheduled" }),
        },
        {
          ref: { id: "asg-3" },
          data: () => ({ trainerId: ALLOWED_UID, status: "scheduled" }),
        },
      ],
    });

    const result = await deleteAssignment("asg-1", {
      cascadeFromDate: "2026-06-01",
    });

    expect(batchDelete).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, deletedCount: 3 });
  });

  it("cascadeFromDate on doc the caller does not own → reject (no batch commit)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: OTHER_TRAINER_UID,
        seriesId: "ser-1",
      }),
    );

    await expect(
      deleteAssignment("asg-x", { cascadeFromDate: "2026-06-01" }),
    ).rejects.toThrow(/not your assignment/i);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("cascade query includes status='scheduled' filter (past started/completed excluded)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: ALLOWED_UID,
        seriesId: "ser-1",
      }),
    );
    const batchDelete = jest.fn();
    mockBatch.mockImplementation(() => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      delete: batchDelete,
      commit: mockBatchCommit,
    }));
    mockBatchCommit.mockResolvedValue(undefined);
    mockQueryGet.mockResolvedValue({
      size: 0,
      docs: [],
    });

    await deleteAssignment("asg-1", { cascadeFromDate: "2026-06-01" });

    // The cascade query must filter on all three predicates.
    expect(mockWhere).toHaveBeenCalledWith("seriesId", "==", "ser-1");
    expect(mockWhere).toHaveBeenCalledWith(
      "scheduledFor",
      ">=",
      "2026-06-01",
    );
    expect(mockWhere).toHaveBeenCalledWith("status", "==", "scheduled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listAssignmentsForClientWeek + listAssignmentsForTrainerDay (index queries)
// ─────────────────────────────────────────────────────────────────────────────

describe("listAssignmentsForClientWeek", () => {
  it("queries with the (clientId, scheduledFor) compound index (index #3)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue({
      docs: [
        { id: "asg-1", data: () => ({ scheduledFor: "2026-06-01" }) },
        { id: "asg-2", data: () => ({ scheduledFor: "2026-06-03" }) },
      ],
    });

    const result = await listAssignmentsForClientWeek(
      CLIENT_UID,
      "2026-06-01",
    );

    expect(mockWhere).toHaveBeenCalledWith("clientId", "==", CLIENT_UID);
    // The function must also bound scheduledFor between weekStart and weekStart+6d.
    expect(mockWhere).toHaveBeenCalledWith(
      "scheduledFor",
      ">=",
      "2026-06-01",
    );
    expect(mockWhere).toHaveBeenCalledWith(
      "scheduledFor",
      "<=",
      "2026-06-07",
    );
    expect(result).toHaveLength(2);
  });
});

describe("listAssignmentsForTrainerDay", () => {
  it("queries with the (trainerId, scheduledFor) compound index (index #4)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockQueryGet.mockResolvedValue({
      docs: [{ id: "asg-1", data: () => ({ scheduledFor: "2026-06-01" }) }],
    });

    const result = await listAssignmentsForTrainerDay("2026-06-01");

    expect(mockWhere).toHaveBeenCalledWith(
      "trainerId",
      "==",
      ALLOWED_UID,
    );
    expect(mockWhere).toHaveBeenCalledWith(
      "scheduledFor",
      "==",
      "2026-06-01",
    );
    expect(result).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC#2 dedicated acceptance flow — name the test verbatim for CI log clarity
// ─────────────────────────────────────────────────────────────────────────────

describe("SC#2 acceptance — bulkAssignTemplate writes 10 clients in a single atomic WriteBatch", () => {
  it("SC#2: 10 clients → 10 set() in 1 batch with 1 commit (atomic fan-out)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    const clientIds = Array.from({ length: 10 }, (_, i) => `client-${i}`);
    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds,
      scheduledFor: "2026-06-01",
    });

    expect(result.ids).toHaveLength(10);
    // Single batch instance (not 10 — that would be Promise.all, the Pitfall 5
    // anti-pattern).
    expect(mockBatch).toHaveBeenCalledTimes(1);
    // 10 docs scheduled in the batch.
    expect(mockBatchSet).toHaveBeenCalledTimes(10);
    // Exactly one atomic commit.
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    // The template was read EXACTLY ONCE (not 10 times — server-side
    // denormalization invariant).
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
