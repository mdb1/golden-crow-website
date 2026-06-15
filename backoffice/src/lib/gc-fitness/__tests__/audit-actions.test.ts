// __tests__/audit-actions.test.ts
//
// Admin Monitoring & Observability readers (issue #312, PR1). Covers the
// admin gate, the merge + newest-first sort across coach_activity +
// admin_operations, action mapping, actor/client identity resolution,
// in-memory filters, deletion-history scoping, and per-source fail-soft.
//
// All Firebase Admin + auth surfaces are mocked — no live Firestore.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn(),
}));

const mockCollection = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  gcFitnessAuth: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  Timestamp: { fromDate: (d: Date) => ({ __ts: d.toISOString() }) },
  FieldValue: { serverTimestamp: () => "TS" },
}));

import {
  listAuditTimeline,
  listDeletionHistory,
} from "@/lib/gc-fitness/audit-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";

const mockedGetCurrentAdmin = getCurrentAdmin as jest.MockedFunction<
  typeof getCurrentAdmin
>;

const ADMIN = {
  uid: "admin1",
  email: "admin@x.com",
  role: "admin" as const,
  isTrainer: false,
  roles: ["admin"],
};

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

type DocLike = { id: string; data: () => Record<string, unknown> };
const doc = (id: string, data: Record<string, unknown>): DocLike => ({
  id,
  data: () => data,
});

// Per-collection query results; a test can replace an entry with a rejecting
// thunk to exercise the fail-soft path.
let queryGet: Record<string, () => Promise<{ docs: DocLike[] }>>;
const usersById = new Map<string, Record<string, unknown>>();

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCurrentAdmin.mockResolvedValue(ADMIN);

  queryGet = {
    coach_activity: async () => ({
      docs: [
        doc("exr:e1", {
          trainerId: "coach1",
          kind: "exercise",
          title: "Ejercicio creado: Sentadilla",
          clientId: null,
          occurredAt: ts("2026-06-15T10:00:00.000Z"),
          deleted: false,
        }),
        doc("asg:s1", {
          trainerId: "coach1",
          kind: "workout_assignment",
          title: "Workout asignado: Día 1",
          detail: "3 fechas",
          clientId: "client1",
          occurredAt: ts("2026-06-14T09:00:00.000Z"),
          deleted: true,
          deletedAt: ts("2026-06-15T08:00:00.000Z"),
        }),
        doc("hab:h1", {
          trainerId: "coach2",
          kind: "habit_assignment",
          title: "Hábito asignado: Agua",
          clientId: "client2",
          occurredAt: ts("2026-06-13T09:00:00.000Z"),
          deleted: false,
        }),
        doc("req:weight:client1:1", {
          trainerId: "coach1",
          kind: "weight_request",
          title: "Pedir peso: Client One",
          clientId: "client1",
          occurredAt: ts("2026-06-12T09:00:00.000Z"),
        }),
      ],
    }),
    admin_operations: async () => ({
      docs: [
        doc("op1", {
          actorUid: "admin1",
          kind: "delete_coach_cascade",
          mode: "execute",
          targetUid: "coach9",
          status: "success",
          summary: { totalApprox: 12 },
          createdAt: ts("2026-06-15T12:00:00.000Z"),
        }),
        doc("op2", {
          actorUid: "admin1",
          kind: "transfer_client",
          mode: "execute",
          targetUid: "client1",
          status: "success",
          summary: { action: "transfer_client", fromCoachId: "coach1", toCoachId: "coach2" },
          createdAt: ts("2026-06-11T12:00:00.000Z"),
        }),
        doc("op3", {
          actorUid: "admin1",
          kind: "delete_client_cascade",
          mode: "dry_run",
          targetUid: "client2",
          status: "success",
          summary: { totalApprox: 5 },
          createdAt: ts("2026-06-10T12:00:00.000Z"),
        }),
      ],
    }),
  };

  usersById.clear();
  usersById.set("coach1", { displayName: "Coach One", email: "coach1@x.com" });
  usersById.set("coach2", { displayName: "Coach Two", email: "coach2@x.com" });
  usersById.set("client1", { displayName: "Client One", email: "client1@x.com" });
  usersById.set("client2", { email: "client2@x.com" });
  usersById.set("admin1", { displayName: "Admin", email: "admin@x.com" });
  // coach9 intentionally absent (deleted) → unresolved label.

  mockCollection.mockImplementation((name: string) => {
    const builder: Record<string, unknown> = {
      orderBy: () => builder,
      where: () => builder,
      limit: () => builder,
      get: () => (queryGet[name] ? queryGet[name]() : Promise.resolve({ docs: [] })),
      // resolveUsers now point-reads each referenced user via `.doc(id).get()`
      // (no getAll/batchGet — see audit-actions.ts).
      doc: (id: string) => ({
        id,
        get: async () => ({
          id,
          exists: usersById.has(id),
          data: () => usersById.get(id) ?? {},
        }),
      }),
    };
    return builder;
  });
});

describe("listAuditTimeline", () => {
  it("rejects when the caller is not an admin (Forbidden)", async () => {
    mockedGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(listAuditTimeline()).rejects.toThrow("Forbidden");
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("merges both sources newest-first (deletions use deletedAt timing)", async () => {
    const rows = await listAuditTimeline();
    expect(rows.map((r) => r.id)).toEqual([
      "admin_operations:op1", // 06-15 12:00
      "coach_activity:exr:e1", // 06-15 10:00
      "coach_activity:asg:s1", // 06-15 08:00 (deletedAt, not the 06-14 occurredAt)
      "coach_activity:hab:h1", // 06-13
      "coach_activity:req:weight:client1:1", // 06-12
      "admin_operations:op2", // 06-11
      "admin_operations:op3", // 06-10
    ]);
  });

  it("maps actions and resolves actor + client identities", async () => {
    const rows = await listAuditTimeline();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId["coach_activity:exr:e1"].action).toBe("create");
    expect(byId["coach_activity:exr:e1"].actorName).toBe("Coach One");
    expect(byId["coach_activity:exr:e1"].actorEmail).toBe("coach1@x.com");

    expect(byId["coach_activity:asg:s1"].action).toBe("delete");
    expect(byId["coach_activity:asg:s1"].isDeletion).toBe(true);
    expect(byId["coach_activity:asg:s1"].title).toBe("Workout eliminado: Día 1");
    expect(byId["coach_activity:asg:s1"].clientLabel).toBe("client1@x.com");

    expect(byId["coach_activity:hab:h1"].action).toBe("assign");
    expect(byId["coach_activity:req:weight:client1:1"].action).toBe("request");

    expect(byId["admin_operations:op1"].action).toBe("delete");
    expect(byId["admin_operations:op1"].actorName).toBe("Admin");
    expect(byId["admin_operations:op1"].clientLabel).toBeNull(); // coach9 deleted
    expect(byId["admin_operations:op2"].action).toBe("update"); // transfer ≠ delete
    expect(byId["admin_operations:op2"].isDeletion).toBe(false);
  });

  it("filters by source", async () => {
    const rows = await listAuditTimeline({ source: "admin_operations" });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === "admin_operations")).toBe(true);
  });

  it("filters by action", async () => {
    const rows = await listAuditTimeline({ action: "delete" });
    expect(rows.map((r) => r.id).sort()).toEqual([
      "admin_operations:op1",
      "admin_operations:op3",
      "coach_activity:asg:s1",
    ]);
  });

  it("filters by actor (contains, case-insensitive)", async () => {
    const rows = await listAuditTimeline({ actorQuery: "ADMIN" });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.actorRole === "admin")).toBe(true);
  });

  it("filters by client (uid or label contains)", async () => {
    const rows = await listAuditTimeline({ clientQuery: "client1" });
    expect(rows.map((r) => r.id).sort()).toEqual([
      "admin_operations:op2",
      "coach_activity:asg:s1",
      "coach_activity:req:weight:client1:1",
    ]);
  });

  it("is fail-soft: one source erroring does not blank the feed", async () => {
    queryGet.coach_activity = async () => {
      throw new Error("boom");
    };
    const rows = await listAuditTimeline();
    expect(rows.every((r) => r.source === "admin_operations")).toBe(true);
    expect(rows).toHaveLength(3);
  });
});

describe("listDeletionHistory", () => {
  it("rejects when the caller is not an admin (Forbidden)", async () => {
    mockedGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(listDeletionHistory()).rejects.toThrow("Forbidden");
  });

  it("returns only data-removing entries (transfers excluded)", async () => {
    const rows = await listDeletionHistory();
    expect(rows.every((r) => r.isDeletion)).toBe(true);
    expect(rows.map((r) => r.id).sort()).toEqual([
      "admin_operations:op1",
      "admin_operations:op3",
      "coach_activity:asg:s1",
    ]);
  });

  it("ignores the action filter but honors source + client filters", async () => {
    const rows = await listDeletionHistory({ action: "create", source: "coach_activity" });
    expect(rows.map((r) => r.id)).toEqual(["coach_activity:asg:s1"]);
  });
});

describe("audit_log as a third source (#312 PR2)", () => {
  // Default mock has no audit_log docs; each test seeds them so the existing
  // coach_activity / admin_operations assertions above stay exact.
  beforeEach(() => {
    queryGet.audit_log = async () => ({
      docs: [
        doc("aud1", {
          collection: "exercises",
          docId: "ex-7",
          op: "create",
          changedFields: ["name", "trainerId"],
          changedFieldCount: 2,
          actorUid: null,
          clientId: null,
          occurredAt: ts("2026-06-15T13:00:00.000Z"),
        }),
        doc("aud2", {
          collection: "users",
          docId: "client1",
          op: "update",
          changedFields: ["coachId"],
          changedFieldCount: 1,
          actorUid: "admin1",
          clientId: "client1",
          occurredAt: ts("2026-06-15T11:30:00.000Z"),
        }),
        doc("aud3", {
          collection: "workout_logs",
          docId: "log-1",
          op: "delete",
          changedFields: ["sets", "status", "clientId", "totalVolumeKg", "prs"],
          changedFieldCount: 5,
          actorUid: null,
          clientId: "client2",
          occurredAt: ts("2026-06-09T10:00:00.000Z"),
        }),
      ],
    });
  });

  it("maps audit_log docs to system-actor entries with op→action + resolved identities", async () => {
    const rows = await listAuditTimeline();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId["audit_log:aud1"].source).toBe("audit_log");
    expect(byId["audit_log:aud1"].action).toBe("create");
    expect(byId["audit_log:aud1"].actorRole).toBe("system");
    expect(byId["audit_log:aud1"].title).toBe("Created exercise");
    expect(byId["audit_log:aud1"].actorUid).toBeNull();

    // Best-effort actorUid resolves to a user identity.
    expect(byId["audit_log:aud2"].action).toBe("update");
    expect(byId["audit_log:aud2"].title).toBe("Updated user");
    expect(byId["audit_log:aud2"].actorName).toBe("Admin");
    expect(byId["audit_log:aud2"].clientLabel).toBe("client1@x.com");
    expect(byId["audit_log:aud2"].detail).toBe("client1 · coachId");

    expect(byId["audit_log:aud3"].action).toBe("delete");
    expect(byId["audit_log:aud3"].isDeletion).toBe(true);
  });

  it("source=audit_log returns only audit_log entries", async () => {
    const rows = await listAuditTimeline({ source: "audit_log" });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === "audit_log")).toBe(true);
  });

  it("deletion history includes audit_log deletes alongside the others", async () => {
    const rows = await listDeletionHistory();
    expect(rows.every((r) => r.isDeletion)).toBe(true);
    expect(rows.map((r) => r.id).sort()).toEqual([
      "admin_operations:op1",
      "admin_operations:op3",
      "audit_log:aud3",
      "coach_activity:asg:s1",
    ]);
  });
});
