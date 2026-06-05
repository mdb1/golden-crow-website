// __tests__/workout-assignment-actions.prescription-anchor.test.ts
//
// Behavior tests for the REFINED `prescriptionUpdatedAt` bump rules
// (feat/simplify-weight-prefill):
//
//   1. editAssignmentExercises bumps the freshness anchor ONLY when the WEIGHTS
//      changed vs the assignment's current snapshot — notes-only edits must NOT
//      bump (each client keeps their own weights).
//   2. propagateTemplateToFutureAssignments takes a `pushWeights` option:
//        - false (default): preserve each client's weights, NEVER bump.
//        - true: replace weights from the template, bump ONLY where a weight
//          genuinely changed.
//
// Mirrors the Admin-SDK mock harness from workout-assignment-actions.test.ts.

jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({}),
}));
jest.mock("next-firebase-auth-edge", () => ({
  getTokens: jest.fn(),
}));
// Server-side timezone read hits cookies() — stub it to a fixed zone so the
// "future / scheduled" filters use a deterministic "today".
jest.mock("../trainer-timezone", () => ({
  getTrainerTimezone: jest.fn().mockResolvedValue("UTC"),
}));
// Coach-activity event logging is a best-effort side channel; not under test.
jest.mock("../coach-activity-log", () => ({
  recordCoachActivityEvent: jest.fn().mockResolvedValue(undefined),
  markCoachActivityDeleted: jest.fn().mockResolvedValue(undefined),
  singleAssignmentEvent: jest.fn(() => ({})),
  seriesAssignmentEvent: jest.fn(() => ({})),
}));

const mockUpdate = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn((id?: string) => ({
  set: jest.fn(),
  update: mockUpdate,
  delete: jest.fn(),
  get: mockGet,
  id: id ?? "MOCK_DOC_ID",
}));

const mockGetAll = jest.fn((...refs: Array<{ id?: string }>) =>
  Promise.resolve(
    refs.map((ref) => {
      const id = ref?.id ?? "ex-1";
      return { id, exists: false, data: () => ({ name: { en: id, es: "" } }) };
    }),
  ),
);

const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockQueryGet = jest.fn();
const mockCollection = jest.fn(() => ({
  doc: mockDoc,
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

import {
  editAssignmentExercises,
  propagateTemplateToFutureAssignments,
} from "../workout-assignment-actions";
import { getTokens } from "next-firebase-auth-edge";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const ALLOWED_EMAIL = "trainer@example.com";
const ALLOWED_UID = "trainer-uid-1";

function fakeTokens() {
  return {
    token: "fake-token",
    decodedToken: { uid: ALLOWED_UID, email: ALLOWED_EMAIL, role: "trainer" },
  } as unknown as Awaited<ReturnType<typeof getTokens>>;
}

// A snapshot with one weighted exercise. The per-exercise `name` mirrors the
// getAll-fallback so denormalization keeps the shape stable.
function snapshot(weightBySetKg: number[], notes: string | null = null) {
  return {
    trainerId: ALLOWED_UID,
    name: { en: "Push Day", es: "Día de Empuje" },
    exercises: [
      {
        exerciseId: "ex-1",
        sets: weightBySetKg.length || 2,
        reps: 10,
        repsBySet: weightBySetKg.length
          ? weightBySetKg.map(() => 10)
          : [10, 10],
        weightBySetKg,
        rest_seconds: 90,
        transition_rest_seconds: 60,
        notes,
        order: 0,
        name: { en: "ex-1", es: "" },
      },
    ],
    version: 1,
  };
}

function assignmentSnap(data: Record<string, unknown>) {
  return { exists: true, data: () => ({ trainerId: ALLOWED_UID, ...data }) };
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
  mockedGetTokens.mockResolvedValue(fakeTokens());
  mockBatchCommit.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// editAssignmentExercises — bump only on weight change
// ─────────────────────────────────────────────────────────────────────────────

describe("editAssignmentExercises — prescription anchor bump decision", () => {
  it("notes-only edit (same weights) → does NOT bump prescriptionUpdatedAt", async () => {
    mockGet.mockResolvedValue(
      assignmentSnap({ templateSnapshot: snapshot([20, 20], "old note") }),
    );

    await editAssignmentExercises("asg-1", {
      scope: "one",
      exercises: [
        {
          index: 0,
          repsBySet: [10, 10],
          weightBySetKg: [20, 20], // unchanged
          rest_seconds: 90,
          notes: "a brand new note", // only the note changed
        },
      ],
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
    expect(patch).not.toHaveProperty("prescriptionUpdatedAt");
    // The note still gets written.
    expect(patch.templateSnapshot.exercises[0].notes).toBe("a brand new note");
  });

  it("weight change → DOES bump prescriptionUpdatedAt", async () => {
    mockGet.mockResolvedValue(
      assignmentSnap({ templateSnapshot: snapshot([20, 20]) }),
    );

    await editAssignmentExercises("asg-1", {
      scope: "one",
      exercises: [
        {
          index: 0,
          repsBySet: [10, 10],
          weightBySetKg: [20, 25], // second set heavier
          rest_seconds: 90,
          notes: "",
        },
      ],
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.prescriptionUpdatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("added a set → DOES bump (more weight entries)", async () => {
    mockGet.mockResolvedValue(
      assignmentSnap({ templateSnapshot: snapshot([20, 20]) }),
    );

    await editAssignmentExercises("asg-1", {
      scope: "one",
      exercises: [
        {
          index: 0,
          repsBySet: [10, 10, 10],
          weightBySetKg: [20, 20, 20], // a third set added
          rest_seconds: 90,
          notes: "",
        },
      ],
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.prescriptionUpdatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("reps/rest-only edit (same weights) → does NOT bump", async () => {
    mockGet.mockResolvedValue(
      assignmentSnap({ templateSnapshot: snapshot([40, 40]) }),
    );

    await editAssignmentExercises("asg-1", {
      scope: "one",
      exercises: [
        {
          index: 0,
          repsBySet: [12, 12], // reps changed
          weightBySetKg: [40, 40], // weights unchanged
          rest_seconds: 120, // rest changed
          notes: "",
        },
      ],
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch).not.toHaveProperty("prescriptionUpdatedAt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// propagateTemplateToFutureAssignments — pushWeights option
// ─────────────────────────────────────────────────────────────────────────────

describe("propagateTemplateToFutureAssignments — pushWeights option", () => {
  // Template now prescribes [50, 50]; the existing assignment has the client's
  // own weights [30, 30] under the same exerciseId.
  const FUTURE = "2999-01-01"; // always after "today"

  function setupTemplateAndTarget(opts: {
    templateWeights: number[];
    assignmentWeights: number[];
    templateNote?: string | null;
    assignmentNote?: string | null;
  }) {
    // First db.get() in the action reads the TEMPLATE doc.
    mockGet.mockResolvedValue({
      exists: true,
      data: () =>
        snapshot(opts.templateWeights, opts.templateNote ?? null),
    });
    // The query for future assignments returns ONE matching target.
    mockQueryGet.mockResolvedValue({
      docs: [
        {
          ref: { id: "asg-future-1" },
          data: () => ({
            trainerId: ALLOWED_UID,
            scheduledFor: FUTURE,
            status: "scheduled",
            templateSnapshot: snapshot(
              opts.assignmentWeights,
              opts.assignmentNote ?? null,
            ),
          }),
        },
      ],
    });
  }

  it("default (pushWeights omitted) → preserves client weights + does NOT bump", async () => {
    setupTemplateAndTarget({
      templateWeights: [50, 50],
      assignmentWeights: [30, 30],
    });

    const result = await propagateTemplateToFutureAssignments("tpl-1");

    expect(result.updatedCount).toBe(1);
    const patch = mockBatchUpdate.mock.calls[0][1];
    // Client's own weights preserved (NOT replaced with the template's 50s).
    expect(patch.templateSnapshot.exercises[0].weightBySetKg).toEqual([30, 30]);
    // Anchor untouched.
    expect(patch).not.toHaveProperty("prescriptionUpdatedAt");
    expect(patch.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("pushWeights:false explicit → same as default (preserve + no bump)", async () => {
    setupTemplateAndTarget({
      templateWeights: [50, 50],
      assignmentWeights: [30, 30],
    });

    await propagateTemplateToFutureAssignments("tpl-1", {
      pushWeights: false,
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.templateSnapshot.exercises[0].weightBySetKg).toEqual([30, 30]);
    expect(patch).not.toHaveProperty("prescriptionUpdatedAt");
  });

  it("pushWeights:true with a genuine weight change → replaces weights + bumps", async () => {
    setupTemplateAndTarget({
      templateWeights: [50, 50],
      assignmentWeights: [30, 30],
    });

    await propagateTemplateToFutureAssignments("tpl-1", {
      pushWeights: true,
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    // Template weights pushed through.
    expect(patch.templateSnapshot.exercises[0].weightBySetKg).toEqual([50, 50]);
    // Weight genuinely changed (30→50) → anchor bumped.
    expect(patch.prescriptionUpdatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("pushWeights:true but weights already identical → replaces but does NOT bump", async () => {
    setupTemplateAndTarget({
      templateWeights: [50, 50],
      assignmentWeights: [50, 50], // already matches the template
      templateNote: "form cue",
    });

    await propagateTemplateToFutureAssignments("tpl-1", {
      pushWeights: true,
    });

    const patch = mockBatchUpdate.mock.calls[0][1];
    expect(patch.templateSnapshot.exercises[0].weightBySetKg).toEqual([50, 50]);
    // No weight delta → no spurious alert.
    expect(patch).not.toHaveProperty("prescriptionUpdatedAt");
  });

  it("default → structure/notes still flow through even though weights are preserved", async () => {
    setupTemplateAndTarget({
      templateWeights: [50, 50],
      assignmentWeights: [30, 30],
      templateNote: "new coach cue",
      assignmentNote: null,
    });

    await propagateTemplateToFutureAssignments("tpl-1");

    const patch = mockBatchUpdate.mock.calls[0][1];
    // Note from the template propagated.
    expect(patch.templateSnapshot.exercises[0].notes).toBe("new coach cue");
    // But weight stays the client's.
    expect(patch.templateSnapshot.exercises[0].weightBySetKg).toEqual([30, 30]);
  });
});
