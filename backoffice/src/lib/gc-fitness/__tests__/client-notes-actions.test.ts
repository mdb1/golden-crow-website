// client-notes-actions.test.ts — the trainer-private client notes. Admin SDK
// bypasses rules: `assertOwnsClient` (users/{id}.coachId, or
// user_mirror/{id}.coachId for a `mirror:<email>` pre-created client) is the
// only thing stopping a coach from reading/writing notes about someone
// else's client.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
const mockCivilDateToday = jest.fn((_tz: string) => "2026-10-15");
jest.mock("@/lib/gc-fitness/civil-date", () => ({
  ...jest.requireActual("@/lib/gc-fitness/civil-date"),
  civilDateToday: (tz: string) => mockCivilDateToday(tz),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: async () => "America/Argentina/Buenos_Aires",
}));

import { SERVER_TIMESTAMP, fake, ts } from "@/lib/test-utils/fake-firestore-cov-a";

import {
  deleteClientNote,
  editClientNote,
  getClientNotes,
  updateClientNotes,
} from "../client-notes-actions";

const COACH = "coach-A";
const OTHER = "coach-B";
const NOTE_PATH = `client_notes/${COACH}_client-1`;

const entryA = { date: "2026-10-01", notes: "first", createdAt: "2026-10-01T12:00:00.000Z" };
const entryB = { date: "2026-10-02", notes: "second", createdAt: "2026-10-02T12:00:00.000Z" };

beforeEach(() => {
  fake.reset();
  mockCivilDateToday.mockClear();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH },
    "users/client-2": { role: "client", coachId: OTHER },
    "user_mirror/pending@example.com": { coachId: COACH },
    "user_mirror/theirs@example.com": { coachId: OTHER },
    [NOTE_PATH]: {
      coachId: COACH,
      clientId: "client-1",
      notes: "second",
      entries: [entryA, entryB],
      createdAt: ts("2026-10-01T12:00:00Z"),
      updatedAt: ts("2026-10-02T12:00:00Z"),
    },
    // Another coach's note on THEIR client — must never be read or touched.
    [`client_notes/${OTHER}_client-2`]: { coachId: OTHER, notes: "secret", entries: [] },
  });
});

const editInput = (over: Record<string, unknown> = {}) => ({
  clientId: "client-1",
  entryCreatedAt: entryA.createdAt,
  entryDate: entryA.date,
  notes: "edited",
  ...over,
});

describe("auth gate", () => {
  it.each([
    ["getClientNotes", () => getClientNotes("client-1")],
    ["updateClientNotes", () => updateClientNotes({ clientId: "client-1", notes: "x" })],
    ["editClientNote", () => editClientNote(editInput())],
    ["deleteClientNote", () => deleteClientNote(editInput({ notes: undefined }))],
  ])("%s rejects a non-trainer before any read", async (_n, call) => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(call()).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.writes).toEqual([]);
  });
});

describe("ownership (users + mirror:<email>)", () => {
  it.each([
    ["another coach's client", "client-2"],
    ["a missing client", "ghost"],
    ["another coach's mirror", "mirror:theirs@example.com"],
    ["a missing mirror", "mirror:nobody@example.com"],
  ])("rejects %s on every action and writes nothing", async (_n, clientId) => {
    await expect(getClientNotes(clientId)).rejects.toThrow("Forbidden");
    await expect(updateClientNotes({ clientId, notes: "x" })).rejects.toThrow("Forbidden");
    await expect(editClientNote(editInput({ clientId }))).rejects.toThrow("Forbidden");
    await expect(deleteClientNote(editInput({ clientId, notes: undefined }))).rejects.toThrow(
      "Forbidden",
    );
    expect(fake.db.writes).toEqual([]);
    expect(fake.db.reads.filter((p) => p.startsWith("client_notes/"))).toEqual([]);
  });

  it("the mirror path checks user_mirror, not users", async () => {
    await expect(getClientNotes("mirror:pending@example.com")).resolves.toEqual({
      notes: "",
      updatedAt: null,
      entries: [],
    });
    expect(fake.db.reads).toEqual([
      "user_mirror/pending@example.com",
      `client_notes/${COACH}_mirror:pending@example.com`,
    ]);
  });
});

describe("getClientNotes", () => {
  it("reads only the {coachId}_{clientId} doc and projects entries", async () => {
    fake.seed({
      [NOTE_PATH]: {
        notes: 7,
        updatedAt: ts("2026-10-02T12:00:00Z"),
        entries: [
          { date: "2026-10-01", notes: "a", createdAt: ts("2026-10-01T09:00:00Z") },
          { date: 5, notes: null, createdAt: "2026-10-01T10:00:00Z" },
          { createdAt: 42 },
        ],
      },
    });
    await expect(getClientNotes("client-1")).resolves.toEqual({
      notes: "",
      updatedAt: "2026-10-02T12:00:00.000Z",
      entries: [
        { date: "2026-10-01", notes: "a", createdAt: "2026-10-01T09:00:00.000Z" },
        { date: "", notes: "", createdAt: "2026-10-01T10:00:00Z" },
        { date: "", notes: "", createdAt: null },
      ],
    });
    expect(fake.db.reads).toContain(NOTE_PATH);
  });

  it("non-array entries + missing updatedAt project to empty", async () => {
    fake.seed({ [NOTE_PATH]: { notes: "n", entries: "bad" } });
    await expect(getClientNotes("client-1")).resolves.toEqual({
      notes: "n",
      updatedAt: null,
      entries: [],
    });
  });
});

describe("updateClientNotes", () => {
  it.each([
    ["empty clientId", { clientId: " ", notes: "x" }],
    ["notes too long", { clientId: "client-1", notes: "x".repeat(10001) }],
    ["bad date length", { clientId: "client-1", notes: "x", date: "2026-1-1" }],
    ["missing notes", { clientId: "client-1" }],
  ])("rejects invalid input (%s) before any read/write", async (_n, input) => {
    await expect(updateClientNotes(input)).rejects.toThrow();
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.writes).toEqual([]);
  });

  it("appends an entry dated in the TRAINER's civil day and keeps createdAt", async () => {
    const res = await updateClientNotes({ clientId: "client-1", notes: "third" });
    expect(res.ok).toBe(true);
    expect(mockCivilDateToday).toHaveBeenCalledWith("America/Argentina/Buenos_Aires");
    const noteWrite = fake.db.writes.find((w) => w.path === NOTE_PATH);
    expect(noteWrite).toEqual({
      op: "set",
      path: NOTE_PATH,
      options: { merge: true },
      data: {
        coachId: COACH,
        clientId: "client-1",
        notes: "third",
        entries: [
          entryA,
          entryB,
          { date: "2026-10-15", notes: "third", createdAt: expect.any(String) },
        ],
        createdAt: expect.objectContaining({ toDate: expect.any(Function) }),
        updatedAt: SERVER_TIMESTAMP,
      },
    });
    const entryKey = (noteWrite?.data?.entries as Array<{ createdAt: string }>)[2].createdAt;
    const activity = fake.db.writes.find((w) => w.path.startsWith("coach_activity/"));
    expect(activity?.path).toBe(`coach_activity/note:${COACH}_client-1:${entryKey}`);
    expect(activity?.data).toMatchObject({
      trainerId: COACH,
      kind: "note",
      detail: "third",
      clientId: "client-1",
    });
    expect(fake.db.writes).toHaveLength(2);
  });

  it("first note: explicit date, createdAt = serverTimestamp, doc id scoped to this coach", async () => {
    await updateClientNotes({
      clientId: "mirror:pending@example.com",
      notes: "hello",
      date: "2026-09-30",
    });
    const w = fake.db.writes[0];
    expect(w.path).toBe(`client_notes/${COACH}_mirror:pending@example.com`);
    expect(w.data).toMatchObject({
      coachId: COACH,
      clientId: "mirror:pending@example.com",
      entries: [{ date: "2026-09-30", notes: "hello", createdAt: expect.any(String) }],
      createdAt: SERVER_TIMESTAMP,
    });
    expect(mockCivilDateToday).not.toHaveBeenCalled();
  });
});

describe("editClientNote", () => {
  it("rejects empty notes / malformed identity before any read", async () => {
    await expect(editClientNote(editInput({ notes: "  " }))).rejects.toThrow();
    await expect(editClientNote(editInput({ entryDate: "x" }))).rejects.toThrow();
    expect(fake.db.reads).toEqual([]);
  });

  it("throws 'Note not found.' when the doc or the (createdAt,date) entry is missing", async () => {
    await expect(editClientNote(editInput({ entryDate: "2026-10-09" }))).rejects.toThrow(
      "Note not found.",
    );
    fake.db.docs.delete(NOTE_PATH);
    await expect(editClientNote(editInput())).rejects.toThrow("Note not found.");
    expect(fake.db.writes).toEqual([]);
  });

  it("rewrites only the matched entry's text; touches only entries + updatedAt", async () => {
    await editClientNote(editInput({ notes: "  edited  " }));
    expect(fake.db.writes).toEqual([
      {
        op: "set",
        path: NOTE_PATH,
        options: { merge: true },
        data: {
          entries: [{ ...entryA, notes: "edited" }, entryB],
          updatedAt: SERVER_TIMESTAMP,
        },
      },
    ]);
  });
});

describe("deleteClientNote", () => {
  const delInput = (over: Record<string, unknown> = {}) => ({
    clientId: "client-1",
    entryCreatedAt: entryB.createdAt,
    entryDate: entryB.date,
    ...over,
  });

  it("throws 'Note not found.' when nothing matches or the doc is missing", async () => {
    await expect(deleteClientNote(delInput({ entryCreatedAt: "nope" }))).rejects.toThrow(
      "Note not found.",
    );
    fake.db.docs.delete(NOTE_PATH);
    await expect(deleteClientNote(delInput())).rejects.toThrow("Note not found.");
    expect(fake.db.writes).toEqual([]);
  });

  it("removes only the matched entry", async () => {
    await deleteClientNote(delInput());
    expect(fake.db.writes).toEqual([
      {
        op: "set",
        path: NOTE_PATH,
        options: { merge: true },
        data: { entries: [entryA], updatedAt: SERVER_TIMESTAMP },
      },
    ]);
  });
});
