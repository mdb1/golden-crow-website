/**
 * @jest-environment jsdom
 */

// unassigned-clients-card.test.tsx — #513.
//
// The scan behind this card stops at 150 active clients (the mobile callable's
// cap, #1588). Past that it must SAY the list is partial — the old 50-client
// cap dropped everyone else silently, and an "all caught up" over a partial
// scan is a lie.

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  ),
}));

import { UnassignedClientsCard } from "../unassigned-clients-card";

const ROW = { uid: "c1", displayName: "Ana", photoURL: null };

it("no note and the plain empty state when nothing was cut", async () => {
  render(await UnassignedClientsCard({ rows: [], truncated: false, scanned: 12 }));
  expect(screen.queryByTestId("unassigned-soon-truncated")).not.toBeInTheDocument();
  expect(screen.getByText("unassignedSoonEmpty")).toBeInTheDocument();
});

it("says how many were checked when the roster was cut", async () => {
  render(await UnassignedClientsCard({ rows: [ROW], truncated: true, scanned: 150 }));
  expect(screen.getByTestId("unassigned-soon-truncated")).toHaveTextContent(
    'unassignedSoonTruncated:{"count":150}',
  );
  expect(screen.getByText("Ana")).toBeInTheDocument();
});

it("never claims 'all caught up' over a partial scan", async () => {
  render(await UnassignedClientsCard({ rows: [], truncated: true, scanned: 150 }));
  expect(screen.queryByText("unassignedSoonEmpty")).not.toBeInTheDocument();
  expect(screen.getByText('unassignedSoonEmptyTruncated:{"count":150}')).toBeInTheDocument();
});

// #535 — «Asignar» opened an EMPTY calendar: the schedule reads `clientIds`
// (plural) and the link sent `clientId`. Also: no <button> nested in the link.
it("«Asignar» opens the schedule with THAT client selected", async () => {
  render(await UnassignedClientsCard({ rows: [{ ...ROW, uid: "c+1" }], truncated: false, scanned: 1 }));
  const link = screen.getByTestId("unassigned-soon-row");
  expect(link).toHaveAttribute("href", "/gc-fitness/schedule?clientIds=c%2B1");
  expect(link.querySelector("button")).toBeNull();
});
