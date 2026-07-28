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
  adminCanViewClientUnderCoach,
  canUnlinkClientFromCoach,
  summarizeCoachlessActivity,
  bilingualText,
  daysSince,
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

describe("adminCanViewClientUnderCoach", () => {
  const coached = {
    coachUidInPath: "coach123",
    clientId: "client456",
    clientCoachId: "coach123",
    clientRole: "client",
    clientDeleted: false,
  };

  it("admits the coach of record", () => {
    expect(adminCanViewClientUnderCoach(coached)).toBe(true);
  });

  it("denies a coach who does not own the client (URL-edit across coaches)", () => {
    expect(
      adminCanViewClientUnderCoach({ ...coached, coachUidInPath: "otherCoach" }),
    ).toBe(false);
  });

  it("admits a coach-less user as their own trainer-of-record", () => {
    expect(
      adminCanViewClientUnderCoach({
        coachUidInPath: "selfUid",
        clientId: "selfUid",
        clientCoachId: null,
        clientRole: "client",
        clientDeleted: false,
      }),
    ).toBe(true);
  });

  it("denies self-as-coach when the target is NOT coach-less", () => {
    // A coached client's own uid in the path must not unlock their data.
    expect(
      adminCanViewClientUnderCoach({
        coachUidInPath: "client456",
        clientId: "client456",
        clientCoachId: "coach123",
        clientRole: "client",
        clientDeleted: false,
      }),
    ).toBe(false);
    // Nor a trainer, nor a soft-deleted account.
    expect(
      adminCanViewClientUnderCoach({
        coachUidInPath: "t1",
        clientId: "t1",
        clientCoachId: null,
        clientRole: "trainer",
        clientDeleted: false,
      }),
    ).toBe(false);
    expect(
      adminCanViewClientUnderCoach({
        coachUidInPath: "c1",
        clientId: "c1",
        clientCoachId: null,
        clientRole: "client",
        clientDeleted: true,
      }),
    ).toBe(false);
  });

  it("denies empty uids", () => {
    expect(adminCanViewClientUnderCoach({ ...coached, coachUidInPath: "" })).toBe(false);
    expect(adminCanViewClientUnderCoach({ ...coached, clientId: "" })).toBe(false);
  });
});

describe("canUnlinkClientFromCoach", () => {
  it("allows detaching a client from the coach that owns them", () => {
    expect(
      canUnlinkClientFromCoach({
        coachUidInPath: "coach123",
        clientRole: "client",
        clientCoachId: "coach123",
      }),
    ).toBe(true);
  });

  it("allows it for a soft-deleted client too", () => {
    // `deleted` is deliberately not an input — stripping the coach link off a
    // deactivated client is harmless and sometimes wanted.
    expect(
      canUnlinkClientFromCoach({
        coachUidInPath: "coach123",
        clientRole: "client",
        clientCoachId: "coach123",
      }),
    ).toBe(true);
  });

  it("denies detaching from a coach who does not own the client", () => {
    expect(
      canUnlinkClientFromCoach({
        coachUidInPath: "otherCoach",
        clientRole: "client",
        clientCoachId: "coach123",
      }),
    ).toBe(false);
  });

  it("denies an already coach-less client (nothing to unlink)", () => {
    expect(
      canUnlinkClientFromCoach({
        coachUidInPath: "coach123",
        clientRole: "client",
        clientCoachId: null,
      }),
    ).toBe(false);
  });

  it("denies unlinking a trainer", () => {
    expect(
      canUnlinkClientFromCoach({
        coachUidInPath: "coach123",
        clientRole: "trainer",
        clientCoachId: "coach123",
      }),
    ).toBe(false);
  });
});

describe("summarizeCoachlessActivity", () => {
  // Fixed "now" so the windows are deterministic (no Date.now() in the assert).
  const nowMs = Date.parse("2026-07-28T12:00:00.000Z");
  const daysAgo = (n: number) =>
    new Date(nowMs - n * 24 * 60 * 60 * 1000).toISOString();

  it("buckets each stream into 7d / 30d / total with its own last timestamp", () => {
    const summary = summarizeCoachlessActivity({
      nowMs,
      workoutDates: [daysAgo(1), daysAgo(6), daysAgo(20), daysAgo(90)],
      habitLogDates: ["2026-07-27", "2026-07-01", "2026-05-01"],
      photoDates: [daysAgo(45)],
      weightDates: [],
    });

    expect(summary.workouts).toEqual({
      last7Days: 2,
      last30Days: 3,
      total: 4,
      lastISO: daysAgo(1),
    });
    // Civil dates parse as UTC midnight — 2026-07-27 is inside 7d, 07-01 is
    // inside 30d, 05-01 is only in the total.
    expect(summary.habitCheckIns.last7Days).toBe(1);
    expect(summary.habitCheckIns.last30Days).toBe(2);
    expect(summary.habitCheckIns.total).toBe(3);
    expect(summary.photos).toEqual({
      last7Days: 0,
      last30Days: 0,
      total: 1,
      lastISO: daysAgo(45),
    });
    expect(summary.weightEntries.total).toBe(0);
    expect(summary.weightEntries.lastISO).toBeNull();
  });

  it("reports the newest timestamp across ALL streams as lastActive", () => {
    const summary = summarizeCoachlessActivity({
      nowMs,
      workoutDates: [daysAgo(10)],
      habitLogDates: [],
      photoDates: [daysAgo(2)],
      weightDates: [daysAgo(30)],
    });
    expect(summary.lastActiveISO).toBe(daysAgo(2));
  });

  it("returns a null lastActive for a user who never did anything", () => {
    const summary = summarizeCoachlessActivity({
      nowMs,
      workoutDates: [],
      habitLogDates: [null, undefined, "not-a-date"],
      photoDates: [],
      weightDates: [],
    });
    expect(summary.lastActiveISO).toBeNull();
    expect(summary.habitCheckIns.total).toBe(0);
  });
});

describe("bilingualText", () => {
  it("prefers Spanish, then English, then the fallback", () => {
    expect(bilingualText({ es: "Sentadilla", en: "Squat" }, "—")).toBe("Sentadilla");
    expect(bilingualText({ en: "Squat" }, "—")).toBe("Squat");
    expect(bilingualText({ es: "   ", en: "Squat" }, "—")).toBe("Squat");
    expect(bilingualText({}, "—")).toBe("—");
    expect(bilingualText(null, "—")).toBe("—");
  });

  it("passes a legacy bare string through", () => {
    expect(bilingualText("Push day", "—")).toBe("Push day");
    expect(bilingualText("  ", "—")).toBe("—");
  });
});

describe("daysSince", () => {
  const nowMs = Date.parse("2026-07-28T12:00:00.000Z");

  it("floors to whole days and never goes negative", () => {
    expect(daysSince("2026-07-28T00:00:00.000Z", nowMs)).toBe(0);
    expect(daysSince("2026-07-27T00:00:00.000Z", nowMs)).toBe(1);
    expect(daysSince("2026-06-28T12:00:00.000Z", nowMs)).toBe(30);
    // Future-dated (clock skew) clamps to 0 rather than "-2 days ago".
    expect(daysSince("2026-07-30T12:00:00.000Z", nowMs)).toBe(0);
  });

  it("returns null for missing / unparseable input", () => {
    expect(daysSince(null, nowMs)).toBeNull();
    expect(daysSince("whenever", nowMs)).toBeNull();
  });
});
