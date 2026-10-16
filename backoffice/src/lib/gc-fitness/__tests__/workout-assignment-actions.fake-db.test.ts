// __tests__/workout-assignment-actions.fake-db.test.ts
//
// Executes the recurring / pending assignment writers and the read-side
// aggregations of workout-assignment-actions.ts against the in-memory
// Firestore from fake-firestore-c (real auth-helpers over a mocked getTokens).
// The sibling suites (workout-assignment-actions.test.ts / .recurrence) drive
// other actions through jest.fn chains; these assert the WRITTEN DOCS: count,
// civil dates, the shared seriesId, the 0=Sun..6=Sat weekday convention, the
// null-not-undefined optional fields (fake-c throws on `undefined`, like the
// Admin SDK) — plus tenant isolation on templates, pending mirrors and clients.

import {
  FakeFirestore,
  FakeTimestamp,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import {
  assignTemplateRecurring,
  assignTemplateRecurringToPending,
  assignTemplateToPending,
  countTemplateAssignments,
  listFutureAssignmentsForTemplate,
  listPendingAssignments,
  listWorkoutAssignmentGroups,
} from "../workout-assignment-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

/** UTC weekday (0=Sun..6=Sat) of a civil date — TZ-independent oracle. */
function weekdayOf(civil: string): number {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function assignmentDocs(): Array<{ id: string; data: Record<string, unknown> }> {
  return [...db.store.entries()]
    .filter(([p]) => p.startsWith("workout_assignments/"))
    .map(([p, data]) => ({ id: p.split("/")[1], data }))
    .sort((a, b) => String(a.data.scheduledFor).localeCompare(String(b.data.scheduledFor)));
}

function expectNoUndefinedDeep(value: unknown, path = "$"): void {
  if (value === undefined) throw new Error(`undefined at ${path}`);
  if (Array.isArray(value)) value.forEach((v, i) => expectNoUndefinedDeep(v, `${path}[${i}]`));
  else if (value && typeof value === "object" && !(value instanceof FakeTimestamp)) {
    for (const [k, v] of Object.entries(value)) expectNoUndefinedDeep(v, `${path}.${k}`);
  }
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);

  db.seed("exercises/ex-squat", { name: { en: "Squat", es: "Sentadilla" } });
  db.seed("workout_templates/t-own", {
    trainerId: "coach-a",
    name: { en: "Legs", es: "Piernas" },
    exercises: [{ exerciseId: "ex-squat", sets: 3, reps: 5, weightBySetKg: [60, 60, 60] }],
  });
  db.seed("workout_templates/t-other", { trainerId: "coach-b", name: { en: "B secret", es: "B secreto" }, exercises: [] });
  db.seed("workout_templates/t-std", { trainerId: "__standard__", isStandard: true, name: { en: "Std", es: "Est" }, exercises: [] });
  db.seed("users/client-a1", { coachId: "coach-a", displayName: "Ana", email: "ana@example.com" });
  db.seed("users/client-b1", { coachId: "coach-b", displayName: "Bea" });
  db.seed("user_mirror/pend@example.com", { coachId: "coach-a", pre_created: true, email: "pend@example.com" });
  db.seed("user_mirror/theirs@example.com", { coachId: "coach-b", pre_created: true });
  db.seed("user_mirror/raw@example.com", { coachId: "coach-a" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("auth gate", () => {
  it.each([
    ["assignTemplateRecurring", () => assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", weekday: 1 })],
    ["assignTemplateRecurringToPending", () => assignTemplateRecurringToPending({ templateId: "t-own", pendingEmail: "pend@example.com", startDate: "2026-06-15", weekday: 1 })],
    ["assignTemplateToPending", () => assignTemplateToPending({ templateId: "t-own", pendingEmail: "pend@example.com", scheduledFor: "2026-06-15" })],
    ["listPendingAssignments", () => listPendingAssignments("pend@example.com")],
    ["listFutureAssignmentsForTemplate", () => listFutureAssignmentsForTemplate("t-own")],
    ["countTemplateAssignments", () => countTemplateAssignments()],
    ["listWorkoutAssignmentGroups", () => listWorkoutAssignmentGroups()],
  ] as Array<[string, () => Promise<unknown>]>)("%s: signed-out / client / admin-only → Forbidden, no I/O", async (_n, call) => {
    for (const roles of [null, ["client"], ["admin"]]) {
      if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
      else signInAs("x", roles);
      await expect(call()).rejects.toThrow("Forbidden");
    }
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
  });
});

describe("assignTemplateRecurring", () => {
  it("legacy weekday=1 is MONDAY (0=Sun..6=Sat): one doc per Monday, shared seriesId, full wire shape", async () => {
    const out = await assignTemplateRecurring({
      templateId: "t-own",
      clientId: "client-a1",
      startDate: "2026-06-14", // a Sunday — the first match is the next day
      endDate: "2026-07-05",
      weekday: 1,
    });
    expect(out.count).toBe(3);
    expect(out.windowStart).toBe("2026-06-15");
    expect(out.windowEnd).toBe("2026-07-05");

    const docs = assignmentDocs();
    expect(docs.map((d) => d.data.scheduledFor)).toEqual(["2026-06-15", "2026-06-22", "2026-06-29"]);
    expect(docs.every((d) => weekdayOf(d.data.scheduledFor as string) === 1)).toBe(true);
    expect(docs.map((d) => d.id).sort()).toEqual([...out.ids].sort());

    const seriesIds = new Set(docs.map((d) => d.data.seriesId));
    expect(seriesIds.size).toBe(1);
    expect([...seriesIds][0]).toMatch(UUID_RE);

    for (const { id, data } of docs) {
      expect(id).toMatch(new RegExp(`^asg-client-a1-${(data.scheduledFor as string).replace(/-/g, "")}-`));
      expect(data).toMatchObject({
        templateId: "t-own",
        clientId: "client-a1",
        trainerId: "coach-a",
        status: "scheduled",
        scheduledTime: null,
        meetingNotes: null,
        timezone: null,
        recurrence: { kind: "weekly", weekday: 1 },
      });
      expect(data.createdAt).toBeInstanceOf(FakeTimestamp);
      expect(data.updatedAt).toBeInstanceOf(FakeTimestamp);
      expect(data.prescriptionUpdatedAt).toBeInstanceOf(FakeTimestamp);
      const snap = data.templateSnapshot as { name: unknown; exercises: Array<Record<string, unknown>> };
      expect(snap.name).toEqual({ en: "Legs", es: "Piernas" });
      expect(snap.exercises[0]).toMatchObject({ exerciseId: "ex-squat", name: { en: "Squat", es: "Sentadilla" }, transition_rest_seconds: 60 });
      expectNoUndefinedDeep(data);
    }
    // The series is announced ONCE on the coach-activity log.
    const ev = db.doc(`coach_activity/asg:${docs[0].data.seriesId}`);
    expect(ev).toMatchObject({ trainerId: "coach-a", clientId: "client-a1", deleted: false });
  });

  it("weekdays [3,1,1] dedupes + sorts to weekly_days [1,3] (Mon+Wed); a single weekday collapses to weekly", async () => {
    await assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", endDate: "2026-06-28", weekdays: [3, 1, 1] });
    let docs = assignmentDocs();
    expect(docs.map((d) => d.data.scheduledFor)).toEqual(["2026-06-15", "2026-06-17", "2026-06-22", "2026-06-24"]);
    expect(docs.map((d) => weekdayOf(d.data.scheduledFor as string))).toEqual([1, 3, 1, 3]);
    expect(docs[0].data.recurrence).toEqual({ kind: "weekly_days", weekdays: [1, 3] });

    db.store.clear();
    db.seed("workout_templates/t-own", { trainerId: "coach-a", name: { en: "Legs", es: "Piernas" }, exercises: [] });
    await assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", endDate: "2026-06-30", weekdays: [0] });
    docs = assignmentDocs();
    expect(docs.map((d) => d.data.scheduledFor)).toEqual(["2026-06-21", "2026-06-28"]); // Sundays
    expect(docs[0].data.recurrence).toEqual({ kind: "weekly", weekday: 0 });
  });

  it("every_n_days and monthly (clamped to month end) expand to the right civil dates", async () => {
    await assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", endDate: "2026-06-24", recurrence: { kind: "every_n_days", everyN: 3 } });
    expect(assignmentDocs().map((d) => d.data.scheduledFor)).toEqual(["2026-06-15", "2026-06-18", "2026-06-21", "2026-06-24"]);

    db.store.clear();
    db.seed("workout_templates/t-own", { trainerId: "coach-a", name: "Legs", exercises: [] });
    await assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-01-31", endDate: "2026-04-30", recurrence: { kind: "monthly", dayOfMonth: 31 } });
    expect(assignmentDocs().map((d) => d.data.scheduledFor)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("no end date: capped at 104 occurrences, windowEnd = start + 365 days", async () => {
    const out = await assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", recurrence: { kind: "daily" } });
    expect(out.count).toBe(104);
    expect(out.windowEnd).toBe("2027-06-15");
    const docs = assignmentDocs();
    expect(docs).toHaveLength(104);
    expect(docs[103].data.scheduledFor).toBe("2026-09-26");
    expect(new Set(docs.map((d) => d.data.seriesId)).size).toBe(1);
  });

  it("applies exerciseOverrides to every occurrence's snapshot and writes optional fields verbatim", async () => {
    await assignTemplateRecurring({
      templateId: "t-own",
      clientId: "client-a1",
      startDate: "2026-06-15",
      endDate: "2026-06-22",
      weekday: 1,
      scheduledTime: "07:30",
      meetingNotes: "Gym B",
      timezone: "America/Argentina/Buenos_Aires",
      exerciseOverrides: [{ index: 0, sets: 4, weightBySetKg: [70, 70, 70, 70] }],
    });
    for (const { data } of assignmentDocs()) {
      expect(data).toMatchObject({ scheduledTime: "07:30", meetingNotes: "Gym B", timezone: "America/Argentina/Buenos_Aires" });
      const ex = (data.templateSnapshot as { exercises: Array<Record<string, unknown>> }).exercises[0];
      expect(ex).toMatchObject({ sets: 4, weightBySetKg: [70, 70, 70, 70], reps: 5 });
    }
    // The template itself is never mutated.
    expect(db.doc("workout_templates/t-own")!.exercises).toEqual([{ exerciseId: "ex-squat", sets: 3, reps: 5, weightBySetKg: [60, 60, 60] }]);
  });

  it("a standard template is usable; another coach's / missing template is refused with no writes", async () => {
    await expect(assignTemplateRecurring({ templateId: "t-std", clientId: "client-a1", startDate: "2026-06-15", endDate: "2026-06-15", weekday: 1 })).resolves.toMatchObject({ count: 1 });
    db.writes.length = 0;
    await expect(assignTemplateRecurring({ templateId: "t-other", clientId: "client-a1", startDate: "2026-06-15", weekday: 1 })).rejects.toThrow("Not your template.");
    await expect(assignTemplateRecurring({ templateId: "nope", clientId: "client-a1", startDate: "2026-06-15", weekday: 1 })).rejects.toThrow("Template not found.");
    expect(db.writes).toEqual([]);
  });

  it("a window with no matching date throws and writes nothing; bad input is rejected at the schema", async () => {
    await expect(assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-16", endDate: "2026-06-20", weekday: 1 })).rejects.toThrow("No dates generated");
    await expect(assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", weekday: 7 })).rejects.toThrow();
    await expect(assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", weekday: 1, weekdays: [2] })).rejects.toThrow();
    await expect(assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate: "2026-06-15", endDate: "2026-06-01", weekday: 1 })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  // BUG (tenant isolation): assignTemplateRecurring never checks that
  // `users/{clientId}.coachId === trainer.uid` (workout-assignment-actions.ts
  // ~L880-960; same gap in assignTemplate ~L452 and bulkAssignTemplate). The
  // Admin SDK bypasses firestore.rules, so any coach can schedule a whole series
  // of workouts — with their own trainerId — onto ANOTHER coach's client, which
  // that client's app then renders. habit-actions.ts does gate this
  // (`clientSnap.get("coachId") === trainerUid`). Correct behaviour: refuse,
  // write nothing.
  it.failing("refuses to schedule a series onto another coach's client (no writes)", async () => {
    await expect(
      assignTemplateRecurring({ templateId: "t-own", clientId: "client-b1", startDate: "2026-06-15", endDate: "2026-06-29", weekday: 1 }),
    ).rejects.toThrow();
    expect(db.writesTo("workout_assignments/")).toEqual([]);
  });
});

describe("assignTemplateRecurringToPending", () => {
  it("writes pendingEmail + clientId:null docs with the same dates as the canonical expansion", async () => {
    const out = await assignTemplateRecurringToPending({
      templateId: "t-own",
      pendingEmail: "  PEND@Example.com ",
      startDate: "2026-06-14",
      endDate: "2026-06-28",
      weekdays: [1, 5],
    });
    const docs = assignmentDocs();
    expect(docs.map((d) => d.data.scheduledFor)).toEqual(["2026-06-15", "2026-06-19", "2026-06-22", "2026-06-26"]);
    expect(docs.map((d) => weekdayOf(d.data.scheduledFor as string))).toEqual([1, 5, 1, 5]);
    expect(out).toMatchObject({ count: 4, windowStart: "2026-06-15", windowEnd: "2026-06-28" });
    expect(new Set(docs.map((d) => d.data.seriesId)).size).toBe(1);
    for (const { id, data } of docs) {
      expect(id.startsWith("asg-pending-pend@example.com-")).toBe(true);
      expect(data).toMatchObject({
        clientId: null,
        pendingEmail: "pend@example.com",
        trainerId: "coach-a",
        status: "scheduled",
        scheduledTime: null,
        meetingNotes: null,
        timezone: null,
        recurrence: { kind: "weekly_days", weekdays: [1, 5] },
      });
      expect(data.createdAt).toBeInstanceOf(FakeTimestamp);
      expectNoUndefinedDeep(data);
    }
  });

  it.each([
    [{ kind: "daily" as const }, "2026-06-15", "2026-06-18"],
    [{ kind: "every_n_days" as const, everyN: 4 }, "2026-06-15", "2026-07-01"],
    [{ kind: "monthly" as const, dayOfMonth: 31 }, "2026-01-31", "2026-05-01"],
    [{ kind: "weekly" as const, weekday: 6 }, "2026-06-15", "2026-07-10"],
  ])("twin parity with assignTemplateRecurring for %j", async (recurrence, startDate, endDate) => {
    await assignTemplateRecurring({ templateId: "t-own", clientId: "client-a1", startDate, endDate, recurrence });
    const canonical = assignmentDocs().map((d) => d.data.scheduledFor);
    db.store.forEach((_v, k) => { if (k.startsWith("workout_assignments/")) db.store.delete(k); });
    await assignTemplateRecurringToPending({ templateId: "t-own", pendingEmail: "pend@example.com", startDate, endDate, recurrence });
    expect(assignmentDocs().map((d) => d.data.scheduledFor)).toEqual(canonical);
    expect(canonical.length).toBeGreaterThan(0);
  });

  it("refuses another coach's mirror, a non-pre_created mirror, a missing mirror, and a foreign template — no writes", async () => {
    const base = { templateId: "t-own", startDate: "2026-06-15", weekday: 1 };
    await expect(assignTemplateRecurringToPending({ ...base, pendingEmail: "theirs@example.com" })).rejects.toThrow("Not your pending client.");
    await expect(assignTemplateRecurringToPending({ ...base, pendingEmail: "raw@example.com" })).rejects.toThrow("Mirror not marked pre_created.");
    await expect(assignTemplateRecurringToPending({ ...base, pendingEmail: "ghost@example.com" })).rejects.toThrow("Pending client not found.");
    await expect(assignTemplateRecurringToPending({ ...base, templateId: "t-other", pendingEmail: "pend@example.com" })).rejects.toThrow("Not your template.");
    expect(db.writes).toEqual([]);
  });
});

describe("assignTemplateToPending", () => {
  it("writes ONE pending doc keyed by the normalized email", async () => {
    const { id } = await assignTemplateToPending({ templateId: "t-own", pendingEmail: "Pend@Example.com", scheduledFor: "2026-06-20", scheduledTime: "18:00" });
    expect(id).toMatch(/^asg-pending-pend@example\.com-20260620-/);
    const doc = db.doc(`workout_assignments/${id}`)!;
    expect(doc).toMatchObject({
      templateId: "t-own",
      clientId: null,
      pendingEmail: "pend@example.com",
      trainerId: "coach-a",
      scheduledFor: "2026-06-20",
      scheduledTime: "18:00",
      meetingNotes: null,
      timezone: null,
      status: "scheduled",
    });
    expect("seriesId" in doc).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(FakeTimestamp);
    expect(doc.prescriptionUpdatedAt).toBeInstanceOf(FakeTimestamp);
    expectNoUndefinedDeep(doc);
    expect(db.doc(`coach_activity/asg:${id}`)).toMatchObject({ trainerId: "coach-a", pendingEmail: "pend@example.com", clientId: null });
  });

  it("refuses foreign mirror / foreign template / bad civil date with no writes", async () => {
    await expect(assignTemplateToPending({ templateId: "t-own", pendingEmail: "theirs@example.com", scheduledFor: "2026-06-20" })).rejects.toThrow("Not your pending client.");
    await expect(assignTemplateToPending({ templateId: "t-other", pendingEmail: "pend@example.com", scheduledFor: "2026-06-20" })).rejects.toThrow("Not your template.");
    await expect(assignTemplateToPending({ templateId: "t-own", pendingEmail: "pend@example.com", scheduledFor: "20/06/2026" })).rejects.toThrow("Invalid civil date");
    expect(db.writes).toEqual([]);
  });
});

describe("listPendingAssignments", () => {
  it("lists only MY pre-loads for the normalized email, with localized name + recurrence", async () => {
    db.seed("workout_assignments/p1", { trainerId: "coach-a", pendingEmail: "pend@example.com", scheduledFor: "2026-06-20", templateSnapshot: { name: { en: "Legs", es: "Piernas" } }, seriesId: "S1", recurrence: { kind: "weekly", weekday: 6 } });
    db.seed("workout_assignments/p2", { trainerId: "coach-a", pendingEmail: "pend@example.com", scheduledFor: "2026-06-21", templateSnapshot: { name: "Plain" } });
    db.seed("workout_assignments/p3", { trainerId: "coach-b", pendingEmail: "pend@example.com", scheduledFor: "2026-06-22", templateSnapshot: { name: "B secret" } });
    db.seed("workout_assignments/p4", { trainerId: "coach-a", pendingEmail: "other@example.com", scheduledFor: "2026-06-22", templateSnapshot: { name: "Other" } });

    const rows = await listPendingAssignments(" PEND@example.com ");
    expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "p1", templateName: "Piernas", scheduledFor: "2026-06-20", seriesId: "S1", recurrence: { kind: "weekly", weekday: 6 } },
      { id: "p2", templateName: "Plain", scheduledFor: "2026-06-21", seriesId: null, recurrence: null },
    ]);
    expect(db.queries[0].filters).toEqual([
      { field: "trainerId", op: "==", value: "coach-a" },
      { field: "pendingEmail", op: "==", value: "pend@example.com" },
    ]);
  });
});

describe("read-side aggregations (today = 2026-06-15 UTC)", () => {
  beforeEach(() => {
    db.seed("users/client-a2", { coachId: "coach-a", displayName: "Bruno", coachNickname: "Bru" });
    const a = (id: string, data: Record<string, unknown>) =>
      db.seed(`workout_assignments/${id}`, { trainerId: "coach-a", templateId: "t-own", status: "scheduled", ...data });
    a("past", { clientId: "client-a1", scheduledFor: "2026-06-14" });
    a("s1-a", { clientId: "client-a1", scheduledFor: "2026-06-22", seriesId: "S1" });
    a("s1-b", { clientId: "client-a1", scheduledFor: "2026-06-15", seriesId: "S1" });
    a("done-future", { clientId: "client-a1", scheduledFor: "2026-06-30", status: "completed" });
    a("a2-one", { clientId: "client-a2", scheduledFor: "2026-06-18" });
    a("std-one", { clientId: "client-a2", scheduledFor: "2026-06-16", templateId: "t-std" });
    a("std-past", { clientId: "client-a2", scheduledFor: "2026-06-01", templateId: "t-std" });
    // another coach's assignment on MY template id must never leak in
    db.seed("workout_assignments/foreign", { trainerId: "coach-b", templateId: "t-own", clientId: "client-b1", scheduledFor: "2026-06-20", status: "scheduled" });
  });

  it("listFutureAssignmentsForTemplate groups today/future scheduled sessions per client, sorted by next date", async () => {
    await expect(listFutureAssignmentsForTemplate("t-own")).resolves.toEqual({
      templateId: "t-own",
      assignmentCount: 3,
      clients: [
        { uid: "client-a1", name: "Ana", sessions: 2, nextScheduledFor: "2026-06-15" },
        { uid: "client-a2", name: "Bru", sessions: 1, nextScheduledFor: "2026-06-18" },
      ],
    });
    expect(db.writes).toEqual([]);
  });

  it("listFutureAssignmentsForTemplate refuses another coach's (or a standard) template", async () => {
    await expect(listFutureAssignmentsForTemplate("t-other")).rejects.toThrow("Not your template.");
    await expect(listFutureAssignmentsForTemplate("t-std")).rejects.toThrow("Not your template.");
    await expect(listFutureAssignmentsForTemplate("ghost")).rejects.toThrow("Template not found.");
    expect(db.queries).toEqual([]);
  });

  it("countTemplateAssignments collapses a series to 1 and ignores past-only templates/other coaches", async () => {
    // t-own: S1 (1) + done-future (1) + a2-one (1) = 3 ; t-std: std-one (1)
    await expect(countTemplateAssignments()).resolves.toEqual({ "t-own": 3, "t-std": 1 });
  });

  it("listWorkoutAssignmentGroups groups by template then client, most clients first", async () => {
    const groups = await listWorkoutAssignmentGroups();
    expect(groups).toEqual([
      {
        templateId: "t-own",
        templateName: { en: "Legs", es: "Piernas" },
        clientCount: 2,
        clients: [
          { uid: "client-a1", name: "Ana", photoURL: null, sessions: 2, nextScheduledFor: "2026-06-15" },
          { uid: "client-a2", name: "Bru", photoURL: null, sessions: 1, nextScheduledFor: "2026-06-18" },
        ],
      },
      {
        templateId: "t-std",
        templateName: { en: "Std", es: "Est" },
        clientCount: 1,
        clients: [{ uid: "client-a2", name: "Bru", photoURL: null, sessions: 1, nextScheduledFor: "2026-06-16" }],
      },
    ]);
    expect(groups.flatMap((g) => g.clients.map((c) => c.uid))).not.toContain("client-b1");
  });

  it("listWorkoutAssignmentGroups: nothing upcoming → []", async () => {
    db.store.clear();
    await expect(listWorkoutAssignmentGroups()).resolves.toEqual([]);
  });
});
