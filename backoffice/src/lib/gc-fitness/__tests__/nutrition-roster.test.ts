// __tests__/nutrition-roster.test.ts — #923.
//
// `loadNutritionRosterSummaries` is the batched FETCH behind the roster's
// nutrition column (the pure math is tested in nutrition-roster-summary.test.ts).
// Pinned here:
//   - batching: `clientId in [≤30]` per chunk, two queries per chunk, never per client;
//   - mirror rows never reach a query but still get an (empty) entry;
//   - the civilDate window spans the earliest (today − 6) to the latest today
//     across the roster's zones, and each client is scored on THEIR today;
//   - forgiving decode (a malformed doc is skipped, an unknown meal status is
//     `missed`, a deleted plan does not count);
//   - fail-soft: a failing query degrades to empty summaries, never a throw.

import { FakeFirestore } from "@/lib/test-utils/fake-firestore-c";

import type { Firestore } from "firebase-admin/firestore";

import { loadNutritionRosterSummaries } from "../nutrition-roster";
import { CLIENT_ID, TODAY, YESTERDAY, fullyDone, mixed, phaseA, phaseB } from "./nutrition-fixtures";

// 15:00Z on TODAY (2026-08-18): still the 18th in Los Angeles, already the 19th
// on Kiritimati (UTC+14).
const NOW = new Date(`${TODAY}T15:00:00Z`);

const EMPTY = {
  ratio7d: null,
  percent7d: null,
  hasActivePlan: false,
  activePlanName: null,
  activePlanEndsOn: null,
  neverHadPlan: true,
};

let db: FakeFirestore;
const asDb = () => db as unknown as Firestore;

function seedPlan(id: string, data: Record<string, unknown>) {
  db.seed(`nutrition_plans/${id}`, data);
}
function seedLog(id: string, data: Record<string, unknown>) {
  db.seed(`nutrition_logs/${id}`, data);
}
function stripId<T extends { id?: unknown }>(doc: T): Omit<T, "id"> {
  const { id: _id, ...rest } = doc;
  void _id;
  return rest;
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  db = new FakeFirestore();
});
afterEach(() => jest.useRealTimers());

it("returns an empty summary for every requested uid and reads nothing when all rows are mirrors", async () => {
  const out = await loadNutritionRosterSummaries(
    asDb(),
    [
      { uid: "mirror:a@x.com", timezone: null },
      { uid: "mirror:b@x.com", timezone: "UTC" },
    ],
    "UTC",
  );
  expect([...out.entries()]).toEqual([
    ["mirror:a@x.com", EMPTY],
    ["mirror:b@x.com", EMPTY],
  ]);
  expect(db.queries).toEqual([]);
});

it("scores a client from their plans + logs (canonical fixture → 19%, phase in force)", async () => {
  seedPlan("plan-a", stripId(phaseA()));
  seedPlan("plan-b", stripId(phaseB()));
  seedLog(`${CLIENT_ID}_${YESTERDAY}`, stripId(fullyDone(YESTERDAY)));
  seedLog(`${CLIENT_ID}_${TODAY}`, stripId(mixed(TODAY)));

  const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");

  expect(out.get(CLIENT_ID)).toEqual({
    ratio7d: 4 / 21,
    percent7d: 19,
    hasActivePlan: true,
    activePlanName: { en: "Maintenance", es: "Mantenimiento" },
    activePlanEndsOn: "2026-08-31",
    neverHadPlan: false,
  });
});

it("one plans + one logs query per chunk, with the roster-wide civilDate window", async () => {
  await loadNutritionRosterSummaries(
    asDb(),
    [
      { uid: "la", timezone: "America/Los_Angeles" },
      { uid: "kiri", timezone: "Pacific/Kiritimati" },
      { uid: "fallback", timezone: null },
      { uid: "mirror:x@y.com", timezone: null },
    ],
    "UTC",
  );
  expect(db.queries).toEqual([
    {
      collection: "nutrition_plans",
      filters: [{ field: "clientId", op: "in", value: ["la", "kiri", "fallback"] }],
      orderBy: [],
      limit: 400,
    },
    {
      collection: "nutrition_logs",
      filters: [
        { field: "clientId", op: "in", value: ["la", "kiri", "fallback"] },
        // earliest today (LA: 08-18) − 6 … latest today (Kiritimati: 08-19)
        { field: "civilDate", op: ">=", value: "2026-08-12" },
        { field: "civilDate", op: "<=", value: "2026-08-19" },
      ],
      orderBy: [],
      limit: 400,
    },
  ]);
});

it("chunks the `in` filter at 30 uids", async () => {
  const clients = Array.from({ length: 61 }, (_, i) => ({ uid: `c${i}`, timezone: "UTC" }));
  const out = await loadNutritionRosterSummaries(asDb(), clients, "UTC");
  const inSizes = db.queries.map((q) => (q.filters[0].value as string[]).length);
  expect(inSizes).toEqual([30, 30, 30, 30, 1, 1]);
  expect(db.queries.map((q) => q.collection)).toEqual([
    "nutrition_plans",
    "nutrition_logs",
    "nutrition_plans",
    "nutrition_logs",
    "nutrition_plans",
    "nutrition_logs",
  ]);
  expect(out.size).toBe(61);
});

it("scores each client against THEIR civil today (a plan that starts 'tomorrow' in UTC is active on Kiritimati)", async () => {
  // Starts 08-19: Kiritimati is already there at NOW, Los Angeles is not.
  for (const uid of ["kiri", "la"]) {
    seedPlan(`p-${uid}`, { ...stripId(phaseB()), clientId: uid, startsOn: "2026-08-19" });
  }
  const out = await loadNutritionRosterSummaries(
    asDb(),
    [
      { uid: "kiri", timezone: "Pacific/Kiritimati" },
      { uid: "la", timezone: "America/Los_Angeles" },
    ],
    "UTC",
  );
  expect(out.get("kiri")?.hasActivePlan).toBe(true);
  expect(out.get("la")?.hasActivePlan).toBe(false);
  expect(out.get("la")?.neverHadPlan).toBe(false);
});

it("uses the fallback zone for a client with no (or empty) timezone", async () => {
  seedPlan("p", { ...stripId(phaseB()), clientId: "nozone", startsOn: "2026-08-19" });
  const kiri = await loadNutritionRosterSummaries(asDb(), [{ uid: "nozone", timezone: "" }], "Pacific/Kiritimati");
  expect(kiri.get("nozone")?.hasActivePlan).toBe(true);
  const la = await loadNutritionRosterSummaries(asDb(), [{ uid: "nozone", timezone: null }], "America/Los_Angeles");
  expect(la.get("nozone")?.hasActivePlan).toBe(false);
});

it("routes each doc to its own client's summary", async () => {
  seedPlan("pa", { ...stripId(phaseA()), clientId: "alice" });
  const out = await loadNutritionRosterSummaries(
    asDb(),
    [
      { uid: "alice", timezone: "UTC" },
      { uid: "bob", timezone: "UTC" },
    ],
    "UTC",
  );
  expect(out.get("alice")).toMatchObject({ hasActivePlan: true, neverHadPlan: false });
  expect(out.get("bob")).toEqual(EMPTY);
});

describe("forgiving decode", () => {
  it("skips plans without clientId/startsOn and ignores deleted plans", async () => {
    seedPlan("no-start", { ...stripId(phaseA()), startsOn: undefined });
    seedPlan("bad-start", { ...stripId(phaseA()), startsOn: 20260801 });
    seedPlan("deleted", { ...stripId(phaseA()), deleted: true });
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    expect(out.get(CLIENT_ID)).toEqual(EMPTY);
  });

  it("decodes a plan with missing optional fields (name, endsOn, meals) as open-ended", async () => {
    seedPlan("bare", { clientId: CLIENT_ID, startsOn: "2026-08-01", name: "not-an-object", meals: "nope" });
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    expect(out.get(CLIENT_ID)).toMatchObject({
      hasActivePlan: true,
      activePlanName: { en: "", es: "" },
      activePlanEndsOn: null,
      neverHadPlan: false,
    });
  });

  it("an unknown meal status counts as missed (never inflates adherence)", async () => {
    seedPlan("plan-a", stripId(phaseA()));
    const done = stripId(fullyDone(TODAY));
    seedLog("l1", { ...done, meals: { m1: { status: "done" }, m2: { status: "DONE!!" }, m3: "garbage" } });
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    // 1 done of 21 expected in the 7-day window.
    expect(out.get(CLIENT_ID)?.ratio7d).toBeCloseTo(1 / 21, 10);
  });

  it("decodes `source` so a coach phase wins over a self plan starting the same day", async () => {
    // Ids chosen so the id tiebreak alone would pick the SELF plan.
    seedPlan("a-self", { ...stripId(phaseA()), source: "self", trainerId: CLIENT_ID, name: { en: "Mine", es: "Mío" } });
    seedPlan("z-coach", stripId(phaseA()));
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    expect(out.get(CLIENT_ID)?.activePlanName).toEqual({ en: "Maintenance", es: "Mantenimiento" });
  });

  it("skips logs without clientId / civilDate", async () => {
    seedPlan("plan-a", stripId(phaseA()));
    seedLog("l-noDate", { ...stripId(fullyDone(TODAY)), civilDate: undefined });
    seedLog("l-noClient", { ...stripId(fullyDone(TODAY)), clientId: 7 });
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    expect(out.get(CLIENT_ID)?.ratio7d).toBe(0);
  });
});

describe("fail-soft", () => {
  it("a failing logs query keeps the plans (phase still shown, 0 adherence)", async () => {
    seedPlan("plan-a", stripId(phaseA()));
    seedLog("l1", stripId(fullyDone(TODAY)));
    db.failQueryWhen((q) => q.collection === "nutrition_logs");
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    expect(out.get(CLIENT_ID)).toMatchObject({ hasActivePlan: true, ratio7d: 0 });
  });

  it("both queries failing degrade to empty summaries, never a throw", async () => {
    seedPlan("plan-a", stripId(phaseA()));
    db.failQueryWhen(() => true);
    const out = await loadNutritionRosterSummaries(asDb(), [{ uid: CLIENT_ID, timezone: "UTC" }], "UTC");
    expect(out.get(CLIENT_ID)).toEqual(EMPTY);
  });
});
