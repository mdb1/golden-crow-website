// chat-reply.test.ts
// Pure-function tests for `buildReplyQuote` (the TS twin of iOS
// ReplyQuote.make, quick-260603-p1p). Mirrors the snippet/truncation
// rules pinned by the Swift ReplyQuoteMakeTests so the two surfaces
// stay byte-for-byte aligned (Pitfall 7 same-source-of-truth).
//
// NOTE: colocated under __tests__/ (not the lib dir) because the
// backoffice jest config's testMatch only discovers
// `**/__tests__/**/*.test.ts`.

import { buildReplyQuote } from "../chat-reply";
import type { MessageRow } from "../chat-schema";

function msg(
  overrides: Partial<Pick<MessageRow, "id" | "senderId" | "kind" | "text">>,
): Pick<MessageRow, "id" | "senderId" | "kind" | "text"> {
  return {
    id: "m1",
    senderId: "u1",
    kind: "text",
    ...overrides,
  };
}

describe("buildReplyQuote (quick-260603-p1p)", () => {
  it("truncates a text longer than 200 chars to exactly 200", () => {
    const long = "a".repeat(250);
    const quote = buildReplyQuote(msg({ kind: "text", text: long }));
    expect(quote).not.toBeNull();
    expect(quote!.textSnippet).toHaveLength(200);
    expect(quote!.textSnippet).toBe("a".repeat(200));
  });

  it("leaves a text at or below 200 chars unchanged", () => {
    const short = "b".repeat(200);
    expect(buildReplyQuote(msg({ kind: "text", text: short }))!.textSnippet).toBe(short);
    expect(buildReplyQuote(msg({ kind: "text", text: "hello" }))!.textSnippet).toBe("hello");
  });

  it("text kind uses the message text", () => {
    const quote = buildReplyQuote(msg({ kind: "text", text: "ping" }));
    expect(quote!.kind).toBe("text");
    expect(quote!.textSnippet).toBe("ping");
  });

  it("image kind uses the caption; absent caption → empty snippet", () => {
    expect(buildReplyQuote(msg({ kind: "image", text: "beach" }))!.textSnippet).toBe("beach");
    expect(buildReplyQuote(msg({ kind: "image", text: undefined }))!.textSnippet).toBe("");
  });

  it("voice kind → empty snippet regardless of any text", () => {
    const quote = buildReplyQuote(msg({ kind: "voice", text: "ignored" }));
    expect(quote!.kind).toBe("voice");
    expect(quote!.textSnippet).toBe("");
  });

  it("carries the quoted message id + sender id", () => {
    const quote = buildReplyQuote(msg({ id: "abc123", senderId: "coach9", kind: "text", text: "yo" }));
    expect(quote!.messageId).toBe("abc123");
    expect(quote!.senderId).toBe("coach9");
  });

  it("returns null when the quoted message has no id", () => {
    expect(buildReplyQuote(msg({ id: "", kind: "text", text: "x" }))).toBeNull();
  });
});
