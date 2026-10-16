/**
 * @jest-environment jsdom
 */

// coach-profile-form.test.tsx — #451 regression net.
//
// Asserts the payload handed to `updateTrainerProfile` (mocked): trimmed name
// with the email as fallback, trimmed bio with blank → null, and the stored
// photo URL carried through untouched. The photo-upload path (FileReader +
// <img> decode + canvas) cannot run under jsdom and is not covered here.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockUpdateTrainerProfile = jest.fn();
jest.mock("@/lib/gc-fitness/user-actions", () => ({
  updateTrainerProfile: (...args: unknown[]) => mockUpdateTrainerProfile(...args),
}));

jest.mock("@/lib/firebase/gc-fitness-client", () => ({
  getGCFitnessAuth: () => ({ currentUser: null }),
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

import { CoachProfileForm } from "../coach-profile-form";

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateTrainerProfile.mockResolvedValue({ ok: true });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function renderForm(props: Partial<React.ComponentProps<typeof CoachProfileForm>> = {}) {
  return render(
    <CoachProfileForm
      uid="coach-1"
      email="fede@example.com"
      initialDisplayName="Fede"
      initialPhotoURL="https://storage.example/fede.jpg"
      initialBio="Strength coach"
      {...props}
    />,
  );
}

const nameInput = () => screen.getByLabelText("Display name") as HTMLInputElement;
const bioInput = () => screen.getByLabelText("Description") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: "Save profile" });

async function payload(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(mockUpdateTrainerProfile).toHaveBeenCalledTimes(1));
  return mockUpdateTrainerProfile.mock.calls[0]![0] as Record<string, unknown>;
}

describe("CoachProfileForm", () => {
  it("prefills and keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(nameInput()).toHaveValue("Fede");
    expect(bioInput()).toHaveValue("Strength coach");
    expect(saveButton()).toBeDisabled();
    await user.type(nameInput(), "x");
    expect(saveButton()).toBeEnabled();
    await user.type(nameInput(), "{Backspace}");
    expect(saveButton()).toBeDisabled();
  });

  it("submits the trimmed name and bio with the stored photo URL", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(nameInput());
    await user.type(nameInput(), "  Fede B.  ");
    await user.clear(bioInput());
    await user.type(bioInput(), "  Hypertrophy & mobility  ");
    await user.click(saveButton());
    expect(await payload()).toEqual({
      displayName: "Fede B.",
      photoURL: "https://storage.example/fede.jpg",
      bio: "Hypertrophy & mobility",
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith("Coach profile saved.");
  });

  it("a blank name falls back to the email (the server requires min 1)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(nameInput());
    await user.type(nameInput(), "   ");
    await user.click(saveButton());
    expect((await payload()).displayName).toBe("fede@example.com");
  });

  it("a blank bio is sent as null, not ''", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(bioInput());
    await user.type(bioInput(), "   ");
    await user.click(saveButton());
    expect((await payload()).bio).toBeNull();
  });

  it("a coach with no photo sends photoURL: null", async () => {
    const user = userEvent.setup();
    renderForm({ initialPhotoURL: null, initialBio: null });
    expect(bioInput()).toHaveValue("");
    await user.type(bioInput(), "Hi");
    await user.click(saveButton());
    expect(await payload()).toEqual({ displayName: "Fede", photoURL: null, bio: "Hi" });
  });

  it("shows the initial letter when there is no photo", () => {
    renderForm({ initialPhotoURL: null, initialDisplayName: "ana" });
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("a failed save surfaces an error toast and does not refresh", async () => {
    const user = userEvent.setup();
    mockUpdateTrainerProfile.mockRejectedValue(new Error("Forbidden"));
    renderForm();
    await user.type(bioInput(), "!");
    await user.click(saveButton());
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Forbidden"));
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  // Regression (#451, #1104 class): the server caps bio at 280 and displayName
  // at 120, the inputs had no maxLength, and a longer bio made
  // updateTrainerProfile throw — in production the coach saw Next's redacted
  // error instead of anything actionable. The inputs are capped now.
  it("never sends a bio over 280 or a name over 120 characters", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(bioInput());
    await user.type(bioInput(), "b".repeat(300));
    await user.clear(nameInput());
    await user.type(nameInput(), "n".repeat(130));
    await user.click(saveButton());
    await waitFor(() =>
      expect(mockUpdateTrainerProfile.mock.calls.length + mockToastError.mock.calls.length).toBeGreaterThan(0),
    );
    for (const [input] of mockUpdateTrainerProfile.mock.calls as Array<[Record<string, string | null>]>) {
      expect((input.bio ?? "").length).toBeLessThanOrEqual(280);
      expect((input.displayName ?? "").length).toBeLessThanOrEqual(120);
    }
    expect(mockUpdateTrainerProfile.mock.calls.length + mockToastError.mock.calls.length).toBeGreaterThan(0);
  });
});
