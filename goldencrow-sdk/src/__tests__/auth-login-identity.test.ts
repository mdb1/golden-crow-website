import Fastify, { type FastifyReply } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

// POST /auth/login must hand back the identity it VERIFIED from the Firebase
// ID token so the backoffice keys the next-auth session on it instead of the
// client-supplied email (epic golden-crow-website#451).

const mockVerifyIdToken = jest.fn();
const mockCreateSessionCookie = jest.fn();
const mockResolveAdminContext = jest.fn();
const mockSetCookie = jest.fn();

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
    createSessionCookie: mockCreateSessionCookie,
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  getAdminCapabilities: jest.fn(),
  resolveAdminContext: mockResolveAdminContext,
}));

jest.mock("../repositories/my-account.repository.js", () => ({
  changeMyAccountEmailForContext: jest.fn(),
  getMyAccountForContext: jest.fn(),
  updateMyAccountRoleProfileForContext: jest.fn(),
}));

jest.mock("../repositories/profile-setup.repository.js", () => ({
  completeProfileSetup: jest.fn(),
  completePatientProfileSetup: jest.fn(),
  completePublisherProfileSetup: jest.fn(),
  completeTransportDispatcherProfileSetup: jest.fn(),
  createEligibleEmailAccount: jest.fn(),
  getEmailSignupEligibility: jest.fn(),
  getProfileSetupState: jest.fn(),
  isProfileSetupError: jest.fn(() => false),
}));

async function buildServer() {
  const { authRoutes } = await import("../routes/auth.routes.js");
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  // @fastify/cookie loads `cookie` via dynamic import, which Jest's CJS
  // runtime rejects; a decorator stub is enough to observe the call.
  const setCookieStub = function (this: unknown, ...args: unknown[]) {
    mockSetCookie(...args);
    return this;
  };
  fastify.decorateReply(
    "setCookie",
    setCookieStub as unknown as FastifyReply["setCookie"],
  );
  await fastify.register(authRoutes);
  return fastify;
}

const backofficeContext = {
  email: "real@example.com",
  uid: "uid-real",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: false,
  projectAccess: ["mydnamap"],
};

describe("POST /auth/login identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSessionCookie.mockResolvedValue("session-cookie-value");
    mockResolveAdminContext.mockResolvedValue(backofficeContext);
  });

  it("returns the verified uid and email alongside status ok", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "uid-real",
      email: "real@example.com",
    });
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { idToken: "token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      uid: "uid-real",
      email: "real@example.com",
    });
    expect(mockVerifyIdToken).toHaveBeenCalledWith("token", true);
    expect(mockSetCookie).toHaveBeenCalledWith(
      "session",
      "session-cookie-value",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    await app.close();
  });

  it("returns email null when the token carries no email", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-phone" });
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { idToken: "token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", uid: "uid-phone", email: null });
    await app.close();
  });

  it("keeps 401 without identity fields for an invalid token", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("bad token"));
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { idToken: "token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid ID token" });
    await app.close();
  });

  it("keeps 403 WRONG_AUTH_SURFACE and leaks no identity on surface mismatch", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "uid-real",
      email: "real@example.com",
    });
    mockResolveAdminContext.mockResolvedValue({
      ...backofficeContext,
      role: "patient",
      canAccessBackoffice: false,
      canAccessPatientPortal: true,
    });
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { idToken: "token", surface: "backoffice" },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("WRONG_AUTH_SURFACE");
    expect(body.requiredSurface).toBe("patient-portal");
    expect(body.uid).toBeUndefined();
    expect(mockCreateSessionCookie).not.toHaveBeenCalled();
    expect(mockSetCookie).not.toHaveBeenCalled();
    await app.close();
  });
});
