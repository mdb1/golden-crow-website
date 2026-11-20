// #488 — the "needs attention" rows on the dashboard always said "No activity"
// (hardcoded) next to "4 days ago". The row's primary text now comes from the
// roster's `lastActivityKind` through `lastActionMessageKey`.
import fs from "node:fs";
import path from "node:path";

import { lastActionMessageKey, pickLastActivityKind } from "../last-activity-kind";

const d = (iso: string) => new Date(iso);

describe("pickLastActivityKind", () => {
  it("returns null with no activity", () => {
    expect(pickLastActivityKind({ workout: null, habit: null, photo: null })).toBeNull();
  });
  it("picks the most recent surface", () => {
    expect(pickLastActivityKind({ workout: d("2026-06-01"), habit: d("2026-06-03"), photo: d("2026-06-02") })).toBe("habit");
    expect(pickLastActivityKind({ workout: null, habit: null, photo: d("2026-06-02") })).toBe("photo");
  });
  it("ties go workout → habit → photo; invalid dates are ignored", () => {
    const t = d("2026-06-01T00:00:00Z");
    expect(pickLastActivityKind({ workout: t, habit: t, photo: t })).toBe("workout");
    expect(pickLastActivityKind({ workout: d("nope"), habit: null, photo: t })).toBe("photo");
  });
});

describe("lastActionMessageKey", () => {
  it("never answers 'noActivity' for a client WITH activity", () => {
    expect(lastActionMessageKey("workout")).toBe("lastActionWorkout");
    expect(lastActionMessageKey("habit")).toBe("lastActionHabit");
    expect(lastActionMessageKey("photo")).toBe("lastActionPhoto");
    expect(lastActionMessageKey(null)).toBe("noActivity");
    expect(lastActionMessageKey(undefined)).toBe("noActivity");
  });

  it.each(["en", "es"])("every key exists in messages/%s.json", (locale) => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../../messages", `${locale}.json`), "utf8"),
    ) as { dashboard: Record<string, string> };
    for (const kind of ["workout", "habit", "photo", null] as const) {
      expect(typeof messages.dashboard[lastActionMessageKey(kind)]).toBe("string");
    }
  });
});
