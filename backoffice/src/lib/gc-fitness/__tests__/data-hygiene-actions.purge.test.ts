// __tests__/data-hygiene-actions.purge.test.ts
//
// `purgeDataHygieneItem` is the hygiene page's one-click HARD delete (Admin
// SDK, rules bypassed) for every anomaly kind. Pinned here:
//   - admin gate before anything (no write, no redirect);
//   - missing kind/id and unknown kinds refused before any write;
//   - per kind: exactly which doc / Storage object / cascade is hit, which
//     form field wins over the `kind:` prefixed id, and the
//     revalidatePath + redirect target.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-admin-b").fakeFieldValueModule,
);

const mockGetCurrentAdmin = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: () => mockGetCurrentAdmin(),
}));

const mockRevalidatePath = jest.fn();
jest.mock("next/cache", () => ({ revalidatePath: (p: string) => mockRevalidatePath(p) }));
const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const mockDeleteClientCascade = jest.fn(async (_input: unknown) => ({ ok: true }));
const mockDeleteCoachCascade = jest.fn(async (_input: unknown) => ({ ok: true }));
jest.mock("@/lib/gc-fitness/admin-actions", () => ({
  deleteClientCascade: (input: unknown) => mockDeleteClientCascade(input),
  deleteCoachCascade: (input: unknown) => mockDeleteCoachCascade(input),
}));

const mockDb: { current: unknown } = { current: null };
const mockFileDelete = jest.fn(async (_opts: unknown) => undefined);
const mockFileExists = jest.fn(async (_path: string): Promise<[boolean]> => [true]);
const mockFile = jest.fn((path: string) => ({
  delete: mockFileDelete,
  exists: () => mockFileExists(path),
}));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessStorage: () => ({ bucket: () => ({ file: mockFile }) }),
  gcFitnessAuth: jest.fn(),
}));

import {
  listDataHygienePage,
  purgeDataHygieneItem,
} from "@/lib/gc-fitness/data-hygiene-actions";
import { FakeFirestore } from "@/lib/test-utils/fake-firestore-admin-b";

const ADMIN = {
  uid: "admin-1",
  email: "admin@example.com",
  role: "admin" as const,
  isTrainer: false,
  roles: ["admin"],
};

let db: FakeFirestore;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeFirestore({
    chats: { c1: { coachId: "x" }, c2: { coachId: "y" } },
    "chats/c1/messages": { m1: { text: "hi" } },
    progress_photos: { p1: { clientId: "u" }, p2: { clientId: "u" } },
    workout_templates: { t1: {}, t2: {} },
    workout_assignments: { a1: {}, a2: {} },
    workout_logs: {
      l1: { assignmentId: "a1" },
      l2: { assignment_id: "a1" },
      l3: { assignmentId: "a2" },
      l4: {},
    },
    exercises: { e1: {}, e2: {} },
  });
  mockDb.current = db;
  mockGetCurrentAdmin.mockResolvedValue(ADMIN);
});

function expectNothingHappened() {
  expect(db.writes).toEqual([]);
  expect(mockDeleteClientCascade).not.toHaveBeenCalled();
  expect(mockDeleteCoachCascade).not.toHaveBeenCalled();
  expect(mockFileDelete).not.toHaveBeenCalled();
  expect(mockRedirect).not.toHaveBeenCalled();
  expect(mockRevalidatePath).not.toHaveBeenCalled();
}

function expectRedirectFor(kind: string) {
  expect(mockRevalidatePath).toHaveBeenCalledWith("/gc-fitness/admin/hygiene");
  expect(mockRedirect).toHaveBeenCalledWith(`/gc-fitness/admin/hygiene?op=${kind}&ok=1`);
}

describe("purgeDataHygieneItem — gate + validation", () => {
  it("rejects a non-admin (Forbidden) before reading the form or writing", async () => {
    mockGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(purgeDataHygieneItem(form({ kind: "log", id: "log:l1" }))).rejects.toThrow("Forbidden");
    expectNothingHappened();
  });

  it.each([
    ["missing kind", { id: "log:l1" }],
    ["missing id", { kind: "log" }],
    ["empty both", {}],
  ])("rejects %s", async (_l, fields) => {
    await expect(purgeDataHygieneItem(form(fields))).rejects.toThrow("Missing purge target.");
    expectNothingHappened();
  });

  it("rejects an unsupported kind", async () => {
    await expect(purgeDataHygieneItem(form({ kind: "users", id: "u1" }))).rejects.toThrow(
      "Unsupported purge kind: users",
    );
    expectNothingHappened();
  });
});

describe("purgeDataHygieneItem — per kind", () => {
  it("user (role=trainer) → coach cascade with the DELETE COACH literal", async () => {
    await purgeDataHygieneItem(form({ kind: "user", id: "user:x", role: "trainer", userId: "coach-A1" }));
    expect(mockDeleteCoachCascade).toHaveBeenCalledWith({
      coachUid: "coach-A1",
      confirmation: "DELETE COACH",
      mode: "execute",
    });
    expect(mockDeleteClientCascade).not.toHaveBeenCalled();
    expectRedirectFor("user");
  });

  it("user (any other role) → client cascade; userId falls back to id", async () => {
    await purgeDataHygieneItem(form({ kind: "user", id: "client-A1" }));
    expect(mockDeleteClientCascade).toHaveBeenCalledWith({
      clientUid: "client-A1",
      confirmation: "DELETE CLIENT",
      mode: "execute",
    });
    expect(mockDeleteCoachCascade).not.toHaveBeenCalled();
    expectRedirectFor("user");
  });

  it("user: a failing cascade propagates and skips the redirect", async () => {
    mockDeleteClientCascade.mockRejectedValueOnce(new Error("cascade failed"));
    await expect(purgeDataHygieneItem(form({ kind: "user", id: "client-A1" }))).rejects.toThrow(
      "cascade failed",
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("chat → recursive delete of exactly that chat (id prefix stripped)", async () => {
    await purgeDataHygieneItem(form({ kind: "chat", id: "chat:c1" }));
    expect(db.writes).toEqual([{ op: "recursiveDelete", path: "chats/c1" }]);
    expect(db.all("chats/c1/messages")).toEqual({});
    expect(db.doc("chats", "c2")).toBeDefined();
    expectRedirectFor("chat");
  });

  it("chat → the explicit chatId field wins over the id", async () => {
    await purgeDataHygieneItem(form({ kind: "chat", id: "chat:c1", chatId: "c2" }));
    expect(db.writes).toEqual([{ op: "recursiveDelete", path: "chats/c2" }]);
  });

  it("photo → deletes the Storage object then the metadata doc", async () => {
    await purgeDataHygieneItem(
      form({ kind: "photo", id: "photo:p1", storagePath: "  progress_photos/u/p1.jpg  " }),
    );
    expect(mockFile).toHaveBeenCalledWith("progress_photos/u/p1.jpg");
    expect(mockFileDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(db.writes).toEqual([{ op: "delete", path: "progress_photos/p1" }]);
    expectRedirectFor("photo");
  });

  it("photo → no storagePath skips Storage; a Storage failure never blocks the doc delete", async () => {
    await purgeDataHygieneItem(form({ kind: "photo", id: "photo:p1" }));
    expect(mockFile).not.toHaveBeenCalled();
    mockFileDelete.mockRejectedValueOnce(new Error("storage down"));
    await purgeDataHygieneItem(form({ kind: "photo", id: "x", photoId: "p2", storagePath: "a/b" }));
    expect(db.writes).toEqual([
      { op: "delete", path: "progress_photos/p1" },
      { op: "delete", path: "progress_photos/p2" },
    ]);
  });

  it("template → deletes that template only", async () => {
    await purgeDataHygieneItem(form({ kind: "template", id: "template:t1" }));
    expect(db.writes).toEqual([{ op: "delete", path: "workout_templates/t1" }]);
    expect(db.doc("workout_templates", "t2")).toBeDefined();
    expectRedirectFor("template");
  });

  it("assignment → deletes its logs (both key spellings) then the assignment", async () => {
    await purgeDataHygieneItem(form({ kind: "assignment", id: "assignment:a1" }));
    expect(db.writes).toEqual([
      { op: "delete", path: "workout_logs/l1" },
      { op: "delete", path: "workout_logs/l2" },
      { op: "delete", path: "workout_assignments/a1" },
    ]);
    expect(Object.keys(db.all("workout_logs")).sort()).toEqual(["l3", "l4"]);
    expectRedirectFor("assignment");
  });

  it("log → deletes that log only (logId field wins)", async () => {
    await purgeDataHygieneItem(form({ kind: "log", id: "log:l1", logId: "l4" }));
    expect(db.writes).toEqual([{ op: "delete", path: "workout_logs/l4" }]);
    expectRedirectFor("log");
  });

  it("exercise → deletes that exercise only", async () => {
    await purgeDataHygieneItem(form({ kind: "exercise", id: "exercise:e2" }));
    expect(db.writes).toEqual([{ op: "delete", path: "exercises/e2" }]);
    expectRedirectFor("exercise");
  });

  // SECURITY GAP: purgeDataHygieneItem (data-hygiene-actions.ts:625) picks the
  // coach-vs-client cascade from the client-supplied `role` FORM field instead
  // of reading /users/{userId}.role. A tampered/replayed admin POST that omits
  // `role` (or sends role=client) for a TRAINER uid runs the CLIENT cascade on
  // the coach — which (admin-actions.ts:912) does not check the role either —
  // deleting the coach's user doc + Auth account while orphaning their clients.
  // Expected: the server derives the role from Firestore.
  it.failing("derives the cascade from the stored role, not the form's role field", async () => {
    db = new FakeFirestore({ users: { "coach-A1": { role: "trainer" } } });
    mockDb.current = db;
    await purgeDataHygieneItem(form({ kind: "user", id: "coach-A1", role: "client" }));
    expect(mockDeleteClientCascade).not.toHaveBeenCalled();
    expect(mockDeleteCoachCascade).toHaveBeenCalled();
  });
});

describe("listDataHygienePage", () => {
  it("rejects a non-admin before scanning", async () => {
    mockGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(listDataHygienePage()).rejects.toThrow("Forbidden");
    expect(mockFileExists).not.toHaveBeenCalled();
  });

  it("flags each structural anomaly kind and never writes", async () => {
    db = new FakeFirestore({
      users: {
        coach1: { role: "trainer", createdAt: "2026-01-01" },
        deadCoach: { role: "trainer", deleted: true, createdAt: "2026-01-02" },
        okClient: { role: "client", coachId: "coach1" },
        orphanClient: { role: "client", coachId: "ghost", createdAt: "2026-01-03" },
        noCoach: { role: "client" },
        stuckClient: { role: "client", coachId: "deadCoach" },
        weird: { role: "superuser" },
      },
      chats: {
        okClient: { clientId: "okClient", coachId: "coach1", createdAt: "2026-01-01" },
        mismatch: { clientId: "okClient", coachId: "okClient" },
      },
      progress_photos: {
        pOk: { clientId: "okClient", storagePath: "a/ok.jpg" },
        pGone: { clientId: "okClient", storagePath: "a/gone.jpg" },
        pNoPath: { clientId: "coach1" },
      },
      workout_templates: { tNo: {}, tWrong: { trainerId: "okClient" } },
      workout_assignments: {
        aOk: { trainerId: "coach1", clientId: "okClient" },
        aBad: { trainerId: "ghost" },
      },
      workout_logs: { lBad: { clientId: "ghost" } },
      exercises: {
        eSrc: { source: "pirate" },
        eNoOwner: { source: "trainer" },
        eWrong: { source: "trainer", ownerId: "okClient", name: { en: "Curl" } },
        eStd: { source: "trainer", ownerId: "__standard__" },
      },
    });
    mockDb.current = db;
    mockFileExists.mockImplementation(async (path: string) => [path !== "a/gone.jpg"]);

    const page = await listDataHygienePage(0, 50);
    const issues = Object.fromEntries(page.rows.map((r) => [r.id, r.issue]));

    expect(issues["user:weird"]).toContain("Invalid role");
    expect(issues["user:noCoach"]).toContain("Missing coachId");
    expect(issues["user:orphanClient"]).toContain("Coach doc missing");
    expect(issues["user:stuckClient"]).toContain("Coach doc missing");
    expect(issues["user:deadCoach"]).toContain("Deleted trainer still has 1 client(s)");
    expect(issues["user:okClient"]).toBeUndefined();
    expect(issues["chat:mismatch"]).toEqual(expect.stringContaining("Chat doc id does not match clientId"));
    expect(issues["chat:okClient"]).toBeUndefined();
    expect(issues["photo:pGone"]).toContain("Storage object missing");
    expect(issues["photo:pNoPath"]).toContain("Missing storagePath");
    expect(issues["photo:pOk"]).toBeUndefined();
    expect(issues["template:tNo"]).toContain("Missing trainerId");
    expect(issues["template:tWrong"]).toContain("Trainer doc has the wrong role");
    expect(issues["assignment:aBad"]).toContain("Trainer doc missing");
    expect(issues["assignment:aOk"]).toBeUndefined();
    expect(issues["exercise:eSrc"]).toContain("Invalid source");
    expect(issues["exercise:eNoOwner"]).toContain("Missing ownerId");
    expect(issues["exercise:eWrong"]).toContain("Trainer doc has the wrong role");
    expect(issues["exercise:eStd"]).toBeUndefined();
    expect(page.summary.user).toBe(5);
    expect(db.writes).toEqual([]);
  });

  it("paginates with a clamped page size", async () => {
    db = new FakeFirestore({
      users: Object.fromEntries(
        Array.from({ length: 3 }, (_v, i) => [`bad${i}`, { role: "nope" }]),
      ),
    });
    mockDb.current = db;
    const first = await listDataHygienePage(0, 2);
    expect(first.rows).toHaveLength(2);
    expect(first).toMatchObject({ nextOffset: 2, hasMore: true });
    const last = await listDataHygienePage(2, 2);
    expect(last.rows).toHaveLength(1);
    expect(last).toMatchObject({ nextOffset: null, hasMore: false });
  });
});
