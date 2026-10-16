// __tests__/nutrition-actions.fake-db.test.ts
//
// Executes updateNutritionPlan / listNutritionLogsForClient (nutrition-actions.ts)
// and the template half of nutrition-library-actions.ts against the in-memory
// Firestore from fake-firestore-c, with the real auth-helpers over a mocked
// getTokens. nutrition-actions.test.ts / nutrition-library-actions.test.ts cover
// the assign path and the meal half through jest.fn chains; this suite asserts the
// STORED documents after the write (merge semantics, untouched fields, no
// `undefined` — fake-c throws on it like the Admin SDK) and tenant isolation.

import {
  FakeFirestore,
  FakeTimestamp,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import { listNutritionLogsForClient, updateNutritionPlan } from "../nutrition-actions";
import {
  createNutritionTemplate,
  duplicateNutritionTemplate,
  listNutritionTemplates,
  softDeleteNutritionTemplate,
} from "../nutrition-library-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

function expectNoUndefinedDeep(value: unknown, path = "$"): void {
  if (value === undefined) throw new Error(`undefined at ${path}`);
  if (Array.isArray(value)) value.forEach((v, i) => expectNoUndefinedDeep(v, `${path}[${i}]`));
  else if (value && typeof value === "object" && !(value instanceof FakeTimestamp)) {
    for (const [k, v] of Object.entries(value)) expectNoUndefinedDeep(v, `${path}.${k}`);
  }
}

const NAME = { en: "Cut", es: "Definición" };
const MEAL = {
  mealId: "meal-bk",
  name: { en: "Breakfast", es: "Desayuno" },
  moment: "breakfast" as const,
  targets: { kcal: 500 },
  options: [{ id: "opt-1", text: { en: "Oats", es: "Avena" } }],
};

const CREATED = new FakeTimestamp(Date.parse("2026-05-01T00:00:00Z"));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);

  db.seed("users/client-a1", { coachId: "coach-a", timezone: "America/Argentina/Buenos_Aires" });
  db.seed("users/client-b1", { coachId: "coach-b" });
  db.seed("nutrition_plans/plan-1", {
    clientId: "client-a1",
    trainerId: "coach-a",
    source: "coach",
    name: { en: "Old", es: "Viejo" },
    templateId: "nuttpl-coach-a-x",
    startsOn: "2026-06-01",
    endsOn: null,
    targets: { kcal: 2000 },
    meals: [],
    reminders: { mode: "daily", dailyTime: "08:00" },
    deleted: false,
    createdAt: CREATED,
    adherenceCache: { week: 0.8 },
  });
  db.seed("nutrition_plans/plan-b", {
    clientId: "client-b1",
    trainerId: "coach-b",
    source: "coach",
    name: { en: "B", es: "B" },
    startsOn: "2026-06-01",
    endsOn: null,
    targets: {},
    meals: [],
  });
});

afterEach(() => jest.useRealTimers());

describe("auth gate", () => {
  it.each([
    ["updateNutritionPlan", () => updateNutritionPlan("plan-1", {})],
    ["listNutritionLogsForClient", () => listNutritionLogsForClient("client-a1", "2026-06-01", "2026-06-30")],
    ["createNutritionTemplate", () => createNutritionTemplate({})],
    ["softDeleteNutritionTemplate", () => softDeleteNutritionTemplate("t")],
    ["duplicateNutritionTemplate", () => duplicateNutritionTemplate("t")],
    ["listNutritionTemplates", () => listNutritionTemplates()],
  ] as Array<[string, () => Promise<unknown>]>)("%s: signed-out / client / admin-only → Forbidden, no I/O", async (_n, call) => {
    for (const roles of [null, ["client"], ["admin"]]) {
      if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
      else signInAs("x", roles);
      await expect(call()).rejects.toThrow("Forbidden");
    }
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
  });
});

describe("updateNutritionPlan", () => {
  const edit = (over: Record<string, unknown> = {}) => ({
    clientId: "client-a1",
    name: NAME,
    templateId: "nuttpl-coach-a-x",
    startsOn: "2026-06-01",
    endsOn: "2026-07-31",
    targets: { kcal: 1800, proteinG: null, carbsG: undefined },
    meals: [MEAL, { name: { en: "Dinner", es: "Cena" }, moment: "dinner" }],
    ...over,
  });

  it("rewrites the editable fields only; identity, provenance and unrelated fields survive", async () => {
    await expect(updateNutritionPlan("plan-1", edit())).resolves.toEqual({ applied: [] });
    const doc = db.doc("nutrition_plans/plan-1")!;
    expect(doc).toMatchObject({
      clientId: "client-a1",
      trainerId: "coach-a",
      source: "coach",
      deleted: false,
      name: NAME,
      startsOn: "2026-06-01",
      endsOn: "2026-07-31",
      targets: { kcal: 1800 }, // null / undefined macros are dropped, never written
      reminders: { mode: "daily", dailyTime: "08:00" }, // not in the payload → kept
      adherenceCache: { week: 0.8 },
    });
    expect(doc.createdAt).toBe(CREATED);
    expect(doc.updatedAt).toBeInstanceOf(FakeTimestamp);
    const meals = doc.meals as Array<Record<string, unknown>>;
    expect(meals[0]).toEqual({
      mealId: "meal-bk",
      name: MEAL.name,
      moment: "breakfast",
      targets: { kcal: 500 },
      options: [{ id: "opt-1", text: MEAL.options[0].text, targets: {} }],
      order: 0,
    });
    expect(meals[1].mealId).toMatch(/^meal-[0-9a-f-]{36}$/);
    expect(meals[1]).toMatchObject({ order: 1, options: [], targets: {} });
    expectNoUndefinedDeep(doc);
    expect(db.doc("coach_activity/" + db.writes.find((w) => w.path.startsWith("coach_activity/"))!.path.split("/")[1])).toMatchObject({ trainerId: "coach-a", clientId: "client-a1" });
  });

  it("an open-ended edit writes endsOn as a PRESENT null key", async () => {
    await updateNutritionPlan("plan-1", edit({ endsOn: null }));
    const doc = db.doc("nutrition_plans/plan-1")!;
    expect("endsOn" in doc).toBe(true);
    expect(doc.endsOn).toBeNull();
  });

  it("moving the start re-applies the overlap invariant to the neighbouring phase in the same batch", async () => {
    db.seed("nutrition_plans/plan-0", { clientId: "client-a1", trainerId: "coach-a", source: "coach", name: NAME, startsOn: "2026-05-01", endsOn: null, targets: {}, meals: [] });
    const out = await updateNutritionPlan("plan-1", edit({ startsOn: "2026-06-10", endsOn: null }));
    expect(out.applied.length).toBe(1);
    expect(db.doc("nutrition_plans/plan-0")).toMatchObject({ endsOn: "2026-06-09" });
    const batched = db.writes.filter((w) => w.via === "batch").map((w) => w.path);
    expect(batched).toEqual(expect.arrayContaining(["nutrition_plans/plan-0", "nutrition_plans/plan-1"]));
  });

  // BUG: `templateId: data.templateId ?? null` (nutrition-actions.ts:321) turns an
  // OMITTED templateId into an explicit null. The edit form starts with
  // `sourceTemplate = null` (AssignNutritionForm.tsx ~L294) and sends
  // `templateId: sourceTemplate?.id ?? null`, so every edit of a plan assigned FROM a
  // template erases its provenance — and `countNutritionLibraryUsage`'s
  // templatesInPlans pill silently drops that plan. Correct: omitted → keep the
  // stored templateId (only an explicit change should touch it).
  it.failing("omitting templateId keeps the plan's template provenance", async () => {
    const { templateId: _omit, ...withoutTemplate } = edit();
    await updateNutritionPlan("plan-1", withoutTemplate);
    expect(db.doc("nutrition_plans/plan-1")!.templateId).toBe("nuttpl-coach-a-x");
  });

  it("refuses another coach's plan, a clientId repoint, a lost client, and a missing plan — no writes", async () => {
    await expect(updateNutritionPlan("plan-b", edit({ clientId: "client-b1" }))).rejects.toThrow("Forbidden");
    await expect(updateNutritionPlan("plan-1", edit({ clientId: "client-b1" }))).rejects.toThrow("Forbidden");
    await expect(updateNutritionPlan("ghost", edit())).rejects.toThrow("NotFound");
    // the client moved to another coach: the plan's trainerId still matches, the roster gate must not
    db.seed("users/client-a1", { coachId: "coach-b" });
    await expect(updateNutritionPlan("plan-1", edit())).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(db.doc("nutrition_plans/plan-b")!.name).toEqual({ en: "B", es: "B" });
  });

  it("rejects an invalid body (endsOn before startsOn, no meals) before any read", async () => {
    await expect(updateNutritionPlan("plan-1", edit({ endsOn: "2026-05-01" }))).rejects.toThrow();
    await expect(updateNutritionPlan("plan-1", edit({ meals: [] }))).rejects.toThrow();
    expect(db.reads).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe("listNutritionLogsForClient", () => {
  beforeEach(() => {
    db.seed("nutrition_logs/l3", { clientId: "client-a1", civilDate: "2026-06-12", planId: "plan-1", meals: { "meal-bk": { status: "done", note: "ok" } } });
    db.seed("nutrition_logs/l1", { clientId: "client-a1", civilDate: "2026-06-10", planId: "plan-1", meals: { "meal-bk": { status: "weird" } }, targetsSnapshot: { daily: { kcal: 2000 }, meals: [{ mealId: "meal-bk" }] } });
    db.seed("nutrition_logs/out", { clientId: "client-a1", civilDate: "2026-07-01", meals: {} });
    db.seed("nutrition_logs/corrupt", { clientId: "client-a1" });
    db.seed("nutrition_logs/foreign", { clientId: "client-b1", civilDate: "2026-06-11", meals: {} });
  });

  it("returns MY client's logs inside [start, end], sorted, forgiving-decoded", async () => {
    const logs = await listNutritionLogsForClient("client-a1", "2026-06-01", "2026-06-30");
    expect(logs).toEqual([
      {
        id: "l1",
        clientId: "client-a1",
        civilDate: "2026-06-10",
        planId: "plan-1",
        meals: { "meal-bk": { status: "missed", note: null, actualMacros: null } },
        targetsSnapshot: { daily: { kcal: 2000 }, meals: [{ mealId: "meal-bk" }] },
      },
      {
        id: "l3",
        clientId: "client-a1",
        civilDate: "2026-06-12",
        planId: "plan-1",
        meals: { "meal-bk": { status: "done", note: "ok", actualMacros: null } },
        targetsSnapshot: { daily: {}, meals: [] },
      },
    ]);
    const logQuery = db.queries.find((q) => q.collection === "nutrition_logs")!;
    expect(logQuery.filters).toEqual([
      { field: "clientId", op: "==", value: "client-a1" },
      { field: "civilDate", op: ">=", value: "2026-06-01" },
      { field: "civilDate", op: "<=", value: "2026-06-30" },
    ]);
  });

  it("an inverted range is [] without querying logs", async () => {
    await expect(listNutritionLogsForClient("client-a1", "2026-06-30", "2026-06-01")).resolves.toEqual([]);
    expect(db.queries.some((q) => q.collection === "nutrition_logs")).toBe(false);
  });

  it("another coach's client → Forbidden, missing client → NotFound, no log read", async () => {
    await expect(listNutritionLogsForClient("client-b1", "2026-06-01", "2026-06-30")).rejects.toThrow("Forbidden");
    await expect(listNutritionLogsForClient("ghost", "2026-06-01", "2026-06-30")).rejects.toThrow("NotFound");
    expect(db.queries.some((q) => q.collection === "nutrition_logs")).toBe(false);
  });
});

describe("nutrition templates (library)", () => {
  const TEMPLATE_INPUT = {
    name: { en: " Bulk ", es: " Volumen " },
    targets: { kcal: 3000, fatG: null },
    meals: [MEAL, { name: { en: "Snack", es: "Merienda" }, moment: "snack", options: [{ text: { en: "Nuts", es: "Nueces" } }] }],
  };

  beforeEach(() => {
    db.seed("nutrition_templates/std-1", { ownerId: null, name: { en: "Std", es: "Estándar" }, targets: { kcal: 2200 }, meals: [{ mealId: "meal-s", name: MEAL.name, moment: "breakfast", targets: {}, options: [{ id: "o", text: MEAL.options[0].text, targets: {} }], order: 0 }] });
    db.seed("nutrition_templates/b-1", { ownerId: "coach-b", name: { en: "B private", es: "B privado" }, targets: {}, meals: [] });
    db.seed("nutrition_templates/a-del", { ownerId: "coach-a", name: { en: "Gone", es: "Borrada" }, targets: {}, meals: [], deleted: true });
  });

  it("createNutritionTemplate stamps ownerId from the SESSION, freezes meals with ids + order, drops null macros", async () => {
    const { id } = await createNutritionTemplate({ ...TEMPLATE_INPUT, ownerId: "coach-b" });
    expect(id).toMatch(/^nuttpl-coach-a-[0-9a-f-]{36}$/);
    const doc = db.doc(`nutrition_templates/${id}`)!;
    expect(doc).toMatchObject({ name: { en: "Bulk", es: "Volumen" }, ownerId: "coach-a", targets: { kcal: 3000 } });
    expect(doc.createdAt).toBeInstanceOf(FakeTimestamp);
    expect(doc.updatedAt).toBeInstanceOf(FakeTimestamp);
    expect("deleted" in doc).toBe(false);
    const meals = doc.meals as Array<Record<string, unknown>>;
    expect(meals[0]).toMatchObject({ mealId: "meal-bk", order: 0, targets: { kcal: 500 } });
    expect(meals[1].mealId).toMatch(/^meal-/);
    expect((meals[1].options as Array<{ id: string }>)[0].id).toMatch(/^opt-/);
    expect(meals[1].order).toBe(1);
    expectNoUndefinedDeep(doc);
    expect(db.writesTo("coach_activity/")).toHaveLength(1);
  });

  it("createNutritionTemplate rejects duplicate mealIds / no meals with no write", async () => {
    await expect(createNutritionTemplate({ ...TEMPLATE_INPUT, meals: [MEAL, MEAL] })).rejects.toThrow();
    await expect(createNutritionTemplate({ ...TEMPLATE_INPUT, meals: [] })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("softDeleteNutritionTemplate flags deleted:true on my own template, keeping the doc", async () => {
    const { id } = await createNutritionTemplate(TEMPLATE_INPUT);
    await expect(softDeleteNutritionTemplate(id)).resolves.toEqual({ ok: true });
    const doc = db.doc(`nutrition_templates/${id}`)!;
    expect(doc.deleted).toBe(true);
    expect(doc.name).toEqual({ en: "Bulk", es: "Volumen" });
    expect(db.writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("softDeleteNutritionTemplate refuses a standard / another coach's / missing template", async () => {
    await expect(softDeleteNutritionTemplate("std-1")).rejects.toThrow("Forbidden");
    await expect(softDeleteNutritionTemplate("b-1")).rejects.toThrow("Forbidden");
    await expect(softDeleteNutritionTemplate("ghost")).rejects.toThrow("NotFound");
    expect(db.writes).toEqual([]);
  });

  it("duplicateNutritionTemplate copies a standard template into MY library: suffixed name, same mealIds, fresh doc", async () => {
    const { id } = await duplicateNutritionTemplate("std-1");
    expect(id).toMatch(/^nuttpl-coach-a-/);
    const doc = db.doc(`nutrition_templates/${id}`)!;
    expect(doc).toMatchObject({
      ownerId: "coach-a",
      name: { en: "Std (copy)", es: "Estándar (copia)" },
      targets: { kcal: 2200 },
    });
    expect((doc.meals as Array<{ mealId: string }>)[0].mealId).toBe("meal-s");
    expect(doc.createdAt).toBeInstanceOf(FakeTimestamp);
    expectNoUndefinedDeep(doc);
    // the source is untouched
    expect(db.doc("nutrition_templates/std-1")!.ownerId).toBeNull();
  });

  it("duplicateNutritionTemplate refuses another coach's private template", async () => {
    await expect(duplicateNutritionTemplate("b-1")).rejects.toThrow("Forbidden");
    await expect(duplicateNutritionTemplate("ghost")).rejects.toThrow("NotFound");
    expect(db.writes).toEqual([]);
  });

  it("listNutritionTemplates: own (sorted by es name) then standard; never another coach's, never soft-deleted", async () => {
    await createNutritionTemplate(TEMPLATE_INPUT);
    await createNutritionTemplate({ ...TEMPLATE_INPUT, name: { en: "Aaa", es: "Ayuno" } });
    const rows = await listNutritionTemplates();
    expect(rows.map((r) => r.name.es)).toEqual(["Ayuno", "Volumen", "Estándar"]);
    expect(rows.map((r) => r.ownerId)).toEqual(["coach-a", "coach-a", null]);
  });
});
