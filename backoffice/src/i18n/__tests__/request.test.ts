// __tests__/request.test.ts — next-intl request config (locale resolution).
//
// Chain: NEXT_LOCALE cookie → users/{trainer}.preferredLocale (and the cookie
// is written back) → Accept-Language (es* > en*) → default ('es').
// `getRequestConfig` is stubbed to the identity so the resolver runs directly.

import {
  FakeFirestore,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockCookieValues = new Map<string, string>();
const mockCookieStore = {
  values: mockCookieValues,
  get: jest.fn((name: string): { name: string; value: string } | undefined => {
    const v = mockCookieValues.get(name);
    return v === undefined ? undefined : { name, value: v };
  }),
  set: jest.fn(),
};
let mockAcceptLanguage: string | null = null;

jest.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
  headers: jest.fn(async () => new Headers(mockAcceptLanguage === null ? {} : { "accept-language": mockAcceptLanguage })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));

import { getTokens } from "next-firebase-auth-edge";

import requestConfig from "@/i18n/request";
import en from "@/../messages/en.json";
import es from "@/../messages/es.json";

const mockGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
const resolve = requestConfig as unknown as () => Promise<{ locale: string; messages: unknown }>;

beforeEach(() => {
  mockDb.current = new FakeFirestore();
  mockCookieStore.values.clear();
  mockCookieStore.set.mockReset();
  mockAcceptLanguage = null;
  setGcFitnessAuthEnv();
  mockGetTokens.mockReset().mockResolvedValue(null);
});

function signInTrainer(uid = "coach-a") {
  mockGetTokens.mockResolvedValue(tokensFor(uid, ["trainer"]) as Awaited<ReturnType<typeof getTokens>>);
}

it.each([
  ["en", en],
  ["es", es],
])("cookie NEXT_LOCALE=%s wins; no session lookup, no Firestore read", async (locale, messages) => {
  mockCookieStore.values.set("NEXT_LOCALE", locale);
  mockAcceptLanguage = locale === "en" ? "es" : "en";
  signInTrainer();
  mockDb.current!.seed("users/coach-a", { preferredLocale: locale === "en" ? "es" : "en" });
  const cfg = await resolve();
  expect(cfg.locale).toBe(locale);
  expect(cfg.messages).toEqual(messages);
  expect(mockGetTokens).not.toHaveBeenCalled();
  expect(mockDb.current!.reads).toEqual([]);
});

it("an unsupported cookie value is ignored (falls to the 'es' default)", async () => {
  mockCookieStore.values.set("NEXT_LOCALE", "fr");
  mockAcceptLanguage = "en-US";
  expect((await resolve()).locale).toBe("es");
});

it("no cookie + trainer with preferredLocale → that locale, and the cookie is written back", async () => {
  signInTrainer();
  mockDb.current!.seed("users/coach-a", { preferredLocale: "en" });
  mockAcceptLanguage = "es-AR";
  const cfg = await resolve();
  expect(cfg.locale).toBe("en");
  expect(cfg.messages).toEqual(en);
  expect(mockCookieStore.set).toHaveBeenCalledWith("NEXT_LOCALE", "en", {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax",
    httpOnly: false,
  });
});

it("cookie write-back throwing does not break resolution", async () => {
  signInTrainer();
  mockDb.current!.seed("users/coach-a", { preferredLocale: "en" });
  mockCookieStore.set.mockImplementation(() => {
    throw new Error("Cookies can only be modified in a Server Action");
  });
  expect((await resolve()).locale).toBe("en");
});

it.each([
  ["invalid preferredLocale", { preferredLocale: "de" }],
  ["no preferredLocale", {}],
])("trainer with %s → falls through to Accept-Language, no cookie written", async (_l, doc) => {
  signInTrainer();
  mockDb.current!.seed("users/coach-a", doc);
  mockAcceptLanguage = "en-GB,en;q=0.9";
  expect((await resolve()).locale).toBe("es");
  expect(mockDb.current!.reads).toEqual(["users/coach-a"]);
  expect(mockCookieStore.set).not.toHaveBeenCalled();
});

it("trainer without a users doc → Accept-Language", async () => {
  signInTrainer();
  mockAcceptLanguage = "es";
  expect((await resolve()).locale).toBe("es");
});

it("signed-in CLIENT (not trainer) → no Firestore read, Accept-Language", async () => {
  mockGetTokens.mockResolvedValue(tokensFor("c1", ["client"]) as Awaited<ReturnType<typeof getTokens>>);
  mockDb.current!.seed("users/c1", { preferredLocale: "en" });
  mockAcceptLanguage = "es";
  expect((await resolve()).locale).toBe("es");
  expect(mockDb.current!.reads).toEqual([]);
});

it("missing env (a config error, not Forbidden) is re-thrown, not silently defaulted", async () => {
  delete process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY;
  await expect(resolve()).rejects.toThrow(/server misconfigured/);
});

it("a Firestore failure is re-thrown", async () => {
  signInTrainer();
  mockDb.current = {
    collection: () => ({ doc: () => ({ get: async () => { throw new Error("UNAVAILABLE"); } }) }),
  } as unknown as FakeFirestore;
  await expect(resolve()).rejects.toThrow("UNAVAILABLE");
});

// Accept-Language can only ever pick Spanish: an `en*` tag falls to the
// `else` branch, which is defaultLocale ('es') — English is opt-in only
// (cookie / preferredLocale), per routing.ts.
describe("Accept-Language (anonymous)", () => {
  it.each([
    ["es-AR,es;q=0.9", "es"],
    ["en-US,en;q=0.9,es;q=0.8", "es"],
    ["fr-FR, es;q=0.5", "es"],
    ["fr-FR, de, EN;q=0.1", "es"],
    ["fr, de", "es"],
    ["", "es"],
    [null, "es"],
  ])("%j → %s", async (header, locale) => {
    mockAcceptLanguage = header;
    const cfg = await resolve();
    expect(cfg.locale).toBe(locale);
    expect(cfg.messages).toEqual(locale === "en" ? en : es);
  });
});
