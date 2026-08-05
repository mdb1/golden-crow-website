/**
 * @jest-environment jsdom
 */

// new-habit-dialog.test.tsx
//
// The habit-creation shell used from two very different places: a calendar cell
// (FIXED mode — one client, one day, both pre-set) and the habits page (ROSTER
// mode — the coach picks the client inside the form).
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// This component barely renders anything itself — it decides WHAT TO HAND the
// shared `HabitForm` / `HabitTemplateForm`. So that is what the tests assert:
// the props crossing that boundary. Specifically:
//
//   1. FIXED vs ROSTER. In fixed mode the client dropdown must be pinned to the
//      one client from the calendar cell; in roster mode it must offer the whole
//      roster with no client pre-selected. Getting this backwards assigns a
//      habit to the WRONG CLIENT — silently, because both modes render fine.
//   2. THE SEEDED DATE. The calendar cell's day must reach the form as
//      `startsOn`. Losing it silently starts the habit today instead of on the
//      day the coach clicked.
//   3. THE DRAFT IDS, which are namespaced per trainer. Two coaches drafting at
//      once must not collide on a document id.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { NewHabitDialog } from "@/components/gc-fitness/schedule/new-habit-dialog";

// Capture what the shell hands each child form. Both stubs expose a button that
// fires `onAfterSubmit`, which is how we exercise the post-save path without
// pulling the real (large, separately tested) forms into the render.
const habitFormProps: Array<Record<string, unknown>> = [];
jest.mock("@/app/gc-fitness/habits/_components/HabitForm", () => ({
  HabitForm: (props: Record<string, unknown>) => {
    habitFormProps.push(props);
    return (
      <button
        type="button"
        onClick={() => (props.onAfterSubmit as () => void)()}
      >
        stub-submit-habit
      </button>
    );
  },
}));

const templateFormProps: Array<Record<string, unknown>> = [];
jest.mock("@/app/gc-fitness/habits/_components/HabitTemplateForm", () => ({
  HabitTemplateForm: (props: Record<string, unknown>) => {
    templateFormProps.push(props);
    return (
      <button
        type="button"
        onClick={() => (props.onAfterSubmit as () => void)()}
      >
        stub-submit-template
      </button>
    );
  },
}));

// The existing-habit tab lists templates over react-query; an empty list keeps
// the shell on its empty state, which is where the "create it" shortcut lives.
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock("@/lib/gc-fitness/habit-actions", () => ({
  createHabit: jest.fn(),
  createHabitTemplate: jest.fn(),
  listHabitTemplates: jest.fn(),
}));

// Deliberately NOT today. `effStartsOn` falls back to `todayCivilDate()`, so a
// fixture equal to today makes the seeding assertion unfalsifiable — dropping
// the seed entirely would still produce the expected value.
const SEEDED_DAY = "2026-09-17";

const ROSTER = [
  { uid: "client-1", displayName: "Ana" },
  { uid: "client-2", displayName: "Beto" },
];

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof NewHabitDialog>> = {},
) {
  const onCreated = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <NewHabitDialog
      open
      onOpenChange={onOpenChange}
      trainerUid="trainer-9"
      onCreated={onCreated}
      {...overrides}
    />,
  );
  return { onCreated, onOpenChange };
}

/** Last props the shell handed `HabitForm`. */
function lastHabitFormProps() {
  return habitFormProps[habitFormProps.length - 1];
}

/** Switch to the "new habit" tab, where the forms render. */
async function openNewTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Nuevo hábito|Crear/i }));
}

beforeEach(() => {
  jest.clearAllMocks();
  habitFormProps.length = 0;
  templateFormProps.length = 0;
});

describe("NewHabitDialog — FIXED mode (from a calendar cell)", () => {
  it("pins the client dropdown to the cell's client and pre-selects it", async () => {
    const user = userEvent.setup();
    renderDialog({
      clientId: "client-1",
      clientName: "Ana",
      startsOn: SEEDED_DAY,
    });
    await openNewTab(user);

    const props = lastHabitFormProps();
    // One option only — the coach cannot accidentally retarget the habit at
    // somebody else from a cell that already named a client.
    expect(props.clientOptions).toEqual([
      { uid: "client-1", displayName: "Ana" },
    ]);
    expect(
      (props.defaultValues as Record<string, unknown>).clientId,
    ).toBe("client-1");
  });

  it("seeds startsOn from the clicked day, not from today", async () => {
    const user = userEvent.setup();
    renderDialog({
      clientId: "client-1",
      clientName: "Ana",
      startsOn: SEEDED_DAY,
    });
    await openNewTab(user);

    expect(
      (lastHabitFormProps().defaultValues as Record<string, unknown>).startsOn,
    ).toBe(SEEDED_DAY);
  });
});

describe("NewHabitDialog — ROSTER mode (from the habits page)", () => {
  it("renders the TEMPLATE form — a client-less habit, assigned later", async () => {
    const user = userEvent.setup();
    renderDialog({ clients: ROSTER });
    await openNewTab(user);

    // This is the whole fork: from the habits page the coach builds a reusable
    // TEMPLATE with no client attached, and assigns it afterwards from the
    // library. Rendering the per-client HabitForm here would demand a client
    // the coach never intended to pick.
    expect(templateFormProps).toHaveLength(1);
    expect(habitFormProps).toHaveLength(0);
  });

  it("namespaces the roster-mode template id by trainer too", async () => {
    const user = userEvent.setup();
    renderDialog({ clients: ROSTER });
    await openNewTab(user);

    const templateId = templateFormProps[0].templateId as string;
    expect(templateId.startsWith("habit-template-trainer-9-")).toBe(true);
  });
});

describe("NewHabitDialog — draft ids", () => {
  it("namespaces the draft ids by trainer so two coaches can't collide", async () => {
    const user = userEvent.setup();
    renderDialog({ clientId: "client-1", clientName: "Ana" });
    await openNewTab(user);

    const habitId = lastHabitFormProps().habitId as string;
    expect(habitId.startsWith("habit-draft-trainer-9-")).toBe(true);
    // A bare `habit-draft-` id would be a single shared document across the
    // whole platform.
    expect(habitId.length).toBeGreaterThan("habit-draft-trainer-9-".length);
  });
});

describe("NewHabitDialog — after a successful save", () => {
  it("tells the parent to refresh AND closes itself", async () => {
    const user = userEvent.setup();
    const { onCreated, onOpenChange } = renderDialog({
      clientId: "client-1",
      clientName: "Ana",
    });
    await openNewTab(user);

    await user.click(screen.getByRole("button", { name: "stub-submit-habit" }));

    // Both halves matter: without onCreated the calendar keeps showing stale
    // data, and without the close the coach can double-submit the same habit.
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
