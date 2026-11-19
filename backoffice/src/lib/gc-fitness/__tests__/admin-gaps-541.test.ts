// admin-gaps-541.test.ts — #541: the pure pieces of the second admin batch.

import { decodeSubscriptionEvents } from "../admin-client-overview-model";
import { decodeCoachActivityLog } from "../admin-coach-activity-model";
import { adminProfileHref, userMatchesQuery } from "../admin-user-search";
import { blockedBy, buildDistribution, parseBuild } from "../app-version-distribution";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("app version distribution", () => {
  const tokens = [
    // u1 rotated: only the NEWEST iOS token counts (build 410), not the old 300.
    { uid: "u1", platform: "ios", appBuild: "300", appVersion: "2.0.0", registeredAtMs: 1 },
    { uid: "u1", platform: "ios", appBuild: "410", appVersion: "2.3.0", registeredAtMs: 5 },
    { uid: "u2", platform: "ios", appBuild: "380", appVersion: "2.2.0", registeredAtMs: 3 },
    { uid: "u3", platform: "ios", appBuild: null, appVersion: null, registeredAtMs: 2 },
    { uid: "u1", platform: "android", appBuild: 120, appVersion: "2.3.0", registeredAtMs: 4 },
    { uid: "u4", platform: "web", appBuild: "1", appVersion: null, registeredAtMs: 4 },
  ];
  const [ios, android] = buildDistribution(tokens);

  it("one entry per user and platform, newest registration wins", () => {
    expect(ios.users).toBe(3);
    expect(ios.unknownBuild).toBe(1);
    expect(ios.buckets).toEqual([
      { build: 410, version: "2.3.0", users: 1 },
      { build: 380, version: "2.2.0", users: 1 },
    ]);
    expect(android.users).toBe(1);
  });

  it("blockedBy counts builds strictly below minBuild; 0 = no gate", () => {
    expect(blockedBy(ios, 400)).toEqual({ known: 1, unknown: 1 });
    expect(blockedBy(ios, 380)).toEqual({ known: 0, unknown: 1 });
    expect(blockedBy(ios, 0)).toEqual({ known: 0, unknown: 0 });
  });

  it("parses string or number builds only", () => {
    expect(parseBuild("163")).toBe(163);
    expect(parseBuild(42)).toBe(42);
    expect(parseBuild("1.2")).toBeNull();
    expect(parseBuild(undefined)).toBeNull();
  });
});

describe("RevenueCat subscription events", () => {
  it("newest first, known types labelled, TEST pings dropped, unknown kept raw", () => {
    const events = decodeSubscriptionEvents([
      { id: "e1", data: { type: "INITIAL_PURCHASE", receivedAt: ts("2026-10-01T10:00:00Z") } },
      { id: "e2", data: { type: "CANCELLATION", receivedAt: ts("2026-11-01T10:00:00Z") } },
      { id: "e3", data: { type: "TEST", receivedAt: ts("2026-11-02T10:00:00Z") } },
      { id: "e4", data: { type: "SOMETHING_NEW", receivedAt: ts("2026-09-01T10:00:00Z") } },
    ]);
    expect(events.map((e) => [e.id, e.known])).toEqual([
      ["e2", "CANCELLATION"],
      ["e1", "INITIAL_PURCHASE"],
      ["e4", null],
    ]);
    expect(events[2].type).toBe("SOMETHING_NEW");
  });
});

describe("coach_activity log decode", () => {
  it("names coaches and clients, sorts newest first and collapses bulk groups", () => {
    const names = new Map([
      ["coach1", "Ana Coach"],
      ["c1", "Beto"],
      ["c2", "Caro"],
    ]);
    const rows = decodeCoachActivityLog(
      [
        { id: "x1", data: { trainerId: "coach1", kind: "note", title: "Nota", clientId: "c1", occurredAt: ts("2026-11-10T10:00:00Z") } },
        { id: "g1", data: { trainerId: "coach1", kind: "nutrition_plan", title: "Plan", clientId: "c1", groupId: "G", occurredAt: ts("2026-11-12T10:00:00Z") } },
        { id: "g2", data: { trainerId: "coach1", kind: "nutrition_plan", title: "Plan", clientId: "c2", groupId: "G", occurredAt: ts("2026-11-12T10:00:00Z") } },
        { id: "z", data: { trainerId: "coach1", kind: "brand_new_kind", title: "?", occurredAt: ts("2026-11-01T10:00:00Z") } },
      ],
      names,
    );
    expect(rows.map((r) => r.id)).toEqual(["g1", "x1", "z"]);
    expect(rows[0]).toMatchObject({ groupCount: 2, clientId: null, coachName: "Ana Coach" });
    expect(rows[1]).toMatchObject({ kind: "note", clientName: "Beto" });
    expect(rows[2]).toMatchObject({ kind: null, rawKind: "brand_new_kind" });
  });
});

describe("admin user search", () => {
  it("matches the display name too", () => {
    expect(userMatchesQuery("x@y.com", "Nico Carballal", "carba")).toBe(true);
    expect(userMatchesQuery("ncarba@y.com", null, "carba")).toBe(true);
    expect(userMatchesQuery("x@y.com", "Ana", "carba")).toBe(false);
  });

  it("links a coach-less client to their profile; a deleted one gets no link", () => {
    expect(adminProfileHref({ uid: "u", roles: ["client"], coachId: null, deleted: false })).toBe(
      "/gc-fitness/admin/coach-less-users/u",
    );
    expect(adminProfileHref({ uid: "u", roles: ["client"], coachId: null, deleted: true })).toBeNull();
    expect(adminProfileHref({ uid: "u", roles: ["client"], coachId: "c", deleted: false })).toBe(
      "/gc-fitness/admin/coaches/c/clients/u",
    );
    expect(adminProfileHref({ uid: "u", roles: ["trainer"], coachId: null, deleted: false })).toBe(
      "/gc-fitness/admin/coaches/u",
    );
    expect(adminProfileHref({ uid: "u", roles: ["admin"], coachId: null, deleted: false })).toBeNull();
  });
});
