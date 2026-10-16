// __tests__/locale.route.test.ts — POST /api/gc-fitness/locale.
//
// Unauthenticated by design (the cookie gates only translation lookup). Pins
// the accepted values, the exact cookie written, and that anything else is a
// 400 that writes NOTHING (no cookie injection through the locale value).

const mockStore = {
  set: jest.fn(),
  delete: jest.fn(),
};
jest.mock("next/headers", () => ({ cookies: jest.fn(async () => mockStore) }));

import { POST } from "@/app/api/gc-fitness/locale/route";

function req(body: string): Request {
  return new Request("https://backoffice.test/api/gc-fitness/locale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  mockStore.set.mockReset();
  mockStore.delete.mockReset();
});

it.each(["en", "es"])("locale=%s → sets NEXT_LOCALE for one year, readable by the client", async (locale) => {
  const res = await POST(req(JSON.stringify({ locale })));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ ok: true, locale });
  expect(mockStore.set).toHaveBeenCalledWith("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax",
    httpOnly: false,
  });
  expect(mockStore.delete).not.toHaveBeenCalled();
});

it("locale=auto → deletes the cookie", async () => {
  const res = await POST(req(JSON.stringify({ locale: "auto" })));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ ok: true, locale: "auto" });
  expect(mockStore.delete).toHaveBeenCalledWith("NEXT_LOCALE");
  expect(mockStore.set).not.toHaveBeenCalled();
});

it.each([
  ["unsupported", { locale: "fr" }],
  ["case variant", { locale: "EN" }],
  ["cookie injection", { locale: "en; Path=/; HttpOnly" }],
  ["non-string", { locale: ["en"] }],
  ["missing", {}],
])("%s → 400 invalid locale, no cookie touched", async (_label, body) => {
  const res = await POST(req(JSON.stringify(body)));
  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: "invalid locale" });
  expect(mockStore.set).not.toHaveBeenCalled();
  expect(mockStore.delete).not.toHaveBeenCalled();
});

it("non-JSON body → 400 invalid body", async () => {
  const res = await POST(req("not json"));
  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: "invalid body" });
  expect(mockStore.set).not.toHaveBeenCalled();
});
