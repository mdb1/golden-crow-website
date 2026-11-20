/**
 * @jest-environment jsdom
 */

// #501 — the open conversation polls ONLY its newest page, and only while the
// tab is visible; the inbox stops polling from hidden tabs.

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import React from "react";

import type { MessageRow } from "../chat-schema";
import { mergeNewestPage } from "../chat-newest-page";

const mockFetchMessages = jest.fn();
const mockListChats = jest.fn();
jest.mock("../chat-server-actions", () => ({
  fetchMessages: (...args: unknown[]) => mockFetchMessages(...args),
  listChatsForTrainer: () => mockListChats(),
}));

import { chatMessagesKey, refreshNewestChatPage, useChatMessages, useTrainerChats } from "../chat-listener";

function msg(id: string, minute: number, extra: Partial<MessageRow> = {}): MessageRow {
  return {
    id,
    kind: "text",
    senderId: "c1",
    createdAt: new Date(Date.UTC(2026, 10, 14, 12, minute)).toISOString(),
    text: id,
    reactions: {},
    readBy: {},
    ...extra,
  } as MessageRow;
}
const ids = (rows: MessageRow[]) => rows.map((m) => m.id);

describe("mergeNewestPage", () => {
  it("keeps cached messages older than the fresh page (no hole when k new arrive)", () => {
    const cached = [msg("m1", 1), msg("m2", 2), msg("m3", 3)];
    // Page size 2 for the example: the newest two now are m3 + m4.
    const fresh = [msg("m3", 3), msg("m4", 4)];
    expect(ids(mergeNewestPage(cached, fresh))).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("takes the fresh version of a message it covers (reactions, read receipts)", () => {
    const cached = [msg("m1", 1), msg("m2", 2)];
    const fresh = [msg("m2", 2, { reactions: { coach: "👍" } })];
    expect(mergeNewestPage(cached, fresh)[1].reactions).toEqual({ coach: "👍" });
  });

  it("drops a message deleted inside the fresh window", () => {
    const cached = [msg("m1", 1), msg("m2", 2), msg("m3", 3)];
    const fresh = [msg("m1", 1), msg("m3", 3)];
    expect(ids(mergeNewestPage(cached, fresh))).toEqual(["m1", "m3"]);
  });

  it("returns the SAME array when nothing changed (no re-render every 10 s)", () => {
    const cached = [msg("m1", 1), msg("m2", 2)];
    expect(mergeNewestPage(cached, [msg("m1", 1), msg("m2", 2)])).toBe(cached);
  });

  it("an empty fresh page empties the thread", () => {
    expect(mergeNewestPage([msg("m1", 1)], [])).toEqual([]);
  });
});

describe("refreshNewestChatPage", () => {
  it("makes ONE call (newest page, no cursor) and touches only page 1", async () => {
    const qc = new QueryClient();
    const older = [msg("o1", 0)];
    qc.setQueryData(chatMessagesKey("c1"), {
      pages: [[msg("m1", 1)], older],
      pageParams: [null, "2026-11-14T12:01:00.000Z"],
    });
    mockFetchMessages.mockResolvedValueOnce([msg("m1", 1), msg("m2", 2)]);
    await refreshNewestChatPage(qc, "c1");
    expect(mockFetchMessages).toHaveBeenCalledTimes(1);
    expect(mockFetchMessages).toHaveBeenCalledWith("c1", 50, null);
    const data = qc.getQueryData<{ pages: MessageRow[][] }>(chatMessagesKey("c1"))!;
    expect(ids(data.pages[0])).toEqual(["m1", "m2"]);
    expect(data.pages[1]).toBe(older);
  });
});

describe("polling", () => {
  let qc: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchMessages.mockReset();
    mockListChats.mockReset().mockResolvedValue([]);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    focusManager.setFocused(true);
  });
  afterEach(() => {
    qc.clear();
    focusManager.setFocused(undefined);
    jest.useRealTimers();
  });

  it("with 3 pages loaded, a 10 s tick fetches ONE page — the newest", async () => {
    mockFetchMessages.mockImplementation(async (_id: string, _n: number, cursor: string | null) =>
      cursor === null ? [msg("m9", 9)] : [msg(`older-${cursor}`, 0)],
    );
    const { result } = renderHook(() => useChatMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    mockFetchMessages.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalled());
    expect(mockFetchMessages.mock.calls).toEqual([["c1", 50, null]]);
    expect(result.current.data?.pages).toHaveLength(3);
  });

  it("does not poll the thread while the tab is hidden", async () => {
    mockFetchMessages.mockResolvedValue([msg("m1", 1)]);
    const { result } = renderHook(() => useChatMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mockFetchMessages.mockClear();
    act(() => focusManager.setFocused(false));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(mockFetchMessages).not.toHaveBeenCalled();
  });

  it("does not poll the inbox while the tab is hidden", async () => {
    const { result } = renderHook(() => useTrainerChats(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mockListChats.mockClear();
    act(() => focusManager.setFocused(false));
    await act(async () => {
      jest.advanceTimersByTime(360_000);
    });
    expect(mockListChats).not.toHaveBeenCalled();
  });
});
