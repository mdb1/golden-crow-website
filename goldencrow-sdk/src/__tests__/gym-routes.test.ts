// Route-level tests for every /gym/* route file (Pocket Gyms). The gym route
// plugins only check that an admin context exists; the per-PROJECT gate
// ("pocket-gyms" in projectAccess) lives in the auth middleware. So this suite
// wires the plugins exactly like production — real authMiddleware in a global
// onRequest hook, gymRoutes under the /gym prefix — with Firebase session
// verification and role resolution mocked.
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockVerifySessionCookie = jest.fn();
const mockResolveAdminContext = jest.fn();

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({ verifySessionCookie: mockVerifySessionCookie })),
  adminDbFor: jest.fn(() => ({})),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  resolveAdminContext: mockResolveAdminContext,
}));

const mockDeleteGymMember = jest.fn();
const mockListTrainingPlans = jest.fn();
const mockListEvaluations = jest.fn();
const mockListBookingSlots = jest.fn();
const mockListNutritionPlans = jest.fn();
const mockListClinicalHistories = jest.fn();
const mockListWorkoutSessions = jest.fn();
const mockListMealCompliance = jest.fn();
const mockListAchievements = jest.fn();
const mockListChallenges = jest.fn();
const mockGetGymStats = jest.fn();
const mockListGymDocuments = jest.fn();
const mockListUserAchievements = jest.fn();
const mockUpdatePocketGymAppointmentStatus = jest.fn();

jest.mock("../repositories/gym-members.repository.js", () => ({
  createGymMember: jest.fn(),
  deleteGymMember: mockDeleteGymMember,
  getGymMember: jest.fn(),
  listGymMembers: jest.fn(),
  updateGymMember: jest.fn(),
}));
jest.mock("../repositories/gym-training.repository.js", () => ({
  listTrainingPlans: mockListTrainingPlans,
  getTrainingPlan: jest.fn(),
  createTrainingPlan: jest.fn(),
  updateTrainingPlan: jest.fn(),
  deleteTrainingPlan: jest.fn(),
}));
jest.mock("../repositories/gym-evaluations.repository.js", () => ({
  listEvaluations: mockListEvaluations,
  getEvaluation: jest.fn(),
  createEvaluation: jest.fn(),
  updateEvaluation: jest.fn(),
  deleteEvaluation: jest.fn(),
}));
jest.mock("../repositories/gym-bookings.repository.js", () => ({
  createBookingSlot: jest.fn(),
  deleteBookingSlot: jest.fn(),
  getBooking: jest.fn(),
  getBookingSlot: jest.fn(),
  listBookingSlots: mockListBookingSlots,
  listBookings: jest.fn(),
  updateBookingSlot: jest.fn(),
  updateBookingStatus: jest.fn(),
}));
jest.mock("../repositories/gym-nutrition.repository.js", () => ({
  createNutritionPlan: jest.fn(),
  deleteNutritionPlan: jest.fn(),
  getNutritionPlan: jest.fn(),
  listNutritionPlans: mockListNutritionPlans,
  updateNutritionPlan: jest.fn(),
}));
jest.mock("../repositories/gym-clinical.repository.js", () => ({
  getClinicalHistory: jest.fn(),
  listClinicalHistories: mockListClinicalHistories,
}));
jest.mock("../repositories/gym-workout-sessions.repository.js", () => ({
  listWorkoutSessions: mockListWorkoutSessions,
}));
jest.mock("../repositories/gym-meal-compliance.repository.js", () => ({
  listMealCompliance: mockListMealCompliance,
}));
jest.mock("../repositories/gym-achievements.repository.js", () => ({
  createAchievement: jest.fn(),
  deleteAchievement: jest.fn(),
  getAchievement: jest.fn(),
  listAchievements: mockListAchievements,
  updateAchievement: jest.fn(),
}));
jest.mock("../repositories/gym-challenges.repository.js", () => ({
  createChallenge: jest.fn(),
  deleteChallenge: jest.fn(),
  getChallenge: jest.fn(),
  listChallenges: mockListChallenges,
  updateChallenge: jest.fn(),
}));
jest.mock("../repositories/gym-stats.repository.js", () => ({
  getGymStats: mockGetGymStats,
}));
jest.mock("../repositories/gym-documents.repository.js", () => ({
  listGymDocuments: mockListGymDocuments,
}));
jest.mock("../repositories/gym-user-achievements.repository.js", () => ({
  listUserAchievements: mockListUserAchievements,
}));
jest.mock("../repositories/gym-mobile-app.repository.js", () => ({
  getPocketGymMobileAppOverview: jest.fn(),
  updatePocketGymAppointmentStatus: mockUpdatePocketGymAppointmentStatus,
}));

type GymCase = {
  file: string;
  method: "GET" | "DELETE" | "PATCH";
  path: string;
  payload?: Record<string, unknown>;
  mock: jest.Mock;
  args: unknown[];
};

// One representative endpoint per gym-*.routes.ts file (paths are relative to
// the /gym prefix). Writes are preferred where the file has a risky one.
const GYM_CASES: GymCase[] = [
  { file: "gym-members", method: "DELETE", path: "/members/member-1", mock: mockDeleteGymMember, args: ["member-1"] },
  { file: "gym-training", method: "GET", path: "/members/member-1/training-plans", mock: mockListTrainingPlans, args: ["member-1"] },
  { file: "gym-evaluations", method: "GET", path: "/members/member-1/evaluations", mock: mockListEvaluations, args: ["member-1"] },
  { file: "gym-bookings", method: "GET", path: "/booking-slots", mock: mockListBookingSlots, args: [] },
  { file: "gym-nutrition", method: "GET", path: "/members/member-1/nutrition-plans", mock: mockListNutritionPlans, args: ["member-1"] },
  { file: "gym-clinical", method: "GET", path: "/members/member-1/clinical-histories", mock: mockListClinicalHistories, args: ["member-1"] },
  { file: "gym-workout-sessions", method: "GET", path: "/members/member-1/workout-sessions", mock: mockListWorkoutSessions, args: ["member-1"] },
  { file: "gym-meal-compliance", method: "GET", path: "/members/member-1/meal-compliance", mock: mockListMealCompliance, args: ["member-1"] },
  { file: "gym-achievements", method: "GET", path: "/achievements", mock: mockListAchievements, args: [] },
  { file: "gym-challenges", method: "GET", path: "/challenges", mock: mockListChallenges, args: [] },
  { file: "gym-stats", method: "GET", path: "/stats", mock: mockGetGymStats, args: [] },
  { file: "gym-documents", method: "GET", path: "/members/member-1/documents", mock: mockListGymDocuments, args: ["member-1"] },
  { file: "gym-user-achievements", method: "GET", path: "/members/member-1/achievements", mock: mockListUserAchievements, args: ["member-1"] },
  {
    file: "gym-mobile-app",
    method: "PATCH",
    path: "/mobile-app/appointments/appt-1/status",
    payload: { status: "accepted" },
    mock: mockUpdatePocketGymAppointmentStatus,
    args: ["appt-1", "accepted"],
  },
];

const ALL_GYM_MOCKS = GYM_CASES.map((c) => c.mock);

const MYDNAMAP_ONLY = makeAdminContext({
  email: "genes-admin@example.com",
  projectAccess: ["mydnamap"],
});
const GYM_ADMIN = makeAdminContext({
  email: "gym-admin@example.com",
  projectAccess: ["mydnamap", "pocket-gyms"],
});

function parseCookieHeader(header: string | undefined) {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(value.join("="));
    }
  }
  return cookies;
}

async function buildGymServer(): Promise<FastifyInstance> {
  const { authMiddleware } = await import("../middleware/auth.js");
  const { gymRoutes } = await import("../routes/gym-index.routes.js");
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  // Same wiring as server.ts: /gym/* is not public, so it always hits the
  // middleware. @fastify/cookie loads its parser through a dynamic import that
  // Jest's CommonJS runtime cannot execute, so parse the header inline.
  fastify.addHook("onRequest", async (request, reply) => {
    request.cookies = parseCookieHeader(request.headers.cookie);
    await authMiddleware(request, reply);
  });
  await fastify.register(gymRoutes, { prefix: "/gym" });
  await fastify.ready();
  return fastify;
}

function withSession(gymCase: GymCase, path = `/gym${gymCase.path}`) {
  return {
    method: gymCase.method,
    url: path,
    payload: gymCase.payload,
    cookies: { session: "session-cookie" },
  };
}

let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  mockVerifySessionCookie.mockResolvedValue({
    uid: "admin-uid",
    email: "admin@example.com",
  });
  for (const mock of ALL_GYM_MOCKS) {
    mock.mockResolvedValue({ ok: true });
  }
  fastify = await buildGymServer();
});

afterEach(async () => {
  await fastify.close();
});

describe("/gym routes — pocket-gyms project gate", () => {
  it.each(GYM_CASES)(
    "$file: $method $path refuses a context without pocket-gyms access (403)",
    async (gymCase) => {
      mockResolveAdminContext.mockResolvedValue(MYDNAMAP_ONLY);

      const response = await fastify.inject(withSession(gymCase));

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "No access to pocket-gyms project",
      });
      for (const mock of ALL_GYM_MOCKS) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it.each(GYM_CASES)(
    "$file: $method $path serves a pocket-gyms admin and calls the repository",
    async (gymCase) => {
      mockResolveAdminContext.mockResolvedValue(GYM_ADMIN);

      const response = await fastify.inject(withSession(gymCase));

      expect(response.statusCode).toBe(200);
      expect(gymCase.mock).toHaveBeenCalledTimes(1);
      expect(gymCase.mock).toHaveBeenCalledWith(...gymCase.args);
    },
  );

  it("refuses a request without a session cookie (401) before resolving any context", async () => {
    const response = await fastify.inject({ method: "GET", url: "/gym/stats" });

    expect(response.statusCode).toBe(401);
    expect(mockResolveAdminContext).not.toHaveBeenCalled();
    expect(mockGetGymStats).not.toHaveBeenCalled();
  });

  it("refuses a patient-portal-only session on /gym even with pocket-gyms access", async () => {
    mockResolveAdminContext.mockResolvedValue(
      makeAdminContext({
        role: "patient",
        canAccessBackoffice: false,
        canAccessPatientPortal: true,
        projectAccess: ["pocket-gyms"],
      }),
    );

    const response = await fastify.inject(withSession(GYM_CASES[0]!));

    expect(response.statusCode).toBe(403);
    expect(mockDeleteGymMember).not.toHaveBeenCalled();
  });

  it("validates the appointment status after the gate (400 for an unknown status)", async () => {
    mockResolveAdminContext.mockResolvedValue(GYM_ADMIN);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/gym/mobile-app/appointments/appt-1/status",
      payload: { status: "teleported" },
      cookies: { session: "session-cookie" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdatePocketGymAppointmentStatus).not.toHaveBeenCalled();
  });

  // SECURITY BUG (project-gate bypass): authMiddleware decides whether to
  // apply the pocket-gyms check with `request.url.startsWith("/gym/")`
  // (middleware/auth.ts:148) on the RAW url, but Fastify's router matches the
  // percent-DECODED path. `/%67ym/...` ("%67" = "g") therefore skips the check
  // and still reaches the /gym handler, so any backoffice user WITHOUT
  // pocket-gyms access (e.g. an institution doctor of MyDNAMap) can read and
  // delete Pocket Gyms members, clinical histories, etc. The gate should test
  // the decoded/routed path (e.g. request.routeOptions.url) instead.
  it.failing.each([
    ["GET /%67ym/stats", "GET" as const, "/%67ym/stats", mockGetGymStats],
    [
      "GET /%67ym/members/:uid/clinical-histories",
      "GET" as const,
      "/%67ym/members/member-1/clinical-histories",
      mockListClinicalHistories,
    ],
    ["DELETE /%67ym/members/:uid", "DELETE" as const, "/%67ym/members/member-1", mockDeleteGymMember],
  ])(
    "refuses %s for a context without pocket-gyms access",
    async (_, method, url, mock) => {
      mockResolveAdminContext.mockResolvedValue(MYDNAMAP_ONLY);

      const response = await fastify.inject({
        method,
        url,
        cookies: { session: "session-cookie" },
      });

      expect(mock).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(403);
    },
  );
});

describe("/gym route plugins without the middleware", () => {
  let bare: FastifyInstance;
  let context: AdminContext | undefined;

  beforeEach(async () => {
    context = undefined;
    const { gymRoutes } = await import("../routes/gym-index.routes.js");
    bare = await buildRouteServer(gymRoutes, () => context, { prefix: "/gym" });
  });

  afterEach(async () => {
    await bare.close();
  });

  it.each(GYM_CASES)(
    "$file: $method $path answers 401 when no admin context was attached",
    async (gymCase) => {
      const response = await bare.inject({
        method: gymCase.method,
        url: `/gym${gymCase.path}`,
        payload: gymCase.payload,
      });

      expect(response.statusCode).toBe(401);
      expect(gymCase.mock).not.toHaveBeenCalled();
    },
  );
});
