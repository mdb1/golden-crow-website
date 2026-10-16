import {
  maximumResultDeliveryAt,
  REQUESTED_STUDY_TEST_OPTIONS,
} from "@/lib/two-pq-requested-test";

describe("2PQ requested-test delivery windows", () => {
  const requestedAt = new Date("2026-10-16T12:00:00.000Z");

  it("exposes the four requested labels in operational order", () => {
    expect(REQUESTED_STUDY_TEST_OPTIONS).toEqual([
      { value: "pgtAUltraFast", label: "Ultra-fast PGT (<8hs)" },
      { value: "pgtAFast", label: "Fast PGT (24-72hs)" },
      { value: "pgtAStandard", label: "Standard PGT (>15 days)" },
      { value: "pgtSr", label: "PGT SR (>15 days)" },
    ]);
  });

  it.each([
    ["pgtAUltraFast", "2026-10-16T20:00:00.000Z"],
    ["pgtAFast", "2026-10-19T12:00:00.000Z"],
    ["pgtAStandard", "2026-11-01T12:00:00.000Z"],
    ["pgtSr", "2026-11-01T12:00:00.000Z"],
  ] as const)("calculates %s deterministically", (testKey, expected) => {
    expect(maximumResultDeliveryAt(testKey, requestedAt).toISOString()).toBe(
      expected,
    );
  });
});
