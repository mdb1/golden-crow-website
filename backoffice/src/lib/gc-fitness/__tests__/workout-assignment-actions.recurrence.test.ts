// __tests__/workout-assignment-actions.recurrence.test.ts
//
// Behavior tests for editAssignmentRecurrence — "edit the recurrence from this
// occurrence forward" (de aquí en adelante). The action deletes the future
// scheduled docs in the series and re-expands the new rule over the original
// window, leaving past/completed occurrences untouched (mirrors the
// cascade-delete semantics).
//
// All Firebase Admin + next-firebase-auth-edge surfaces are mocked — no live
// Firestore writes happen. Mock shape mirrors workout-assignment-actions.test.ts.

jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({ get: () => undefined }),
}));
jest.mock("next-firebase-auth-edge", () => ({
  getTokens: jest.fn(),
}));

const mockSet = jest.fn();
const mockGet = jest.fn();

const mockDoc = jest.fn((id?: string) => ({
  set: mockSet,
  get: mockGet,
  id: id ?? "MOCK_DOC_ID",
}));

const mockWhere = jest.fn();
const mockQueryGet = jest.fn();

const mockCollection = jest.fn(() => ({
  doc: mockDoc,
  where: mockWhere,
  get: mockQueryGet,
}));

mockWhere.mockImplementation(() => ({
  where: mockWhere,
  get: mockQueryGet,
}));

const mockBatchSet = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = jest.fn(() => ({
  set: mockBatchSet,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));

const mockGetAll = jest.fn(() => Promise.resolve([]));

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
  Timestamp: {
    fromDate: jest.fn((d: Date) => ({ __ts: d.toISOString() })),
  },
}));

import { editAssignmentRecurrence } from "../workout-assignment-actions";
import { getTokens } from "next-firebase-auth-edge";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const ALLOWED_EMAIL = "trainer@example.com";
const ALLOWED_UID = "trainer-uid-1";
const OTHER_TRAINER_UID = "trainer-uid-2";
const CLIENT_UID = "client-uid-1";

function fakeTokens() {
  return {
    token: "fake-token",
    decodedToken: { uid: ALLOWED_UID, email: ALLOWED_EMAIL, role: "trainer" },
  } as unknown as Awaited<ReturnType<typeof getTokens>>;
}

const SNAPSHOT = { name: { en: "Mobility A", es: "Movilidad A" }, exercises: [] };

function anchorSnap(opts?: {
  exists?: boolean;
  trainerId?: string;
  seriesId?: string | null;
  scheduledFor?: string;
  prescriptionUpdatedAt?: unknown;
}) {
  return {
    exists: opts?.exists ?? true,
    data: () => ({
      trainerId: opts?.trainerId ?? ALLOWED_UID,
      clientId: CLIENT_UID,
      templateId: "tpl-abc",
      templateSnapshot: SNAPSHOT,
      scheduledFor: opts?.scheduledFor ?? "2026-06-15",
      scheduledTime: "08:00",
      meetingNotes: null,
      timezone: "America/Mexico_City",
      status: "scheduled",
      seriesId: opts?.seriesId === undefined ? "ser-1" : opts.seriesId,
      prescriptionUpdatedAt: opts?.prescriptionUpdatedAt ?? "PRESCR_TS",
    }),
  };
}

// Mon/Wed/Fri series across 2026-06-10..2026-06-19, plus a past COMPLETED doc.
// (June 1 2026 is a Monday, so 15=Mon, 17=Wed, 19=Fri, 10=Wed, 12=Fri.)
function monWedFriSeriesDocs() {
  return {
    docs: [
      {
        ref: { id: "asg-past" },
        data: () => ({ scheduledFor: "2026-06-10", status: "completed" }),
      },
      {
        ref: { id: "asg-1" },
        data: () => ({ scheduledFor: "2026-06-15", status: "scheduled" }),
      },
      {
        ref: { id: "asg-2" },
        data: () => ({ scheduledFor: "2026-06-17", status: "scheduled" }),
      },
      {
        ref: { id: "asg-3" },
        data: () => ({ scheduledFor: "2026-06-19", status: "scheduled" }),
      },
    ],
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

  mockWhere.mockImplementation(() => ({ where: mockWhere, get: mockQueryGet }));
  mockBatch.mockImplementation(() => ({
    set: mockBatchSet,
    delete: mockBatchDelete,
    commit: mockBatchCommit,
  }));
  mockBatchCommit.mockResolvedValue(undefined);
});

describe("editAssignmentRecurrence", () => {
  it("deletes future scheduled docs and re-creates the new rule from the cutoff (Mon/Wed/Fri → Mon/Fri)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap());
    mockQueryGet.mockResolvedValue(monWedFriSeriesDocs());

    const result = await editAssignmentRecurrence("asg-1", {
      recurrence: { kind: "weekly_days", weekdays: [1, 5] },
    });

    // All 3 future scheduled docs replaced; the past completed doc untouched.
    expect(mockBatchDelete).toHaveBeenCalledTimes(3);
    // New Mon/Fri dates at/after the cutoff 2026-06-15: 06-15 (Mon), 06-19 (Fri).
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    const newDates = mockBatchSet.mock.calls
      .map((c) => c[1].scheduledFor)
      .sort();
    expect(newDates).toEqual(["2026-06-15", "2026-06-19"]);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    for (const call of mockBatchSet.mock.calls) {
      const doc = call[1];
      expect(doc.seriesId).toBe("ser-1");
      expect(doc.recurrence).toEqual({ kind: "weekly_days", weekdays: [1, 5] });
      expect(doc.status).toBe("scheduled");
      expect(doc.clientId).toBe(CLIENT_UID);
      // Prescription-freshness anchor carried over (NOT reset) so the client
      // keeps their per-exercise weight prefill on an unchanged prescription.
      expect(doc.prescriptionUpdatedAt).toBe("PRESCR_TS");
    }

    expect(result).toEqual({ ok: true, removedCount: 3, createdCount: 2 });
  });

  it("new doc ids follow asg-{clientId}-{YYYYMMDD}-{uuid}", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap());
    mockQueryGet.mockResolvedValue(monWedFriSeriesDocs());

    await editAssignmentRecurrence("asg-1", {
      recurrence: { kind: "weekly_days", weekdays: [1, 5] },
    });

    // The anchor read also calls doc("asg-1"); the two CREATED docs carry the
    // full asg-{clientId}-{YYYYMMDD}-{uuid} shape — match on that pattern.
    const createdIds = mockDoc.mock.calls
      .map((c) => c[0])
      .filter(
        (id): id is string =>
          typeof id === "string" && /^asg-client-uid-1-\d{8}-/.test(id),
      );
    expect(createdIds.length).toBe(2);
    for (const id of createdIds) {
      expect(id).toMatch(/^asg-client-uid-1-2026061[59]-/);
    }
  });

  it("rejects a non-recurring (single) assignment — nothing to reschedule", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap({ seriesId: null }));

    await expect(
      editAssignmentRecurrence("asg-1", {
        recurrence: { kind: "daily" },
      }),
    ).rejects.toThrow(/not recurring/i);
    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchDelete).not.toHaveBeenCalled();
  });

  it("rejects a 'single' target recurrence (UI never offers it)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap());

    await expect(
      editAssignmentRecurrence("asg-1", {
        recurrence: { kind: "single" },
      }),
    ).rejects.toThrow(/recurring cadence/i);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("rejects when the caller is not the assignment's trainer", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap({ trainerId: OTHER_TRAINER_UID }));

    await expect(
      editAssignmentRecurrence("asg-1", {
        recurrence: { kind: "daily" },
      }),
    ).rejects.toThrow(/not your assignment/i);
    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchDelete).not.toHaveBeenCalled();
  });

  it("rejects when the assignment does not exist", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap({ exists: false }));

    await expect(
      editAssignmentRecurrence("asg-missing", {
        recurrence: { kind: "daily" },
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("queries the series scoped to BOTH trainerId and seriesId (no cross-tenant fan-out)", async () => {
    mockedGetTokens.mockResolvedValue(fakeTokens());
    mockGet.mockResolvedValue(anchorSnap());
    mockQueryGet.mockResolvedValue(monWedFriSeriesDocs());

    await editAssignmentRecurrence("asg-1", {
      recurrence: { kind: "weekly_days", weekdays: [1, 5] },
    });

    expect(mockWhere).toHaveBeenCalledWith("trainerId", "==", ALLOWED_UID);
    expect(mockWhere).toHaveBeenCalledWith("seriesId", "==", "ser-1");
  });
});
