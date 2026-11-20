/**
 * @jest-environment jsdom
 */

// usage-admin.test.tsx — /gc-fitness/admin/usage (golden-crow-website#530), rendered from
// fixture `usage_daily` docs. Presentational: nothing is written, the screen IS the contract.
// Pinned: KPI values + delta text (never color-only), adoption ranking order and shares,
// Corvo topics / acceptance / n-grams, retention cells and their sequential level, the table
// view of every chart (the relief for the sub-3:1 light-mode slots) and the empty states.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import React from "react";

jest.mock("@/lib/gc-fitness/usage-actions", () => ({}));

import enMessages from "@/../messages/en.json";
import esMessages from "@/../messages/es.json";
import {
  CORVO_TOPICS,
  FEATURE_FAMILIES,
  FEATURE_KEYS,
  activitySeries,
  adoptionRanking,
  corvoSummary,
  dayKeys,
  decodeUsageDaily,
  familySeries,
  latestRetention,
  zeroFill,
} from "@/lib/gc-fitness/usage-model";
import { usageDoc } from "@/lib/gc-fitness/__tests__/fixtures/usage-daily";

import { ActivityChart, CorvoDailyChart, FamiliesChart, SegmentsChart } from "../usage/_components/UsageCharts";
import { AdoptionPanel, CorvoPanel, KpiTiles, RetentionTable, retentionLevel } from "../usage/_components/UsagePanels";

const keys = dayKeys("2026-11-16", 7);
const days = zeroFill(keys, [
  decodeUsageDaily(keys[5], usageDoc(keys[5], { dau: 4 })),
  decodeUsageDaily(keys[6], usageDoc(keys[6], { dau: 6 })),
]);
const empty = zeroFill(keys, []);

describe("KpiTiles", () => {
  it("prints the value and the delta as TEXT (arrow is decorative)", () => {
    render(
      <KpiTiles
        tiles={[
          { id: "dau", label: "Daily actives (avg)", value: "5", delta: 0.25 },
          { id: "wau", label: "Weekly actives", value: "9", delta: null, detail: "20 in the last 28 days" },
        ]}
      />,
    );
    expect(screen.getByTestId("usage-kpi-dau-value")).toHaveTextContent(/^5$/);
    expect(screen.getByTestId("usage-kpi-dau-delta")).toHaveTextContent("+25% vs previous period");
    expect(screen.getByTestId("usage-kpi-wau-delta")).toHaveTextContent("No previous period to compare");
    expect(screen.getByText("20 in the last 28 days")).toBeInTheDocument();
  });
});

describe("AdoptionPanel", () => {
  it("ranks features by share with localized names and hides unused ones", () => {
    render(<AdoptionPanel rows={adoptionRanking(days)} />);
    const items = within(screen.getByTestId("usage-adoption")).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-testid"))).toEqual([
      "usage-adoption-payments_recorded",
      "usage-adoption-habits_checked",
      // 50% each: more events first.
      "usage-adoption-corvo",
      "usage-adoption-workouts_logged",
    ]);
    expect(screen.getByTestId("usage-adoption-habits_checked")).toHaveTextContent("Habits checked");
    expect(screen.getByTestId("usage-adoption-habits_checked-share")).toHaveTextContent("75% (12)");
    expect(screen.getByTestId("usage-adoption-payments_recorded")).toHaveTextContent("coaches");
    expect(screen.queryByTestId("usage-adoption-social_dms")).toBeNull();
  });

  it("empty period", () => {
    render(<AdoptionPanel rows={adoptionRanking(empty)} />);
    expect(screen.getByText("No feature was used in this period.")).toBeInTheDocument();
  });
});

describe("CorvoPanel", () => {
  it("shows topics (count + share of messages), acceptance and the k-anonymous n-grams", () => {
    render(<CorvoPanel summary={corvoSummary(days)} />);
    expect(screen.getByTestId("usage-topic-routines")).toHaveTextContent("Routines & training");
    expect(screen.getByTestId("usage-topic-routines-value")).toHaveTextContent("6 (60%)");
    expect(screen.getByTestId("usage-topic-other-value")).toHaveTextContent("2 (20%)");
    // Topics with no messages are not listed.
    expect(screen.queryByTestId("usage-topic-motivation")).toBeNull();
    expect(screen.getByTestId("usage-corvo-acceptance")).toHaveTextContent(/^67%$/);
    expect(screen.getByTestId("usage-corvo-proposals")).toHaveTextContent("4 of 6 resolved · 2 dismissed");
    const grams = within(screen.getByTestId("usage-corvo-ngrams")).getAllByRole("listitem");
    expect(grams[0]).toHaveTextContent("rutina 4 people");
  });

  it("empty period", () => {
    render(<CorvoPanel summary={corvoSummary(empty)} />);
    expect(screen.getByText("Nobody wrote to Corvo in this period.")).toBeInTheDocument();
  });
});

describe("RetentionTable", () => {
  it("one row per cohort, % per following week, sequential level per cell", () => {
    render(<RetentionTable data={latestRetention(days)} weekLabel={(w) => `wk ${w}`} />);
    const row = screen.getByTestId("usage-retention-2026-11-02");
    expect(row).toHaveTextContent("wk 2026-11-02");
    expect(screen.getByTestId("usage-retention-2026-11-02-0")).toHaveTextContent("100%");
    expect(screen.getByTestId("usage-retention-2026-11-02-0")).toHaveAttribute("data-level", "5");
    expect(screen.getByTestId("usage-retention-2026-11-02-1")).toHaveTextContent("50%");
    expect(screen.getByTestId("usage-retention-2026-11-02-1")).toHaveAttribute("data-level", "3");
    expect(screen.getByTestId("usage-retention-2026-11-02-2")).toHaveAttribute("title", "1 of 4");
    expect(screen.getByRole("columnheader", { name: "W2" })).toBeInTheDocument();
  });

  it("levels: 0 recedes to the surface, then 5 bins", () => {
    expect([0, 0.1, 0.3, 0.5, 0.7, 0.95].map(retentionLevel)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("no cohorts", () => {
    render(<RetentionTable data={null} weekLabel={(w) => w} />);
    expect(screen.getByText("No signup cohorts in the last 8 weeks yet.")).toBeInTheDocument();
  });
});

describe("charts", () => {
  it("every chart ships a table view with the same numbers", () => {
    render(
      <>
        <ActivityChart points={activitySeries(days)} />
        <SegmentsChart points={activitySeries(days)} />
        <FamiliesChart points={familySeries(days)} />
        <CorvoDailyChart points={corvoSummary(days).daily} />
      </>,
    );
    const activity = screen.getByTestId("usage-activity-table");
    expect(within(activity).getAllByRole("row")).toHaveLength(8); // header + 7 days (zero-filled)
    expect(within(activity).getByText(keys[6]).closest("tr")).toHaveTextContent(`${keys[6]}69201212`);
    const families = screen.getByTestId("usage-families-table");
    expect(within(families).getByRole("columnheader", { name: "Coach tools" })).toBeInTheDocument();
    expect(within(families).getByText(keys[6]).closest("tr")).toHaveTextContent(`${keys[6]}46050001`);
    expect(within(screen.getByTestId("usage-corvo-table")).getByText(keys[6]).closest("tr")).toHaveTextContent(`${keys[6]}52`);
    expect(screen.getByTestId("usage-segments-table")).toBeInTheDocument();
  });

  it("empty states instead of an empty plot", () => {
    render(
      <>
        <ActivityChart points={activitySeries(empty)} />
        <FamiliesChart points={familySeries(empty)} />
        <CorvoDailyChart points={corvoSummary(empty).daily} />
      </>,
    );
    expect(screen.getByText("No activity in this period.")).toBeInTheDocument();
    expect(screen.getByText("No feature usage in this period.")).toBeInTheDocument();
    expect(screen.getByText("Nobody wrote to Corvo in this period.")).toBeInTheDocument();
    expect(screen.queryByTestId("usage-activity-table")).toBeNull();
  });
});

describe("every label key exists (the dynamic t() calls of the page)", () => {
  type Node = string | { [k: string]: Node };
  const has = (cat: unknown, path: string) =>
    typeof path.split(".").reduce<Node | undefined>((n, k) => (n && typeof n === "object" ? n[k] : undefined), cat as Node) === "string";
  const keys = [
    ...FEATURE_KEYS.map((k) => `usageAdmin.features.${k}`),
    ...FEATURE_FAMILIES.map((k) => `usageAdmin.families.${k}`),
    ...CORVO_TOPICS.map((k) => `usageAdmin.topics.${k}`),
    ...["client", "coach"].map((k) => `usageAdmin.audience.${k}`),
    ...["coached", "coachless", "guest", "coach"].map((k) => `usageAdmin.charts.activity.${k}`),
  ];
  it.each([["en", enMessages], ["es", esMessages]])("%s", (_lang, cat) => {
    expect(keys.filter((k) => !has(cat, k))).toEqual([]);
  });
});
