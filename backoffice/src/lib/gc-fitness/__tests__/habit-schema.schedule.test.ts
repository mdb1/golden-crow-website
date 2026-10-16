// __tests__/habit-schema.schedule.test.ts
//
// The cross-field schedule / reminder rules of `applyTypeConditionalRules` —
// the branches habit-schema.test.ts (type/strip/URL cases) does not reach.
// These are the server-side guards against a hand-crafted Server Action input:
// a weekly habit with no weekdays never shows up on any day, a one-time habit
// with a cadence would be expanded as recurring by the apps, etc.
//
// Each rejection asserts the PATH of the issue, so a rule that starts firing on
// the wrong field (or a different rule catching the input) is noticed.

import {
  habitCreateSchema,
  habitTemplateCreateSchema,
  habitTemplateUpdateSchema,
  habitUpdateSchemaForType,
} from "../habit-schema";

const BASE = {
  clientId: "c1",
  type: "binary" as const,
  name: { en: "Walk", es: "Caminar" },
  reminderEnabled: false,
};

function issuePaths(input: unknown, schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } } } = habitCreateSchema): string[] {
  const r = schema.safeParse(input);
  if (r.success) return [];
  return r.error!.issues.map((i) => i.path.join("."));
}

describe("defaults and preprocessing", () => {
  it("scheduleType defaults to recurring; empty/null dates become undefined", () => {
    const parsed = habitCreateSchema.parse({ ...BASE, startsOn: "", endsOn: null });
    expect(parsed.scheduleType).toBe("recurring");
    expect(parsed).not.toHaveProperty("startsOn", "");
    expect(parsed.startsOn).toBeUndefined();
    expect(parsed.endsOn).toBeUndefined();
  });

  it("rejects malformed civil dates", () => {
    expect(issuePaths({ ...BASE, startsOn: "2026-6-1" })).toEqual(["startsOn"]);
    expect(issuePaths({ ...BASE, endsOn: "01/06/2026" })).toEqual(["endsOn"]);
  });

  it("trims names and rejects whitespace-only names", () => {
    expect(habitCreateSchema.parse({ ...BASE, name: { en: "  Walk ", es: " Caminar " } }).name).toEqual({
      en: "Walk",
      es: "Caminar",
    });
    expect(issuePaths({ ...BASE, name: { en: "   ", es: "x" } })).toEqual(["name.en"]);
  });

  it("rejects extra keys inside name/description (strict)", () => {
    expect(issuePaths({ ...BASE, name: { en: "a", es: "b", fr: "c" } })).toEqual(["name"]);
    expect(issuePaths({ ...BASE, description: { en: "a", pt: "b" } })).toEqual(["description"]);
  });

  it("rejects an empty / whitespace clientId", () => {
    expect(issuePaths({ ...BASE, clientId: "  " })).toEqual(["clientId"]);
  });
});

describe("date range", () => {
  it("endsOn before startsOn is rejected; same day and later are fine", () => {
    expect(issuePaths({ ...BASE, startsOn: "2026-06-10", endsOn: "2026-06-09" })).toEqual(["endsOn"]);
    expect(issuePaths({ ...BASE, startsOn: "2026-06-10", endsOn: "2026-06-10" })).toEqual([]);
    expect(issuePaths({ ...BASE, startsOn: "2026-06-10", endsOn: "2026-07-01" })).toEqual([]);
  });

  it("an endsOn without startsOn is not range-checked", () => {
    expect(issuePaths({ ...BASE, endsOn: "2000-01-01" })).toEqual([]);
  });
});

describe("one-time habits", () => {
  const ONE = { ...BASE, scheduleType: "one-time" as const, startsOn: "2026-06-10" };

  it("accepts a plain one-time habit, with or without a matching endsOn", () => {
    expect(issuePaths(ONE)).toEqual([]);
    expect(issuePaths({ ...ONE, endsOn: "2026-06-10" })).toEqual([]);
  });

  it("rejects an endsOn different from startsOn", () => {
    expect(issuePaths({ ...ONE, endsOn: "2026-06-11" })).toEqual(["endsOn"]);
  });

  it.each([
    ["scheduleCadence", { scheduleCadence: "daily" }],
    ["scheduleWeekdays", { scheduleWeekdays: [1] }],
    ["scheduleDayOfMonth", { scheduleDayOfMonth: 5 }],
  ])("rejects a recurrence field: %s", (path, extra) => {
    expect(issuePaths({ ...ONE, ...extra })).toEqual([path]);
  });

  it("CURRENT: scheduleMonthDays is NOT rejected on a one-time habit", () => {
    // The one-time branch checks cadence/weekdays/dayOfMonth but not monthDays,
    // then returns before the recurring checks. Pinned as-is.
    expect(issuePaths({ ...ONE, scheduleMonthDays: [1, 15] })).toEqual([]);
  });
});

describe("recurring cadence", () => {
  it("daily (default) accepts no extra fields", () => {
    expect(issuePaths({ ...BASE, scheduleCadence: "daily" })).toEqual([]);
  });

  it("weekly needs at least one weekday", () => {
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly" })).toEqual(["scheduleWeekdays"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [] })).toEqual(["scheduleWeekdays"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [1, 3, 5] })).toEqual([]);
  });

  it("weekdays are ISO 1..7 integers, at most 7", () => {
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [0] })).toEqual(["scheduleWeekdays.0"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [8] })).toEqual(["scheduleWeekdays.0"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [1.5] })).toEqual(["scheduleWeekdays.0"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [1, 2, 3, 4, 5, 6, 7, 1] })).toEqual([
      "scheduleWeekdays",
    ]);
  });

  it("weekdays on a non-weekly cadence are rejected (incl. implicit daily)", () => {
    expect(issuePaths({ ...BASE, scheduleWeekdays: [1] })).toEqual(["scheduleWeekdays"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly", scheduleDayOfMonth: 1, scheduleWeekdays: [1] })).toEqual([
      "scheduleWeekdays",
    ]);
  });

  it("monthly needs a day of month (single or list)", () => {
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly" })).toEqual(["scheduleMonthDays"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly", scheduleDayOfMonth: 31 })).toEqual([]);
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly", scheduleMonthDays: [1, 15] })).toEqual([]);
  });

  it("monthly day bounds: 1..31, list non-empty", () => {
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly", scheduleDayOfMonth: 0 })).toContain("scheduleDayOfMonth");
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly", scheduleDayOfMonth: 32 })).toContain("scheduleDayOfMonth");
    expect(issuePaths({ ...BASE, scheduleCadence: "monthly", scheduleMonthDays: [] })).toContain("scheduleMonthDays");
  });

  it("day-of-month fields on a non-monthly cadence are rejected (dayOfMonth reported first)", () => {
    expect(issuePaths({ ...BASE, scheduleDayOfMonth: 3 })).toEqual(["scheduleDayOfMonth"]);
    expect(issuePaths({ ...BASE, scheduleMonthDays: [3] })).toEqual(["scheduleMonthDays"]);
    expect(issuePaths({ ...BASE, scheduleCadence: "weekly", scheduleWeekdays: [1], scheduleDayOfMonth: 3, scheduleMonthDays: [3] })).toEqual([
      "scheduleDayOfMonth",
    ]);
  });
});

describe("reminders", () => {
  const ON = { ...BASE, reminderEnabled: true, reminderTime: "08:30" };

  it("daily (default) reminder only needs a time", () => {
    expect(issuePaths(ON)).toEqual([]);
  });

  it("a disabled reminder may carry a stale time / cadence without complaint", () => {
    expect(issuePaths({ ...BASE, reminderTime: "08:30", reminderCadence: "weekly" })).toEqual([]);
  });

  it("weekly reminder needs weekdays", () => {
    expect(issuePaths({ ...ON, reminderCadence: "weekly" })).toEqual(["reminderWeekdays"]);
    expect(issuePaths({ ...ON, reminderCadence: "weekly", reminderWeekdays: [] })).toEqual(["reminderWeekdays"]);
    expect(issuePaths({ ...ON, reminderCadence: "weekly", reminderWeekdays: [7] })).toEqual([]);
  });

  it("monthly reminder needs a day of month (single or list)", () => {
    expect(issuePaths({ ...ON, reminderCadence: "monthly" })).toEqual(["reminderMonthDays"]);
    expect(issuePaths({ ...ON, reminderCadence: "monthly", reminderDayOfMonth: 1 })).toEqual([]);
    expect(issuePaths({ ...ON, reminderCadence: "monthly", reminderMonthDays: [28] })).toEqual([]);
  });

  it("reminderMonthDays on a non-monthly enabled reminder is rejected", () => {
    expect(issuePaths({ ...ON, reminderMonthDays: [1] })).toEqual(["reminderMonthDays"]);
    expect(issuePaths({ ...ON, reminderCadence: "weekly", reminderWeekdays: [1], reminderMonthDays: [1] })).toEqual([
      "reminderMonthDays",
    ]);
  });

  it("missing time on an enabled reminder is reported on reminderTime", () => {
    expect(issuePaths({ ...BASE, reminderEnabled: true })).toEqual(["reminderTime"]);
  });

  it.each(["00:00", "09:05", "23:59"])("accepts reminderTime %s", (time) => {
    expect(issuePaths({ ...ON, reminderTime: time })).toEqual([]);
  });

  it.each(["9:05", "09:60", "30:00", "0905", "09:05:00"])("rejects reminderTime %s", (time) => {
    expect(issuePaths({ ...ON, reminderTime: time })).toEqual(["reminderTime"]);
  });

  // FINDING: the HH regex is `[0-2][0-9]`, so 24:00–29:59 pass validation and get
  // stored. iOS builds a DateComponents(hour: 25) trigger from it. Flip to `it`
  // once the regex is `([01][0-9]|2[0-3])`.
  it.failing.each(["24:00", "25:30", "29:59"])("should reject out-of-range hour %s", (time) => {
    expect(issuePaths({ ...ON, reminderTime: time })).toEqual(["reminderTime"]);
  });
});

describe("the other schemas apply the same rules", () => {
  it("template create: no clientId, same schedule rules", () => {
    const { clientId: _omit, ...tpl } = BASE;
    void _omit;
    expect(issuePaths(tpl, habitTemplateCreateSchema)).toEqual([]);
    expect(issuePaths({ ...tpl, scheduleCadence: "weekly" }, habitTemplateCreateSchema)).toEqual(["scheduleWeekdays"]);
  });

  it("update: same schedule rules; clientId/type stripped", () => {
    const schema = habitUpdateSchemaForType("binary");
    const parsed = schema.parse({ ...BASE, clientId: "other", type: "binary" });
    expect(parsed).not.toHaveProperty("clientId");
    expect(parsed).not.toHaveProperty("type");
    expect(issuePaths({ name: BASE.name, reminderEnabled: false, scheduleCadence: "monthly" }, schema)).toEqual([
      "scheduleMonthDays",
    ]);
  });

  it("template update: only the intrinsic fields survive (no schedule rules, recurrence stripped)", () => {
    const parsed = habitTemplateUpdateSchema.parse({
      name: BASE.name,
      reminderEnabled: false,
      scheduleCadence: "weekly",
      clientId: "x",
    });
    expect(Object.keys(parsed).sort()).toEqual(["name", "reminderEnabled"]);
  });
});
