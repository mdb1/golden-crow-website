// progress-photo-actions.test.ts — progress photos are the most sensitive
// client data in the backoffice, and the signed URLs minted here BYPASS
// storage.rules. The trainer path's strict `users/{id}.coachId === uid` and
// the admin path's `adminCanViewClientUnderCoach` are the only gates.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
const mockGetCurrentAdmin = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
  getCurrentAdmin: () => mockGetCurrentAdmin(),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: async () => "America/Argentina/Buenos_Aires",
}));

import { fake, ts } from "@/lib/test-utils/fake-firestore-cov-a";

import {
  listProgressPhotosForClient,
  listProgressPhotosForClientAsAdmin,
} from "../progress-photo-actions";

const COACH = "coach-A";
const OTHER = "coach-B";
const env = process.env;

function noPhotoAccess() {
  expect(fake.db.queries).toEqual([]);
  expect(fake.storage.signed).toEqual([]);
}

beforeEach(() => {
  fake.reset();
  process.env = {
    ...env,
    NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID: "proj",
    NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET: "explicit-bucket",
  };
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentAdmin.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  mockGetCurrentAdmin.mockResolvedValue({ uid: "admin-1", email: "admin@example.com" });
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH },
    "users/client-2": { role: "client", coachId: OTHER },
    "users/solo": { role: "client", coachId: null },
    "users/solo-deleted": { role: "client", deleted: true },
    "progress_photos/p-old": {
      clientId: "client-1",
      storagePath: "progress_photos/client-1/old.jpg",
      angle: "front",
      checkInDate: "2026-09-01",
      setId: "set-1",
      caption: "start",
      createdAt: ts("2026-09-01T15:00:00Z"),
      takenAt: ts("2026-09-01T14:00:00Z"),
    },
    // No checkInDate: falls back to createdAt projected into the trainer tz
    // (2026-10-02 01:00Z is still 2026-10-01 in Buenos Aires, UTC-3).
    "progress_photos/p-legacy": {
      clientId: "client-1",
      storagePath: "progress_photos/client-1/legacy.jpg",
      angle: "diagonal",
      createdAt: ts("2026-10-02T01:00:00Z"),
    },
    "progress_photos/p-new": {
      clientId: "client-1",
      storagePath: "progress_photos/client-1/new.jpg",
      angle: "back",
      checkInDate: "2026-10-01T",
    },
    "progress_photos/p-nopath": { clientId: "client-1" },
    "progress_photos/p-other": {
      clientId: "client-2",
      storagePath: "progress_photos/client-2/secret.jpg",
    },
  });
});

afterAll(() => {
  process.env = env;
});

describe("listProgressPhotosForClient (trainer)", () => {
  it("rejects a non-trainer before any read", async () => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(listProgressPhotosForClient("client-1")).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    noPhotoAccess();
  });

  it.each([
    ["another coach's client", "client-2"],
    ["a missing client", "ghost"],
    // The trainer path is STRICT: a coach-less user is not "owned" by a
    // trainer whose uid happens to equal theirs only via coachId equality.
    ["a coach-less user", "solo"],
  ])("rejects %s without querying photos or signing URLs", async (_n, clientId) => {
    await expect(listProgressPhotosForClient(clientId)).rejects.toThrow("Forbidden");
    noPhotoAccess();
  });

  it("queries only this client's photos (limit 24) and signs a 60-min URL per path", async () => {
    const rows = await listProgressPhotosForClient("client-1");
    expect(fake.db.queries).toEqual([
      { path: "progress_photos", filters: [["clientId", "==", "client-1"]], orders: [], limit: 24 },
    ]);
    // Sorted by checkInDate ?? civil(createdAt in TRAINER tz) desc. "2026-10-01T"
    // sorts just above p-legacy's Buenos Aires day "2026-10-01"; had the
    // fallback used UTC ("2026-10-02"), p-legacy would come first.
    expect(rows.map((r) => r.id)).toEqual(["p-new", "p-legacy", "p-old", "p-nopath"]);
    expect(rows.find((r) => r.id === "p-old")).toEqual({
      id: "p-old",
      caption: "start",
      storagePath: "progress_photos/client-1/old.jpg",
      url: "https://signed.example/explicit-bucket/progress_photos/client-1/old.jpg",
      angle: "front",
      checkInDate: "2026-09-01",
      setId: "set-1",
      createdAt: "2026-09-01T15:00:00.000Z",
      takenAt: "2026-09-01T14:00:00.000Z",
    });
    expect(rows.find((r) => r.id === "p-legacy")).toMatchObject({ angle: null, checkInDate: null });
    expect(rows.find((r) => r.id === "p-nopath")).toMatchObject({ storagePath: "", url: null });
    expect(fake.storage.signed.map((s) => s.path)).not.toContain(
      "progress_photos/client-2/secret.jpg",
    );
    for (const s of fake.storage.signed) {
      expect((s.options as { action: string }).action).toBe("read");
    }
  });

  it("falls back across bucket candidates and returns url:null when all fail", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fake.storage.failingBuckets.add("explicit-bucket");
    fake.storage.failingBuckets.add("proj.appspot.com");
    let rows = await listProgressPhotosForClient("client-1");
    expect(rows[0].url).toMatch(/^https:\/\/signed\.example\/proj\.firebasestorage\.app\//);
    fake.storage.failingBuckets.add("proj.firebasestorage.app");
    rows = await listProgressPhotosForClient("client-1");
    expect(rows.every((r) => r.url === null)).toBe(true);
    warn.mockRestore();
  });
});

describe("listProgressPhotosForClientAsAdmin", () => {
  it("rejects a non-admin before any read", async () => {
    mockGetCurrentAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(listProgressPhotosForClientAsAdmin(COACH, "client-1")).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    noPhotoAccess();
  });

  it.each([
    ["coach in path is not the client's coach", OTHER, "client-1"],
    ["missing client", COACH, "ghost"],
    ["empty coach in path", "", "client-1"],
    ["coach-less user under a foreign coach path", COACH, "solo"],
    ["deleted coach-less user as self", "solo-deleted", "solo-deleted"],
  ])("rejects when %s", async (_n, coach, client) => {
    await expect(listProgressPhotosForClientAsAdmin(coach, client)).rejects.toThrow("Forbidden");
    noPhotoAccess();
  });

  it("admits the coach of record and a coach-less user under self-as-coach", async () => {
    const rows = await listProgressPhotosForClientAsAdmin(COACH, "client-1");
    expect(rows).toHaveLength(4);
    fake.seed({ "progress_photos/s1": { clientId: "solo", storagePath: "progress_photos/solo/a.jpg" } });
    const solo = await listProgressPhotosForClientAsAdmin("solo", "solo");
    expect(solo.map((r) => r.id)).toEqual(["s1"]);
  });
});
