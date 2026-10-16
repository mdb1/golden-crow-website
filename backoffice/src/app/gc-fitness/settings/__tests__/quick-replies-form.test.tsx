/**
 * @jest-environment jsdom
 */

// quick-replies-form.test.tsx — #451 regression net.
//
// Asserts what the form SUBMITS to `updateChatQuickReplies` (mocked): the
// `{ value }[]` field array must come back out as a plain `string[]` in the
// on-screen order, untrimmed (the server trims + drops empties), and an empty
// list must still be sent (the server turns it into FieldValue.delete()).

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockUpdateChatQuickReplies = jest.fn();
jest.mock("@/lib/gc-fitness/user-actions", () => ({
  updateChatQuickReplies: (...args: unknown[]) => mockUpdateChatQuickReplies(...args),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn() }),
}));

import { QuickRepliesForm } from "../quick-replies-form";

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateChatQuickReplies.mockResolvedValue({ ok: true });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const row = (n: number) => screen.getByLabelText(`Quick reply ${n}`) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: "Save" });

async function submittedReplies(): Promise<unknown> {
  await waitFor(() => expect(mockUpdateChatQuickReplies).toHaveBeenCalledTimes(1));
  return mockUpdateChatQuickReplies.mock.calls[0]![0];
}

describe("QuickRepliesForm", () => {
  it("renders the initial replies; Save is disabled until something changes", () => {
    render(<QuickRepliesForm initialReplies={["Great job!", "See you tomorrow"]} />);
    expect(row(1)).toHaveValue("Great job!");
    expect(row(2)).toHaveValue("See you tomorrow");
    expect(screen.getByText("2/20 templates")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("shows the empty hint with no replies", () => {
    render(<QuickRepliesForm initialReplies={[]} />);
    expect(screen.getByText(/No quick replies yet/)).toBeInTheDocument();
  });

  it("submits a plain string[] in on-screen order, untrimmed", async () => {
    const user = userEvent.setup();
    render(<QuickRepliesForm initialReplies={["Great job!"]} />);
    await user.click(screen.getByRole("button", { name: "Add quick reply" }));
    await user.type(row(2), "  Rest well  ");
    await user.click(saveButton());
    expect(await submittedReplies()).toEqual({ replies: ["Great job!", "  Rest well  "] });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith("Quick replies saved.");
  });

  it("reordering changes the submitted order", async () => {
    const user = userEvent.setup();
    render(<QuickRepliesForm initialReplies={["A", "B", "C"]} />);
    // Move "C" up twice → C, A, B.
    const ups = () => screen.getAllByRole("button", { name: "Move quick reply up" });
    expect(ups()[0]).toBeDisabled();
    await user.click(ups()[2]!);
    await user.click(ups()[1]!);
    await user.click(saveButton());
    expect(await submittedReplies()).toEqual({ replies: ["C", "A", "B"] });
  });

  it("move down is disabled on the last row", () => {
    render(<QuickRepliesForm initialReplies={["A", "B"]} />);
    const downs = screen.getAllByRole("button", { name: "Move quick reply down" });
    expect(downs[0]).toBeEnabled();
    expect(downs[1]).toBeDisabled();
  });

  it("removing every row submits an empty list (server deletes the field)", async () => {
    const user = userEvent.setup();
    render(<QuickRepliesForm initialReplies={["A", "B"]} />);
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getAllByRole("button", { name: "Remove quick reply" })[0]!);
    }
    await user.click(saveButton());
    expect(await submittedReplies()).toEqual({ replies: [] });
  });

  it("an added-but-blank row is sent as '' (the server drops it)", async () => {
    const user = userEvent.setup();
    render(<QuickRepliesForm initialReplies={["A"]} />);
    await user.click(screen.getByRole("button", { name: "Add quick reply" }));
    await user.click(saveButton());
    expect(await submittedReplies()).toEqual({ replies: ["A", ""] });
  });

  it("caps rows at 20 and each row at 240 characters (server limits)", async () => {
    const user = userEvent.setup();
    const twenty = Array.from({ length: 20 }, (_, i) => `r${i}`);
    render(<QuickRepliesForm initialReplies={twenty} />);
    expect(screen.getByRole("button", { name: "Add quick reply" })).toBeDisabled();
    expect(row(1)).toHaveAttribute("maxLength", "240");
    await user.clear(row(1));
    await user.type(row(1), "x".repeat(250));
    expect(row(1).value).toHaveLength(240);
    await user.click(saveButton());
    const payload = (await submittedReplies()) as { replies: string[] };
    expect(payload.replies).toHaveLength(20);
    expect(payload.replies[0]).toHaveLength(240);
  });

  it("a failed save surfaces an error toast and does not refresh", async () => {
    const user = userEvent.setup();
    mockUpdateChatQuickReplies.mockRejectedValue(new Error("Forbidden"));
    render(<QuickRepliesForm initialReplies={["A"]} />);
    await user.type(row(1), "!");
    await user.click(saveButton());
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Forbidden"));
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    expect(row(1)).toHaveValue("A!"); // the edit survives the failure
  });
});
