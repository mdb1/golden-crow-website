// auth-middleware-behaviour.test.ts
//
// Behaviour of src/middleware/auth.ts `authMiddleware` — the single gate every
// non-public SDK route goes through (epic #451, "confidence without CI").
// auth-middleware.test.ts only covers the path helpers; this file drives the
// middleware itself on a real Fastify instance with the cookie plugin, a
// mocked session verifier and a mocked resolveAdminContext.

import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import type { AdminContext } from "../types/sdk.types.js";
import { contextFor } from "./helpers/app-harness.js";

const mockVerifySessionCookie = jest.fn();
const mockResolveAdminContext = jest.fn();

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    verifySessionCookie: mockVerifySessionCookie,
  })),
  adminDbFor: jest.fn(() =>
    jest.requireActual("./helpers/app-harness").inertFirebaseHandle("db"),
  ),
  adminStorageFor: jest.fn(() =>
    jest.requireActual("./helpers/app-harness").inertFirebaseHandle("storage"),
  ),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  resolveAdminContext: mockResolveAdminContext,
}));

const DECODED = { uid: "user-uid", email: "user@example.com" };

let app: FastifyInstance;

beforeAll(async () => {
  const { authMiddleware } = await import("../middleware/auth.js");
  app = Fastify();
  await app.register(cookie);
  app.addHook("onRequest", authMiddleware);
  // Catch-all: if the middleware lets a request through, echo what it attached.
  app.all("/*", async (request) => ({
    passed: true,
    uid: request.user?.uid ?? null,
    role: request.adminContext?.role ?? null,
  }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifySessionCookie.mockResolvedValue(DECODED);
});

function asSession(context: AdminContext | null) {
  mockResolveAdminContext.mockResolvedValue(context);
}

async function get(url: string, session: string | null = "valid-session") {
  return app.inject({
    method: "GET",
    url,
    ...(session === null ? {} : { cookies: { session } }),
  });
}

describe("authMiddleware — session verification", () => {
  it("401 without a session cookie, and never touches the verifier", async () => {
    const res = await get("/roles", null);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "No session cookie" });
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
    expect(mockResolveAdminContext).not.toHaveBeenCalled();
  });

  it("401 with an empty session cookie", async () => {
    const res = await get("/roles", "");
    expect(res.statusCode).toBe(401);
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked", Object.assign(new Error("revoked"), { code: "auth/session-cookie-revoked" })],
    ["expired", Object.assign(new Error("expired"), { code: "auth/session-cookie-expired" })],
    ["malformed", new Error("Decoding Firebase session cookie failed")],
  ])("401 when verifySessionCookie rejects (%s)", async (_label, error) => {
    mockVerifySessionCookie.mockRejectedValue(error);
    const res = await get("/roles");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid or expired session" });
    expect(mockResolveAdminContext).not.toHaveBeenCalled();
  });

  it("verifies the cookie WITH revocation checking (checkRevoked=true)", async () => {
    asSession(contextFor(["backoffice"]));
    await get("/roles", "the-cookie");
    expect(mockVerifySessionCookie).toHaveBeenCalledTimes(1);
    expect(mockVerifySessionCookie).toHaveBeenCalledWith("the-cookie", true);
  });

  it("resolves the context from the decoded email + uid", async () => {
    asSession(contextFor(["backoffice"]));
    await get("/roles");
    expect(mockResolveAdminContext).toHaveBeenCalledWith({
      email: "user@example.com",
      uid: "user-uid",
    });
  });

  it("401 (fail closed) when resolving the context throws", async () => {
    mockResolveAdminContext.mockRejectedValue(new Error("firestore down"));
    const res = await get("/roles");
    expect(res.statusCode).toBe(401);
  });
});

describe("authMiddleware — account authorization", () => {
  it("403 when there is no admin context", async () => {
    asSession(null);
    const res = await get("/auth/context");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Account not authorized" });
  });

  it("403 when the context opens no surface at all", async () => {
    asSession(contextFor([]));
    const res = await get("/auth/context");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Account not authorized" });
  });

  it("a backoffice session passes and gets user + adminContext attached", async () => {
    asSession(contextFor(["backoffice"]));
    for (const url of ["/roles", "/users", "/areas/patients", "/auth/context", "/discover/organizations"]) {
      const res = await get(url);
      expect({ url, status: res.statusCode }).toEqual({ url, status: 200 });
      expect(res.json()).toEqual({ passed: true, uid: "user-uid", role: "full_admin" });
    }
  });
});

const BACKOFFICE_ONLY_PATHS = [
  "/roles",
  "/users",
  "/users/abc",
  "/areas/patients",
  "/2pq/forms",
  "/reports",
  "/admin/partnership-crm/organizations",
  "/reporting/integration-clients",
];

describe.each([
  {
    surface: "patient" as const,
    error: "This patient portal session cannot access backoffice APIs",
    allowed: [
      "/auth/context",
      "/auth/my-account",
      "/auth/my-account/role",
      "/auth/my-account/email",
      "/auth/profile-setup",
      "/auth/profile-setup/patient",
      "/2pq/informed-consents",
      "/2pq/informed-consents/c1/file",
      "/auth/context?x=1",
    ],
    denied: [
      ...BACKOFFICE_ONLY_PATHS,
      "/auth/profile-setup/pgflex",
      "/auth/profile-setup/publisher",
      "/pgflex/logistics",
      "/discover/organizations",
      "/2pq/informed-consentsX",
    ],
  },
  {
    surface: "pgflex" as const,
    error: "This PGFlex session cannot access backoffice APIs",
    allowed: [
      "/auth/context",
      "/auth/my-account",
      "/auth/profile-setup",
      "/auth/profile-setup/pgflex",
      "/pgflex/logistics",
      "/pgflex/logistics/item-1",
    ],
    denied: [
      ...BACKOFFICE_ONLY_PATHS,
      "/auth/profile-setup/patient",
      "/2pq/informed-consents",
      "/discover/organizations",
    ],
  },
  {
    surface: "publisher" as const,
    error: "This publisher portal session cannot access backoffice APIs",
    allowed: [
      "/auth/context",
      "/auth/my-account",
      "/auth/profile-setup",
      "/auth/profile-setup/publisher",
      "/discover/organizations",
      "/discover/organizations/org-1",
      "/discover/individuals/ind-1",
      "/discover/feed-items/f-1/duplicate",
      "/admin/support-services/offers",
      "/admin/support-services/offers/o-1",
      "/admin/support-services/transactions/t-1",
    ],
    denied: [
      ...BACKOFFICE_ONLY_PATHS,
      "/auth/profile-setup/patient",
      "/pgflex/logistics",
      "/2pq/informed-consents",
      // Publishers must never evaluate their own submissions.
      "/discover/organizations/org-1/submission-evaluation",
      "/discover/individuals/ind-1/submission-evaluation",
    ],
  },
])("authMiddleware — $surface-only session", ({ surface, error, allowed, denied }) => {
  beforeEach(() => asSession(contextFor([surface])));

  it.each(allowed)("passes %s", async (url) => {
    const res = await get(url);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ passed: true });
  });

  it.each(denied)("403 on %s", async (url) => {
    const res = await get(url);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error });
  });
});

describe("authMiddleware — mixed-surface sessions", () => {
  it("backoffice + patient portal: the backoffice grant wins, backoffice paths pass", async () => {
    asSession(contextFor(["backoffice", "patient"]));
    expect((await get("/roles")).statusCode).toBe(200);
    expect((await get("/2pq/informed-consents")).statusCode).toBe(200);
  });

  it("backoffice + publisher: backoffice paths pass", async () => {
    asSession(contextFor(["backoffice", "publisher"]));
    expect((await get("/users")).statusCode).toBe(200);
  });

  it("patient + PGFlex (no backoffice): each portal's own paths pass", async () => {
    asSession(contextFor(["patient", "pgflex"]));
    expect((await get("/2pq/informed-consents")).statusCode).toBe(200);
    expect((await get("/pgflex/logistics")).statusCode).toBe(200);
  });

  // LATENT BUG (defense in depth) — src/middleware/auth.ts:104-142. Each
  // portal restriction only fires when that portal is the ONLY surface open
  // (`canAccessX && !canAccessY && ...`). A context with two non-backoffice
  // surfaces matches none of the three branches and falls through to the
  // full backoffice API. resolveAdminContext cannot build such a context
  // today (one role per account, and the access-surfaces predicates are
  // mutually exclusive), so it is not exploitable — but the gate fails OPEN
  // instead of restricting to the union of the open portals' paths.
  it.failing.each([
    [["patient", "pgflex"]],
    [["patient", "publisher"]],
    [["pgflex", "publisher"]],
  ] as const)("non-backoffice mixed session %j is still denied backoffice paths", async (surfaces) => {
    asSession(contextFor([...surfaces]));
    expect((await get("/roles")).statusCode).toBe(403);
  });
});

describe("authMiddleware — /gym project-access gate", () => {
  it("403 on /gym/* without pocket-gyms project access", async () => {
    asSession(contextFor(["backoffice"], { projectAccess: ["mydnamap"] }));
    for (const url of ["/gym/members", "/gym/members/u1/evaluations", "/gym/stats?range=7d", "/gym"]) {
      const res = await get(url);
      expect({ url, status: res.statusCode }).toEqual({ url, status: 403 });
      expect(res.json()).toEqual({ error: "No access to pocket-gyms project" });
    }
  });

  it("passes /gym/* with pocket-gyms project access", async () => {
    asSession(contextFor(["backoffice"], { projectAccess: ["mydnamap", "pocket-gyms"] }));
    expect((await get("/gym/members")).statusCode).toBe(200);
    expect((await get("/gym/stats")).statusCode).toBe(200);
  });

  it("does not gate look-alike prefixes (/gymnasium is not /gym)", async () => {
    asSession(contextFor(["backoffice"], { projectAccess: ["mydnamap"] }));
    expect((await get("/gymnasium")).statusCode).toBe(200);
  });

  // Regression (#451): the /gym gate compared the RAW `request.url`, but the
  // router percent-decodes before matching, so `/%67ym/members` (%67 = "g")
  // skipped the gate and still ran GET /gym/members — Pocket Gyms data for a
  // session without pocket-gyms access. The gate now uses the decoded path
  // and the matched route.
  it.each(["/%67ym/members", "/%67%79%6d/members/u1", "/g%79m/stats"])(
    "403 on percent-encoded %s without pocket-gyms access",
    async (url) => {
      asSession(contextFor(["backoffice"], { projectAccess: ["mydnamap"] }));
      expect((await get(url)).statusCode).toBe(403);
    },
  );
});
