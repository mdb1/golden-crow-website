// __tests__/activity-feed-actions.test.ts
//
// The admin Monitoring & Observability reader (issue #671, successor of the
// #312 audit reader). Covers the admin gate, the four-source merge, entity-name
// hydration for the fields the capture trigger elides, admin-safe href
// resolution, the low-signal filter, and per-source fail-soft.
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

import { listActivityFeed } from "@/lib/gc-fitness/activity-feed-actions";
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

/** Per-collection query results; replace with a throwing thunk to test fail-soft. */
let queryGet: Record<string, () => Promise<{ docs: DocLike[] }>>;
/** Per-collection point-read store (users + hydrated entities). */
let docsByCollection: Record<string, Map<string, Record<string, unknown>>>;

const UUID = "010cc42d-5608-42f1-bd9d-2a150f22cfbc";

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCurrentAdmin.mockResolvedValue(ADMIN);

  queryGet = {};
  docsByCollection = {
    users: new Map<string, Record<string, unknown>>([
      ["coach1", { displayName: "Coach One", email: "coach1@x.com", role: "trainer" }],
      ["client1", { displayName: "Client One", email: "c1@x.com", role: "client", coachId: "coach1" }],
      ["solo1", { displayName: "Solo User", email: "solo@x.com", role: "client" }],
      ["admin1", { displayName: "Admin", email: "admin@x.com", role: "trainer" }],
    ]),
    workout_templates: new Map<string, Record<string, unknown>>([
      ["tpl-1", { name: { en: "Full Body A", es: "Full Body A" } }],
    ]),
    workout_logs: new Map<string, Record<string, unknown>>([
      ["log-1", { templateSnapshot: { name: { es: "Pierna" } } }],
    ]),
  };

  mockCollection.mockImplementation((name: string) => {
    const builder: Record<string, unknown> = {
      orderBy: () => builder,
      where: () => builder,
      limit: () => builder,
      get: () => (queryGet[name] ? queryGet[name]() : Promise.resolve({ docs: [] })),
      // Point reads only — never getAll/batchGet (unreliable on Vercel).
      doc: (id: string) => ({
        id,
        get: async () => ({
          id,
          exists: docsByCollection[name]?.has(id) ?? false,
          data: () => docsByCollection[name]?.get(id) ?? {},
        }),
      }),
    };
    return builder;
  });
});

describe("admin gate", () => {
  it("rejects a non-admin before touching Firestore", async () => {
    mockedGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(listActivityFeed()).rejects.toThrow("Forbidden");
    expect(mockCollection).not.toHaveBeenCalled();
  });
});

describe("workout finished", () => {
  beforeEach(() => {
    queryGet.audit_log = async () => ({
      docs: [
        doc("a-writeback", {
          collection: "workout_assignments",
          docId: `asg-solo1-20260821-self-DF2F1298-1535-40FE-9499-DFA0847D02DC`,
          op: "update",
          changedFields: ["templateSnapshot", "updatedAt"],
          changedFieldCount: 2,
          before: { templateSnapshot: "[omitted: 2107 chars]" },
          after: { templateSnapshot: "[omitted: 2107 chars]", templateId: "tpl-1" },
          trainerId: "solo1",
          clientId: "solo1",
          occurredAt: ts("2026-07-31T20:37:02.331Z"),
        }),
        doc("a-log", {
          collection: "workout_logs",
          docId: "log-1",
          op: "create",
          changedFields: ["status", "duration_seconds", "total_volume_kg"],
          changedFieldCount: 3,
          after: {
            status: "completed",
            duration_seconds: 3743,
            total_volume_kg: 6410,
            templateSnapshot: "[omitted: 2107 chars]",
          },
          trainerId: "solo1",
          clientId: "solo1",
          occurredAt: ts("2026-07-31T20:37:00.497Z"),
        }),
      ],
    });
  });

  it("hydrates the workout name the capture elided and links to the log detail", async () => {
    const events = await listActivityFeed();
    expect(events).toHaveLength(1); // the write-back folded into the finish
    const [finish] = events;

    expect(finish.title).toBe("Terminó un workout");
    expect(finish.subject).toBe("Pierna"); // from workout_logs.templateSnapshot.name
    expect(finish.actor?.name).toBe("Solo User");
    expect(finish.meta).toContain("1 h 2 min");
    expect(finish.notes).toEqual(["actualizó la rutina"]);
    // Coach-less user → they are their own coach-of-record in the admin routes.
    expect(finish.href).toBe(
      "/gc-fitness/admin/coaches/solo1/clients/solo1/workouts/log-1",
    );
  });
});

describe("a coached client's workout", () => {
  beforeEach(() => {
    queryGet.audit_log = async () => ({
      docs: [
        doc("a-log", {
          collection: "workout_logs",
          docId: "log-2",
          op: "create",
          changedFields: ["status", "duration_seconds"],
          changedFieldCount: 2,
          after: { status: "completed", duration_seconds: 2040 },
          // Coach-owned doc: `trainerId` is the COACH, `clientId` the athlete.
          trainerId: "coach1",
          clientId: "client1",
          occurredAt: ts("2026-07-29T23:24:00.000Z"),
        }),
      ],
    });
  });

  it("says the CLIENT finished it, and does not repeat them as the target", async () => {
    const [finish] = await listActivityFeed();
    expect(finish.title).toBe("Terminó un workout");
    // The regression: this read "Coach One terminó un workout … → Client One".
    expect(finish.actor?.name).toBe("Client One");
    expect(finish.client).toBeNull();
    expect(finish.href).toBe(
      "/gc-fitness/admin/coaches/coach1/clients/client1/workouts/log-2",
    );
  });
});

describe("assignments, habits and accounts", () => {
  beforeEach(() => {
    queryGet.audit_log = async () => ({
      docs: [
        doc("a-assign", {
          collection: "workout_assignments",
          docId: `asg-client1-20260727-${UUID}`,
          op: "create",
          changedFields: ["recurrence", "scheduledFor"],
          changedFieldCount: 2,
          after: {
            templateId: "tpl-1",
            scheduledFor: "2026-07-27",
            recurrence: { kind: "weekly", weekday: 1 },
          },
          trainerId: "coach1",
          clientId: "client1",
          occurredAt: ts("2026-07-27T10:00:00.000Z"),
        }),
        doc("a-habit", {
          collection: "habits",
          docId: "client-habit-1",
          op: "create",
          changedFields: ["name"],
          changedFieldCount: 1,
          after: {
            name: { en: "Eat", es: "Comer" },
            clientOwned: true,
            scheduleCadence: "daily",
          },
          trainerId: "solo1",
          clientId: "solo1",
          occurredAt: ts("2026-07-26T10:00:00.000Z"),
        }),
        doc("a-user", {
          collection: "users",
          docId: "client1",
          op: "update",
          changedFields: ["entitlement"],
          changedFieldCount: 1,
          before: { entitlement: { tier: "free" } },
          after: { entitlement: { tier: "premium", source: "revenuecat" } },
          occurredAt: ts("2026-07-25T10:00:00.000Z"),
        }),
        doc("a-noise", {
          collection: "users",
          docId: "client1",
          op: "update",
          changedFields: ["updatedAt"],
          changedFieldCount: 1,
          before: { updatedAt: "a" },
          after: { updatedAt: "b" },
          occurredAt: ts("2026-07-24T10:00:00.000Z"),
        }),
      ],
    });
  });

  it("names the assigned workout, the coach and the client, newest first", async () => {
    const events = await listActivityFeed();
    expect(events.map((e) => e.id)).toEqual([
      "audit_log:a-assign",
      "audit_log:a-habit",
      "audit_log:a-user",
    ]);

    const assign = events[0];
    expect(assign.title).toBe("Asignó un workout");
    expect(assign.subject).toBe("Full Body A"); // hydrated via templateId
    expect(assign.actor?.name).toBe("Coach One");
    expect(assign.client?.name).toBe("Client One");
    expect(assign.meta).toContain("todas las semanas (lun)");
    // Coached client → nested under their coach.
    expect(assign.href).toBe("/gc-fitness/admin/coaches/coach1/clients/client1");
  });

  it("reads the habit name + frequency straight out of the capture", async () => {
    const [, habit] = await listActivityFeed();
    expect(habit.title).toBe("Creó un hábito");
    expect(habit.subject).toBe("Comer");
    expect(habit.meta).toContain("diario");
    expect(habit.href).toBe("/gc-fitness/admin/coach-less-users/solo1");
  });

  it("hides mechanical writes unless includeLowSignal is set", async () => {
    const withNoise = await listActivityFeed({ includeLowSignal: true });
    expect(withNoise.map((e) => e.id)).toContain("audit_log:a-noise");
  });

  it("filters by category", async () => {
    const events = await listActivityFeed({ category: "habit" });
    expect(events.map((e) => e.id)).toEqual(["audit_log:a-habit"]);
  });
});

describe("other sources", () => {
  beforeEach(() => {
    queryGet.coach_activity = async () => ({
      docs: [
        doc("ca1", {
          trainerId: "coach1",
          kind: "exercise",
          title: "Ejercicio creado: Sentadilla",
          clientId: null,
          occurredAt: ts("2026-07-20T10:00:00.000Z"),
          deleted: false,
        }),
      ],
    });
    queryGet.admin_operations = async () => ({
      docs: [
        doc("op1", {
          actorUid: "admin1",
          kind: "delete_client_cascade",
          mode: "execute",
          targetUid: "client1",
          status: "success",
          summary: { totalApprox: 12 },
          createdAt: ts("2026-07-19T10:00:00.000Z"),
        }),
      ],
    });
    queryGet.progress_photos = async () => ({
      docs: [
        doc("p1", { clientId: "solo1", setId: "s1", angle: "front", createdAt: ts("2026-07-18T10:00:00.000Z") }),
        doc("p2", { clientId: "solo1", setId: "s1", angle: "side", createdAt: ts("2026-07-18T10:00:01.000Z") }),
      ],
    });
  });

  it("rewrites a coach_activity title as an actor-first verb phrase + entity", async () => {
    const events = await listActivityFeed({ source: "coach_activity" });
    expect(events).toHaveLength(1);
    // Stored noun-first ("Ejercicio creado: Sentadilla") — unreadable after an
    // actor name, so the verb comes from the kind and the name from the title.
    expect(events[0].title).toBe("Creó un ejercicio");
    expect(events[0].subject).toBe("Sentadilla");
    expect(events[0].actor?.name).toBe("Coach One");
  });

  it("drops the subject for coach requests (the title just repeats the client)", async () => {
    queryGet.coach_activity = async () => ({
      docs: [
        doc("ca2", {
          trainerId: "coach1",
          kind: "weight_request",
          title: "Pedir peso: Client One",
          clientId: "client1",
          occurredAt: ts("2026-07-20T10:00:00.000Z"),
        }),
      ],
    });
    const [event] = await listActivityFeed({ source: "coach_activity" });
    expect(event.title).toBe("Pidió el peso");
    expect(event.subject).toBeNull();
    expect(event.client?.name).toBe("Client One");
  });

  // #682 — "cuando un coach agrega un cliente". Before this event existed the
  // action left NO coach-attributed trail: the pre-create branch writes to
  // `user_mirror` (no audit trigger watches it) and the existing-user branch
  // writes the CLIENT's own `/users` doc, so the only row that ever appeared
  // read as the client changing coach.
  it("shows a coach adding a client, with the pending email when there is no uid yet", async () => {
    queryGet.coach_activity = async () => ({
      docs: [
        doc("ca3", {
          trainerId: "coach1",
          kind: "client_added",
          title: "Cliente agregado: nuevo@x.com",
          detail: "nuevo@x.com · pre-creado (se vincula al primer ingreso)",
          clientId: null,
          pendingEmail: "nuevo@x.com",
          occurredAt: ts("2026-07-20T10:00:00.000Z"),
        }),
      ],
    });
    const [event] = await listActivityFeed({ source: "coach_activity" });
    expect(event.title).toBe("Agregó un cliente");
    expect(event.actor?.name).toBe("Coach One");
    // No uid yet — the row still names WHO was added.
    expect(event.client?.name).toBe("nuevo@x.com");
    expect(event.category).toBe("account");
    // The stored title repeats the person the client chip already names.
    expect(event.subject).toBeNull();
  });

  it("collapses a photo check-in set into one event that links to the gallery", async () => {
    const events = await listActivityFeed({ source: "progress_photos" });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Subió fotos de progreso");
    expect(events[0].occurrenceCount).toBe(2);
    expect(events[0].href).toBe("/gc-fitness/admin/coaches/solo1/clients/solo1/photos");
  });

  it("keeps admin operations, and deletionsOnly narrows to what removed data", async () => {
    const all = await listActivityFeed();
    expect(all.map((e) => e.id)).toEqual([
      "coach_activity:ca1",
      "admin_operations:op1",
      "progress_photos:p1",
    ]);

    const deletions = await listActivityFeed({ deletionsOnly: true });
    expect(deletions.map((e) => e.id)).toEqual(["admin_operations:op1"]);
    expect(deletions[0].title).toBe("Eliminó un cliente (cascada)");
  });

  it("is fail-soft: one source erroring never blanks the feed", async () => {
    queryGet.coach_activity = async () => {
      throw new Error("boom");
    };
    const events = await listActivityFeed();
    expect(events.map((e) => e.id)).toEqual([
      "admin_operations:op1",
      "progress_photos:p1",
    ]);
  });
});
