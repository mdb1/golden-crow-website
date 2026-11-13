// backoffice-session.test.ts — the cookie that replaced next-auth (#470).
//
// The legacy fixtures were generated with the REAL next-auth@4.24.15
// `jwt.encode` before the package was removed (see the fixture's _comment):
// they prove a session minted by production next-auth still opens here.

import { EncryptJWT } from "jose";
import fixtures from "./fixtures/next-auth-v4-sessions.json";
import {
  LEGACY_COOKIE_NAMES,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  clearSessionCookies,
  decodeLegacyNextAuthToken,
  decodeSessionToken,
  encodeSessionToken,
  readSessionFromCookies,
  sessionCookieOptions,
  shouldReissue,
  writeSessionCookie,
} from "@/lib/backoffice-session";

const SECRET = fixtures.secret;

function jar(cookies: Record<string, string>) {
  return { get: (n: string) => cookies[n], names: Object.keys(cookies) };
}

const claims = {
  name: "Ada",
  email: "ada@example.com",
  picture: "https://img/ada",
  sub: "uid-ada",
  project: "mydnamap",
  accessSurface: "pgflex" as const,
};

describe("current cookie", () => {
  it("round-trips the claims and expires in 30 days", async () => {
    const token = await encodeSessionToken(claims, SECRET);
    const payload = await decodeSessionToken(token, SECRET);
    expect(payload).toMatchObject({ ...claims });
    expect(payload!.exp! - payload!.iat!).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("reads into the next-auth session shape", async () => {
    const token = await encodeSessionToken(claims, SECRET);
    const read = await readSessionFromCookies(jar({ [SECURE_SESSION_COOKIE_NAME]: token }), SECRET);
    expect(read?.source).toBe("current");
    expect(read?.session.user).toEqual({
      name: "Ada",
      email: "ada@example.com",
      image: "https://img/ada",
      project: "mydnamap",
      accessSurface: "pgflex",
    });
    expect(Date.parse(read!.session.expires)).toBeGreaterThan(Date.now());
  });

  it("reads the non-secure name too (http / local dev)", async () => {
    const token = await encodeSessionToken(claims, SECRET);
    const read = await readSessionFromCookies(jar({ [SESSION_COOKIE_NAME]: token }), SECRET);
    expect(read?.source).toBe("current");
  });

  it("rejects an expired cookie", async () => {
    const token = await encodeSessionToken(claims, SECRET, -60);
    await expect(decodeSessionToken(token, SECRET)).resolves.toBeNull();
    await expect(
      readSessionFromCookies(jar({ [SECURE_SESSION_COOKIE_NAME]: token }), SECRET),
    ).resolves.toBeNull();
  });

  it("rejects a cookie encrypted with another secret", async () => {
    const token = await encodeSessionToken(claims, "attacker-secret");
    await expect(
      readSessionFromCookies(jar({ [SECURE_SESSION_COOKIE_NAME]: token }), SECRET),
    ).resolves.toBeNull();
  });

  it("rejects a tampered ciphertext and garbage", async () => {
    const token = await encodeSessionToken(claims, SECRET);
    const parts = token.split(".");
    const c = parts[3];
    parts[3] = (c[0] === "A" ? "B" : "A") + c.slice(1);
    for (const bad of [parts.join("."), "not-a-jwt", "a.b.c.d.e", ""]) {
      await expect(
        readSessionFromCookies(jar({ [SECURE_SESSION_COOKIE_NAME]: bad }), SECRET),
      ).resolves.toBeNull();
    }
  });

  it("a legacy next-auth token does NOT open as a current cookie (separate keys)", async () => {
    await expect(decodeSessionToken(fixtures.backoffice, SECRET)).resolves.toBeNull();
    const token = await encodeSessionToken(claims, SECRET);
    await expect(decodeLegacyNextAuthToken(token, SECRET)).resolves.toBeNull();
  });

  it("fails closed without a secret", async () => {
    const token = await encodeSessionToken(claims, SECRET);
    await expect(
      readSessionFromCookies(jar({ [SECURE_SESSION_COOKIE_NAME]: token }), null),
    ).resolves.toBeNull();
  });
});

describe("legacy next-auth v4 cookie (transition)", () => {
  it.each(LEGACY_COOKIE_NAMES)("accepts a real next-auth session in %s", async (name) => {
    const read = await readSessionFromCookies(jar({ [name]: fixtures.backoffice }), SECRET);
    expect(read?.source).toBe("legacy");
    expect(read?.session.user).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://lh3.googleusercontent.com/a/ada",
      project: "mydnamap",
      accessSurface: "backoffice",
    });
    expect(read?.claims.sub).toBe("uid-ada");
  });

  it.each([
    ["patientPortal", "patient-portal", "mydnamap"],
    ["pgflex", "pgflex", "mydnamap"],
    ["publisherPortal", "publisher-portal", "mydnamap"],
    ["pocketGyms", "backoffice", "pocket-gyms"],
    ["noSurface", "backoffice", "mydnamap"],
  ] as const)("keeps project/accessSurface of %s", async (key, surface, project) => {
    const read = await readSessionFromCookies(
      jar({ "__Secure-next-auth.session-token": fixtures[key] }),
      SECRET,
    );
    expect(read?.session.user.accessSurface).toBe(surface);
    expect(read?.session.user.project).toBe(project);
  });

  it("reassembles a chunked next-auth cookie (.0, .1, …)", async () => {
    const t = fixtures.backoffice;
    const mid = Math.floor(t.length / 2);
    const read = await readSessionFromCookies(
      jar({
        "__Secure-next-auth.session-token.1": t.slice(mid),
        "__Secure-next-auth.session-token.0": t.slice(0, mid),
      }),
      SECRET,
    );
    expect(read?.source).toBe("legacy");
  });

  it("rejects an expired, a foreign-secret and a tampered next-auth cookie", async () => {
    const tampered = fixtures.backoffice.slice(0, -4) + "AAAA";
    for (const token of [fixtures.expired, fixtures.otherSecret, tampered]) {
      await expect(
        readSessionFromCookies(jar({ "__Secure-next-auth.session-token": token }), SECRET),
      ).resolves.toBeNull();
    }
  });

  it("a valid current cookie wins over a legacy one", async () => {
    const token = await encodeSessionToken({ ...claims, email: "new@example.com" }, SECRET);
    const read = await readSessionFromCookies(
      jar({
        [SECURE_SESSION_COOKIE_NAME]: token,
        "__Secure-next-auth.session-token": fixtures.backoffice,
      }),
      SECRET,
    );
    expect(read?.source).toBe("current");
    expect(read?.session.user.email).toBe("new@example.com");
  });

  it("a token without exp is refused (next-auth always sets one)", async () => {
    const enc = new TextEncoder();
    const ikm = await crypto.subtle.importKey("raw", enc.encode(SECRET), "HKDF", false, ["deriveBits"]);
    const key = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("NextAuth.js Generated Encryption Key") },
        ikm,
        256,
      ),
    );
    const noExp = await new EncryptJWT({ email: "x@y.z" })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(key);
    await expect(decodeLegacyNextAuthToken(noExp, SECRET)).resolves.toBeNull();
  });
});

describe("re-issue and cookie writing", () => {
  it("re-issues legacy sessions and day-old current ones only", async () => {
    const now = Math.floor(Date.now() / 1000);
    const legacy = await readSessionFromCookies(
      jar({ "next-auth.session-token": fixtures.backoffice }),
      SECRET,
    );
    expect(shouldReissue(legacy!, now)).toBe(true);
    const fresh = await readSessionFromCookies(
      jar({ [SESSION_COOKIE_NAME]: await encodeSessionToken(claims, SECRET) }),
      SECRET,
    );
    expect(shouldReissue(fresh!, now)).toBe(false);
    expect(shouldReissue(fresh!, now + SESSION_UPDATE_AGE_SECONDS + 1)).toBe(true);
  });

  it("writes an httpOnly lax cookie under the secure name over https", async () => {
    const set = jest.fn();
    await writeSessionCookie({ set }, claims, true, SECRET);
    const [name, value, options] = set.mock.calls[0];
    expect(name).toBe(SECURE_SESSION_COOKIE_NAME);
    expect(options).toEqual(sessionCookieOptions(true));
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    await expect(decodeSessionToken(value, SECRET)).resolves.toMatchObject({ email: claims.email });
  });

  it("clears current, legacy and legacy chunk cookies", () => {
    const set = jest.fn();
    clearSessionCookies({ set }, ["__Secure-next-auth.session-token.0", "other"]);
    const names = set.mock.calls.map((c) => c[0]).sort();
    expect(names).toEqual(
      [
        "__Secure-backoffice.session-token",
        "__Secure-next-auth.session-token",
        "__Secure-next-auth.session-token.0",
        "backoffice.session-token",
        "next-auth.session-token",
      ].sort(),
    );
    for (const call of set.mock.calls) expect(call[2].maxAge).toBe(0);
  });

  it("a fresh login clears legacy cookies but not the one it is about to write", () => {
    const set = jest.fn();
    clearSessionCookies({ set }, [], { includeCurrent: false });
    expect(set.mock.calls.map((c) => c[0]).sort()).toEqual([...LEGACY_COOKIE_NAMES].sort());
  });
});
