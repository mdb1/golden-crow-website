// __tests__/coach-activity-log.test.ts
//
// The "My Activity" event builders + the best-effort writer. The builders decide
// the deterministic eventId (idempotency: a retry or a later edit must MERGE onto
// the same row, never stack a duplicate) and the Spanish title/detail a coach
// reads. The writer must never throw and must only write `groupId` when there is
// one.

import { FakeFirestore, FakeTimestamp, firestoreModuleMock } from "@/lib/test-utils/fake-firestore-c";

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import type { Firestore } from "firebase-admin/firestore";

import {
  COACH_ACTIVITY_COLLECTION,
  clientAddedEvent,
  exerciseCreatedEvent,
  habitAssignedEvent,
  localizedText,
  markCoachActivityDeleted,
  noteAddedEvent,
  nutritionLibraryEvent,
  nutritionPlanEvent,
  progressPhotoRequestedEvent,
  recordCoachActivityEvent,
  recurrenceLabel,
  seriesAssignmentEvent,
  singleAssignmentEvent,
  templateCreatedEvent,
  weightRequestedEvent,
} from "../coach-activity-log";

const SERVER_TS = firestoreModuleMock.FieldValue.serverTimestamp();

describe("localizedText", () => {
  it.each([
    ["plain string", "Hola", "Hola"],
    ["es preferred", { es: "Sentadilla", en: "Squat" }, "Sentadilla"],
    ["blank es falls back to en", { es: "  ", en: "Squat" }, "Squat"],
    ["en only", { en: "Squat" }, "Squat"],
    ["neither", { es: "", en: " " }, ""],
    ["non-string fields", { es: 1, en: null }, ""],
    ["null", null, ""],
    ["number", 42, ""],
  ])("%s", (_label, input, expected) => {
    expect(localizedText(input)).toBe(expected);
  });
});

describe("recurrenceLabel", () => {
  it.each([
    [{ kind: "daily" }, "diaria"],
    [{ kind: "weekly" }, "semanal"],
    [{ kind: "weekly_days" }, "semanal"],
    [{ kind: "monthly" }, "mensual"],
    [{ kind: "every_n_days", everyN: 3 }, "cada 3 días"],
    [{ kind: "every_n_days", everyN: "4" }, "cada 4 días"],
    [{ kind: "every_n_days", everyN: 0 }, "cada N días"],
    [{ kind: "every_n_days" }, "cada N días"],
    [{ kind: "every_n_days", everyN: "x" }, "cada N días"],
    [{ kind: "yearly" }, null],
    [null, null],
    ["daily", null],
  ])("%p → %p", (input, expected) => {
    expect(recurrenceLabel(input)).toBe(expected);
  });
});

describe("assignment events", () => {
  it("single: asg:<assignmentId>, name in title, date in detail", () => {
    const at = new Date("2026-06-01T10:00:00Z");
    expect(
      singleAssignmentEvent({
        trainerId: "coach-a",
        assignmentId: "as1",
        templateName: { es: "Día 1", en: "Day 1" },
        clientId: "c1",
        pendingEmail: null,
        scheduledFor: "2026-06-03",
        occurredAt: at,
      }),
    ).toEqual({
      eventId: "asg:as1",
      trainerId: "coach-a",
      kind: "workout_assignment",
      title: "Workout asignado: Día 1",
      detail: "Fecha: 2026-06-03",
      clientId: "c1",
      pendingEmail: null,
      occurredAt: at,
    });
  });

  it("single without name / date / occurredAt", () => {
    const e = singleAssignmentEvent({
      trainerId: "coach-a",
      assignmentId: "as1",
      templateName: null,
      clientId: null,
      pendingEmail: "p@example.com",
      scheduledFor: null,
    });
    expect([e.title, e.detail, e.occurredAt, e.pendingEmail]).toEqual([
      "Workout asignado",
      null,
      null,
      "p@example.com",
    ]);
  });

  it("series: asg:<seriesId>; detail = recurrence · count · sorted first→last", () => {
    const e = seriesAssignmentEvent({
      trainerId: "coach-a",
      seriesId: "s1",
      templateName: "Push",
      clientId: "c1",
      pendingEmail: null,
      recurrence: { kind: "weekly" },
      dates: ["2026-06-15", "2026-06-01", "2026-06-08"],
    });
    expect(e.eventId).toBe("asg:s1");
    expect(e.title).toBe("Workout asignado: Push");
    expect(e.detail).toBe("Recurrencia: semanal · 3 fechas · 2026-06-01 a 2026-06-15");
  });

  it("series with one date says 'desde', with no recurrence omits it", () => {
    const e = seriesAssignmentEvent({
      trainerId: "coach-a",
      seriesId: "s1",
      templateName: "",
      clientId: "c1",
      pendingEmail: null,
      recurrence: undefined,
      dates: ["2026-06-01"],
    });
    expect(e.title).toBe("Workout asignado");
    expect(e.detail).toBe("1 fechas · desde 2026-06-01");
  });

  it("series with no dates still reports the count", () => {
    const e = seriesAssignmentEvent({
      trainerId: "coach-a",
      seriesId: "s1",
      templateName: "X",
      clientId: "c1",
      pendingEmail: null,
      recurrence: { kind: "daily" },
      dates: [],
    });
    expect(e.detail).toBe("Recurrencia: diaria · 0 fechas");
  });
});

describe("library / client events", () => {
  it("template and exercise created", () => {
    expect(templateCreatedEvent({ trainerId: "t", templateId: "tp1", name: { es: "Pierna" } })).toEqual({
      eventId: "tpl:tp1",
      trainerId: "t",
      kind: "workout_template",
      title: "Workout creado: Pierna",
      detail: null,
      clientId: null,
      pendingEmail: null,
      occurredAt: null,
    });
    expect(templateCreatedEvent({ trainerId: "t", templateId: "tp1", name: null }).title).toBe("Workout creado");
    expect(exerciseCreatedEvent({ trainerId: "t", exerciseId: "e1", name: "Curl" })).toMatchObject({
      eventId: "exr:e1",
      kind: "exercise",
      title: "Ejercicio creado: Curl",
    });
    expect(exerciseCreatedEvent({ trainerId: "t", exerciseId: "e1", name: {} }).title).toBe("Ejercicio creado");
  });

  it.each([
    ["meal", "created", "Avena", "nutlib:meal:m1", "Comida creada: Avena"],
    ["meal", "duplicated", "", "nutlib:meal:m1", "Comida duplicada"],
    ["template", "created", "", "nutlib:template:m1", "Plantilla de nutrición creada"],
    ["template", "duplicated", "Volumen", "nutlib:template:m1", "Plantilla de nutrición duplicada: Volumen"],
  ] as const)("nutrition library %s %s", (entity, change, name, eventId, title) => {
    const e = nutritionLibraryEvent({ trainerId: "t", entity, entityId: "m1", name, change });
    expect(e).toMatchObject({ eventId, title, kind: "nutrition_library", clientId: null, detail: null });
  });

  it("habit assigned", () => {
    expect(
      habitAssignedEvent({ trainerId: "t", habitId: "h1", name: { en: "Water" }, clientId: "c1", pendingEmail: null }),
    ).toMatchObject({ eventId: "hab:h1", kind: "habit_assignment", title: "Hábito asignado: Water", clientId: "c1" });
    expect(
      habitAssignedEvent({ trainerId: "t", habitId: "h1", name: null, clientId: null, pendingEmail: "p@x.com" }).title,
    ).toBe("Hábito asignado");
  });

  it.each([
    ["assigned", "Nutrición asignada"],
    ["edited", "Nutrición editada"],
    ["trimmed", "Fase de nutrición recortada"],
    ["closed", "Fase de nutrición cerrada"],
  ] as const)("nutrition plan %s", (change, verb) => {
    const e = nutritionPlanEvent({
      trainerId: "t",
      planId: "p1",
      name: { es: "Definición" },
      clientId: "c1",
      startsOn: "2026-06-01",
      endsOn: "2026-06-30",
      change,
    });
    expect(e).toMatchObject({
      eventId: "nut:p1",
      kind: "nutrition_plan",
      title: `${verb}: Definición`,
      detail: "2026-06-01 → 2026-06-30",
      groupId: null,
    });
  });

  it("nutrition plan: open-ended window, no name, groupId carried", () => {
    const e = nutritionPlanEvent({
      trainerId: "t",
      planId: "p1",
      name: null,
      clientId: "c1",
      startsOn: "2026-06-01",
      endsOn: null,
      change: "assigned",
      groupId: "bulk-1",
    });
    expect([e.title, e.detail, e.groupId]).toEqual(["Nutrición asignada", "2026-06-01 → sin fecha de fin", "bulk-1"]);
  });

  it("note: key includes doc + entry, body truncated to 120 chars", () => {
    const e = noteAddedEvent({ trainerId: "t", noteDocId: "n1", entryKey: "k9", body: "x".repeat(200), clientId: "c1" });
    expect(e.eventId).toBe("note:n1:k9");
    expect(e.detail).toHaveLength(120);
    expect(noteAddedEvent({ trainerId: "t", noteDocId: "n1", entryKey: "k", body: null, clientId: "c1" }).detail).toBeNull();
    expect(noteAddedEvent({ trainerId: "t", noteDocId: "n1", entryKey: "k", body: "", clientId: "c1" }).detail).toBeNull();
  });

  it("photo / weight requests are keyed by client + request instant", () => {
    const at = new Date("2026-06-10T12:00:00.000Z");
    expect(progressPhotoRequestedEvent({ trainerId: "t", clientId: "c1", clientName: "Ana", requestedAt: at })).toEqual({
      eventId: "req:photo:c1:2026-06-10T12:00:00.000Z",
      trainerId: "t",
      kind: "progress_photo_request",
      title: "Pedir fotos de progreso: Ana",
      detail: "Válido durante 3 días",
      clientId: "c1",
      pendingEmail: null,
      occurredAt: at,
    });
    expect(weightRequestedEvent({ trainerId: "t", clientId: "c1", clientName: "Ana", requestedAt: at })).toMatchObject({
      eventId: "req:weight:c1:2026-06-10T12:00:00.000Z",
      kind: "weight_request",
      title: "Pedir peso: Ana",
      occurredAt: at,
    });
  });

  it("client added — existing account: clientId set, no pendingEmail", () => {
    expect(
      clientAddedEvent({
        trainerId: "t",
        email: "a@x.com",
        displayName: "  Ana  ",
        clientId: "c1",
        mode: "attached-existing-user",
      }),
    ).toEqual({
      eventId: "client:t:a@x.com",
      trainerId: "t",
      kind: "client_added",
      title: "Cliente agregado: Ana",
      detail: "a@x.com · cuenta existente",
      clientId: "c1",
      pendingEmail: null,
      occurredAt: null,
    });
  });

  it("client added — mirror pre-create: pendingEmail set, name falls back to email", () => {
    expect(
      clientAddedEvent({ trainerId: "t", email: "b@x.com", displayName: "  ", clientId: null, mode: "precreated-mirror" }),
    ).toMatchObject({
      title: "Cliente agregado: b@x.com",
      detail: "b@x.com · pre-creado (se vincula al primer ingreso)",
      clientId: null,
      pendingEmail: "b@x.com",
    });
  });
});

describe("recordCoachActivityEvent / markCoachActivityDeleted", () => {
  let db: FakeFirestore;
  beforeEach(() => {
    db = new FakeFirestore();
  });

  it("merges the event at coach_activity/<eventId>; occurredAt → Timestamp; deleted defaults false; no groupId key", async () => {
    const at = new Date("2026-06-01T10:00:00Z");
    await recordCoachActivityEvent(
      db as unknown as Firestore,
      templateCreatedEvent({ trainerId: "t", templateId: "tp1", name: "Pierna", occurredAt: at }),
    );
    expect(db.writes).toHaveLength(1);
    const w = db.writes[0];
    expect(w).toMatchObject({ op: "set", path: `${COACH_ACTIVITY_COLLECTION}/tpl:tp1`, merge: true });
    expect(w.data).toEqual({
      trainerId: "t",
      kind: "workout_template",
      title: "Workout creado: Pierna",
      detail: null,
      clientId: null,
      pendingEmail: null,
      deleted: false,
      occurredAt: expect.any(FakeTimestamp),
    });
    expect((w.data!.occurredAt as FakeTimestamp).toMillis()).toBe(at.getTime());
    expect(w.data).not.toHaveProperty("groupId");
  });

  it("uses server time without occurredAt, writes groupId when present, honours deleted", async () => {
    await recordCoachActivityEvent(db as unknown as Firestore, {
      ...nutritionPlanEvent({
        trainerId: "t",
        planId: "p1",
        name: "X",
        clientId: "c1",
        startsOn: "2026-06-01",
        endsOn: null,
        change: "closed",
        groupId: "g1",
      }),
      deleted: true,
    });
    expect(db.writes[0].data).toMatchObject({ groupId: "g1", deleted: true, occurredAt: SERVER_TS });
  });

  it("never throws when the write fails (best-effort) and warns", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      collection: () => ({
        doc: () => ({
          set: async () => {
            throw new Error("PERMISSION_DENIED");
          },
        }),
      }),
    } as unknown as Firestore;
    await expect(
      recordCoachActivityEvent(broken, templateCreatedEvent({ trainerId: "t", templateId: "x", name: "" })),
    ).resolves.toBeUndefined();
    await expect(markCoachActivityDeleted(broken, "asg:s1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("markCoachActivityDeleted merges deleted + deletedAt onto the same id", async () => {
    await markCoachActivityDeleted(db as unknown as Firestore, "asg:s1");
    expect(db.writes).toEqual([
      {
        op: "set",
        path: "coach_activity/asg:s1",
        data: { deleted: true, deletedAt: SERVER_TS },
        merge: true,
        via: "direct",
      },
    ]);
  });
});
