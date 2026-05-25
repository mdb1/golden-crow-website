// __tests__/backfill-fexd-vocabulary.test.ts
//
// Unit tests for plan 24-01 Task 2 — the one-shot idempotent admin script
// that rewrites muscleGroups on the existing 63 FEXD docs from raw FEXD
// vocabulary to GC canonical vocabulary. Mirrors the dispatch-style tests
// in __tests__/seed-from-fexd.test.ts — only the pure computePatch()
// surface is exercised; firebase-admin is mocked away.
//
// 7 cases (Codex LOW review-pass added case #7):
//   1. skip non-FEXD docs (source: "wger") — never mutate wger docs
//   2. skip soft-deleted docs (deletedAt set) — never resurrect
//   3. skip already-converged docs (muscleGroups deep-equal to mapped)
//   4. update legacy raw-FEXD muscleGroups (kind: "update" + patch)
//   5. handle empty primaryMuscles array (skip when muscleGroups also [])
//   6. order-insensitive convergence (["back","abs"] vs ["abs","back"])
//   7. malformed primaryMuscles dispatch (non-array string → kind:"malformed")

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(() => "__SERVER_TIMESTAMP__") },
  Timestamp: { now: jest.fn(() => ({ __ts__: 12345 })) },
  getFirestore: jest.fn(),
}));

jest.mock("firebase-admin/app", () => ({
  cert: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

import {
  computePatch,
  type ExerciseDocShape,
  type PatchPlan,
} from "../backfill-fexd-vocabulary";

// ---------------------------------------------------------------------------
// Case 1 — skip non-FEXD docs (source: "wger")
// ---------------------------------------------------------------------------

describe("computePatch — non-FEXD doc (Case 1)", () => {
  it("returns kind:'skip' with reason 'not-fexd' for wger source", () => {
    const doc: ExerciseDocShape = {
      id: "wger-aaaa1111",
      source: "wger",
      primaryMuscles: ["lats", "middle back"],
      muscleGroups: ["lats", "middle back"],
      deletedAt: null,
    };
    const plan: PatchPlan = computePatch(doc);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") {
      expect(plan.reason).toBe("not-fexd");
    }
  });

  it("returns kind:'skip' with reason 'not-fexd' for trainer source", () => {
    const doc: ExerciseDocShape = {
      id: "custom-trainerUid-zzz",
      source: "trainer",
      primaryMuscles: ["abdominals"],
      muscleGroups: ["abdominals"],
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") expect(plan.reason).toBe("not-fexd");
  });
});

// ---------------------------------------------------------------------------
// Case 2 — skip soft-deleted FEXD docs (deletedAt set)
// ---------------------------------------------------------------------------

describe("computePatch — soft-deleted doc (Case 2)", () => {
  it("returns kind:'skip' with reason 'soft-deleted' when deletedAt is set", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-Old_Lift",
      source: "free-exercise-db",
      primaryMuscles: ["lats"],
      muscleGroups: ["lats"], // would otherwise need an update
      deletedAt: { __ts__: 999 },
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") expect(plan.reason).toBe("soft-deleted");
  });
});

// ---------------------------------------------------------------------------
// Case 3 — skip already-converged FEXD docs
// ---------------------------------------------------------------------------

describe("computePatch — already-converged (Case 3)", () => {
  it("returns kind:'skip' when muscleGroups equals mapFexdMuscles(primaryMuscles)", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-Barbell_Bench_Press",
      source: "free-exercise-db",
      primaryMuscles: ["chest"],
      muscleGroups: ["chest"], // already canonical
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") expect(plan.reason).toBe("already-converged");
  });

  it("returns kind:'skip' when collapsing primaries dedupe to the same set", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-Pullup",
      source: "free-exercise-db",
      primaryMuscles: ["lats", "middle back"], // map → ["back"]
      muscleGroups: ["back"], // already converged
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") expect(plan.reason).toBe("already-converged");
  });
});

// ---------------------------------------------------------------------------
// Case 4 — update legacy raw-FEXD muscleGroups
// ---------------------------------------------------------------------------

describe("computePatch — legacy raw FEXD muscleGroups (Case 4)", () => {
  it("returns kind:'update' with mapped muscleGroups + serverTimestamp", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-Pullup",
      source: "free-exercise-db",
      primaryMuscles: ["lats", "middle back"],
      muscleGroups: ["lats", "middle back"], // raw FEXD vocab — needs rewrite
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("update");
    if (plan.kind === "update") {
      expect(plan.patch.muscleGroups).toEqual(["back"]);
      expect(plan.patch.updatedAt).toBe("__SERVER_TIMESTAMP__");
    }
  });

  it("maps abdominals → abs and emits patch with updatedAt sentinel", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-Crunches",
      source: "free-exercise-db",
      primaryMuscles: ["abdominals"],
      muscleGroups: ["abdominals"], // raw FEXD — needs rewrite
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("update");
    if (plan.kind === "update") {
      expect(plan.patch.muscleGroups).toEqual(["abs"]);
      expect(plan.patch.updatedAt).toBe("__SERVER_TIMESTAMP__");
    }
  });
});

// ---------------------------------------------------------------------------
// Case 5 — empty primaryMuscles array
// ---------------------------------------------------------------------------

describe("computePatch — empty primaryMuscles (Case 5)", () => {
  it("returns kind:'skip' when both primaryMuscles and muscleGroups are []", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-Mystery",
      source: "free-exercise-db",
      primaryMuscles: [],
      muscleGroups: [],
      deletedAt: null,
    };
    const plan = computePatch(doc);
    // mapFexdMuscles([]) === [] which deep-equals current muscleGroups → converged
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") expect(plan.reason).toBe("already-converged");
  });
});

// ---------------------------------------------------------------------------
// Case 6 — order-insensitive convergence
// ---------------------------------------------------------------------------

describe("computePatch — order-insensitive convergence (Case 6)", () => {
  it("treats ['back','abs'] as converged when mapped result is ['abs','back']", () => {
    // primaryMuscles = ["abdominals","lats"] maps via mapFexdMuscles to
    // ["abs","back"] in insertion order. If the existing on-disk
    // muscleGroups happens to be ["back","abs"] (different order, same
    // set), computePatch MUST treat it as converged — Set equality, not
    // Array equality.
    const doc: ExerciseDocShape = {
      id: "fexd-AbBackCombo",
      source: "free-exercise-db",
      primaryMuscles: ["abdominals", "lats"],
      muscleGroups: ["back", "abs"], // reversed vs mapped output
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") expect(plan.reason).toBe("already-converged");
  });
});

// ---------------------------------------------------------------------------
// Case 7 — malformed primaryMuscles (Codex LOW)
// ---------------------------------------------------------------------------

describe("computePatch — malformed primaryMuscles (Case 7, Codex LOW)", () => {
  it("returns kind:'malformed' with observed JSON-stringified value when primaryMuscles is a string", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-BadShape",
      source: "free-exercise-db",
      // Intentionally wrong shape — a string where an array is expected.
      primaryMuscles: "chest" as unknown as string[],
      muscleGroups: [],
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("malformed");
    if (plan.kind === "malformed") {
      // JSON.stringify("chest") === '"chest"'
      expect(plan.observed).toBe('"chest"');
    }
  });

  it("returns kind:'malformed' when primaryMuscles is missing entirely", () => {
    const doc: ExerciseDocShape = {
      id: "fexd-NoMuscles",
      source: "free-exercise-db",
      primaryMuscles: undefined as unknown as string[],
      muscleGroups: [],
      deletedAt: null,
    };
    const plan = computePatch(doc);
    expect(plan.kind).toBe("malformed");
    if (plan.kind === "malformed") {
      expect(plan.observed).toBe("undefined");
    }
  });
});

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

describe("module shape", () => {
  it("backfill-fexd-vocabulary exports computePatch", () => {
    expect(typeof computePatch).toBe("function");
  });
});
