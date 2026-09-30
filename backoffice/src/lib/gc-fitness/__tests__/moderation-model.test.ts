// moderation-model.test.ts — the pure half of the moderation queue (gc-fitness #1050).

import {
  actionsFor,
  decodeModerationReport,
  describeChallengeGoal,
  groupReportsByTarget,
  isReportTargetType,
  moderationGroupKey,
  parseMessageTargetId,
  reportAgeHours,
  slaState,
  TARGET_TYPE_LABEL,
  type ModerationReport,
} from "@/lib/gc-fitness/moderation-model";

function report(overrides: Partial<ModerationReport> & { id: string }): ModerationReport {
  return {
    reporterUid: "u-rep",
    targetType: "routine",
    targetId: "tpl-1",
    targetOwnerUid: "u-owner",
    reason: "spam",
    note: null,
    status: "open",
    createdAtISO: "2026-09-18T10:00:00.000Z",
    resolvedAtISO: null,
    resolvedBy: null,
    resolution: null,
    ...overrides,
  };
}

describe("groupReportsByTarget", () => {
  it("three reports on one target are ONE row, input order preserved, head newest", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", createdAtISO: "2026-09-18T12:00:00.000Z", reason: "spam" }),
      report({ id: "b", targetId: "tpl-2", createdAtISO: "2026-09-18T11:00:00.000Z" }),
      report({ id: "c", createdAtISO: "2026-09-18T09:00:00.000Z", reason: "harassment" }),
      report({ id: "d", createdAtISO: "2026-09-18T08:00:00.000Z", reason: "spam" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["routine|tpl-1", "routine|tpl-2"]);
    expect(groups[0].reports.map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(groups[0].reasons).toEqual(["spam", "harassment"]);
  });

  it("the SLA clock is the OLDEST open report, and a resolved one does not count", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", createdAtISO: "2026-09-18T12:00:00.000Z" }),
      report({ id: "b", createdAtISO: "2026-09-17T01:00:00.000Z", status: "dismissed" }),
      report({ id: "c", createdAtISO: "2026-09-18T06:00:00.000Z" }),
    ]);
    expect(groups[0].oldestOpenISO).toBe("2026-09-18T06:00:00.000Z");
  });

  it("the key is exact: same id under two target types is two rows", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", targetType: "profile", targetId: "x" }),
      report({ id: "b", targetType: "routine", targetId: "x" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(moderationGroupKey("profile", "x")).toBe("profile|x");
  });
});

describe("slaState", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  it("fresh under 18 h, due-soon from 18 h, breached at 24 h; unknown age is fresh", () => {
    expect(slaState("2026-09-18T11:00:00.000Z", now)).toBe("fresh");
    expect(slaState("2026-09-17T18:00:00.000Z", now)).toBe("due-soon");
    expect(slaState("2026-09-17T12:00:00.000Z", now)).toBe("breached");
    expect(slaState("2026-09-10T12:00:00.000Z", now)).toBe("breached");
    expect(slaState(null, now)).toBe("fresh");
    expect(slaState("garbage", now)).toBe("fresh");
  });
  it("age never goes negative for a clock slightly ahead", () => {
    expect(reportAgeHours("2026-09-18T12:00:05.000Z", now)).toBe(0);
  });
});

describe("actionsFor", () => {
  it("a profile has nothing to hide; everything else offers the three verbs", () => {
    expect(actionsFor("profile")).toEqual(["suspend", "dismiss"]);
    expect(actionsFor("routine")).toEqual(["hide", "suspend", "dismiss"]);
    expect(actionsFor("comment")).toEqual(["hide", "suspend", "dismiss"]);
    expect(actionsFor("message")).toEqual(["hide", "suspend", "dismiss"]);
    expect(actionsFor("challenge")).toEqual(["hide", "suspend", "dismiss"]);
  });
});

describe("describeChallengeGoal — SV2-10 kinds (#1208)", () => {
  const bench = { en: "Bench press", es: "Press de banca" };
  // 2026-10-01 00:00 → 2026-10-29 00:00 in Buenos Aires (UTC-3); endsAt is exclusive.
  const startsAt = Date.UTC(2026, 9, 1, 3);
  const endsAt = Date.UTC(2026, 9, 29, 3);

  it("describes every kind with its scope and unit (no period → «en total», except the one-set max)", () => {
    expect(describeChallengeGoal({ kind: "exerciseMaxWeight", target: 100, exerciseName: bench })).toBe(
      "Press de banca: 100 kg en un set",
    );
    expect(describeChallengeGoal({ kind: "muscleSets", target: 12, cadence: "weekly", muscleGroup: "chest" })).toBe(
      "Pecho: 12 series por semana",
    );
    expect(describeChallengeGoal({ kind: "volume", target: 20000, cadence: "total" })).toBe("20000 kg en total");
    expect(describeChallengeGoal({ kind: "workouts", target: 3, cadence: "weekly" })).toBe("3 entrenos por semana");
    expect(describeChallengeGoal({ kind: "exerciseVolume", target: 2500.5, exerciseName: bench })).toBe(
      "Press de banca: 2500,5 kg en total",
    );
    expect(describeChallengeGoal({ kind: "exerciseReps", target: 1, exerciseName: bench })).toBe(
      "Press de banca: 1 repetición en total",
    );
    expect(describeChallengeGoal({ kind: "exerciseReps", target: 500, cadence: "weekly", exerciseName: bench })).toBe(
      "Press de banca: 500 repeticiones por semana",
    );
    expect(describeChallengeGoal({ kind: "muscleVolume", target: 8000.25, muscleGroup: "back" })).toBe(
      "Espalda: 8000,25 kg en total",
    );
    expect(describeChallengeGoal({ kind: "muscleSets", target: 1, muscleGroup: "core" })).toBe("Core: 1 serie en total");
  });

  it("falls back gracefully on missing/unknown scope", () => {
    expect(describeChallengeGoal({ kind: "exerciseMaxWeight", target: 60 })).toBe("Ejercicio: 60 kg en un set");
    expect(describeChallengeGoal({ kind: "exerciseVolume", target: 60, exerciseName: { en: "Squat" } })).toBe(
      "Squat: 60 kg en total",
    );
    expect(describeChallengeGoal({ kind: "muscleSets", target: 10, muscleGroup: "neck" })).toBe("neck: 10 series en total");
    expect(describeChallengeGoal({ kind: "muscleVolume", target: 10 })).toBe("Grupo muscular: 10 kg en total");
  });

  it("an unknown kind is «Desafío»", () => {
    expect(describeChallengeGoal({ kind: "laps", target: 3, durationDays: 7 })).toBe("Desafío");
    expect(describeChallengeGoal({ target: 3 })).toBe("Desafío");
  });

  it("with startsAt/endsAt the window replaces «en N días»; endsAt is exclusive and read in the doc's timezone", () => {
    expect(
      describeChallengeGoal({
        kind: "muscleSets", target: 12, cadence: "weekly", muscleGroup: "chest",
        startsAt, endsAt, durationDays: 28, timezone: "America/Argentina/Buenos_Aires",
      }),
    ).toBe("Pecho: 12 series por semana del 1 oct al 28 oct");
    // Firestore Timestamps (toDate) work the same as millis.
    const ts = (ms: number) => ({ toDate: () => new Date(ms) });
    expect(
      describeChallengeGoal({
        kind: "exerciseMaxWeight", target: 100, exerciseName: bench,
        startsAt: ts(startsAt), endsAt: ts(endsAt), timezone: "America/Argentina/Buenos_Aires",
      }),
    ).toBe("Press de banca: 100 kg en un set del 1 oct al 28 oct");
    // No / invalid timezone → UTC.
    expect(
      describeChallengeGoal({ kind: "volume", target: 1000, startsAt: Date.UTC(2026, 9, 1), endsAt: Date.UTC(2026, 9, 8), timezone: "Mars/Olympus" }),
    ).toBe("1000 kg del 1 oct al 7 oct");
    // Across a year boundary both years are shown.
    expect(
      describeChallengeGoal({ kind: "workouts", target: 10, startsAt: Date.UTC(2026, 11, 20), endsAt: Date.UTC(2027, 0, 10) }),
    ).toBe("10 entrenos del 20 dic 2026 al 9 ene 2027");
  });

  it("weekly with only durationDays reads as a number of weeks", () => {
    expect(describeChallengeGoal({ kind: "muscleSets", target: 12, cadence: "weekly", muscleGroup: "chest", durationDays: 28 })).toBe(
      "Pecho: 12 series por semana · 4 semanas",
    );
  });
});

describe("challenge target (#1189)", () => {
  it("is a report target type with a Spanish label, and decodes", () => {
    expect(isReportTargetType("challenge")).toBe(true);
    expect(TARGET_TYPE_LABEL.challenge).toBe("Desafío");
    const decoded = decodeModerationReport(
      "r1",
      { reporterUid: "u1", targetType: "challenge", targetId: "ch-1", targetOwnerUid: "u-creator", reason: "harassment" },
      (v) => (typeof v === "string" ? v : null),
    );
    expect(decoded).toMatchObject({ targetType: "challenge", targetId: "ch-1", targetOwnerUid: "u-creator" });
  });

  it("groups by exact key: a challenge and a routine with the same id are two rows", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", targetType: "challenge", targetId: "x" }),
      report({ id: "b", targetType: "routine", targetId: "x" }),
      report({ id: "c", targetType: "challenge", targetId: "x" }),
    ]);
    expect(groups.map((g) => [g.key, g.reports.length])).toEqual([["challenge|x", 2], ["routine|x", 1]]);
  });

  it("describeChallengeGoal keeps the SV2-9 shapes (durationDays, no cadence)", () => {
    expect(describeChallengeGoal({ kind: "workouts", target: 12, durationDays: 30 })).toBe("12 entrenos en 30 días");
    expect(describeChallengeGoal({ kind: "workouts", target: 1, durationDays: 1 })).toBe("1 entreno en 1 día");
    expect(describeChallengeGoal({ kind: "volume", target: 5000, durationDays: 7 })).toBe("5000 kg en 7 días");
    expect(describeChallengeGoal({ kind: "workouts" })).toBeNull();
  });
});

describe("parseMessageTargetId", () => {
  it("is {threadId}/{messageId} and nothing else", () => {
    expect(parseMessageTargetId("a_b/m1")).toEqual({ threadId: "a_b", messageId: "m1" });
    expect(parseMessageTargetId("a_b")).toBeNull();
    expect(parseMessageTargetId("a/b/c")).toBeNull();
    expect(parseMessageTargetId("/m1")).toBeNull();
  });
});

describe("decodeModerationReport", () => {
  const toIso = (v: unknown) => (typeof v === "string" ? v : null);
  it("decodes a full document and folds unknown reason/status to safe values", () => {
    const decoded = decodeModerationReport(
      "r1",
      {
        reporterUid: "u1", targetType: "comment", targetId: "c1", targetOwnerUid: "u2",
        reason: "weird", status: "??", note: "  hola  ", createdAt: "2026-09-18T10:00:00.000Z",
      },
      toIso,
    );
    expect(decoded).toMatchObject({ id: "r1", reason: "other", status: "open", note: "hola", targetOwnerUid: "u2" });
  });
  it("refuses a document the queue cannot show", () => {
    expect(decodeModerationReport("r", { targetType: "video", targetId: "x", reporterUid: "u" }, toIso)).toBeNull();
    expect(decodeModerationReport("r", { targetType: "routine", targetId: "", reporterUid: "u" }, toIso)).toBeNull();
    expect(decodeModerationReport("r", { targetType: "routine", targetId: "x" }, toIso)).toBeNull();
  });
});
