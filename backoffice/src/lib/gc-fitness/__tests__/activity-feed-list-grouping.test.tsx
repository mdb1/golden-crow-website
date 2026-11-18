/**
 * @jest-environment jsdom
 */

// activity-feed-list-grouping.test.tsx — «Admin · Monitoreo más claro: una fila por
// recurrencia». The owner's report, rendered: seven hand-made Saturday assigns read as
// ONE row with the cadence, the count and the span, and the dates are one click away;
// a sitting of deletions on one client reads as «eliminó 3 workouts».
// (The harness runs next-intl in English.)

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import { ActivityFeedList } from "@/app/gc-fitness/admin/audit/_components/ActivityFeedList";
import type { ActivityFeedEvent } from "@/lib/gc-fitness/activity-feed-actions";
import { coachSeriesHint } from "@/lib/gc-fitness/audit-feed-grouping";

const ana = { uid: "ana", name: "Ana Oller", email: "ana@x.com", role: "coach" as const, href: "/u/ana" };
const juanma = { uid: "juanma", name: "Juanma Portas", email: "j@x.com", role: "client" as const, href: "/u/juanma" };
const mercedes = { uid: "merc", name: "Mercedes", email: "m@x.com", role: "client" as const, href: "/u/merc" };

function event(over: Partial<ActivityFeedEvent> & { id: string }): ActivityFeedEvent {
  return {
    source: "coach_activity",
    category: "schedule",
    significance: "key",
    action: "assign",
    occurredAtISO: "2026-11-11T04:00:00.000Z",
    title: "Asignó un workout",
    subject: "Día 3 / Juanma",
    meta: [],
    actor: ana,
    client: juanma,
    href: "/u/juanma",
    isDeletion: false,
    kind: "workout_assignment",
    clientUid: "juanma",
    correlation: null,
    ...over,
  };
}

const SATURDAYS = ["2026-12-26", "2026-12-19", "2026-12-12", "2026-12-05", "2026-11-28", "2026-11-21", "2026-11-14"];

const juanmaAssigns = SATURDAYS.map((date, i) =>
  event({
    id: `asg-${date}`,
    occurredAtISO: new Date(Date.parse("2026-11-11T04:02:50.000Z") - i * 20_000).toISOString(),
    meta: [`Fecha: ${date}`],
    series: coachSeriesHint(`asg:asg-juanma-${date.replace(/-/g, "")}-x`, `Fecha: ${date}`),
  }),
);

const NOW = Date.parse("2026-11-11T05:00:00.000Z");

describe("ActivityFeedList — one row per recurrence", () => {
  it("renders seven hand-made assigns as ONE row: cadence · 7 dates · span", () => {
    render(
      <ActivityFeedList
        events={juanmaAssigns}
        today="2026-11-11"
        timeZone="America/Argentina/Buenos_Aires"
        nowMs={NOW}
      />,
    );
    const rows = screen.getAllByTestId("feed-series-row");
    expect(rows).toHaveLength(1);
    expect(screen.queryAllByTestId("feed-row")).toHaveLength(0);
    const row = rows[0];
    expect(within(row).getByRole("link", { name: "Ana Oller" })).toBeInTheDocument();
    expect(within(row).getByText("assigned a workout")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Día 3 / Juanma" })).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Juanma Portas" })).toBeInTheDocument();
    expect(within(row).getByText("weekly (Saturdays)")).toBeInTheDocument();
    expect(within(row).getByText(/7 dates/)).toBeInTheDocument();
    expect(within(row).getByText(/Nov 14 → Dec 26, 2026/)).toBeInTheDocument();

    // Expandable to every date (native <details>, so it works without JS).
    const dates = within(row).getByTestId("feed-series-dates");
    expect(within(dates).getAllByRole("listitem")).toHaveLength(7);
    expect(within(dates).getByText("Nov 14, 2026")).toBeInTheDocument();
    expect(within(dates).getByText("Dec 26, 2026")).toBeInTheDocument();
    expect(row.querySelector("details summary")).not.toBeNull();
    // The day separator counts the events, not the rows.
    expect(screen.getByRole("heading", { name: /^Today/ })).toHaveTextContent("7 events");
  });

  it("collapses a sitting of deletions on one client into «deleted 3 workouts»", () => {
    const deletes = ["DIA 1 / Musculación / Mer", "DIA 2 / Musculación / Mer", "DIA 3 / Musculación / Mer"].map(
      (subject, i) =>
        event({
          id: `del-${i}`,
          subject,
          action: "delete",
          isDeletion: true,
          title: "Eliminó un workout agendado",
          client: mercedes,
          clientUid: "merc",
          occurredAtISO: `2026-11-10T15:0${5 - i}:00.000Z`,
          meta: ["Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14"],
          series: coachSeriesHint(`asg:series-${i}`, "Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14"),
        }),
    );
    render(<ActivityFeedList events={deletes} today="2026-11-11" nowMs={NOW} />);
    const row = screen.getByTestId("feed-siblings-row");
    expect(within(row).getByText("deleted 3 workouts")).toBeInTheDocument();
    expect(within(row).getByText(/DIA 1 \/ Musculación \/ Mer, DIA 2/)).toBeInTheDocument();
    expect(within(row).getByText("×3")).toBeInTheDocument();
    const items = within(row).getByTestId("feed-siblings-items");
    // Every original row stays reachable, with its dates humanized.
    expect(within(items).getAllByTestId("feed-row")).toHaveLength(3);
    expect(within(items).getAllByText(/Jul 10, 2026 a Aug 14, 2026/)).toHaveLength(3);
    // Deletions keep their distinct, legible look: destructive rule + tint.
    expect(row.querySelector("summary")).toHaveClass("border-l-destructive", "bg-destructive/5");
  });

  it("does not fold when grouping is off", () => {
    render(<ActivityFeedList events={juanmaAssigns} today="2026-11-11" grouped={false} nowMs={NOW} />);
    expect(screen.getAllByTestId("feed-row")).toHaveLength(7);
    // …and the meta dates still read as dates, not ISO.
    expect(screen.getByText("Fecha: Dec 26, 2026")).toBeInTheDocument();
  });

  it("shows the relative time next to the clock time", () => {
    render(<ActivityFeedList events={[juanmaAssigns[0]]} today="2026-11-11" nowMs={NOW} />);
    expect(screen.getByText("04:02")).toBeInTheDocument();
    expect(screen.getByTestId("feed-row-relative")).toHaveTextContent(/57 min\.? ago/);
  });

  it("renders the compact density with tighter rows", () => {
    render(<ActivityFeedList events={[juanmaAssigns[0]]} today="2026-11-11" density="compact" nowMs={NOW} />);
    expect(screen.getByTestId("feed-row")).toHaveClass("py-1.5");
  });

  it("offers a way out of an empty, filtered feed", () => {
    render(
      <ActivityFeedList events={[]} today="2026-11-11" emptyLabel="Nada por acá." clearHref="/gc-fitness/admin/audit?tab=timeline" />,
    );
    const empty = screen.getByTestId("feed-empty");
    expect(within(empty).getByText("Nada por acá.")).toBeInTheDocument();
    expect(within(empty).getByText("Try widening the date range or clearing the filters.")).toBeInTheDocument();
    expect(within(empty).getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/gc-fitness/admin/audit?tab=timeline",
    );
  });
});
