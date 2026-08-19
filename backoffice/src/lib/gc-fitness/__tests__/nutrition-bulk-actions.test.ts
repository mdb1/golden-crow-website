// nutrition-bulk-actions.test.ts
// The Server Actions behind "asignar una plantilla a varios clientes" (#927).
//
// What these lock, in order of how expensive the bug would be:
//   1. ONE BATCH PER CLIENT — a client's assign and the trims it forces land together, or
//      that client ends up with a day that has two plans or none;
//   2. one client's failure does NOT sink the others, and the failures are REPORTED (a
//      silent half-bulk is a coach clicking again and double-assigning everyone);
//   3. a uid that is not on the caller's roster is refused HERE, not mid-write by the
//      rules;
//   4. every plan written carries the same `bulkId` — that is what folds N audit rows
//      into one, and it is written on the CREATE where the rules admit extra keys;
//   5. every client gets their OWN coach_activity event carrying a shared `groupId` —
//      "Mi Actividad" filters by client server-side, so a single event covering fifteen
//      people would vanish from every per-client view.

const mockGetCurrentTrainer = jest.fn();
const mockUsersGet = jest.fn();
const mockPlansGet = jest.fn();

const batchSet = jest.fn();
const batchUpdate = jest.fn();
const batchCommit = jest.fn().mockResolvedValue(undefined);
const recordCoachActivityEvent = jest.fn().mockResolvedValue(undefined);

/** Each `db.batch()` hands back a fresh recorder, so per-client atomicity is observable. */
const batches: Array<{ sets: unknown[][]; updates: unknown[][] }> = [];

const mockCollection = jest.fn((name: string) => {
  if (name === "users") {
    return { where: () => ({ get: mockUsersGet }) };
  }
  if (name === "nutrition_plans") {
    return {
      doc: (id: string) => ({ __planId: id }),
      where: () => ({ limit: () => ({ get: mockPlansGet }) }),
    };
  }
  return { doc: () => ({ set: jest.fn(), get: jest.fn() }) };
});

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({
    collection: mockCollection,
    batch: () => {
      const record = { sets: [] as unknown[][], updates: [] as unknown[][] };
      batches.push(record);
      return {
        set: (...args: unknown[]) => {
          record.sets.push(args);
          batchSet(...args);
        },
        update: (...args: unknown[]) => {
          record.updates.push(args);
          batchUpdate(...args);
        },
        commit: () => batchCommit(record),
      };
    },
  }),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__serverTimestamp__" },
}));

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

jest.mock("../coach-activity-log", () => ({
  recordCoachActivityEvent: (...args: unknown[]) => recordCoachActivityEvent(...args),
  nutritionPlanEvent: (args: Record<string, unknown>) => ({
    eventId: `nut:${args.planId}`,
    ...args,
  }),
}));

import {
  assignNutritionTemplateToClients,
  listNutritionBulkClients,
  previewNutritionBulkAssign,
} from "../nutrition-bulk-actions";

const TRAINER = "trainer-1";

function userDoc(id: string, displayName: string) {
  return { id, data: () => ({ displayName, email: `${id}@example.com`, coachId: TRAINER }) };
}

function planDoc(id: string, clientId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    data: () => ({
      clientId,
      trainerId: TRAINER,
      source: "coach",
      name: { es: "Volumen", en: "Bulk" },
      startsOn: "2026-08-01",
      endsOn: null,
      targets: { kcal: 2600 },
      meals: [],
      ...over,
    }),
  };
}

/** The body the dialog submits — a template, already flattened. */
function body(over: Record<string, unknown> = {}) {
  return {
    name: { es: "Definición", en: "Cut" },
    templateId: "tpl-def",
    startsOn: "2026-09-01",
    endsOn: null,
    targets: { kcal: 2000, proteinG: 160, carbsG: null, fatG: null },
    meals: [
      {
        mealId: "meal-breakfast",
        name: { es: "Desayuno", en: "Breakfast" },
        moment: "breakfast",
        targets: { kcal: 500 },
        options: [],
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  batches.length = 0;
  mockGetCurrentTrainer.mockResolvedValue({ uid: TRAINER });
  mockUsersGet.mockResolvedValue({
    docs: [userDoc("ana", "Ana"), userDoc("bruno", "Bruno"), userDoc("carla", "Carla")],
  });
  mockPlansGet.mockResolvedValue({ size: 0, docs: [] });
  batchCommit.mockResolvedValue(undefined);
});

describe("listNutritionBulkClients", () => {
  it("returns the caller's roster sorted by name", async () => {
    const rows = await listNutritionBulkClients();
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bruno", "Carla"]);
  });
});

describe("previewNutritionBulkAssign", () => {
  it("reports per client, not as one aggregate sentence", async () => {
    mockPlansGet.mockResolvedValue({
      size: 1,
      docs: [planDoc("plan-ana", "ana")],
    });

    const { rows, summary } = await previewNutritionBulkAssign({
      clientIds: ["ana", "bruno"],
      startsOn: "2026-09-01",
      endsOn: null,
    });

    const ana = rows.find((r) => r.clientId === "ana")!;
    const bruno = rows.find((r) => r.clientId === "bruno")!;
    expect(ana.notices).toHaveLength(1);
    expect(ana.notices[0]).toMatchObject({ kind: "trim", date: "2026-08-31" });
    expect(bruno.notices).toEqual([]);
    expect(summary).toMatchObject({ assignable: 2, affected: 1, untouched: 1, trimmed: 1 });
  });

  it("marks a uid that is not on the roster as blocked instead of previewing it", async () => {
    const { rows, summary } = await previewNutritionBulkAssign({
      clientIds: ["ana", "someone-elses-client"],
      startsOn: "2026-09-01",
      endsOn: null,
    });

    expect(rows.find((r) => r.clientId === "someone-elses-client")!.blockedReason).toBe(
      "notOnRoster",
    );
    expect(summary.blocked).toBe(1);
    expect(summary.assignable).toBe(1);
  });

  it("does not read plans at all when nothing is selected", async () => {
    const { rows } = await previewNutritionBulkAssign({
      clientIds: [],
      startsOn: "2026-09-01",
      endsOn: null,
    });
    expect(rows).toEqual([]);
    expect(mockPlansGet).not.toHaveBeenCalled();
  });
});

describe("assignNutritionTemplateToClients", () => {
  it("writes one batch per client, each holding that client's create", async () => {
    const result = await assignNutritionTemplateToClients({
      ...body(),
      clientIds: ["ana", "bruno"],
    });

    expect(result.assigned).toHaveLength(2);
    expect(result.failed).toEqual([]);
    expect(batches).toHaveLength(2);
    for (const batch of batches) expect(batch.sets).toHaveLength(1);
  });

  it("keeps a client's trim in the SAME batch as their new phase", async () => {
    // The invariant this whole feature is built around: a trim that lands without its new
    // phase (or the other way round) leaves a day with two plans or none, and the apps
    // resolve it silently rather than failing.
    mockPlansGet.mockResolvedValue({ size: 1, docs: [planDoc("plan-ana", "ana")] });

    await assignNutritionTemplateToClients({ ...body(), clientIds: ["ana"] });

    expect(batches).toHaveLength(1);
    expect(batches[0]!.sets).toHaveLength(1);
    expect(batches[0]!.updates).toHaveLength(1);
    expect(batches[0]!.updates[0]![1]).toMatchObject({ endsOn: "2026-08-31" });
  });

  it("stamps the same bulkId on every plan it writes", async () => {
    const result = await assignNutritionTemplateToClients({
      ...body(),
      clientIds: ["ana", "bruno", "carla"],
    });

    const written = batchSet.mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(written).toHaveLength(3);
    expect(new Set(written.map((doc) => doc.bulkId))).toEqual(new Set([result.bulkId]));
  });

  it("takes trainerId from the session and never from the payload", async () => {
    await assignNutritionTemplateToClients({
      ...body(),
      trainerId: "attacker",
      clientIds: ["ana"],
    });

    expect(batchSet.mock.calls[0]![1]).toMatchObject({ trainerId: TRAINER, source: "coach" });
  });

  it("ships endsOn: null as a PRESENT key", async () => {
    // Firestore cannot match a missing field, and open-ended is the common case — that
    // combination is how #400 made client-created habits invisible.
    await assignNutritionTemplateToClients({ ...body(), clientIds: ["ana"] });
    const written = batchSet.mock.calls[0]![1] as Record<string, unknown>;
    expect("endsOn" in written).toBe(true);
    expect(written.endsOn).toBeNull();
  });

  it("refuses a uid outside the roster without touching the others", async () => {
    const result = await assignNutritionTemplateToClients({
      ...body(),
      clientIds: ["ana", "someone-elses-client"],
    });

    expect(result.assigned.map((a) => a.clientId)).toEqual(["ana"]);
    expect(result.failed).toEqual([
      { clientId: "someone-elses-client", reason: "notOnRoster" },
    ]);
    expect(batchSet).toHaveBeenCalledTimes(1);
  });

  it("keeps going — and REPORTS — when one client's write fails", async () => {
    batchCommit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("permission-denied"))
      .mockResolvedValueOnce(undefined);

    const result = await assignNutritionTemplateToClients({
      ...body(),
      clientIds: ["ana", "bruno", "carla"],
    });

    expect(result.assigned.map((a) => a.clientId)).toEqual(["ana", "carla"]);
    expect(result.failed).toEqual([{ clientId: "bruno", reason: "writeFailed" }]);
  });

  it("emits one activity event per client, all sharing the assign groupId", async () => {
    const result = await assignNutritionTemplateToClients({
      ...body(),
      clientIds: ["ana", "bruno"],
    });

    const events = recordCoachActivityEvent.mock.calls.map(
      (call) => call[1] as Record<string, unknown>,
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.clientId)).toEqual(["ana", "bruno"]);
    expect(events.every((e) => e.groupId === result.bulkId)).toBe(true);
  });

  it("puts the trims in a SEPARATE group from the assigns", async () => {
    // Folding them together would render "Nutrición asignada ×3" for 2 assigns and 1 trim
    // — a number that matches no fact.
    mockPlansGet.mockResolvedValue({ size: 1, docs: [planDoc("plan-ana", "ana")] });

    const result = await assignNutritionTemplateToClients({
      ...body(),
      clientIds: ["ana"],
    });

    const events = recordCoachActivityEvent.mock.calls.map(
      (call) => call[1] as Record<string, unknown>,
    );
    expect(events).toHaveLength(2);
    expect(events[0]!.groupId).toBe(result.bulkId);
    expect(events[1]!.groupId).toBe(`${result.bulkId}:trimmed`);
    expect(events[1]!.change).toBe("trimmed");
  });

  it("rejects the same client twice rather than assigning and self-trimming", async () => {
    await expect(
      assignNutritionTemplateToClients({ ...body(), clientIds: ["ana", "ana"] }),
    ).rejects.toThrow();
    expect(batchSet).not.toHaveBeenCalled();
  });

  it("rejects an empty selection", async () => {
    await expect(
      assignNutritionTemplateToClients({ ...body(), clientIds: [] }),
    ).rejects.toThrow();
  });

  it("rejects a window that ends before it starts", async () => {
    await expect(
      assignNutritionTemplateToClients({
        ...body({ startsOn: "2026-09-10", endsOn: "2026-09-01" }),
        clientIds: ["ana"],
      }),
    ).rejects.toThrow();
  });

  it("never lets undefined reach a write — the Admin SDK throws on it here", async () => {
    await assignNutritionTemplateToClients({
      ...body({ templateId: undefined }),
      clientIds: ["ana"],
    });
    const written = batchSet.mock.calls[0]![1] as Record<string, unknown>;
    for (const [key, value] of Object.entries(written)) {
      expect([key, value]).not.toEqual([key, undefined]);
    }
    expect(written.templateId).toBeNull();
  });
});
