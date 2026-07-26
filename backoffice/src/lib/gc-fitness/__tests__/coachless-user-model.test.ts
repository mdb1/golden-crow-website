// __tests__/coachless-user-model.test.ts
//
// Unit coverage for the pure (firebase-free) helpers behind the admin
// coach-less users god-mode surface. No firebase imports → no mocks needed.

import {
  normalizeTier,
  resolveDisplayTier,
  firestoreValueToISO,
  toEntitlementInfo,
  isCoachlessClientRow,
  type EntitlementInfo,
} from "../coachless-user-model";

describe("normalizeTier", () => {
  it("maps only the literal 'premium' to premium; everything else to free", () => {
    expect(normalizeTier("premium")).toBe("premium");
    expect(normalizeTier("free")).toBe("free");
    expect(normalizeTier("")).toBe("free");
    expect(normalizeTier(undefined)).toBe("free");
    expect(normalizeTier(null)).toBe("free");
    expect(normalizeTier("PREMIUM")).toBe("free"); // case-sensitive by design
    expect(normalizeTier(1)).toBe("free");
  });
});

describe("resolveDisplayTier", () => {
  it("is premium only when the entitlement tier is premium", () => {
    expect(resolveDisplayTier(null)).toBe("free");
    expect(
      resolveDisplayTier({ tier: "free", source: null, productId: null, expiresAtISO: null, updatedAtISO: null }),
    ).toBe("free");
    expect(
      resolveDisplayTier({ tier: "premium", source: "revenuecat", productId: "gcfitness.lifetime", expiresAtISO: null, updatedAtISO: null }),
    ).toBe("premium");
  });
});

describe("firestoreValueToISO", () => {
  it("converts a Timestamp-like {toDate}, passes ISO strings, else null", () => {
    const d = new Date("2026-07-26T12:00:00.000Z");
    expect(firestoreValueToISO({ toDate: () => d })).toBe("2026-07-26T12:00:00.000Z");
    expect(firestoreValueToISO("2026-01-02T03:04:05.000Z")).toBe("2026-01-02T03:04:05.000Z");
    expect(firestoreValueToISO(null)).toBeNull();
    expect(firestoreValueToISO(undefined)).toBeNull();
    expect(firestoreValueToISO(123)).toBeNull();
  });

  it("returns null when toDate throws (never blows up the scan)", () => {
    expect(
      firestoreValueToISO({
        toDate: () => {
          throw new Error("bad ts");
        },
      }),
    ).toBeNull();
  });
});

describe("toEntitlementInfo", () => {
  it("returns null for absent / non-object entitlement", () => {
    expect(toEntitlementInfo(undefined)).toBeNull();
    expect(toEntitlementInfo(null)).toBeNull();
    expect(toEntitlementInfo("premium")).toBeNull();
  });

  it("parses a full RevenueCat-shaped map with a Timestamp expiresAt", () => {
    const d = new Date("2027-01-01T00:00:00.000Z");
    const info = toEntitlementInfo({
      tier: "premium",
      source: "revenuecat",
      productId: "gcfitness.sub.yearly",
      expiresAt: { toDate: () => d },
      updatedAt: { toDate: () => new Date("2026-07-26T00:00:00.000Z") },
    });
    expect(info).toEqual<EntitlementInfo>({
      tier: "premium",
      source: "revenuecat",
      productId: "gcfitness.sub.yearly",
      expiresAtISO: "2027-01-01T00:00:00.000Z",
      updatedAtISO: "2026-07-26T00:00:00.000Z",
    });
  });

  it("defaults a present-but-tierless map to free with null fields", () => {
    expect(toEntitlementInfo({})).toEqual<EntitlementInfo>({
      tier: "free",
      source: null,
      productId: null,
      expiresAtISO: null,
      updatedAtISO: null,
    });
  });
});

describe("isCoachlessClientRow", () => {
  it("is true only for an active client with no coach", () => {
    expect(isCoachlessClientRow({ role: "client", coachId: null, deleted: false })).toBe(true);
    expect(isCoachlessClientRow({ role: "client", coachId: "", deleted: false })).toBe(true);
    expect(isCoachlessClientRow({ role: "client", coachId: "   ", deleted: false })).toBe(true);
  });

  it("is false for coached clients, non-clients, or deleted users", () => {
    expect(isCoachlessClientRow({ role: "client", coachId: "coach123", deleted: false })).toBe(false);
    expect(isCoachlessClientRow({ role: "trainer", coachId: null, deleted: false })).toBe(false);
    expect(isCoachlessClientRow({ role: null, coachId: null, deleted: false })).toBe(false);
    expect(isCoachlessClientRow({ role: "client", coachId: null, deleted: true })).toBe(false);
  });
});
