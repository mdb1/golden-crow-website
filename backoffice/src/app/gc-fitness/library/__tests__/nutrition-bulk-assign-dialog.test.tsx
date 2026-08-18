/**
 * @jest-environment jsdom
 */

// nutrition-bulk-assign-dialog.test.tsx
//
// "Asignar esta plantilla a varios clientes" (#927). The FIRST THREE LINES must stay as
// the `@jest-environment jsdom` docblock — the backoffice jest config defaults to
// `testEnvironment: "node"` and RTL crashes with `document is not defined` without it.
//
// What this surface can get wrong in a way nothing else catches:
//
//   • **The payload.** Per the repo convention, assert the object handed to the action and
//     not the pixels: the screen renders from the same in-memory state that produced the
//     write, so a screen assertion passes with the wire shape wrong. Here that matters
//     doubly — a wrong `mealId` would re-key fifteen clients' daily logs at once.
//   • **The preview.** It is the ONLY thing telling a coach whose current phase is about
//     to be cut. A preview that renders untouched clients first buries exactly the row
//     that needed reading.
//   • **A half-succeeded bulk that says nothing.** The coach clicks again and
//     double-assigns everybody who already worked.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { NutritionTemplateRow } from "@/lib/gc-fitness/nutrition-library-model";

const mockListClients = jest.fn();
const mockPreview = jest.fn();
const mockAssign = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock("@/lib/gc-fitness/nutrition-bulk-actions", () => ({
  listNutritionBulkClients: () => mockListClients(),
  previewNutritionBulkAssign: (input: unknown) => mockPreview(input),
  assignNutritionTemplateToClients: (input: unknown) => mockAssign(input),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { NutritionBulkAssignDialog } from "../_nutrition/NutritionBulkAssignDialog";

const TEMPLATE: NutritionTemplateRow = {
  id: "tpl-cut",
  name: { en: "Cut", es: "Definición" },
  ownerId: "trainer-1",
  targets: { kcal: 2000, proteinG: 160 },
  meals: [
    {
      mealId: "meal-lunch",
      name: { en: "Lunch", es: "Almuerzo" },
      moment: "lunch",
      targets: { kcal: 700 },
      options: [],
      order: 1,
    },
    {
      mealId: "meal-breakfast",
      name: { en: "Breakfast", es: "Desayuno" },
      moment: "breakfast",
      targets: { kcal: 500 },
      options: [],
      order: 0,
    },
  ],
  deleted: false,
};

const CLIENTS = [
  { uid: "ana", name: "Ana", email: "ana@example.com", pendingProvisioning: false },
  { uid: "bruno", name: "Bruno", email: "bruno@example.com", pendingProvisioning: false },
];

function renderDialog(onAssigned = jest.fn(), onClose = jest.fn()) {
  render(
    <NutritionBulkAssignDialog
      template={TEMPLATE}
      defaultStartsOn="2026-09-01"
      onClose={onClose}
      onAssigned={onAssigned}
    />,
  );
  return { onAssigned, onClose };
}

/** Ticks a client's checkbox and waits for the debounced preview to settle. */
async function selectClient(user: ReturnType<typeof userEvent.setup>, uid: string) {
  await user.click(await screen.findByTestId(`nutrition-bulk-client-${uid}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockListClients.mockResolvedValue(CLIENTS);
  mockPreview.mockResolvedValue({
    rows: [],
    summary: {
      assignable: 0,
      blocked: 0,
      untouched: 0,
      affected: 0,
      trimmed: 0,
      superseded: 0,
      deferred: 0,
    },
  });
  mockAssign.mockResolvedValue({ bulkId: "nutbulk-1", assigned: [], failed: [] });
});

describe("NutritionBulkAssignDialog", () => {
  it("lists the coach's clients and submits nothing until one is picked", async () => {
    renderDialog();
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByTestId("nutrition-bulk-submit")).toBeDisabled();
  });

  it("submits the template body with the picked clients and window", async () => {
    const user = userEvent.setup();
    renderDialog();
    await selectClient(user, "ana");
    await selectClient(user, "bruno");

    await waitFor(() => expect(screen.getByTestId("nutrition-bulk-submit")).toBeEnabled());
    await user.click(screen.getByTestId("nutrition-bulk-submit"));

    await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
    const payload = mockAssign.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.clientIds).toEqual(["ana", "bruno"]);
    expect(payload.templateId).toBe("tpl-cut");
    expect(payload.startsOn).toBe("2026-09-01");
    // Open-ended is the default and must travel as an explicit null, never as a missing
    // key — Firestore cannot match a field that is not there (#400).
    expect("endsOn" in payload).toBe(true);
    expect(payload.endsOn).toBeNull();
  });

  it("keeps each meal's mealId — it is the key the daily log's meals map uses", async () => {
    const user = userEvent.setup();
    renderDialog();
    await selectClient(user, "ana");
    await waitFor(() => expect(screen.getByTestId("nutrition-bulk-submit")).toBeEnabled());
    await user.click(screen.getByTestId("nutrition-bulk-submit"));

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const payload = mockAssign.mock.calls[0]![0] as {
      meals: Array<{ mealId: string; moment: string }>;
    };
    // Sorted by `order`, ids preserved. Minting fresh ids would orphan whatever these
    // clients had already marked.
    expect(payload.meals.map((meal) => meal.mealId)).toEqual([
      "meal-breakfast",
      "meal-lunch",
    ]);
  });

  it("shows the affected clients FIRST, above the untouched ones", async () => {
    mockPreview.mockResolvedValue({
      rows: [
        { clientId: "ana", clientName: "Ana", blockedReason: null, notices: [] },
        {
          clientId: "bruno",
          clientName: "Bruno",
          blockedReason: null,
          notices: [
            { planId: "p1", planName: "Volumen", kind: "trim", date: "2026-08-31" },
          ],
        },
      ],
      summary: {
        assignable: 2,
        blocked: 0,
        untouched: 1,
        affected: 1,
        trimmed: 1,
        superseded: 0,
        deferred: 0,
      },
    });

    const user = userEvent.setup();
    renderDialog();
    await selectClient(user, "ana");

    const list = await screen.findByTestId("nutrition-bulk-preview");
    await waitFor(() => expect(list.children).toHaveLength(2));
    // Bruno loses a phase; burying that row under Ana's "no changes" is how it gets missed.
    expect(list.children[0]).toHaveAttribute("data-testid", "nutrition-bulk-preview-bruno");
    expect(list.children[1]).toHaveAttribute("data-testid", "nutrition-bulk-preview-ana");
    expect(list).toHaveTextContent("“Volumen” is trimmed to 2026-08-31");
  });

  it("previews with the clients and window the coach is actually looking at", async () => {
    const user = userEvent.setup();
    renderDialog();
    await selectClient(user, "ana");

    await waitFor(() => expect(mockPreview).toHaveBeenCalled());
    const last = mockPreview.mock.calls[mockPreview.mock.calls.length - 1]![0];
    expect(last).toEqual({ clientIds: ["ana"], startsOn: "2026-09-01", endsOn: null });
  });

  it("says so out loud when part of the bulk did not land", async () => {
    mockAssign.mockResolvedValue({
      bulkId: "nutbulk-1",
      assigned: [{ clientId: "ana", planId: "nut-1", applied: [] }],
      failed: [{ clientId: "bruno", reason: "writeFailed" }],
    });

    const user = userEvent.setup();
    renderDialog();
    await selectClient(user, "ana");
    await waitFor(() => expect(screen.getByTestId("nutrition-bulk-submit")).toBeEnabled());
    await user.click(screen.getByTestId("nutrition-bulk-submit"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith("Assigned to 1 clients");
    expect(mockToastError).toHaveBeenCalledWith("1 clients were not assigned");
  });

  it("closes and refreshes the library after a successful bulk", async () => {
    mockAssign.mockResolvedValue({
      bulkId: "nutbulk-1",
      assigned: [{ clientId: "ana", planId: "nut-1", applied: [] }],
      failed: [],
    });

    const user = userEvent.setup();
    const { onAssigned, onClose } = renderDialog();
    await selectClient(user, "ana");
    await waitFor(() => expect(screen.getByTestId("nutrition-bulk-submit")).toBeEnabled());
    await user.click(screen.getByTestId("nutrition-bulk-submit"));

    // The usage pill counts `templateId` on assigned plans, so a bulk changes the
    // "assigned N times" number of the row that launched it.
    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("marks a client who has never signed in as blocked, not as a stranger", async () => {
    mockPreview.mockResolvedValue({
      rows: [
        {
          clientId: "mirror:nuevo@example.com",
          clientName: "nuevo@example.com",
          blockedReason: "pendingProvisioning",
          notices: [],
        },
      ],
      summary: {
        assignable: 0,
        blocked: 1,
        untouched: 0,
        affected: 0,
        trimmed: 0,
        superseded: 0,
        deferred: 0,
      },
    });

    const user = userEvent.setup();
    renderDialog();
    await selectClient(user, "ana");

    const list = await screen.findByTestId("nutrition-bulk-preview");
    expect(list).toHaveTextContent("Hasn’t signed in yet");
  });
});
