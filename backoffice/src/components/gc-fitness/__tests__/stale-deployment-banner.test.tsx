/**
 * @jest-environment jsdom
 */

// stale-deployment-banner.test.tsx
//
// #382 — what the coach sees when their tab falls behind a deploy.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The behavior worth defending, in the order it matters:
//
//   1. IT DOES NOT RELOAD BY ITSELF. Losing a filled-in form IS the reported
//      injury ("pierden la sesión del formulario"); an automatic refresh would
//      cause it faster and every time. The reload lives on a button.
//   2. IT CATCHES THE UNCAUGHT CASE. The coach's original screenshot was the
//      raw Next.js message rendered on the page, i.e. nothing had caught it —
//      so a window-level listener is the path that has to work.
//   3. IT STAYS QUIET OTHERWISE. A banner that cries stale on an ordinary
//      network blip would send coaches to reload and drop their work.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import enMessages from "@/../messages/en.json";

import { StaleDeploymentBanner } from "@/components/gc-fitness/stale-deployment-banner";
import {
  noteIfStaleDeployment,
  resetStaleDeploymentForTests,
} from "@/lib/gc-fitness/stale-deployment";

/** The real throw from Next's server-action reducer. */
function staleActionError(): Error {
  const error = new Error(
    'Server Action "404583b2f953d9aaa930ceeb294cfc3118d27cf578" was not found on the server.',
  );
  error.name = "UnrecognizedActionError";
  return error;
}

function banner() {
  return screen.queryByTestId("stale-deployment-banner");
}

// jsdom 26 makes `window.location` non-configurable, so the component takes
// the reload as an optional seam rather than the test stubbing the global.
const reload = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  resetStaleDeploymentForTests();
});

describe("StaleDeploymentBanner", () => {
  it("renders nothing until something goes stale", () => {
    render(<StaleDeploymentBanner onReload={reload} />);

    expect(banner()).not.toBeInTheDocument();
  });

  it("appears on an UNCAUGHT stale-action error", async () => {
    // This is the path the coach actually hit: nothing caught the error, so it
    // rendered raw on the page under a filled-in form.
    render(<StaleDeploymentBanner onReload={reload} />);

    window.dispatchEvent(
      new ErrorEvent("error", { error: staleActionError() }),
    );

    await waitFor(() => expect(banner()).toBeInTheDocument());
    // Assert against the EN catalog, like every other component test here —
    // the coach must read "this tab is old", never a React/Next error code.
    expect(
      screen.getByText(enMessages.staleDeployment.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enMessages.staleDeployment.body),
    ).toBeInTheDocument();
  });

  it("appears when a call site reports it from its own catch", async () => {
    render(<StaleDeploymentBanner onReload={reload} />);

    noteIfStaleDeployment(staleActionError());

    await waitFor(() => expect(banner()).toBeInTheDocument());
  });

  it("appears when the error was reported BEFORE it mounted", async () => {
    // A Server Action can fail during hydration. Without the module-level
    // latch this banner would never show and the form would just refuse to
    // save, silently, forever.
    noteIfStaleDeployment(staleActionError());

    render(<StaleDeploymentBanner onReload={reload} />);

    await waitFor(() => expect(banner()).toBeInTheDocument());
  });

  it("stays hidden for an ordinary error", async () => {
    render(<StaleDeploymentBanner onReload={reload} />);

    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("Failed to fetch") }),
    );

    await waitFor(() => expect(banner()).not.toBeInTheDocument());
    expect(reload).not.toHaveBeenCalled();
  });

  it("NEVER reloads on its own — only when the coach presses the button", async () => {
    const user = userEvent.setup();
    render(<StaleDeploymentBanner onReload={reload} />);
    window.dispatchEvent(
      new ErrorEvent("error", { error: staleActionError() }),
    );
    await waitFor(() => expect(banner()).toBeInTheDocument());

    // The whole point: the coach's unsaved form survives until they say so.
    expect(reload).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: enMessages.staleDeployment.reload }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed without reloading", async () => {
    const user = userEvent.setup();
    render(<StaleDeploymentBanner onReload={reload} />);
    window.dispatchEvent(
      new ErrorEvent("error", { error: staleActionError() }),
    );
    await waitFor(() => expect(banner()).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: enMessages.staleDeployment.dismiss }));

    expect(banner()).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
