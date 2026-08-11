// __tests__/client-app-devices.test.ts
//
// #785 — the per-device "which app version, and is it iOS or Android" line on a
// client profile. Both halves are read out of `/users/{uid}/fcm_tokens`, which
// already carried `platform`; `appVersion` / `appBuild` are the new fields.
//
// The projection is where the two traps live: a push token ROTATES (reinstall,
// restore, Firebase's own schedule) and each rotation writes a NEW doc, so one
// phone can hold a dozen — and a device registered before this shipped has no
// version at all, which must read as "unknown", never as "current".

import {
  formatAppDevice,
  projectAppDevices,
  type ClientAppDevice,
} from "@/lib/gc-fitness/client-app-devices";

const doc = (data: Record<string, unknown>) => ({ data: () => data });

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("projectAppDevices", () => {
  it("reads platform, version and build, newest registration first", () => {
    const rows = projectAppDevices([
      doc({
        platform: "android",
        appVersion: "1.2.9",
        appBuild: "310",
        registeredAt: ts("2026-08-01T10:00:00Z"),
      }),
      doc({
        platform: "ios",
        appVersion: "1.3.0",
        appBuild: "42",
        registeredAt: ts("2026-08-06T10:00:00Z"),
      }),
    ]);

    expect(rows).toEqual<ClientAppDevice[]>([
      {
        platform: "ios",
        appVersion: "1.3.0",
        appBuild: "42",
        registeredAtISO: "2026-08-06T10:00:00.000Z",
      },
      {
        platform: "android",
        appVersion: "1.2.9",
        appBuild: "310",
        registeredAtISO: "2026-08-01T10:00:00.000Z",
      },
    ]);
  });

  it("collapses the rotations of ONE device into a single row", () => {
    // Same phone, same build, three tokens. Without the dedupe the profile
    // becomes a push-token history instead of an answer.
    const rows = projectAppDevices([
      doc({ platform: "ios", appVersion: "1.3.0", appBuild: "42", registeredAt: ts("2026-08-01T10:00:00Z") }),
      doc({ platform: "ios", appVersion: "1.3.0", appBuild: "42", registeredAt: ts("2026-08-04T10:00:00Z") }),
      doc({ platform: "ios", appVersion: "1.3.0", appBuild: "42", registeredAt: ts("2026-08-06T10:00:00Z") }),
    ]);

    expect(rows).toHaveLength(1);
    // The kept row is the newest — "when did I last see this device".
    expect(rows[0].registeredAtISO).toBe("2026-08-06T10:00:00.000Z");
  });

  it("keeps the SAME phone's two versions apart", () => {
    // An upgrade is exactly what the field is for, so it must not be deduped
    // away by platform alone.
    const rows = projectAppDevices([
      doc({ platform: "ios", appVersion: "1.2.0", appBuild: "30", registeredAt: ts("2026-07-01T10:00:00Z") }),
      doc({ platform: "ios", appVersion: "1.3.0", appBuild: "42", registeredAt: ts("2026-08-06T10:00:00Z") }),
    ]);

    expect(rows.map((r) => r.appVersion)).toEqual(["1.3.0", "1.2.0"]);
  });

  it("reports a pre-#785 device as unknown rather than current", () => {
    const [row] = projectAppDevices([
      doc({ platform: "android", registeredAt: ts("2026-05-01T10:00:00Z") }),
    ]);

    expect(row.appVersion).toBeNull();
    expect(row.appBuild).toBeNull();
    expect(formatAppDevice(row)).toBe("Android · versión desconocida");
  });

  it("drops the unknown-version row once THAT platform reports a version", () => {
    // Signed in before #785 (no version stamped) and again after it. The old
    // token says nothing the new one doesn't — two pills for one fact.
    const rows = projectAppDevices([
      doc({ platform: "ios", registeredAt: ts("2026-05-01T10:00:00Z") }),
      doc({
        platform: "ios",
        appVersion: "1.2.1",
        appBuild: "163",
        registeredAt: ts("2026-08-06T10:00:00Z"),
      }),
    ]);

    expect(rows.map(formatAppDevice)).toEqual(["iOS 1.2.1 (163)"]);
  });

  it("keeps ANOTHER platform's unknown-version row", () => {
    // The whole point of the badge: this person's Android is on a build old
    // enough not to stamp its version. Knowing their iPhone's version says
    // nothing about that, so the Android pill must survive.
    const rows = projectAppDevices([
      doc({ platform: "android", registeredAt: ts("2026-05-01T10:00:00Z") }),
      doc({
        platform: "ios",
        appVersion: "1.2.1",
        appBuild: "163",
        registeredAt: ts("2026-08-06T10:00:00Z"),
      }),
    ]);

    expect(rows.map(formatAppDevice)).toEqual([
      "iOS 1.2.1 (163)",
      "Android · versión desconocida",
    ]);
  });

  it("survives a doc with no platform and no timestamp", () => {
    const [row] = projectAppDevices([doc({ token: "abc" })]);

    expect(row.platform).toBe("unknown");
    expect(row.registeredAtISO).toBeNull();
  });

  it("accepts an ISO string timestamp as well as a Firestore one", () => {
    const [row] = projectAppDevices([
      doc({ platform: "ios", registeredAt: "2026-08-06T10:00:00.000Z" }),
    ]);

    expect(row.registeredAtISO).toBe("2026-08-06T10:00:00.000Z");
  });
});

describe("formatAppDevice", () => {
  it("names the platform the way a human writes it", () => {
    expect(
      formatAppDevice({
        platform: "ios",
        appVersion: "1.3.0",
        appBuild: "42",
        registeredAtISO: null,
      }),
    ).toBe("iOS 1.3.0 (42)");
  });

  it("omits an absent build instead of printing an empty pair of parens", () => {
    expect(
      formatAppDevice({
        platform: "android",
        appVersion: "1.2.9",
        appBuild: null,
        registeredAtISO: null,
      }),
    ).toBe("Android 1.2.9");
  });
});
