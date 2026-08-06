/**
 * @jest-environment jsdom
 */

// my-activity-feed.test.tsx
//
// "Mi Actividad" — the coach's own event log, read from `coach_activity`. It
// writes nothing, but it PAGES and it FILTERS, and those two interact: the
// cursor belongs to a filter, so mixing them up appends rows the coach just
// filtered out and the feed quietly stops meaning anything.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What is pinned:
//
//   • CHANGING A FILTER RESTARTS THE PAGE. Cursor back to `null`, rows
//     REPLACED — not appended. Passing the old cursor would page into the
//     middle of a different result set.
//   • LOAD MORE CARRIES THE FILTERS. Dropping them appends unfiltered rows
//     under a filtered heading.
//   • LOAD MORE DEDUPES BY ID. A cursor that overlaps by one (the usual
//     boundary case with equal timestamps) would otherwise duplicate rows, and
//     duplicate React keys on top of that.
//   • THE DAY HEADINGS ARE IN THE COACH'S TIMEZONE, so one local day is one
//     section — the same invariant the checklist has.
//   • A DELETION READS AS A DELETION, whatever kind it was.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type {
  MyCoachActivityRow,
  MyActivityClientOption,
} from "@/lib/gc-fitness/coach-activity-actions";

const mockListPage = jest.fn();
jest.mock("@/lib/gc-fitness/coach-activity-actions", () => ({
  listMyCoachActivityPage: (...args: unknown[]) => mockListPage(...args),
}));

import { MyActivityFeed } from "../MyActivityFeed";

const TZ = "America/Argentina/Buenos_Aires";
const PAGE_SIZE = 50;

function row(overrides: Partial<MyCoachActivityRow> = {}): MyCoachActivityRow {
  return {
    id: "e1",
    kind: "workout_assignment",
    occurredAt: "2026-09-10T15:00:00.000Z",
    title: "Assigned Push Day",
    detail: null,
    clientId: "ana",
    clientName: "Ana Gomez",
    ...overrides,
  } as MyCoachActivityRow;
}

const CLIENTS: MyActivityClientOption[] = [
  { id: "ana", name: "Ana Gomez" },
  { id: "beto", name: "Beto Diaz" },
];

function renderFeed(
  rows: MyCoachActivityRow[],
  opts: { cursor?: string | null; hasMore?: boolean } = {},
) {
  render(
    <MyActivityFeed
      initialRows={rows}
      initialCursor={opts.cursor ?? "cursor-1"}
      initialHasMore={opts.hasMore ?? true}
      clients={CLIENTS}
      timezone={TZ}
    />,
  );
  return { user: userEvent.setup({ advanceTimers: jest.advanceTimersByTime }) };
}

/** The two shadcn selects, told apart by the label above them (their trigger
 *  carries no accessible name of its own). */
function filterTrigger(which: "client" | "type"): HTMLElement {
  const [clientSel, typeSel] = screen.getAllByRole("combobox");
  return which === "client" ? clientSel : typeSel;
}

async function chooseFilter(
  user: ReturnType<typeof userEvent.setup>,
  which: "client" | "type",
  option: string,
) {
  await user.click(filterTrigger(which));
  await user.click(await screen.findByRole("option", { name: option }));
}

function titles(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .flatMap((h) =>
      Array.from(
        (h.parentElement as HTMLElement).querySelectorAll("p.font-semibold"),
      ).map((p) => p.textContent ?? ""),
    );
}

function dayHeadings(): string[] {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
}

/** The arguments of the last page request: (cursor, size, clientId, kind). */
function lastCall(): [string | null, number, string | null, string | null] {
  return mockListPage.mock.calls.at(-1) as [
    string | null,
    number,
    string | null,
    string | null,
  ];
}

// 12:00 in Buenos Aires. The Today/Yesterday headings are computed against the
// wall clock, so it is pinned — otherwise every "Today" assertion is a coin
// flip depending on when the suite runs.
const NOW = "2026-09-10T15:00:00.000Z";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(NOW) });
  mockListPage.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("MyActivityFeed — filtering", () => {
  it("restarts from the FIRST page when a client filter is picked", async () => {
    const { user } = renderFeed([row()]);

    await chooseFilter(user, "client", "Ana Gomez");

    await waitFor(() => expect(mockListPage).toHaveBeenCalledTimes(1));
    expect(lastCall()).toEqual([null, PAGE_SIZE, "ana", null]);
  });

  it("REPLACES the rows rather than appending them", async () => {
    // Appending would leave the pre-filter rows on screen under the new
    // filter — the feed then shows exactly what the coach filtered out.
    mockListPage.mockResolvedValue({
      rows: [row({ id: "e2", title: "Assigned Leg Day", clientId: "beto", clientName: "Beto Diaz" })],
      nextCursor: null,
      hasMore: false,
    });
    const { user } = renderFeed([row({ title: "Assigned Push Day" })]);

    await chooseFilter(user, "client", "Beto Diaz");

    await waitFor(() =>
      expect(screen.queryByText("Assigned Push Day")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Assigned Leg Day")).toBeInTheDocument();
  });

  it("sends 'all' as null, not as the literal string", async () => {
    // The action treats null as "no filter"; the string "all" would be matched
    // against a clientId and return nothing.
    const { user } = renderFeed([row()]);

    await chooseFilter(user, "type", "Chat");
    await waitFor(() => expect(mockListPage).toHaveBeenCalledTimes(1));

    expect(lastCall()).toEqual([null, PAGE_SIZE, null, "chat"]);
  });

  it("keeps the OTHER filter when one changes", async () => {
    const { user } = renderFeed([row()]);

    await chooseFilter(user, "client", "Ana Gomez");
    // The two selects are DISABLED while the transition is in flight, so the
    // second pick has to wait for the first to land — otherwise the option
    // list never opens and the failure looks like a missing option.
    await waitFor(() => expect(filterTrigger("type")).toBeEnabled());
    await chooseFilter(user, "type", "Chat");

    await waitFor(() => expect(mockListPage).toHaveBeenCalledTimes(2));
    expect(lastCall()).toEqual([null, PAGE_SIZE, "ana", "chat"]);
  });

  it("does not offer the client-side rest edit as a coach filter", async () => {
    // `workout_rest_edited` is something the CLIENT does; it is excluded from
    // this feed, so offering it as a filter is a guaranteed empty screen.
    const { user } = renderFeed([row()]);

    await user.click(filterTrigger("type"));

    expect(screen.queryByRole("option", { name: /rest/i })).not.toBeInTheDocument();
  });

  it("tells an empty FILTERED feed apart from an empty one", async () => {
    const { user } = renderFeed([], { hasMore: false });
    expect(screen.getByText("No recent actions yet.")).toBeInTheDocument();

    await chooseFilter(user, "client", "Ana Gomez");

    await waitFor(() =>
      expect(screen.getByText("No activity for this filter.")).toBeInTheDocument(),
    );
  });
});

describe("MyActivityFeed — paging", () => {
  it("carries the CURSOR and the active filters into the next page", async () => {
    // The filtered response must carry a cursor of its OWN and still have more
    // — otherwise the Load more button is gone before the second half of the
    // test, which reads as a locator failure.
    mockListPage.mockResolvedValue({
      rows: [row({ id: "e9" })],
      nextCursor: "cursor-filtered",
      hasMore: true,
    });
    const { user } = renderFeed([row()], { cursor: "cursor-1", hasMore: true });

    await chooseFilter(user, "client", "Ana Gomez");
    await waitFor(() => expect(mockListPage).toHaveBeenCalledTimes(1));
    mockListPage.mockClear();

    // While the transition is in flight the button READS "Loading...", so a
    // by-name lookup right here fails on the name, not on the button.
    await user.click(await screen.findByRole("button", { name: "Load more" }));

    await waitFor(() => expect(mockListPage).toHaveBeenCalledTimes(1));
    expect(lastCall()).toEqual([
      "cursor-filtered", // the pre-filter cursor is dead
      PAGE_SIZE,
      "ana",
      null,
    ]);
  });

  it("appends the next page under the existing rows", async () => {
    mockListPage.mockResolvedValue({
      rows: [row({ id: "e2", title: "Older thing" })],
      nextCursor: null,
      hasMore: false,
    });
    const { user } = renderFeed([row({ id: "e1", title: "Newer thing" })]);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(titles()).toEqual(["Newer thing", "Older thing"]));
  });

  it("DROPS rows it already has", async () => {
    // Equal timestamps at the page boundary hand the same row back twice.
    // Without the dedupe the coach sees it twice and React logs a duplicate key.
    mockListPage.mockResolvedValue({
      rows: [row({ id: "e1", title: "Newer thing" }), row({ id: "e2", title: "Older thing" })],
      nextCursor: null,
      hasMore: false,
    });
    const { user } = renderFeed([row({ id: "e1", title: "Newer thing" })]);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(titles()).toEqual(["Newer thing", "Older thing"]));
  });

  it("hides the button once the server says there is no more", async () => {
    mockListPage.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
    const { user } = renderFeed([row()]);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument(),
    );
  });

  it("does not render the button at all when the first page is the last", () => {
    renderFeed([row()], { hasMore: false });

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});

describe("MyActivityFeed — how a row reads", () => {
  it("groups a local day into ONE section, in the coach's timezone", async () => {
    // 02:00Z is the previous day at 23:00 in Buenos Aires: keyed in UTC these
    // two rows split across two headings.
    renderFeed([
      row({ id: "a", occurredAt: "2026-09-10T15:00:00.000Z" }),
      row({ id: "b", occurredAt: "2026-09-11T02:00:00.000Z" }),
    ]);

    expect(dayHeadings()).toEqual(["Today"]);
  });

  it("names yesterday as Yesterday", async () => {
    renderFeed([row({ occurredAt: "2026-09-09T15:00:00.000Z" })]);

    expect(dayHeadings()).toEqual(["Yesterday"]);
  });

  it("dates anything older", async () => {
    renderFeed([row({ occurredAt: "2026-08-01T15:00:00.000Z" })]);

    expect(dayHeadings()[0]).not.toBe("Today");
    expect(dayHeadings()[0]).not.toBe("Yesterday");
  });

  it("labels a DELETION as one, not by its kind", async () => {
    renderFeed([row({ kind: "habit_assignment", deleted: true })]);

    expect(screen.getByTitle("Deleted")).toBeInTheDocument();
  });

  it("links the client name to their profile", async () => {
    renderFeed([row({ clientId: "ana", clientName: "Ana Gomez" })]);

    expect(screen.getByRole("link", { name: "Ana Gomez" })).toHaveAttribute(
      "href",
      "/gc-fitness/clients/ana",
    );
  });

  it("keeps the name as plain text when there is no id to link to", async () => {
    // A row about a client who no longer resolves must not render a link to
    // `/clients/null`.
    renderFeed([row({ clientId: null, clientName: "Ana Gomez" })]);

    expect(screen.queryByRole("link", { name: /Ana Gomez/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Ana Gomez/)).toBeInTheDocument();
  });

  it("prints the time in the coach's timezone", async () => {
    // 15:00Z is 12:00 in Buenos Aires. Rendering the host's hour would show a
    // coach in another zone the wrong time for their own action.
    renderFeed([row({ occurredAt: "2026-09-10T15:00:00.000Z" })]);

    const section = screen.getByRole("heading", { level: 3 }).parentElement!;
    expect(within(section).getByText(/12:00/)).toBeInTheDocument();
  });
});
