// /api/auth/* — Pocket Genes / Pocket Gyms backoffice session endpoints
// (#470: replaces the next-auth catch-all at the same path).
//
//   POST /api/auth/login    { idToken, name, email, image, project, accessSurface }
//                           → SDK verifies (auth/login + TEAM_ALLOWLIST) → cookie
//   GET  /api/auth/session  → the session JSON next-auth returned, or {}
//                             (a legacy next-auth cookie is re-issued here)
//   POST /api/auth/logout   → expires every session cookie
//
// TRANSITION (#470, remove 30 days after it ships, with the legacy cookie):
// tabs opened BEFORE the deploy still run next-auth/react's client, which
// speaks next-auth's wire protocol. These endpoints answer it so an old tab
// can still sign in / out without a reload:
//
//   GET  /api/auth/csrf, /api/auth/providers
//   POST /api/auth/callback/credentials   (form-encoded, `json=true`)
//   POST /api/auth/signout                (form-encoded, `json=true`)
//   GET  /api/auth/signin, /api/auth/error → the login / access-denied pages
//   POST /api/auth/_log                   (next-auth's client logger) → 200
//
// next-auth guarded POSTs with a double-submit CSRF cookie. Here every POST
// must be same-origin instead (Origin / Sec-Fetch-Site), which also covers
// old tabs: their requests are same-origin fetches.

import { NextResponse, type NextRequest } from "next/server";
import { authorizeCredentials, type LoginCredentials } from "@/lib/auth";
import {
  clearSessionCookies,
  cookieJar,
  getSessionSecret,
  isSecureRequest,
  readSessionFromCookies,
  shouldReissue,
  toSession,
  writeSessionCookie,
  SESSION_MAX_AGE_SECONDS,
  type SessionTokenClaims,
} from "@/lib/backoffice-session";

type Context = { params: Promise<{ auth: string[] }> };

const CREDENTIAL_FIELDS = [
  "idToken",
  "name",
  "email",
  "image",
  "project",
  "accessSurface",
] as const;

function requestHost(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  );
}

function publicOrigin(request: NextRequest) {
  return `${isSecureRequest(request) ? "https" : "http"}://${requestHost(request)}`;
}

/** Rejects cross-site POSTs (login CSRF / forced logout). */
function isSameOriginPost(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === requestHost(request);
  } catch {
    return false;
  }
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "private, no-cache, no-store");
  return res;
}

function pickCredentials(source: Record<string, unknown>): LoginCredentials {
  const out: LoginCredentials = {};
  for (const field of CREDENTIAL_FIELDS) {
    const v = source[field];
    if (typeof v === "string") out[field] = v;
  }
  return out;
}

async function readForm(request: NextRequest): Promise<Record<string, string>> {
  try {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  } catch {
    return {};
  }
}

/** Shared by the new JSON login and the legacy next-auth credentials callback. */
async function startSession(
  request: NextRequest,
  credentials: LoginCredentials,
): Promise<{ ok: true; claims: SessionTokenClaims } | { ok: false; status: number }> {
  const secret = getSessionSecret();
  if (!secret) {
    console.error("[auth] NEXTAUTH_SECRET is not set — cannot mint a session.");
    return { ok: false, status: 500 };
  }
  const user = await authorizeCredentials(credentials);
  if (!user) return { ok: false, status: 401 };
  return {
    ok: true,
    claims: {
      name: user.name,
      email: user.email,
      picture: user.image,
      sub: user.id,
      project: user.project,
      accessSurface: user.accessSurface,
    },
  };
}

async function issue(
  request: NextRequest,
  res: NextResponse,
  claims: SessionTokenClaims,
) {
  // A fresh login replaces whatever was there, including a legacy cookie of
  // another account that would otherwise resurface after a rollback.
  clearSessionCookies(res.cookies, request.cookies.getAll().map((c) => c.name), {
    includeCurrent: false,
  });
  await writeSessionCookie(res.cookies, claims, isSecureRequest(request), getSessionSecret()!);
}

async function handleLogin(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const credentials = pickCredentials(body ?? {});
  if (!credentials.idToken) {
    return noStore(NextResponse.json({ error: "idToken is required." }, { status: 400 }));
  }
  const result = await startSession(request, credentials);
  if (!result.ok) {
    return noStore(
      NextResponse.json(
        { error: result.status === 401 ? "CredentialsSignin" : "Configuration" },
        { status: result.status },
      ),
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const res = NextResponse.json({
    ok: true,
    session: toSession(result.claims, now + SESSION_MAX_AGE_SECONDS),
  });
  await issue(request, res, result.claims);
  return noStore(res);
}

async function handleSession(request: NextRequest) {
  const read = await readSessionFromCookies(cookieJar(request.cookies));
  if (!read) return noStore(NextResponse.json({}));
  const now = Math.floor(Date.now() / 1000);
  if (!shouldReissue(read, now)) return noStore(NextResponse.json(read.session));
  // Legacy cookie (migration) or a day-old current one (rolling 30 days).
  const res = NextResponse.json(toSession(read.claims, now + SESSION_MAX_AGE_SECONDS));
  await writeSessionCookie(res.cookies, read.claims, isSecureRequest(request), getSessionSecret()!);
  return noStore(res);
}

function handleLogout(request: NextRequest, body: unknown) {
  const res = NextResponse.json(body);
  clearSessionCookies(res.cookies, request.cookies.getAll().map((c) => c.name));
  return noStore(res);
}

// ── TRANSITION: next-auth v4 client wire protocol (old tabs) ─────────────

function legacyProviders(request: NextRequest) {
  const base = `${publicOrigin(request)}/api/auth`;
  return {
    credentials: {
      id: "credentials",
      name: "Google via Firebase",
      type: "credentials",
      signinUrl: `${base}/signin/credentials`,
      callbackUrl: `${base}/callback/credentials`,
    },
  };
}

function safeCallbackUrl(request: NextRequest, raw: string | undefined, fallback: string) {
  const origin = publicOrigin(request);
  try {
    const url = new URL(raw || fallback, origin);
    return url.host === requestHost(request) ? url.toString() : `${origin}${fallback}`;
  } catch {
    return `${origin}${fallback}`;
  }
}

async function handleLegacyCredentialsCallback(request: NextRequest) {
  const form = await readForm(request);
  const credentials = pickCredentials(form);
  const result = await startSession(request, credentials);
  if (!result.ok) {
    const error = result.status === 401 ? "CredentialsSignin" : "Configuration";
    return noStore(
      NextResponse.json(
        { url: `${publicOrigin(request)}/api/auth/error?error=${error}&provider=credentials` },
        { status: result.status === 401 ? 401 : 500 },
      ),
    );
  }
  const res = NextResponse.json({ url: safeCallbackUrl(request, form.callbackUrl, "/") });
  await issue(request, res, result.claims);
  return noStore(res);
}

async function dispatch(request: NextRequest, context: Context) {
  const { auth } = await context.params;
  const action = auth.join("/");
  const method = request.method.toUpperCase();

  if (method === "POST" && !isSameOriginPost(request)) {
    return noStore(NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 }));
  }

  if (method === "GET") {
    switch (action) {
      case "session":
        return handleSession(request);
      case "csrf":
        return noStore(NextResponse.json({ csrfToken: crypto.randomUUID().replace(/-/g, "") }));
      case "providers":
        return noStore(NextResponse.json(legacyProviders(request)));
      case "error": {
        const url = new URL("/access-denied", publicOrigin(request));
        const error = request.nextUrl.searchParams.get("error");
        if (error) url.searchParams.set("error", error);
        return NextResponse.redirect(url);
      }
      default:
        if (action === "signin" || action.startsWith("signin/") || action === "signout") {
          return NextResponse.redirect(new URL("/login", publicOrigin(request)));
        }
    }
  }

  if (method === "POST") {
    switch (action) {
      case "login":
        return handleLogin(request);
      case "logout":
        return handleLogout(request, { ok: true });
      case "callback/credentials":
        return handleLegacyCredentialsCallback(request);
      case "signout": {
        const form = await readForm(request);
        return handleLogout(request, { url: safeCallbackUrl(request, form.callbackUrl, "/login") });
      }
      case "_log":
        return noStore(NextResponse.json({}));
      case "session":
        // next-auth's `update()`; never used here, answer like a read.
        return handleSession(request);
    }
  }

  return noStore(NextResponse.json({ error: "Not found." }, { status: 404 }));
}

export { dispatch as GET, dispatch as POST };
