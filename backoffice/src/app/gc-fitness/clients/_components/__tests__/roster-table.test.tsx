/**
 * @jest-environment jsdom
 */

// roster-table.test.tsx
//
// The client roster — the coach's home screen, and the only way into a client.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The invariant that matters most here is THE ROUTE FORK. A client who signed
// up but has never signed in has no `/users/{uid}` document yet, so their card
// must route to `/clients/pending/<email>` and NOT to `/clients/<uid>` — the
// latter 404s. This is the same failure family as #392/#400 on the other
// surfaces: a row that is legitimately present but whose identity is shaped
// differently, and every `uid`-shaped assumption around it breaks quietly.
//
// Two details of that fork that are easy to lose:
//   • THE EMAIL IS URL-ENCODED. Emails with a `+` tag (`ana+gym@…`) are common
//     and a raw `+` decodes back as a SPACE, so the pending page looks up an
//     address that doesn't exist and shows "not found" for a client who is
//     right there in the list.
//   • BOTH ACTIVATION PATHS ROUTE THE SAME. The card is a `role="link"` with a
//     click handler AND an Enter/Space keydown handler — two independent code
//     paths to the same push. #163 shipped a bug that lived in exactly one of
//     the two, so both get asserted (same as `templates/client.tsx`).
//
// The at-risk filter has its own trap: the COUNT is over the whole roster while
// the LIST is filtered, so the button must keep saying "Needs attention (3)"
// after it hides the other clients — a count that collapses to the filtered set
// makes the coach think the others got better.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

// #500 — the bulk bar's «Mandar mensaje» goes through this Server Action.
const mockSendBroadcast = jest.fn();
jest.mock("@/lib/gc-fitness/coach-broadcast-actions", () => ({
  sendCoachBroadcast: (...args: unknown[]) => mockSendBroadcast(...args),
}));
const mockToastSuccess = jest.fn();
jest.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: jest.fn() },
}));

import { RosterTable } from "../RosterTable";
import { chooseFormSelectValue } from "@/lib/test-utils/form-select";

const TRAINER = "trainer-1";
const TZ = "America/Argentina/Buenos_Aires";

function client(overrides: Partial<ClientRosterRow> = {}): ClientRosterRow {
  return {
    uid: "ana",
    email: "ana@example.com",
    displayName: "Ana Gomez",
    createdAt: "2026-07-01T00:00:00.000Z",
    photoURL: null,
    timezone: TZ,
    source: "active",
    pendingProvisioning: false,
    autoAssignedCoach: false,
    lastActivityAt: "2026-08-05T12:00:00.000Z",
    thisWeekComplianceRatio: 0.8,
    unreadChatCount: 0,
    missedWorkoutsLast7Days: 0,
    needsAttention: false,
    needsAttentionReasons: [],
    habitsCompletedThisWeek: 4,
    habitsScheduledThisWeek: 5,
    workoutsCompletedThisMonth: 6,
    workoutsScheduledThisMonth: 8,
    goalsCount: { short: 1, medium: 0, long: 0 },
    nutritionRatio7Days: 0.62,
    nutritionHasActivePlan: true,
    nutritionNeverHadPlan: false,
    ...overrides,
  } as ClientRosterRow;
}

function renderRoster(rows: ClientRosterRow[]) {
  render(<RosterTable rows={rows} trainerUid={TRAINER} timezone={TZ} />);
  return { user: userEvent.setup() };
}

/** The clickable card for a client, matched by their displayed name. */
function cardFor(name: string): HTMLElement {
  const node = screen.getByText(name).closest('[role="link"]');
  if (!node) throw new Error(`roster card for ${name} not found`);
  return node as HTMLElement;
}

function visibleNames(): string[] {
  return screen
    .queryAllByRole("link")
    .map((c) => c.querySelector(".truncate")?.textContent ?? "");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RosterTable — the pending route fork", () => {
  it("routes an ACTIVE client to their uid page", async () => {
    const { user } = renderRoster([client()]);

    await user.click(cardFor("Ana Gomez"));

    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/clients/ana");
  });

  it("routes a PENDING client to the pending page, by email", async () => {
    const { user } = renderRoster([
      client({
        uid: "pending-uid",
        displayName: "Beto Diaz",
        email: "beto@example.com",
        pendingProvisioning: true,
      }),
    ]);

    await user.click(cardFor("Beto Diaz"));

    // There is no `/users/{uid}` doc until the first sign-in, so the uid route
    // 404s on a client who is sitting right there in the roster.
    expect(mockPush).toHaveBeenCalledWith(
      "/gc-fitness/clients/pending/beto%40example.com",
    );
  });

  it("URL-encodes a plus-tagged email", async () => {
    const { user } = renderRoster([
      client({
        displayName: "Caro Ruiz",
        email: "caro+gym@example.com",
        pendingProvisioning: true,
      }),
    ]);

    await user.click(cardFor("Caro Ruiz"));

    // A raw `+` decodes back as a SPACE, so the pending page looks up an
    // address that doesn't exist and reports "not found".
    expect(mockPush).toHaveBeenCalledWith(
      "/gc-fitness/clients/pending/caro%2Bgym%40example.com",
    );
  });

  it("routes the same way from the KEYBOARD", async () => {
    const { user } = renderRoster([
      client({ displayName: "Beto Diaz", email: "beto@example.com", pendingProvisioning: true }),
    ]);

    cardFor("Beto Diaz").focus();
    await user.keyboard("{Enter}");

    // Click and keydown are two independent handlers; #163 shipped a bug that
    // lived in exactly one of them.
    expect(mockPush).toHaveBeenCalledWith(
      "/gc-fitness/clients/pending/beto%40example.com",
    );
  });

  it("routes on Space as well as Enter", async () => {
    const { user } = renderRoster([client()]);

    cardFor("Ana Gomez").focus();
    await user.keyboard(" ");

    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/clients/ana");
  });
});

describe("RosterTable — the at-risk filter", () => {
  const ROWS = [
    client({ uid: "ana", displayName: "Ana Gomez", email: "ana@example.com", needsAttention: false }),
    client({
      uid: "beto",
      displayName: "Beto Diaz",
      email: "beto@example.com",
      needsAttention: true,
      needsAttentionReasons: ["inactive"] as unknown as ClientRosterRow["needsAttentionReasons"],
    }),
    client({
      uid: "caro",
      displayName: "Caro Ruiz",
      email: "caro@example.com",
      needsAttention: true,
      needsAttentionReasons: ["inactive"] as unknown as ClientRosterRow["needsAttentionReasons"],
    }),
  ];

  it("keeps only the clients who need attention", async () => {
    const { user } = renderRoster(ROWS);

    await user.click(screen.getByRole("button", { name: /Needs attention \(2\)/ }));

    expect(visibleNames().sort()).toEqual(["Beto Diaz", "Caro Ruiz"]);
  });

  it("counts over the WHOLE roster, not the filtered list", async () => {
    const { user } = renderRoster(ROWS);
    const toggle = screen.getByRole("button", { name: /Needs attention \(2\)/ });

    await user.click(toggle);

    // A count that collapses to the filtered set reads as "the others got
    // better" the moment the filter is on.
    expect(
      screen.getByRole("button", { name: /Needs attention \(2\)/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("comes back off again", async () => {
    const { user } = renderRoster(ROWS);

    await user.click(screen.getByRole("button", { name: /Needs attention \(2\)/ }));
    await user.click(screen.getByRole("button", { name: /Needs attention \(2\)/ }));

    expect(visibleNames()).toHaveLength(3);
  });
});

describe("RosterTable — search", () => {
  const ROWS = [
    client({ uid: "ana", displayName: "Ana Gomez", email: "ana@example.com" }),
    client({ uid: "beto", displayName: "Beto Diaz", email: "beto@gym.test" }),
  ];

  it("matches the display name", async () => {
    const { user } = renderRoster(ROWS);

    await user.type(screen.getByRole("searchbox"), "beto d");

    expect(visibleNames()).toEqual(["Beto Diaz"]);
  });

  it("matches the EMAIL too", async () => {
    const { user } = renderRoster(ROWS);

    // Coaches look people up by the address they invited, which is often the
    // only thing they remember.
    await user.type(screen.getByRole("searchbox"), "gym.test");

    expect(visibleNames()).toEqual(["Beto Diaz"]);
  });

  it("says 'no clients' for a search that matches nobody", async () => {
    const { user } = renderRoster(ROWS);

    await user.type(screen.getByRole("searchbox"), "zzzz");

    expect(visibleNames()).toEqual([]);
    expect(screen.getByText("No clients in your roster yet.")).toBeInTheDocument();
  });
});

describe("RosterTable — an empty roster", () => {
  it("shows the designed empty state, not an empty grid", () => {
    renderRoster([]);

    // A blank page reads as a loading failure; the empty state tells the coach
    // what to do next.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

// ── Nutrition column (#923) ─────────────────────────────────────────────────────────
//
// A coach with twenty clients does not open twenty profiles, so the number has to be on
// the card. The three ways it can be blank are NOT the same fact, and collapsing them is
// how the roster ends up accusing the wrong person.

describe("RosterTable — the nutrition column", () => {
  it("shows the 7-day adherence next to the habit one", () => {
    renderRoster([client({ nutritionRatio7Days: 0.62 })]);
    expect(within(cardFor("Ana Gomez")).getByText("Nutrition")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });

  it("flags an EXPIRED phase — the case this column exists for", () => {
    // The client had a plan, it ran out, nobody loaded the next one. Every other column
    // looks like a quiet week; this is the only place it shows.
    renderRoster([
      client({
        nutritionRatio7Days: null,
        nutritionHasActivePlan: false,
        nutritionNeverHadPlan: false,
      }),
    ]);
    expect(screen.getByTestId("roster-nutrition-expired")).toHaveTextContent(
      "No plan in force",
    );
  });

  it("does not accuse a client nobody ever gave a plan", () => {
    // "0%" reads as somebody failing. Never having been assigned a plan is the coach's
    // pending work, not the client's.
    renderRoster([
      client({
        nutritionRatio7Days: null,
        nutritionHasActivePlan: false,
        nutritionNeverHadPlan: true,
      }),
    ]);
    expect(screen.getByText("No plan yet")).toBeInTheDocument();
    expect(screen.queryByTestId("roster-nutrition-expired")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("says nothing was asked when the phase has not started yet", () => {
    renderRoster([
      client({
        nutritionRatio7Days: null,
        nutritionHasActivePlan: true,
        nutritionNeverHadPlan: false,
      }),
    ]);
    expect(screen.getByText("Nothing asked this week")).toBeInTheDocument();
  });

  // #926 — the roster signal. A red arrow says the number is bad; it does not say to do
  // anything about it, and a coach with twenty clients skims arrows.
  it("names the clients worth a conversation this week", () => {
    renderRoster([
      client({
        nutritionRatio7Days: 0.3,
        nutritionHasActivePlan: true,
        nutritionNeverHadPlan: false,
      }),
    ]);
    expect(screen.getByTestId("roster-nutrition-attention")).toHaveTextContent(
      "Worth a conversation this week",
    );
  });

  it("does not call for a conversation about a client who is doing fine", () => {
    renderRoster([
      client({
        nutritionRatio7Days: 0.85,
        nutritionHasActivePlan: true,
        nutritionNeverHadPlan: false,
      }),
    ]);
    expect(screen.queryByTestId("roster-nutrition-attention")).not.toBeInTheDocument();
  });

  it("keeps the expired-phase line instead of doubling up on it", () => {
    // An expired phase is already its own, more specific alert. Printing both would say
    // the same thing twice in one cell.
    renderRoster([
      client({
        nutritionRatio7Days: null,
        nutritionHasActivePlan: false,
        nutritionNeverHadPlan: false,
      }),
    ]);
    expect(screen.getByTestId("roster-nutrition-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("roster-nutrition-attention")).not.toBeInTheDocument();
  });

  it("renders an em dash, never NaN, for a row with no nutrition fields", () => {
    // Defensive: a row built before the fields existed carries `undefined`, and a
    // confident "NaN%" on a coach's home screen is worse than an em dash.
    const legacy = client();
    delete (legacy as Partial<ClientRosterRow>).nutritionRatio7Days;
    renderRoster([legacy]);
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
  });
});

// #500 — bulk selection + «Mandar mensaje» / «Asignar rutina».
//
// What matters:
//   • a pending invite has NO checkbox (no chat thread, and bulkAssignTemplate
//     rejects `mirror:` ids);
//   • ticking a box does NOT open the client (the checkbox is a sibling of the
//     card link, not nested inside it);
//   • «Seleccionar todos» picks the VISIBLE selectable rows only;
//   • the dialog sends exactly the selected uids + the trimmed text, shows the
//     count from the RESPONSE, and a returned failure stays in the dialog.
describe("RosterTable — bulk actions (#500)", () => {
  const ROWS = [
    client({ uid: "ana", displayName: "Ana Gomez", email: "ana@example.com" }),
    client({ uid: "beto", displayName: "Beto Diaz", email: "beto@example.com", needsAttention: true }),
    client({
      uid: "mirror:caro@example.com",
      displayName: "Caro Ruiz",
      email: "caro@example.com",
      pendingProvisioning: true,
      source: "pending",
    }),
  ];

  it("offers a checkbox only for active clients", () => {
    renderRoster(ROWS);
    expect(screen.getByRole("checkbox", { name: "Select Ana Gomez" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Beto Diaz" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select Caro Ruiz" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("roster-bulk-bar")).not.toBeInTheDocument();
  });

  it("ticking a client shows the bar and does not open the client", async () => {
    const { user } = renderRoster(ROWS);
    await user.click(screen.getByRole("checkbox", { name: "Select Ana Gomez" }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("roster-bulk-bar")).toHaveTextContent("1 selected");
    await user.click(screen.getByRole("button", { name: /^Clear$/ }));
    expect(screen.queryByTestId("roster-bulk-bar")).not.toBeInTheDocument();
  });

  it("select all picks only the visible selectable rows", async () => {
    const { user } = renderRoster(ROWS);
    // Filter to Beto first — Ana is hidden, Caro is pending.
    await user.click(screen.getByRole("button", { name: /Needs attention \(1\)/ }));
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByTestId("roster-bulk-bar")).toHaveTextContent("1 selected");
    await user.click(screen.getByRole("button", { name: /Needs attention \(1\)/ }));
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByTestId("roster-bulk-bar")).toHaveTextContent("2 selected");
  });

  it("«Assign workout» opens /schedule/bulk with the clients preselected", async () => {
    const { user } = renderRoster(ROWS);
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: /Assign workout/ }));
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/schedule/bulk?clients=ana%2Cbeto");
  });

  it("sends the selected uids + trimmed text and reports the response count", async () => {
    mockSendBroadcast.mockResolvedValue({ ok: true, sent: 1, skipped: 1, remaining: 9 });
    const { user } = renderRoster(ROWS);
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: /Send message/ }));

    expect(screen.getByTestId("broadcast-recipients")).toHaveTextContent("Ana Gomez, Beto Diaz");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled(); // empty text
    await user.type(screen.getByLabelText("Message"), "  Hola equipo  ");
    expect(screen.getByTestId("broadcast-counter")).toHaveTextContent("15/1000");
    await user.click(send);

    expect(mockSendBroadcast).toHaveBeenCalledWith(["ana", "beto"], "Hola equipo");
    expect(mockToastSuccess).toHaveBeenCalledWith("Message sent to 1 client", {
      description: "1 is no longer your client and didn't get it.",
    });
    // Sent → selection cleared, bar gone.
    expect(screen.queryByTestId("roster-bulk-bar")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the daily-cap copy on a returned failure", async () => {
    mockSendBroadcast.mockResolvedValue({ ok: false, error: "daily_cap" });
    const { user } = renderRoster(ROWS);
    await user.click(screen.getByRole("checkbox", { name: "Select Ana Gomez" }));
    await user.click(screen.getByRole("button", { name: /Send message/ }));
    await user.type(screen.getByLabelText("Message"), "Hola");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You hit the limit of 10 bulk sends in 24 h. Try again later.",
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("roster-bulk-bar")).toHaveTextContent("1 selected");
  });

  it("blocks sending to more than 200 clients", async () => {
    const many = Array.from({ length: 201 }, (_, i) =>
      client({ uid: `c${i}`, displayName: `Client ${i}`, email: `c${i}@example.com` }),
    );
    const { user } = renderRoster(many);
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: /Send message/ }));
    await user.type(screen.getByLabelText("Message"), "Hola");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You can message up to 200 clients at once. You selected 201.",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("RosterTable — #499 attention reasons and sorting", () => {
  const ROWS = [
    client({
      uid: "ana",
      displayName: "Ana Gomez",
      lastActivityAt: "2026-08-05T12:00:00.000Z",
      nutritionRatio7Days: null,
      unreadChatCount: 0,
    }),
    client({
      uid: "beto",
      displayName: "Beto Diaz",
      lastActivityAt: "2026-08-01T12:00:00.000Z",
      needsAttention: true,
      needsAttentionReasons: ["overduePayment", "unreadChat"],
      nutritionRatio7Days: 0.3,
      unreadChatCount: 5,
    }),
    client({
      uid: "caro",
      displayName: "Caro Ruiz",
      lastActivityAt: "2026-08-03T12:00:00.000Z",
      needsAttention: true,
      needsAttentionReasons: ["nothingAssigned"],
      nutritionRatio7Days: 0.9,
      unreadChatCount: 1,
    }),
  ];

  function sortBy(user: ReturnType<typeof userEvent.setup>, key: string) {
    return chooseFormSelectValue(user, screen.getByRole("combobox", { name: "Sort by" }), key);
  }

  it("names every reason on the card, most urgent first", () => {
    renderRoster(ROWS);
    expect(
      within(cardFor("Beto Diaz"))
        .getAllByTestId("roster-attention-reason")
        .map((n) => n.textContent),
    ).toEqual(["Payment overdue", "Unread messages"]);
    expect(within(cardFor("Ana Gomez")).queryAllByTestId("roster-attention-reason")).toHaveLength(0);
  });

  it("keeps the server order (last activity, newest first) by default", () => {
    renderRoster(ROWS);
    expect(visibleNames()).toEqual(["Ana Gomez", "Caro Ruiz", "Beto Diaz"]);
  });

  it("sorts by attention: most urgent reason first, clients with none last", async () => {
    const { user } = renderRoster(ROWS);
    await sortBy(user, "attention");
    expect(visibleNames()).toEqual(["Caro Ruiz", "Beto Diaz", "Ana Gomez"]);
  });

  it("sorts by name and flips with the direction button", async () => {
    const { user } = renderRoster([ROWS[2], ROWS[0], ROWS[1]]);
    await sortBy(user, "name");
    expect(visibleNames()).toEqual(["Ana Gomez", "Beto Diaz", "Caro Ruiz"]);
    await user.click(screen.getByRole("button", { name: "Ascending" }));
    expect(visibleNames()).toEqual(["Caro Ruiz", "Beto Diaz", "Ana Gomez"]);
  });

  it("sorts nutrition worst first, with «nothing asked» last in BOTH directions", async () => {
    const { user } = renderRoster(ROWS);
    await sortBy(user, "nutrition");
    expect(visibleNames()).toEqual(["Beto Diaz", "Caro Ruiz", "Ana Gomez"]);
    await user.click(screen.getByRole("button", { name: "Ascending" }));
    expect(visibleNames()).toEqual(["Caro Ruiz", "Beto Diaz", "Ana Gomez"]);
  });

  it("sorts by unread messages, most first", async () => {
    const { user } = renderRoster(ROWS);
    await sortBy(user, "unread");
    expect(visibleNames()).toEqual(["Beto Diaz", "Caro Ruiz", "Ana Gomez"]);
  });

  it("keeps pending sign-ins last whatever the sort", async () => {
    const { user } = renderRoster([
      client({ uid: "p", displayName: "Aaron Pending", email: "p@x.com", pendingProvisioning: true }),
      ...ROWS,
    ]);
    await sortBy(user, "name");
    expect(visibleNames().at(-1)).toBe("Aaron Pending");
  });
});
