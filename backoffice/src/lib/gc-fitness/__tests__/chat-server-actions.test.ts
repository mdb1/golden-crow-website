// chat-server-actions.test.ts — authorization + wire-shape pins for the trainer
// chat Server Actions. The Admin SDK bypasses firestore.rules, so the
// `chat.coachId === session.uid` precondition in each action is the ONLY gate
// between a coach and another coach's client conversations.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return {
    gcFitnessFirestore: () => f.fake.db,
    gcFitnessStorage: () => f.fake.storage,
  };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

import {
  FIELD_DELETE,
  SERVER_TIMESTAMP,
  fake,
  increment,
  ts,
} from "@/lib/test-utils/fake-firestore-cov-a";

import {
  deleteTrainerChatMessage,
  fetchMessages,
  getChatAttachmentUrl,
  listChatsForTrainer,
  markChatReadForTrainer,
  sendTrainerMessage,
  setReadReceiptForTrainer,
  setTrainerMessageReaction,
  uploadTrainerChatAttachment,
} from "../chat-server-actions";

const COACH = "coach-A";
const OTHER = "coach-B";

function seedChats() {
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH },
    "users/client-2": { role: "client", coachId: OTHER },
    "chats/client-1": { coachId: COACH, clientId: "client-1" },
    "chats/client-2": { coachId: OTHER, clientId: "client-2" },
    "chats/client-2/messages/m1": {
      kind: "text",
      text: "private",
      senderId: "client-2",
      createdAt: ts("2026-10-01T10:00:00Z"),
    },
    "chats/client-1/messages/m1": {
      kind: "text",
      text: "hi",
      senderId: "client-1",
      createdAt: ts("2026-10-01T10:00:00Z"),
    },
  });
}

function noWrites() {
  expect(fake.db.writes).toEqual([]);
  expect(fake.storage.saves).toEqual([]);
}

beforeEach(() => {
  fake.reset();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  seedChats();
});

describe("auth gate — every action requires a trainer session", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["uploadTrainerChatAttachment", () =>
      uploadTrainerChatAttachment({
        chatId: "client-1",
        kind: "image",
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        base64Data: Buffer.from("x").toString("base64"),
      })],
    ["sendTrainerMessage", () => sendTrainerMessage({ chatId: "client-1", kind: "text", text: "hi" })],
    ["deleteTrainerChatMessage", () => deleteTrainerChatMessage({ chatId: "client-1", messageId: "m1" })],
    ["setTrainerMessageReaction", () =>
      setTrainerMessageReaction({ chatId: "client-1", messageId: "m1", emoji: "👍" })],
    ["listChatsForTrainer", () => listChatsForTrainer()],
    ["fetchMessages", () => fetchMessages("client-1")],
    ["setReadReceiptForTrainer", () => setReadReceiptForTrainer("client-1", "m1")],
    ["getChatAttachmentUrl", () => getChatAttachmentUrl("client-1", "images/client-1/x.jpg")],
    ["markChatReadForTrainer", () => markChatReadForTrainer("client-1")],
  ];
  it.each(calls)("%s rejects without a trainer session and touches nothing", async (_n, call) => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(call()).rejects.toThrow("Forbidden");
    noWrites();
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.queries).toEqual([]);
    expect(fake.storage.signed).toEqual([]);
  });
});

describe("uploadTrainerChatAttachment", () => {
  const base = {
    chatId: "client-1",
    kind: "image" as const,
    fileName: "Photo.JPG",
    mimeType: "image/jpeg",
    base64Data: Buffer.from("hello").toString("base64"),
  };

  it("rejects another coach's chat without uploading", async () => {
    await expect(uploadTrainerChatAttachment({ ...base, chatId: "client-2" })).rejects.toThrow(
      "Forbidden",
    );
    noWrites();
  });

  it("rejects a missing chat with 'Chat not found'", async () => {
    await expect(uploadTrainerChatAttachment({ ...base, chatId: "nope" })).rejects.toThrow(
      "Chat not found",
    );
    noWrites();
  });

  it("rejects empty and oversized payloads before saving", async () => {
    await expect(uploadTrainerChatAttachment({ ...base, base64Data: "" })).rejects.toThrow(
      "Empty upload",
    );
    const big = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
    await expect(uploadTrainerChatAttachment({ ...base, base64Data: big })).rejects.toThrow(
      "Attachment too large",
    );
    noWrites();
  });

  it("voice allows up to 15 MB (image cap is 10 MB)", async () => {
    const elevenMb = Buffer.alloc(11 * 1024 * 1024).toString("base64");
    await uploadTrainerChatAttachment({
      ...base,
      kind: "voice",
      fileName: "v.m4a",
      mimeType: "audio/mp4",
      base64Data: elevenMb,
    });
    expect(fake.storage.saves).toHaveLength(1);
    const tooBig = Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64");
    await expect(
      uploadTrainerChatAttachment({ ...base, kind: "voice", base64Data: tooBig }),
    ).rejects.toThrow("Attachment too large");
  });

  it("saves under images/{chatId}/{newId}.{ext} with immutable cache headers", async () => {
    const { storagePath } = await uploadTrainerChatAttachment(base);
    expect(storagePath).toMatch(/^images\/client-1\/auto-\d+\.jpg$/);
    expect(fake.storage.saves).toEqual([
      {
        bucket: undefined,
        path: storagePath,
        bytes: 5,
        options: {
          resumable: false,
          metadata: {
            contentType: "image/jpeg",
            cacheControl: "public,max-age=31536000,immutable",
          },
        },
      },
    ]);
    // Upload never writes a Firestore doc (the message is sent separately).
    expect(fake.db.writes).toEqual([]);
  });

  it("voice uploads go under voices/ and sanitize / default the extension", async () => {
    const r1 = await uploadTrainerChatAttachment({
      ...base,
      kind: "voice",
      fileName: "note.m$4a",
      mimeType: "",
    });
    expect(r1.storagePath).toMatch(/^voices\/client-1\/auto-\d+\.m4a$/);
    const r2 = await uploadTrainerChatAttachment({ ...base, fileName: "noext." });
    expect(r2.storagePath).toMatch(/\.jpg$/);
    expect((fake.storage.saves[0].options as { metadata: { contentType: unknown } }).metadata
      .contentType).toBeUndefined();
  });
});

describe("sendTrainerMessage", () => {
  it("rejects another coach's existing chat and writes nothing", async () => {
    await expect(
      sendTrainerMessage({ chatId: "client-2", kind: "text", text: "hijack" }),
    ).rejects.toThrow("Forbidden");
    noWrites();
  });

  it("first message to a never-messaged client: falls back to users/{id}.coachId", async () => {
    fake.seed({ "users/client-3": { role: "client", coachId: OTHER } });
    await expect(
      sendTrainerMessage({ chatId: "client-3", kind: "text", text: "hi" }),
    ).rejects.toThrow("Forbidden");
    noWrites();
  });

  it.each([
    ["missing user", {}, "Client not found"],
    ["non-client role", { "users/client-4": { role: "trainer", coachId: COACH } }, "Client not found"],
    ["deleted client", { "users/client-4": { role: "client", coachId: COACH, deleted: true } }, "Client not found"],
  ])("first message rejects %s", async (_n, seed, msg) => {
    fake.seed(seed as Record<string, Record<string, unknown>>);
    await expect(
      sendTrainerMessage({ chatId: "client-4", kind: "text", text: "hi" }),
    ).rejects.toThrow(msg);
    noWrites();
  });

  it.each([
    ["empty text", { chatId: "client-1", kind: "text", text: "" }],
    ["image without path", { chatId: "client-1", kind: "image" }],
    ["voice without path", { chatId: "client-1", kind: "voice", voiceDurationMs: 10 }],
    ["voice over 60s", { chatId: "client-1", kind: "voice", voicePath: "voices/client-1/a.m4a", voiceDurationMs: 60001 }],
    ["unknown kind", { chatId: "client-1", kind: "video" }],
    ["missing chatId", { kind: "text", text: "x" }],
  ])("rejects invalid input (%s) before any read/write", async (_n, input) => {
    await expect(sendTrainerMessage(input)).rejects.toThrow();
    noWrites();
    expect(fake.db.reads).toEqual([]);
  });

  it("writes the message with server-trusted senderId (caller senderId stripped) + chat denorm", async () => {
    const { id } = await sendTrainerMessage({
      chatId: "client-1",
      kind: "text",
      text: "hola",
      senderId: "client-1", // tampered — must be ignored
      createdAt: "1999-01-01",
    });
    const msgPath = `chats/client-1/messages/${id}`;
    const [msgWrite, chatWrite] = fake.db.writes;
    expect(msgWrite.op).toBe("set");
    expect(msgWrite.path).toBe(msgPath);
    expect(msgWrite.data).toEqual({
      kind: "text",
      senderId: COACH,
      createdAt: expect.any(Date),
      text: "hola",
    });
    const createdAt = msgWrite.data?.createdAt;
    expect(chatWrite).toEqual({
      op: "set",
      path: "chats/client-1",
      options: { merge: true },
      data: {
        clientId: "client-1",
        coachId: COACH,
        lastMessage: { text: "hola", senderId: COACH, createdAt, kind: "text" },
        lastMessageAt: createdAt,
        "unreadCount.client-1": increment(1),
        updatedAt: createdAt,
      },
    });
    expect(fake.db.writes).toHaveLength(2);
  });

  it("image message: whitelisted fields, caption, preview '[Image]' when no caption, replyTo re-emitted with 4 keys", async () => {
    await sendTrainerMessage({
      chatId: "client-1",
      kind: "image",
      imagePath: "images/client-1/p.jpg",
      imageWidth: 100,
      imageHeight: 50,
      replyTo: { messageId: "m1", senderId: "client-1", kind: "text", textSnippet: "hi", extra: "x" },
    });
    const msg = fake.db.writes[0].data;
    expect(msg).toEqual({
      kind: "image",
      senderId: COACH,
      createdAt: expect.any(Date),
      imagePath: "images/client-1/p.jpg",
      imageWidth: 100,
      imageHeight: 50,
      replyTo: { messageId: "m1", senderId: "client-1", kind: "text", textSnippet: "hi" },
    });
    expect((fake.db.writes[1].data?.lastMessage as { text: string }).text).toBe("[Image]");

    fake.db.writes = [];
    await sendTrainerMessage({
      chatId: "client-1",
      kind: "image",
      imagePath: "images/client-1/q.jpg",
      text: "caption",
    });
    expect(fake.db.writes[0].data?.text).toBe("caption");
    expect((fake.db.writes[1].data?.lastMessage as { text: string }).text).toBe("caption");
  });

  it("voice message writes voicePath + duration and previews '[Voice]'", async () => {
    await sendTrainerMessage({
      chatId: "client-1",
      kind: "voice",
      voicePath: "voices/client-1/a.m4a",
      voiceDurationMs: 1200,
    });
    expect(fake.db.writes[0].data).toEqual({
      kind: "voice",
      senderId: COACH,
      createdAt: expect.any(Date),
      voicePath: "voices/client-1/a.m4a",
      voiceDurationMs: 1200,
    });
    expect((fake.db.writes[1].data?.lastMessage as { text: string }).text).toBe("[Voice]");
  });

  it("first message to an OWNED never-messaged client creates the chat", async () => {
    fake.seed({ "users/client-5": { role: "client", coachId: COACH } });
    await sendTrainerMessage({ chatId: "client-5", kind: "text", text: "welcome" });
    expect(fake.doc("chats/client-5")).toMatchObject({ coachId: COACH, clientId: "client-5" });
  });
});

describe("deleteTrainerChatMessage", () => {
  it("requires chatId + messageId", async () => {
    await expect(deleteTrainerChatMessage({ chatId: " ", messageId: "m1" })).rejects.toThrow(
      "chatId + messageId required.",
    );
    noWrites();
  });

  it("rejects another coach's chat — the message survives", async () => {
    await expect(
      deleteTrainerChatMessage({ chatId: "client-2", messageId: "m1" }),
    ).rejects.toThrow("Forbidden");
    noWrites();
    expect(fake.doc("chats/client-2/messages/m1")).toBeDefined();
  });

  it("rejects a missing chat", async () => {
    await expect(deleteTrainerChatMessage({ chatId: "ghost", messageId: "m1" })).rejects.toThrow(
      "Chat not found.",
    );
    noWrites();
  });

  it("is idempotent on a missing message", async () => {
    await expect(
      deleteTrainerChatMessage({ chatId: "client-1", messageId: "gone" }),
    ).resolves.toEqual({ ok: true });
    noWrites();
  });

  it("deletes a non-last message without touching the chat denorm", async () => {
    fake.seed({
      "chats/client-1": {
        coachId: COACH,
        lastMessage: { senderId: COACH, createdAt: ts("2026-10-02T00:00:00Z") },
      },
    });
    await deleteTrainerChatMessage({ chatId: "client-1", messageId: "m1" });
    expect(fake.db.writes).toEqual([{ op: "delete", path: "chats/client-1/messages/m1" }]);
  });

  it("recomputes lastMessage from the new top message when the last one is deleted", async () => {
    fake.seed({
      "chats/client-1": {
        coachId: COACH,
        lastMessage: { senderId: COACH, createdAt: { seconds: 1_790_000_100, nanoseconds: 0 } },
      },
      "chats/client-1/messages/m2": {
        kind: "image",
        senderId: COACH,
        createdAt: new Date(1_790_000_100_000),
      },
    });
    await deleteTrainerChatMessage({ chatId: "client-1", messageId: "m2" });
    expect(fake.db.writes[0]).toEqual({ op: "delete", path: "chats/client-1/messages/m2" });
    expect(fake.db.writes[1]).toEqual({
      op: "update",
      path: "chats/client-1",
      data: {
        lastMessage: {
          text: "hi",
          senderId: "client-1",
          createdAt: expect.anything(),
          kind: "text",
        },
        lastMessageAt: expect.anything(),
        updatedAt: expect.any(Date),
      },
    });
  });

  it.each([
    ["image without caption", { kind: "image", senderId: "x", createdAt: 1 }, "[Image]"],
    ["voice", { kind: "voice", senderId: "x", createdAt: 1 }, "[Voice]"],
  ])("recompute preview for %s", async (_n, top, preview) => {
    const created = ts("2026-10-05T00:00:00Z");
    fake.db.docs.delete("chats/client-1/messages/m1");
    fake.seed({
      "chats/client-1": { coachId: COACH, lastMessage: { senderId: COACH, createdAt: created } },
      "chats/client-1/messages/last": { kind: "text", senderId: COACH, createdAt: created },
      "chats/client-1/messages/prev": { ...top, createdAt: ts("2026-10-04T00:00:00Z") },
    });
    await deleteTrainerChatMessage({ chatId: "client-1", messageId: "last" });
    expect((fake.db.writes[1].data?.lastMessage as { text: string }).text).toBe(preview);
  });

  it("clears lastMessage when the thread becomes empty", async () => {
    const created = ts("2026-10-01T10:00:00Z");
    fake.seed({
      "chats/client-1": { coachId: COACH, lastMessage: { senderId: "client-1", createdAt: created } },
    });
    await deleteTrainerChatMessage({ chatId: "client-1", messageId: "m1" });
    expect(fake.db.writes[1]).toEqual({
      op: "update",
      path: "chats/client-1",
      data: { lastMessage: FIELD_DELETE, lastMessageAt: null, updatedAt: expect.any(Date) },
    });
  });
});

describe("setTrainerMessageReaction", () => {
  it("rejects another coach's chat", async () => {
    await expect(
      setTrainerMessageReaction({ chatId: "client-2", messageId: "m1", emoji: "👍" }),
    ).rejects.toThrow("Forbidden");
    noWrites();
  });

  it("rejects emoji outside the allow-list and missing ids before reading", async () => {
    await expect(
      setTrainerMessageReaction({ chatId: "client-1", messageId: "m1", emoji: "💩" }),
    ).rejects.toThrow("Unsupported reaction.");
    await expect(
      setTrainerMessageReaction({ chatId: "client-1", messageId: "", emoji: "👍" }),
    ).rejects.toThrow("chatId + messageId required.");
    noWrites();
    expect(fake.db.reads).toEqual([]);
  });

  it("rejects a missing chat; is a no-op for a missing message", async () => {
    await expect(
      setTrainerMessageReaction({ chatId: "ghost", messageId: "m1", emoji: "👍" }),
    ).rejects.toThrow("Chat not found.");
    await expect(
      setTrainerMessageReaction({ chatId: "client-1", messageId: "gone", emoji: "👍" }),
    ).resolves.toEqual({ ok: true });
    noWrites();
  });

  it("writes ONLY the caller's own reactions slot; null removes it", async () => {
    await setTrainerMessageReaction({ chatId: "client-1", messageId: "m1", emoji: "🔥" });
    expect(fake.db.writes).toEqual([
      { op: "update", path: "chats/client-1/messages/m1", data: { [`reactions.${COACH}`]: "🔥" } },
    ]);
    await setTrainerMessageReaction({ chatId: "client-1", messageId: "m1", emoji: null });
    expect(fake.db.writes[1].data).toEqual({ [`reactions.${COACH}`]: FIELD_DELETE });
  });
});

describe("listChatsForTrainer", () => {
  it("scopes the query to coachId == session.uid and never returns another coach's chat", async () => {
    const rows = await listChatsForTrainer();
    expect(fake.db.queries[0]).toMatchObject({
      path: "chats",
      filters: [["coachId", "==", COACH]],
      limit: 200,
    });
    expect(rows.map((r) => r.id)).toEqual(["client-1"]);
  });

  it("projects denorm, merges legacy unreadCount keys, falls back to the latest message, sorts desc", async () => {
    fake.seed({
      "chats/client-1": {
        coachId: COACH,
        "unreadCount.coach-A": 2,
        "unreadCount.": 9,
        unreadCount: { "client-1": 1, bad: "x" },
      },
      "chats/c-new": {
        coachId: COACH,
        clientId: "c-new",
        lastMessage: { text: "yo", senderId: COACH, createdAt: ts("2026-10-03T00:00:00Z"), kind: "text" },
        lastMessageAt: ts("2026-10-03T00:00:00Z"),
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: new Date("2026-10-03T00:00:00Z"),
      },
      "chats/c-empty": { coachId: COACH, lastMessage: { kind: "sticker", createdAt: ts("2026-01-01T00:00:00Z") } },
    });
    const rows = await listChatsForTrainer();
    expect(rows.map((r) => r.id)).toEqual(["c-new", "client-1", "c-empty"]);
    expect(rows[0]).toEqual({
      id: "c-new",
      clientId: "c-new",
      coachId: COACH,
      lastMessage: { text: "yo", senderId: COACH, createdAt: "2026-10-03T00:00:00.000Z", kind: "text" },
      lastMessageAt: "2026-10-03T00:00:00.000Z",
      unreadCount: {},
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-10-03T00:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      clientId: "client-1",
      lastMessage: { text: "hi", senderId: "client-1", kind: "text" },
      lastMessageAt: "2026-10-01T10:00:00.000Z",
      unreadCount: { "coach-A": 2, "client-1": 1 },
    });
    expect(rows[2]).toMatchObject({ lastMessage: undefined, lastMessageAt: null, coachId: COACH });
  });
});

describe("fetchMessages", () => {
  it("rejects another coach's thread", async () => {
    await expect(fetchMessages("client-2")).rejects.toThrow("Forbidden");
    expect(fake.db.queries).toEqual([]);
  });

  it("returns [] for a chat that does not exist yet", async () => {
    await expect(fetchMessages("nope")).resolves.toEqual([]);
    expect(fake.db.queries).toEqual([]);
  });

  it("clamps the limit to 1..200 and pages with beforeCreatedAt", async () => {
    await fetchMessages("client-1", 10_000);
    expect(fake.db.queries[0].limit).toBe(200);
    await fetchMessages("client-1", 0, "2026-10-01T11:00:00Z");
    expect(fake.db.queries[1]).toMatchObject({
      limit: 1,
      filters: [["createdAt", "<", new Date("2026-10-01T11:00:00Z")]],
    });
    await fetchMessages("client-1", 5, "garbage");
    expect(fake.db.queries[2].filters).toEqual([]);
  });

  it("projects rows oldest-first with readBy / reactions / replyTo", async () => {
    fake.seed({
      "chats/client-1/messages/m2": {
        kind: "image",
        senderId: COACH,
        createdAt: ts("2026-10-02T00:00:00Z"),
        imagePath: "images/client-1/m2.jpg",
        imageWidth: 3,
        imageHeight: 4,
        reactions: { "client-1": "❤️" },
        readBy: { "client-1": ts("2026-10-02T01:00:00Z"), junk: 5 },
        replyTo: { messageId: "m1", senderId: "client-1", kind: "text", textSnippet: "hi" },
      },
      "chats/client-1/messages/m3": {
        kind: "voice",
        createdAt: ts("2026-10-03T00:00:00Z"),
        voicePath: "voices/client-1/m3.m4a",
        voiceDurationMs: 900,
      },
    });
    const rows = await fetchMessages("client-1");
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2", "m3"]);
    expect(rows[1]).toEqual({
      id: "m2",
      kind: "image",
      senderId: COACH,
      createdAt: "2026-10-02T00:00:00.000Z",
      text: undefined,
      imagePath: "images/client-1/m2.jpg",
      imageWidth: 3,
      imageHeight: 4,
      voicePath: undefined,
      voiceDurationMs: undefined,
      reactions: { "client-1": "❤️" },
      readBy: { "client-1": "2026-10-02T01:00:00.000Z" },
      replyTo: { messageId: "m1", senderId: "client-1", kind: "text", textSnippet: "hi" },
    });
    expect(rows[2]).toMatchObject({ senderId: "", voiceDurationMs: 900, replyTo: undefined, reactions: {} });
  });
});

describe("setReadReceiptForTrainer", () => {
  it("rejects another coach's chat and a missing chat", async () => {
    await expect(setReadReceiptForTrainer("client-2", "m1")).rejects.toThrow("Forbidden");
    await expect(setReadReceiptForTrainer("ghost", "m1")).rejects.toThrow("Chat not found");
    noWrites();
  });

  it("writes exactly readBy.{session.uid} = serverTimestamp", async () => {
    await setReadReceiptForTrainer("client-1", "m1");
    expect(fake.db.writes).toEqual([
      {
        op: "update",
        path: "chats/client-1/messages/m1",
        data: { [`readBy.${COACH}`]: SERVER_TIMESTAMP },
      },
    ]);
  });
});

describe("markChatReadForTrainer", () => {
  it("rejects another coach's chat", async () => {
    await expect(markChatReadForTrainer("client-2")).rejects.toThrow("Forbidden");
    noWrites();
  });

  it("zeroes only the caller's unreadCount slot + updatedAt", async () => {
    await markChatReadForTrainer("client-1");
    expect(fake.db.writes).toEqual([
      {
        op: "update",
        path: "chats/client-1",
        data: { [`unreadCount.${COACH}`]: 0, updatedAt: SERVER_TIMESTAMP },
      },
    ]);
  });
});

describe("getChatAttachmentUrl", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID: "proj",
      NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET: "explicit-bucket",
    };
  });
  afterAll(() => {
    process.env = env;
  });

  it("rejects another coach's chat without signing anything", async () => {
    await expect(
      getChatAttachmentUrl("client-2", "images/client-2/m1.jpg"),
    ).rejects.toThrow("Forbidden");
    expect(fake.storage.signed).toEqual([]);
  });

  it("rejects paths outside images/{chatId}/ or voices/{chatId}/ — even for an owned chat", async () => {
    for (const p of [
      "images/client-2/m1.jpg",
      "progress_photos/client-1/x.jpg",
      "voices/client-10/a.m4a",
      "images/client-1",
    ]) {
      await expect(getChatAttachmentUrl("client-1", p)).rejects.toThrow("Forbidden");
    }
    expect(fake.storage.signed).toEqual([]);
  });

  it("signs a 60-minute read URL, falling back across bucket candidates", async () => {
    fake.storage.failingBuckets.add("explicit-bucket");
    const before = Date.now();
    const url = await getChatAttachmentUrl("client-1", "voices/client-1/a.m4a");
    expect(url).toBe("https://signed.example/proj.appspot.com/voices/client-1/a.m4a");
    const opts = fake.storage.signed[0].options as { action: string; expires: number };
    expect(opts.action).toBe("read");
    expect(opts.expires).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(opts.expires).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
  });

  it("returns null when every bucket fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    ["explicit-bucket", "proj.appspot.com", "proj.firebasestorage.app"].forEach((b) =>
      fake.storage.failingBuckets.add(b),
    );
    await expect(getChatAttachmentUrl("client-1", "images/client-1/a.jpg")).resolves.toBeNull();
    warn.mockRestore();
  });
});
