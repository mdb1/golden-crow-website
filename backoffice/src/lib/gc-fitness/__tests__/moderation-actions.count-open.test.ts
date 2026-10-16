// __tests__/moderation-actions.count-open.test.ts
//
// countOpenReports (moderation-actions.ts) — the admin nav badge — executed
// against the in-memory admin Firestore from fake-firestore-admin-b (the only
// fake with `count()`), with the REAL auth-helpers over a mocked getTokens.
// moderation-actions.test.ts covers the verbs; nothing executed this one.

import {
  FakeFirestore,
  fakeFieldValueModule,
} from "@/lib/test-utils/fake-firestore-admin-b";
import { setGcFitnessAuthEnv, tokensFor } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: jest.fn(),
}));
jest.mock("firebase-admin/firestore", () => fakeFieldValueModule);

import { getTokens } from "next-firebase-auth-edge";

import { countOpenReports } from "../moderation-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;
let collectionSpy: jest.SpyInstance;

function signInAs(uid: string, roles: string[] | null) {
  if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
  else mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

beforeEach(() => {
  setGcFitnessAuthEnv();
  mockedGetTokens.mockReset();
  db = new FakeFirestore({
    social_reports: {
      r1: { status: "open", targetType: "routine", targetId: "t1" },
      r2: { status: "open", targetType: "comment", targetId: "c1" },
      r3: { status: "dismissed", targetType: "routine", targetId: "t1" },
      r4: { status: "actioned", targetType: "profile", targetId: "u1" },
    },
  });
  mockDb.current = db;
  collectionSpy = jest.spyOn(db, "collection");
});

describe("countOpenReports", () => {
  it("an admin gets the number of OPEN reports only, read-only", async () => {
    signInAs("admin-1", ["admin"]);
    await expect(countOpenReports()).resolves.toBe(2);
    expect(collectionSpy).toHaveBeenCalledWith("social_reports");
    expect(db.writes).toEqual([]);
  });

  it("an admin with nothing open gets 0", async () => {
    signInAs("admin-1", ["admin", "trainer"]);
    db = new FakeFirestore({ social_reports: { r3: { status: "dismissed" } } });
    mockDb.current = db;
    await expect(countOpenReports()).resolves.toBe(0);
  });

  // BUG (authorization): countOpenReports (moderation-actions.ts:238) has NO auth
  // gate. Its doc says "admin-only; 0 for everybody else", and the two callers
  // (gc-fitness/layout.tsx:60, admin/page.tsx:74) only call it for admins — but it
  // is an exported "use server" function, i.e. a public POST endpoint: anyone,
  // signed out or a plain trainer/client, can read the live size of the
  // moderation queue through the Admin SDK. Correct: non-admins get 0 (or are
  // refused) WITHOUT the aggregation running.
  it.failing.each([
    ["signed out", null],
    ["a trainer", ["trainer"]],
    ["a client", ["client"]],
  ] as Array<[string, string[] | null]>)("%s never reaches the social_reports aggregation", async (_label, roles) => {
    signInAs("someone", roles);
    const result = await countOpenReports().catch(() => "refused" as const);
    expect(result === 0 || result === "refused").toBe(true);
    expect(collectionSpy).not.toHaveBeenCalled();
  });
});
