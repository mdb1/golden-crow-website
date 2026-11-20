// audit-feed-grouping.test.ts — «Admin · Monitoreo más claro: una fila por recurrencia».
//
// The fixtures are the literal prod shapes behind the owner's 2026-11-18 report:
//  - Ana Oller assigning «Día 3 / Juanma» to Juanma Portas seven times BY HAND, one per
//    Saturday, 13–32 s apart, no seriesId (coach_activity «Fecha: 2026-12-26» rows);
//  - the same sitting deleting the old Friday series one occurrence at a time (audit
//    rows sharing seriesId 6e7dd23c…, recurrence {weekly, weekday "5"});
//  - Mercedes losing several series (DIA 1/2/3) in one sitting.

import {
  auditSeriesHint,
  coachSeriesHint,
  groupFeedEntries,
  groupSeriesEvents,
  inferCadence,
  siblingSubjects,
  siblingTitleKey,
  type FeedSeriesHint,
  type GroupableEvent,
  type SeriesEntry,
  type SiblingsEntry,
} from "@/lib/gc-fitness/audit-feed-grouping";

const ANA = "6zf48DlYv0TtNz1FMQa0RhuGp2I2";
const JUANMA = "GM4V4XjN1CTghaZ17od1jKoKSVw2";
const MERCEDES = "merc-uid";

function ev(over: Partial<GroupableEvent> & { id: string; occurredAtISO: string }): GroupableEvent {
  return {
    source: "coach_activity",
    category: "schedule",
    action: "assign",
    subject: "Día 3 / Juanma",
    isDeletion: false,
    kind: "workout_assignment",
    clientUid: JUANMA,
    actor: { uid: ANA },
    client: { uid: JUANMA },
    series: null,
    ...over,
  };
}

function hint(over: Partial<FeedSeriesHint>): FeedSeriesHint {
  return {
    seriesId: null,
    templateId: null,
    dates: [],
    dateCount: 1,
    recurrence: null,
    cadenceText: null,
    ...over,
  };
}

/** The seven hand-made Saturday assigns, newest first (prod 2026-11-11T04:0x). */
const JUANMA_ASSIGNS: GroupableEvent[] = [
  ["2026-11-11T04:02:50.169Z", "2026-12-26"],
  ["2026-11-11T04:02:36.573Z", "2026-12-19"],
  ["2026-11-11T04:02:18.285Z", "2026-12-12"],
  ["2026-11-11T04:02:04.847Z", "2026-12-05"],
  ["2026-11-11T04:01:32.928Z", "2026-11-28"],
  ["2026-11-11T04:01:19.866Z", "2026-11-21"],
  ["2026-11-11T04:00:55.087Z", "2026-11-14"],
].map(([at, date]) =>
  ev({
    id: `coach_activity:asg:asg-${JUANMA}-${date.replace(/-/g, "")}-x`,
    occurredAtISO: at,
    series: coachSeriesHint(`asg:asg-${JUANMA}-${date.replace(/-/g, "")}-x`, `Fecha: ${date}`),
  }),
);

/** The old Friday series, deleted one occurrence at a time (audit rows). */
const FRIDAY_DELETES: GroupableEvent[] = [
  ["2026-11-11T04:05:05.546Z", "2026-12-25"],
  ["2026-11-11T04:04:55.250Z", "2026-12-18"],
  ["2026-11-11T04:04:25.207Z", "2026-12-11"],
  ["2026-11-11T04:04:13.654Z", "2026-12-04"],
  ["2026-11-11T04:03:53.016Z", "2026-11-27"],
  ["2026-11-11T04:03:42.197Z", "2026-11-20"],
  ["2026-11-11T04:03:18.094Z", "2026-11-13"],
].map(([at, date]) =>
  ev({
    id: `audit-del-${date}`,
    source: "audit_log",
    kind: "workout_assignments.delete",
    action: "delete",
    isDeletion: true,
    occurredAtISO: at,
    series: hint({
      seriesId: "6e7dd23c-01b1-4a69-9f1a-3fecec1ffa35",
      templateId: "tpl-ana-dia3",
      dates: [date],
      recurrence: { kind: "weekly", weekday: "5" },
    }),
  }),
);

describe("series — one row per recurrence", () => {
  it("folds seven hand-made single assigns of one routine (no seriesId) into ONE row", () => {
    const entries = groupFeedEntries(JUANMA_ASSIGNS);
    expect(entries).toHaveLength(1);
    const series = entries[0] as SeriesEntry<GroupableEvent>;
    expect(series.type).toBe("series");
    expect(series.head.id).toBe(JUANMA_ASSIGNS[0].id);
    expect(series.members).toHaveLength(7);
    expect(series.dateCount).toBe(7);
    expect(series.dates[0]).toBe("2026-11-14");
    expect(series.dates[6]).toBe("2026-12-26");
    // Every 7 days from a Saturday ⇒ «semanal (sábados)».
    expect(series.cadence).toEqual({ kind: "weekly", weekdays: [6] });
  });

  it("folds a series by its shared seriesId and reads the cadence from the rule", () => {
    const entries = groupFeedEntries(FRIDAY_DELETES);
    expect(entries).toHaveLength(1);
    const series = entries[0] as SeriesEntry<GroupableEvent>;
    expect(series.type).toBe("series");
    expect(series.dateCount).toBe(7);
    expect(series.cadence).toEqual({ kind: "weekly", weekdays: [5] });
  });

  it("keeps the creations and the deletions of one sitting apart (mixed ops never merge)", () => {
    const entries = groupFeedEntries([...FRIDAY_DELETES, ...JUANMA_ASSIGNS]);
    expect(entries.map((e) => e.type)).toEqual(["series", "series"]);
    const [deletes, assigns] = entries as Array<SeriesEntry<GroupableEvent>>;
    expect(deletes.members.every((m) => m.action === "delete")).toBe(true);
    expect(assigns.members.every((m) => m.action === "assign")).toBe(true);
  });

  it("never merges two different seriesIds, even for the same routine name", () => {
    const a = ev({
      id: "a",
      occurredAtISO: "2026-11-11T04:00:10.000Z",
      series: hint({ seriesId: "s-1", dates: ["2026-11-14"] }),
    });
    const b = ev({
      id: "b",
      occurredAtISO: "2026-11-11T04:00:00.000Z",
      series: hint({ seriesId: "s-2", dates: ["2026-11-21"] }),
    });
    expect(groupSeriesEvents([a, b]).map((e) => e.type)).toEqual(["event", "event"]);
  });

  it("does not merge different clients", () => {
    const other = JUANMA_ASSIGNS.map((e, i) =>
      i % 2 === 0 ? { ...e, clientUid: "other", client: { uid: "other" } } : e,
    );
    const series = groupSeriesEvents(other);
    // Juanma's 3 and the other client's 4 — two rows, neither absorbs the other.
    expect(series).toHaveLength(2);
    for (const entry of series) {
      expect(entry.type).toBe("series");
      const s = entry as SeriesEntry<GroupableEvent>;
      expect(new Set(s.members.map((m) => m.clientUid)).size).toBe(1);
    }
  });

  it("does not merge different actors", () => {
    const mixed = JUANMA_ASSIGNS.map((e, i) => (i === 0 ? { ...e, actor: { uid: "someone-else" } } : e));
    const series = groupSeriesEvents(mixed);
    expect(series.map((e) => e.type)).toEqual(["event", "series"]);
  });

  it("does not merge different routines into a series", () => {
    const series = groupSeriesEvents([
      ev({ id: "d1", occurredAtISO: "2026-11-11T04:00:30.000Z", subject: "Día 1" }),
      ev({ id: "d2", occurredAtISO: "2026-11-11T04:00:20.000Z", subject: "Día 2" }),
    ]);
    expect(series.map((e) => e.type)).toEqual(["event", "event"]);
  });

  it("splits the fallback when the writes are too far apart to be one sitting", () => {
    const series = groupSeriesEvents([
      ev({ id: "late", occurredAtISO: "2026-11-11T05:00:00.000Z" }),
      ev({ id: "early", occurredAtISO: "2026-11-11T04:00:00.000Z" }),
    ]);
    expect(series.map((e) => e.type)).toEqual(["event", "event"]);
  });

  it("leaves day moves out of the series fold (#785: each move keeps its own dates)", () => {
    const moves = groupSeriesEvents([
      ev({ id: "m1", action: "move", kind: "workout_assignments.update", occurredAtISO: "2026-11-11T04:00:30.000Z" }),
      ev({ id: "m2", action: "move", kind: "workout_assignments.update", occurredAtISO: "2026-11-11T04:00:20.000Z" }),
    ]);
    expect(moves.map((e) => e.type)).toEqual(["event", "event"]);
  });

  it("does not infer a cadence from irregular dates (prod: Agos 6, 9, 18, 27, 30 nov)", () => {
    expect(inferCadence(["2026-11-06", "2026-11-09", "2026-11-18", "2026-11-27", "2026-11-30"])).toBeNull();
    expect(inferCadence(["2026-11-01", "2026-11-02", "2026-11-03"])).toEqual({ kind: "daily" });
    expect(inferCadence(["2026-11-01", "2026-11-04", "2026-11-07"])).toEqual({ kind: "everyN", n: 3 });
    expect(inferCadence(["2026-11-14", "2026-11-21"])).toBeNull();
  });
});

describe("siblings — one row per sitting", () => {
  const mercedesDeletes = ["DIA 1 / Musculación / Mer", "DIA 2 / Musculación / Mer", "DIA 3 / Musculación / Mer"].map(
    (subject, i) =>
      ev({
        id: `merc-${i}`,
        subject,
        action: "delete",
        isDeletion: true,
        clientUid: MERCEDES,
        client: { uid: MERCEDES },
        occurredAtISO: `2026-11-10T15:0${5 - i}:00.000Z`,
        series: coachSeriesHint(`asg:series-${i}`, "Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14"),
      }),
  );

  it("collapses several series deleted for one client in one sitting", () => {
    const entries = groupFeedEntries(mercedesDeletes);
    expect(entries).toHaveLength(1);
    const group = entries[0] as SiblingsEntry<GroupableEvent>;
    expect(group.type).toBe("siblings");
    expect(group.itemCount).toBe(3);
    expect(group.head.id).toBe("merc-0");
    expect(siblingTitleKey(group.head.category, group.head.action, group.head.isDeletion)).toBe("workoutsDeleted");
    expect(siblingSubjects(group, 2)).toEqual({
      names: ["DIA 1 / Musculación / Mer", "DIA 2 / Musculación / Mer"],
      more: 1,
    });
  });

  it("does not collapse another client's row into the sitting", () => {
    const withOther = [
      ...mercedesDeletes.slice(0, 2),
      { ...mercedesDeletes[2], clientUid: "someone", client: { uid: "someone" } },
    ];
    expect(groupFeedEntries(withOther).map((e) => e.type)).toEqual(["siblings", "event"]);
  });

  it("does not collapse different ops", () => {
    const mixed = [mercedesDeletes[0], { ...mercedesDeletes[1], action: "assign" as const, isDeletion: false }];
    expect(groupFeedEntries(mixed).map((e) => e.type)).toEqual(["event", "event"]);
  });

  it("needs an actor: unattributed writes are nobody's sitting", () => {
    const anon = mercedesDeletes.map((e) => ({ ...e, actor: null }));
    expect(groupFeedEntries(anon).map((e) => e.type)).toEqual(["event", "event", "event"]);
  });

  it("can hold a series as one of its items, and counts every event inside", () => {
    const sitting = [
      ...JUANMA_ASSIGNS,
      ev({ id: "dia1", subject: "Día 1 / Juanma", occurredAtISO: "2026-11-11T04:00:30.000Z" }),
    ].sort((a, b) => b.occurredAtISO!.localeCompare(a.occurredAtISO!));
    const entries = groupFeedEntries(sitting);
    expect(entries).toHaveLength(1);
    const group = entries[0] as SiblingsEntry<GroupableEvent>;
    expect(group.type).toBe("siblings");
    expect(group.members.map((m) => m.type)).toEqual(["series", "event"]);
    expect(group.itemCount).toBe(2);
    expect(group.eventCount).toBe(8);
  });

  it("keeps unrelated rows in their place", () => {
    const finish = ev({
      id: "finish",
      category: "workout",
      kind: "workout_logs.create",
      action: "create",
      actor: { uid: JUANMA },
      occurredAtISO: "2026-11-11T04:01:00.000Z",
    });
    const entries = groupFeedEntries([...JUANMA_ASSIGNS.slice(0, 4), finish, ...JUANMA_ASSIGNS.slice(4)]);
    expect(entries.map((e) => e.type)).toEqual(["series", "event"]);
    expect(entries[1].id).toBe("finish");
  });
});

describe("hints", () => {
  it("reads a coach single assign and a coach series detail", () => {
    expect(coachSeriesHint("asg:asg-uid-20261226-abc", "Fecha: 2026-12-26")).toEqual({
      seriesId: null,
      templateId: null,
      dates: ["2026-12-26"],
      dateCount: 1,
      recurrence: null,
      cadenceText: null,
    });
    expect(
      coachSeriesHint("asg:0d8da0e8", "Recurrencia: semanal · 4 fechas · 2026-11-13 a 2026-12-04"),
    ).toEqual({
      seriesId: "0d8da0e8",
      templateId: null,
      dates: ["2026-11-13", "2026-12-04"],
      dateCount: 4,
      recurrence: null,
      cadenceText: "semanal",
    });
  });

  it("reads an audit write: seriesId, template, the group's dates", () => {
    expect(
      auditSeriesHint({
        after: null,
        before: { seriesId: "s1", scheduledFor: "2026-12-25", recurrence: { kind: "weekly", weekday: 5 } },
        templateId: "tpl",
        groupDates: [],
        docDate: "20261225",
        count: 1,
      }),
    ).toMatchObject({ seriesId: "s1", templateId: "tpl", dates: ["2026-12-25"], dateCount: 1 });
    expect(
      auditSeriesHint({
        after: { seriesId: "s1" },
        before: null,
        templateId: null,
        groupDates: ["20261113", "20261120"],
        docDate: "20261113",
        count: 2,
      }),
    ).toMatchObject({ dates: ["2026-11-13", "2026-11-20"], dateCount: 2 });
  });

  it("does not infer a cadence when only the span ends are known", () => {
    const a = ev({
      id: "a",
      occurredAtISO: "2026-11-11T04:00:10.000Z",
      series: coachSeriesHint("asg:s1", "Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14"),
    });
    const b = ev({
      id: "b",
      occurredAtISO: "2026-11-11T04:00:00.000Z",
      series: coachSeriesHint("asg:s1", "Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14"),
    });
    const [entry] = groupSeriesEvents([a, b]) as Array<SeriesEntry<GroupableEvent>>;
    expect(entry.cadence).toEqual({ kind: "text", text: "semanal" });
  });
});
