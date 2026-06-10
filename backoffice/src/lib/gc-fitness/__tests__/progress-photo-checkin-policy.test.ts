// progress-photo-checkin-policy.test.ts
//
// Twin suite for the progress-photo weekly check-in gate (issue #160). The SAME fixtures +
// expected outputs are mirrored in the iOS Swift Testing suite and the Android jUnit suite.
// Identical output for identical input is the load-bearing parity invariant.

import {
  addCivilDays,
  evaluateProgressPhotoCheckIn,
  type ProgressPhotoCheckInInput,
} from "../progress-photo-checkin-policy";

const tz = "UTC";

function photo(angle: string | null, checkInDate: string | null): ProgressPhotoCheckInInput {
  return { angle, checkInDate };
}

describe("evaluateProgressPhotoCheckIn (issue #160)", () => {
  it("empty list → baseline incomplete, eligible, no next date", () => {
    const r = evaluateProgressPhotoCheckIn([], "2026-06-10", tz);
    expect(r.baselineComplete).toBe(false);
    expect(r.lastCheckInDate).toBeNull();
    expect(r.nextEligibleDate).toBeNull();
    expect(r.isEligible).toBe(true);
  });

  it("one angle x1 → baseline incomplete → eligible", () => {
    const r = evaluateProgressPhotoCheckIn([photo("front", "2026-06-10")], "2026-06-10", tz);
    expect(r.baselineComplete).toBe(false);
    expect(r.isEligible).toBe(true);
  });

  it("front x2 only → baseline complete → gated; next = last + 7", () => {
    const r = evaluateProgressPhotoCheckIn(
      [photo("front", "2026-06-10"), photo("front", "2026-06-10")],
      "2026-06-10",
      tz,
    );
    expect(r.baselineComplete).toBe(true);
    expect(r.lastCheckInDate).toBe("2026-06-10");
    expect(r.nextEligibleDate).toBe("2026-06-17");
    expect(r.isEligible).toBe(false);
  });

  it("front x2 + side x1 → baseline INCOMPLETE (side stuck at 1) → eligible", () => {
    const r = evaluateProgressPhotoCheckIn(
      [photo("front", "2026-06-10"), photo("front", "2026-06-10"), photo("side", "2026-06-10")],
      "2026-06-10",
      tz,
    );
    expect(r.baselineComplete).toBe(false);
    expect(r.isEligible).toBe(true);
  });

  it("all angles x2, last check-in 6 days ago → gated, not eligible", () => {
    const photos = [
      photo("front", "2026-06-04"),
      photo("front", "2026-06-04"),
      photo("side", "2026-06-04"),
      photo("side", "2026-06-04"),
      photo("back", "2026-06-04"),
      photo("back", "2026-06-04"),
    ];
    const r = evaluateProgressPhotoCheckIn(photos, "2026-06-10", tz);
    expect(r.baselineComplete).toBe(true);
    expect(r.lastCheckInDate).toBe("2026-06-04");
    expect(r.nextEligibleDate).toBe("2026-06-11");
    expect(r.isEligible).toBe(false);
  });

  it("all angles x2, last check-in exactly 7 days ago → eligible", () => {
    const photos = [
      photo("front", "2026-06-03"),
      photo("front", "2026-06-03"),
      photo("side", "2026-06-03"),
      photo("side", "2026-06-03"),
      photo("back", "2026-06-03"),
      photo("back", "2026-06-03"),
    ];
    const r = evaluateProgressPhotoCheckIn(photos, "2026-06-10", tz);
    expect(r.baselineComplete).toBe(true);
    expect(r.nextEligibleDate).toBe("2026-06-10");
    expect(r.isEligible).toBe(true);
  });

  it("missing checkInDate falls back to civil date of takenAt ?? createdAt", () => {
    const withTaken: ProgressPhotoCheckInInput = {
      angle: "front",
      takenAt: "2026-06-04T15:00:00Z",
    };
    const withCreated: ProgressPhotoCheckInInput = {
      angle: "front",
      createdAt: "2026-06-04T09:00:00Z",
    };
    const r = evaluateProgressPhotoCheckIn([withTaken, withCreated], "2026-06-10", tz);
    expect(r.baselineComplete).toBe(true);
    expect(r.lastCheckInDate).toBe("2026-06-04");
    expect(r.nextEligibleDate).toBe("2026-06-11");
  });

  it("mixed dates → lastCheckInDate is the MAX civil date", () => {
    const photos = [
      photo("front", "2026-06-01"),
      photo("front", "2026-06-08"),
      photo("side", "2026-06-03"),
      photo("side", "2026-06-05"),
    ];
    const r = evaluateProgressPhotoCheckIn(photos, "2026-06-20", tz);
    expect(r.baselineComplete).toBe(true);
    expect(r.lastCheckInDate).toBe("2026-06-08");
    expect(r.nextEligibleDate).toBe("2026-06-15");
    expect(r.isEligible).toBe(true);
  });
});

describe("addCivilDays", () => {
  it("crosses month boundary", () => {
    expect(addCivilDays("2026-06-28", 7)).toBe("2026-07-05");
  });

  it("crosses year boundary", () => {
    expect(addCivilDays("2026-12-31", 7)).toBe("2027-01-07");
  });
});
