/**
 * @jest-environment jsdom
 */

// admin-gaps-541.test.tsx — #541: render tests (fixtures, no reads) for the second admin
// batch: installed-version panel with the minBuild simulator, hygiene scan coverage,
// subscription history + social cards, and the coach_activity log table.

import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { buildDistribution } from "@/lib/gc-fitness/app-version-distribution";
import { decodeSubscriptionEvents } from "@/lib/gc-fitness/admin-client-overview-model";
import type { ClientAdminOverview } from "@/lib/gc-fitness/admin-client-overview";

import { AppVersionDistributionPanel } from "../app-config/AppVersionDistributionPanel";
import { ScanCoverage } from "../hygiene/ScanCoverage";
import { CoachActivityLogTable } from "../coach-activity/_components/CoachActivityLogTable";
import {
  ClientSocialCard,
  ClientSubscriptionHistoryCard,
} from "../coaches/[uid]/clients/[clientId]/_components/ClientOverviewCards";

const TZ = "America/Argentina/Buenos_Aires";

describe("AppVersionDistributionPanel", () => {
  const platforms = buildDistribution([
    { uid: "a", platform: "ios", appBuild: "410", appVersion: "2.3.0", registeredAtMs: 2 },
    { uid: "b", platform: "ios", appBuild: "380", appVersion: "2.2.0", registeredAtMs: 2 },
    { uid: "c", platform: "ios", appBuild: "300", appVersion: "2.0.0", registeredAtMs: 2 },
    { uid: "d", platform: "ios", appBuild: null, appVersion: null, registeredAtMs: 2 },
  ]);

  it("shows who the current minBuild blocks and recounts live for a simulated one", () => {
    render(
      <AppVersionDistributionPanel platforms={platforms} tokensRead={4} capped={false} currentMinBuild={{ ios: 350, android: 0 }} />,
    );
    expect(screen.getByTestId("app-version-ios-current")).toHaveTextContent("The current minBuild (350) already blocks 1.");
    expect(screen.getByTestId("app-version-android-current")).toHaveTextContent("No gate");
    fireEvent.change(screen.getByTestId("app-version-ios-simulate"), { target: { value: "400" } });
    expect(screen.getByTestId("app-version-ios-simulated")).toHaveTextContent("Would block 2 (+ 1 with no known version");
    expect(screen.getByTestId("app-version-ios-build-380")).toHaveTextContent("blocked");
    expect(screen.getByTestId("app-version-ios-build-410")).not.toHaveTextContent("blocked");
    expect(screen.queryByTestId("app-version-distribution-capped")).toBeNull();
  });

  it("says when the token read hit the cap", () => {
    render(<AppVersionDistributionPanel platforms={platforms} tokensRead={5000} capped currentMinBuild={{ ios: 0, android: 0 }} />);
    expect(screen.getByTestId("app-version-distribution-capped")).toHaveTextContent("5000");
  });
});

describe("ScanCoverage", () => {
  it("warns about the collections cut at the cap", () => {
    render(
      <ScanCoverage
        scanLimit={120}
        coverage={[
          { collection: "users", scanned: 120, capped: true },
          { collection: "chats", scanned: 40, capped: false },
        ]}
      />,
    );
    expect(screen.getByTestId("hygiene-coverage-headline")).toHaveTextContent("1 collection hit the 120-document scan limit");
    expect(screen.getByTestId("hygiene-coverage-users")).toHaveTextContent("cut at the limit");
    expect(screen.getByTestId("hygiene-coverage-chats")).not.toHaveTextContent("cut");
  });

  it("complete scan", () => {
    render(<ScanCoverage scanLimit={120} coverage={[{ collection: "chats", scanned: 3, capped: false }]} />);
    expect(screen.getByTestId("hygiene-coverage-headline")).toHaveTextContent("read completely");
  });
});

function overview(extra: Partial<ClientAdminOverview>): ClientAdminOverview {
  return { timezone: TZ, subscriptionEvents: null, social: null, ...extra } as ClientAdminOverview;
}

describe("subscription history + social", () => {
  it("labels RevenueCat events", () => {
    render(
      <ClientSubscriptionHistoryCard
        overview={overview({
          subscriptionEvents: decodeSubscriptionEvents([
            { id: "e1", data: { type: "INITIAL_PURCHASE", receivedAt: "2026-10-01T10:00:00Z" } },
            { id: "e2", data: { type: "EXPIRATION", receivedAt: "2026-11-01T10:00:00Z" } },
            { id: "e3", data: { type: "WEIRD", receivedAt: "2026-09-01T10:00:00Z" } },
          ]),
        })}
      />,
    );
    expect(screen.getByTestId("client-rc-event-e1")).toHaveTextContent("Purchase");
    expect(screen.getByTestId("client-rc-event-e2")).toHaveTextContent("Expired");
    expect(screen.getByTestId("client-rc-event-e3")).toHaveTextContent("WEIRD");
  });

  it("empty and unreadable history", () => {
    const { unmount } = render(<ClientSubscriptionHistoryCard overview={overview({ subscriptionEvents: [] })} />);
    expect(screen.getByText("No purchases or subscription events.")).toBeInTheDocument();
    unmount();
    render(<ClientSubscriptionHistoryCard overview={overview({ subscriptionEvents: null })} />);
    expect(screen.getByText("The history could not be read.")).toBeInTheDocument();
  });

  it("social card", () => {
    render(
      <ClientSocialCard
        overview={overview({
          social: {
            hasProfile: true,
            handle: "beto",
            visibility: "public",
            suspended: true,
            followers: 12,
            following: 3,
            publicRoutines: 1,
            challenges: 2,
          },
        })}
      />,
    );
    expect(screen.getByText("@beto")).toBeInTheDocument();
    expect(screen.getByTestId("client-social-followers")).toHaveTextContent("12");
    expect(screen.getByTestId("client-social-challenges")).toHaveTextContent("2");
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });
});

describe("CoachActivityLogTable", () => {
  it("renders the log with kind labels, client links and bulk groups", () => {
    render(
      <CoachActivityLogTable
        timezone={TZ}
        rows={[
          {
            id: "a",
            trainerId: "coach1",
            coachName: "Ana",
            kind: "weight_request",
            rawKind: "weight_request",
            title: "Pidió el peso",
            detail: null,
            clientId: "c1",
            clientName: "Beto",
            pendingEmail: null,
            deleted: false,
            occurredAtISO: "2026-11-10T10:00:00.000Z",
            groupId: null,
            groupCount: 1,
          },
          {
            id: "b",
            trainerId: "coach1",
            coachName: "Ana",
            kind: "nutrition_plan",
            rawKind: "nutrition_plan",
            title: "Asignó un plan",
            detail: "Beto, Caro y 3 más",
            clientId: null,
            clientName: null,
            pendingEmail: null,
            deleted: true,
            occurredAtISO: "2026-11-09T10:00:00.000Z",
            groupId: "G",
            groupCount: 5,
          },
        ]}
      />,
    );
    const a = screen.getByTestId("coach-activity-log-a");
    expect(a).toHaveTextContent("Requested weight");
    expect(screen.getByRole("link", { name: "Beto" })).toHaveAttribute("href", "/gc-fitness/admin/coaches/coach1/clients/c1");
    const b = screen.getByTestId("coach-activity-log-b");
    expect(b).toHaveTextContent("Nutrition plan");
    expect(b).toHaveTextContent("Deleted");
    expect(b).toHaveTextContent("5 clients");
  });

  it("empty", () => {
    render(<CoachActivityLogTable timezone={TZ} rows={[]} />);
    expect(screen.getByText("No recorded actions.")).toBeInTheDocument();
  });
});
