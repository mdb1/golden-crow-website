// coach-ai-summary.test.ts — gc-fitness #1347, «Resumen de la semana (IA)».
//
// What is pinned:
//   • the ISO-week key is the SAME vector table as the server twin
//     (functions/test/coachAI/weeklySummary.test.ts) — it is the cache doc id;
//   • the quota counter resets on another civil date;
//   • a callable error body maps to a card state, never a raw message;
//   • load: ownership before any summary read; reads THIS week's doc;
//   • generate: POSTs to the callable with the coach's own ID token, never
//     the model key; quota / opted-out / unavailable come back as values.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(),
  getCurrentTrainerIdToken: jest.fn(),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));
jest.mock("next-intl/server", () => ({ getLocale: jest.fn(async () => "en") }));

const docs = new Map<string, Record<string, unknown>>();
const reads: string[] = [];

function docRef(path: string): unknown {
  return {
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => {
      reads.push(path);
      const data = docs.get(path);
      return {
        exists: data !== undefined,
        data: () => data,
        get: (field: string) => data?.[field],
      };
    },
  };
}
function collectionRef(path: string) {
  return { doc: (id: string) => docRef(`${path}/${id}`) };
}
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: (name: string) => collectionRef(name) })),
}));

import {
  generateCoachWeeklySummary,
  loadCoachWeeklySummary,
} from "@/lib/gc-fitness/coach-ai-summary-actions";
import {
  callableUrl,
  classifyCallableError,
  decodeCoachSummary,
  isoWeekKey,
  quotaFromUsed,
  readSummaryUsage,
} from "@/lib/gc-fitness/coach-ai-summary-model";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import {
  getCurrentTrainer,
  getCurrentTrainerIdToken,
} from "@/lib/gc-fitness/auth-helpers";

const mockedTrainer = getCurrentTrainer as jest.MockedFunction<typeof getCurrentTrainer>;
const mockedIdToken = getCurrentTrainerIdToken as jest.MockedFunction<typeof getCurrentTrainerIdToken>;

const COACH = "coach-1";
const CLIENT = "client-1";
const SUMMARY = {
  headline: "Good week",
  sections: [{ key: "adherence", title: "Adherence", text: "3 of 4" }],
  flags: ["Ask about Thursday"],
  isoWeek: "2026-W42",
  windowFrom: "2026-10-07",
  windowTo: "2026-10-13",
  generatedAtISO: "2026-10-13T12:00:00.000Z",
};

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  docs.clear();
  reads.length = 0;
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
  mockedTrainer.mockResolvedValue({ uid: COACH, email: "c@x.test", role: "trainer", isAdmin: false, roles: ["trainer"] });
  mockedIdToken.mockResolvedValue({ uid: COACH, idToken: "ID-TOKEN" });
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe("model", () => {
  test("isoWeekKey — same vectors as the server twin", () => {
    expect(isoWeekKey("2026-10-13")).toBe("2026-W42");
    expect(isoWeekKey("2026-10-12")).toBe("2026-W42");
    expect(isoWeekKey("2026-10-18")).toBe("2026-W42");
    expect(isoWeekKey("2021-01-03")).toBe("2020-W53");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
  });

  test("usage resets on another civil date; quota math", () => {
    expect(readSummaryUsage({ civilDate: "2026-10-13", count: 5 }, "2026-10-13")).toBe(5);
    expect(readSummaryUsage({ civilDate: "2026-10-12", count: 5 }, "2026-10-13")).toBe(0);
    expect(readSummaryUsage(null, "2026-10-13")).toBe(0);
    expect(quotaFromUsed(20)).toEqual({ limit: 20, used: 20, remaining: 0 });
    expect(quotaFromUsed(3)).toEqual({ limit: 20, used: 3, remaining: 17 });
  });

  test("decodeCoachSummary drops unknown sections and rejects an empty one", () => {
    const decoded = decodeCoachSummary({
      ...SUMMARY,
      sections: [...SUMMARY.sections, { key: "diagnosis", title: "x", text: "y" }],
    });
    expect(decoded?.sections.map((s) => s.key)).toEqual(["adherence"]);
    expect(decodeCoachSummary({ headline: "h", sections: [] })).toBeNull();
    const fromTimestamp = decodeCoachSummary({
      ...SUMMARY,
      generatedAtISO: undefined,
      generatedAt: { toDate: () => new Date("2026-10-13T09:00:00Z") },
    });
    expect(fromTimestamp?.generatedAtISO).toBe("2026-10-13T09:00:00.000Z");
  });

  test("callable errors → card states", () => {
    expect(classifyCallableError("RESOURCE_EXHAUSTED", { reason: "quota" })).toBe("quota");
    expect(classifyCallableError("FAILED_PRECONDITION", { reason: "opted_out" })).toBe("opted_out");
    expect(classifyCallableError("PERMISSION_DENIED", undefined)).toBe("forbidden");
    expect(classifyCallableError("UNAVAILABLE", { reason: "upstream" })).toBe("unavailable");
    expect(classifyCallableError("DEADLINE_EXCEEDED", { reason: "timeout" })).toBe("unavailable");
    expect(classifyCallableError("INTERNAL", { reason: "invalid_output" })).toBe("generic");
    expect(classifyCallableError(undefined, undefined)).toBe("generic");
  });

  test("callable URL", () => {
    expect(callableUrl("gcfitness-3476b")).toBe(
      "https://us-central1-gcfitness-3476b.cloudfunctions.net/coachWeeklySummary",
    );
  });
});

describe("loadCoachWeeklySummary", () => {
  test("a foreign client is forbidden before any summary read", async () => {
    docs.set(`users/${CLIENT}`, { coachId: "someone-else" });
    await expect(loadCoachWeeklySummary(CLIENT)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(reads.some((p) => p.startsWith("coach_ai_summaries"))).toBe(false);
  });

  test("returns this ISO week's cached summary + today's quota", async () => {
    const week = isoWeekKey(civilDateToday("UTC"));
    docs.set(`users/${CLIENT}`, { coachId: COACH, timezone: "UTC" });
    docs.set(`coach_ai_summaries/${COACH}`, { usage: { civilDate: civilDateToday("UTC"), count: 4 } });
    docs.set(`coach_ai_summaries/${COACH}/clients/${CLIENT}/weeks/${week}`, { ...SUMMARY, isoWeek: week });
    const result = await loadCoachWeeklySummary(CLIENT);
    expect(result).toMatchObject({ ok: true, quota: { used: 4, remaining: 16 } });
    expect(result.ok && result.summary?.headline).toBe("Good week");
  });

  test("no summary yet → null summary, full quota", async () => {
    docs.set(`users/${CLIENT}`, { coachId: COACH });
    await expect(loadCoachWeeklySummary(CLIENT)).resolves.toEqual({
      ok: true,
      summary: null,
      quota: { limit: 20, used: 0, remaining: 20 },
    });
  });

  test("auth failure is a returned value, not a throw", async () => {
    mockedTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(loadCoachWeeklySummary(CLIENT)).resolves.toEqual({ ok: false, error: "forbidden" });
  });
});

describe("generateCoachWeeklySummary", () => {
  test("calls the callable with the coach's ID token, locale, timezone and force", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { cached: false, summary: SUMMARY, quota: { used: 2 } } }),
    });
    const result = await generateCoachWeeklySummary(CLIENT, { force: true });
    expect(result).toMatchObject({ ok: true, cached: false, quota: { used: 2, remaining: 18 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us-central1-gcfitness-3476b.cloudfunctions.net/coachWeeklySummary");
    expect(init.headers.Authorization).toBe("Bearer ID-TOKEN");
    expect(JSON.parse(init.body)).toEqual({ data: { clientId: CLIENT, locale: "en", timezone: "UTC", force: true } });
  });

  test("quota exhausted comes back as a value with the quota", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { status: "RESOURCE_EXHAUSTED", message: "x", details: { reason: "quota", used: 20, limit: 20 } } }),
    });
    await expect(generateCoachWeeklySummary(CLIENT)).resolves.toEqual({
      ok: false,
      error: "quota",
      quota: { limit: 20, used: 20, remaining: 0 },
    });
  });

  test("opted out / model down / network error never throw", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { status: "FAILED_PRECONDITION", details: { reason: "opted_out" } } }),
    });
    await expect(generateCoachWeeklySummary(CLIENT)).resolves.toEqual({ ok: false, error: "opted_out" });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { status: "UNAVAILABLE", details: { reason: "upstream" } } }),
    });
    await expect(generateCoachWeeklySummary(CLIENT)).resolves.toEqual({ ok: false, error: "unavailable" });
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(generateCoachWeeklySummary(CLIENT)).resolves.toEqual({ ok: false, error: "generic" });
  });

  test("no trainer session → forbidden, no request sent", async () => {
    mockedIdToken.mockRejectedValue(new Error("Forbidden"));
    await expect(generateCoachWeeklySummary(CLIENT)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
