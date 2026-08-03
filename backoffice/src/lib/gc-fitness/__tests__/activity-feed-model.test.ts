// __tests__/activity-feed-model.test.ts
//
// Pure tests for the raw-write → human-event translation behind the admin
// Monitoring & Observability feed (issue #671). Every case here is a shape that
// was READ OFF PRODUCTION `audit_log` while designing the feed, so the fixtures
// are the real wire payloads (including the trigger's `[omitted: N chars]`
// elision of `templateSnapshot`).

import {
  classifyAuditRecord,
  isAutoExtendedOccurrence,
  durationLabel,
  habitFrequencyLabel,
  isElided,
  mergeWorkoutWriteBacks,
  occurrenceDateFromId,
  recurrenceLabel,
  volumeLabel,
  type AuditRecord,
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
    expect(event.meta[0]).toBe("todas las semanas (mié)");
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
