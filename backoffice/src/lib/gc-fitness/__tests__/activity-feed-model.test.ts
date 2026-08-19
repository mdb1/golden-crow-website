// __tests__/activity-feed-model.test.ts
//
// Pure tests for the raw-write → human-event translation behind the admin
// Monitoring & Observability feed (issue #671). Every case here is a shape that
// was READ OFF PRODUCTION `audit_log` while designing the feed, so the fixtures
// are the real wire payloads (including the trigger's `[omitted: N chars]`
// elision of `templateSnapshot`).

import {
  describeNutritionMarks,
  summarizeNutritionMarks,
  classifyAuditRecord,
  coachActivityKeysFor,
  findDuplicateCoachEventIds,
  isAutoExtendedOccurrence,
  durationLabel,
  habitFrequencyLabel,
  isElided,
  isRecurringAssignment,
  mergeWorkoutWriteBacks,
  occurrenceDateFromId,
  recurrenceChangeLabel,
  recurrenceDescribe,
  recurrenceLabel,
  volumeLabel,
  type AuditRecord,
  type CrossSourceRow,
  type MergeableEvent,
} from "@/lib/gc-fitness/activity-feed-model";

const CLIENT = "oi1SgX6oBPehdHf7f8B86yqXS0L2";
const COACH = "6zf48DlYv0TtNz1FMQa0RhuGp2I2";

function record(over: Partial<AuditRecord>): AuditRecord {
  return {
    id: "audit_log:x",
    collection: "workout_assignments",
    docId: "asg-x-20260821-self-DF2F1298-1535-40FE-9499-DFA0847D02DC",
    op: "update",
    changedFields: [],
    changedFieldCount: 0,
    before: null,
    after: null,
    actorUid: null,
    trainerId: null,
    coachId: null,
    clientId: null,
    occurredAtISO: "2026-07-31T20:37:02.331Z",
    ...over,
  };
}

describe("value labels", () => {
  it("formats durations and volumes", () => {
    expect(durationLabel(3743)).toBe("1 h 2 min");
    expect(durationLabel(900)).toBe("15 min");
    expect(durationLabel(3600)).toBe("1 h");
    expect(durationLabel(0)).toBeNull();
    expect(durationLabel(undefined)).toBeNull();
    // Numeric strings survive a JSON round-trip of the capture.
    expect(durationLabel("3743")).toBe("1 h 2 min");
    expect(volumeLabel(6410)).toContain("6");
    expect(volumeLabel(0)).toBeNull();
  });

  it("detects the trigger's elision marker", () => {
    expect(isElided("[omitted: 2107 chars]")).toBe(true);
    expect(isElided("Full Body A")).toBe(false);
    expect(isElided(null)).toBe(false);
  });

  it("labels workout recurrences (JS weekday convention, Sun=0)", () => {
    expect(recurrenceLabel({ kind: "weekly", weekday: 1 })).toBe(
      "todas las semanas (lun)",
    );
    expect(recurrenceLabel({ kind: "weekly_days", weekdays: [1, 3] })).toBe(
      "semanal (lun, mié)",
    );
    expect(recurrenceLabel({ kind: "daily" })).toBe("todos los días");
    expect(recurrenceLabel({ kind: "every_n_days", everyN: 3 })).toBe("cada 3 días");
    expect(recurrenceLabel({ kind: "monthly", dayOfMonth: 5 })).toBe(
      "todos los meses (día 5)",
    );
    expect(recurrenceLabel({ kind: "single" })).toBeNull();
    expect(recurrenceLabel(null)).toBeNull();
  });

  it("labels habit frequencies (ISO weekday convention, Mon=1)", () => {
    expect(habitFrequencyLabel({ scheduleCadence: "daily" })).toBe("diario");
    expect(
      habitFrequencyLabel({ scheduleCadence: "weekly", scheduleWeekdays: [1, 5] }),
    ).toBe("semanal (lun, vie)");
    expect(
      habitFrequencyLabel({ scheduleCadence: "monthly", scheduleDayOfMonth: 3 }),
    ).toBe("mensual (día 3)");
    expect(
      habitFrequencyLabel({ scheduleType: "one-time", startsOn: "2026-07-30" }),
    ).toBe("una vez (2026-07-30)");
  });

  it("reads the occurrence date out of an assignment id", () => {
    expect(occurrenceDateFromId("asg-uid-20260821-self-DF2F1298")).toBe("2026-08-21");
    expect(occurrenceDateFromId("log-1")).toBeNull();
  });
});

describe("classifyAuditRecord — workouts", () => {
  it("reads a finished workout out of the workout_logs create", () => {
    const event = classifyAuditRecord(
      record({
        collection: "workout_logs",
        docId: "log-asg-1",
        op: "create",
        changedFields: ["status", "duration_seconds", "total_volume_kg"],
        after: {
          status: "completed",
          duration_seconds: 3743,
          total_volume_kg: 6410,
          templateSnapshot: "[omitted: 2107 chars]",
        },
        clientId: CLIENT,
        trainerId: CLIENT,
      }),
    );

    expect(event.category).toBe("workout");
    expect(event.title).toBe("Terminó un workout");
    expect(event.correlation).toBe("workout_finished");
    expect(event.isSelfService).toBe(true);
    expect(event.meta).toContain("1 h 2 min");
    // The name lives in the ELIDED templateSnapshot → the reader must hydrate it.
    expect(event.subject).toBeNull();
    expect(event.subjectRef).toEqual({ collection: "workout_logs", id: "log-asg-1" });
    expect(event.target).toEqual({
      kind: "workoutLog",
      logId: "log-asg-1",
      clientId: CLIENT,
    });
  });

  it("attributes a COACHED client's session to the client, not to their coach", () => {
    // The regression: `trainerId` is stamped on every coach-owned doc, so the
    // feed read "Ana Oller terminó un workout" about her client's session.
    const event = classifyAuditRecord(
      record({
        collection: "workout_logs",
        docId: "log-2",
        op: "create",
        changedFields: ["status"],
        after: { status: "completed" },
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(event.actorUid).toBe("ailen");
    expect(event.isSelfService).toBe(false);
  });

  it("honours an explicit actor stamp over any inference", () => {
    const event = classifyAuditRecord(
      record({
        collection: "workout_logs",
        op: "create",
        changedFields: ["status"],
        after: { status: "completed" },
        actorUid: "someone-else",
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(event.actorUid).toBe("someone-else");
  });

  it("treats per-set / RPE log updates as low-signal noise", () => {
    const event = classifyAuditRecord(
      record({
        collection: "workout_logs",
        op: "update",
        changedFields: ["rpe", "updatedAt"],
        after: { rpe: 8 },
        clientId: CLIENT,
      }),
    );
    expect(event.significance).toBe("low");
  });
});

describe("classifyAuditRecord — scheduling", () => {
  it("distinguishes a self-assignment from a coach assignment and names the recurrence", () => {
    const selfAssigned = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["selfAssigned", "recurrence", "scheduledFor"],
        after: {
          selfAssigned: true,
          scheduledFor: "2026-07-30",
          templateId: "tpl-1",
          recurrence: { kind: "weekly", weekday: 4 },
        },
        clientId: CLIENT,
        trainerId: CLIENT,
      }),
    );
    expect(selfAssigned.title).toBe("Se asignó un workout");
    expect(selfAssigned.meta).toContain("todas las semanas (jue)");
    expect(selfAssigned.subjectRef).toEqual({
      collection: "workout_templates",
      id: "tpl-1",
    });

    const byCoach = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["recurrence"],
        after: { scheduledFor: "2026-07-27", templateId: "tpl-2", recurrence: { kind: "daily" } },
        clientId: "client9",
        trainerId: COACH,
      }),
    );
    expect(byCoach.title).toBe("Asignó un workout");
    expect(byCoach.isSelfService).toBe(false);
  });

  // ── The one-day assignment does not start anything ─────────────────────
  //
  // Reported on #697: the feed read "Manolo se asignó un workout · desde
  // 2026-08-02" for an assignment that was ONE day. "desde" promises dates
  // after it.
  it("says a one-off assignment's date bare, and only a series gets a 'desde'", () => {
    const oneOff = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["selfAssigned", "scheduledFor", "templateId"],
        after: { selfAssigned: true, scheduledFor: "2026-08-02", templateId: "tpl-1" },
        clientId: CLIENT,
        trainerId: CLIENT,
      }),
    );
    expect(oneOff.title).toBe("Se asignó un workout");
    expect(oneOff.meta).toEqual(["2026-08-02"]);

    // An explicit `.single` map is the same one day, spelled out.
    const single = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["scheduledFor", "recurrence"],
        after: {
          scheduledFor: "2026-08-02",
          templateId: "tpl-1",
          recurrence: { kind: "single" },
        },
        clientId: "client9",
        trainerId: COACH,
      }),
    );
    expect(single.meta).toEqual(["2026-08-02"]);

    // A real series keeps it: there IS something after that date.
    const series = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["scheduledFor", "recurrence"],
        after: {
          scheduledFor: "2026-08-05",
          templateId: "tpl-1",
          recurrence: { kind: "weekly", weekday: 3 },
        },
        clientId: "client9",
        trainerId: COACH,
      }),
    );
    expect(series.meta).toContain("desde 2026-08-05");
  });

  it("drops the head's own date when the collapsed group already spells the span", () => {
    // Groups keep input order (newest-first), so the head's `scheduledFor` is
    // usually the LAST occurrence — "desde <last>" named the wrong end.
    const collapsed = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["scheduledFor", "recurrence"],
        after: {
          scheduledFor: "2026-10-28",
          templateId: "tpl-1",
          recurrence: { kind: "weekly", weekday: 3 },
        },
        clientId: "client9",
        trainerId: COACH,
      }),
      { count: 12, dates: ["20260805", "20261028"] },
    );
    expect(collapsed.meta).toEqual(["todas las semanas (mié)", "2026-08-05 → 2026-10-28"]);
    expect(collapsed.meta.some((m) => m.includes("desde"))).toBe(false);
  });

  it("reads an unknown recurrence kind as a series, not as a one-off", () => {
    // `recurrenceLabel` returns null for a kind it doesn't know — which is why
    // the "is this a series?" question gets its own predicate.
    expect(recurrenceLabel({ kind: "biweekly" })).toBeNull();
    expect(isRecurringAssignment({ kind: "biweekly" })).toBe(true);
    expect(isRecurringAssignment({ kind: "single" })).toBe(false);
    expect(isRecurringAssignment(undefined)).toBe(false);
  });

  // ── #682 — the automatic horizon renewal ───────────────────────────────
  //
  // A recurring self-routine materializes 90 days of real docs and the app
  // silently writes the next batch once the tail drops under 45 days
  // (`topUpRecurringSelfSeries`). The payload is indistinguishable from the
  // original create EXCEPT that it carries the ORIGINAL `scheduleStartCivil`
  // anchor onto docs written months later — which is the whole tell.
  it("calls the app's horizon renewal what it is, and credits nobody with it", () => {
    const renewal = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["scheduleStartCivil", "selfAssigned", "recurrence", "scheduledFor"],
        after: {
          selfAssigned: true,
          templateId: "tpl-1",
          scheduledFor: "2026-10-15",
          scheduleStartCivil: "2026-04-02",
          recurrence: { kind: "weekly", weekday: 4 },
        },
        clientId: CLIENT,
        trainerId: CLIENT,
        occurredAtISO: "2026-07-31T20:37:02.331Z",
      }),
      { count: 12, dates: ["20261015", "20261022"] },
    );
    expect(renewal.title).toBe("Se extendió sola una rutina recurrente");
    // Nobody did this. Crediting the athlete would put an assignment they never
    // made under their name, months after they scheduled the routine.
    expect(renewal.actorUid).toBeNull();
    expect(renewal.meta).toContain("serie desde 2026-04-02");
    expect(renewal.meta).toContain("renovación automática del horizonte");
  });

  it("still calls a real scheduling an assignment when the anchor is today's", () => {
    const scheduled = classifyAuditRecord(
      record({
        op: "create",
        changedFields: ["scheduleStartCivil", "selfAssigned", "recurrence", "scheduledFor"],
        after: {
          selfAssigned: true,
          templateId: "tpl-1",
          scheduledFor: "2026-07-31",
          scheduleStartCivil: "2026-07-31",
          recurrence: { kind: "weekly", weekday: 5 },
        },
        clientId: CLIENT,
        trainerId: CLIENT,
        occurredAtISO: "2026-07-31T20:37:02.331Z",
      }),
    );
    expect(scheduled.title).toBe("Se asignó un workout");
    expect(scheduled.actorUid).toBe(CLIENT);
  });

  it("never mistakes a coach assignment or a one-off for a renewal", () => {
    // A `.single` self-assignment carries no recurrence map at all, and a coach
    // assignment is not `selfAssigned` — neither is ever topped up.
    const single = record({
      op: "create",
      after: {
        selfAssigned: true,
        scheduledFor: "2026-10-15",
        scheduleStartCivil: "2026-04-02",
      },
      clientId: CLIENT,
      trainerId: CLIENT,
    });
    const byCoach = record({
      op: "create",
      after: {
        scheduledFor: "2026-10-15",
        scheduleStartCivil: "2026-04-02",
        recurrence: { kind: "weekly", weekday: 4 },
      },
      clientId: "client9",
      trainerId: COACH,
    });
    expect(isAutoExtendedOccurrence(single)).toBe(false);
    expect(isAutoExtendedOccurrence(byCoach)).toBe(false);
    // One day of drift between the doc's civil dates (client timezone) and
    // `occurredAt` (UTC) must not read as a renewal.
    expect(
      isAutoExtendedOccurrence(
        record({
          op: "create",
          after: {
            selfAssigned: true,
            scheduledFor: "2026-08-01",
            scheduleStartCivil: "2026-07-30",
            recurrence: { kind: "daily" },
          },
          occurredAtISO: "2026-07-31T02:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("reports a re-scheduled workout as a move with both dates", () => {
    const event = classifyAuditRecord(
      record({
        changedFields: ["scheduledFor", "updatedAt"],
        before: { scheduledFor: "2026-08-01" },
        after: { scheduledFor: "2026-08-03", templateId: "tpl-1" },
        clientId: CLIENT,
      }),
    );
    expect(event.action).toBe("move");
    expect(event.title).toBe("Movió un workout de día");
    expect(event.meta[0]).toBe("2026-08-01 → 2026-08-03");
  });

  it("credits a move to the athlete only when iOS stamped originallyScheduledFor", () => {
    const byAthlete = classifyAuditRecord(
      record({
        changedFields: ["scheduledFor", "originallyScheduledFor", "updatedAt"],
        before: { scheduledFor: "2026-08-01" },
        after: { scheduledFor: "2026-08-03", originallyScheduledFor: "2026-08-01" },
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(byAthlete.actorUid).toBe("ailen");

    const byCoach = classifyAuditRecord(
      record({
        changedFields: ["scheduledFor", "updatedAt"],
        before: { scheduledFor: "2026-08-01" },
        after: { scheduledFor: "2026-08-03" },
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(byCoach.actorUid).toBe("ana-coach");
  });

  it("splits the client's reminder edit from the coach's meeting time", () => {
    const reminder = classifyAuditRecord(
      record({
        changedFields: ["reminderUpdatedAt", "reminderEnabled", "reminderTime"],
        after: { reminderEnabled: false },
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(reminder.title).toBe("Apagó el recordatorio del workout");
    expect(reminder.actorUid).toBe("ailen");

    const meetingTime = classifyAuditRecord(
      record({
        changedFields: ["scheduledTime", "updatedAt"],
        before: { scheduledTime: "18:00" },
        after: { scheduledTime: "19:00" },
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(meetingTime.title).toBe("Cambió el horario del workout");
    expect(meetingTime.actorUid).toBe("ana-coach");
  });

  it("names the prescription write-back instead of dumping field names (#671 item 3)", () => {
    const event = classifyAuditRecord(
      record({
        changedFields: ["templateSnapshot", "updatedAt"],
        before: { templateSnapshot: "[omitted: 2107 chars]" },
        after: { templateSnapshot: "[omitted: 2107 chars]", templateId: "tpl-1" },
        clientId: CLIENT,
        trainerId: CLIENT,
      }),
      { count: 3, dates: [] },
    );
    expect(event.category).toBe("routine");
    expect(event.title).toBe("Actualizó la rutina");
    expect(event.correlation).toBe("prescription_writeback");
    expect(event.meta).toContain("3 ocurrencias");
    // Snapshot-only write = the client's write-back from the app.
    expect(event.actorUid).toBe(CLIENT);
  });

  it("credits a prescription rewrite that re-stamps prescriptionUpdatedAt to the coach", () => {
    const event = classifyAuditRecord(
      record({
        changedFields: ["templateSnapshot", "prescriptionUpdatedAt", "updatedAt"],
        after: { templateSnapshot: "[omitted: 900 chars]", templateId: "tpl-1" },
        clientId: "ailen",
        trainerId: "ana-coach",
      }),
    );
    expect(event.actorUid).toBe("ana-coach");
  });

  it("demotes the assignment's own completed stamp (the log event already says it)", () => {
    const event = classifyAuditRecord(
      record({
        changedFields: ["completed_at", "status", "updatedAt"],
        after: { status: "completed" },
        clientId: CLIENT,
      }),
    );
    expect(event.significance).toBe("low");
    expect(event.correlation).toBe("assignment_completed");
  });
});

describe("classifyAuditRecord — #697 recurrence edits", () => {
  /** The re-expansion half of `editAssignmentRecurrence`. */
  const reExpansion = record({
    op: "create",
    after: {
      selfAssigned: true,
      templateId: "tpl-pullin",
      scheduledFor: "2027-01-06",
      // ⚠️ The ORIGINAL anchor, months before this write: a recurrence edit
      // preserves the series window on purpose. That is precisely the shape
      // `isAutoExtendedOccurrence` reads as an automatic top-up.
      scheduleStartCivil: "2026-07-31",
      recurrence: { kind: "weekly", weekday: 3 },
    },
    clientId: CLIENT,
    trainerId: CLIENT,
    occurredAtISO: "2027-01-02T10:00:05.000Z",
  });

  it("was indistinguishable from the automatic renewal by the anchor alone", () => {
    // Not a bug being asserted — the reason the fix needs the paired delete.
    expect(isAutoExtendedOccurrence(reExpansion)).toBe(true);
  });

  it("reads as the person's change, with the weekday move, when paired", () => {
    const event = classifyAuditRecord(reExpansion, {
      count: 3,
      dates: [],
      recurrenceEdit: { previousRecurrence: { kind: "weekly", weekday: 5 } },
    });
    expect(event.title).toBe("Cambió la recurrencia de una rutina");
    // The report's core complaint: the change had NO actor, because the renewal
    // branch deliberately credits nobody.
    expect(event.actorUid).toBe(CLIENT);
    expect(event.action).toBe("move");
    expect(event.isDeletion).toBe(false);
    expect(event.meta[0]).toBe("todas las semanas (vie) → todas las semanas (mié)");
  });

  it("still calls a genuine top-up automatic when nothing was deleted", () => {
    const event = classifyAuditRecord(reExpansion, { count: 3, dates: [] });
    expect(event.title).toBe("Se extendió sola una rutina recurrente");
    expect(event.actorUid).toBeNull();
  });

  it("shows a single label when only the weekday list is unavailable", () => {
    const event = classifyAuditRecord(reExpansion, {
      count: 1,
      dates: [],
      recurrenceEdit: { previousRecurrence: null },
    });
    expect(event.title).toBe("Cambió la recurrencia de una rutina");
    // #713 — "ahora" makes it unambiguous that this is the DESTINATION and not
    // the origin, which a bare cadence next to "cambió la recurrencia" is not.
    expect(event.meta[0]).toBe("ahora todas las semanas (mié)");
  });

  // ── #713: "no me muestra cuál fue el cambio de recurrencia" ──────────────
  //
  // The old meta expression was
  //   from && to && from !== to ? `${from} → ${to}` : (to ?? from)
  // and `recurrenceLabel` is null for BOTH `single` and any kind it does not
  // know — so a row could say "cambió la recurrencia de una rutina" and then
  // print nothing at all, which is the report verbatim.

  it("never renders an empty change line, whatever the two rules are", () => {
    const cases: Array<[unknown, unknown]> = [
      [{ kind: "single" }, { kind: "single" }],
      [{ kind: "biweekly" }, { kind: "trimonthly" }],
      [null, { kind: "single" }],
      [{ kind: "weekly", weekday: 3 }, { kind: "single" }],
    ];
    for (const [previous, next] of cases) {
      const event = classifyAuditRecord(
        record({
          op: "create",
          after: { templateId: "tpl-pullin", scheduledFor: "2027-01-06", recurrence: next },
          clientId: CLIENT,
          trainerId: CLIENT,
        }),
        { count: 1, dates: [], recurrenceEdit: { previousRecurrence: previous } },
      );
      expect(event.title).toBe("Cambió la recurrencia de una rutina");
      expect(event.meta.length).toBeGreaterThan(0);
      expect(event.meta[0]!.trim()).not.toBe("");
    }
  });

  it("collapsing a series to one date reads as such instead of blank", () => {
    const event = classifyAuditRecord(
      record({
        op: "create",
        after: {
          templateId: "tpl-pullin",
          scheduledFor: "2027-01-06",
          recurrence: { kind: "single" },
        },
        clientId: CLIENT,
        trainerId: CLIENT,
      }),
      {
        count: 1,
        dates: [],
        recurrenceEdit: { previousRecurrence: { kind: "weekly", weekday: 3 } },
      },
    );
    expect(event.meta[0]).toBe("todas las semanas (mié) → una sola vez");
  });

  it("says the dates moved when the cadence itself did not", () => {
    const event = classifyAuditRecord(reExpansion, {
      count: 4,
      dates: ["2027-01-06", "2027-01-13", "2027-01-20", "2027-01-27"],
      recurrenceEdit: { previousRecurrence: { kind: "weekly", weekday: 3 } },
    });
    expect(event.meta[0]).toBe("todas las semanas (mié) (cambiaron las fechas)");
  });

  /**
   * The occurrence span used to appear only for a COLLAPSED group, so a
   * recurrence edit that produced a single future date said nothing about WHEN.
   */
  it("names the affected date even for a one-occurrence edit", () => {
    const event = classifyAuditRecord(reExpansion, {
      count: 1,
      dates: [],
      recurrenceEdit: { previousRecurrence: { kind: "weekly", weekday: 5 } },
    });
    expect(event.meta).toContain("2027-01-06");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #713 — "tocar Ver detalle me lleva al detalle del cliente, pero no puedo ver
// ni cuál workout editó ni qué cambios hizo"
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyAuditRecord — #713 routine edits are identifiable", () => {
  /**
   * The real production shape: an UPDATE snapshots only the CHANGED fields, so
   * a routine edit carries `templateSnapshot` (elided) and nothing else. There
   * is no `templateId` in it — which is why the row had no name to render and
   * fell back to a bare "ver detalle" link to the client.
   */
  const routineEdit = record({
    docId: "asg-oi1SgX6-20260807-DF2F1298",
    changedFields: ["templateSnapshot", "updatedAt"],
    before: { templateSnapshot: "[omitted: 2107 chars]" },
    after: { templateSnapshot: "[omitted: 2190 chars]" },
    clientId: CLIENT,
    trainerId: "ana-coach",
  });

  it("points at the assignment doc so the routine can be named", () => {
    const event = classifyAuditRecord(routineEdit, { count: 1, dates: [] });
    expect(event.title).toBe("Actualizó la rutina");
    expect(event.subject).toBeNull();
    expect(event.subjectRef).toEqual({
      collection: "workout_assignments",
      id: "asg-oi1SgX6-20260807-DF2F1298",
    });
  });

  it("prefers the template when the snapshot does carry a templateId", () => {
    const event = classifyAuditRecord(
      record({
        changedFields: ["templateSnapshot", "updatedAt"],
        after: { templateSnapshot: "[omitted: 900 chars]", templateId: "tpl-1" },
        clientId: CLIENT,
      }),
      { count: 1, dates: [] },
    );
    expect(event.subjectRef).toEqual({ collection: "workout_templates", id: "tpl-1" });
  });

  it("never points at a deleted assignment (the doc is gone by read time)", () => {
    const event = classifyAuditRecord(
      record({
        op: "delete",
        before: { recurrence: { kind: "weekly", weekday: 3 } },
        clientId: CLIENT,
      }),
    );
    expect(event.subjectRef).toBeNull();
  });

  it("says which kind of edit it was, since the snapshot diff is elided", () => {
    const byClient = classifyAuditRecord(routineEdit, { count: 1, dates: [] });
    expect(byClient.actorUid).toBe(CLIENT);
    expect(byClient.meta).toContain("pesos y repes registrados en el entreno");

    const byCoach = classifyAuditRecord(
      record({
        changedFields: ["templateSnapshot", "prescriptionUpdatedAt", "updatedAt"],
        after: { templateSnapshot: "[omitted: 900 chars]" },
        clientId: CLIENT,
        trainerId: "ana-coach",
      }),
      { count: 1, dates: [] },
    );
    expect(byCoach.actorUid).toBe("ana-coach");
    expect(byCoach.meta).toContain("nueva prescripción del coach");
  });

  it("keeps the occurrence span alongside the new detail", () => {
    // `group.dates` are the COMPACT ids the doc name carries ("20260807"),
    // which `dateRangeLabel` formats — not already-hyphenated civil dates.
    const event = classifyAuditRecord(routineEdit, {
      count: 12,
      dates: ["20260807", "20261030"],
    });
    expect(event.meta).toContain("pesos y repes registrados en el entreno");
    expect(event.meta.some((m) => m.includes("2026-08-07"))).toBe(true);
  });
});

describe("recurrenceDescribe / recurrenceChangeLabel — #713", () => {
  it("describes what recurrenceLabel deliberately leaves unsaid", () => {
    // Unchanged contract: `recurrenceLabel` stays null for these, because next
    // to an ASSIGNMENT there is nothing worth printing.
    expect(recurrenceLabel({ kind: "single" })).toBeNull();
    expect(recurrenceLabel({ kind: "biweekly" })).toBeNull();

    expect(recurrenceDescribe({ kind: "single" })).toBe("una sola vez");
    expect(recurrenceDescribe({ kind: "biweekly" })).toBe("biweekly");
    expect(recurrenceDescribe({ kind: "daily" })).toBe("todos los días");
    // Genuinely nothing to describe.
    expect(recurrenceDescribe(null)).toBeNull();
    expect(recurrenceDescribe({})).toBeNull();
  });

  it("degrades to one side when the other is unknown", () => {
    expect(recurrenceChangeLabel(null, { kind: "daily" })).toBe("ahora todos los días");
    expect(recurrenceChangeLabel({ kind: "daily" }, null)).toBe("antes todos los días");
    expect(recurrenceChangeLabel(null, null)).toBeNull();
  });
});

describe("classifyAuditRecord — habits, exercises, accounts", () => {
  it("names a client-created habit and its frequency", () => {
    const event = classifyAuditRecord(
      record({
        collection: "habits",
        op: "create",
        changedFields: ["name", "scheduleCadence"],
        after: {
          name: { en: "Healthy Dinner", es: "Cena saludable" },
          clientOwned: true,
          scheduleCadence: "daily",
          scheduleType: "recurring",
          startsOn: "2026-07-30",
        },
        clientId: "c1",
        trainerId: "c1",
      }),
    );
    expect(event.title).toBe("Creó un hábito");
    expect(event.subject).toBe("Cena saludable");
    expect(event.meta).toContain("diario");
    expect(event.target).toEqual({ kind: "user", uid: "c1" });
  });

  it("calls a coach-assigned habit an assignment", () => {
    const event = classifyAuditRecord(
      record({
        collection: "habits",
        op: "create",
        changedFields: ["name"],
        after: { name: { es: "Agua" }, scheduleCadence: "daily" },
        clientId: "c1",
        trainerId: COACH,
      }),
    );
    expect(event.title).toBe("Asignó un hábito");
    expect(event.action).toBe("assign");
  });

  it("does not say a one-time habit's single day twice, once prefixed with 'desde'", () => {
    // Same reading as the one-off assignment (#697): `habitFrequencyLabel`
    // already prints the date as "una vez (…)", and there is no "desde" about
    // a day that is also the end.
    const oneTime = classifyAuditRecord(
      record({
        collection: "habits",
        op: "create",
        changedFields: ["name", "scheduleType", "startsOn"],
        after: { name: { es: "Turno médico" }, scheduleType: "one-time", startsOn: "2026-08-02" },
        clientId: "c1",
        trainerId: COACH,
      }),
    );
    expect(oneTime.meta).toEqual(["una vez (2026-08-02)"]);

    // A recurring habit does start on a day, so it keeps the prefix.
    const recurring = classifyAuditRecord(
      record({
        collection: "habits",
        op: "create",
        changedFields: ["name", "scheduleCadence", "startsOn"],
        after: {
          name: { es: "Agua" },
          scheduleCadence: "daily",
          scheduleType: "recurring",
          startsOn: "2026-08-02",
        },
        clientId: "c1",
        trainerId: COACH,
      }),
    );
    expect(recurring.meta).toEqual(["diario", "desde 2026-08-02"]);
  });

  it('reads "borrar el hábito desde este día" (an endsOn cap) as a removal, not a schedule tweak', () => {
    // deleteHabitRecurrenceFromDate never sets `deleted` — it caps `endsOn` so
    // past logs survive. Reported as a schedule change it read as "cambió la
    // programación" when the coach had actually removed the habit.
    const event = classifyAuditRecord(
      record({
        collection: "habits",
        changedFields: ["endsOn", "updatedAt"],
        before: { endsOn: null, name: { es: "1 Fruit" } },
        after: { endsOn: "2026-07-30", name: { es: "1 Fruit" } },
        clientId: "pato",
        trainerId: "manu-coach",
      }),
    );
    expect(event.title).toBe("Dio de baja un hábito");
    expect(event.isDeletion).toBe(true);
    expect(event.meta).toContain("hasta 2026-07-30");
    expect(event.actorUid).toBe("manu-coach");
  });

  it("tells extending a habit apart from ending it", () => {
    const extended = classifyAuditRecord(
      record({
        collection: "habits",
        changedFields: ["endsOn", "updatedAt"],
        before: { endsOn: "2026-07-30" },
        after: { endsOn: "2026-12-31" },
        clientId: "pato",
        trainerId: "manu-coach",
      }),
    );
    expect(extended.title).toBe("Extendió un hábito");
    expect(extended.isDeletion).toBe(false);

    const reopened = classifyAuditRecord(
      record({
        collection: "habits",
        changedFields: ["endsOn", "updatedAt"],
        before: { endsOn: "2026-07-30" },
        after: { endsOn: null },
        clientId: "pato",
        trainerId: "manu-coach",
      }),
    );
    expect(reopened.title).toBe("Reactivó un hábito");
  });

  it("credits a habit reminder edit to the client even on a coach-assigned habit", () => {
    const event = classifyAuditRecord(
      record({
        collection: "habits",
        changedFields: ["reminderEnabled", "reminderTime", "reminderUpdatedAt"],
        after: { reminderEnabled: true, reminderTime: "08:00" },
        clientId: "pato",
        trainerId: "manu-coach",
      }),
    );
    expect(event.title).toBe("Cambió el recordatorio de un hábito");
    expect(event.actorUid).toBe("pato");
  });

  it("treats a soft-deleted habit as a deletion", () => {
    const event = classifyAuditRecord(
      record({
        collection: "habits",
        changedFields: ["deleted", "updatedAt"],
        before: { deleted: false, name: { es: "Agua" } },
        after: { deleted: true, name: { es: "Agua" } },
        clientId: "c1",
      }),
    );
    expect(event.isDeletion).toBe(true);
    expect(event.title).toBe("Eliminó un hábito");
  });

  it("names a new exercise and links to its library page", () => {
    const event = classifyAuditRecord(
      record({
        collection: "exercises",
        docId: "custom-1",
        op: "create",
        changedFields: ["name"],
        after: { name: { en: "Step up", es: "Step up" }, ownerId: COACH, primaryMuscleGroup: "legs" },
      }),
    );
    expect(event.title).toBe("Creó un ejercicio");
    expect(event.subject).toBe("Step up");
    expect(event.target).toEqual({ kind: "exercise", exerciseId: "custom-1" });
  });

  // ── #741 ───────────────────────────────────────────────────────────────────
  //
  // Un ejercicio de la BIBLIOTECA COMPARTIDA no tiene `ownerId` (a propósito: no se
  // adivina un dueño). Antes eso dejaba la edición sin actor y la fila salía sin nombre.
  // `updatedBy` es quién la tocó, que es lo que la pantalla necesita.
  it("atribuye la edición de un ejercicio de biblioteca a quien lo editó", () => {
    const event = classifyAuditRecord(
      record({
        collection: "exercises",
        docId: "std-1",
        op: "update",
        changedFields: ["name"],
        after: { name: { en: "Squat", es: "Sentadilla" }, updatedBy: COACH },
      }),
    );
    expect(event.title).toBe("Editó un ejercicio");
    expect(event.actorUid).toBe(COACH);
  });

  it("prefiere el actor del audit_log por sobre updatedBy cuando existe", () => {
    const event = classifyAuditRecord(
      record({
        collection: "exercises",
        docId: "std-1",
        op: "update",
        changedFields: ["name"],
        actorUid: "uid-admin",
        after: { name: { en: "Squat", es: "Sentadilla" }, updatedBy: COACH },
      }),
    );
    // El audit_log es la fuente más confiable: dice quién hizo LA ESCRITURA, mientras que
    // `updatedBy` es lo que el documento afirma de sí mismo.
    expect(event.actorUid).toBe("uid-admin");
  });

  it("surfaces a new signup and a real subscription change, but not a no-op refresh", () => {
    const signup = classifyAuditRecord(
      record({
        collection: "users",
        docId: "u1",
        op: "create",
        changedFields: ["email", "role"],
        after: {
          displayName: "Marlon Bennett",
          email: "marlon@x.com",
          role: "client",
          coachDisplayName: "Manu",
          autoAssignedCoach: true,
        },
      }),
    );
    expect(signup.title).toBe("Nuevo usuario");
    expect(signup.subject).toBe("Marlon Bennett");
    expect(signup.meta).toContain("coach auto-asignado");

    const upgrade = classifyAuditRecord(
      record({
        collection: "users",
        docId: "u1",
        changedFields: ["entitlement"],
        before: { entitlement: { tier: "free" } },
        after: { entitlement: { tier: "premium", source: "revenuecat" } },
      }),
    );
    // #682 — the direction of the tier move names the action. A store-sourced
    // free → premium is a PURCHASE, and the buyer is the actor even though the
    // write arrives through the RevenueCat webhook.
    expect(upgrade.title).toBe("Compró una suscripción");
    expect(upgrade.subject).toBe("free → premium");
    expect(upgrade.significance).toBe("key");
    expect(upgrade.actorUid).toBe("u1");

    const refresh = classifyAuditRecord(
      record({
        collection: "users",
        docId: "u1",
        changedFields: ["entitlement"],
        before: { entitlement: { tier: "free" } },
        after: { entitlement: { tier: "free", source: "revenuecat" } },
      }),
    );
    expect(refresh.significance).toBe("low");
  });

  it("marks a new trainer account as a new coach", () => {
    const event = classifyAuditRecord(
      record({
        collection: "users",
        docId: "t1",
        op: "create",
        changedFields: ["role"],
        after: { role: "trainer", displayName: "Coach Nuevo" },
      }),
    );
    expect(event.title).toBe("Nuevo coach");
  });

  it("keeps an `updatedAt`-only user touch out of the default feed", () => {
    const event = classifyAuditRecord(
      record({
        collection: "users",
        docId: "u1",
        changedFields: ["updatedAt"],
        before: { updatedAt: "a" },
        after: { updatedAt: "b" },
      }),
    );
    expect(event.significance).toBe("low");
  });
});

describe("mergeWorkoutWriteBacks", () => {
  const base = {
    occurredAtISO: "2026-07-31T20:37:00.000Z",
    clientUid: CLIENT,
  };

  it("folds the write-back + completed stamp into the finish it belongs to", () => {
    const merged = mergeWorkoutWriteBacks<MergeableEvent>([
      { id: "wb", ...base, occurredAtISO: "2026-07-31T20:37:02.331Z", correlation: "prescription_writeback" as const, occurrenceCount: 3 },
      { id: "done", ...base, occurredAtISO: "2026-07-31T20:37:02.292Z", correlation: "assignment_completed" as const },
      { id: "finish", ...base, correlation: "workout_finished" as const },
    ]);

    expect(merged.map((e) => e.id)).toEqual(["finish"]);
    expect(merged[0].notes).toEqual(["actualizó la rutina (3 ocurrencias)"]);
  });

  it("leaves an unrelated routine edit standing on its own", () => {
    const merged = mergeWorkoutWriteBacks([
      { id: "wb", ...base, occurredAtISO: "2026-07-31T18:16:20.447Z", correlation: "prescription_writeback" as const },
      { id: "finish", ...base, correlation: "workout_finished" as const },
    ]);
    // 2h+ apart → not part of the finish.
    expect(merged.map((e) => e.id)).toEqual(["wb", "finish"]);
  });

  it("never folds another client's write-back", () => {
    const merged = mergeWorkoutWriteBacks([
      { id: "wb", ...base, clientUid: "someone-else", occurredAtISO: "2026-07-31T20:37:02.331Z", correlation: "prescription_writeback" as const },
      { id: "finish", ...base, correlation: "workout_finished" as const },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["wb", "finish"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #748 — one action, one row, across sources
// ─────────────────────────────────────────────────────────────────────────────

describe("coachActivityKeysFor", () => {
  const SERIES = "6b1f2a34-0c9d-4f11-9d0e-51b7b2a4c8f0";

  it("bridges an assignment by BOTH its series and its doc id", () => {
    // The coach log keys a recurring series by seriesId and a one-off by the
    // assignment id — a row that only emitted one of them would miss half.
    expect(
      coachActivityKeysFor(
        record({
          collection: "workout_assignments",
          docId: `asg-${CLIENT}-20260808-${SERIES}`,
          op: "create",
          after: { seriesId: SERIES, templateId: "tpl-1" },
        }),
      ),
    ).toEqual([`asg:asg-${CLIENT}-20260808-${SERIES}`, `asg:${SERIES}`]);
  });

  it("reads the series off `before` on a delete, where `after` is gone", () => {
    expect(
      coachActivityKeysFor(
        record({
          collection: "workout_assignments",
          docId: "asg-1",
          op: "delete",
          before: { seriesId: SERIES },
          after: null,
        }),
      ),
    ).toContain(`asg:${SERIES}`);
  });

  it("bridges exercises and habits on the CREATE only", () => {
    const exercise = { collection: "exercises", docId: "exr-1" } as const;
    const habit = { collection: "habits", docId: "hab-1" } as const;
    expect(coachActivityKeysFor(record({ ...exercise, op: "create" }))).toEqual(["exr:exr-1"]);
    expect(coachActivityKeysFor(record({ ...habit, op: "create" }))).toEqual(["hab:hab-1"]);
    // `exerciseCreatedEvent` / `habitAssignedEvent` never fire on an edit, so an
    // edit landing minutes after the create must not swallow the creation row.
    expect(coachActivityKeysFor(record({ ...exercise, op: "update" }))).toEqual([]);
    expect(coachActivityKeysFor(record({ ...habit, op: "delete" }))).toEqual([]);
  });

  it("has no opinion on collections the coach log does not mirror", () => {
    expect(coachActivityKeysFor(record({ collection: "workout_logs", op: "create" }))).toEqual([]);
    expect(coachActivityKeysFor(record({ collection: "users", op: "update" }))).toEqual([]);
    // `docId: "?"` is the reader's fallback for a malformed capture — it must
    // not become a key that matches other malformed captures.
    expect(
      coachActivityKeysFor(record({ collection: "workout_assignments", docId: "?", op: "create" })),
    ).toEqual([]);
  });
});

describe("findDuplicateCoachEventIds", () => {
  const SERIES = "6b1f2a34-0c9d-4f11-9d0e-51b7b2a4c8f0";

  /** The screenshot in #748: the same assign, told twice. */
  const auditHalf: CrossSourceRow = {
    id: "audit_log:a1",
    source: "audit_log",
    occurredAtISO: "2026-08-04T17:31:10.000Z",
    clientUid: CLIENT,
    entityKeys: [`asg:asg-${CLIENT}-20260808-${SERIES}`, `asg:${SERIES}`],
  };
  const coachHalf: CrossSourceRow = {
    id: `coach_activity:asg:${SERIES}`,
    source: "coach_activity",
    occurredAtISO: "2026-08-04T17:31:12.000Z",
    clientUid: CLIENT,
    entityKeys: [`asg:${SERIES}`],
  };

  it("drops the coach half when the audit half already told the same assign", () => {
    expect([...findDuplicateCoachEventIds([auditHalf, coachHalf])]).toEqual([coachHalf.id]);
  });

  it("keeps the coach row when NO audit row tells it", () => {
    // The trigger is not deployed, the collection is not monitored, or the audit
    // half fell off the per-source cap. Showing it twice beats losing it.
    expect(findDuplicateCoachEventIds([coachHalf]).size).toBe(0);
  });

  it("never folds a horizon renewal into a months-old assign", () => {
    // Same series, same client — but the app topping the series back up on its
    // own is a different fact from the coach assigning it.
    const renewal = { ...auditHalf, occurredAtISO: "2026-10-02T04:00:00.000Z" };
    expect(findDuplicateCoachEventIds([renewal, coachHalf]).size).toBe(0);
  });

  it("never folds two rows about different clients", () => {
    const other = { ...auditHalf, clientUid: "someone-else" };
    expect(findDuplicateCoachEventIds([other, coachHalf]).size).toBe(0);
  });

  it("keeps the coach row for a client who has no uid yet", () => {
    // The pending client is named ONLY by the email on the coach event; the
    // audit row has nowhere to put it, so folding would erase who it was about.
    const pending = { ...coachHalf, clientUid: null, hasPendingClient: true };
    const audit = { ...auditHalf, clientUid: null };
    expect(findDuplicateCoachEventIds([audit, pending]).size).toBe(0);
  });

  it("folds the series event into a DELETE of the same series", () => {
    // `deleteAssignment` marks the coach event deleted and the trigger captures
    // the occurrence deletions — the same pair of halves, one row.
    const deletion = { ...auditHalf, id: "audit_log:a-del" };
    const coachDeleted = { ...coachHalf, occurredAtISO: "2026-08-04T17:31:11.000Z" };
    expect([...findDuplicateCoachEventIds([deletion, coachDeleted])]).toEqual([coachHalf.id]);
  });
});

// ── Nutrition marks (#949) ───────────────────────────────────────────────────

describe("summarizeNutritionMarks", () => {
  const snapshot = ["desayuno", "almuerzo", "merienda", "cena"];

  it("splits the day by status — `done` is the only compliant one", () => {
    const summary = summarizeNutritionMarks(
      {
        desayuno: { status: "done" },
        almuerzo: { status: "different" },
        merienda: { status: "missed" },
      },
      snapshot,
    );
    expect(summary).toEqual({
      marked: 3,
      expected: 4,
      done: 1,
      different: 1,
      missed: 1,
      isComplete: false,
    });
  });

  it("is complete when every expected meal carries a mark", () => {
    const summary = summarizeNutritionMarks(
      {
        desayuno: { status: "done" },
        almuerzo: { status: "done" },
        merienda: { status: "missed" },
        cena: { status: "done" },
      },
      snapshot,
    );
    expect(summary.isComplete).toBe(true);
  });

  it("counts an unknown status as not-done rather than dropping it", () => {
    const summary = summarizeNutritionMarks({ desayuno: { status: "zzz" } }, snapshot);
    expect(summary.marked).toBe(1);
    expect(summary.done).toBe(0);
    expect(summary.missed).toBe(1);
  });

  it("never reports fewer expected meals than the client actually marked", () => {
    // A plan edited mid-day can leave a mark whose meal is no longer in the
    // snapshot. "4 de 2" would be nonsense; "4 de 4" is the honest floor.
    const summary = summarizeNutritionMarks(
      {
        a: { status: "done" },
        b: { status: "done" },
        c: { status: "done" },
        d: { status: "done" },
      },
      ["a", "b"],
    );
    expect(summary.expected).toBe(4);
    expect(summary.isComplete).toBe(true);
  });

  it("handles a day with no marks and no snapshot without throwing", () => {
    const summary = summarizeNutritionMarks({}, []);
    expect(summary).toEqual({
      marked: 0,
      expected: 0,
      done: 0,
      different: 0,
      missed: 0,
      isComplete: false,
    });
  });
});

describe("describeNutritionMarks", () => {
  const base = {
    marked: 4,
    expected: 4,
    done: 2,
    different: 1,
    missed: 1,
    isComplete: true,
  };

  it("leads with the compliant count and spells out the rest", () => {
    expect(describeNutritionMarks(base, "2026-08-19", "2026-08-19T21:00:00.000Z")).toEqual([
      "2 de 4 cumplidas",
      "1 distinto",
      "1 sin cumplir",
    ]);
  });

  it("omits the statuses that did not happen", () => {
    expect(
      describeNutritionMarks(
        { ...base, done: 4, different: 0, missed: 0 },
        "2026-08-19",
        "2026-08-19T21:00:00.000Z",
      ),
    ).toEqual(["4 de 4 cumplidas"]);
  });

  it("names the civil day ONLY when the marking was back-dated", () => {
    // Marked today, for yesterday — the row sits under today's header, so the
    // day it is about is the fact worth adding.
    expect(
      describeNutritionMarks({ ...base, different: 0, missed: 0 }, "2026-08-18", "2026-08-19T09:00:00.000Z"),
    ).toContain("día 2026-08-18");
  });
});
