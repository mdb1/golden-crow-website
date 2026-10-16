// live-workout-schema.test.ts — #451 regression net.
//
// The Zod gate in front of the coach-run live-session Server Actions
// (start / sync / finalize / exercise notes). Valid payloads must pass with the
// documented defaults; malformed, oversized and negative values must be refused
// BEFORE anything reaches Firestore.

import {
  finalizeSessionSchema,
  getClientExerciseNoteSchema,
  sessionExerciseSnapshotSchema,
  sessionSetLogSchema,
  setClientExerciseNoteSchema,
  startSessionSchema,
  syncSessionSchema,
} from "../live-workout-schema";

const ISO = "2026-10-16T12:00:00.000Z";

function set(overrides: Record<string, unknown> = {}) {
  return {
    id: "set-1",
    exerciseId: "ex-1",
    setIndex: 0,
    weightKg: 80,
    reps: 8,
    completedAt: ISO,
    isWarmup: false,
    clientLoggedAt: ISO,
    ...overrides,
  };
}

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    exerciseId: "ex-1",
    sets: 3,
    reps: 10,
    restSeconds: 90,
    order: 1,
    ...overrides,
  };
}

describe("sessionSetLogSchema", () => {
  it("accepts a minimal valid set", () => {
    expect(sessionSetLogSchema.safeParse(set()).success).toBe(true);
  });

  it("accepts the optional richer fields, including null", () => {
    const full = set({
      durationSeconds: 45,
      setType: "dropset",
      bodyweightKg: 72.5,
      bodyweightFactor: 0.65,
    });
    expect(sessionSetLogSchema.parse(full)).toEqual(full);
    expect(
      sessionSetLogSchema.safeParse(
        set({ durationSeconds: null, setType: null, bodyweightKg: null, bodyweightFactor: null }),
      ).success,
    ).toBe(true);
  });

  it("accepts the boundaries", () => {
    for (const ok of [
      set({ setIndex: 99, weightKg: 2000, reps: 100 }),
      set({ weightKg: 0, reps: 0 }),
      set({ durationSeconds: 1 }),
      set({ durationSeconds: 86_400 }),
      set({ bodyweightFactor: 0 }),
      set({ bodyweightFactor: 1 }),
      set({ bodyweightKg: 1000 }),
      set({ weightKg: 22.5 }),
    ]) {
      expect(sessionSetLogSchema.safeParse(ok).success).toBe(true);
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ["negative weight", { weightKg: -1 }],
    ["oversized weight", { weightKg: 2000.5 }],
    ["negative reps", { reps: -1 }],
    ["fractional reps", { reps: 8.5 }],
    ["too many reps", { reps: 101 }],
    ["negative setIndex", { setIndex: -1 }],
    ["setIndex 100", { setIndex: 100 }],
    ["fractional setIndex", { setIndex: 1.5 }],
    ["zero duration", { durationSeconds: 0 }],
    ["duration over a day", { durationSeconds: 86_401 }],
    ["fractional duration", { durationSeconds: 10.5 }],
    ["unknown setType", { setType: "superset" }],
    ["zero bodyweight", { bodyweightKg: 0 }],
    ["negative bodyweight", { bodyweightKg: -70 }],
    ["bodyweight over 1000", { bodyweightKg: 1001 }],
    ["factor above 1", { bodyweightFactor: 1.01 }],
    ["negative factor", { bodyweightFactor: -0.1 }],
    ["empty id", { id: "" }],
    ["empty exerciseId", { exerciseId: "" }],
    ["id over 128 chars", { id: "x".repeat(129) }],
    ["unparseable completedAt", { completedAt: "yesterday-ish" }],
    ["empty clientLoggedAt", { clientLoggedAt: "" }],
    ["string weight", { weightKg: "80" }],
    ["NaN weight", { weightKg: Number.NaN }],
    ["Infinity weight", { weightKg: Number.POSITIVE_INFINITY }],
    ["string isWarmup", { isWarmup: "false" }],
  ])("rejects %s", (_label, overrides) => {
    expect(sessionSetLogSchema.safeParse(set(overrides)).success).toBe(false);
  });

  it.each(["id", "exerciseId", "setIndex", "weightKg", "reps", "completedAt", "isWarmup", "clientLoggedAt"])(
    "rejects a set missing %s",
    (key) => {
      const payload: Record<string, unknown> = set();
      delete payload[key];
      expect(sessionSetLogSchema.safeParse(payload).success).toBe(false);
    },
  );

  it("accepts a 128-char id exactly", () => {
    expect(sessionSetLogSchema.safeParse(set({ id: "x".repeat(128) })).success).toBe(true);
  });
});

describe("startSessionSchema", () => {
  it("needs a non-empty assignmentId", () => {
    expect(startSessionSchema.safeParse({ assignmentId: "a1" }).success).toBe(true);
    expect(startSessionSchema.safeParse({ assignmentId: "" }).success).toBe(false);
    expect(startSessionSchema.safeParse({}).success).toBe(false);
  });
});

describe("syncSessionSchema", () => {
  it("accepts an empty set list (nothing logged yet)", () => {
    expect(syncSessionSchema.safeParse({ logId: "log-1", sets: [] }).success).toBe(true);
  });

  it("caps the set list at 500", () => {
    const sets500 = Array.from({ length: 500 }, (_, i) => set({ id: `s${i}` }));
    expect(syncSessionSchema.safeParse({ logId: "log-1", sets: sets500 }).success).toBe(true);
    expect(
      syncSessionSchema.safeParse({ logId: "log-1", sets: [...sets500, set({ id: "s500" })] })
        .success,
    ).toBe(false);
  });

  it("rejects the whole payload when ONE set is malformed", () => {
    expect(
      syncSessionSchema.safeParse({ logId: "log-1", sets: [set(), set({ weightKg: -5 })] }).success,
    ).toBe(false);
  });

  it("rejects a missing / empty logId and a non-array sets", () => {
    expect(syncSessionSchema.safeParse({ sets: [] }).success).toBe(false);
    expect(syncSessionSchema.safeParse({ logId: "", sets: [] }).success).toBe(false);
    expect(syncSessionSchema.safeParse({ logId: "l", sets: set() }).success).toBe(false);
  });
});

describe("sessionExerciseSnapshotSchema", () => {
  it("accepts a minimal and a full exercise", () => {
    expect(sessionExerciseSnapshotSchema.safeParse(exercise()).success).toBe(true);
    const full = exercise({
      notes: "Slow eccentric",
      supersetGroup: "A",
      repsBySet: [10, 8, 6],
      weightBySetKg: [60, 70, 80],
      setTypesBySet: ["warmup", "normal", "failure"],
      metric: "time",
      durationBySetSeconds: [30, 30, 30],
      durationSeconds: 30,
    });
    expect(sessionExerciseSnapshotSchema.parse(full)).toEqual(full);
  });

  it.each<[string, Record<string, unknown>]>([
    ["zero sets", { sets: 0 }],
    ["21 sets", { sets: 21 }],
    ["negative reps", { reps: -1 }],
    ["negative rest", { restSeconds: -10 }],
    ["rest over an hour", { restSeconds: 3601 }],
    ["order 0", { order: 0 }],
    ["order 101", { order: 101 }],
    ["notes over 1000 chars", { notes: "n".repeat(1001) }],
    ["superset group over 8 chars", { supersetGroup: "ABCDEFGHI" }],
    ["21 repsBySet entries", { repsBySet: Array(21).fill(5) }],
    ["negative repsBySet entry", { repsBySet: [10, -1] }],
    ["negative weightBySetKg entry", { weightBySetKg: [-2.5] }],
    ["oversized weightBySetKg entry", { weightBySetKg: [2001] }],
    ["unknown setTypesBySet entry", { setTypesBySet: ["normal", "rest-pause"] }],
    ["unknown metric", { metric: "distance" }],
    ["zero durationBySetSeconds entry", { durationBySetSeconds: [0] }],
    ["zero durationSeconds", { durationSeconds: 0 }],
    ["empty exerciseId", { exerciseId: "" }],
  ])("rejects %s", (_label, overrides) => {
    expect(sessionExerciseSnapshotSchema.safeParse(exercise(overrides)).success).toBe(false);
  });
});

describe("finalizeSessionSchema", () => {
  it("defaults mode to 'session'", () => {
    const parsed = finalizeSessionSchema.parse({ logId: "log-1", sets: [set()] });
    expect(parsed.mode).toBe("session");
    expect(parsed.editedExercises).toBeUndefined();
  });

  it("accepts session_and_future with edited exercises, rpe and notes", () => {
    const parsed = finalizeSessionSchema.parse({
      logId: "log-1",
      sets: [set()],
      rpe: 8,
      notes: "Felt strong",
      mode: "session_and_future",
      editedExercises: [exercise()],
    });
    expect(parsed.mode).toBe("session_and_future");
    expect(parsed.editedExercises).toHaveLength(1);
  });

  it.each<[string, Record<string, unknown>]>([
    ["rpe 0", { rpe: 0 }],
    ["rpe 11", { rpe: 11 }],
    ["fractional rpe", { rpe: 7.5 }],
    ["notes over 2000 chars", { notes: "x".repeat(2001) }],
    ["unknown mode", { mode: "future_only" }],
    ["101 edited exercises", { editedExercises: Array.from({ length: 101 }, () => exercise()) }],
    ["malformed edited exercise", { editedExercises: [exercise({ sets: -1 })] }],
    ["over 500 sets", { sets: Array.from({ length: 501 }, () => set()) }],
  ])("rejects %s", (_label, overrides) => {
    expect(
      finalizeSessionSchema.safeParse({ logId: "log-1", sets: [set()], ...overrides }).success,
    ).toBe(false);
  });

  it("accepts the rpe and notes boundaries", () => {
    for (const rpe of [1, 10, null]) {
      expect(
        finalizeSessionSchema.safeParse({ logId: "l", sets: [], rpe, notes: "x".repeat(2000) })
          .success,
      ).toBe(true);
    }
  });
});

describe("client exercise note schemas", () => {
  it("get requires both ids", () => {
    expect(getClientExerciseNoteSchema.safeParse({ clientId: "c", exerciseId: "e" }).success).toBe(
      true,
    );
    expect(getClientExerciseNoteSchema.safeParse({ clientId: "", exerciseId: "e" }).success).toBe(
      false,
    );
    expect(getClientExerciseNoteSchema.safeParse({ clientId: "c" }).success).toBe(false);
  });

  it("set accepts an empty note (clears it) and caps at 1000 chars", () => {
    const base = { clientId: "c", exerciseId: "e" };
    expect(setClientExerciseNoteSchema.safeParse({ ...base, note: "" }).success).toBe(true);
    expect(setClientExerciseNoteSchema.safeParse({ ...base, note: "n".repeat(1000) }).success).toBe(
      true,
    );
    expect(setClientExerciseNoteSchema.safeParse({ ...base, note: "n".repeat(1001) }).success).toBe(
      false,
    );
    expect(setClientExerciseNoteSchema.safeParse({ ...base, note: null }).success).toBe(false);
  });
});
