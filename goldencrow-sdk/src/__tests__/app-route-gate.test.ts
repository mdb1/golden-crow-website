// app-route-gate.test.ts
//
// Boots the WHOLE SDK (buildServer) with Firebase mocked out, enumerates every
// registered route through `onRoute`, and checks the global auth hook against
// each one (epic #451, "confidence without CI"):
//
//   (a) the routes the hook lets through ANONYMOUSLY are pinned below — adding
//       a public route (or a new /internal/openapi/* one) fails this test until
//       the list is updated on purpose;
//   (b) every other route answers 401 without a session cookie;
//   (c/d) patient-portal-, PGFlex- and publisher-only sessions get 403 on every
//       route outside their path allowlist;
//   plus the /internal/openapi/* Bearer requirement and the /gym project gate.
//
// The mock factories wrap the jest.fn()s in arrows because the static
// import of ../middleware/auth.js below loads the mocked modules before the
// `const mock...` lines run.
//
// Firestore/Storage are inert proxies: a request that slips past the gate
// reaches a handler that throws (500) instead of touching real data.

import type { FastifyInstance } from "fastify";
import {
  isPatientPortalSdkPath,
  isPGFlexSdkPath,
  isPublisherPortalSdkPath,
} from "../middleware/auth.js";
import {
  collectInto,
  concretePath,
  contextFor,
  type CollectedRoute,
} from "./helpers/app-harness.js";

const mockVerifySessionCookie = jest.fn();
const mockResolveAdminContext = jest.fn();
const mockVerifyReportingAccessToken = jest.fn();

jest.mock("../config/firebase.js", () => {
  const { inertFirebaseHandle } = jest.requireActual("./helpers/app-harness");
  return {
    adminAuthFor: jest.fn(() => ({
      verifySessionCookie: (...a: unknown[]) => mockVerifySessionCookie(...a),
      verifyIdToken: jest.fn().mockRejectedValue(new Error("not in this test")),
      createSessionCookie: jest.fn().mockRejectedValue(new Error("not in this test")),
    })),
    adminDbFor: jest.fn(() => inertFirebaseHandle("db")),
    adminStorageFor: jest.fn(() => inertFirebaseHandle("storage")),
    adminAppFor: jest.fn(() => inertFirebaseHandle("app")),
  };
});

jest.mock("../repositories/roles.repository.js", () => ({
  ...jest.requireActual("../repositories/roles.repository.js"),
  resolveAdminContext: (...a: unknown[]) => mockResolveAdminContext(...a),
}));

jest.mock("../repositories/reporting-tokens.repository.js", () => ({
  ...jest.requireActual("../repositories/reporting-tokens.repository.js"),
  verifyReportingAccessToken: (...a: unknown[]) => mockVerifyReportingAccessToken(...a),
}));

const routes: CollectedRoute[] = [];
let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer({ logger: false, onRoute: collectInto(routes) });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifySessionCookie.mockResolvedValue({ uid: "user-uid", email: "user@example.com" });
  mockVerifyReportingAccessToken.mockRejectedValue(new Error("must not be reached"));
});

const key = (r: CollectedRoute) => `${r.method} ${r.url}`;

/** HEAD replies carry no body, so only the status can be compared there. */
function answered(
  method: string,
  res: { statusCode: number; body: string },
  status: number,
  error: string,
) {
  if (res.statusCode !== status) return false;
  return method === "HEAD" || res.body === JSON.stringify({ error });
}

// The ONE place that says which routes need no session cookie. If this list
// changes, a reviewer must look at why: every entry here is reachable by
// anyone on the internet.
const ANONYMOUS_ROUTES = [
  "GET /health",
  "HEAD /health",
  "POST /auth/email-signup/eligibility",
  "POST /auth/email-signup",
  "POST /auth/login",
  "POST /auth/logout",
  "POST /discover/publisher-favicon",
  "POST /discover/publisher-requests",
  "POST /client-bookings",
  "POST /service-transactions/:transactionId/notify-owner",
  // Public native command with a client-selected recipient. It intentionally
  // performs no canonical Firestore read; strict body bounds and a fixed
  // server template are its only application-level abuse controls.
  "POST /service-transactions/notify-requester",
  // /internal/openapi/* skips the cookie hook; the handlers demand a Bearer
  // reporting token instead (asserted below). oauth/token is the
  // client-credentials exchange that MINTS that token.
  "POST /internal/openapi/oauth/token",
  "GET /internal/openapi/reporting/patients",
  "HEAD /internal/openapi/reporting/patients",
  "GET /internal/openapi/reporting/patients/:patientId",
  "HEAD /internal/openapi/reporting/patients/:patientId",
  "POST /internal/openapi/reporting/reports/upload",
  "GET /internal/openapi/reporting/2pq/cases/:caseCode",
  "HEAD /internal/openapi/reporting/2pq/cases/:caseCode",
].sort();

// @fastify/cors's catch-all preflight route. It answers in cors's own
// onRequest hook (registered before the auth hook) — see the preflight test.
const CORS_PREFLIGHT = "OPTIONS *";

function gatedRoutes() {
  return routes.filter(
    (r) => key(r) !== CORS_PREFLIGHT && !ANONYMOUS_ROUTES.includes(key(r)),
  );
}

describe("route inventory", () => {
  it("collects the whole API (sanity: the walk below is not vacuous)", () => {
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.map(key)).toContain(CORS_PREFLIGHT);
    expect(routes.map(key)).toContain("GET /roles");
    expect(routes.map(key)).toContain("GET /gym/members");
  });

  it("(a) pins exactly which routes the global hook lets through anonymously", async () => {
    const { isPublicPath } = await import("../server.js");
    const anonymous = routes
      .filter((r) => r.url !== "*" && isPublicPath(concretePath(r.url)))
      .map(key)
      .sort();
    expect(anonymous).toEqual(ANONYMOUS_ROUTES);
  });

  it("(a) the pinned anonymous routes really skip the cookie check", async () => {
    for (const route of routes.filter((r) => ANONYMOUS_ROUTES.includes(key(r)))) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
      });
      // Whatever the handler says (400 on an empty body, 401 for a missing
      // Bearer, 200 for /health), it must not be the hook's cookie rejection.
      expect({ route: key(route), body: res.body }).not.toEqual({
        route: key(route),
        body: JSON.stringify({ error: "No session cookie" }),
      });
    }
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
  });

  it("CORS preflight answers without a session and never reaches the auth check", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/roles",
      headers: {
        origin: "http://localhost:3001",
        "access-control-request-method": "GET",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
  });
});

describe("(b) every non-public route requires a session cookie", () => {
  it("401 No session cookie on every gated route", async () => {
    const failures: string[] = [];
    for (const route of gatedRoutes()) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
      });
      if (!answered(route.method, res, 401, "No session cookie")) {
        failures.push(`${key(route)} → ${res.statusCode} ${res.body.slice(0, 80)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(gatedRoutes().length).toBeGreaterThan(300);
  });

  it("401 on every gated route when the session cookie is revoked", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("auth/session-cookie-revoked"));
    const failures: string[] = [];
    for (const route of gatedRoutes()) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
        cookies: { session: "revoked" },
      });
      if (res.statusCode !== 401) failures.push(`${key(route)} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });
});

describe.each([
  {
    label: "patient-portal-only",
    context: contextFor(["patient"], { patientId: "p1" }),
    allowedPath: isPatientPortalSdkPath,
    error: "This patient portal session cannot access backoffice APIs",
  },
  {
    label: "PGFlex-only",
    context: contextFor(["pgflex"]),
    allowedPath: isPGFlexSdkPath,
    error: "This PGFlex session cannot access backoffice APIs",
  },
  {
    label: "publisher-only",
    context: contextFor(["publisher"], { organizationId: "org-1" }),
    allowedPath: isPublisherPortalSdkPath,
    error: "This publisher portal session cannot access backoffice APIs",
  },
])("(c/d) $label session", ({ context, allowedPath, error }) => {
  beforeEach(() => mockResolveAdminContext.mockResolvedValue(context));

  it("403 on every gated route outside its allowlist (full matrix)", async () => {
    const outside = gatedRoutes().filter((r) => !allowedPath(concretePath(r.url)));
    expect(outside.length).toBeGreaterThan(250);
    const failures: string[] = [];
    for (const route of outside) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
        cookies: { session: "valid" },
      });
      if (!answered(route.method, res, 403, error)) {
        failures.push(`${key(route)} → ${res.statusCode} ${res.body.slice(0, 80)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("the hook does not block the routes inside its allowlist", async () => {
    const inside = gatedRoutes().filter((r) => allowedPath(concretePath(r.url)));
    expect(inside.length).toBeGreaterThan(3);
    const blocked: string[] = [];
    for (const route of inside) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
        cookies: { session: "valid" },
      });
      // The handler may still refuse (400/403/404/500 with inert Firebase),
      // but never with the surface gate's own message.
      if (res.statusCode === 403 && res.body.includes("cannot access backoffice APIs")) {
        blocked.push(key(route));
      }
    }
    expect(blocked).toEqual([]);
  });
});

describe("/gym project-access gate (whole app)", () => {
  const gymRoutes = () => gatedRoutes().filter((r) => r.url.startsWith("/gym/"));

  it("a backoffice session WITHOUT pocket-gyms gets 403 on every /gym route", async () => {
    mockResolveAdminContext.mockResolvedValue(
      contextFor(["backoffice"], { projectAccess: ["mydnamap"] }),
    );
    expect(gymRoutes().length).toBeGreaterThan(50);
    const failures: string[] = [];
    for (const route of gymRoutes()) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
        cookies: { session: "valid" },
      });
      if (res.statusCode !== 403) failures.push(`${key(route)} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });

  it("a backoffice session WITH pocket-gyms passes the gate", async () => {
    mockResolveAdminContext.mockResolvedValue(
      contextFor(["backoffice"], { projectAccess: ["mydnamap", "pocket-gyms"] }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/gym/members",
      cookies: { session: "valid" },
    });
    expect(res.json().error).not.toBe("No access to pocket-gyms project");
  });

  // Regression (#451): the gate compared the RAW request.url with "/gym/",
  // but the router percent-decodes before matching, so GET /%67ym/members
  // skipped it and ran the /gym/members handler — Pocket Gyms data for a
  // session without pocket-gyms access. The gate now uses the matched route.
  it("percent-encoded /gym paths are gated too (GET /%67ym/members)", async () => {
    mockResolveAdminContext.mockResolvedValue(
      contextFor(["backoffice"], { projectAccess: ["mydnamap"] }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/%67ym/members",
      cookies: { session: "valid" },
    });
    expect(res.statusCode).toBe(403);
  });

  // Control for the test above: the encoded path DOES route to the gym
  // handler, so its 403 comes from the gate — not from a 404.
  it("control: /%67ym/members reaches the /gym/members handler with pocket-gyms access", async () => {
    mockResolveAdminContext.mockResolvedValue(
      contextFor(["backoffice"], { projectAccess: ["mydnamap", "pocket-gyms"] }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/%67ym/members",
      cookies: { session: "valid" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain("firebase is not available in this test");
  });
});

describe("/internal/openapi/* — public to the hook, but Bearer-protected", () => {
  // Valid inputs, so the request clears schema validation and the ONLY thing
  // missing is the Bearer reporting token.
  const BEARER_ROUTES: Array<{ method: string; url: string; payload?: object }> = [
    { method: "GET", url: "/internal/openapi/reporting/patients?patientId=p1" },
    { method: "HEAD", url: "/internal/openapi/reporting/patients?patientId=p1" },
    { method: "GET", url: "/internal/openapi/reporting/patients/p1" },
    { method: "HEAD", url: "/internal/openapi/reporting/patients/p1" },
    {
      method: "POST",
      url: "/internal/openapi/reporting/reports/upload",
      payload: { caseCode: "ABC123", download_url: "https://example.com/r.pdf" },
    },
    { method: "GET", url: "/internal/openapi/reporting/2pq/cases/ABC123" },
    { method: "HEAD", url: "/internal/openapi/reporting/2pq/cases/ABC123" },
  ];

  it("covers every Bearer-protected /internal/openapi route", () => {
    const registered = routes
      .filter((r) => r.url.startsWith("/internal/openapi/") && r.url !== "/internal/openapi/oauth/token")
      .map((r) => `${r.method} ${concretePath(r.url)}`)
      .sort();
    const covered = BEARER_ROUTES.map(
      (r) => `${r.method} ${r.url.split("?")[0]!.replace(/\/p1$/, "/x1").replace(/ABC123$/, "x1")}`,
    ).sort();
    expect(covered).toEqual(registered);
  });

  it.each([
    ["no Authorization header", undefined],
    ["a Basic credential", "Basic dXNlcjpwYXNz"],
    ["an empty Bearer", "Bearer "],
  ])("401 with %s", async (_label, authorization) => {
    for (const route of BEARER_ROUTES) {
      const res = await app.inject({
        method: route.method as "GET",
        url: route.url,
        ...(route.payload ? { payload: route.payload } : {}),
        headers: authorization ? { authorization } : {},
      });
      expect({ route: `${route.method} ${route.url}`, status: res.statusCode }).toEqual({
        route: `${route.method} ${route.url}`,
        status: 401,
      });
    }
    expect(mockVerifyReportingAccessToken).not.toHaveBeenCalled();
  });

  it("a backoffice session cookie does not substitute for the Bearer token", async () => {
    mockResolveAdminContext.mockResolvedValue(contextFor(["backoffice"]));
    const res = await app.inject({
      method: "GET",
      url: "/internal/openapi/reporting/patients/p1",
      cookies: { session: "valid" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Missing reporting access token." });
  });

  it("POST /internal/openapi/oauth/token rejects a request without client credentials (400)", async () => {
    for (const payload of [undefined, {}, { grant_type: "client_credentials" }, { grant_type: "password", client_id: "a", client_secret: "b" }]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/openapi/oauth/token",
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
