/**
 * @jest-environment jsdom
 */

// corvo-admin.test.tsx — the tables and the report context view of
// /gc-fitness/admin/corvo (gc-fitness #1330). Presentational: the screen IS
// the contract here (nothing is written). What is pinned:
//   • acceptance shows applied/shown per type with the localized type name,
//     and the total row;
//   • near-quota shows count/quota and flags who reached it;
//   • each report links to its OWN context route (uid + messageId);
//   • the context view marks the reported message, and a deleted
//     conversation shows the notice instead of messages.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import React from "react";

jest.mock("@/lib/gc-fitness/ai-coach-admin-actions", () => ({}));

import type { ContextMessage } from "@/lib/gc-fitness/ai-coach-admin-model";

import { CorvoReportContextView } from "../corvo/_components/CorvoReportContextView";
import { CorvoAcceptanceTable, CorvoNearQuotaTable, CorvoReportsTable } from "../corvo/_components/CorvoTables";

const report = {
  uid: "u-1",
  messageId: "re-m9",
  reason: "inappropriate" as const,
  note: "[nota-1]",
  createdAtISO: "2026-10-11T10:05:00.000Z",
  platform: "ios",
  appVersion: "1.7.0",
  email: "user@x.com",
};

describe("CorvoAcceptanceTable", () => {
  it("renders the rate per type with the localized name and the total", () => {
    render(
      <CorvoAcceptanceTable
        rows={[
          { type: "routine", shown: 4, applied: 1, dismissed: 2, failed: 0, expired: 1, pending: 0, superseded: 0, rate: 0.25 },
          { type: "brand_new_type", shown: 1, applied: 1, dismissed: 0, failed: 0, expired: 0, pending: 0, superseded: 3, rate: 1 },
        ]}
      />,
    );
    expect(within(screen.getByTestId("acceptance-routine")).getByText(/^Routine$/)).toBeInTheDocument();
    expect(screen.getByTestId("acceptance-rate-routine")).toHaveTextContent(/^25%$/);
    // Unknown type → raw id, never a translation key path.
    expect(within(screen.getByTestId("acceptance-brand_new_type")).getAllByText(/^brand_new_type$/)).toHaveLength(2);
    expect(screen.getByTestId("acceptance-rate-total")).toHaveTextContent(/^40%$/);
  });

  it("shows the empty state", () => {
    render(<CorvoAcceptanceTable rows={[]} />);
    expect(screen.getByText("No proposals in the last 30 days.")).toBeInTheDocument();
  });
});

describe("CorvoNearQuotaTable", () => {
  it("shows count/quota and flags only who reached it", () => {
    render(
      <CorvoNearQuotaTable
        rows={[
          { uid: "a", email: "a@x.com", displayName: null, tier: "free", kind: "lifetime", civilDate: "2026-10-11", used: 10, limit: 10, reachedQuota: true },
          { uid: "b", email: null, displayName: "Bea", tier: "premium", kind: "daily", civilDate: "2026-10-13", used: 13, limit: 15, reachedQuota: false },
        ]}
      />,
    );
    expect(screen.getByTestId("near-quota-usage-a")).toHaveTextContent(/^10\/10$/);
    expect(screen.getByTestId("near-quota-usage-b")).toHaveTextContent(/^13\/15$/);
    // free is lifetime: no day, "In total"; a daily tier shows today's date
    expect(screen.getByTestId("near-quota-day-a")).toHaveTextContent(/^In total$/);
    expect(screen.getByTestId("near-quota-day-b")).toHaveTextContent(/^2026-10-13$/);
    expect(within(screen.getByTestId("near-quota-a")).getByText("Reached the quota")).toBeInTheDocument();
    expect(within(screen.getByTestId("near-quota-b")).queryByText("Reached the quota")).toBeNull();
    expect(within(screen.getByTestId("near-quota-b")).getByText("Bea")).toBeInTheDocument();
  });
});

describe("CorvoReportsTable", () => {
  it("links each report to its own context route", () => {
    render(<CorvoReportsTable rows={[report]} />);
    const row = screen.getByTestId("report-re-m9");
    expect(within(row).getByText("Inappropriate")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "View context" })).toHaveAttribute(
      "href",
      "/gc-fitness/admin/corvo/reports/u-1/re-m9",
    );
  });

  it("shows the empty state", () => {
    render(<CorvoReportsTable rows={[]} />);
    expect(screen.getByText("No reported replies.")).toBeInTheDocument();
  });
});

describe("CorvoReportContextView", () => {
  const msg = (id: string, role: "user" | "assistant", extra: Partial<ContextMessage> = {}): ContextMessage => ({
    id,
    role,
    text: `[${id}]`,
    status: "done",
    errorCode: null,
    createdAtISO: "2026-10-11T10:00:00.000Z",
    isReported: false,
    ...extra,
  });

  it("renders the messages in order and marks only the reported one", () => {
    render(
      <CorvoReportContextView
        context={{
          kind: "ok",
          report,
          messages: [msg("m7", "user"), msg("m8", "assistant", { status: "error", errorCode: "timeout" }), msg("re-m9", "assistant", { isReported: true })],
        }}
      />,
    );
    const items = within(screen.getByTestId("corvo-context-messages")).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-testid"))).toEqual([
      "context-message-m7",
      "context-message-m8",
      "context-message-re-m9",
    ]);
    expect(items.map((li) => li.getAttribute("data-reported"))).toEqual(["false", "false", "true"]);
    expect(within(items[2]).getByText("Reported")).toBeInTheDocument();
    expect(within(items[1]).getByText("Error reply (timeout)")).toBeInTheDocument();
    expect(screen.getByTestId("corvo-context-report")).toHaveTextContent("Reported by user@x.com");
    expect(screen.getByTestId("corvo-context-report")).toHaveTextContent("[nota-1]");
  });

  it("a deleted conversation shows the notice and no messages", () => {
    render(<CorvoReportContextView context={{ kind: "deleted", report }} />);
    expect(screen.getByTestId("corvo-context-deleted")).toHaveTextContent(/^Conversation deleted by the user\.$/);
    expect(screen.queryByTestId("corvo-context-messages")).toBeNull();
  });

  it("an unknown report shows not found", () => {
    render(<CorvoReportContextView context={{ kind: "not_found" }} />);
    expect(screen.getByTestId("corvo-context-not-found")).toHaveTextContent("This report does not exist.");
  });
});
