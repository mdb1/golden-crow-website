// auth.route.test.ts — /api/auth/* after next-auth (#470).
//
// Pins: login goes through the SDK (auth/login) and mints the new cookie;
// /session answers next-auth's shape and migrates a REAL next-auth v4 cookie;
// logout expires every cookie; cross-site POSTs are refused; and the next-auth
// wire protocol that pre-deploy tabs still speak keeps working.

import { NextRequest } from "next/server";
import fixtures from "@/lib/__tests__/fixtures/next-auth-v4-sessions.json";
import {
  SECURE_SESSION_COOKIE_NAME,
  decodeSessionToken,
  encodeSessionToken,
} from "@/lib/backoffice-session";
import { GET, POST } from "@/app/api/auth/[...auth]/route";

const ORIGIN = "https://bo.test";
const LEGACY = "__Secure-next-auth.session-token";

function call(
  method: "GET" | "POST",
  path: string,
  init: { body?: string; headers?: Record<string, string>; cookies?: Record<string, string> } = {},
) {
  const headers = new Headers(init.headers);
  if (init.cookies) {
    headers.set(
      "cookie",
      Object.entries(init.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    );
  }
  const req = new NextRequest(new URL(`/api/auth/${path}`, ORIGIN), {
    method,
    body: init.body,
    headers,
  });
  return (method === "GET" ? GET : POST)(req, { params: Promise.resolve({ auth: path.split("/") }) });
}

function setCookies(res: Response) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair, ...attrs] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), attrs: attrs.join(";").toLowerCase() };
  });
}

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const env = { ...process.env };

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = fixtures.secret;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...env };
});

function sdkOk(body: unknown = { status: "ok", uid: "uid-real", email: "real@x.com" }) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("POST /api/auth/login", () => {
  it("verifies with the SDK and sets the new httpOnly cookie", async () => {
    sdkOk();
    const res = await call("POST", "login", {
      body: JSON.stringify({ idToken: "tok", name: "Real", email: "spoof@x.com", image: "", project: "pocket-gyms", accessSurface: "publisher-portal" }),
      headers: { "content-type": "application/json", origin: ORIGIN },
      cookies: { [LEGACY]: fixtures.backoffice },
    });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/login$/);
    expect(JSON.parse(init.body)).toEqual({ idToken: "tok", surface: "publisher-portal" });

    const body = await res.json();
    expect(body.session.user).toMatchObject({ email: "real@x.com", project: "pocket-gyms", accessSurface: "publisher-portal" });

    const cookies = setCookies(res);
    const session = cookies.find((c) => c.name === SECURE_SESSION_COOKIE_NAME)!;
    expect(session.attrs).toContain("httponly");
    expect(session.attrs).toContain("secure");
    expect(session.attrs).toContain("samesite=lax");
    await expect(decodeSessionToken(session.value, fixtures.secret)).resolves.toMatchObject({
      sub: "uid-real",
      email: "real@x.com",
      project: "pocket-gyms",
      accessSurface: "publisher-portal",
    });
    // The previous account's legacy cookie is expired by a fresh login.
    expect(cookies.find((c) => c.name === LEGACY)?.attrs).toMatch(/max-age=0|expires=/);
  });

  it("SDK rejection (not in TEAM_ALLOWLIST, bad token) → 401, no cookie", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    const res = await call("POST", "login", { body: JSON.stringify({ idToken: "bad" }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "CredentialsSignin" });
    expect(setCookies(res)).toEqual([]);
  });

  it("no idToken → 400 without calling the SDK", async () => {
    const res = await call("POST", "login", { body: "{}" });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("missing NEXTAUTH_SECRET → 500, no SDK call", async () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("POST", "login", { body: JSON.stringify({ idToken: "t" }) });
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it.each([
    [{ origin: "https://evil.test" }],
    [{ "sec-fetch-site": "cross-site" }],
  ])("cross-site POST %j → 403", async (headers) => {
    const res = await call("POST", "login", { body: JSON.stringify({ idToken: "t" }), headers });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/session", () => {
  it("no cookie → {} (what next-auth returned)", async () => {
    const res = await call("GET", "session");
    expect(await res.json()).toEqual({});
    expect(setCookies(res)).toEqual([]);
  });

  it("forged / expired cookies → {}", async () => {
    for (const cookies of <Record<string, string>[]>[
      { [SECURE_SESSION_COOKIE_NAME]: "forged" },
      { [LEGACY]: fixtures.expired },
      { [LEGACY]: fixtures.otherSecret },
    ]) {
      const res = await call("GET", "session", { cookies });
      expect(await res.json()).toEqual({});
    }
  });

  it("migrates a real next-auth v4 cookie: same session, new cookie, legacy kept for rollback", async () => {
    const res = await call("GET", "session", { cookies: { [LEGACY]: fixtures.pgflex } });
    const body = await res.json();
    expect(body.user).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://lh3.googleusercontent.com/a/ada",
      project: "mydnamap",
      accessSurface: "pgflex",
    });
    const cookies = setCookies(res);
    expect(cookies.map((c) => c.name)).toEqual([SECURE_SESSION_COOKIE_NAME]);
    await expect(decodeSessionToken(cookies[0].value, fixtures.secret)).resolves.toMatchObject({
      sub: "uid-ada",
      accessSurface: "pgflex",
    });
  });

  it("a fresh current cookie is returned without rewriting it", async () => {
    const token = await encodeSessionToken({ email: "a@b.c", project: "mydnamap" }, fixtures.secret);
    const res = await call("GET", "session", { cookies: { [SECURE_SESSION_COOKIE_NAME]: token } });
    expect((await res.json()).user).toMatchObject({ email: "a@b.c", accessSurface: "backoffice" });
    expect(setCookies(res)).toEqual([]);
  });
});

describe("POST /api/auth/logout", () => {
  it("expires the new and the legacy cookies", async () => {
    const res = await call("POST", "logout", {
      cookies: { [LEGACY]: fixtures.backoffice, [`${LEGACY}.0`]: "x" },
    });
    expect(res.status).toBe(200);
    const names = setCookies(res).map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([SECURE_SESSION_COOKIE_NAME, "backoffice.session-token", LEGACY, "next-auth.session-token", `${LEGACY}.0`]),
    );
  });
});

describe("TRANSITION: next-auth/react wire protocol for pre-deploy tabs", () => {
  it("csrf + providers answer like next-auth", async () => {
    const csrf = await (await call("GET", "csrf")).json();
    expect(typeof csrf.csrfToken).toBe("string");
    const providers = await (await call("GET", "providers")).json();
    expect(providers.credentials).toMatchObject({ id: "credentials", type: "credentials" });
  });

  it("POST callback/credentials signs in and answers { url }", async () => {
    sdkOk();
    const form = new URLSearchParams({
      idToken: "tok",
      name: "Real",
      email: "real@x.com",
      image: "",
      project: "mydnamap",
      accessSurface: "backoffice",
      csrfToken: "whatever",
      callbackUrl: `${ORIGIN}/2pq-dashboard`,
      json: "true",
    });
    const res = await call("POST", "callback/credentials", {
      body: form.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: `${ORIGIN}/2pq-dashboard` });
    expect(setCookies(res).some((c) => c.name === SECURE_SESSION_COOKIE_NAME)).toBe(true);
  });

  it("a rejected credentials callback answers 401 with next-auth's error url", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const res = await call("POST", "callback/credentials", { body: "idToken=bad" });
    expect(res.status).toBe(401);
    const { url } = await res.json();
    expect(new URL(url).searchParams.get("error")).toBe("CredentialsSignin");
  });

  it("callbackUrl to another host is not echoed (open redirect)", async () => {
    sdkOk();
    const res = await call("POST", "callback/credentials", {
      body: new URLSearchParams({ idToken: "t", callbackUrl: "https://evil.test/x" }).toString(),
    });
    expect(await res.json()).toEqual({ url: `${ORIGIN}/` });
  });

  it("POST signout clears cookies and answers { url }", async () => {
    const res = await call("POST", "signout", {
      body: new URLSearchParams({ csrfToken: "x", callbackUrl: "/patient-portal/login", json: "true" }).toString(),
      cookies: { [LEGACY]: fixtures.backoffice },
    });
    expect(await res.json()).toEqual({ url: `${ORIGIN}/patient-portal/login` });
    expect(setCookies(res).map((c) => c.name)).toContain(LEGACY);
  });

  it("GET error → /access-denied, GET signin → /login, unknown → 404", async () => {
    const err = await call("GET", "error");
    expect(err.status).toBe(307);
    expect(new URL(err.headers.get("location")!).pathname).toBe("/access-denied");
    const signin = await call("GET", "signin");
    expect(new URL(signin.headers.get("location")!).pathname).toBe("/login");
    expect((await call("GET", "nope")).status).toBe(404);
    expect((await call("POST", "_log", { body: "" })).status).toBe(200);
  });
});
