// Server-side admin guards for the Pocket Genes backoffice (epic #451):
// getAdminContextServer / requireAdminRole / requireAdminRoleRedirect
// (admin-context-server.ts) and requireDiscoverFullAdmin /
// requireDiscoverAccess (discover-server.ts).
//
// sdkFetchServer is mocked to return the SDK's /auth/context payload;
// next/navigation's redirect throws like Next's NEXT_REDIRECT does so a guard
// that "falls through" after redirecting would be caught.

class RedirectError extends Error {
  constructor(readonly href: string) {
    super(`NEXT_REDIRECT:${href}`);
  }
}

const mockSdkFetchServer = jest.fn();
const mockGetServerSession = jest.fn();

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: (...args: unknown[]) => mockSdkFetchServer(...args),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((href: string) => {
    throw new RedirectError(href);
  }),
}));
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth", () => ({ authOptions: { marker: "authOptions" } }));

import {
  getAdminContextServer,
  requireAdminRole,
  requireAdminRoleRedirect,
} from "@/lib/admin-context-server";
import {
  requireDiscoverAccess,
  requireDiscoverFullAdmin,
} from "@/lib/discover-server";

function sdkContext(overrides: Record<string, unknown> = {}) {
  return {
    email: "a@example.com",
    uid: "u1",
    role: "full_admin",
    isBootstrap: false,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    projectAccess: ["mydnamap"],
    ...overrides,
  };
}

function givenContext(overrides: Record<string, unknown> = {}) {
  mockSdkFetchServer.mockResolvedValue({
    context: sdkContext(overrides),
    capabilities: [],
  });
}

async function redirectOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedirectError) return error.href;
    throw error;
  }
  return null;
}

beforeEach(() => {
  mockSdkFetchServer.mockReset();
  mockGetServerSession.mockReset();
});

describe("getAdminContextServer", () => {
  it("reads /auth/context and maps the record", async () => {
    givenContext({
      role: "institution_admin",
      institutionId: "INST-1",
      projectAccess: ["mydnamap", "pocketgyms"],
    });
    const ctx = await getAdminContextServer();
    expect(mockSdkFetchServer).toHaveBeenCalledWith("/auth/context");
    expect(ctx).toMatchObject({
      role: "institution_admin",
      institutionId: "INST-1",
      canAccessPGFlex: false,
      canAccessPublisherPortal: false,
      project: "mydnamap",
      projectAccess: ["mydnamap", "pocketgyms"],
    });
  });

  it("uses the active project when given", async () => {
    givenContext({ projectAccess: ["mydnamap", "pocketgyms"] });
    await expect(getAdminContextServer("pocketgyms")).resolves.toMatchObject({
      project: "pocketgyms",
    });
  });

  it("defaults project to mydnamap and projectAccess to [] when the SDK omits it", async () => {
    givenContext({ projectAccess: undefined });
    await expect(getAdminContextServer()).resolves.toMatchObject({
      project: "mydnamap",
      projectAccess: [],
    });
  });

  it("propagates SDK failures (unauthenticated) to the caller", async () => {
    mockSdkFetchServer.mockRejectedValue(new Error("SDK GET /auth/context failed: 401"));
    await expect(getAdminContextServer()).rejects.toThrow("401");
  });

  // #451: the active project comes from the next-auth session, i.e. from the
  // `project` the browser posted at sign-in. It is honoured only when the
  // SDK's projectAccess lists it.
  it("does not accept an active project outside projectAccess", async () => {
    givenContext({ projectAccess: ["pocketgyms"] });
    const ctx = await getAdminContextServer("mydnamap");
    expect(ctx.project).toBe("pocketgyms");
  });
});

describe("requireAdminRole", () => {
  it("returns the context for an allowed role", async () => {
    givenContext({ role: "institution_doctor" });
    await expect(
      requireAdminRole(["institution_admin", "institution_doctor"]),
    ).resolves.toMatchObject({ role: "institution_doctor" });
  });

  it("throws forbidden for a role outside the list", async () => {
    givenContext({ role: "patient" });
    await expect(requireAdminRole(["full_admin"])).rejects.toThrow("forbidden");
  });

  it("lets 2pq_admin through wherever full_admin is allowed", async () => {
    givenContext({ role: "2pq_admin" });
    await expect(requireAdminRole(["full_admin"])).resolves.toMatchObject({
      role: "2pq_admin",
    });
  });

  it("does NOT let 2pq_admin through a list without full_admin", async () => {
    givenContext({ role: "2pq_admin" });
    await expect(requireAdminRole(["institution_admin"])).rejects.toThrow(
      "forbidden",
    );
  });

  it("does not grant full_admin to a 2pq_admin-only list", async () => {
    givenContext({ role: "full_admin" });
    await expect(requireAdminRole(["2pq_admin"])).rejects.toThrow("forbidden");
  });

  it("forwards the active project", async () => {
    givenContext({ projectAccess: ["mydnamap", "pocketgyms"] });
    await expect(
      requireAdminRole(["full_admin"], "pocketgyms"),
    ).resolves.toMatchObject({ project: "pocketgyms" });
  });
});

describe("requireAdminRoleRedirect", () => {
  it("returns the context for an allowed role", async () => {
    givenContext({ role: "full_admin" });
    await expect(redirectOf(requireAdminRoleRedirect(["full_admin"]))).resolves.toBeNull();
  });

  it("redirects a disallowed role to / by default", async () => {
    givenContext({ role: "institution_operator" });
    await expect(redirectOf(requireAdminRoleRedirect(["full_admin"]))).resolves.toBe("/");
  });

  it("redirects to a custom fallback", async () => {
    givenContext({ role: "patient" });
    await expect(
      redirectOf(requireAdminRoleRedirect(["institution_admin"], "/2pq-dashboard")),
    ).resolves.toBe("/2pq-dashboard");
  });

  it("treats 2pq_admin as full_admin", async () => {
    givenContext({ role: "2pq_admin" });
    await expect(redirectOf(requireAdminRoleRedirect(["full_admin"]))).resolves.toBeNull();
  });
});

describe("requireDiscoverFullAdmin", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue({ user: { project: "mydnamap" } });
  });

  it("passes the session to getServerSession(authOptions) and the project to the context", async () => {
    givenContext();
    await requireDiscoverFullAdmin();
    expect(mockGetServerSession).toHaveBeenCalledWith({ marker: "authOptions" });
  });

  it.each(["full_admin", "2pq_admin"])("allows %s on mydnamap", async (role) => {
    givenContext({ role });
    await expect(redirectOf(requireDiscoverFullAdmin())).resolves.toBeNull();
  });

  it.each([
    "organization_publisher",
    "individual_publisher",
    "institution_admin",
    "patient",
  ])("redirects %s to /", async (role) => {
    givenContext({ role, organizationId: "o", individualId: "i" });
    await expect(redirectOf(requireDiscoverFullAdmin())).resolves.toBe("/");
  });

  it("redirects a full admin whose session is on another project", async () => {
    mockGetServerSession.mockResolvedValue({ user: { project: "pocketgyms" } });
    givenContext({ projectAccess: ["mydnamap", "pocketgyms"] });
    await expect(redirectOf(requireDiscoverFullAdmin())).resolves.toBe("/");
  });

  it("no session → project defaults from projectAccess", async () => {
    mockGetServerSession.mockResolvedValue(null);
    givenContext();
    await expect(redirectOf(requireDiscoverFullAdmin())).resolves.toBeNull();
  });
});

describe("requireDiscoverAccess", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue({ user: { project: "mydnamap" } });
  });

  it.each([
    [{ role: "full_admin" }],
    [{ role: "2pq_admin" }],
    [{ role: "organization_publisher", organizationId: "ORG-1" }],
    [{ role: "individual_publisher", individualId: "IND-1" }],
  ])("allows %j", async (ctx) => {
    givenContext(ctx);
    await expect(redirectOf(requireDiscoverAccess())).resolves.toBeNull();
  });

  it.each([
    [{ role: "organization_publisher" }],
    [{ role: "organization_publisher", individualId: "IND-1" }],
    [{ role: "individual_publisher" }],
    [{ role: "individual_publisher", organizationId: "ORG-1" }],
    [{ role: "institution_admin" }],
    [{ role: "institution_doctor" }],
    [{ role: "transport_dispatcher" }],
    [{ role: "patient" }],
  ])("redirects %j to /", async (ctx) => {
    givenContext(ctx);
    await expect(redirectOf(requireDiscoverAccess())).resolves.toBe("/");
  });

  it("redirects anyone outside the mydnamap project", async () => {
    mockGetServerSession.mockResolvedValue({ user: { project: "pocketgyms" } });
    givenContext({ role: "full_admin", projectAccess: ["mydnamap", "pocketgyms"] });
    await expect(redirectOf(requireDiscoverAccess())).resolves.toBe("/");
  });
});
