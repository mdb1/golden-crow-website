/**
 * @jest-environment jsdom
 */

// bulk-assign-form.test.tsx
//
// Assigning one template to MANY clients at once. Every mistake here is
// multiplied by the size of the roster, which is exactly why it deserves a net.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The confirm modal is stubbed at the prop boundary: it hands `onConfirm` the
// FINAL client list (the coach can drop people inside the modal), so driving it
// directly is both simpler and closer to the real contract than clicking
// through a second dialog.
//
// What these tests protect:
//
//   1. THE "ONCE" PATH STAYS CLEAN. The source states the single-date submit
//      must be byte-identical to the pre-recurrence one — no `recurrence`, no
//      `endDate` keys at all. Leaking either turns one workout per client into
//      a whole series per client.
//   2. THE FINAL CLIENT LIST WINS. Whoever survives the confirm modal is who
//      gets written. Falling back to the pre-modal selection re-adds clients
//      the coach just removed.
//   3. THE COUNT THE COACH IS TOLD. Recurring reports CLIENTS; one-time reports
//      DOCUMENTS. Recurring writes one doc per client × date, so reporting the
//      doc count there would tell a coach they just assigned 60 people.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { BulkAssignForm } from "@/components/gc-fitness/schedule/bulk-assign-form";

const mockBulkAssign = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  bulkAssignTemplate: (...args: unknown[]) => mockBulkAssign(...args),
}));

const mockUseWorkoutTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => mockUseWorkoutTemplates(),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Stub the confirm modal at its prop boundary and expose the final-list hook.
let confirmProps: Record<string, unknown> | null = null;
jest.mock("@/components/gc-fitness/schedule/bulk-confirm-modal", () => ({
  BulkConfirmModal: (props: Record<string, unknown>) => {
    confirmProps = props;
    return props.open ? <div data-testid="confirm-modal-open" /> : null;
  },
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const CLIENTS = [
  { uid: "client-1", displayName: "Ana", email: "ana@example.com" },
  { uid: "client-2", displayName: "Beto", email: "beto@example.com" },
  { uid: "client-3", displayName: "Cami", email: "cami@example.com" },
];

const TEMPLATES = [
  { id: "tpl-push", name: { en: "Push Day", es: "Empuje" }, tags: [] },
];

function renderForm() {
  render(
    <BulkAssignForm
      clients={CLIENTS as never}
      trainerTimezone="America/Argentina/Buenos_Aires"
    />,
  );
}

/** Drive the stubbed confirm modal's callback with an explicit final list. */
async function confirmWith(clientIds: string[]) {
  await (confirmProps!.onConfirm as (ids: string[]) => Promise<void>)(clientIds);
}

beforeEach(() => {
  jest.clearAllMocks();
  confirmProps = null;
  mockUseWorkoutTemplates.mockReturnValue({
    data: TEMPLATES,
    isLoading: false,
  });
  mockBulkAssign.mockResolvedValue({ ids: ["a1", "a2"] });
});

describe("BulkAssignForm — guards", () => {
  it("refuses to write with no template picked", async () => {
    renderForm();

    await confirmWith(["client-1"]);

    expect(mockBulkAssign).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalled();
  });

  it("refuses to write when the coach removed every client in the modal", async () => {
    const user = userEvent.setup();
    renderForm();
    await pickTemplate(user);

    await confirmWith([]);

    // An empty roster must not reach the action — a zero-client bulk write is
    // never what anyone meant.
    expect(mockBulkAssign).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalled();
  });
});

/** Select the only template through the shadcn Select trigger. */
async function pickTemplate(user: ReturnType<typeof userEvent.setup>) {
  const triggers = screen.getAllByRole("combobox");
  await user.click(triggers[0]);
  await user.click(await screen.findByRole("option", { name: /Push Day/i }));
}

describe("BulkAssignForm — the one-time path", () => {
  it("sends NO recurrence and NO endDate keys at all", async () => {
    const user = userEvent.setup();
    renderForm();
    await pickTemplate(user);

    await confirmWith(["client-1", "client-2"]);

    await waitFor(() => expect(mockBulkAssign).toHaveBeenCalledTimes(1));
    const payload = mockBulkAssign.mock.calls[0][0];
    // Documented invariant: the "once" submit is byte-identical to the
    // pre-recurrence path. Presence of either key — even undefined — changes
    // what the action does.
    expect("recurrence" in payload).toBe(false);
    expect("endDate" in payload).toBe(false);
    expect(payload.templateId).toBe("tpl-push");
  });

  it("writes exactly the client list the confirm modal returned", async () => {
    const user = userEvent.setup();
    renderForm();
    await pickTemplate(user);

    // The coach dropped Cami inside the modal.
    await confirmWith(["client-1", "client-3"]);

    await waitFor(() => expect(mockBulkAssign).toHaveBeenCalledTimes(1));
    expect(mockBulkAssign.mock.calls[0][0].clientIds).toEqual([
      "client-1",
      "client-3",
    ]);
  });

  it("reports the DOCUMENT count returned by the server", async () => {
    const user = userEvent.setup();
    mockBulkAssign.mockResolvedValueOnce({ ids: ["a1", "a2", "a3"] });
    renderForm();
    await pickTemplate(user);

    await confirmWith(["client-1", "client-2", "client-3"]);

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1));
    expect(String(mockToastSuccess.mock.calls[0][0])).toContain("3");
  });

  it("navigates to the first client's schedule so the write is visible", async () => {
    const user = userEvent.setup();
    renderForm();
    await pickTemplate(user);

    await confirmWith(["client-2", "client-1"]);

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith(
      "/gc-fitness/schedule?clientId=client-2",
    );
  });
});

describe("BulkAssignForm — failure handling", () => {
  it("surfaces an error and does NOT navigate away", async () => {
    const user = userEvent.setup();
    mockBulkAssign.mockRejectedValueOnce(new Error("nope"));
    renderForm();
    await pickTemplate(user);

    await confirmWith(["client-1"]);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    // Navigating after a failed bulk write drops the coach on a schedule that
    // shows none of what they thought they just assigned.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
