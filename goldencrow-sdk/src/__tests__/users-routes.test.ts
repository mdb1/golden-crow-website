// Route-level tests for /users/*: every endpoint sits behind the plugin's
// canManageLegacyModeration gate (global admins only). The REAL gate from
// roles.repository is exercised; Firebase is stubbed so the module loads.
import type { FastifyInstance } from "fastify";
import type { AdminContext, AdminRole } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => ({})),
  adminStorageFor: jest.fn(() => ({})),
}));

const mockListUsers = jest.fn();
const mockGetUserById = jest.fn();
const mockGetUserVerificationSummaries = jest.fn();
const mockSendUserVerificationEmail = jest.fn();
const mockUpdateUserProfile = jest.fn();
const mockDeleteUserCascade = jest.fn();

class MockVerificationEmailError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

jest.mock("../repositories/users.repository.js", () => ({
  listUsers: mockListUsers,
  getUserById: mockGetUserById,
  getUserVerificationSummaries: mockGetUserVerificationSummaries,
  isVerificationEmailError: (error: unknown) =>
    error instanceof MockVerificationEmailError,
  sendUserVerificationEmail: mockSendUserVerificationEmail,
  updateUserProfile: mockUpdateUserProfile,
  deleteUserCascade: mockDeleteUserCascade,
}));

const repositoryMocks = [
  mockListUsers,
  mockGetUserById,
  mockGetUserVerificationSummaries,
  mockSendUserVerificationEmail,
  mockUpdateUserProfile,
  mockDeleteUserCascade,
];

const endpoints = [
  { method: "GET" as const, url: "/users" },
  { method: "GET" as const, url: "/users/user-1" },
  {
    method: "POST" as const,
    url: "/users/verification-summaries",
    payload: { ids: ["user-1"] },
  },
  { method: "POST" as const, url: "/users/user-1/send-email-verification" },
  {
    method: "PUT" as const,
    url: "/users/user-1",
    payload: { disabled: true },
  },
  { method: "DELETE" as const, url: "/users/user-1" },
];

const DENIED_ROLES: AdminRole[] = [
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
  "patient",
  "transport_dispatcher",
  "organization_publisher",
  "individual_publisher",
];

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  currentContext = makeAdminContext({ role: "full_admin" });
  const { userRoutes } = await import("../routes/users.routes.js");
  fastify = await buildRouteServer(userRoutes, () => currentContext);
});

afterEach(async () => {
  await fastify.close();
});

describe("/users gate", () => {
  it("refuses a request without an admin context with 403 and no repository call", async () => {
    currentContext = undefined;

    for (const { method, url, payload } of endpoints) {
      const response = await fastify.inject({ method, url, payload });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Full admin access required" });
    }
    for (const mock of repositoryMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each(DENIED_ROLES)(
    "refuses role %s on every endpoint (403) and never calls the repository",
    async (role) => {
      currentContext = makeAdminContext({
        role,
        institutionId: "INS-1",
        doctorId: "DOC-1",
        patientId: "PAT-1",
      });

      for (const { method, url, payload } of endpoints) {
        const response = await fastify.inject({ method, url, payload });
        expect(response.statusCode).toBe(403);
      }
      for (const mock of repositoryMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it("refuses an invalid body with 403 (gate) rather than 400 for a denied role", async () => {
    currentContext = makeAdminContext({ role: "institution_admin" });

    const response = await fastify.inject({
      method: "PUT",
      url: "/users/user-1",
      payload: { age: 999 },
    });

    expect(response.statusCode).toBe(403);
  });

  it.each(["full_admin", "2pq_admin"] as const)(
    "lets %s cascade-delete a user",
    async (role) => {
      currentContext = makeAdminContext({ role });
      mockDeleteUserCascade.mockResolvedValue({ deleted: true });

      const response = await fastify.inject({
        method: "DELETE",
        url: "/users/user-1",
      });

      expect(response.statusCode).toBe(200);
      expect(mockDeleteUserCascade).toHaveBeenCalledWith("user-1");
    },
  );
});

describe("/users endpoints for a global admin", () => {
  it("sends the verification email for the addressed user", async () => {
    mockSendUserVerificationEmail.mockResolvedValue({ sent: true });

    const response = await fastify.inject({
      method: "POST",
      url: "/users/user-1/send-email-verification",
    });

    expect(response.statusCode).toBe(200);
    expect(mockSendUserVerificationEmail).toHaveBeenCalledWith("user-1");
    expect(response.json()).toEqual({ sent: true });
  });

  it.each([
    ["an already-verified user", "Email is already verified.", 409],
    ["an unknown user", "User not found.", 404],
  ])(
    "maps a verification-email error for %s to its status",
    async (_, message, statusCode) => {
      mockSendUserVerificationEmail.mockRejectedValue(
        new MockVerificationEmailError(message, statusCode),
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/users/user-1/send-email-verification",
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toEqual({ error: message });
    },
  );

  it.each([
    ["an out-of-range age", { age: 151 }],
    ["a non-URL profile image", { profileImage: "not a url" }],
    ["an over-long display name", { displayName: "x".repeat(101) }],
    ["a non-boolean disabled flag", { disabled: "yes" }],
  ])("rejects a profile update with %s (400)", async (_, payload) => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/users/user-1",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
  });

  it("updates the profile and 404s when the user does not exist", async () => {
    mockUpdateUserProfile.mockResolvedValueOnce({ uid: "user-1" });
    mockUpdateUserProfile.mockResolvedValueOnce(null);

    const ok = await fastify.inject({
      method: "PUT",
      url: "/users/user-1",
      payload: { displayName: "Ada", disabled: true },
    });
    const missing = await fastify.inject({
      method: "PUT",
      url: "/users/ghost",
      payload: { displayName: "Ghost" },
    });

    expect(ok.statusCode).toBe(200);
    expect(mockUpdateUserProfile).toHaveBeenNthCalledWith(1, "user-1", {
      displayName: "Ada",
      disabled: true,
    });
    expect(missing.statusCode).toBe(404);
  });

  it("caps verification summaries at 100 ids", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/users/verification-summaries",
      payload: { ids: Array.from({ length: 101 }, (_, i) => `user-${i}`) },
    });

    expect(response.statusCode).toBe(400);
    expect(mockGetUserVerificationSummaries).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    mockGetUserById.mockResolvedValue(null);

    const response = await fastify.inject({ method: "GET", url: "/users/ghost" });

    expect(response.statusCode).toBe(404);
    expect(mockGetUserById).toHaveBeenCalledWith("ghost");
  });
});
