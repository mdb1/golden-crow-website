// data-hygiene-actions.scan-cap.test.ts — #541.
//
// The scan reads at most 120 docs per collection. Two things this pins:
//   1. The page REPORTS which collections hit the cap (`coverage`), so «no problems»
//      past the cap reads as «not checked».
//   2. A reference to a doc that exists but sits PAST the cap is not an orphan. Logs
//      (client + assignment) and exercises (owner) were checked against the scanned 120
//      only, so every reference beyond them was flagged as missing — on a page with a
//      purge button.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({ getCurrentAdmin: jest.fn() }));

const mockCollection = jest.fn();
const mockBucket = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: mockCollection })),
  gcFitnessStorage: jest.fn(() => ({ bucket: mockBucket })),
  gcFitnessAuth: jest.fn(),
}));

import { listDataHygienePage } from "@/lib/gc-fitness/data-hygiene-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";

type SeedDoc = { id: string; data: Record<string, unknown> };

const users: SeedDoc[] = [
  { id: "coach1", data: { role: "trainer", coachId: null } },
  ...Array.from({ length: 130 }, (_, i) => ({
    id: `client${String(i).padStart(3, "0")}`,
    data: { role: "client", coachId: "coach1" },
  })),
];
const assignments: SeedDoc[] = Array.from({ length: 130 }, (_, i) => ({
  id: `a${String(i).padStart(3, "0")}`,
  data: { trainerId: "coach1", clientId: "client000" },
}));

const DATA: Record<string, SeedDoc[]> = {
  users,
  workout_assignments: assignments,
  workout_logs: [
    // client129 and a129 both exist but are past the 120-doc scan.
    { id: "logBeyond", data: { trainerId: "coach1", clientId: "client129", assignmentId: "a129" } },
    // genuinely missing client + assignment → still flagged.
    { id: "logOrphan", data: { trainerId: "coach1", clientId: "ghost", assignmentId: "nope" } },
  ],
  exercises: [{ id: "ex1", data: { source: "trainer", ownerId: "coach1" } }],
  workout_templates: [],
  chats: [],
  progress_photos: [],
};

function querySnap(docs: SeedDoc[]) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((d) => ({ id: d.id, data: () => d.data, get: (k: string) => d.data[k] })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentAdmin as jest.Mock).mockResolvedValue({ uid: "admin", roles: ["admin"] });
  mockBucket.mockReturnValue({ file: () => ({ exists: async () => [true] }) });
  mockCollection.mockImplementation((name: string) => {
    const docs = DATA[name] ?? [];
    return {
      limit: (n: number) => ({ get: async () => querySnap(docs.slice(0, n)) }),
      doc: (id: string) => ({
        get: async () => {
          const d = docs.find((x) => x.id === id);
          return d
            ? { exists: true, id, data: () => d.data, get: (k: string) => d.data[k] }
            : { exists: false, id, data: () => undefined, get: () => undefined };
        },
      }),
    };
  });
});

describe("hygiene scan cap (#541)", () => {
  it("reports the collections that hit the cap", async () => {
    const page = await listDataHygienePage(0, 50);
    expect(page.scanLimit).toBe(120);
    const byName = Object.fromEntries((page.coverage ?? []).map((c) => [c.collection, c]));
    expect(byName.users).toEqual({ collection: "users", scanned: 120, capped: true });
    expect(byName.workout_assignments.capped).toBe(true);
    expect(byName.workout_logs).toEqual({ collection: "workout_logs", scanned: 2, capped: false });
  });

  it("a log pointing past the cap is NOT an orphan; a really missing one still is", async () => {
    const page = await listDataHygienePage(0, 50);
    const ids = page.rows.map((r) => r.id);
    expect(ids).not.toContain("log:logBeyond");
    const orphan = page.rows.find((r) => r.id === "log:logOrphan");
    expect(orphan?.issue).toContain("Client doc missing");
    expect(orphan?.issue).toContain("Assignment doc missing");
  });

  it("an exercise whose owner exists is not flagged", async () => {
    const page = await listDataHygienePage(0, 50);
    expect(page.rows.map((r) => r.id)).not.toContain("exercise:ex1");
  });
});
