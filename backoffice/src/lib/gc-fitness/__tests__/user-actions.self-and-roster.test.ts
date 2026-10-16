// __tests__/user-actions.self-and-roster.test.ts
//
// Executes the coach-scoped `user-actions.ts` Server Actions that no other
// suite runs (provisionClient has its own: user-actions.provision-link) against
// the in-memory Firestore from fake-firestore-c, with the REAL auth-helpers over
// a mocked `getTokens`. Assertions are on the WRITTEN documents (fake-c throws
// on an `undefined` field value, mirroring the Admin SDK) and on tenant
// isolation: a coach can never touch another coach's client / pending invite.

import {
  FakeFirestore,
  FakeTimestamp,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockCookieSet = jest.fn();
const mockAuth = {
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(async () => undefined),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined, set: mockCookieSet })),
}));
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
  getLocale: jest.fn(async () => "es"),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => mockAuth,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
jest.mock("../email/smtp", () => ({
  sendMail: jest.fn(async () => ({ ok: true })),
  isEmailConfigured: () => false,
}));

import { getTokens } from "next-firebase-auth-edge";

import {
  getCurrentTrainerProfile,
  removePendingClient,
  unlinkClient,
  updateChatQuickReplies,
  updateClientNickname,
  updatePreferredLocale,
  updateTrainerProfile,
} from "../user-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

beforeEach(() => {
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  mockCookieSet.mockReset();
  mockAuth.getUser.mockReset();
  mockAuth.getUser.mockResolvedValue({ uid: "x", customClaims: {} });
  mockAuth.setCustomUserClaims.mockClear();
  signInAs("coach-a", ["trainer"]);

  db.seed("users/coach-a", { role: "trainer", displayName: "Coach A", email: "coach-a@example.com", chatQuickReplies: ["old"] });
  db.seed("users/coach-b", { role: "trainer", displayName: "Coach B" });
  db.seed("users/client-a1", {
    role: "client",
    email: "Ana@Example.com",
    coachId: "coach-a",
    coachDisplayName: "Coach A",
    coachPhotoURL: "https://img/a.png",
    coachBio: "bio",
    autoAssignedCoach: true,
    coachNickname: "Anita",
    displayName: "Ana",
    tier: "premium",
  });
  db.seed("users/client-b1", { role: "client", email: "bea@example.com", coachId: "coach-b", displayName: "Bea" });
  db.seed("chats/client-a1", { coachId: "coach-a", clientId: "client-a1", lastMessage: "hola" });
  db.seed("chats/client-b1", { coachId: "coach-b", clientId: "client-b1" });
});

const ALL_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["unlinkClient", () => unlinkClient({ clientId: "client-a1" })],
  ["removePendingClient", () => removePendingClient({ email: "pending@example.com" })],
  ["updateTrainerProfile", () => updateTrainerProfile({ displayName: "X" })],
  ["updateClientNickname", () => updateClientNickname({ clientId: "client-a1", coachNickname: "X" })],
  ["updateChatQuickReplies", () => updateChatQuickReplies({ replies: ["hi"] })],
  ["updatePreferredLocale", () => updatePreferredLocale({ locale: "es" })],
  ["getCurrentTrainerProfile", () => getCurrentTrainerProfile()],
];

describe("auth gate", () => {
  it.each(ALL_ACTIONS)("%s rejects signed-out and non-trainer callers with Forbidden and no I/O", async (_name, call) => {
    for (const roles of [null, ["client"], ["admin"]]) {
      if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
      else signInAs("someone", roles);
      await expect(call()).rejects.toThrow("Forbidden");
    }
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});

describe("updateChatQuickReplies", () => {
  it("writes trimmed, non-empty replies to the CALLER's doc only (uid in input is ignored)", async () => {
    await expect(
      updateChatQuickReplies({ replies: ["  Great job!  ", "   ", "See you"], uid: "coach-b" }),
    ).resolves.toEqual({ ok: true });
    expect(db.writes.map((w) => [w.op, w.path])).toEqual([["update", "users/coach-a"]]);
    const doc = db.doc("users/coach-a")!;
    expect(doc.chatQuickReplies).toEqual(["Great job!", "See you"]);
    expect(doc.updatedAt).toBeInstanceOf(FakeTimestamp);
    expect(doc.displayName).toBe("Coach A");
    expect(db.doc("users/coach-b")).toEqual({ role: "trainer", displayName: "Coach B" });
  });

  it("an empty (or all-whitespace) list DELETES the key instead of writing []", async () => {
    await updateChatQuickReplies({ replies: ["  ", ""] });
    const doc = db.doc("users/coach-a")!;
    expect("chatQuickReplies" in doc).toBe(false);
    expect(doc.updatedAt).toBeInstanceOf(FakeTimestamp);
  });

  it("caps at 20 templates × 240 chars, writing nothing on overflow", async () => {
    await expect(updateChatQuickReplies({ replies: Array.from({ length: 21 }, (_, i) => `r${i}`) })).rejects.toThrow();
    await expect(updateChatQuickReplies({ replies: ["x".repeat(241)] })).rejects.toThrow();
    await expect(updateChatQuickReplies({ replies: "nope" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});

describe("updatePreferredLocale", () => {
  it("writes preferredLocale on the caller's doc and sets the NEXT_LOCALE cookie", async () => {
    await expect(updatePreferredLocale({ locale: "es" })).resolves.toEqual({ ok: true });
    expect(db.writes.map((w) => [w.op, w.path])).toEqual([["update", "users/coach-a"]]);
    expect(db.doc("users/coach-a")).toMatchObject({ preferredLocale: "es", displayName: "Coach A" });
    expect(db.doc("users/coach-a")!.updatedAt).toBeInstanceOf(FakeTimestamp);
    expect(mockCookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "es", expect.objectContaining({ path: "/", httpOnly: false }));
  });

  it("rejects a locale outside {en, es} with no write and no cookie", async () => {
    await expect(updatePreferredLocale({ locale: "fr" } as never)).rejects.toThrow();
    expect(db.writes).toEqual([]);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});

describe("updateTrainerProfile", () => {
  it("merges the profile into the caller's doc and fans out coach fields to OWN clients + mirrors only", async () => {
    db.seed("user_mirror/pend@example.com", { coachId: "coach-a", email: "pend@example.com" });
    db.seed("user_mirror/other@example.com", { coachId: "coach-b", email: "other@example.com" });

    await updateTrainerProfile({ displayName: "  Coach Ana ", photoURL: "https://img/new.png", bio: "  Strength " });

    const me = db.doc("users/coach-a")!;
    expect(me).toMatchObject({
      email: "coach-a@example.com",
      displayName: "Coach Ana",
      photoURL: "https://img/new.png",
      bio: "Strength",
      coachBio: "Strength",
      role: "trainer",
      chatQuickReplies: ["old"], // merge — unrelated field survives
    });
    expect(me.updatedAt).toBeInstanceOf(FakeTimestamp);

    expect(db.doc("users/client-a1")).toMatchObject({
      coachDisplayName: "Coach Ana",
      coachPhotoURL: "https://img/new.png",
      coachBio: "Strength",
      displayName: "Ana",
    });
    expect(db.doc("user_mirror/pend@example.com")).toMatchObject({ coachDisplayName: "Coach Ana" });
    // tenant isolation
    expect(db.doc("users/client-b1")!.coachDisplayName).toBeUndefined();
    expect(db.doc("user_mirror/other@example.com")!.coachDisplayName).toBeUndefined();
    expect(db.writes.every((w) => !w.path.includes("coach-b") && w.path !== "users/client-b1")).toBe(true);
  });

  it("an explicit null photo/bio is written as null (never undefined)", async () => {
    await updateTrainerProfile({ displayName: "A", photoURL: null, bio: null });
    expect(db.doc("users/coach-a")).toMatchObject({ photoURL: null, bio: null, coachBio: null });
    expect(db.doc("users/client-a1")).toMatchObject({ coachPhotoURL: null, coachBio: null });
  });

  it("rejects an empty name / non-URL photo / over-long bio with no write", async () => {
    await expect(updateTrainerProfile({ displayName: "   " })).rejects.toThrow();
    await expect(updateTrainerProfile({ displayName: "A", photoURL: "not a url" })).rejects.toThrow();
    await expect(updateTrainerProfile({ displayName: "A", bio: "x".repeat(281) })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});

describe("updateClientNickname", () => {
  it("sets the nickname on an OWN client (merge)", async () => {
    await updateClientNickname({ clientId: "client-a1", coachNickname: "  Anu " });
    const doc = db.doc("users/client-a1")!;
    expect(doc.coachNickname).toBe("Anu");
    expect(doc.updatedAt).toBeInstanceOf(FakeTimestamp);
    expect(doc.coachId).toBe("coach-a");
    expect(doc.displayName).toBe("Ana");
  });

  it("null / omitted nickname deletes the key", async () => {
    await updateClientNickname({ clientId: "client-a1", coachNickname: null });
    expect("coachNickname" in db.doc("users/client-a1")!).toBe(false);
    db.seed("users/client-a1", { ...db.doc("users/client-a1"), coachNickname: "again" });
    await updateClientNickname({ clientId: "client-a1" });
    expect("coachNickname" in db.doc("users/client-a1")!).toBe(false);
  });

  it("refuses another coach's client and a missing client with Forbidden and no write", async () => {
    await expect(updateClientNickname({ clientId: "client-b1", coachNickname: "pwn" })).rejects.toThrow("Forbidden");
    await expect(updateClientNickname({ clientId: "ghost", coachNickname: "pwn" })).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });
});

describe("getCurrentTrainerProfile", () => {
  it("returns only the narrow slice of the caller's doc, trimming photo/bio", async () => {
    db.seed("users/coach-a", {
      displayName: "Coach A",
      photoURL: "  https://img/a.png ",
      bio: "  ",
      chatQuickReplies: ["hi"],
      email: "secret@example.com",
      fcmTokens: ["t"],
    });
    mockAuth.getUser.mockResolvedValue({ uid: "coach-a", photoURL: "https://auth/p.png" });
    await expect(getCurrentTrainerProfile()).resolves.toEqual({
      uid: "coach-a",
      displayName: "Coach A",
      photoURL: "https://img/a.png",
      bio: null,
      chatQuickReplies: ["hi"],
    });
    expect(db.writes).toEqual([]);
  });

  it("falls back to the Auth photo, and to empty defaults when the doc is missing", async () => {
    db.seed("users/coach-a", { displayName: "A" });
    mockAuth.getUser.mockResolvedValue({ uid: "coach-a", photoURL: "https://auth/p.png" });
    await expect(getCurrentTrainerProfile()).resolves.toMatchObject({ photoURL: "https://auth/p.png", chatQuickReplies: [] });

    db.store.delete("users/coach-a");
    mockAuth.getUser.mockRejectedValue(new Error("no auth user"));
    await expect(getCurrentTrainerProfile()).resolves.toEqual({
      uid: "coach-a",
      displayName: "",
      photoURL: null,
      bio: null,
      chatQuickReplies: [],
    });
  });
});

describe("removePendingClient", () => {
  beforeEach(() => {
    db.seed("user_mirror/pend@example.com", { coachId: "coach-a", email: "pend@example.com" });
    db.seed("workout_assignments/wa-mine", { trainerId: "coach-a", pendingEmail: "pend@example.com" });
    db.seed("workout_assignments/wa-other-coach", { trainerId: "coach-b", pendingEmail: "pend@example.com" });
    db.seed("workout_assignments/wa-other-email", { trainerId: "coach-a", pendingEmail: "x@example.com" });
    db.seed("habits/h-mine", { trainerId: "coach-a", pendingEmail: "pend@example.com" });
    db.seed("habits/h-other-coach", { trainerId: "coach-b", pendingEmail: "pend@example.com" });
  });

  it("deletes the mirror + MY pre-loads for that email, never another coach's, and soft-marks the activity event", async () => {
    await expect(removePendingClient({ email: "  PEND@example.com " })).resolves.toEqual({ ok: true });
    expect(db.doc("user_mirror/pend@example.com")).toBeUndefined();
    expect(db.doc("workout_assignments/wa-mine")).toBeUndefined();
    expect(db.doc("habits/h-mine")).toBeUndefined();
    expect(db.doc("workout_assignments/wa-other-coach")).toBeDefined();
    expect(db.doc("workout_assignments/wa-other-email")).toBeDefined();
    expect(db.doc("habits/h-other-coach")).toBeDefined();

    const ev = db.doc("coach_activity/client:coach-a:pend@example.com")!;
    expect(ev.deleted).toBe(true);
    expect(ev.deletedAt).toBeInstanceOf(FakeTimestamp);
  });

  it("refuses another coach's pending invite with Forbidden and deletes nothing", async () => {
    db.seed("user_mirror/theirs@example.com", { coachId: "coach-b", email: "theirs@example.com" });
    db.seed("workout_assignments/wa-theirs", { trainerId: "coach-b", pendingEmail: "theirs@example.com" });
    await expect(removePendingClient({ email: "theirs@example.com" })).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(db.doc("user_mirror/theirs@example.com")).toBeDefined();
  });

  it("is idempotent: a missing mirror is a no-op success", async () => {
    await expect(removePendingClient({ email: "never@example.com" })).resolves.toEqual({ ok: true });
    expect(db.writes).toEqual([]);
  });

  it("rejects a non-email with no I/O", async () => {
    await expect(removePendingClient({ email: "not-an-email" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});

describe("unlinkClient", () => {
  it("clears the link + denormalized coach fields, keeps the person, clears the chat's coachId, resyncs the claim", async () => {
    mockAuth.getUser.mockResolvedValue({ uid: "client-a1", customClaims: { role: "client", coachId: "coach-a", beta: true } });

    await expect(unlinkClient({ clientId: "client-a1" })).resolves.toEqual({ ok: true });

    const client = db.doc("users/client-a1")!;
    for (const k of ["coachId", "coachDisplayName", "coachPhotoURL", "coachBio", "autoAssignedCoach"]) {
      expect(k in client).toBe(false);
    }
    expect(client).toMatchObject({ role: "client", email: "Ana@Example.com", displayName: "Ana", tier: "premium" });
    expect(client.updatedAt).toBeInstanceOf(FakeTimestamp);

    const chat = db.doc("chats/client-a1")!;
    expect("coachId" in chat).toBe(false);
    expect(chat).toMatchObject({ clientId: "client-a1", lastMessage: "hola" });

    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("client-a1", { role: "client", beta: true });
    // activity event keyed by the NORMALIZED email
    expect(db.doc("coach_activity/client:coach-a:ana@example.com")).toMatchObject({ deleted: true });
  });

  it("no chat doc → only the user doc is updated (no NOT_FOUND update)", async () => {
    db.store.delete("chats/client-a1");
    await unlinkClient({ clientId: "client-a1" });
    expect(db.writesTo("chats/")).toEqual([]);
  });

  it("claim sync failure is fail-soft", async () => {
    mockAuth.getUser.mockRejectedValue(new Error("auth down"));
    await expect(unlinkClient({ clientId: "client-a1" })).resolves.toEqual({ ok: true });
    expect("coachId" in db.doc("users/client-a1")!).toBe(false);
  });

  it("refuses another coach's client and a missing one with Forbidden, no writes, no claims", async () => {
    await expect(unlinkClient({ clientId: "client-b1" })).rejects.toThrow("Forbidden");
    await expect(unlinkClient({ clientId: "ghost-client" })).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(db.doc("users/client-b1")!.coachId).toBe("coach-b");
    expect(db.doc("chats/client-b1")!.coachId).toBe("coach-b");
  });

  it("rejects a too-short clientId at the schema", async () => {
    await expect(unlinkClient({ clientId: "abc" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});
