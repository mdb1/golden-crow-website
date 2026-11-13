// authorizeCredentials() (was next-auth's CredentialsProvider.authorize, #470)
// + the session shape, for the Pocket Genes login (epic golden-crow-website#451).
//
// The browser posts { idToken, email, name, ... } to /api/auth/login.
// Only the idToken is verified (by the SDK's POST /auth/login). The session
// identity must therefore come from the SDK's reply, never from the
// client-supplied `email` credential — except as a deploy-order fallback when
// an older SDK replies `{ status: "ok" }` without identity fields.

import { authorizeCredentials } from "@/lib/auth";
import { toSession } from "@/lib/backoffice-session";

function getAuthorize() {
  return authorizeCredentials;
}

function sdkReply(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("authorizeCredentials()", () => {
  it("returns null without calling the SDK when there is no idToken", async () => {
    await expect(getAuthorize()({ email: "a@b.com" })).resolves.toBeNull();
    await expect(getAuthorize()(undefined)).resolves.toBeNull();
    await expect(getAuthorize()({ idToken: "" })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the SDK rejects the token (non-ok)", async () => {
    for (const status of [401, 403, 500]) {
      fetchMock.mockResolvedValueOnce(sdkReply({ error: "nope" }, status));
      await expect(
        getAuthorize()({ idToken: "tok", email: "a@b.com" }),
      ).resolves.toBeNull();
    }
  });

  it("returns null when the SDK fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      getAuthorize()({ idToken: "tok", email: "a@b.com" }),
    ).resolves.toBeNull();
  });

  it("POSTs the idToken and normalised surface to ${SDK}/auth/login", async () => {
    fetchMock.mockResolvedValueOnce(
      sdkReply({ status: "ok", uid: "u1", email: "real@x.com" }),
    );
    await getAuthorize()({ idToken: "tok", accessSurface: "patient-portal" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/login$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      idToken: "tok",
      surface: "patient-portal",
    });
  });

  it("uses the SDK-verified identity, ignoring a spoofed credentials.email", async () => {
    fetchMock.mockResolvedValueOnce(
      sdkReply({ status: "ok", uid: "uid-real", email: "real@x.com" }),
    );
    const user = await getAuthorize()({
      idToken: "tok-for-real",
      email: "victim-admin@x.com",
      name: "Real",
    });
    expect(user).toMatchObject({
      id: "uid-real",
      email: "real@x.com",
      name: "Real",
    });
    expect(JSON.stringify(user)).not.toContain("victim-admin@x.com");
  });

  it("falls back to credentials.email when the SDK body lacks identity (older SDK)", async () => {
    fetchMock.mockResolvedValueOnce(sdkReply({ status: "ok" }));
    const user = await getAuthorize()({ idToken: "tok", email: "a@b.com" });
    expect(user).toMatchObject({ id: "a@b.com", email: "a@b.com" });
  });

  it("falls back when the SDK body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const user = await getAuthorize()({ idToken: "tok", email: "a@b.com" });
    expect(user).toMatchObject({ id: "a@b.com", email: "a@b.com" });
  });

  it("uses the verified uid even when the token has no email (email null → credentials fallback)", async () => {
    fetchMock.mockResolvedValueOnce(
      sdkReply({ status: "ok", uid: "uid-1", email: null }),
    );
    const user = await getAuthorize()({ idToken: "tok", email: "a@b.com" });
    expect(user).toMatchObject({ id: "uid-1", email: "a@b.com" });
  });

  it.each([
    ["patient-portal", "patient-portal"],
    ["pgflex", "pgflex"],
    ["publisher-portal", "publisher-portal"],
    ["backoffice", "backoffice"],
    [undefined, "backoffice"],
    ["god-mode", "backoffice"],
    ["", "backoffice"],
  ])("normalises accessSurface %j → %s", async (input, expected) => {
    fetchMock.mockResolvedValueOnce(sdkReply({ status: "ok", uid: "u" }));
    const user = await getAuthorize()({ idToken: "tok", accessSurface: input });
    expect(user?.accessSurface).toBe(expected);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).surface).toBe(expected);
  });

  it('defaults project to "mydnamap" and keeps an explicit one', async () => {
    fetchMock.mockResolvedValue(sdkReply({ status: "ok", uid: "u" }));
    expect((await getAuthorize()({ idToken: "t" }))?.project).toBe("mydnamap");
    fetchMock.mockResolvedValue(sdkReply({ status: "ok", uid: "u" }));
    expect(
      (await getAuthorize()({ idToken: "t", project: "pocketgyms" }))?.project,
    ).toBe("pocketgyms");
  });

  it("maps missing optional fields to null", async () => {
    fetchMock.mockResolvedValueOnce(sdkReply({ status: "ok", uid: "u" }));
    const user = await getAuthorize()({ idToken: "t" });
    expect(user).toMatchObject({ id: "u", name: null, email: null, image: null });
  });
});

describe("session shape (was next-auth's jwt + session callbacks)", () => {
  it("exposes project + normalised accessSurface on session.user", () => {
    expect(
      toSession(
        { email: "a@b.com", project: "mydnamap", accessSurface: "publisher-portal" },
        0,
      ).user,
    ).toEqual({
      name: null,
      email: "a@b.com",
      image: null,
      project: "mydnamap",
      accessSurface: "publisher-portal",
    });
  });

  it("defaults accessSurface to backoffice when the token has none or garbage", () => {
    for (const accessSurface of [undefined, "admin", 42]) {
      const user = toSession(
        { accessSurface: accessSurface as never },
        0,
      ).user;
      expect(user.accessSurface).toBe("backoffice");
      expect(user.project).toBeUndefined();
    }
  });
});
