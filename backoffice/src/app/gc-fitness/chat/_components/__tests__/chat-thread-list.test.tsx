/**
 * @jest-environment jsdom
 */

// chat-thread-list.test.tsx
//
// The trainer inbox's left pane: which conversations exist, in what order, and
// which of them are shouting for attention.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Everything on this pane is a derivation, and the failures are all silent:
//
//   • UNREAD IS PER-UID. The count lives at `unreadCount[trainerUid]` — the
//     same map also carries the CLIENT's count. Reading the wrong key (or a
//     total) shows the coach a badge for messages the coach themselves sent,
//     or hides a real one. Firestore can't compositely index a dot-path map
//     with a variable key, which is why this sort is client-side at all.
//   • THE SORT IS unread DESC, THEN RECENCY DESC. A thread with unread
//     messages that sinks below the fold is a client waiting for an answer
//     nobody sees.
//   • EVERY ROSTER CLIENT APPEARS, even with no chat doc yet. The parent doc
//     is created by the first message, so a never-messaged client would be
//     unreachable from the inbox — the coach cannot start the conversation
//     with someone who isn't listed.
//   • THE PREVIEW IS BY KIND. An image or a voice note has no text to show;
//     falling through to the raw `text` field prints an empty preview and the
//     thread reads as "(nothing here)".
//
// The timestamp fallback chain (`lastMessageAt ?? lastMessage.createdAt ??
// updatedAt ?? createdAt`) exists for the brief denorm race where the chat doc
// is written before the Cloud Function stamps `lastMessageAt`. A thread in that
// window must not sort as if it were from 1970.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ChatRow } from "@/lib/gc-fitness/chat-schema";

const mockUseTrainerChats = jest.fn();
jest.mock("@/lib/gc-fitness/chat-listener", () => ({
  useTrainerChats: () => mockUseTrainerChats(),
}));

import { ChatThreadList } from "../ChatThreadList";

const TRAINER = "trainer-1";
const TZ = "America/Argentina/Buenos_Aires";

const ROSTER = [
  { uid: "ana", displayName: "Ana Gomez", email: "ana@example.com", photoURL: null },
  { uid: "beto", displayName: "Beto Diaz", email: "beto@example.com", photoURL: null },
  { uid: "caro", displayName: "Caro Ruiz", email: "caro@example.com", photoURL: null },
] as unknown as React.ComponentProps<typeof ChatThreadList>["clientRoster"];

function chat(overrides: Partial<ChatRow> = {}): ChatRow {
  return {
    id: "ana",
    clientId: "ana",
    coachId: TRAINER,
    lastMessage: {
      text: "Hola coach",
      senderId: "ana",
      createdAt: "2026-08-05T12:00:00.000Z",
      kind: "text",
    },
    lastMessageAt: "2026-08-05T12:00:00.000Z",
    unreadCount: {},
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as ChatRow;
}

function renderList(
  rows: ChatRow[],
  roster = ROSTER,
  state: { isLoading?: boolean; error?: unknown } = {},
) {
  mockUseTrainerChats.mockReturnValue({
    data: rows,
    isLoading: state.isLoading ?? false,
    error: state.error ?? null,
  });
  const onSelect = jest.fn();
  render(
    <ChatThreadList
      trainerUid={TRAINER}
      timezone={TZ}
      activeChatId={null}
      onSelect={onSelect}
      clientRoster={roster}
    />,
  );
  return { onSelect };
}

/**
 * Thread rows in DOM order, by the client name each one shows.
 *
 * `queryAllByRole`, not `getAllByRole`: a filter that matches nothing leaves
 * the list with zero buttons, and the `get*` variant throws instead of
 * returning the empty array the assertion is about.
 */
function rowNames(): string[] {
  return screen
    .queryAllByRole("button")
    .filter((b) => b.querySelector(".font-semibold"))
    .map((b) => b.querySelector(".font-semibold")?.textContent ?? "");
}

function rowFor(name: string): HTMLElement {
  const node = screen.getByText(name).closest("button");
  if (!node) throw new Error(`thread row for ${name} not found`);
  return node as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ChatThreadList — the unread badge is per-uid", () => {
  it("reads the TRAINER's own entry in the unread map", () => {
    renderList(
      [
        chat({
          id: "ana",
          clientId: "ana",
          // The same map carries the client's count. Reading the wrong key
          // shows the coach a badge for their own messages.
          unreadCount: { [TRAINER]: 3, ana: 9 },
        }),
      ],
      [ROSTER[0]],
    );

    expect(within(rowFor("Ana Gomez")).getByText("3")).toBeInTheDocument();
    expect(within(rowFor("Ana Gomez")).queryByText("9")).not.toBeInTheDocument();
  });

  it("shows no badge when the trainer has nothing unread", () => {
    renderList([chat({ unreadCount: { ana: 4 } })], [ROSTER[0]]);

    const row = rowFor("Ana Gomez");
    expect(within(row).queryByText("4")).not.toBeInTheDocument();
  });
});

describe("ChatThreadList — the order", () => {
  it("floats unread threads above more recent read ones", () => {
    renderList(
      [
        chat({
          id: "beto",
          clientId: "beto",
          lastMessageAt: "2026-08-05T18:00:00.000Z",
          lastMessage: {
            text: "ok",
            senderId: TRAINER,
            createdAt: "2026-08-05T18:00:00.000Z",
            kind: "text",
          },
          unreadCount: { [TRAINER]: 0 },
        }),
        chat({
          id: "ana",
          clientId: "ana",
          lastMessageAt: "2026-08-05T09:00:00.000Z",
          unreadCount: { [TRAINER]: 2 },
        }),
      ],
      [ROSTER[0], ROSTER[1]],
    );

    // Ana wrote earlier but is still waiting for an answer. Sorting purely by
    // recency buries the person who needs the coach.
    expect(rowNames()).toEqual(["Ana Gomez", "Beto Diaz"]);
  });

  it("breaks ties by recency, newest first", () => {
    renderList(
      [
        chat({
          id: "ana",
          clientId: "ana",
          lastMessageAt: "2026-08-01T09:00:00.000Z",
          unreadCount: { [TRAINER]: 1 },
        }),
        chat({
          id: "beto",
          clientId: "beto",
          lastMessageAt: "2026-08-05T09:00:00.000Z",
          unreadCount: { [TRAINER]: 1 },
        }),
      ],
      [ROSTER[0], ROSTER[1]],
    );

    expect(rowNames()).toEqual(["Beto Diaz", "Ana Gomez"]);
  });

  it("falls back down the timestamp chain when lastMessageAt is missing", () => {
    // The denorm race: the chat doc exists but the Cloud Function hasn't
    // written `lastMessageAt` yet. Without the fallback this thread sorts as
    // if it had never received a message.
    renderList(
      [
        chat({
          id: "ana",
          clientId: "ana",
          lastMessageAt: null,
          lastMessage: {
            text: "recién llegado",
            senderId: "ana",
            createdAt: "2026-08-05T23:00:00.000Z",
            kind: "text",
          },
          unreadCount: {},
        }),
        chat({
          id: "beto",
          clientId: "beto",
          lastMessageAt: "2026-08-05T09:00:00.000Z",
          unreadCount: {},
        }),
      ],
      [ROSTER[0], ROSTER[1]],
    );

    expect(rowNames()).toEqual(["Ana Gomez", "Beto Diaz"]);
  });
});

describe("ChatThreadList — every client is reachable", () => {
  it("lists a roster client who has never been messaged", () => {
    // The chat parent doc is created by the FIRST message, so a client with no
    // doc would be missing from the inbox — and the coach cannot start a
    // conversation with someone who isn't listed.
    renderList([chat({ id: "ana", clientId: "ana" })], ROSTER);

    expect(rowNames().sort()).toEqual(["Ana Gomez", "Beto Diaz", "Caro Ruiz"]);
  });

  it("invites the coach to start, instead of showing a blank preview", () => {
    renderList([], [ROSTER[2]]);

    expect(
      within(rowFor("Caro Ruiz")).getByText("Start the conversation…"),
    ).toBeInTheDocument();
  });

  it("selects by chat id on click", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList([chat()], [ROSTER[0]]);

    await user.click(rowFor("Ana Gomez"));

    expect(onSelect).toHaveBeenCalledWith("ana");
  });
});

describe("ChatThreadList — the preview reads by kind", () => {
  it("shows the text of a text message", () => {
    renderList([chat()], [ROSTER[0]]);

    expect(within(rowFor("Ana Gomez")).getByText("Hola coach")).toBeInTheDocument();
  });

  it("labels an image instead of printing nothing", () => {
    renderList(
      [
        chat({
          lastMessage: {
            text: "",
            senderId: "ana",
            createdAt: "2026-08-05T12:00:00.000Z",
            kind: "image",
          },
        }),
      ],
      [ROSTER[0]],
    );

    // An image has no text; falling through to `text` renders an empty row and
    // the thread reads as if nothing happened.
    expect(within(rowFor("Ana Gomez")).getByText("📷 Photo")).toBeInTheDocument();
  });

  it("keeps an image caption when there is one", () => {
    renderList(
      [
        chat({
          lastMessage: {
            text: "mirá la postura",
            senderId: "ana",
            createdAt: "2026-08-05T12:00:00.000Z",
            kind: "image",
          },
        }),
      ],
      [ROSTER[0]],
    );

    expect(
      within(rowFor("Ana Gomez")).getByText("📷 mirá la postura"),
    ).toBeInTheDocument();
  });

  it("labels a voice note", () => {
    renderList(
      [
        chat({
          lastMessage: {
            text: "",
            senderId: "ana",
            createdAt: "2026-08-05T12:00:00.000Z",
            kind: "voice",
          },
        }),
      ],
      [ROSTER[0]],
    );

    expect(within(rowFor("Ana Gomez")).getByText("🎤 Voice note")).toBeInTheDocument();
  });

  it("marks an empty text message rather than rendering a blank line", () => {
    renderList(
      [
        chat({
          lastMessage: {
            text: "",
            senderId: "ana",
            createdAt: "2026-08-05T12:00:00.000Z",
            kind: "text",
          },
        }),
      ],
      [ROSTER[0]],
    );

    expect(within(rowFor("Ana Gomez")).getByText("(empty message)")).toBeInTheDocument();
  });
});

describe("ChatThreadList — search", () => {
  it("filters by the resolved client NAME, not the uid", async () => {
    const user = userEvent.setup();
    renderList([chat(), chat({ id: "beto", clientId: "beto" })], ROSTER);

    await user.type(screen.getByRole("searchbox"), "beto d");

    // The uid is never on screen; matching on it would make the search look
    // broken for every coach who types what they can see.
    expect(rowNames()).toEqual(["Beto Diaz"]);
  });

  it("says 'no conversations' for a search that matches nothing", async () => {
    const user = userEvent.setup();
    renderList([chat()], ROSTER);

    await user.type(screen.getByRole("searchbox"), "zzzz");

    expect(rowNames()).toEqual([]);
    expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
  });
});
