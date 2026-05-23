/**
 * @jest-environment jsdom
 */

// language-form.test.tsx
//
// 260523-kpt Task D — covers the trainer locale toggle on
// /gc-fitness/settings.
//
// FIRST THREE LINES OF THIS FILE ARE LOCKED (per PLAN 260523-kpt Task D
// step 4 / "MANDATORY new-file shape"). They are the Jest jsdom docblock —
// the backoffice jest.config defaults to `testEnvironment: 'node'`, so
// without the docblock React Testing Library crashes with
// `ReferenceError: document is not defined`.

import "@testing-library/jest-dom";

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

import enMessages from "../../../../../messages/en.json";

// Mock the Server Action so the test can assert call shape + drive
// success/failure paths without hitting Firestore admin or the cookies()
// next/headers API (the action would throw on call inside jsdom because
// next/headers requires a Server Component / Server Action runtime).
const mockUpdatePreferredLocale = jest.fn();
jest.mock("@/lib/gc-fitness/user-actions", () => ({
  updatePreferredLocale: (...args: unknown[]) =>
    mockUpdatePreferredLocale(...args),
}));

// Mock sonner toast.
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock next/navigation router (router.refresh() is called on success).
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRouterRefresh,
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

// Stub ResizeObserver — Radix RadioGroup uses it under the hood.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverStub;

// Stub Radix-required DOM APIs jsdom doesn't ship.
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  value: () => false,
  writable: true,
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => undefined,
  writable: true,
});

// Import AFTER mocks so the SUT picks them up.
import { LanguageForm } from "../language-form";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("LanguageForm", () => {
  it("(a) renders both English and Español radio options labelled from the EN catalog", () => {
    render(<LanguageForm currentLocale="en" />);

    // Resolve labels via the EN catalog so the assertions stay in
    // lockstep with the keys the component reads — never hardcode a
    // bare English string here (Pitfall: future-proof against tone
    // tweaks in en.json).
    expect(
      screen.getByRole("radio", { name: enMessages.settings.language.english }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: enMessages.settings.language.spanish }),
    ).toBeInTheDocument();
  });

  it("(b) clicking Español + submitting calls updatePreferredLocale({ locale: 'es' }) exactly once", async () => {
    mockUpdatePreferredLocale.mockResolvedValue({ ok: true });
    render(<LanguageForm currentLocale="en" />);

    // Click the Spanish radio.
    fireEvent.click(
      screen.getByRole("radio", { name: enMessages.settings.language.spanish }),
    );

    // Submit the form — the Save button reads from `t('save')`.
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.settings.language.save }),
    );

    await waitFor(() => {
      expect(mockUpdatePreferredLocale).toHaveBeenCalledTimes(1);
      expect(mockUpdatePreferredLocale).toHaveBeenCalledWith({ locale: "es" });
    });
  });
});
