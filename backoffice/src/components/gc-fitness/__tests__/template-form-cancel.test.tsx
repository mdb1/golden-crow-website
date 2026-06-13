/**
 * @jest-environment jsdom
 */

// template-form-cancel.test.tsx
//
// Regression for the "Cancel keeps my changes" bug: the edit form autosaves a
// draft to localStorage on every change and restores it on the next mount. The
// Cancel button used to just navigate back, leaving the draft on disk — so
// re-opening the editor resurrected the cancelled edits.
//
// These tests cover the fix: explicit Cancel, when a draft was restored (or the
// form is dirty), opens a confirm dialog; confirming DISCARDS — it removes the
// localStorage draft and navigates back, and the navigation does not re-write
// the draft.
//
// First three lines MUST stay the jsdom docblock (backoffice jest defaults to
// testEnvironment: node).

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockBack = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

// useTranslations(ns) → t(key) returns the key verbatim so we can query by it.
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Heavy data hooks — stub to safe empty shapes (no Firestore).
jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    hasSnapshot: true,
  }),
}));
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => ({ data: [], isLoading: false, error: null }),
}));

// Child components are exercised by their own tests — stub them out so this
// test stays focused on the cancel/draft flow and doesn't need their providers.
jest.mock("../exercise-picker-popover", () => ({
  ExercisePickerPopover: () => null,
}));
jest.mock("../exercise-multi-add-dialog", () => ({
  ExerciseMultiAddDialog: () => null,
}));
jest.mock("../template-tags-picker", () => ({
  TemplateTagsPicker: () => null,
}));

import { TemplateForm } from "../template-form";

const DRAFT_PREFIX = "gc-fitness:template-draft:";
const TEMPLATE_ID = "tpl-1";
const DRAFT_KEY = `edit:${TEMPLATE_ID}`;
const STORAGE_KEY = `${DRAFT_PREFIX}${DRAFT_KEY}`;

const SERVER_DEFAULTS = {
  name: { en: "Push Day", es: "Empuje" },
  description: { en: "", es: "" },
  tag: "push" as const,
  tags: ["push"],
  exercises: [
    {
      exerciseId: "0025",
      sets: 3,
      reps: 12,
      rest_seconds: 90,
      transition_rest_seconds: 60,
      order: 0,
    },
  ],
};

// A draft that differs from the server defaults (a swapped exercise) — this is
// the "unsaved change" the trainer wants Cancel to throw away.
const DRAFT_VALUE = {
  ...SERVER_DEFAULTS,
  exercises: [
    {
      exerciseId: "9999-swapped",
      sets: 4,
      reps: 8,
      rest_seconds: 120,
      transition_rest_seconds: 60,
      order: 0,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

function renderForm() {
  return render(
    <TemplateForm
      mode="edit"
      draftKey={DRAFT_KEY}
      defaultValues={SERVER_DEFAULTS}
      onSubmit={async () => ({ ok: true as const })}
    />,
  );
}

describe("TemplateForm cancel discards the autosaved draft", () => {
  it("confirms then clears the restored draft and navigates back", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DRAFT_VALUE));
    renderForm();

    // The restore effect read the draft → confirm path is armed.
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    // Confirm dialog appears (translation mock returns the key verbatim).
    const confirm = await screen.findByText("discardDialogConfirm");
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
    // The draft is gone AND was not re-written by the unmount/navigation flush.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps the draft when the trainer chooses 'keep editing'", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DRAFT_VALUE));
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    fireEvent.click(await screen.findByText("discardDialogKeepEditing"));

    expect(mockBack).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
