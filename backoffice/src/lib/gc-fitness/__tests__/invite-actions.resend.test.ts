// __tests__/invite-actions.resend.test.ts — issue #970.
//
// `resendClientInvite` is the only surface in this codebase that sends mail on
// demand, so the tests that matter are the ones about who it can send TO:
// another coach's client must be refused, and the destination address must come
// from the DOCUMENT, never from the caller — otherwise a coach with a session
// could relay arbitrary mail from our domain.

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("next-intl/server", () => ({ getLocale: jest.fn(async () => "es") }));

type SentMail = { to: string; subject: string; text: string; html: string };
const mockSendMail = jest.fn<Promise<{ ok: true }>, [SentMail]>(async () => ({
  ok: true,
}));
jest.mock("../email/smtp", () => ({
  sendMail: (input: SentMail) => mockSendMail(input),
  isEmailConfigured: () => true,
}));

const SERVER_TIMESTAMP = "SERVER_TIMESTAMP_SENTINEL";
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => SERVER_TIMESTAMP),
    delete: jest.fn(() => "FIELD_DELETE_SENTINEL"),
  },
}));

const mockState = { sessionUid: "coach-B" };
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({
    uid: mockState.sessionUid,
    email: `${mockState.sessionUid}@example.com`,
  })),
}));

type DocData = Record<string, unknown>;
const store = new Map<string, Map<string, DocData>>();

function collection(name: string): Map<string, DocData> {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
}

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        async get() {
          const data = collection(name).get(id);
          return {
            exists: data !== undefined,
            data: () => data,
            get: (field: string) => data?.[field],
          };
        },
        async update(patch: DocData) {
          const data = collection(name).get(id);
          if (!data) throw new Error("no document to update");
          collection(name).set(id, { ...data, ...patch });
        },
      }),
    }),
  }),
}));

import { resendClientInvite } from "../invite-actions";
import { FirestoreCollections } from "../collections";

const CLIENT_EMAIL = "cliente@example.com";
const CLIENT_UID = "client-1";

beforeEach(() => {
  store.clear();
  mockState.sessionUid = "coach-B";
  mockSendMail.mockClear();
  collection(FirestoreCollections.users).set("coach-B", {
    displayName: "Fede",
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

describe("resendClientInvite", () => {
  it("re-sends a pending client's invitation and stamps the mirror", async () => {
    collection(FirestoreCollections.userMirror).set(CLIENT_EMAIL, {
      coachId: "coach-B",
      email: CLIENT_EMAIL,
      displayName: "Ana",
      pre_created: true,
    });

    const result = await resendClientInvite({ email: CLIENT_EMAIL });

    expect(result).toEqual({ ok: true, status: "sent" });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(CLIENT_EMAIL);
    // The invitation copy, not the "your coach added you" one: this person
    // still does not have the app, which is the whole reason to resend.
    expect(mockSendMail.mock.calls[0][0].subject).toContain("te invitó");

    const mirror = collection(FirestoreCollections.userMirror).get(CLIENT_EMAIL)!;
    expect(mirror.inviteEmailStatus).toBe("sent");
    expect(mirror.inviteEmailSentAt).toBe(SERVER_TIMESTAMP);
  });

  it("sends the LINKED copy for a client who already has an account", async () => {
    collection(FirestoreCollections.users).set(CLIENT_UID, {
      coachId: "coach-B",
      email: CLIENT_EMAIL,
      displayName: "Ana",
    });

    const result = await resendClientInvite({ clientId: CLIENT_UID });

    expect(result).toEqual({ ok: true, status: "sent" });
    expect(mockSendMail.mock.calls[0][0].subject).toContain("ahora es tu coach");
  });

  /**
   * The ownership gate. Without it, any signed-in coach could mail any client
   * on the platform — from our domain, in our name.
   */
  it("refuses a client that belongs to another coach", async () => {
    collection(FirestoreCollections.userMirror).set(CLIENT_EMAIL, {
      coachId: "coach-A",
      email: CLIENT_EMAIL,
    });

    await expect(resendClientInvite({ email: CLIENT_EMAIL })).rejects.toThrow(
      "Forbidden",
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends nothing when the target does not exist", async () => {
    await expect(resendClientInvite({ email: "nadie@example.com" })).resolves.toEqual({
      ok: false,
      reason: "no-target",
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("refuses an input that names no target at all", async () => {
    await expect(resendClientInvite({})).resolves.toEqual({
      ok: false,
      reason: "no-target",
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  /**
   * The double-click guard. An SMTP handshake takes a second or two, during
   * which the button looks unresponsive and gets pressed again; the client
   * should not receive the same email three times because of it.
   */
  it("refuses a second send inside the cooldown window", async () => {
    collection(FirestoreCollections.userMirror).set(CLIENT_EMAIL, {
      coachId: "coach-B",
      email: CLIENT_EMAIL,
      inviteEmailLastAttemptAt: { toMillis: () => Date.now() - 30_000 },
    });

    await expect(resendClientInvite({ email: CLIENT_EMAIL })).resolves.toEqual({
      ok: false,
      reason: "cooldown",
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("allows a send once the cooldown has elapsed", async () => {
    collection(FirestoreCollections.userMirror).set(CLIENT_EMAIL, {
      coachId: "coach-B",
      email: CLIENT_EMAIL,
      inviteEmailLastAttemptAt: { toMillis: () => Date.now() - 60 * 60_000 },
    });

    await expect(resendClientInvite({ email: CLIENT_EMAIL })).resolves.toEqual({
      ok: true,
      status: "sent",
    });
  });

  /**
   * The address is read from the doc, so a caller cannot aim the mail. The
   * `email` field here is a decoy: the doc that gets loaded is keyed by the
   * normalized id, and its own `email` is what is sent to.
   */
  it("never sends to an address the caller supplied for a different doc", async () => {
    collection(FirestoreCollections.userMirror).set(CLIENT_EMAIL, {
      coachId: "coach-B",
      email: "real@example.com",
    });

    await resendClientInvite({ email: CLIENT_EMAIL });

    expect(mockSendMail.mock.calls[0][0].to).toBe("real@example.com");
  });
});
