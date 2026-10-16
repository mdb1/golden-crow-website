// client-invite-delivery.test.ts — #451 regression net.
//
// `deliverClientInvite` (email/client-invite.ts) and the coach-name resolver
// (email/coach-name.ts). The coach's and client's names are coach-/user-
// supplied free text that lands in an HTML email sent under OUR domain, so the
// tests that matter most assert the HTML that actually reaches the transport
// is escaped. Then: the status mapping, the never-throws contract, and the
// marker bookkeeping (update, not set; sentAt only on success; no undefined).

jest.mock("server-only", () => ({}));

const SERVER_TIMESTAMP = "SERVER_TIMESTAMP_SENTINEL";
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(() => SERVER_TIMESTAMP) },
}));

type SentMail = { to: string; subject: string; text: string; html: string; replyTo?: string };
type SendResult =
  | { ok: true }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "failed"; detail: string };
const mockSendMail = jest.fn<Promise<SendResult>, [SentMail]>(async () => ({ ok: true }));
jest.mock("../email/smtp", () => ({
  sendMail: (input: SentMail) => mockSendMail(input),
}));

const mockUserDocs = new Map<string, Record<string, unknown>>();
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = name === "users" ? mockUserDocs.get(id) : undefined;
          return {
            exists: data !== undefined,
            get: (field: string) => data?.[field],
          };
        },
      }),
    }),
  }),
}));

import type { DocumentReference } from "firebase-admin/firestore";

import { deliverClientInvite } from "../email/client-invite";
import { coachNameFallback, resolveCoachDisplayName } from "../email/coach-name";

function markerRef(update: jest.Mock = jest.fn(async () => undefined)) {
  return { ref: { update } as unknown as DocumentReference, update };
}

const XSS_NAME = `<img src=x onerror="alert(1)">`;

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ ok: true });
  mockUserDocs.clear();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warnSpy.mockRestore());

describe("deliverClientInvite — HTML escaping of names (security)", () => {
  it.each(["download", "linked"] as const)(
    "%s email: a markup coach/client name reaches the transport ESCAPED",
    async (kind) => {
      const { ref } = markerRef();
      for (const locale of ["es", "en"] as const) {
        mockSendMail.mockClear();
        await deliverClientInvite({
          to: "client@example.com",
          kind,
          clientName: `<script>alert("c")</script>`,
          coachName: XSS_NAME,
          locale,
          markerRef: ref,
        });
        const { html } = mockSendMail.mock.calls[0]![0];
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<script");
        expect(html).not.toContain('onerror="');
        expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
        expect(html).toContain("&lt;script&gt;alert(&quot;c&quot;)&lt;/script&gt;");
      }
    },
  );

  it("escapes a quote / ampersand in a name so it cannot break an attribute", async () => {
    const { ref } = markerRef();
    await deliverClientInvite({
      to: "client@example.com",
      kind: "download",
      clientName: `Ana "x' & Co`,
      coachName: "Fede",
      locale: "en",
      markerRef: ref,
    });
    const { html } = mockSendMail.mock.calls[0]![0];
    expect(html).toContain("Ana &quot;x&#39; &amp; Co");
  });

  it("the plain-text part and subject carry the raw name (not HTML, no entities)", async () => {
    const { ref } = markerRef();
    await deliverClientInvite({
      to: "client@example.com",
      kind: "download",
      coachName: "Fede & Co",
      locale: "en",
      markerRef: ref,
    });
    const mail = mockSendMail.mock.calls[0]![0];
    expect(mail.subject).toBe("Fede & Co invited you to train on Corvo");
    expect(mail.text).toContain("Fede & Co added you");
    expect(mail.text).not.toContain("&amp;");
  });
});

describe("deliverClientInvite — transport + status", () => {
  it("sends to the given address with the coach as replyTo and returns 'sent'", async () => {
    const { ref, update } = markerRef();
    const status = await deliverClientInvite({
      to: "client@example.com",
      kind: "download",
      clientName: "Ana",
      coachName: "Fede",
      coachEmail: "fede@example.com",
      locale: "es",
      markerRef: ref,
    });
    expect(status).toBe("sent");
    const mail = mockSendMail.mock.calls[0]![0];
    expect(mail.to).toBe("client@example.com");
    expect(mail.replyTo).toBe("fede@example.com");
    expect(mail.subject).toBe("Fede te invitó a entrenar en Corvo");
    expect(update).toHaveBeenCalledWith({
      inviteEmailStatus: "sent",
      inviteEmailLastAttemptAt: SERVER_TIMESTAMP,
      inviteEmailSentAt: SERVER_TIMESTAMP,
    });
  });

  it.each([null, undefined, ""])("omits replyTo entirely when coachEmail is %p", async (coachEmail) => {
    const { ref } = markerRef();
    await deliverClientInvite({
      to: "c@example.com",
      kind: "linked",
      coachName: "Fede",
      coachEmail,
      locale: "en",
      markerRef: ref,
    });
    expect("replyTo" in mockSendMail.mock.calls[0]![0]).toBe(false);
  });

  it("maps a disabled transport to 'skipped', without sentAt or warning", async () => {
    mockSendMail.mockResolvedValue({ ok: false, reason: "disabled" });
    const { ref, update } = markerRef();
    const status = await deliverClientInvite({
      to: "c@example.com",
      kind: "download",
      coachName: "Fede",
      locale: "en",
      markerRef: ref,
    });
    expect(status).toBe("skipped");
    expect(update).toHaveBeenCalledWith({
      inviteEmailStatus: "skipped",
      inviteEmailLastAttemptAt: SERVER_TIMESTAMP,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("maps a transport failure to 'failed', logs the detail server-side only and never returns it", async () => {
    mockSendMail.mockResolvedValue({ ok: false, reason: "failed", detail: "535 auth smtp-user@corp" });
    const { ref, update } = markerRef();
    const status = await deliverClientInvite({
      to: "c@example.com",
      kind: "download",
      coachName: "Fede",
      locale: "en",
      markerRef: ref,
    });
    expect(status).toBe("failed");
    const written = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(written).toEqual({ inviteEmailStatus: "failed", inviteEmailLastAttemptAt: SERVER_TIMESTAMP });
    expect(JSON.stringify(written)).not.toContain("smtp-user");
    expect(warnSpy).toHaveBeenCalledWith(
      "[gc-fitness/invite-email] send failed",
      expect.objectContaining({ detail: "535 auth smtp-user@corp" }),
    );
  });

  it("never throws when the marker write fails — the status still comes back", async () => {
    const { ref } = markerRef(jest.fn(async () => Promise.reject(new Error("NOT_FOUND"))));
    await expect(
      deliverClientInvite({
        to: "c@example.com",
        kind: "download",
        coachName: "Fede",
        locale: "en",
        markerRef: ref,
      }),
    ).resolves.toBe("sent");
    expect(warnSpy).toHaveBeenCalledWith("[gc-fitness/invite-email] marker write failed", expect.any(Error));
  });

  it("never writes an undefined field (Admin SDK rejects it)", async () => {
    for (const result of [{ ok: true }, { ok: false, reason: "disabled" }] as SendResult[]) {
      mockSendMail.mockResolvedValue(result);
      const { ref, update } = markerRef();
      await deliverClientInvite({ to: "c@example.com", kind: "linked", coachName: "F", locale: "es", markerRef: ref });
      const written = update.mock.calls[0]![0] as Record<string, unknown>;
      expect(Object.values(written)).not.toContain(undefined);
    }
  });
});

describe("coachNameFallback", () => {
  it.each([
    ["fede@example.com", "fede"],
    ["no-at-sign", "no-at-sign"],
    ["@example.com", "@example.com"], // empty local part → the whole address
    ["", ""],
  ])("%p → %p", (email, expected) => {
    expect(coachNameFallback(email)).toBe(expected);
  });
});

describe("resolveCoachDisplayName", () => {
  it("returns the trimmed displayName from /users/{uid}", async () => {
    mockUserDocs.set("coach-1", { displayName: "  Fede B.  " });
    await expect(resolveCoachDisplayName("coach-1", "fede@example.com")).resolves.toBe("Fede B.");
  });

  it.each([
    ["no doc", undefined],
    ["blank name", { displayName: "   " }],
    ["non-string name", { displayName: 42 }],
    ["missing field", { email: "x" }],
  ])("falls back to the email local part on %s", async (_label, doc) => {
    if (doc) mockUserDocs.set("coach-1", doc);
    await expect(resolveCoachDisplayName("coach-1", "fede.b@example.com")).resolves.toBe("fede.b");
  });

  it("returns the raw name — escaping is the email builder's job, verified end to end", async () => {
    mockUserDocs.set("coach-1", { displayName: XSS_NAME });
    const name = await resolveCoachDisplayName("coach-1", "f@example.com");
    expect(name).toBe(XSS_NAME);
    const { ref } = markerRef();
    await deliverClientInvite({ to: "c@example.com", kind: "download", coachName: name, locale: "es", markerRef: ref });
    expect(mockSendMail.mock.calls[0]![0].html).not.toContain("<img");
  });
});
