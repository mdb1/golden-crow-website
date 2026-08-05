/**
 * @jest-environment jsdom
 */

// habits-client-list.test.tsx
//
// The habits page's two lists and the filters over them: "All" (the reusable
// template library) and "Assignments" (one row per client × habit).
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Why this surface: every habit bug that reached production was a habit that
// was THERE and didn't show, or one that was gone and did. The filters are the
// only thing between the server payload and what a coach believes their client
// is doing.
//
//   • THE `deleted` SHAPE (#400). A habit the CLIENT created has no `deleted`
//     field at all. The row filter must therefore be a TRUTHINESS check
//     (`if (r.deleted) return false`), never an equality check against `false`,
//     which drops every field-less doc silently.
//     NOTE — the equality form still exists one layer down, in
//     `listHabitsForTrainer`'s `.where("deleted", "==", false)`. That is a
//     server-side query this file cannot reach (it's mocked here, and it runs
//     in `node`); it stays on the latent list in #400. What IS pinned here is
//     that the component never re-introduces the same mistake on its side.
//   • THE ENDED-RECURRENCE CUTOFF. "Assignments" means current + future
//     commitments. A habit whose recurrence ended yesterday must drop off;
//     a recurring habit with NO `endsOn` never ends and must never drop off.
//     One-time habits are cut on `endsOn ?? startsOn`.
//   • THE CLIENT FILTER. Showing another client's habits under the wrong name
//     is the same failure class as the fixed/roster mix-up in
//     `new-habit-dialog.test.tsx` — quiet and wrong.
//
// Fixture dates are computed as OFFSETS from the real current day, because the
// component derives its own `todayCivil` from `new Date()`. A hardcoded date
// would rot; a fixture pinned to today would sit exactly on the boundary the
// filter tests, and could not fail.
//
// The library table is stubbed to expose the `templates` prop it receives, so
// the search / favorites / sort assertions read the ORDERED LIST the filter
// produced instead of scraping rendered rows.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type {
  HabitRow,
  HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";

const mockListHabitsForTrainer = jest.fn();
const mockListHabitTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/habit-actions", () => ({
  listHabitsForTrainer: () => mockListHabitsForTrainer(),
  listHabitTemplates: () => mockListHabitTemplates(),
  listHiddenGlobalTemplateIds: jest.fn().mockResolvedValue([]),
  softDeleteHabit: jest.fn(),
  deleteHabitRecurrenceFromDate: jest.fn(),
  unhideGlobalHabitTemplate: jest.fn(),
}));

const mockFavorites = jest.fn();
jest.mock("@/lib/gc-fitness/use-favorites", () => ({
  useFavorites: () => ({
    favorites: mockFavorites(),
    isFavorite: () => false,
    toggle: jest.fn(),
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/gc-fitness/schedule/new-habit-dialog", () => ({
  NewHabitDialog: () => null,
}));
jest.mock("@/components/gc-fitness/schedule/bulk-assign-habit-dialog", () => ({
  BulkAssignHabitDialog: () => null,
}));
jest.mock("../_components/HabitTemplateDetailDialog", () => ({
  HabitTemplateDetailDialog: () => null,
}));

// Stub the library table and publish the ORDER of what it was handed — that
// list IS the output of the search / favorites / sort pipeline.
jest.mock("../_components/HabitLibraryTable", () => ({
  HabitLibraryTable: ({ templates }: { templates: Array<{ id: string }> }) => (
    <div data-testid="library-ids">{templates.map((t) => t.id).join(",")}</div>
  ),
}));

import { HabitsLibraryClient } from "../client";

// ── Dates, relative to the real today ───────────────────────────────────────
function civilOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const YESTERDAY = civilOffset(-1);
const LAST_MONTH = civilOffset(-30);
const NEXT_MONTH = civilOffset(30);

const ROSTER = [
  {
    uid: "client-1",
    displayName: "Ana Gomez",
    email: "ana@example.com",
    photoURL: null,
    pendingProvisioning: false,
  },
  {
    uid: "client-2",
    displayName: "Beto Diaz",
    email: "beto@example.com",
    photoURL: null,
    pendingProvisioning: false,
  },
];

function habit(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit-1",
    clientId: "client-1",
    trainerId: "trainer-1",
    type: "binary",
    name: { en: "Drink water", es: "Tomar agua" },
    reminderEnabled: false,
    scheduleType: "recurring",
    startsOn: LAST_MONTH,
    scheduleCadence: "daily",
    deleted: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as HabitRow;
}

function template(overrides: Partial<HabitTemplateRow> = {}): HabitTemplateRow {
  return {
    id: "tpl-1",
    scope: "trainer",
    trainerId: "trainer-1",
    type: "binary",
    name: { en: "Drink water", es: "Tomar agua" },
    reminderEnabled: false,
    scheduleType: "recurring",
    startsOn: LAST_MONTH,
    deleted: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as HabitTemplateRow;
}

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HabitsLibraryClient clientRoster={ROSTER} trainerUid="trainer-1" />
    </QueryClientProvider>,
  );
}

/** The page opens on the library tab; assignments live behind the toggle. */
async function goToAssignments(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Assignments" }));
}

function searchBox() {
  return screen.getByPlaceholderText("Search by name or client…");
}

/** ids the library table was rendered with, in order. */
async function libraryIds(): Promise<string[]> {
  const node = await screen.findByTestId("library-ids");
  const text = node.textContent ?? "";
  return text.length > 0 ? text.split(",") : [];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListHabitsForTrainer.mockResolvedValue([]);
  mockListHabitTemplates.mockResolvedValue([]);
  mockFavorites.mockReturnValue({
    exerciseIds: [],
    workoutTemplateIds: [],
    habitTemplateIds: [],
  });
});

describe("Habits — assignments visibility", () => {
  it("keeps a habit whose doc has NO `deleted` field (#400)", async () => {
    const user = userEvent.setup();
    // The client-created shape: `clientOwned`, `clientId === trainerId`, and
    // no `deleted` key at all. An equality filter against `false` drops this
    // row; a truthiness filter keeps it.
    const clientMade = habit({
      id: "habit-client-made",
      name: { en: "Morning walk", es: "Caminata" },
    });
    delete (clientMade as Partial<HabitRow>).deleted;
    mockListHabitsForTrainer.mockResolvedValue([clientMade]);
    renderList();
    await goToAssignments(user);

    expect(await screen.findByText("Morning walk")).toBeInTheDocument();
  });

  it("hides a soft-deleted habit", async () => {
    const user = userEvent.setup();
    mockListHabitsForTrainer.mockResolvedValue([
      habit({ id: "gone", name: { en: "Deleted one", es: "Borrado" }, deleted: true }),
      habit({ id: "kept", name: { en: "Kept one", es: "Vigente" } }),
    ]);
    renderList();
    await goToAssignments(user);

    expect(await screen.findByText("Kept one")).toBeInTheDocument();
    expect(screen.queryByText("Deleted one")).not.toBeInTheDocument();
  });

  it("drops a recurrence that already ended, keeps an open-ended one", async () => {
    const user = userEvent.setup();
    mockListHabitsForTrainer.mockResolvedValue([
      habit({
        id: "ended",
        name: { en: "Ended habit", es: "Terminado" },
        endsOn: YESTERDAY,
      }),
      // No `endsOn` on a recurring habit means "never ends".
      habit({ id: "forever", name: { en: "Forever habit", es: "Para siempre" } }),
      habit({
        id: "future-end",
        name: { en: "Ends later", es: "Termina despues" },
        endsOn: NEXT_MONTH,
      }),
    ]);
    renderList();
    await goToAssignments(user);

    expect(await screen.findByText("Forever habit")).toBeInTheDocument();
    expect(screen.getByText("Ends later")).toBeInTheDocument();
    expect(screen.queryByText("Ended habit")).not.toBeInTheDocument();
  });

  it("cuts a one-time habit on its single occurrence", async () => {
    const user = userEvent.setup();
    // A one-time habit carries no `endsOn`, so the cutoff has to fall back to
    // `startsOn` — otherwise every past one-off stays in the list forever.
    mockListHabitsForTrainer.mockResolvedValue([
      habit({
        id: "past-oneoff",
        name: { en: "Past one-off", es: "Puntual pasado" },
        scheduleType: "one-time",
        startsOn: YESTERDAY,
        scheduleCadence: undefined,
      }),
      habit({
        id: "future-oneoff",
        name: { en: "Future one-off", es: "Puntual futuro" },
        scheduleType: "one-time",
        startsOn: NEXT_MONTH,
        scheduleCadence: undefined,
      }),
    ]);
    renderList();
    await goToAssignments(user);

    expect(await screen.findByText("Future one-off")).toBeInTheDocument();
    expect(screen.queryByText("Past one-off")).not.toBeInTheDocument();
  });
});

describe("Habits — assignment filters", () => {
  it("narrows to one client and drops the other's habits", async () => {
    const user = userEvent.setup();
    mockListHabitsForTrainer.mockResolvedValue([
      habit({ id: "a", clientId: "client-1", name: { en: "Ana habit", es: "Ana" } }),
      habit({ id: "b", clientId: "client-2", name: { en: "Beto habit", es: "Beto" } }),
    ]);
    renderList();
    await goToAssignments(user);
    await screen.findByText("Ana habit");

    // The client Select's trigger renders its value inside a child span, so it
    // has no accessible name to match on — go through the combobox role.
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Beto Diaz/ }));

    await waitFor(() =>
      expect(screen.queryByText("Ana habit")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Beto habit")).toBeInTheDocument();
  });

  it("searches the CLIENT name, not just the habit name", async () => {
    const user = userEvent.setup();
    // Both rows share a habit name; only the client name tells them apart.
    mockListHabitsForTrainer.mockResolvedValue([
      habit({ id: "a", clientId: "client-1" }),
      habit({ id: "b", clientId: "client-2" }),
    ]);
    renderList();
    await goToAssignments(user);
    await screen.findByText("Ana Gomez");

    await user.type(searchBox(), "beto");

    await waitFor(() =>
      expect(screen.queryByText("Ana Gomez")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Beto Diaz")).toBeInTheDocument();
  });

  it("groups the same habit across clients into ONE card", async () => {
    const user = userEvent.setup();
    mockListHabitsForTrainer.mockResolvedValue([
      habit({ id: "a", clientId: "client-1" }),
      habit({ id: "b", clientId: "client-2" }),
      habit({
        id: "c",
        clientId: "client-1",
        name: { en: "Stretching", es: "Elongar" },
      }),
    ]);
    renderList();
    await goToAssignments(user);

    // The grouping is what makes "who has habit X" scannable — two cards, and
    // both clients under the shared title.
    const waterHeading = await screen.findByRole("heading", {
      name: "Drink water",
    });
    const waterCard = waterHeading.closest("div.overflow-hidden")!;
    expect(within(waterCard as HTMLElement).getByText("Ana Gomez")).toBeInTheDocument();
    expect(within(waterCard as HTMLElement).getByText("Beto Diaz")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stretching" }),
    ).toBeInTheDocument();
  });

  it("distinguishes 'nothing yet' from 'nothing matches'", async () => {
    const user = userEvent.setup();
    mockListHabitsForTrainer.mockResolvedValue([habit()]);
    renderList();
    await goToAssignments(user);
    await screen.findByText("Ana Gomez");

    await user.type(searchBox(), "zzzz");

    // Telling a coach "No habits yet" when they simply mistyped a filter is
    // how a support ticket about "my habits disappeared" starts.
    expect(await screen.findByText("No matches.")).toBeInTheDocument();
    expect(screen.queryByText("No habits yet.")).not.toBeInTheDocument();
  });
});

describe("Habits — the template library", () => {
  it("searches templates in BOTH languages", async () => {
    const user = userEvent.setup();
    mockListHabitTemplates.mockResolvedValue([
      template({ id: "water", name: { en: "Drink water", es: "Tomar agua" } }),
      template({ id: "sleep", name: { en: "Sleep 8h", es: "Dormir 8h" } }),
    ]);
    renderList();
    await waitFor(async () => expect(await libraryIds()).toHaveLength(2));

    // The coach types in whichever language they think in; a needle that only
    // hits the ES side must still match.
    await user.type(searchBox(), "agua");

    await waitFor(async () => expect(await libraryIds()).toEqual(["water"]));
  });

  it("floats favorites to the top, and hides the rest when toggled", async () => {
    const user = userEvent.setup();
    mockListHabitTemplates.mockResolvedValue([
      template({ id: "a" }),
      template({ id: "b" }),
      template({ id: "starred" }),
    ]);
    mockFavorites.mockReturnValue({
      exerciseIds: [],
      workoutTemplateIds: [],
      habitTemplateIds: ["starred"],
    });
    renderList();

    // Sorted first even though it arrived last.
    await waitFor(async () =>
      expect(await libraryIds()).toEqual(["starred", "a", "b"]),
    );

    await user.click(screen.getByRole("button", { name: "Show only favorites" }));

    await waitFor(async () => expect(await libraryIds()).toEqual(["starred"]));
  });

  it("sorts by assignment count when 'Most assignments' is on", async () => {
    const user = userEvent.setup();
    mockListHabitTemplates.mockResolvedValue([
      template({ id: "rare" }),
      template({ id: "popular" }),
    ]);
    // The counts come from the ASSIGNMENTS feed via `sourceTemplateId` — the
    // only link between a template and how much it's actually used.
    mockListHabitsForTrainer.mockResolvedValue([
      habit({ id: "1", sourceTemplateId: "popular" }),
      habit({ id: "2", sourceTemplateId: "popular", clientId: "client-2" }),
      habit({ id: "3", sourceTemplateId: "rare" }),
    ]);
    renderList();
    await waitFor(async () =>
      expect(await libraryIds()).toEqual(["rare", "popular"]),
    );

    await user.click(screen.getByRole("button", { name: "Most assignments" }));

    await waitFor(async () =>
      expect(await libraryIds()).toEqual(["popular", "rare"]),
    );
  });

  it("counts assignments the ASSIGNMENTS view hides", async () => {
    const user = userEvent.setup();
    // The ended-recurrence cutoff is a view filter, not a usage fact: a
    // template used all last year is still the coach's most-used template.
    mockListHabitTemplates.mockResolvedValue([
      template({ id: "rare" }),
      template({ id: "popular" }),
    ]);
    mockListHabitsForTrainer.mockResolvedValue([
      habit({ id: "1", sourceTemplateId: "popular", endsOn: YESTERDAY }),
      habit({ id: "2", sourceTemplateId: "popular", endsOn: YESTERDAY, clientId: "client-2" }),
      habit({ id: "3", sourceTemplateId: "rare" }),
    ]);
    renderList();
    await waitFor(async () =>
      expect(await libraryIds()).toEqual(["rare", "popular"]),
    );

    await user.click(screen.getByRole("button", { name: "Most assignments" }));

    await waitFor(async () =>
      expect(await libraryIds()).toEqual(["popular", "rare"]),
    );
  });
});
