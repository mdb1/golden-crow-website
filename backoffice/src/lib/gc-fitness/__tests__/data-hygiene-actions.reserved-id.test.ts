// __tests__/data-hygiene-actions.reserved-id.test.ts
//
// Regression test for the hygiene-scan crash:
//   "3 INVALID_ARGUMENT: Resource id \"__standard__\" is invalid because it is
//    reserved."
//
// The 20 shared standard workout templates carry `trainerId: "__standard__"`.
// The scan resolved owners via `db.collection('users').doc(trainerId)`, and
// Firestore rejects any doc id matching /^__.*__$/ as reserved — so that point
// read threw and (because all four loaders run under one Promise.all) blanked
// the whole dashboard.
//
// The mock below mimics Firestore by THROWING from `.doc()` on a reserved id,
// so if the guard ever regresses this suite fails loudly. With the fix, the
// `__standard__` template is treated as a valid system owner: never point-read,
// never flagged.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn(),
}));

const mockCollection = jest.fn();
const mockBucket = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: mockCollection })),
  gcFitnessStorage: jest.fn(() => ({ bucket: mockBucket })),
  gcFitnessAuth: jest.fn(),
}));

import { listDataHygienePage } from "@/lib/gc-fitness/data-hygiene-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";

const mockedGetCurrentAdmin = getCurrentAdmin as jest.MockedFunction<
  typeof getCurrentAdmin
>;

const ADMIN = {
  uid: "admin1",
  email: "admin@x.com",
  role: "admin" as const,
  isTrainer: false,
  roles: ["admin"],
};

const RESERVED = /^__.+__$/;

type SeedDoc = { id: string; data: Record<string, unknown> };

const DATA: Record<string, SeedDoc[]> = {
  users: [
    { id: "coach1", data: { role: "trainer", displayName: "Coach", email: "c@x.com" } },
  ],
  workout_templates: [
    // Reserved owner — a shared standard template. Must NOT throw, NOT be flagged.
    { id: "std1", data: { trainerId: "__standard__", name: { en: "Standard" } } },
    // Valid owner present in the sample → no anomaly.
    { id: "good", data: { trainerId: "coach1", name: { en: "Good" } } },
    // Genuinely orphaned (owner missing) → still flagged.
    { id: "orphan", data: { trainerId: "ghost", name: { en: "Orphan" } } },
  ],
  chats: [],
  progress_photos: [],
  workout_assignments: [],
  workout_logs: [],
  exercises: [],
};

function querySnap(docs: SeedDoc[]) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((d) => ({ id: d.id, data: () => d.data, get: (k: string) => d.data[k] })),
  };
}

function docSnap(d: SeedDoc | undefined) {
  return d
    ? { exists: true, id: d.id, data: () => d.data, get: (k: string) => d.data[k] }
    : { exists: false, id: "", data: () => undefined, get: () => undefined };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCurrentAdmin.mockResolvedValue(ADMIN);
  mockBucket.mockReturnValue({
    file: () => ({ exists: async () => [true], delete: async () => undefined }),
  });
  mockCollection.mockImplementation((name: string) => {
    const docs = DATA[name] ?? [];
    return {
      limit: () => ({ get: async () => querySnap(docs) }),
      doc: (id: string) => {
        if (RESERVED.test(id)) {
          // Mirror Firestore: constructing a ref with a reserved id throws.
          throw new Error(
            `3 INVALID_ARGUMENT: Resource id "${id}" is invalid because it is reserved.`,
          );
        }
        return { get: async () => docSnap(docs.find((d) => d.id === id)) };
      },
    };
  });
});

describe("listDataHygienePage — reserved-id (__standard__) handling", () => {
  it("does not throw on a __standard__ owner and excludes it from anomalies", async () => {
    const page = await listDataHygienePage();
    const ids = page.rows.map((r) => r.id);
    expect(ids).not.toContain("template:std1"); // standard/system template — not an orphan
    expect(ids).not.toContain("template:good"); // valid owner — not an anomaly
  });

  it("still flags a genuinely orphaned template (real owner id missing)", async () => {
    const page = await listDataHygienePage();
    const orphan = page.rows.find((r) => r.id === "template:orphan");
    expect(orphan).toBeDefined();
    expect(orphan?.issue).toContain("Trainer doc missing");
  });
});
