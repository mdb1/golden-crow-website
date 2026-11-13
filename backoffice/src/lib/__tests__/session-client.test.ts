/** @jest-environment jsdom */
// session-client.test.ts — the browser drop-in for next-auth/react (#470).

import { getSession, signIn, signOut } from "@/lib/session-client";

const fetchMock = jest.fn();
const realFetch = global.fetch;
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

// jsdom has no Response; the client only reads ok / status / json().
const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

it("signIn posts the credentials (without `redirect`) to /api/auth/login", async () => {
  fetchMock.mockResolvedValueOnce(json({ ok: true }));
  const result = await signIn("credentials", {
    idToken: "tok",
    email: "a@b.c",
    project: "mydnamap",
    accessSurface: "pgflex",
    redirect: false,
  });
  expect(result).toEqual({ ok: true, status: 200, error: null, url: null });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/auth/login");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({
    idToken: "tok",
    email: "a@b.c",
    project: "mydnamap",
    accessSurface: "pgflex",
  });
});

it("signIn reports a rejection and a network failure as ok:false", async () => {
  fetchMock.mockResolvedValueOnce(json({ error: "CredentialsSignin" }, 401));
  await expect(signIn("credentials", { idToken: "x" })).resolves.toMatchObject({
    ok: false,
    status: 401,
    error: "CredentialsSignin",
  });
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await expect(signIn("credentials", { idToken: "x" })).resolves.toMatchObject({ ok: false });
});

it("getSession returns the session, or null for {} / errors", async () => {
  const session = { user: { email: "a@b.c", accessSurface: "backoffice" }, expires: "x" };
  fetchMock.mockResolvedValueOnce(json(session));
  await expect(getSession()).resolves.toEqual(session);
  fetchMock.mockResolvedValueOnce(json({}));
  await expect(getSession()).resolves.toBeNull();
  fetchMock.mockResolvedValueOnce(json({}, 500));
  await expect(getSession()).resolves.toBeNull();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/session");
});

it("signOut({ redirect: false }) clears the session without navigating", async () => {
  fetchMock.mockResolvedValueOnce(json({ ok: true }));
  const before = window.location.href;
  await signOut({ callbackUrl: "/login", redirect: false });
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  expect(window.location.href).toBe(before);
});
