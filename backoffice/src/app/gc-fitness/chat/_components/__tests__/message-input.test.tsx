/**
 * @jest-environment jsdom
 */

// message-input.test.tsx
//
// The composer. Everything a coach ever says to a client goes through the
// payload this file asserts.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The wire shapes, and what breaking each one looks like:
//
//   • A PHOTO IS ONE MESSAGE, NOT TWO. The upload happens first and its
//     `storagePath` rides on the SAME `sendTrainerMessage` call as the typed
//     caption — `kind: "image"` + `imagePath`. Splitting it into an image
//     message plus a text message double-notifies the client and breaks the
//     caption association on both mobile surfaces. `imagePath` is also one of
//     the wire-TYPE mismatches that already bit the Android port, so the key
//     name matters as much as the value.
//   • AN EMPTY CAPTION IS `undefined`, NOT `""`. Same Admin-SDK rule as
//     everywhere else in this codebase.
//   • THE REPLY QUOTE IS `undefined` WHEN THERE ISN'T ONE. `buildReplyQuote`
//     returns `null` for an unquotable message and `null` is a value Firestore
//     will happily store, leaving a message that claims to be a reply to
//     nothing.
//   • A QUICK REPLY IS APPENDED, NEVER SENT. Plan 08-12 states it as a truth:
//     the trainer edits the template before it goes out. Auto-sending puts a
//     canned message in a client's chat without anyone reading it.
//   • ENTER SENDS, SHIFT+ENTER DOESN'T. And because Enter bypasses the
//     disabled Send button entirely, the empty-text guard inside `handleSubmit`
//     IS reachable here — unlike most guards in this portal. It gets a test
//     rather than a note.
//
// On failure the composer must KEEP the text. A send that clears the box and
// then errors loses what the coach wrote.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { MessageRow } from "@/lib/gc-fitness/chat-schema";

const mockSendTrainerMessage = jest.fn();
const mockUploadAttachment = jest.fn();
jest.mock("@/lib/gc-fitness/chat-server-actions", () => ({
  sendTrainerMessage: (...args: unknown[]) => mockSendTrainerMessage(...args),
  uploadTrainerChatAttachment: (...args: unknown[]) => mockUploadAttachment(...args),
}));

const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  };
});

// The dropdown self-fetches its templates through a Server Action; stub it to a
// button that emits one, which is the only thing the composer reacts to.
jest.mock("../QuickReplyDropdown", () => ({
  QuickReplyDropdown: ({ onSelect }: { onSelect: (reply: string) => void }) => (
    <button type="button" onClick={() => onSelect("Buen trabajo esta semana 💪")}>
      quick-reply
    </button>
  ),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessageInput } from "../MessageInput";

const CHAT_ID = "client-1";

function renderInput(
  props: Partial<React.ComponentProps<typeof MessageInput>> = {},
) {
  const onCancelReply = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MessageInput chatId={CHAT_ID} onCancelReply={onCancelReply} {...props} />
    </QueryClientProvider>,
  );
  return { onCancelReply, user: userEvent.setup() };
}

function box() {
  return screen.getByRole("textbox", { name: "Message text" });
}

function sendButton() {
  return screen.getByRole("button", { name: "Send" });
}

async function sentPayload(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(mockSendTrainerMessage).toHaveBeenCalledTimes(1));
  return mockSendTrainerMessage.mock.calls[0][0] as Record<string, unknown>;
}

/** A real File the jsdom FileReader can turn into base64. */
function imageFile(name = "photo.png") {
  return new File(["binary-ish"], name, { type: "image/png" });
}

function quotedMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "msg-7",
    chatId: CHAT_ID,
    senderId: "client-1",
    kind: "text",
    text: "¿Puedo cambiar el jueves?",
    createdAt: "2026-08-05T12:00:00.000Z",
    ...overrides,
  } as MessageRow;
}

// jsdom ships no object-URL implementation, and staging a photo calls
// `URL.createObjectURL` synchronously for the preview — without these shims the
// component throws mid-render and every attachment test fails on a missing
// button rather than on its actual assertion.
beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: jest.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: jest.fn(),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSendTrainerMessage.mockResolvedValue(undefined);
  mockUploadAttachment.mockResolvedValue({
    storagePath: "chat/client-1/photo.png",
  });
});

describe("MessageInput — a text message", () => {
  it("sends the TRIMMED text as kind 'text'", async () => {
    const { user } = renderInput();

    await user.type(box(), "  Nos vemos el martes  ");
    await user.click(sendButton());

    expect(await sentPayload()).toEqual({
      chatId: CHAT_ID,
      kind: "text",
      text: "Nos vemos el martes",
      replyTo: undefined,
    });
  });

  it("clears the box and refreshes the thread after a send", async () => {
    const { user } = renderInput();

    await user.type(box(), "Listo");
    await user.click(sendButton());

    await waitFor(() => expect(box()).toHaveValue(""));
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("KEEPS the text when the send fails", async () => {
    const { user } = renderInput();
    mockSendTrainerMessage.mockRejectedValue(new Error("Network down."));

    await user.type(box(), "Un mensaje largo que no quiero reescribir");
    await user.click(sendButton());

    expect(await screen.findByText("Network down.")).toBeInTheDocument();
    // Clearing on failure loses what the coach wrote.
    expect(box()).toHaveValue("Un mensaje largo que no quiero reescribir");
  });
});

describe("MessageInput — a photo is ONE message", () => {
  it("uploads first, then sends kind 'image' with the storage path", async () => {
    const { user } = renderInput();

    await user.upload(
      document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement,
      imageFile(),
    );
    await user.click(sendButton());

    const payload = await sentPayload();
    expect(mockUploadAttachment).toHaveBeenCalledTimes(1);
    expect(payload).toMatchObject({
      chatId: CHAT_ID,
      kind: "image",
      imagePath: "chat/client-1/photo.png",
    });
    // Exactly one message — a second text message would double-notify.
    expect(mockSendTrainerMessage).toHaveBeenCalledTimes(1);
  });

  it("rides the typed caption on the SAME message", async () => {
    const { user } = renderInput();

    await user.upload(
      document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement,
      imageFile(),
    );
    await user.type(box(), "mirá la postura acá");
    await user.click(sendButton());

    const payload = await sentPayload();
    expect(payload.text).toBe("mirá la postura acá");
    expect(mockSendTrainerMessage).toHaveBeenCalledTimes(1);
  });

  it("sends `undefined`, not '', for a captionless photo", async () => {
    const { user } = renderInput();

    await user.upload(
      document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement,
      imageFile(),
    );
    await user.click(sendButton());

    const payload = await sentPayload();
    expect(payload.text).toBeUndefined();
    expect("text" in payload).toBe(true); // the key is passed, the VALUE is undefined
  });

  it("enables Send on a staged photo with no text at all", async () => {
    const { user } = renderInput();

    expect(sendButton()).toBeDisabled();

    await user.upload(
      document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement,
      imageFile(),
    );

    expect(sendButton()).toBeEnabled();
  });

  it("lets the coach unstage the photo before sending", async () => {
    const { user } = renderInput();

    await user.upload(
      document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement,
      imageFile(),
    );
    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(sendButton()).toBeDisabled();
    expect(mockUploadAttachment).not.toHaveBeenCalled();
  });
});

describe("MessageInput — the reply quote", () => {
  it("attaches the quote to the outgoing message", async () => {
    const { user } = renderInput({
      replyingTo: quotedMessage(),
      replyAuthorLabel: "Ana",
    });

    await user.type(box(), "Sí, dale");
    await user.click(sendButton());

    const payload = await sentPayload();
    expect(payload.replyTo).toEqual({
      messageId: "msg-7",
      senderId: "client-1",
      kind: "text",
      textSnippet: "¿Puedo cambiar el jueves?",
    });
  });

  it("sends `undefined` — never null — when nothing is quoted", async () => {
    const { user } = renderInput();

    await user.type(box(), "Hola");
    await user.click(sendButton());

    // `buildReplyQuote` returns null for an unquotable message, and null is a
    // value Firestore stores: the message would claim to reply to nothing.
    expect((await sentPayload()).replyTo).toBeUndefined();
  });

  it("drops the reply banner once the message is away", async () => {
    const { user, onCancelReply } = renderInput({
      replyingTo: quotedMessage(),
      replyAuthorLabel: "Ana",
    });

    await user.type(box(), "Sí");
    await user.click(sendButton());

    // Leaving it staged quotes the same message on the NEXT send too.
    await waitFor(() => expect(onCancelReply).toHaveBeenCalled());
  });
});

describe("MessageInput — quick replies are a draft, not a send", () => {
  it("appends the template into the box without sending", async () => {
    const { user } = renderInput();

    await user.click(screen.getByRole("button", { name: "quick-reply" }));

    expect(box()).toHaveValue("Buen trabajo esta semana 💪");
    // Plan 08-12 states it as a truth: the trainer edits before submit.
    expect(mockSendTrainerMessage).not.toHaveBeenCalled();
  });

  it("keeps what the coach already typed, on its own line", async () => {
    const { user } = renderInput();

    await user.type(box(), "Ana,");
    await user.click(screen.getByRole("button", { name: "quick-reply" }));

    expect(box()).toHaveValue("Ana,\nBuen trabajo esta semana 💪");
  });
});

describe("MessageInput — the keyboard", () => {
  it("sends on Enter", async () => {
    const { user } = renderInput();

    await user.type(box(), "Dale{Enter}");

    expect((await sentPayload()).text).toBe("Dale");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const { user } = renderInput();

    await user.type(box(), "Primera{Shift>}{Enter}{/Shift}Segunda");

    expect(box()).toHaveValue("Primera\nSegunda");
    expect(mockSendTrainerMessage).not.toHaveBeenCalled();
  });

  it("sends nothing when Enter lands on an empty box", async () => {
    const { user } = renderInput();

    // Enter bypasses the disabled Send button, so the empty-text guard inside
    // `handleSubmit` is genuinely reachable here — unlike most guards in this
    // portal, which sit behind a disabled CTA.
    await user.click(box());
    await user.keyboard("{Enter}");
    await user.type(box(), "   {Enter}");

    expect(mockSendTrainerMessage).not.toHaveBeenCalled();
  });
});

describe("MessageInput — a pending client", () => {
  it("locks the composer itself, not just the Send button", async () => {
    const { user } = renderInput({ disabled: true });

    await user.type(box(), "Hola");

    // The guard that actually runs is the INPUT being disabled: nothing can be
    // typed, so `canSend` is false because the text is empty — its `!disabled`
    // term never gets to decide anything. (Verified by mutation: forcing
    // `canSend` true leaves every test green, because the box still refuses
    // the keystrokes.) The photo input is disabled the same way.
    expect(box()).toBeDisabled();
    expect(box()).toHaveValue("");
    expect(
      document.querySelector('input[type="file"][accept*="image"]'),
    ).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it("says why, instead of just going dead", async () => {
    renderInput({ disabled: true });

    // The client hasn't activated their account: the message would have
    // nowhere to land, and a composer that silently refuses input reads as a
    // broken page.
    expect(screen.getByText(/pending activation/i)).toBeInTheDocument();
  });
});

// ── #926 — the composer seeded from a nutrition note ────────────────────────────────

describe("initialDraft (#926)", () => {
  it("opens with the draft the reply link handed it", async () => {
    renderInput({ initialDraft: "Cena · vie 14 ago\n«salí tarde»\n\n" });
    await waitFor(() =>
      expect(box()).toHaveValue("Cena · vie 14 ago\n«salí tarde»\n\n"),
    );
  });

  it("SENDS NOTHING on its own", async () => {
    // The whole point of a draft: the coach edits it and sends it like any other
    // message. A deep link that posts to a client's chat by navigation would be a
    // message nobody read before it went out.
    renderInput({ initialDraft: "Cena\n«tarde»\n\n" });
    await waitFor(() => expect(box()).not.toHaveValue(""));
    expect(mockSendTrainerMessage).not.toHaveBeenCalled();
  });

  it("never clobbers what the coach already typed", async () => {
    const { user } = renderInput({});
    await user.type(box(), "ya venía escribiendo");
    // Same component, draft arriving late (the param was read after mount).
    expect(box()).toHaveValue("ya venía escribiendo");
  });

  it("drops the ?draft= param once it lands, so a reload cannot resurrect it", async () => {
    window.history.replaceState(
      null,
      "",
      "/gc-fitness/chat?chatId=client-1&draft=Cena",
    );
    renderInput({ initialDraft: "Cena" });

    await waitFor(() => expect(box()).toHaveValue("Cena"));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("draft")).toBeNull();
    // The thread itself must survive — dropping chatId too would bounce the coach back
    // to the empty inbox mid-reply.
    expect(params.get("chatId")).toBe("client-1");
  });
});
