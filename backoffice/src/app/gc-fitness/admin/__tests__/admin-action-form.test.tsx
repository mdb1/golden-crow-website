/**
 * @jest-environment jsdom
 */
// admin-action-form.test.tsx — #498.
//
// The admin Server Actions now RETURN `{ ok: false, error }` instead of
// throwing (a thrown error reaches a production browser as "Minified React
// error #441"). This wrapper is what turns that value into something the
// operator can read; without it the failure would be silently dropped by a
// plain `<form action>`. Pinned: the FormData reaches the action unchanged,
// the error is shown, a success clears it, and the confirm gate (#510's
// "Dar de baja como coach") blocks the call when cancelled.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { AdminActionForm } from "../_components/admin-action-form";

function renderForm(
  action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string } | void>,
  confirmMessage?: string,
) {
  render(
    <AdminActionForm action={action} confirmMessage={confirmMessage}>
      <input type="hidden" name="coachUid" value="coach-A1" />
      <button type="submit">Go</button>
    </AdminActionForm>,
  );
  return screen.getByRole("button", { name: "Go" });
}

afterEach(() => jest.restoreAllMocks());

describe("AdminActionForm", () => {
  it("passes the form's FormData and shows a returned failure", async () => {
    const action = jest.fn(async (_fd: FormData) => ({ ok: false as const, error: "Client is not linked to this coach." }));
    fireEvent.click(renderForm(action));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't complete the action: Client is not linked to this coach.",
      ),
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0][0] as FormData).get("coachUid")).toBe("coach-A1");
  });

  it("shows nothing on success", async () => {
    const action = jest.fn(async () => ({ ok: true as const }));
    fireEvent.click(renderForm(action));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a cancelled confirmation never calls the action", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const action = jest.fn(async () => ({ ok: true as const }));
    fireEvent.click(renderForm(action, "Remove as coach?"));
    await new Promise((r) => setTimeout(r, 20));
    expect(window.confirm).toHaveBeenCalledWith("Remove as coach?");
    expect(action).not.toHaveBeenCalled();
  });

  it("an accepted confirmation calls the action", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const action = jest.fn(async () => ({ ok: true as const }));
    fireEvent.click(renderForm(action, "Remove as coach?"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
