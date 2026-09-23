// __tests__/admin-actions.nutrition.test.ts
//
// #1133 — the coach-less admin profile never showed nutrition. It now calls
// `listClientNutritionForAdmin(uid, uid)` (self-as-coach, see
// `adminCanViewClientUnderCoach`). These tests pin that the loader admits that
// call for an active coach-less user, returns the user's OWN plan labelled as
// such, and marks a superseded phase as ended rather than "active".
//
// Firestore + auth are mocked; the real decoder and gate predicate run.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn().mockResolvedValue({ uid: "admin-1" }),
}));

const mockLoadSummaries = jest.fn();
jest.mock("@/lib/gc-fitness/nutrition-roster", () => ({
  loadNutritionRosterSummaries: (...args: unknown[]) => mockLoadSummaries(...args),
}));

let mockUserDoc: Record<string, unknown> | null = null;
let mockPlanDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
const mockWhere = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessAuth: jest.fn(),
  gcFitnessFirestore: jest.fn(() => ({
    collection: (name: string) => {
      if (name === "users") {
        return {
          doc: () => ({
            get: async () => ({
              exists: mockUserDoc !== null,
              data: () => mockUserDoc ?? undefined,
              get: (field: string) => mockUserDoc?.[field],
            }),
          }),
        };
      }
      if (name === "nutrition_plans") {
        const query = {
          where: (...args: unknown[]) => {
            mockWhere(...args);
            return query;
          },
          limit: () => query,
          get: async () => ({
            docs: mockPlanDocs.map((d) => ({ id: d.id, data: () => d.data })),
          }),
        };
        return query;
      }
      throw new Error(`unexpected collection ${name}`);
    },
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(), increment: jest.fn(), delete: jest.fn() },
}));

import { listClientNutritionForAdmin } from "@/lib/gc-fitness/admin-actions";

const UID = "coachless-1";

beforeEach(() => {
  jest.clearAllMocks();
  mockUserDoc = { role: "client", coachId: null, timezone: "UTC" };
  mockPlanDocs = [];
  mockLoadSummaries.mockResolvedValue(new Map());
});

describe("listClientNutritionForAdmin — coach-less self-as-coach (#1133)", () => {
  it("returns the user's own plan, labelled self, when called with (uid, uid)", async () => {
    mockPlanDocs = [
      {
        id: "p-self",
        data: {
          clientId: UID,
          trainerId: UID,
          source: "self",
          name: { es: "Mi plan", en: "My plan" },
          startsOn: "2020-01-01",
          endsOn: null,
        },
      },
    ];
    mockLoadSummaries.mockResolvedValue(
      new Map([
        [
          UID,
          {
            percent7d: 80,
            hasActivePlan: true,
            activePlanName: { es: "Mi plan", en: "My plan" },
            activePlanEndsOn: null,
            neverHadPlan: false,
          },
        ],
      ]),
    );

    const result = await listClientNutritionForAdmin(UID, UID);

    expect(mockWhere).toHaveBeenCalledWith("clientId", "==", UID);
    expect(result.hasActivePlan).toBe(true);
    expect(result.activePlanName).toBe("Mi plan");
    expect(result.percent7d).toBe(80);
    expect(result.phases).toEqual([
      {
        id: "p-self",
        name: "Mi plan",
        startsOn: "2020-01-01",
        endsOn: null,
        deleted: false,
        source: "self",
        ended: false,
      },
    ]);
  });

  it("marks an ex-coach phase closed by the user's own save as coach + ended", async () => {
    mockPlanDocs = [
      {
        id: "p-coach",
        data: {
          clientId: UID,
          trainerId: "ex-coach",
          source: "coach",
          name: { es: "Fase coach" },
          startsOn: "2020-01-01",
          endsOn: "2020-02-01",
        },
      },
      {
        id: "p-self",
        data: {
          clientId: UID,
          trainerId: UID,
          source: "self",
          name: { es: "Mi plan" },
          startsOn: "2020-02-02",
          endsOn: null,
        },
      },
    ];

    const result = await listClientNutritionForAdmin(UID, UID);

    expect(result.phases.map((p) => [p.id, p.source, p.ended])).toEqual([
      ["p-self", "self", false],
      ["p-coach", "coach", true],
    ]);
  });

  it("does not trust source alone: self without trainerId === clientId is coach", async () => {
    mockPlanDocs = [
      {
        id: "p-spoof",
        data: { clientId: UID, trainerId: "someone", source: "self", startsOn: "2020-01-01" },
      },
    ];

    const result = await listClientNutritionForAdmin(UID, UID);

    expect(result.phases[0].source).toBe("coach");
  });

  it("refuses (uid, uid) for a user who HAS a coach", async () => {
    mockUserDoc = { role: "client", coachId: "coach-9", timezone: "UTC" };

    await expect(listClientNutritionForAdmin(UID, UID)).rejects.toThrow("Not found");
    expect(mockLoadSummaries).not.toHaveBeenCalled();
  });
});
