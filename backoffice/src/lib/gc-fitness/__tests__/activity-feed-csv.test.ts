// #503 — the admin activity feed CSV.
import type { ActivityFeedEvent } from "../activity-feed-actions";
import { ACTIVITY_CSV_HEADERS, buildActivityFeedCsv } from "../activity-feed-csv";

function event(overrides: Partial<ActivityFeedEvent> = {}): ActivityFeedEvent {
  return {
    id: "e1",
    source: "coach_activity",
    category: "workout",
    significance: "normal",
    action: "create",
    occurredAtISO: "2026-11-14T02:30:00.000Z",
    title: "Terminó un workout",
    subject: "Full Body A",
    meta: ["1 h 2 min", "6.410 kg"],
    actor: { uid: "c1", name: "Manolo", email: "m@x.com", role: "client", href: null },
    client: null,
    href: null,
    isDeletion: false,
    kind: "workout_logs",
    clientUid: "c1",
    correlation: null,
    ...overrides,
  } as ActivityFeedEvent;
}

describe("buildActivityFeedCsv", () => {
  it("starts with a BOM and the header row", () => {
    const csv = buildActivityFeedCsv([], "UTC");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")[0]).toBe(ACTIVITY_CSV_HEADERS.join(","));
  });

  it("writes the UTC instant AND the wall clock in the page's zone", () => {
    const [, row] = buildActivityFeedCsv([event()], "America/Argentina/Buenos_Aires").slice(1).split("\r\n");
    expect(row.startsWith("2026-11-14T02:30:00.000Z,2026-11-13 23:30:00,workout,create,")).toBe(true);
    expect(row).toContain("Manolo,m@x.com,c1");
    expect(row).toContain("1 h 2 min · 6.410 kg");
  });

  it("quotes commas and neutralises spreadsheet formulas", () => {
    const [, row] = buildActivityFeedCsv(
      [event({ title: "=HYPERLINK(\"x\")", subject: "Pierna, glúteo" })],
      "UTC",
    ).slice(1).split("\r\n");
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain(`"Pierna, glúteo"`);
  });
});
