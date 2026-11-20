// __tests__/notifications-feed.test.ts
//
// #507 — the feed model that used to live inside notifications/page.tsx. These
// pin the behaviour the page had before the split: renewal windows, the
// urgency sort, the unified newest-first order, filters and counts.

import type { BirthdayNotification } from "../birthday-notifications";
import type { HabitRow } from "../habit-actions";
import {
  addCivilDays,
  buildActivationNotifications,
  buildHabitRenewalNotifications,
  buildNotificationFeed,
  buildNotificationFilterItems,
  buildRenewalNotifications,
  buildWorkoutRenewalNotifications,
  daysBetweenCivilDates,
  duePriorityScore,
  filterNotificationFeed,
  formatClock,
  formatDueLabel,
  formatMeta,
  formatWorkoutElapsed,
  isoMs,
  parseWorkoutSeriesDetail,
  resolveNotificationFilter,
  type WorkoutActivityRow,
} from "../notifications-feed";
import type { PrNotification } from "../pr-notifications";

const TODAY = "2026-11-15";
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}(${JSON.stringify(values)})` : key;

function workoutRow(overrides: Partial<WorkoutActivityRow> & { id: string }): WorkoutActivityRow {
  return {
    kind: "workout_assignment",
    occurredAt: "2026-11-10T10:00:00.000Z",
    clientId: "c1",
    clientName: "Ana",
    title: "Push day",
    detail: "Lun · 8 fechas · 2026-11-01 a 2026-11-20",
    ...overrides,
  };
}

function habit(overrides: Partial<HabitRow> & { id: string }): HabitRow {
  return {
    clientId: "c1",
    trainerId: "t1",
    type: "boolean",
    name: { en: "Water", es: "Agua" },
    reminderEnabled: false,
    startsOn: "2026-11-10",
    endsOn: "2026-11-16",
    scheduleCadence: "daily",
    ...overrides,
  } as HabitRow;
}

describe("civil date helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addCivilDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCivilDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between civil dates (DST-proof)", () => {
    expect(daysBetweenCivilDates("2026-11-15", "2026-11-15")).toBe(0);
    expect(daysBetweenCivilDates("2026-11-15", "2026-11-18")).toBe(3);
    expect(daysBetweenCivilDates("2026-11-15", "2026-11-10")).toBe(-5);
    expect(daysBetweenCivilDates("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("isoMs treats null / garbage as 0", () => {
    expect(isoMs(null)).toBe(0);
    expect(isoMs("nope")).toBe(0);
    expect(isoMs("2026-11-15T00:00:00.000Z")).toBe(Date.UTC(2026, 10, 15));
  });
});

describe("resolveNotificationFilter", () => {
  it("accepts the four kinds and falls back to all", () => {
    expect(resolveNotificationFilter("prs")).toBe("prs");
    expect(resolveNotificationFilter("renewals")).toBe("renewals");
    expect(resolveNotificationFilter("activations")).toBe("activations");
    expect(resolveNotificationFilter("birthdays")).toBe("birthdays");
    expect(resolveNotificationFilter(undefined)).toBe("all");
    expect(resolveNotificationFilter("PRS")).toBe("all");
  });
});

describe("formatWorkoutElapsed", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatWorkoutElapsed(0)).toBe("0:00");
    expect(formatWorkoutElapsed(65)).toBe("1:05");
    expect(formatWorkoutElapsed(3600 + 2 * 60 + 3)).toBe("1:02:03");
  });
});

describe("parseWorkoutSeriesDetail", () => {
  it("reads the end of a range", () => {
    expect(parseWorkoutSeriesDetail("Lun · 8 fechas · 2026-11-01 a 2026-11-20")).toEqual({
      endDate: "2026-11-20",
    });
  });
  it("reads a single date", () => {
    expect(parseWorkoutSeriesDetail("Lun · 1 fechas · 2026-11-01")).toEqual({ endDate: "2026-11-01" });
  });
  it("rejects anything that is not a series detail", () => {
    expect(parseWorkoutSeriesDetail(null)).toBeNull();
    expect(parseWorkoutSeriesDetail("Asignó Push day")).toBeNull();
    expect(parseWorkoutSeriesDetail("a · b · 2026-11-01")).toBeNull();
    expect(parseWorkoutSeriesDetail("a · 3 fechas · mañana")).toBeNull();
  });
});

describe("due labels and priority", () => {
  it("labels today / future / past in both languages", () => {
    expect(formatDueLabel(TODAY, TODAY, "es")).toBe("Vence hoy");
    expect(formatDueLabel(TODAY, TODAY, "en")).toBe("Due today");
    expect(formatDueLabel("2026-11-16", TODAY, "es")).toBe("Vence en 1 día");
    expect(formatDueLabel("2026-11-18", TODAY, "en")).toBe("Due in 3 days");
    expect(formatDueLabel("2026-11-14", TODAY, "es")).toBe("Venció hace 1 día");
    expect(formatDueLabel("2026-11-10", TODAY, "en")).toBe("Expired 5 days ago");
  });

  it("orders overdue < today < soonest", () => {
    expect(duePriorityScore("2026-11-01", TODAY)).toBe(0);
    expect(duePriorityScore(TODAY, TODAY)).toBe(1);
    expect(duePriorityScore("2026-11-17", TODAY)).toBe(4);
  });
});

describe("formatClock / formatMeta", () => {
  it("formats in the coach's zone", () => {
    expect(formatClock("2026-11-15T02:30:00.000Z", "en", "UTC")).toBe(
      new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(new Date("2026-11-15T02:30:00.000Z")),
    );
    expect(formatClock(null, "es", "UTC")).toBe("Sin hora");
    expect(formatClock("garbage", "en", "UTC")).toBe("No time");
  });

  it("joins clock · client · secondary and drops the clock when there is no time", () => {
    expect(formatMeta(null, "Ana", "Vence hoy", "es", "UTC")).toBe("Ana · Vence hoy");
    const withClock = formatMeta("2026-11-15T02:30:00.000Z", "Ana", null, "en", "UTC");
    expect(withClock.endsWith(" · Ana")).toBe(true);
  });
});

describe("workout renewals", () => {
  it("keeps series ending within −7…+14 days, with the schedule deep link", () => {
    const rows = [
      workoutRow({ id: "in", detail: "Lun · 8 fechas · 2026-11-01 a 2026-11-20" }),
      workoutRow({ id: "too-late", detail: "Lun · 8 fechas · 2026-11-01 a 2026-11-30" }),
      workoutRow({ id: "too-old", detail: "Lun · 8 fechas · 2026-10-01 a 2026-11-07" }),
      workoutRow({ id: "edge-old", detail: "Lun · 8 fechas · 2026-10-01 a 2026-11-08" }),
      workoutRow({ id: "not-series", detail: "Asignó Push day" }),
      workoutRow({ id: "no-client", clientId: null, clientName: null }),
    ];
    const out = buildWorkoutRenewalNotifications(rows, TODAY, addCivilDays(TODAY, 14), "es");
    expect(out.map((n) => n.id)).toEqual(["in", "edge-old", "no-client"]);
    expect(out[0]).toMatchObject({
      kind: "workout",
      clientName: "Ana",
      dueDate: "2026-11-20",
      dueLabel: "Vence en 5 días",
      actionHref: "/gc-fitness/schedule?month=2026-11&clientIds=c1",
      actionLabel: "Abrir calendario",
    });
    expect(out[2]).toMatchObject({ clientName: "—", actionHref: "/gc-fitness/schedule" });
  });
});

describe("habit renewals", () => {
  it("keeps habits ending in 0…3 days and counts their scheduled dates", () => {
    const habits = [
      habit({ id: "h1" }),
      habit({ id: "h-past", endsOn: "2026-11-14" }),
      habit({ id: "h-far", endsOn: "2026-11-19" }),
      habit({ id: "h-open", endsOn: undefined }),
    ];
    const out = buildHabitRenewalNotifications(
      habits,
      TODAY,
      addCivilDays(TODAY, 14),
      "es",
      new Map([["c1", "Ana"]]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "habit:h1",
      kind: "habit",
      occurredAtISO: null,
      clientName: "Ana",
      title: "Agua",
      detail: "Recurrencia: daily · 7 fechas · 2026-11-10 a 2026-11-16",
      dueDate: "2026-11-16",
      dueLabel: "Vence en 1 día",
      actionHref: "/gc-fitness/habits/h1/edit",
      actionLabel: "Renovar hábito",
    });
  });

  it("falls back to the client id and the other language", () => {
    const out = buildHabitRenewalNotifications(
      [habit({ id: "h1", clientId: "zz", name: { en: "Water", es: "" } })],
      TODAY,
      addCivilDays(TODAY, 14),
      "es",
      new Map(),
    );
    expect(out[0]).toMatchObject({ clientName: "zz", title: "Water" });
  });
});

describe("buildRenewalNotifications", () => {
  it("sorts overdue first, then today, then soonest", () => {
    const out = buildRenewalNotifications({
      workoutActivityRows: [
        workoutRow({ id: "soon", detail: "Lun · 8 fechas · 2026-11-01 a 2026-11-20" }),
        workoutRow({ id: "overdue", detail: "Lun · 8 fechas · 2026-11-01 a 2026-11-12" }),
        workoutRow({ id: "today", detail: "Lun · 8 fechas · 2026-11-01 a 2026-11-15" }),
      ],
      habits: [habit({ id: "h", endsOn: "2026-11-17" })],
      todayCivil: TODAY,
      locale: "en",
      clientNameById: new Map(),
    });
    expect(out.map((n) => n.id)).toEqual(["overdue", "today", "habit:h", "soon"]);
  });
});

describe("buildActivationNotifications", () => {
  it("keeps signups only and links to the client", () => {
    const out = buildActivationNotifications(
      [
        { id: "a", category: "signup", eventAt: "2026-11-14T00:00:00.000Z", clientId: "c1", clientName: "Ana", detail: "d" },
        { id: "b", category: "workout", eventAt: null, clientId: "c2", clientName: "Bo", detail: "d" },
      ],
      "Open client",
    );
    expect(out).toEqual([
      {
        id: "a",
        occurredAtISO: "2026-11-14T00:00:00.000Z",
        clientId: "c1",
        clientName: "Ana",
        detail: "d",
        actionHref: "/gc-fitness/clients/c1",
        actionLabel: "Open client",
      },
    ]);
  });
});

describe("buildNotificationFeed", () => {
  const pr: PrNotification = {
    id: "pr1",
    occurredAtISO: "2026-11-14T12:00:00.000Z",
    clientId: "c1",
    clientName: "Ana",
    workoutName: "Push",
    prCount: 2,
    detail: "2 PRs",
    detailItems: ["Bench 100 kg"],
    workoutHref: "/w",
    chatHref: "/chat",
  };
  const birthday: BirthdayNotification = {
    id: "b1",
    clientId: "c2",
    clientName: "Bo",
    birthDate: "1990-11-15",
    title: "x",
    detail: "y",
    actionHref: "/gc-fitness/clients/c2",
    actionLabel: "Open",
    sortAtISO: "2026-11-15T00:00:00.000Z",
  };

  const feed = buildNotificationFeed({
    prNotifications: [pr],
    renewalNotifications: buildRenewalNotifications({
      workoutActivityRows: [workoutRow({ id: "r1", occurredAt: null })],
      habits: [],
      todayCivil: TODAY,
      locale: "es",
      clientNameById: new Map(),
    }),
    activationNotifications: buildActivationNotifications(
      [{ id: "a1", category: "signup", eventAt: "2026-11-13T00:00:00.000Z", clientId: "c3", clientName: "Cy", detail: "d" }],
      "openClient",
    ),
    birthdayNotifications: [birthday],
    locale: "es",
    timezone: "UTC",
    t,
  });

  it("merges every source newest first (renewals without a time sort at noon of their due date)", () => {
    expect(feed.map((n) => n.id)).toEqual(["r1", "b1", "pr1", "a1"]);
    expect(feed[0].sortAtISO).toBe("2026-11-20T12:00:00.000Z");
  });

  it("shapes each kind like the page did", () => {
    const byId = new Map(feed.map((n) => [n.id, n]));
    expect(byId.get("pr1")).toMatchObject({
      kind: "prs",
      tone: "success",
      title: 'prsCardTitle({"client":"Ana","count":2})',
      titleHref: "/gc-fitness/clients/c1",
      detailItems: ["Bench 100 kg"],
      actionHref: "/w",
      actionLabel: "openWorkout",
      secondaryActionHref: "/chat",
      secondaryActionLabel: "openChat",
      unread: true,
    });
    expect(byId.get("r1")).toMatchObject({ kind: "renewals", tone: "warning", meta: "Ana · Vence en 5 días" });
    expect(byId.get("a1")).toMatchObject({ kind: "activations", tone: "brand", title: "clientActivated", featured: true });
    expect(byId.get("b1")).toMatchObject({
      kind: "birthdays",
      tone: "violet",
      title: 'birthdayCardTitle({"client":"Bo"})',
      detail: 'birthdayCardDetail({"birthDate":"1990-11-15"})',
      featured: true,
    });
  });

  it("filters by kind and builds the filter chips with counts", () => {
    expect(filterNotificationFeed(feed, "all")).toBe(feed);
    expect(filterNotificationFeed(feed, "prs").map((n) => n.id)).toEqual(["pr1"]);
    const chips = buildNotificationFilterItems(
      { all: 4, prs: 1, renewals: 1, activations: 1, birthdays: 1 },
      t,
    );
    expect(chips.map((c) => [c.key, c.label, c.count, c.href])).toEqual([
      ["all", "filterAll", 4, "/gc-fitness/notifications"],
      ["prs", "filterPrs", 1, "/gc-fitness/notifications?type=prs"],
      ["renewals", "filterRenewals", 1, "/gc-fitness/notifications?type=renewals"],
      ["activations", "filterActivations", 1, "/gc-fitness/notifications?type=activations"],
      ["birthdays", "filterBirthdays", 1, "/gc-fitness/notifications?type=birthdays"],
    ]);
  });
});
