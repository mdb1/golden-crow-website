/**
 * @jest-environment jsdom
 */

// coach-weekly-summary-card.test.tsx — gc-fitness #1347.
//
// The card's states: empty → generate → ready (+ regenerate), loading,
// quota exhausted (buttons disabled), error, and the consent line that is
// ALWAYS visible (the coach-facing half of the consent decision).

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockGenerate = jest.fn();
jest.mock("@/lib/gc-fitness/coach-ai-summary-actions", () => ({
  generateCoachWeeklySummary: (...args: unknown[]) => mockGenerate(...args),
}));

import { CoachWeeklySummaryCard } from "../CoachWeeklySummaryCard";

const SUMMARY = {
  headline: "Ana trained 3 of 4 times.",
  sections: [
    { key: "adherence" as const, title: "Adherence", text: "3 of 4 scheduled workouts." },
    { key: "habits" as const, title: "", text: "Water every day." },
  ],
  flags: ["Ask about Thursday."],
  isoWeek: "2026-W42",
  windowFrom: "2026-10-07",
  windowTo: "2026-10-13",
  generatedAtISO: "2026-10-13T12:00:00.000Z",
};
const QUOTA = { limit: 20, used: 1, remaining: 19 };

beforeEach(() => mockGenerate.mockReset());

test("empty state: consent line, quota and Generate; generating shows the summary", async () => {
  mockGenerate.mockResolvedValue({ ok: true, cached: false, summary: SUMMARY, quota: { limit: 20, used: 2, remaining: 18 } });
  render(<CoachWeeklySummaryCard clientId="c1" initial={{ ok: true, summary: null, quota: QUOTA }} />);
  expect(screen.getByText("AI-generated from the data you already see for your client.")).toBeInTheDocument();
  expect(screen.getByText("19 of 20 left today")).toBeInTheDocument();
  expect(screen.getByText(/There is no summary for this week yet/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Generate summary/ }));
  expect(mockGenerate).toHaveBeenCalledWith("c1", { force: false });
  expect(await screen.findByTestId("coach-ai-summary-headline")).toHaveTextContent("Ana trained 3 of 4 times.");
  expect(screen.getByText("Adherence")).toBeInTheDocument();
  // An empty model title falls back to the localized section name.
  expect(screen.getByText("Habits")).toBeInTheDocument();
  expect(screen.getByText("Ask about Thursday.")).toBeInTheDocument();
  expect(screen.getByText("18 of 20 left today")).toBeInTheDocument();
  expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
});

test("a cached summary renders with Regenerate, which forces", async () => {
  mockGenerate.mockResolvedValue({ ok: true, cached: false, summary: { ...SUMMARY, headline: "New" }, quota: QUOTA });
  render(<CoachWeeklySummaryCard clientId="c1" initial={{ ok: true, summary: SUMMARY, quota: QUOTA }} />);
  expect(screen.getByTestId("coach-ai-summary-headline")).toHaveTextContent("Ana trained");
  await userEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
  expect(mockGenerate).toHaveBeenCalledWith("c1", { force: true });
  await waitFor(() => expect(screen.getByTestId("coach-ai-summary-headline")).toHaveTextContent("New"));
});

test("loading state while the callable runs", async () => {
  let resolve: (v: unknown) => void = () => {};
  mockGenerate.mockReturnValue(new Promise((r) => (resolve = r)));
  render(<CoachWeeklySummaryCard clientId="c1" initial={{ ok: true, summary: null, quota: QUOTA }} />);
  await userEvent.click(screen.getByRole("button", { name: /Generate summary/ }));
  expect(await screen.findByRole("status")).toHaveTextContent(/Generating the summary/);
  expect(screen.getByRole("button", { name: /Generate summary/ })).toBeDisabled();
  resolve({ ok: true, cached: false, summary: SUMMARY, quota: QUOTA });
  await screen.findByTestId("coach-ai-summary-headline");
});

test("quota exhausted: buttons disabled and the limit message shown", () => {
  render(
    <CoachWeeklySummaryCard
      clientId="c1"
      initial={{ ok: true, summary: SUMMARY, quota: { limit: 20, used: 20, remaining: 0 } }}
    />,
  );
  expect(screen.getByRole("button", { name: /Regenerate/ })).toBeDisabled();
  expect(screen.getByText(/You reached today's limit of 20 summaries/)).toBeInTheDocument();
});

test("a quota rejection from the server disables Generate", async () => {
  mockGenerate.mockResolvedValue({ ok: false, error: "quota", quota: { limit: 20, used: 20, remaining: 0 } });
  render(<CoachWeeklySummaryCard clientId="c1" initial={{ ok: true, summary: null, quota: QUOTA }} />);
  await userEvent.click(screen.getByRole("button", { name: /Generate summary/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/today's limit of 20/);
  expect(screen.getByRole("button", { name: /Generate summary/ })).toBeDisabled();
});

test("errors are localized, never raw", async () => {
  mockGenerate.mockResolvedValue({ ok: false, error: "unavailable" });
  render(<CoachWeeklySummaryCard clientId="c1" initial={{ ok: true, summary: null, quota: QUOTA }} />);
  await userEvent.click(screen.getByRole("button", { name: /Generate summary/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The AI service did not respond. Try again in a while.");
});

test("an opted-out client shows the consent error", async () => {
  mockGenerate.mockResolvedValue({ ok: false, error: "opted_out" });
  render(<CoachWeeklySummaryCard clientId="c1" initial={{ ok: true, summary: null, quota: QUOTA }} />);
  await userEvent.click(screen.getByRole("button", { name: /Generate summary/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This client has not enabled AI summaries.");
});
