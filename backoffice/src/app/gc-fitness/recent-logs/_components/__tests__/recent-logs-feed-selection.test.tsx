/**
 * @jest-environment jsdom
 */

// recent-logs-feed-selection.test.tsx — golden-crow-website#535.
//
// «Actividad reciente» opens with nobody selected on purpose (each selected client
// costs ~8 queries per page), but the coach had to re-pick the same clients on
// EVERY visit. The last selection is remembered per browser; a failed page now
// says so and offers a retry instead of leaving a silent empty feed.

import "@testing-library/jest-dom";

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
const mockPage = jest.fn();
jest.mock("@/lib/gc-fitness/recent-logs-actions", () => ({
  listRecentLogsForTrainerPage: (...args: unknown[]) => mockPage(...args),
}));

import { RecentLogsFeed, RECENT_LOGS_SELECTION_KEY } from "../RecentLogsFeed";

const CLIENTS = [
  { id: "ana", name: "Ana", photoURL: null },
  { id: "beto", name: "Beto", photoURL: null },
];

function renderFeed() {
  render(<RecentLogsFeed logs={[]} clients={CLIENTS} trainerTimezone="America/Argentina/Buenos_Aires" />);
  return userEvent.setup();
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mockPage.mockReset();
  mockPage.mockResolvedValue({ logs: [], nextCursor: null, hasMore: false });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it("first visit: nothing selected, nothing read", async () => {
  renderFeed();
  await flush();
  expect(mockPage).not.toHaveBeenCalled();
  expect(screen.getByText("Select one or more clients to load their recent activity.")).toBeInTheDocument();
});

it("remembers the selection and restores it (only clients still on the roster)", async () => {
  const user = renderFeed();
  await user.click(screen.getByRole("button", { name: /Beto/ }));
  await flush();
  expect(JSON.parse(window.localStorage.getItem(RECENT_LOGS_SELECTION_KEY)!)).toEqual(["beto"]);

  window.localStorage.setItem(RECENT_LOGS_SELECTION_KEY, JSON.stringify(["beto", "gone"]));
  mockPage.mockClear();
  document.body.innerHTML = "";
  renderFeed();
  await flush();
  expect(mockPage).toHaveBeenCalledTimes(1);
  expect(mockPage.mock.calls[0][2]).toEqual(["beto"]);
  expect(screen.getByRole("button", { name: /Beto/ })).toHaveAttribute("aria-pressed", "true");
});

it("a failed page says so and retries", async () => {
  mockPage.mockRejectedValueOnce(new Error("boom"));
  const user = renderFeed();
  await user.click(screen.getByRole("button", { name: /Ana/ }));
  await flush();
  expect(screen.getByTestId("recent-logs-error")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await flush();
  expect(mockPage).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId("recent-logs-error")).not.toBeInTheDocument();
});
