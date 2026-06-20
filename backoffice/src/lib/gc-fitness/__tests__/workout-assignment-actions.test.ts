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

// `resolveExerciseDocsById` reads exercise docs that templateSnapshotForAssignment
// uses to enrich each exercise's localized name.
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
  templateSnapshot?: object;
}) {
  const data: Record<string, unknown> = {
    trainerId: opts.trainerId ?? ALLOWED_UID,
    clientId: opts.clientId ?? CLIENT_UID,
    scheduledFor: opts.scheduledFor ?? "2026-06-01",
    templateId: "tpl-abc",
    templateSnapshot: opts.templateSnapshot ?? VALID_TEMPLATE,
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

  it("applies a reps→time metric override (metric + per-set + fallback duration) into the snapshot", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockSet.mockResolvedValue(undefined);

    await assignTemplate({
      templateId: "tpl-abc",
      clientId: CLIENT_UID,
      scheduledFor: "2026-06-01",
      exerciseOverrides: [
        {
          index: 0,
          metric: "time",
          durationBySetSeconds: [30, 30, 45],
          durationSeconds: 30,
        },
      ],
    });

    const ex = mockSet.mock.calls[0][0].templateSnapshot.exercises[0];
    expect(ex.metric).toBe("time");
    expect(ex.durationBySetSeconds).toEqual([30, 30, 45]);
    expect(ex.durationSeconds).toBe(30);
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

  // ───────────────────────────────────────────────────────────────────────────
  // 260612-e9t (#175): bulk RECURRENCE
  // ───────────────────────────────────────────────────────────────────────────

  it("no-recurrence path is unchanged: 1 doc/client, no seriesId/recurrence", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds: ["c1", "c2", "c3"],
      scheduledFor: "2026-06-01",
    });

    expect(result.ids).toHaveLength(3);
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    // No seriesId / recurrence on any doc on the single-date path.
    for (const call of mockBatchSet.mock.calls) {
      const doc = call[1];
      expect(doc.seriesId).toBeUndefined();
      expect(doc.recurrence).toBeUndefined();
      expect(doc.scheduledFor).toBe("2026-06-01");
    }
  });

  it("single-kind recurrence behaves like the no-recurrence path", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds: ["c1", "c2"],
      scheduledFor: "2026-06-01",
      recurrence: { kind: "single" },
    });

    expect(result.ids).toHaveLength(2);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    for (const call of mockBatchSet.mock.calls) {
      expect(call[1].seriesId).toBeUndefined();
      expect(call[1].recurrence).toBeUndefined();
    }
  });

  it("weekly recurrence expands to one doc per (client × matching date) with a per-client seriesId", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    // 2026-06-01 is a Monday (weekday 1). Window 2026-06-01..2026-06-22 has
    // 4 Mondays: 06-01, 06-08, 06-15, 06-22.
    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds: ["c1", "c2"],
      scheduledFor: "2026-06-01",
      recurrence: { kind: "weekly", weekday: 1 },
      endDate: "2026-06-22",
    });

    // 2 clients × 4 Mondays = 8 docs.
    expect(result.ids).toHaveLength(8);
    expect(mockBatchSet).toHaveBeenCalledTimes(8);

    // Each doc carries a recurrence rule + a seriesId; the seriesId is shared
    // WITHIN a client's series but DIFFERS across clients.
    const byClient = new Map<string, Set<string>>();
    const expectedDates = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"];
    const datesByClient = new Map<string, string[]>();
    for (const call of mockBatchSet.mock.calls) {
      const doc = call[1];
      expect(doc.recurrence).toEqual({ kind: "weekly", weekday: 1 });
      expect(typeof doc.seriesId).toBe("string");
      const set = byClient.get(doc.clientId) ?? new Set<string>();
      set.add(doc.seriesId);
      byClient.set(doc.clientId, set);
      const dates = datesByClient.get(doc.clientId) ?? [];
      dates.push(doc.scheduledFor);
      datesByClient.set(doc.clientId, dates);
    }
    // One seriesId per client (shared across that client's 4 docs).
    expect(byClient.get("c1")!.size).toBe(1);
    expect(byClient.get("c2")!.size).toBe(1);
    // Different clients get different series.
    const s1 = [...byClient.get("c1")!][0];
    const s2 = [...byClient.get("c2")!][0];
    expect(s1).not.toBe(s2);
    // Expected dates per client.
    expect(datesByClient.get("c1")!.sort()).toEqual(expectedDates);
    expect(datesByClient.get("c2")!.sort()).toEqual(expectedDates);
  });

  it("chunks writes across multiple batches when clients × dates × 3 ops > 500", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    // 10 clients × daily over 2026-06-01..2026-06-30 = 30 dates = 300 docs.
    // 300 docs × 3 ops = 900 ops > 500 → must commit across ⌈300/166⌉ = 2 batches.
    const clientIds = Array.from({ length: 10 }, (_, i) => `client-${i}`);
    const result = await bulkAssignTemplate({
      templateId: "tpl-abc",
      clientIds,
      scheduledFor: "2026-06-01",
      recurrence: { kind: "daily" },
      endDate: "2026-06-30",
    });

    expect(result.ids).toHaveLength(300);
    expect(mockBatchSet).toHaveBeenCalledTimes(300);
    // 300 set ops / floor(500/3)=166 per batch → 2 commits.
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects an over-cap recurring submit BEFORE any commit (total-ops guard)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));
    mockBatchCommit.mockResolvedValue(undefined);

    // 100 clients × daily-for-a-year (capped at 104 occurrences) = 10400 docs,
    // well over MAX_TOTAL_BULK_RECURRING_DOCS (5000) → reject, no writes.
    const clientIds = Array.from({ length: 100 }, (_, i) => `c-${i}`);
    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds,
        scheduledFor: "2026-06-01",
        recurrence: { kind: "daily" },
        // No endDate → rolling horizon, capped at 104 occurrences per client.
      }),
    ).rejects.toThrow(/exceeds the 5000 limit/i);
    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("rejects endDate before scheduledFor at Zod parse time", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(fakeTemplateSnap({ exists: true }));

    await expect(
      bulkAssignTemplate({
        templateId: "tpl-abc",
        clientIds: ["c1"],
        scheduledFor: "2026-06-10",
        recurrence: { kind: "daily" },
        endDate: "2026-06-01",
      }),
    ).rejects.toThrow();
    expect(mockBatchSet).not.toHaveBeenCalled();
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

  it("empty weight inputs stay weight-based as 0kg unless noWeight is explicit", async () => {
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
          repsBySet: [8, 8],
          weightBySetKg: [],
          rest_seconds: 60,
          notes: "",
          noWeight: false,
        },
      ],
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.templateSnapshot.exercises[0].weightBySetKg).toEqual([0, 0]);
    expect(patch.templateSnapshot.exercises[0].hasExplicitNoWeightPrescription).toBeUndefined();
  });

  // #215 — row-based payload (add/remove exercises). Rows pair with the
  // snapshot by exerciseId (NOT position), localized names and media survive
  // for existing exercises, and brand-new rows get media from previewUrl.
  it("row payload: removes, keeps and adds exercises pairing by exerciseId", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens({ role: "trainer" }));
    mockGet.mockResolvedValue(
      fakeAssignmentSnap({
        exists: true,
        trainerId: ALLOWED_UID,
        templateSnapshot: {
          name: { en: "Push Day", es: "Día de Empuje" },
          exercises: [
            {
              exerciseId: "ex-1",
              name: { en: "Bench Press", es: "Press de Banca" },
              gifUrl: "gif-bench",
              repsBySet: [10, 10],
              weightBySetKg: [40, 40],
              rest_seconds: 90,
            },
            {
              exerciseId: "ex-2",
              name: { en: "Dips", es: "Fondos" },
              gifUrl: "gif-dips",
              imageUrl: "img-dips",
              repsBySet: [12],
              weightBySetKg: [],
              rest_seconds: 60,
            },
          ],
        },
      }),
    );
    mockBatchCommit.mockResolvedValue(undefined);

    // The coach removed ex-1, kept ex-2 (dialog only knows the single display
    // string → es comes back empty) and added ex-3 from the library picker.
    await editAssignmentExercises("asg-abc", {
      scope: "one",
      exercises: [
        {
          exerciseId: "ex-2",
          name: { en: "Dips", es: "" },
          previewUrl: "gif-dips",
          repsBySet: [12, 12],
          weightBySetKg: [5, 5],
          rest_seconds: 75,
          transition_rest_seconds: 60,
          notes: "",
          metric: "reps",
          durationBySetSeconds: [],
          durationSeconds: null,
          supersetGroup: null,
          noWeight: false,
        },
        {
          exerciseId: "ex-3",
          name: { en: "Push Up", es: "Flexiones" },
          previewUrl: "gif-pushup",
          repsBySet: [15],
          weightBySetKg: [],
          rest_seconds: 60,
          transition_rest_seconds: 60,
          notes: "to failure",
          metric: "reps",
          durationBySetSeconds: [],
          durationSeconds: null,
          supersetGroup: null,
          noWeight: true,
        },
      ],
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    const exercises = mockBatchUpdate.mock.calls[0][1].templateSnapshot
      .exercises as Array<Record<string, unknown>>;
    expect(exercises).toHaveLength(2);

    // ex-1 is gone; ex-2 paired by id (not position 0 of the old array).
    expect(exercises[0].exerciseId).toBe("ex-2");
    // es name preserved from the snapshot despite the blank in the payload.
    expect(exercises[0].name).toEqual({ en: "Dips", es: "Fondos" });
    // Existing exercise keeps its own media — not ex-1's, not the collapsed previewUrl.
    expect(exercises[0].gifUrl).toBe("gif-dips");
    expect(exercises[0].imageUrl).toBe("img-dips");
    expect(exercises[0].repsBySet).toEqual([12, 12]);
    expect(exercises[0].weightBySetKg).toEqual([5, 5]);
    expect(exercises[0].rest_seconds).toBe(75);
    expect(exercises[0].hasExplicitNoWeightPrescription).toBeUndefined();

    // New exercise: media seeded from previewUrl, no-weight flag set.
    expect(exercises[1].exerciseId).toBe("ex-3");
    expect(exercises[1].name).toEqual({ en: "Push Up", es: "Flexiones" });
    expect(exercises[1].gifUrl).toBe("gif-pushup");
    expect(exercises[1].repsBySet).toEqual([15]);
    expect(exercises[1].weightBySetKg).toEqual([]);
    expect(exercises[1].hasExplicitNoWeightPrescription).toBe(true);
    expect(exercises[1].notes).toBe("to failure");
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
    // One template read plus one exercise enrichment read for VALID_TEMPLATE's
    // single exercise. The template is still not read once per client.
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
