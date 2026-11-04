// __tests__/coach-challenges.test.ts — gc-fitness #1475 (S6), el módulo PURO de los
// desafíos que crea el coach: validación del formulario, el doc exacto del wire y la
// tabla de posiciones (twin de `rankChallengeStandings` contra el vector compartido).

import vector from "./fixtures/challenge_standings_vector.json";
import {
  buildCoachChallengeDoc,
  coachChallengeMemberUids,
  normalizeCoachChallengeName,
  normalizeCoachChallengeTarget,
  rankCoachChallengeStandings,
  sortCoachChallenges,
  startOfZonedDayMs,
  summarizeCoachChallenge,
  usableUid,
  validateCoachChallengeInput,
  type CoachChallengeFormInput,
  type StandingsMemberInput,
  type ValidCoachChallenge,
} from "../coach-challenges";

const COACH = "coach-a";
const TZ_AR = "America/Argentina/Buenos_Aires";
// 2026-08-20 12:00 en Buenos Aires.
const NOW = Date.parse("2026-08-20T15:00:00Z");

function form(over: Partial<CoachChallengeFormInput> = {}): CoachChallengeFormInput {
  return {
    name: "Agosto a full",
    kind: "workouts",
    cadence: "total",
    target: 12,
    startDate: "2026-08-20",
    endDate: "2026-09-02",
    ...over,
  };
}

function validate(
  over: Partial<CoachChallengeFormInput> = {},
  ctx: Partial<{ clientUids: unknown[]; timezone: string; nowMs: number; coachUid: string }> = {},
) {
  return validateCoachChallengeInput(form(over), {
    coachUid: ctx.coachUid ?? COACH,
    clientUids: ctx.clientUids ?? ["c1", "c2"],
    timezone: ctx.timezone ?? TZ_AR,
    nowMs: ctx.nowMs ?? NOW,
  });
}

function ok(result: ReturnType<typeof validate>): ValidCoachChallenge {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

function errorOf(result: ReturnType<typeof validate>) {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === "object") return Object.values(value).some(containsUndefined);
  return false;
}

describe("normalizeCoachChallengeName", () => {
  it("trims and accepts 1–40 code points", () => {
    expect(normalizeCoachChallengeName("  Hola  ")).toBe("Hola");
    expect(normalizeCoachChallengeName("a".repeat(40))).toBe("a".repeat(40));
    expect(normalizeCoachChallengeName("a".repeat(41))).toBeNull();
    expect(normalizeCoachChallengeName("   ")).toBeNull();
    expect(normalizeCoachChallengeName(42)).toBeNull();
  });

  it("counts an emoji as ONE character (code points, not UTF-16 units)", () => {
    const fortyEmoji = "💪".repeat(40); // 80 UTF-16 units
    expect(fortyEmoji.length).toBe(80);
    expect(normalizeCoachChallengeName(fortyEmoji)).toBe(fortyEmoji);
    expect(normalizeCoachChallengeName("💪".repeat(41))).toBeNull();
  });

  it("rejects line breaks (incl. U+2028/2029)", () => {
    expect(normalizeCoachChallengeName("Uno\nDos")).toBeNull();
    expect(normalizeCoachChallengeName("Uno\r\nDos")).toBeNull();
    expect(normalizeCoachChallengeName(`Uno${String.fromCharCode(0x2028)}Dos`)).toBeNull();
    expect(normalizeCoachChallengeName(`Uno${String.fromCharCode(0x2029)}Dos`)).toBeNull();
    // Un salto al final se va con el trim: no es un salto ADENTRO del nombre.
    expect(normalizeCoachChallengeName("Uno\n")).toBe("Uno");
  });
});

describe("normalizeCoachChallengeTarget", () => {
  it("workouts: integer 1–100", () => {
    expect(normalizeCoachChallengeTarget("workouts", 1)).toBe(1);
    expect(normalizeCoachChallengeTarget("workouts", 100)).toBe(100);
    expect(normalizeCoachChallengeTarget("workouts", 0)).toBeNull();
    expect(normalizeCoachChallengeTarget("workouts", 101)).toBeNull();
    expect(normalizeCoachChallengeTarget("workouts", 2.5)).toBeNull();
    expect(normalizeCoachChallengeTarget("workouts", "12")).toBe(12);
  });

  it("volume: 100–5,000,000 rounded to cents before the range check", () => {
    expect(normalizeCoachChallengeTarget("volume", 1234.567)).toBe(1234.57);
    expect(normalizeCoachChallengeTarget("volume", 99.996)).toBe(100);
    expect(normalizeCoachChallengeTarget("volume", 99.99)).toBeNull();
    expect(normalizeCoachChallengeTarget("volume", 5_000_000)).toBe(5_000_000);
    expect(normalizeCoachChallengeTarget("volume", 5_000_000.01)).toBeNull();
    expect(normalizeCoachChallengeTarget("volume", "7500,5")).toBe(7500.5);
    expect(normalizeCoachChallengeTarget("volume", Number.NaN)).toBeNull();
    expect(normalizeCoachChallengeTarget("volume", "")).toBeNull();
  });
});

describe("members (the server's usableUid)", () => {
  it("drops ids with / or _, reserved __x__ ids, blanks, non-strings and the coach; dedupes", () => {
    expect(usableUid("__standard__")).toBeNull();
    expect(usableUid("a_b")).toBeNull();
    expect(usableUid("a/b")).toBeNull();
    expect(
      coachChallengeMemberUids(
        ["c1", "c1", " c2 ", "a_b", "x/y", "__standard__", "", 7, null, COACH, "c3"],
        COACH,
      ),
    ).toEqual(["c1", "c2", "c3"]);
  });

  it("needs 1–200 usable clients", () => {
    expect(errorOf(validate({}, { clientUids: [] }))).toEqual({ field: "members", reason: "noMembers" });
    expect(errorOf(validate({}, { clientUids: ["a_b", COACH] }))).toEqual({
      field: "members",
      reason: "noMembers",
    });
    const two00 = Array.from({ length: 200 }, (_, i) => `c${i}`);
    expect(ok(validate({}, { clientUids: two00 })).memberUids).toHaveLength(200);
    expect(errorOf(validate({}, { clientUids: [...two00, "c200"] }))).toEqual({
      field: "members",
      reason: "tooManyMembers",
    });
  });
});

describe("validateCoachChallengeInput — fields", () => {
  it("accepts a valid total challenge and derives the window in the coach's zone", () => {
    const v = ok(validate());
    expect(v.name).toBe("Agosto a full");
    expect(v.durationDays).toBe(14);
    // 00:00 de Buenos Aires (UTC−3) = 03:00Z; el fin es el 00:00 del día SIGUIENTE al último.
    expect(new Date(v.startsAtMs).toISOString()).toBe("2026-08-20T03:00:00.000Z");
    expect(new Date(v.endsAtMs).toISOString()).toBe("2026-09-03T03:00:00.000Z");
    expect(v.timezone).toBe(TZ_AR);
    expect(v.memberUids).toEqual(["c1", "c2"]);
  });

  it("rejects bad kind / cadence / target / timezone", () => {
    expect(errorOf(validate({ kind: "exerciseVolume" })).field).toBe("kind");
    expect(errorOf(validate({ cadence: "daily" })).field).toBe("cadence");
    expect(errorOf(validate({ target: 0 })).field).toBe("target");
    expect(errorOf(validate({ kind: "volume", target: 50 })).field).toBe("target");
    expect(errorOf(validate({}, { timezone: "Mars/Olympus" })).field).toBe("timezone");
    expect(errorOf(validate({ name: "Uno\nDos" })).field).toBe("name");
  });

  it("start: not before today (coach local) and at most 60 days out", () => {
    // 23:30 del 19 en Buenos Aires = 02:30Z del 20: «hoy» sigue siendo el 19 para el coach.
    const lateEvening = Date.parse("2026-08-20T02:30:00Z");
    expect(ok(validate({ startDate: "2026-08-19", endDate: "2026-08-25" }, { nowMs: lateEvening })).durationDays).toBe(7);
    expect(errorOf(validate({ startDate: "2026-08-19", endDate: "2026-08-25" }))).toEqual({
      field: "startDate",
      reason: "startPast",
    });
    expect(ok(validate({ startDate: "2026-10-19", endDate: "2026-10-19" })).durationDays).toBe(1);
    expect(errorOf(validate({ startDate: "2026-10-20", endDate: "2026-10-25" }))).toEqual({
      field: "startDate",
      reason: "startTooFar",
    });
    expect(errorOf(validate({ startDate: "2026-02-30" })).field).toBe("startDate");
    expect(errorOf(validate({ startDate: "20/08/2026" })).field).toBe("startDate");
  });

  it("duration 1–90 days; end before start rejected", () => {
    expect(ok(validate({ endDate: "2026-08-20" })).durationDays).toBe(1);
    expect(errorOf(validate({ endDate: "2026-08-19" }))).toEqual({ field: "endDate", reason: "endBeforeStart" });
    expect(ok(validate({ endDate: "2026-11-17" })).durationDays).toBe(90);
    expect(errorOf(validate({ endDate: "2026-11-18" }))).toEqual({ field: "endDate", reason: "tooLong" });
    expect(errorOf(validate({ endDate: "" })).field).toBe("endDate");
  });

  it("weekly needs a multiple of 7 days", () => {
    expect(ok(validate({ cadence: "weekly", endDate: "2026-09-02" })).durationDays).toBe(14);
    expect(errorOf(validate({ cadence: "weekly", endDate: "2026-09-03" }))).toEqual({
      field: "endDate",
      reason: "notWeeks",
    });
    expect(errorOf(validate({ cadence: "weekly", endDate: "2026-08-25" }))).toEqual({
      field: "endDate",
      reason: "notWeeks",
    });
  });
});

describe("DST — America/Santiago", () => {
  const TZ_CL = "America/Santiago";

  it("start of a day whose midnight does not exist (2026-09-06 jumps 00:00 → 01:00) is 01:00 local", () => {
    // 01:00 CLST (UTC−3) = 04:00Z.
    expect(new Date(startOfZonedDayMs("2026-09-06", TZ_CL)!).toISOString()).toBe("2026-09-06T04:00:00.000Z");
    // Fall back 2026-04-05 (00:00 → 23:00 del 4): el día 5 empieza a las 00:00 CLT (UTC−4).
    expect(new Date(startOfZonedDayMs("2026-04-05", TZ_CL)!).toISOString()).toBe("2026-04-05T04:00:00.000Z");
    expect(new Date(startOfZonedDayMs("2026-04-04", TZ_CL)!).toISOString()).toBe("2026-04-04T03:00:00.000Z");
  });

  it("a weekly window crossing the spring-forward keeps 14 civil days / 2 weeks (14 d − 1 h)", () => {
    const v = ok(
      validate(
        { cadence: "weekly", startDate: "2026-09-01", endDate: "2026-09-14" },
        { timezone: TZ_CL },
      ),
    );
    expect(new Date(v.startsAtMs).toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(new Date(v.endsAtMs).toISOString()).toBe("2026-09-15T03:00:00.000Z");
    expect(v.endsAtMs - v.startsAtMs).toBe(14 * 86_400_000 - 3_600_000);
    expect(v.durationDays).toBe(14);
    const doc = buildCoachChallengeDoc(v, COACH, { timestamp: (ms) => ms, serverTimestamp: () => "SERVER" });
    const members = doc.members as Record<string, { weeks: number[] }>;
    expect(members.c1.weeks).toEqual([0, 0]);
  });
});

describe("buildCoachChallengeDoc", () => {
  const stamps = { timestamp: (ms: number) => ({ ms }), serverTimestamp: () => "SERVER_TS" };

  it("writes the exact wire doc (total cadence: no weeks)", () => {
    const v = ok(validate());
    expect(buildCoachChallengeDoc(v, COACH, stamps)).toEqual({
      origin: "coach",
      creatorUid: COACH,
      name: "Agosto a full",
      kind: "workouts",
      cadence: "total",
      target: 12,
      durationDays: 14,
      startsAt: { ms: Date.parse("2026-08-20T03:00:00Z") },
      endsAt: { ms: Date.parse("2026-09-03T03:00:00Z") },
      timezone: TZ_AR,
      status: "active",
      memberUids: ["c1", "c2"],
      members: {
        c1: {
          status: "invited",
          progress: 0,
          completedAt: null,
          joinedAt: null,
          invitedBy: COACH,
          handle: "",
          displayName: "",
          photoURL: null,
        },
        c2: {
          status: "invited",
          progress: 0,
          completedAt: null,
          joinedAt: null,
          invitedBy: COACH,
          handle: "",
          displayName: "",
          photoURL: null,
        },
      },
      hidden: false,
      startPushPending: true,
      createdAt: "SERVER_TS",
      updatedAt: "SERVER_TS",
    });
  });

  it("weekly: one zero per week; the coach is never a member; nothing is undefined", () => {
    const v = ok(
      validate(
        { cadence: "weekly", kind: "volume", target: 7500.255, endDate: "2026-09-09" },
        { clientUids: [COACH, "c1"] },
      ),
    );
    const doc = buildCoachChallengeDoc(v, COACH, stamps);
    expect(doc.target).toBe(7500.26);
    expect(doc.memberUids).toEqual(["c1"]);
    expect((doc.members as Record<string, { weeks: number[] }>).c1.weeks).toEqual([0, 0, 0]);
    expect(containsUndefined(doc)).toBe(false);
    expect(containsUndefined(buildCoachChallengeDoc(ok(validate()), COACH, stamps))).toBe(false);
  });
});

describe("rankCoachChallengeStandings — shared vector (twin of functions rankChallengeStandings)", () => {
  const cases = (vector as unknown as { cases: Array<{ name: string; members: Record<string, StandingsMemberInput>; expected: Array<{ uid: string; rank: number }> }> }).cases;

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(rankCoachChallengeStandings(c.members).map(({ uid, rank }) => ({ uid, rank }))).toEqual(c.expected);
  });

  it("ties share rank only when progress + completedAt are equal; joinedAt only orders", () => {
    const rows = rankCoachChallengeStandings({
      z: { status: "joined", progress: 3, completedAt: null, joinedAt: 10 },
      a: { status: "joined", progress: 3, completedAt: null, joinedAt: 20 },
      m: { status: "joined", progress: 3, completedAt: 5, joinedAt: 30 },
      n: { status: "invited", progress: 9, completedAt: null, joinedAt: null },
      q: { status: "joined", progress: 1, completedAt: null, joinedAt: null },
    });
    expect(rows.map((r) => [r.uid, r.rank])).toEqual([
      ["m", 1],
      ["z", 2],
      ["a", 2],
      ["q", 4],
    ]);
  });
});

describe("summarizeCoachChallenge / sortCoachChallenges", () => {
  const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });
  const base = {
    origin: "coach",
    creatorUid: COACH,
    name: "Septiembre",
    kind: "workouts",
    cadence: "total",
    target: 4,
    durationDays: 7,
    startsAt: ts("2026-08-20T03:00:00Z"),
    endsAt: ts("2026-08-27T03:00:00Z"),
    timezone: TZ_AR,
    status: "active",
    memberUids: ["c1", "c2", "c3", "c4"],
    members: {
      c1: { status: "joined", progress: 3, completedAt: null, joinedAt: ts("2026-08-20T10:00:00Z"), displayName: "Ana", handle: "ana" },
      c2: { status: "joined", progress: 4, completedAt: ts("2026-08-22T10:00:00Z"), joinedAt: ts("2026-08-20T11:00:00Z"), displayName: "", handle: "" },
      c3: { status: "invited", progress: 0, completedAt: null, joinedAt: null, displayName: "", handle: "" },
      c4: { status: "declined", progress: 0, completedAt: null, joinedAt: null, displayName: "", handle: "" },
    },
    hidden: false,
  };

  it("counts invited / joined / pending and ranks only joined members", () => {
    const s = summarizeCoachChallenge("ch1", base, NOW, new Map([["c2", "Beto (roster)"]]))!;
    expect(s.status).toBe("active");
    expect(s.invitedCount).toBe(4);
    expect(s.joinedCount).toBe(2);
    expect(s.pendingCount).toBe(1);
    expect(s.startDate).toBe("2026-08-20");
    expect(s.endDate).toBe("2026-08-26");
    expect(s.standings.map((r) => [r.uid, r.rank, r.name, r.progress])).toEqual([
      ["c2", 1, "Beto (roster)", 4],
      ["c1", 2, "Ana", 3],
    ]);
  });

  it("treats endsAt <= now as ended even before the close job runs", () => {
    expect(summarizeCoachChallenge("ch1", base, Date.parse("2026-08-27T03:00:00Z"))!.status).toBe("ended");
    expect(summarizeCoachChallenge("ch1", base, Date.parse("2026-08-27T02:59:59Z"))!.status).toBe("active");
    expect(summarizeCoachChallenge("ch1", { ...base, status: "ended" }, NOW)!.status).toBe("ended");
  });

  it("skips docs it can't show", () => {
    expect(summarizeCoachChallenge("x", { ...base, startsAt: null }, NOW)).toBeNull();
    expect(summarizeCoachChallenge("x", { ...base, kind: "muscleSets" }, NOW)).toBeNull();
  });

  it("sorts active first, then endsAt DESC", () => {
    const mk = (id: string, endsAt: string) =>
      summarizeCoachChallenge(id, { ...base, endsAt: ts(endsAt) }, NOW)!;
    const sorted = sortCoachChallenges([
      mk("old", "2026-08-01T03:00:00Z"),
      mk("soon", "2026-08-25T03:00:00Z"),
      mk("later", "2026-09-25T03:00:00Z"),
      mk("older", "2026-07-01T03:00:00Z"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["later", "soon", "old", "older"]);
  });
});
