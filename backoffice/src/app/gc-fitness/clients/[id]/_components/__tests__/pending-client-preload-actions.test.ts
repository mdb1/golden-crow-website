// __tests__/pending-client-preload-actions.test.ts
//
// #382 — the pending-client preload forms. These actions do NO auth of their
// own: `normalizedEmail` arrives via `.bind` (client-visible, alterable) and
// ownership is enforced by the action each one delegates to
// (assignTemplateToPending / assignTemplateRecurringToPending /
// createPendingHabit re-check the mirror's coachId; deleteAssignment /
// softDeleteHabit re-check the doc). So what this suite pins is the
// FormData → delegate-call mapping (which action, with what), the early
// returns that skip the delegate entirely, and that a delegate rejection
// (e.g. "Not your pending client.") propagates WITHOUT revalidating.

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  assignTemplateToPending: jest.fn(async () => ({ id: "a1" })),
  assignTemplateRecurringToPending: jest.fn(async () => ({ created: 3 })),
  deleteAssignment: jest.fn(async () => ({ ok: true })),
}));
jest.mock("@/lib/gc-fitness/habit-actions", () => ({
  createPendingHabit: jest.fn(async () => ({ id: "h1" })),
  listHabitTemplates: jest.fn(async () => []),
  softDeleteHabit: jest.fn(async () => ({ ok: true })),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "America/Argentina/Buenos_Aires"),
}));

import { revalidatePath } from "next/cache";

import { habitCreateSchema } from "@/lib/gc-fitness/habit-schema";

import {
  assignTemplateRecurringToPending,
  assignTemplateToPending,
  deleteAssignment,
} from "@/lib/gc-fitness/workout-assignment-actions";
import {
  createPendingHabit,
  listHabitTemplates,
  softDeleteHabit,
} from "@/lib/gc-fitness/habit-actions";

import {
  removePendingHabit,
  removePendingWorkout,
  submitHabit,
  submitWorkoutAssignment,
} from "../pending-client-preload-actions";

const EMAIL = "new.client@example.com";
const once = assignTemplateToPending as jest.Mock;
const recurring = assignTemplateRecurringToPending as jest.Mock;
const delAssignment = deleteAssignment as jest.Mock;
const createHabit = createPendingHabit as jest.Mock;
const listTemplates = listHabitTemplates as jest.Mock;
const softDelete = softDeleteHabit as jest.Mock;
const revalidate = revalidatePath as jest.Mock;

function form(entries: Array<[string, string]>): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

function expectRevalidated(email = EMAIL) {
  expect(revalidate.mock.calls).toEqual([
    [`/gc-fitness/clients/mirror:${email}`],
    [`/gc-fitness/clients/pending/${encodeURIComponent(email)}`],
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => jest.useRealTimers());

describe("submitWorkoutAssignment", () => {
  it.each([
    ["no templateId", [["scheduledFor", "2026-06-20"]]],
    ["no scheduledFor", [["templateId", "t1"]]],
  ] as Array<[string, Array<[string, string]>]>)("%s → no delegate call, no revalidate", async (_n, entries) => {
    await submitWorkoutAssignment(EMAIL, form(entries));
    expect(once).not.toHaveBeenCalled();
    expect(recurring).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("mode=once → assignTemplateToPending with the BOUND email; blanks become undefined", async () => {
    await submitWorkoutAssignment(
      EMAIL,
      form([
        ["templateId", "t1"],
        ["scheduledFor", "2026-06-20"],
        ["scheduledTime", "  "],
        ["meetingNotes", " bring bands "],
      ]),
    );
    expect(once).toHaveBeenCalledWith({
      templateId: "t1",
      pendingEmail: EMAIL,
      scheduledFor: "2026-06-20",
      scheduledTime: undefined,
      meetingNotes: "bring bands",
    });
    expect(recurring).not.toHaveBeenCalled();
    expectRevalidated();
  });

  it.each([
    ["daily", [], { kind: "daily" }],
    ["everyN", [["everyN", "5"]], { kind: "every_n_days", everyN: 5 }],
    ["everyN", [["everyN", "1"]], { kind: "every_n_days", everyN: 2 }],
    ["everyN", [["everyN", "99"]], { kind: "every_n_days", everyN: 30 }],
    ["everyN", [["everyN", "abc"]], { kind: "every_n_days", everyN: 2 }],
    ["monthly", [], { kind: "monthly", dayOfMonth: 20 }],
    ["weekly", [["weekdays", "3"]], { kind: "weekly", weekday: 3 }],
    ["weekly", [], { kind: "weekly", weekday: 1 }],
    ["weekly", [["weekdays", "1"], ["weekdays", "9"], ["weekdays", "5"]], { kind: "weekly_days", weekdays: [1, 5] }],
  ] as Array<[string, Array<[string, string]>, unknown]>)(
    "mode=%s %j → recurrence %j",
    async (mode, extra, recurrence) => {
      await submitWorkoutAssignment(
        EMAIL,
        form([
          ["templateId", "t1"],
          ["scheduledFor", "2026-06-20"],
          ["mode", mode],
          ["endDate", "2026-08-01"],
          ...extra,
        ]),
      );
      expect(once).not.toHaveBeenCalled();
      expect(recurring).toHaveBeenCalledWith({
        templateId: "t1",
        pendingEmail: EMAIL,
        startDate: "2026-06-20",
        recurrence,
        endDate: "2026-08-01",
        scheduledTime: undefined,
        meetingNotes: undefined,
      });
      expectRevalidated();
    },
  );

  it("propagates the delegate's ownership rejection and does not revalidate", async () => {
    once.mockRejectedValueOnce(new Error("Not your pending client."));
    await expect(
      submitWorkoutAssignment(
        "someone-elses@example.com",
        form([
          ["templateId", "t1"],
          ["scheduledFor", "2026-06-20"],
        ]),
      ),
    ).rejects.toThrow("Not your pending client.");
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("submitHabit", () => {
  it("no template and no name → returns without creating", async () => {
    await submitHabit(EMAIL, form([["name", "   "]]));
    expect(createHabit).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("an unknown/foreign templateId with no name creates nothing", async () => {
    listTemplates.mockResolvedValueOnce([{ id: "mine", name: { en: "W", es: "A" } }]);
    await submitHabit(EMAIL, form([["templateId", "not-mine"]]));
    expect(listTemplates).toHaveBeenCalledTimes(1);
    expect(createHabit).not.toHaveBeenCalled();
  });

  it("free-text daily habit: startsOn defaults to the COACH's civil today", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    // 01:00Z on the 16th is still the 15th in Buenos Aires.
    jest.setSystemTime(new Date("2026-06-16T01:00:00Z"));
    await submitHabit(EMAIL, form([["name", " Drink water "]]));
    expect(listTemplates).not.toHaveBeenCalled();
    expect(createHabit).toHaveBeenCalledWith(EMAIL, {
      type: "binary",
      name: { en: "Drink water", es: "Drink water" },
      clientId: `pending:${EMAIL}`,
      reminderEnabled: false,
      scheduleType: "recurring",
      startsOn: "2026-06-15",
      endsOn: undefined,
      scheduleCadence: "daily",
      scheduleWeekdays: undefined,
      scheduleDayOfMonth: undefined,
      scheduleMonthDays: undefined,
    });
    expectRevalidated();
  });

  // Regression (#451): the free-text path sent `name` as a plain STRING, but
  // createPendingHabit parses with habitCreateSchema, whose `name` is a strict
  // `{ en, es }` object — so pre-loading any non-template habit for a pending
  // client threw a ZodError every time. The payload must survive the REAL
  // schema the delegate applies (the delegate itself is mocked here).
  it("free-text habit payload parses with the real habitCreateSchema", async () => {
    await submitHabit(EMAIL, form([["name", "Drink water"], ["startsOn", "2026-06-20"]]));
    const payload = createHabit.mock.calls[0][1] as Record<string, unknown>;
    expect(habitCreateSchema.safeParse(payload).success).toBe(true);
  });

  it("template habit uses the template's bilingual name; weekly keeps valid ISO weekdays", async () => {
    listTemplates.mockResolvedValueOnce([{ id: "tpl", name: { en: "Walk", es: "Caminar" } }]);
    await submitHabit(
      EMAIL,
      form([
        ["templateId", "tpl"],
        ["startsOn", "2026-06-20"],
        ["endsOn", "2026-07-20"],
        ["scheduleCadence", "weekly"],
        ["scheduleWeekdays", "1"],
        ["scheduleWeekdays", "0"],
        ["scheduleWeekdays", "7"],
      ]),
    );
    expect(createHabit).toHaveBeenCalledWith(
      EMAIL,
      expect.objectContaining({
        name: { en: "Walk", es: "Caminar" },
        startsOn: "2026-06-20",
        endsOn: "2026-07-20",
        scheduleCadence: "weekly",
        scheduleWeekdays: [1, 7],
        scheduleMonthDays: undefined,
      }),
    );
  });

  it("monthly: sorted month days win; a lone scheduleDayOfMonth is the fallback", async () => {
    await submitHabit(
      EMAIL,
      form([
        ["name", "x"],
        ["startsOn", "2026-06-01"],
        ["scheduleCadence", "monthly"],
        ["scheduleMonthDays", "20"],
        ["scheduleMonthDays", "5"],
        ["scheduleMonthDays", "40"],
      ]),
    );
    expect(createHabit.mock.calls[0][1]).toMatchObject({
      scheduleCadence: "monthly",
      scheduleMonthDays: [5, 20],
      scheduleDayOfMonth: 5,
    });

    await submitHabit(
      EMAIL,
      form([
        ["name", "x"],
        ["startsOn", "2026-06-01"],
        ["scheduleCadence", "monthly"],
        ["scheduleDayOfMonth", "12"],
      ]),
    );
    expect(createHabit.mock.calls[1][1]).toMatchObject({
      scheduleMonthDays: [12],
      scheduleDayOfMonth: 12,
    });
  });

  it("one-time habit carries no cadence fields; unknown cadence falls back to daily", async () => {
    await submitHabit(
      EMAIL,
      form([
        ["name", "x"],
        ["startsOn", "2026-06-01"],
        ["scheduleType", "one-time"],
        ["scheduleCadence", "weekly"],
        ["scheduleWeekdays", "2"],
      ]),
    );
    expect(createHabit.mock.calls[0][1]).toMatchObject({
      scheduleType: "one-time",
      scheduleCadence: undefined,
      scheduleWeekdays: undefined,
      scheduleMonthDays: undefined,
    });

    await submitHabit(
      EMAIL,
      form([
        ["name", "x"],
        ["startsOn", "2026-06-01"],
        ["scheduleType", "garbage"],
        ["scheduleCadence", "hourly"],
      ]),
    );
    expect(createHabit.mock.calls[1][1]).toMatchObject({
      scheduleType: "recurring",
      scheduleCadence: "daily",
    });
  });

  it("propagates createPendingHabit's ownership rejection without revalidating", async () => {
    createHabit.mockRejectedValueOnce(new Error("Not your pending client."));
    await expect(
      submitHabit("other@example.com", form([["name", "x"], ["startsOn", "2026-06-01"]])),
    ).rejects.toThrow("Not your pending client.");
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("removePendingWorkout", () => {
  it("no assignmentId → nothing", async () => {
    await removePendingWorkout(EMAIL, form([["assignmentId", "  "]]));
    expect(delAssignment).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("deletes one occurrence, or cascades from a date", async () => {
    await removePendingWorkout(EMAIL, form([["assignmentId", "a1"]]));
    expect(delAssignment).toHaveBeenLastCalledWith("a1", undefined);
    expectRevalidated();

    await removePendingWorkout(
      EMAIL,
      form([
        ["assignmentId", "a1"],
        ["cascadeFromDate", "2026-06-20"],
      ]),
    );
    expect(delAssignment).toHaveBeenLastCalledWith("a1", { cascadeFromDate: "2026-06-20" });
  });

  it("propagates deleteAssignment's ownership rejection", async () => {
    delAssignment.mockRejectedValueOnce(new Error("Not your assignment."));
    await expect(removePendingWorkout(EMAIL, form([["assignmentId", "a9"]]))).rejects.toThrow(
      "Not your assignment.",
    );
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("removePendingHabit", () => {
  it("no habitId → nothing; otherwise soft-deletes and revalidates", async () => {
    await removePendingHabit(EMAIL, form([]));
    expect(softDelete).not.toHaveBeenCalled();

    await removePendingHabit(EMAIL, form([["habitId", " h1 "]]));
    expect(softDelete).toHaveBeenCalledWith("h1");
    expectRevalidated();
  });

  it("propagates softDeleteHabit's ownership rejection", async () => {
    softDelete.mockRejectedValueOnce(new Error("Not your habit."));
    await expect(removePendingHabit(EMAIL, form([["habitId", "h9"]]))).rejects.toThrow(
      "Not your habit.",
    );
    expect(revalidate).not.toHaveBeenCalled();
  });
});
