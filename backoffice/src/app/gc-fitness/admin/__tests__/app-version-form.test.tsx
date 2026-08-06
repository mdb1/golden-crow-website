/**
 * @jest-environment jsdom
 */

// app-version-form.test.tsx
//
// The force-update gate. `minBuild` is compared by the apps against their own
// native build number at launch, and anything below it gets a NON-DISMISSABLE
// update screen — so a wrong value here locks every installed client out of the
// product until someone notices and edits it back. There is no in-app recovery
// and no gradual rollout: it takes effect on the next launch, for everyone.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// That makes the two things worth pinning:
//
//   • `minBuild` REACHES THE ACTION AS A NUMBER. An `<input type="number">`
//     hands react-hook-form a STRING; the Zod `coerce` is what turns it back.
//     Written as `"42"` the mobile comparison is a string compare, where
//     `"9" > "42"`, and the gate fires on the wrong builds.
//   • THE BLANK FIELDS STAY BLANK-LEGAL. `latestVersion` and `storeUrl` are
//     display-only and optional; a regex that stops admitting `""` would block
//     saving a minBuild bump for an unrelated reason.
//
// Both platforms always travel together — the action writes one document, so a
// form that submits only the edited half wipes the other one's settings.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { AppVersionConfig } from "@/lib/gc-fitness/admin-actions";

const mockUpdate = jest.fn();
jest.mock("@/lib/gc-fitness/admin-actions", () => ({
  updateAppVersionConfig: (...args: unknown[]) => mockUpdate(...args),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => mockRefresh() }),
}));

import { AppVersionForm } from "../app-config/app-version-form";

const CONFIG: AppVersionConfig = {
  ios: { minBuild: 42, latestVersion: "1.3.0", storeUrl: "https://apps.apple.com/app/id1" },
  android: { minBuild: 0, latestVersion: "", storeUrl: "" },
  updatedAtISO: "2026-09-10T15:00:00.000Z",
  updatedBy: "manu@example.com",
} as AppVersionConfig;

function renderForm(config: AppVersionConfig = CONFIG) {
  render(<AppVersionForm initialConfig={config} timezone="America/Argentina/Buenos_Aires" />);
  return { user: userEvent.setup() };
}

/** The nth field with a given label — [0] is iOS, [1] is Android (render order
 *  follows the PLATFORMS array). */
function field(label: string, platform: "ios" | "android"): HTMLInputElement {
  const all = screen.getAllByLabelText(label) as HTMLInputElement[];
  return all[platform === "ios" ? 0 : 1];
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Save" }));
}

function payload() {
  return mockUpdate.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue(undefined);
});

describe("AppVersionForm — the gate value", () => {
  it("sends minBuild as a NUMBER, not the input's string", async () => {
    // The apps compare it against a native build number. As a string, "9" is
    // greater than "42" and the gate blocks the wrong releases.
    const { user } = renderForm();

    await user.clear(field("Minimum build", "ios"));
    await user.type(field("Minimum build", "ios"), "57");
    await save(user);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(payload().ios.minBuild).toBe(57);
    expect(typeof payload().ios.minBuild).toBe("number");
  });

  it("carries BOTH platforms even when only one was touched", async () => {
    // One document; submitting half of it would clear the other platform.
    const { user } = renderForm();

    await user.clear(field("Minimum build", "ios"));
    await user.type(field("Minimum build", "ios"), "57");
    await save(user);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(payload()).toEqual({
      ios: { minBuild: 57, latestVersion: "1.3.0", storeUrl: "https://apps.apple.com/app/id1" },
      android: { minBuild: 0, latestVersion: "", storeUrl: "" },
    });
  });

  it("accepts 0, which is how the gate is switched OFF", async () => {
    const { user } = renderForm();

    await user.clear(field("Minimum build", "ios"));
    await user.type(field("Minimum build", "ios"), "0");
    await save(user);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(payload().ios.minBuild).toBe(0);
  });

  it("REFUSES a negative build instead of writing it", async () => {
    // TWO layers, and this one is the browser's: the input carries `min={0}`
    // and `step={1}`, so native constraint validation blocks the submit before
    // react-hook-form runs. jsdom shows no bubble, so the observable effect
    // here is only that the value does NOT reach the action — asserting a Zod
    // message would be asserting something a real browser never reaches either.
    const { user } = renderForm();

    await user.clear(field("Minimum build", "ios"));
    await user.type(field("Minimum build", "ios"), "-1");
    await save(user);

    expect(field("Minimum build", "ios").validity.valid).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("REFUSES a fractional build", async () => {
    // Same layer: `step={1}` makes 1.5 natively invalid.
    const { user } = renderForm();

    await user.clear(field("Minimum build", "ios"));
    await user.type(field("Minimum build", "ios"), "1.5");
    await save(user);

    expect(field("Minimum build", "ios").validity.valid).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("REFUSES a build past the int32 ceiling, with a message", async () => {
    // The SECOND layer. There is no `max` attribute, so the browser accepts
    // this and Zod is what stops it — the only minBuild path where the inline
    // error is actually reachable.
    const { user } = renderForm();

    await user.clear(field("Minimum build", "ios"));
    await user.type(field("Minimum build", "ios"), "99999999999");
    await save(user);

    expect(await screen.findByText("Too large.")).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("AppVersionForm — the display-only fields", () => {
  it("lets both stay blank", async () => {
    // They are optional; a validator that stopped admitting "" would block an
    // urgent minBuild bump for an unrelated reason.
    const { user } = renderForm();

    await user.clear(field("Latest version", "ios"));
    await user.clear(field("Store URL", "ios"));
    await save(user);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(payload().ios).toMatchObject({ latestVersion: "", storeUrl: "" });
  });

  it("refuses a version that is not dotted digits", async () => {
    const { user } = renderForm();

    await user.clear(field("Latest version", "ios"));
    await user.type(field("Latest version", "ios"), "v1.3-beta");
    await save(user);

    expect(
      await screen.findByText("Use a dotted version like 1.2.0 (or leave blank)."),
    ).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses a store URL that is not http(s)", async () => {
    // The update button opens it; a non-http value is a dead button on the one
    // screen the client cannot dismiss.
    const { user } = renderForm();

    await user.clear(field("Store URL", "android"));
    await user.type(field("Store URL", "android"), "market://details?id=x");
    await save(user);

    expect(
      await screen.findByText("Must be an http(s) URL (or leave blank)."),
    ).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("trims what it does send", async () => {
    const { user } = renderForm();

    await user.clear(field("Latest version", "android"));
    await user.type(field("Latest version", "android"), "  2.0.1  ");
    await save(user);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(payload().android.latestVersion).toBe("2.0.1");
  });
});

describe("AppVersionForm — what the admin is told", () => {
  it("confirms and refreshes on success", async () => {
    const { user } = renderForm();

    await save(user);

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("App version requirements saved."),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("surfaces the server's message and does NOT claim it saved", async () => {
    mockUpdate.mockRejectedValue(new Error("Forbidden"));
    const { user } = renderForm();

    await save(user);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Forbidden"));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows who last touched the gate, and when", async () => {
    // The audit line is the only trace of a change that can lock everyone out.
    renderForm();

    expect(screen.getByText(/by manu@example\.com/)).toBeInTheDocument();
  });

  it("omits the audit line when the document has never been written", async () => {
    renderForm({ ...CONFIG, updatedAtISO: null, updatedBy: null } as AppVersionConfig);

    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});
