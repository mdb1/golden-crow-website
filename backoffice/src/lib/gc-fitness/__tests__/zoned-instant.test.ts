// __tests__/zoned-instant.test.ts
//
// #747 — a wall clock the coach typed has to come back as the same wall clock.

import { zonedWallClockInstant } from "@/lib/gc-fitness/zoned-instant";

const BA = "America/Argentina/Buenos_Aires"; // UTC-3, no DST
const MADRID = "Europe/Madrid"; // UTC+1 / UTC+2 across DST

function wallClockIn(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

describe("zonedWallClockInstant", () => {
  it("reads the wall clock in the coach's zone, not the server's", () => {
    // The bug: `new Date("2026-08-05T18:00:00")` on Vercel is 18:00Z, which the
    // coach then reads back as 15:00.
    expect(zonedWallClockInstant("2026-08-05", "18:00", BA)?.toISOString()).toBe(
      "2026-08-05T21:00:00.000Z",
    );
    expect(zonedWallClockInstant("2026-08-05", "18:00", "UTC")?.toISOString()).toBe(
      "2026-08-05T18:00:00.000Z",
    );
  });

  it("round-trips: what was typed is what is displayed", () => {
    for (const [date, time, zone] of [
      ["2026-08-05", "18:00", BA],
      ["2026-01-15", "09:00", MADRID],
      ["2026-07-15", "09:00", MADRID],
      ["2026-12-31", "23:30", "Asia/Tokyo"],
      ["2026-03-01", "00:00", "America/Los_Angeles"],
    ] as const) {
      const instant = zonedWallClockInstant(date, time, zone)!;
      expect(wallClockIn(instant, zone)).toBe(
        `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}, ${time}`,
      );
    }
  });

  it("lands on the right side of a DST transition", () => {
    // Madrid springs forward 2026-03-29 at 02:00 → 03:00. A single-pass offset
    // guess (read at the UTC instant) puts 12:00 an hour off.
    const before = zonedWallClockInstant("2026-03-28", "12:00", MADRID)!;
    const after = zonedWallClockInstant("2026-03-30", "12:00", MADRID)!;
    expect(before.toISOString()).toBe("2026-03-28T11:00:00.000Z"); // UTC+1
    expect(after.toISOString()).toBe("2026-03-30T10:00:00.000Z"); // UTC+2
  });

  it("rejects a malformed date or time instead of inventing one", () => {
    expect(zonedWallClockInstant("nope", "18:00", BA)).toBeNull();
    expect(zonedWallClockInstant("2026-08-05", "6pm", BA)).toBeNull();
    expect(zonedWallClockInstant("2026-13-45", "18:00", BA)).toBeNull();
  });

  it("falls back to the host zone for an unknown identifier rather than throwing", () => {
    expect(zonedWallClockInstant("2026-08-05", "18:00", "Mars/Olympus")).toBeInstanceOf(Date);
  });
});
