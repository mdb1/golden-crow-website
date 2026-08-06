/**
 * @jest-environment jsdom
 */

// chat-conversation.test.tsx
//
// The open thread: what order the messages are in, what gets marked read, and
// which message a reply is attached to.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Four derivations, each with a quiet failure mode:
//
//   • THE ORDER IS REBUILT, NOT RECEIVED. `useInfiniteQuery` APPENDS each older
//     page, so the flattened array is [newest-page, older-page, …] — literally
//     backwards. The component re-sorts ascending by `createdAt`, and a message
//     still in flight (no `createdAt` yet) sorts to the very BOTTOM via
//     `+Infinity`. Sorting it as 0 would park the coach's own just-sent message
//     at the top of the history, above messages from last year.
//   • "SEEN" NEVER HOPS BACKWARDS. The receipt goes under the trainer's MOST
//     RECENT own message and only when the client has actually read that one.
//     Walking forward instead of backward parks a "Seen" halfway up the thread
//     while newer messages sit unread — the coach reads it as "they saw my last
//     message" when they didn't.
//   • READ RECEIPTS ARE FOR THE PARTNER'S MESSAGES ONLY, once each. Marking
//     your own messages read is a write per render for nothing; re-marking on
//     every 10s poll is the same write in a loop, which is what the dedupe ref
//     exists to stop.
//   • THE STAGED REPLY IS PER-THREAD. Switching clients while a reply is staged
//     must drop it, or the next message quotes something from a DIFFERENT
//     client's conversation — and the quote renders with the new partner's
//     name on it.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { MessageRow } from "@/lib/gc-fitness/chat-schema";

const mockUseChatMessages = jest.fn();
const mockFetchNextPage = jest.fn();
jest.mock("@/lib/gc-fitness/chat-listener", () => ({
  CHATS_BASE_KEY: ["gc-fitness", "chats"],
  useChatMessages: (...args: unknown[]) => mockUseChatMessages(...args),
}));

const mockSetReadReceipt = jest.fn();
const mockMarkChatRead = jest.fn();
const mockDeleteMessage = jest.fn();
const mockSetReaction = jest.fn();
jest.mock("@/lib/gc-fitness/chat-server-actions", () => ({
  setReadReceiptForTrainer: (...args: unknown[]) => mockSetReadReceipt(...args),
  markChatReadForTrainer: (...args: unknown[]) => mockMarkChatRead(...args),
  deleteTrainerChatMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  setTrainerMessageReaction: (...args: unknown[]) => mockSetReaction(...args),
  getChatAttachmentUrl: jest.fn().mockResolvedValue(null),
  sendTrainerMessage: jest.fn(),
  uploadTrainerChatAttachment: jest.fn(),
}));

// The composer has its own regression file; here it only needs to report the
// reply props that cross the boundary.
const mockMessageInputProps = jest.fn();
jest.mock("../MessageInput", () => ({
  MessageInput: (props: {
    chatId: string;
    disabled?: boolean;
    replyingTo?: { id: string; text?: string } | null;
    replyAuthorLabel?: string;
  }) => {
    mockMessageInputProps(props);
    return (
      <div data-testid="composer">
        <span data-testid="composer-reply-id">{props.replyingTo?.id ?? ""}</span>
        <span data-testid="composer-reply-author">
          {props.replyAuthorLabel ?? ""}
        </span>
        <span data-testid="composer-disabled">{String(props.disabled)}</span>
      </div>
    );
  },
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatConversation } from "../ChatConversation";

const TRAINER = "trainer-1";
const CLIENT = "ana";
const TZ = "America/Argentina/Buenos_Aires";

const ROSTER = [
  { uid: CLIENT, displayName: "Ana Gomez", email: "ana@example.com", photoURL: null },
  { uid: "beto", displayName: "Beto Diaz", email: "beto@example.com", photoURL: null },
] as unknown as React.ComponentProps<typeof ChatConversation>["clientRoster"];

function message(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "m1",
    senderId: CLIENT,
    kind: "text",
    text: "Hola coach",
    createdAt: "2026-08-05T12:00:00.000Z",
    readBy: {},
    ...overrides,
  } as MessageRow;
}

/** `pages` mirrors useInfiniteQuery: page 0 is the NEWEST slice. */
function renderThread(
  pages: MessageRow[][],
  props: Partial<React.ComponentProps<typeof ChatConversation>> = {},
) {
  mockUseChatMessages.mockReturnValue({
    data: { pages },
    isLoading: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: mockFetchNextPage,
    isFetchingNextPage: false,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ChatConversation
        chatId={CLIENT}
        trainerUid={TRAINER}
        timezone={TZ}
        clientRoster={ROSTER}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), ...view, client };
}

/** The rendered thread as one string, for order assertions. */
function threadText(): string {
  return document.body.textContent ?? "";
}

/** The bubble element containing `text` — bubbles carry no test id. */
function bubbleContaining(text: string): HTMLElement {
  const node = screen.getByText(text).closest("div.rounded-2xl");
  if (!node) throw new Error(`bubble for "${text}" not found`);
  return node as HTMLElement;
}

// jsdom implements neither `Element.scrollTo` nor layout, and the thread
// auto-scrolls to the newest message on mount — without this shim every test
// dies inside `scrollToBottom` with "node.scrollTo is not a function", which
// looks like a component bug and is not one.
beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", {
    writable: true,
    value: jest.fn(),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMarkChatRead.mockResolvedValue(undefined);
  mockSetReadReceipt.mockResolvedValue(undefined);
});

describe("ChatConversation — the order is rebuilt", () => {
  it("puts the older PAGE above the newer one", async () => {
    renderThread([
      // page 0 = newest slice, exactly how useInfiniteQuery hands it over
      [message({ id: "new", text: "El más nuevo", createdAt: "2026-08-05T12:00:00.000Z" })],
      [message({ id: "old", text: "El más viejo", createdAt: "2026-08-01T09:00:00.000Z" })],
    ]);

    const thread = threadText();
    expect(thread.indexOf("El más viejo")).toBeLessThan(
      thread.indexOf("El más nuevo"),
    );
  });

  it("sorts a still-sending message to the BOTTOM, not the top", async () => {
    renderThread([
      [
        message({ id: "pending", text: "Yendo", createdAt: null }),
        message({ id: "old", text: "Anterior", createdAt: "2026-08-01T09:00:00.000Z" }),
      ],
    ]);

    // A pending send has no server timestamp yet. Treating that as 0 parks the
    // coach's own message above a year of history.
    const thread = threadText();
    expect(thread.indexOf("Anterior")).toBeLessThan(thread.indexOf("Yendo"));
  });

  it("separates the days it actually spans", () => {
    renderThread([
      [
        message({ id: "a", text: "Lunes", createdAt: "2026-08-03T14:00:00.000Z" }),
        message({ id: "b", text: "Martes", createdAt: "2026-08-04T14:00:00.000Z" }),
        message({ id: "c", text: "Martes otra vez", createdAt: "2026-08-04T18:00:00.000Z" }),
      ],
    ]);

    // Two days, two separators — one per bucket, not one per message.
    const separators = document.querySelectorAll(".h-px");
    // Each separator renders two hairlines (one on each side of the label).
    expect(separators.length).toBe(4);
  });
});

describe("ChatConversation — the 'Seen' receipt", () => {
  it("sits under the trainer's MOST RECENT own message", () => {
    renderThread([
      [
        message({
          id: "mine-old",
          senderId: TRAINER,
          text: "Primero",
          createdAt: "2026-08-01T09:00:00.000Z",
          readBy: { [CLIENT]: "2026-08-01T10:00:00.000Z" },
        }),
        message({
          id: "mine-new",
          senderId: TRAINER,
          text: "Segundo",
          createdAt: "2026-08-05T09:00:00.000Z",
          readBy: { [CLIENT]: "2026-08-05T10:00:00.000Z" },
        }),
      ],
    ]);

    // The receipt must sit inside the NEWEST own bubble, not the older one.
    expect(bubbleContaining("Segundo")).toHaveTextContent("Seen");
    expect(bubbleContaining("Primero")).not.toHaveTextContent("Seen");
  });

  it("shows NO receipt when the newest own message is still unread", () => {
    renderThread([
      [
        message({
          id: "mine-old",
          senderId: TRAINER,
          text: "Primero",
          createdAt: "2026-08-01T09:00:00.000Z",
          readBy: { [CLIENT]: "2026-08-01T10:00:00.000Z" },
        }),
        message({
          id: "mine-new",
          senderId: TRAINER,
          text: "Segundo",
          createdAt: "2026-08-05T09:00:00.000Z",
          readBy: {},
        }),
      ],
    ]);

    // Hopping the receipt back to the older message reads as "they saw my last
    // message" when they did not.
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
  });

  it("never puts a receipt on the CLIENT's own message", () => {
    renderThread([
      [
        message({
          id: "theirs",
          senderId: CLIENT,
          text: "Hola",
          createdAt: "2026-08-05T09:00:00.000Z",
          readBy: { [CLIENT]: "2026-08-05T09:00:00.000Z" },
        }),
      ],
    ]);

    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
  });
});

describe("ChatConversation — read receipts", () => {
  it("marks the partner's unread messages, once each", async () => {
    renderThread([
      [
        message({ id: "unread-1", senderId: CLIENT, readBy: {} }),
        message({ id: "unread-2", senderId: CLIENT, readBy: {}, createdAt: "2026-08-05T12:01:00.000Z" }),
      ],
    ]);

    await waitFor(() => expect(mockSetReadReceipt).toHaveBeenCalledTimes(2));
    expect(mockSetReadReceipt).toHaveBeenCalledWith(CLIENT, "unread-1");
    expect(mockSetReadReceipt).toHaveBeenCalledWith(CLIENT, "unread-2");
  });

  it("skips messages the trainer sent", async () => {
    renderThread([
      [
        message({ id: "mine", senderId: TRAINER, readBy: {} }),
        message({ id: "theirs", senderId: CLIENT, readBy: {} }),
      ],
    ]);

    await waitFor(() => expect(mockSetReadReceipt).toHaveBeenCalledTimes(1));
    // Marking your own message read is a Firestore write per render for nothing.
    expect(mockSetReadReceipt).toHaveBeenCalledWith(CLIENT, "theirs");
  });

  it("skips messages already marked read by this trainer", async () => {
    renderThread([
      [
        message({
          id: "already",
          senderId: CLIENT,
          readBy: { [TRAINER]: "2026-08-05T12:30:00.000Z" },
        }),
      ],
    ]);

    // Give the effect a chance to fire before asserting it didn't.
    await waitFor(() => expect(mockMarkChatRead).toHaveBeenCalled());
    expect(mockSetReadReceipt).not.toHaveBeenCalled();
  });

  it("does NOT re-fire when a poll returns the same unread message", async () => {
    // React Query polls every 10s; the poll that lands before the `readBy`
    // write propagates hands back a FRESH array with the same, still-unread
    // message. Without the dedupe ref that re-fires the write every 10s.
    //
    // `mockImplementation`, not `mockReturnValue`: a stable object reference
    // makes the `messages` memo skip recomputation and the effect never re-runs
    // at all, so the test passes with or without the ref. (Verified — that is
    // exactly why deleting the ref first came back green.)
    mockUseChatMessages.mockImplementation(() => ({
      data: { pages: [[message({ id: "unread-1", senderId: CLIENT, readBy: {} })]] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      fetchNextPage: mockFetchNextPage,
      isFetchingNextPage: false,
    }));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // A FRESH element each time: React bails out of re-rendering when the
    // element passed to `rerender` is referentially identical, so reusing one
    // `tree` object skips the render entirely and the effect never re-runs.
    const tree = () => (
      <QueryClientProvider client={client}>
        <ChatConversation
          chatId={CLIENT}
          trainerUid={TRAINER}
          timezone={TZ}
          clientRoster={ROSTER}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(tree());
    await waitFor(() => expect(mockSetReadReceipt).toHaveBeenCalledTimes(1));

    rerender(tree());
    rerender(tree());

    await waitFor(() => expect(mockMarkChatRead).toHaveBeenCalled());
    expect(mockSetReadReceipt).toHaveBeenCalledTimes(1);
  });

  it("zeroes the thread's unread badge on open", async () => {
    renderThread([[message()]]);

    // The fast path: one round-trip clears the inbox row + sidebar badge
    // instead of waiting for the per-message readBy fan-in.
    await waitFor(() => expect(mockMarkChatRead).toHaveBeenCalledWith(CLIENT));
  });
});

describe("ChatConversation — the staged reply", () => {
  it("hands the quoted message to the composer with the partner's name", async () => {
    const { user } = renderThread([
      [message({ id: "m1", senderId: CLIENT, text: "¿Cambio el jueves?" })],
    ]);

    await user.click(screen.getByRole("button", { name: "Reply" }));

    expect(screen.getByTestId("composer-reply-id")).toHaveTextContent("m1");
    expect(screen.getByTestId("composer-reply-author")).toHaveTextContent("Ana Gomez");
  });

  it("labels the trainer's own message as 'You'", async () => {
    const { user } = renderThread([
      [message({ id: "mine", senderId: TRAINER, text: "Dale" })],
    ]);

    await user.click(screen.getByRole("button", { name: "Reply" }));

    expect(screen.getByTestId("composer-reply-author")).toHaveTextContent("You");
  });

  it("DROPS the staged reply when the coach switches client", async () => {
    const { user, rerender, client } = renderThread([
      [message({ id: "m1", senderId: CLIENT, text: "¿Cambio el jueves?" })],
    ]);
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByTestId("composer-reply-id")).toHaveTextContent("m1");

    mockUseChatMessages.mockReturnValue({
      data: { pages: [[message({ id: "b1", senderId: "beto" })]] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      fetchNextPage: mockFetchNextPage,
      isFetchingNextPage: false,
    });
    rerender(
      <QueryClientProvider client={client}>
        <ChatConversation
          chatId="beto"
          trainerUid={TRAINER}
          timezone={TZ}
          clientRoster={ROSTER}
        />
      </QueryClientProvider>,
    );

    // Carrying it over quotes a message from ANOTHER client's thread, and the
    // quote renders under the new partner's name.
    await waitFor(() =>
      expect(screen.getByTestId("composer-reply-id")).toHaveTextContent(""),
    );
  });
});

describe("ChatConversation — a pending client", () => {
  it("passes the block down to the composer", () => {
    renderThread([[message()]], { isPendingClient: true });

    expect(screen.getByTestId("composer-disabled")).toHaveTextContent("true");
  });

  it("still renders the history so the coach can read it", () => {
    renderThread([[message({ text: "Hola coach" })]], { isPendingClient: true });

    // Blocked from replying is not the same as blocked from looking.
    expect(screen.getByText("Hola coach")).toBeInTheDocument();
  });
});
