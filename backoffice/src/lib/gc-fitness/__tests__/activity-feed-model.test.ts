// __tests__/activity-feed-model.test.ts
//
// Pure tests for the raw-write → human-event translation behind the admin
// Monitoring & Observability feed (issue #671). Every case here is a shape that
// was READ OFF PRODUCTION `audit_log` while designing the feed, so the fixtures
// are the real wire payloads (including the trigger's `[omitted: N chars]`
// elision of `templateSnapshot`).

import {
  classifyAuditRecord,
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
    expect(upgrade.title).toBe("Cambió la suscripción");
    expect(upgrade.subject).toBe("free → premium");
    expect(upgrade.significance).toBe("key");

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
