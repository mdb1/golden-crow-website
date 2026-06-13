/**
 * @jest-environment jsdom
 */

// view/__tests__/actions.test.tsx
//
// Covers the read-only template VIEW action bar (the fix for the silent
// auto-fork-on-open bug). Asserts:
//   - Duplicate calls the existing `duplicateWorkoutTemplate` server action
//     with the templateId, then navigates into the NEW copy's /edit page.
//   - Back navigates to the templates list.
//   - A failed duplicate surfaces a toast and does NOT navigate.
//
// First three lines MUST stay the jsdom docblock (backoffice jest defaults to
// testEnvironment: node).

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

// useTranslations(ns) → t(key) returns the key verbatim so we can query by it.
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockDuplicate = jest.fn();
jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  duplicateWorkoutTemplate: (...args: unknown[]) => mockDuplicate(...args),
}));

import { ViewTemplateActions } from "../actions";

const TEMPLATE_ID = "tpl-standard-1";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ViewTemplateActions", () => {
  it("duplicates and navigates into the new copy's editor", async () => {
    mockDuplicate.mockResolvedValueOnce({ id: "tpl-copy-99" });
    render(<ViewTemplateActions templateId={TEMPLATE_ID} />);

    fireEvent.click(screen.getByText("duplicateCta"));

    await waitFor(() => {
      expect(mockDuplicate).toHaveBeenCalledWith(TEMPLATE_ID);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/gc-fitness/templates/tpl-copy-99/edit",
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("duplicatedToast");
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("toasts and does not navigate when duplicate fails", async () => {
    mockDuplicate.mockRejectedValueOnce(new Error("boom"));
    render(<ViewTemplateActions templateId={TEMPLATE_ID} />);

    fireEvent.click(screen.getByText("duplicateCta"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("boom");
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Back navigates to the templates list", () => {
    render(<ViewTemplateActions templateId={TEMPLATE_ID} />);

    fireEvent.click(screen.getByText("backCta"));

    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/templates");
  });
});
