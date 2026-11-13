// backoffice-session.ts — the Pocket Genes / Pocket Gyms backoffice session
// cookie (#470: replaces next-auth).
//
// What it is: an httpOnly cookie holding a JWE (`dir` + A256GCM) whose payload
// is the identity the SDK verified at login (`POST /auth/login` + the
// per-project TEAM_ALLOWLIST) plus `project` and `accessSurface`. It is the
// same security model next-auth's `strategy: "jwt"` gave us — no adapter, no
// DB — minus the next-auth dependency.
//
// Pure module: no `next/headers`, no React. It runs in `proxy.ts`, in route
// handlers, in Server Components (through `session.ts`) and in tests.
//
// ── No-logout transition (sunset: 30 days after #470 ships) ──────────────
// Sessions minted before #470 live in `__Secure-next-auth.session-token`
// (`next-auth.session-token` over http), encrypted by next-auth v4 with a key
// derived from NEXTAUTH_SECRET (HKDF-SHA256, info "NextAuth.js Generated
// Encryption Key"). `readSessionFromCookies` still accepts that cookie and
// reports `source: "legacy"`; the proxy and `/api/auth/session` then re-issue
// it as the new cookie. The legacy cookie is deliberately NOT deleted on
// migration, so a `vercel rollback` keeps those users signed in; it is
// deleted on logout and on a fresh login. Nothing refreshes a legacy cookie
// after #470 ships and next-auth's maxAge was 30 days, so 30 days after the
// production deploy (target: 2026-12-31) no valid legacy cookie exists: delete
// `decodeLegacyNextAuthToken`, `LEGACY_COOKIE_NAMES` and the compat endpoints
// in `app/api/auth/[...auth]/route.ts` in a separate PR.
//
// NEXTAUTH_SECRET stays: it is ALSO the root secret of the new cookie (through
// a different HKDF label, so neither key can open the other's tokens).
// Renaming the env var would sign every user out; the name is historical.

import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";

export type AccessSurface =
  | "backoffice"
  | "patient-portal"
  | "pgflex"
  | "publisher-portal";

/** Same shape next-auth's `session` callback produced (see the old auth.ts). */
export type Session = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    project?: string;
    accessSurface?: AccessSurface;
  };
  expires: string;
};

/** What the cookie carries. Field names match next-auth's JWT on purpose. */
export type SessionTokenClaims = {
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  sub?: string;
  project?: string;
  accessSurface?: AccessSurface;
};

export type SessionSource = "current" | "legacy";

export type ReadSession = {
  session: Session;
  claims: SessionTokenClaims;
  source: SessionSource;
  /** Seconds since epoch the token was issued (for rolling refresh). */
  issuedAt: number;
};

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** A current cookie older than this is re-issued (rolling 30-day session). */
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

export const SESSION_COOKIE_NAME = "backoffice.session-token";
export const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;
export const SESSION_COOKIE_NAMES = [
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
] as const;

/** TRANSITION (#470, remove 30 days after it ships). */
export const LEGACY_COOKIE_NAMES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

const SESSION_KEY_INFO = "Golden Crow Backoffice Session Encryption Key v1";
const LEGACY_KEY_INFO = "NextAuth.js Generated Encryption Key";
const CLOCK_TOLERANCE_SECONDS = 15;

export function normalizeAccessSurface(value: unknown): AccessSurface {
  return value === "patient-portal" ||
    value === "pgflex" ||
    value === "publisher-portal"
    ? value
    : "backoffice";
}

export function getSessionSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.NEXTAUTH_SECRET || env.AUTH_SECRET || null;
}

const keyCache = new Map<string, Promise<Uint8Array>>();

async function deriveKey(secret: string, info: string): Promise<Uint8Array> {
  const cacheKey = `${info}\u0000${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = (async () => {
      const enc = new TextEncoder();
      const ikm = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        "HKDF",
        false,
        ["deriveBits"],
      );
      const bits = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) },
        ikm,
        256,
      );
      return new Uint8Array(bits);
    })();
    keyCache.set(cacheKey, key);
  }
  return key;
}

function pickClaims(payload: JWTPayload): SessionTokenClaims {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    name: str(payload.name),
    email: str(payload.email),
    picture: str(payload.picture),
    sub: typeof payload.sub === "string" ? payload.sub : undefined,
    project: typeof payload.project === "string" ? payload.project : undefined,
    accessSurface: normalizeAccessSurface(payload.accessSurface),
  };
}

export async function encodeSessionToken(
  claims: SessionTokenClaims,
  secret: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const key = await deriveKey(secret, SESSION_KEY_INFO);
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({
    name: claims.name ?? null,
    email: claims.email ?? null,
    picture: claims.picture ?? null,
    project: claims.project,
    accessSurface: normalizeAccessSurface(claims.accessSurface),
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(claims.sub ?? claims.email ?? "")
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .setJti(crypto.randomUUID())
    .encrypt(key);
}

async function decodeWith(
  token: string,
  secret: string,
  info: string,
): Promise<JWTPayload | null> {
  try {
    const key = await deriveKey(secret, info);
    const { payload } = await jwtDecrypt(token, key, {
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return typeof payload.exp === "number" ? payload : null;
  } catch {
    // Expired, tampered, wrong key, or not a JWE at all.
    return null;
  }
}

export function decodeSessionToken(token: string, secret: string) {
  return decodeWith(token, secret, SESSION_KEY_INFO);
}

/** TRANSITION (#470, remove 30 days after it ships): next-auth v4 `jwt.decode`. */
export function decodeLegacyNextAuthToken(token: string, secret: string) {
  return decodeWith(token, secret, LEGACY_KEY_INFO);
}

/**
 * Mirrors next-auth's default `session` callback + the old custom one:
 * `image` comes from `picture`, `project` only when truthy, `accessSurface`
 * always normalized. `expires` is the token's own expiry.
 */
export function toSession(claims: SessionTokenClaims, exp: number): Session {
  const user: Session["user"] = {
    name: claims.name ?? null,
    email: claims.email ?? null,
    image: claims.picture ?? null,
  };
  if (claims.project) user.project = claims.project;
  user.accessSurface = normalizeAccessSurface(claims.accessSurface);
  return { user, expires: new Date(exp * 1000).toISOString() };
}

type CookieGetter = (name: string) => string | undefined;

/** next-auth splits cookies over 4 KB into `<name>.0`, `<name>.1`, … */
function readChunked(get: CookieGetter, allNames: string[], name: string) {
  const whole = get(name);
  if (whole) return whole;
  const chunks = allNames
    .filter((n) => n.startsWith(`${name}.`) && /^\d+$/.test(n.slice(name.length + 1)))
    .sort((a, b) => Number(a.slice(name.length + 1)) - Number(b.slice(name.length + 1)));
  if (!chunks.length) return undefined;
  return chunks.map((n) => get(n) ?? "").join("");
}

/**
 * Resolves the session from a cookie jar: the new cookie first, then (during
 * the transition) the next-auth one. Returns null for no / expired / forged
 * cookies or when the secret is missing (fail closed).
 */
export async function readSessionFromCookies(
  cookies: { get: CookieGetter; names: string[] },
  secret: string | null = getSessionSecret(),
): Promise<ReadSession | null> {
  if (!secret) return null;

  for (const name of SESSION_COOKIE_NAMES) {
    const token = cookies.get(name);
    if (!token) continue;
    const payload = await decodeSessionToken(token, secret);
    if (payload) {
      const claims = pickClaims(payload);
      return {
        session: toSession(claims, payload.exp!),
        claims,
        source: "current",
        issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
      };
    }
  }

  for (const name of LEGACY_COOKIE_NAMES) {
    const token = readChunked(cookies.get, cookies.names, name);
    if (!token) continue;
    const payload = await decodeLegacyNextAuthToken(token, secret);
    if (payload) {
      const claims = pickClaims(payload);
      return {
        session: toSession(claims, payload.exp!),
        claims,
        source: "legacy",
        issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
      };
    }
  }

  return null;
}

/** Adapter for NextRequest#cookies / `cookies()` from next/headers. */
export function cookieJar(store: {
  get(name: string): { value: string } | undefined;
  getAll(): { name: string }[];
}) {
  return {
    get: (name: string) => store.get(name)?.value,
    names: store.getAll().map((c) => c.name),
  };
}

/** True when the request came over https (directly or via Vercel's edge). */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}

export function sessionCookieName(secure: boolean) {
  return secure ? SECURE_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
}

export function sessionCookieOptions(secure: boolean, maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    maxAge,
  };
}

/** Whether a valid session should be (re-)issued as the new cookie. */
export function shouldReissue(read: ReadSession, nowSeconds = Math.floor(Date.now() / 1000)) {
  return (
    read.source === "legacy" ||
    nowSeconds - read.issuedAt > SESSION_UPDATE_AGE_SECONDS
  );
}

type CookieWriter = {
  set(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): unknown;
};

/** Writes a fresh 30-day cookie for `claims` onto a response cookie jar. */
export async function writeSessionCookie(
  jar: CookieWriter,
  claims: SessionTokenClaims,
  secure: boolean,
  secret: string,
) {
  const token = await encodeSessionToken(claims, secret);
  jar.set(sessionCookieName(secure), token, sessionCookieOptions(secure));
}

/**
 * Expires every session cookie — new, legacy and legacy chunks. Used by
 * logout and by a fresh login (so a stale legacy cookie of another account
 * can't resurface after a rollback).
 */
export function clearSessionCookies(
  jar: CookieWriter,
  existingNames: string[],
  { includeCurrent = true }: { includeCurrent?: boolean } = {},
) {
  const names = new Set<string>(LEGACY_COOKIE_NAMES);
  if (includeCurrent) SESSION_COOKIE_NAMES.forEach((n) => names.add(n));
  for (const n of existingNames) {
    if (LEGACY_COOKIE_NAMES.some((l) => n.startsWith(`${l}.`))) names.add(n);
  }
  for (const name of names) {
    jar.set(name, "", { ...sessionCookieOptions(name.startsWith("__Secure-"), 0) });
  }
}
