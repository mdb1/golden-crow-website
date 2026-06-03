import {
  clientActivityGroupKey,
  formatClientActivityDate,
  formatClientActivityDateTime,
  formatClientActivityTime,
} from "@/lib/gc-fitness/client-activity-time";

describe("client activity timezone helpers", () => {
  test("formats instants in the provided timezone", () => {
    expect(
      formatClientActivityDateTime(
        "2026-06-03T14:08:00.000Z",
        "America/Argentina/Buenos_Aires",
      ),
    ).toContain("11:08");
  });

  test("uses the provided timezone for time-only labels", () => {
    expect(
      formatClientActivityTime(
        "2026-06-03T14:08:00.000Z",
        "America/Argentina/Buenos_Aires",
      ),
    ).toContain("11:08");
  });

  test("uses the provided timezone for fallback photo dates", () => {
    expect(
      formatClientActivityDate(
        "2026-06-03T02:59:00.000Z",
        "America/Argentina/Buenos_Aires",
      ),
    ).toBe("Jun 2");
  });

  test("groups messages by local day and hour rather than UTC", () => {
    expect(
      clientActivityGroupKey(
        "2026-06-03T02:59:00.000Z",
        "America/Argentina/Buenos_Aires",
      ),
    ).toBe("2026-06-02T23");
  });
});
