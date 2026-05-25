// __tests__/seed-from-fexd.test.ts
//
// Unit tests for Task C of plan 260522-mo2 — the Firestore migration that
// overwrites wger-* survivor docs in place with fexd payload (MATCH),
// inserts new fexd-<slug> docs (NEW), and soft-deletes unmatched wger-*
// survivors. Covers all behaviors enumerated in PLAN.md <behavior>:
//
//   C.beh.1   Default dry-run; --apply opt-in
//   C.beh.2   MATCH → kind:'overwrite' patch with source:'free-exercise-db'
//   C.beh.3   NEW → kind:'insert' patch routed through op:'set'
//   C.beh.4   Unmatched wger survivor → kind:'soft-delete'; already-soft-deleted skipped
//   C.beh.5   Idempotency: converged docs return kind:'skip'
//   C.beh.6   resolveTranslation throws MissingTranslation on missing entry
//   C.beh.7   Missing media-asset (status != uploaded|skipped) → kind:'skip'
//   C.beh.9 (assembly) MATCH+soft-delete→op:'update', NEW→op:'set' through commitInChunks
//
// Phase 24-03 extensions (7 new cases):
//   24-03.1   buildPayload now derives muscleGroups via mapFexdMuscles
//   24-03.2   buildPayload propagates `force` (push|pull|static|null)
//   24-03.3   canonical() includes "force" in its key list → idempotency converges with force
//   24-03.4   computePatch update-path: doc missing `force` returns kind:'overwrite' with patch.force
//   24-03.5   resolveDefaultAllowlistPath: Phase 24 path when fs.existsSync→true; legacy path otherwise
//   24-03.6   --canary <N> caps allowlist to first N picks (slice helper)
//   24-03.7   parseArgs --canary parses positive integer; --report-only flips flag
//
// firebase-admin/firestore is mocked — no live network calls.

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

import * as fs from "node:fs";

import {
  parseArgs,
  resolveTranslation,
  computePatch,
  buildWritesFromPicks,
  buildPayload,
  canonical,
  resolveDefaultAllowlistPath,
  applyCanaryCap,
  type FexdTranslations,
  type FexdTranslationEntry,
  type AllowlistEntry,
  type DocSnapshot,
  type AssetReport,
  type FexdSourceRow,
} from "../seed-from-fexd";

// ---------------------------------------------------------------------------
// Common fixtures
// ---------------------------------------------------------------------------

const TRANSLATIONS: FexdTranslations = {
  "_meta": {
    description: "test",
    generated_by: "test",
    generated_at: "2026-05-22T00:00:00Z",
    pick_count: 2,
    applies_to_plan: "260522-mo2",
  } as unknown as FexdTranslationEntry,
  "wger-aaaa1111": {
    name_en: "Barbell Squat",
    name_es: "Sentadilla con barra",
    instructions_en: ["Stand under the bar."],
    instructions_es: ["De pie bajo la barra."],
  },
  "fexd-Bodyweight_Squat": {
    name_en: "Bodyweight Squat",
    name_es: "Sentadilla con peso corporal",
    instructions_en: ["Stand with feet shoulder-width apart."],
    instructions_es: ["De pie con los pies a la anchura de los hombros."],
  },
};

const ASSETS_REPORT: AssetReport = {
  "wger-aaaa1111": {
    status: "uploaded",
    imageUrl: "https://firebasestorage.googleapis.com/.../wger-aaaa1111/start.jpg?t=tok",
    endImageUrl: "https://firebasestorage.googleapis.com/.../wger-aaaa1111/end.jpg?t=tok",
    gifUrl: "https://firebasestorage.googleapis.com/.../wger-aaaa1111/preview.gif?t=tok",
    sourceSha256: "abc",
  },
  "fexd-Bodyweight_Squat": {
    status: "skipped",
    imageUrl: "https://firebasestorage.googleapis.com/.../fexd-Bodyweight_Squat/start.jpg?t=tok",
    endImageUrl: "https://firebasestorage.googleapis.com/.../fexd-Bodyweight_Squat/end.jpg?t=tok",
    gifUrl: "https://firebasestorage.googleapis.com/.../fexd-Bodyweight_Squat/preview.gif?t=tok",
    sourceSha256: "def",
  },
};

const PICKS: AllowlistEntry[] = [
  {
    exerciseId: "wger-aaaa1111",
    fexdSlug: "Barbell_Squat",
    fexdDir: "Barbell_Squat",
    disposition: "MATCH",
  },
  {
    exerciseId: "fexd-Bodyweight_Squat",
    fexdSlug: "Bodyweight_Squat",
    fexdDir: "Bodyweight_Squat",
    disposition: "NEW",
  },
];

// Minimal fexd source — only the fields seed-from-fexd reads.
// Phase 24-03: `force` field added to FexdSourceRow.
const FEXD_SOURCE: Record<string, Partial<DocSnapshot["fexd"]>> = {
  Barbell_Squat: {
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "lower back"],
    equipment: "barbell",
    mechanic: "compound",
    level: "intermediate",
    category: "strength",
    force: "push",
  },
  Bodyweight_Squat: {
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    equipment: "body only",
    mechanic: "compound",
    level: "beginner",
    category: "strength",
    force: "push",
  },
};

// ---------------------------------------------------------------------------
// C.beh.1 — Default dry-run; --apply flips
// ---------------------------------------------------------------------------

describe("parseArgs (C.beh.1)", () => {
  it("defaults apply=false", () => {
    expect(parseArgs([]).apply).toBe(false);
  });
  it("--apply flips to true", () => {
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });
  it("unknown args throw", () => {
    expect(() => parseArgs(["--whatever"])).toThrow(/Unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// C.beh.6 — Translation lookup throws MissingTranslation
// ---------------------------------------------------------------------------

describe("resolveTranslation (C.beh.6)", () => {
  it("returns name+instructions when key present", () => {
    const r = resolveTranslation("wger-aaaa1111", TRANSLATIONS);
    expect(r.name_en).toBe("Barbell Squat");
    expect(r.name_es).toBe("Sentadilla con barra");
    expect(r.instructions_en).toHaveLength(1);
    expect(r.instructions_es).toHaveLength(1);
  });

  it("throws MissingTranslation when key absent", () => {
    expect(() => resolveTranslation("fexd-no-such", TRANSLATIONS)).toThrow(
      /MissingTranslation/,
    );
  });
});

// ---------------------------------------------------------------------------
// C.beh.2 — MATCH with stale on-disk source returns kind:'overwrite'
// C.beh.7 — When asset status != uploaded|skipped, kind becomes 'skip'
// ---------------------------------------------------------------------------

describe("computePatch — MATCH (C.beh.2 + C.beh.5 + C.beh.7)", () => {
  it("C.beh.2: stale wger doc returns kind:'overwrite' with source:'free-exercise-db'", () => {
    const snap: DocSnapshot = {
      id: "wger-aaaa1111",
      exists: true,
      data: { name: { en: "Squat", es: "Sentadilla" }, source: "wger", version: 1 },
      fexd: FEXD_SOURCE.Barbell_Squat as never,
    };
    const plan = computePatch(snap, PICKS[0], TRANSLATIONS, ASSETS_REPORT, new Set());
    expect(plan.kind).toBe("overwrite");
    expect(plan.patch).not.toBeNull();
    expect(plan.patch!.source).toBe("free-exercise-db");
    expect(plan.patch!.imageUrl).toMatch(/firebasestorage\.googleapis\.com/);
    expect(plan.patch!.gifUrl).toMatch(/firebasestorage\.googleapis\.com/);
    expect((plan.patch!.name as { en: string }).en).toBe("Barbell Squat");
    expect((plan.patch!.name as { es: string }).es).toBe("Sentadilla con barra");
    expect(plan.patch!.version).toBe(2);
  });

  it("C.beh.5: already-converged MATCH returns kind:'skip'", () => {
    const snap: DocSnapshot = {
      id: "wger-aaaa1111",
      exists: true,
      data: {
        name: { en: "Barbell Squat", es: "Sentadilla con barra" },
        description: { en: "", es: "" },
        source: "free-exercise-db",
        version: 2,
        imageUrl: ASSETS_REPORT["wger-aaaa1111"].imageUrl,
        endImageUrl: ASSETS_REPORT["wger-aaaa1111"].endImageUrl,
        gifUrl: ASSETS_REPORT["wger-aaaa1111"].gifUrl,
        instructions: {
          en: ["Stand under the bar."],
          es: ["De pie bajo la barra."],
        },
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: ["glutes", "lower back"],
        // Phase 24-03: muscleGroups now GC canonical via mapFexdMuscles;
        // `quadriceps` is a 1:1 passthrough so the converged shape matches.
        muscleGroups: ["quadriceps"],
        equipment: ["barbell"],
        mechanic: "compound",
        level: "intermediate",
        category: "strength",
        // Phase 24-03: `force` must be present on the doc for convergence.
        force: "push",
      },
      fexd: FEXD_SOURCE.Barbell_Squat as never,
    };
    const plan = computePatch(snap, PICKS[0], TRANSLATIONS, ASSETS_REPORT, new Set());
    expect(plan.kind).toBe("skip");
  });

  it("C.beh.7: missing asset (status != uploaded|skipped) returns kind:'skip' with reason 'missing media'", () => {
    const snap: DocSnapshot = {
      id: "wger-aaaa1111",
      exists: true,
      data: { name: { en: "Squat", es: "Sentadilla" }, source: "wger", version: 1 },
      fexd: FEXD_SOURCE.Barbell_Squat as never,
    };
    const reportNoMedia: AssetReport = {
      "wger-aaaa1111": { status: "missing-source", error: "404" },
    };
    const plan = computePatch(snap, PICKS[0], TRANSLATIONS, reportNoMedia, new Set());
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toMatch(/missing media/i);
  });
});

// ---------------------------------------------------------------------------
// C.beh.3 — NEW returns kind:'insert' with op-routing intent
// ---------------------------------------------------------------------------

describe("computePatch — NEW (C.beh.3)", () => {
  it("C.beh.3: no existing doc at fexd-<slug> returns kind:'insert'", () => {
    const snap: DocSnapshot = {
      id: "fexd-Bodyweight_Squat",
      exists: false,
      data: null,
      fexd: FEXD_SOURCE.Bodyweight_Squat as never,
    };
    const plan = computePatch(snap, PICKS[1], TRANSLATIONS, ASSETS_REPORT, new Set());
    expect(plan.kind).toBe("insert");
    expect(plan.patch).not.toBeNull();
    expect(plan.patch!.createdAt).toBe("__SERVER_TIMESTAMP__");
    expect(plan.patch!.source).toBe("free-exercise-db");
    expect((plan.patch!.name as { en: string }).en).toBe("Bodyweight Squat");
  });

  it("C.beh.5: already-existing fexd-<slug> with converged payload returns kind:'skip'", () => {
    const snap: DocSnapshot = {
      id: "fexd-Bodyweight_Squat",
      exists: true,
      data: {
        name: { en: "Bodyweight Squat", es: "Sentadilla con peso corporal" },
        description: { en: "", es: "" },
        source: "free-exercise-db",
        version: 1,
        imageUrl: ASSETS_REPORT["fexd-Bodyweight_Squat"].imageUrl,
        endImageUrl: ASSETS_REPORT["fexd-Bodyweight_Squat"].endImageUrl,
        gifUrl: ASSETS_REPORT["fexd-Bodyweight_Squat"].gifUrl,
        instructions: {
          en: ["Stand with feet shoulder-width apart."],
          es: ["De pie con los pies a la anchura de los hombros."],
        },
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: ["glutes"],
        // Phase 24-03: muscleGroups now GC canonical via mapFexdMuscles.
        muscleGroups: ["quadriceps"],
        equipment: ["body only"],
        mechanic: "compound",
        level: "beginner",
        category: "strength",
        // Phase 24-03: `force` participates in the canonical convergence check.
        force: "push",
      },
      fexd: FEXD_SOURCE.Bodyweight_Squat as never,
    };
    const plan = computePatch(snap, PICKS[1], TRANSLATIONS, ASSETS_REPORT, new Set());
    expect(plan.kind).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// C.beh.4 — Unmatched survivor → kind:'soft-delete'; already-soft-deleted skipped
// ---------------------------------------------------------------------------

describe("computePatch — soft-delete (C.beh.4)", () => {
  it("unmatched wger survivor returns kind:'soft-delete' with deletedReason='superseded-by-fexd'", () => {
    const unmatchedSet = new Set(["wger-unused"]);
    const snap: DocSnapshot = {
      id: "wger-unused",
      exists: true,
      data: { name: { en: "Old Lift", es: "Levantamiento viejo" }, source: "wger", version: 1 },
      fexd: null,
    };
    const plan = computePatch(snap, null, TRANSLATIONS, ASSETS_REPORT, unmatchedSet);
    expect(plan.kind).toBe("soft-delete");
    expect(plan.patch).toEqual({
      deletedAt: "__SERVER_TIMESTAMP__",
      deletedReason: "superseded-by-fexd",
      updatedAt: "__SERVER_TIMESTAMP__",
    });
  });

  it("already-soft-deleted wger doc (deletedAt non-null) returns kind:'skip'", () => {
    const unmatchedSet = new Set(["wger-already-deleted"]);
    const snap: DocSnapshot = {
      id: "wger-already-deleted",
      exists: true,
      data: {
        name: { en: "Dead Lift", es: "Levantamiento eliminado" },
        source: "wger",
        version: 1,
        deletedAt: { __ts__: 999 },
        deletedReason: "superseded-by-fexd",
      },
      fexd: null,
    };
    const plan = computePatch(snap, null, TRANSLATIONS, ASSETS_REPORT, unmatchedSet);
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toMatch(/already soft-deleted/i);
  });

  it("non-wger non-fexd doc returns kind:'skip'", () => {
    const snap: DocSnapshot = {
      id: "custom-trainerUid-zzz",
      exists: true,
      data: { name: { en: "Trainer thing", es: "Cosa entrenador" }, source: "trainer", version: 1 },
      fexd: null,
    };
    const plan = computePatch(snap, null, TRANSLATIONS, ASSETS_REPORT, new Set());
    expect(plan.kind).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// C.beh.9 — Assembly routes MATCH+soft-delete→op:'update', NEW→op:'set'
// ---------------------------------------------------------------------------

describe("buildWritesFromPicks (C.beh.9)", () => {
  it("emits the correct (ref, op) tuples per disposition", () => {
    const matchPlan = {
      kind: "overwrite" as const,
      patch: { source: "free-exercise-db" } as Record<string, unknown>,
      reason: null,
    };
    const insertPlan = {
      kind: "insert" as const,
      patch: { source: "free-exercise-db" } as Record<string, unknown>,
      reason: null,
    };
    const softDeletePlan = {
      kind: "soft-delete" as const,
      patch: { deletedAt: "x", deletedReason: "superseded-by-fexd", updatedAt: "x" } as Record<
        string,
        unknown
      >,
      reason: null,
    };
    const skipPlan = { kind: "skip" as const, patch: null, reason: "converged" };

    const writes = buildWritesFromPicks(
      [
        { ref: "ref-match", plan: matchPlan },
        { ref: "ref-insert", plan: insertPlan },
        { ref: "ref-soft-delete", plan: softDeletePlan },
        { ref: "ref-skip", plan: skipPlan },
      ],
    );

    expect(writes).toHaveLength(3); // skip excluded
    expect(writes.find((w) => w.ref === "ref-match")!.op).toBe("update");
    expect(writes.find((w) => w.ref === "ref-insert")!.op).toBe("set");
    expect(writes.find((w) => w.ref === "ref-soft-delete")!.op).toBe("update");
    expect(writes.every((w) => w.data != null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

describe("module shape", () => {
  it("seed-from-fexd exports the expected functions", () => {
    expect(typeof parseArgs).toBe("function");
    expect(typeof resolveTranslation).toBe("function");
    expect(typeof computePatch).toBe("function");
    expect(typeof buildWritesFromPicks).toBe("function");
    // Phase 24-03 — new exports
    expect(typeof buildPayload).toBe("function");
    expect(typeof canonical).toBe("function");
    expect(typeof resolveDefaultAllowlistPath).toBe("function");
    expect(typeof applyCanaryCap).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Phase 24-03 — buildPayload vocab map + force field (24-03.1 + 24-03.2)
// ---------------------------------------------------------------------------

describe("buildPayload — Phase 24-03 vocab map + force (24-03.1, 24-03.2)", () => {
  const minimalPick: AllowlistEntry = {
    exerciseId: "fexd-Demo",
    fexdSlug: "Demo",
    fexdDir: "Demo",
    disposition: "NEW",
  };
  const minimalTranslation: FexdTranslationEntry = {
    name_en: "Demo",
    name_es: "Demo ES",
    instructions_en: ["go"],
    instructions_es: ["andá"],
  };
  const minimalAsset = {
    status: "uploaded" as const,
    imageUrl: "https://example.test/start.jpg",
    endImageUrl: "https://example.test/end.jpg",
    gifUrl: "https://example.test/preview.gif",
  };

  it("24-03.1: muscleGroups is derived via mapFexdMuscles (lats+middle back → ['back'])", () => {
    const fexd: FexdSourceRow = {
      id: "Demo",
      name: "Demo",
      primaryMuscles: ["lats", "middle back"],
      secondaryMuscles: [],
      equipment: "barbell",
      mechanic: "compound",
      level: "intermediate",
      category: "strength",
      instructions: ["go"],
      force: "pull",
    };
    const payload = buildPayload(minimalPick, minimalTranslation, minimalAsset, fexd);
    expect(payload.muscleGroups).toEqual(["back"]);
    // primaryMuscles retains the raw FEXD vocab (downstream filter affordance).
    expect(payload.primaryMuscles).toEqual(["lats", "middle back"]);
  });

  it("24-03.1: muscleGroups dedupes (abdominals → abs, single bucket)", () => {
    const fexd: FexdSourceRow = {
      id: "Demo",
      name: "Demo",
      primaryMuscles: ["abdominals"],
      secondaryMuscles: [],
      equipment: null,
      mechanic: null,
      level: "beginner",
      category: "strength",
      instructions: [],
      force: "static",
    };
    const payload = buildPayload(minimalPick, minimalTranslation, minimalAsset, fexd);
    expect(payload.muscleGroups).toEqual(["abs"]);
  });

  it("24-03.2: payload.force mirrors fexd.force (push|pull|static)", () => {
    const fexd: FexdSourceRow = {
      id: "Demo",
      name: "Demo",
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
      equipment: "barbell",
      mechanic: "compound",
      level: "intermediate",
      category: "strength",
      instructions: [],
      force: "push",
    };
    expect(buildPayload(minimalPick, minimalTranslation, minimalAsset, fexd).force).toBe("push");
  });

  it("24-03.2: payload.force is null when fexd is null", () => {
    expect(
      buildPayload(minimalPick, minimalTranslation, minimalAsset, null).force,
    ).toBeNull();
  });

  it("24-03.2: payload.force is null when fexd.force is null (e.g., cardio/stretching)", () => {
    const fexd = {
      id: "Demo",
      name: "Demo",
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
      equipment: null,
      mechanic: null,
      level: "beginner",
      category: "cardio",
      instructions: [],
      force: null,
    } as unknown as FexdSourceRow;
    expect(buildPayload(minimalPick, minimalTranslation, minimalAsset, fexd).force).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 24-03 — canonical() projects the `force` field (24-03.3)
// ---------------------------------------------------------------------------

describe("canonical — Phase 24-03 keys list (24-03.3)", () => {
  it("24-03.3: `force` is included in the canonical key projection", () => {
    const projected = canonical({
      name: { en: "X", es: "X" },
      description: { en: "", es: "" },
      instructions: { en: [], es: [] },
      primaryMuscles: [],
      secondaryMuscles: [],
      muscleGroups: [],
      equipment: [],
      mechanic: null,
      level: null,
      category: null,
      force: "push",
      imageUrl: null,
      endImageUrl: null,
      gifUrl: null,
      source: "free-exercise-db",
      // a junk field that must NOT appear in the projection
      __noise: "should not project",
    } as Record<string, unknown>);
    expect(Object.prototype.hasOwnProperty.call(projected, "force")).toBe(true);
    expect((projected as Record<string, unknown>).force).toBe("push");
    expect(Object.prototype.hasOwnProperty.call(projected, "__noise")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 24-03 — convergence update path when doc missing `force` (24-03.4)
// ---------------------------------------------------------------------------

describe("computePatch — Phase 24-03 force convergence (24-03.4)", () => {
  it("24-03.4: a MATCH doc missing `force` returns kind:'overwrite' with patch.force set", () => {
    const snap: DocSnapshot = {
      id: "wger-aaaa1111",
      exists: true,
      data: {
        // converged on every Phase 24-03 field EXCEPT `force` (absent)
        name: { en: "Barbell Squat", es: "Sentadilla con barra" },
        description: { en: "", es: "" },
        source: "free-exercise-db",
        version: 2,
        imageUrl: ASSETS_REPORT["wger-aaaa1111"].imageUrl,
        endImageUrl: ASSETS_REPORT["wger-aaaa1111"].endImageUrl,
        gifUrl: ASSETS_REPORT["wger-aaaa1111"].gifUrl,
        instructions: {
          en: ["Stand under the bar."],
          es: ["De pie bajo la barra."],
        },
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: ["glutes", "lower back"],
        muscleGroups: ["quadriceps"],
        equipment: ["barbell"],
        mechanic: "compound",
        level: "intermediate",
        category: "strength",
        // force intentionally absent — this is the pre-Phase-24 shape
      },
      fexd: FEXD_SOURCE.Barbell_Squat as never,
    };
    const plan = computePatch(snap, PICKS[0], TRANSLATIONS, ASSETS_REPORT, new Set());
    expect(plan.kind).toBe("overwrite");
    expect(plan.patch).not.toBeNull();
    expect(plan.patch!.force).toBe("push");
  });
});

// ---------------------------------------------------------------------------
// Phase 24-03 — resolveDefaultAllowlistPath shim (24-03.5)
// ---------------------------------------------------------------------------

describe("resolveDefaultAllowlistPath — Codex MEDIUM backward-compat (24-03.5)", () => {
  // We mock fs.existsSync per-test to drive the resolver's two branches.
  // Cast `as jest.SpyInstance` is intentional — we only ever read `mockImplementation`.
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(fs, "existsSync");
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("24-03.5a: returns Phase 24 path when fs.existsSync(phase24) → true", () => {
    spy.mockImplementation((p: fs.PathLike) =>
      String(p).includes("24-exercise-library-expansion-free-exercise-db"),
    );
    const resolved = resolveDefaultAllowlistPath();
    expect(resolved).toMatch(/24-exercise-library-expansion-free-exercise-db/);
    expect(resolved).toMatch(/ALLOWLIST-PROPOSAL\.md$/);
  });

  it("24-03.5b: falls back to legacy MO2 path when Phase 24 path absent", () => {
    spy.mockImplementation(() => false);
    const resolved = resolveDefaultAllowlistPath();
    expect(resolved).toMatch(/260522-mo2/);
    expect(resolved).toMatch(/ALLOWLIST-PROPOSAL\.md$/);
  });
});

// ---------------------------------------------------------------------------
// Phase 24-03 — --canary slicing helper (24-03.6 + 24-03.7)
// ---------------------------------------------------------------------------

describe("applyCanaryCap — Codex HIGH blast-radius mitigation (24-03.6)", () => {
  const makePicks = (n: number): AllowlistEntry[] =>
    Array.from({ length: n }, (_, i) => ({
      exerciseId: `fexd-Demo${i}`,
      fexdSlug: `Demo${i}`,
      fexdDir: `Demo${i}`,
      disposition: "NEW" as const,
    }));

  it("24-03.6: --canary 5 over 100 picks returns first 5", () => {
    const out = applyCanaryCap(makePicks(100), 5);
    expect(out).toHaveLength(5);
    expect(out[0].exerciseId).toBe("fexd-Demo0");
    expect(out[4].exerciseId).toBe("fexd-Demo4");
  });

  it("24-03.6: undefined canary returns picks unchanged (no cap)", () => {
    const picks = makePicks(7);
    expect(applyCanaryCap(picks, undefined)).toBe(picks);
  });

  it("24-03.6: canary >= picks.length returns all picks (no truncation past end)", () => {
    const picks = makePicks(3);
    expect(applyCanaryCap(picks, 10)).toHaveLength(3);
  });
});

describe("parseArgs — Phase 24-03 flags (24-03.7)", () => {
  it("24-03.7: defaults canary=undefined and reportOnly=false", () => {
    const args = parseArgs([]);
    expect(args.canary).toBeUndefined();
    expect(args.reportOnly).toBe(false);
  });

  it("24-03.7: --canary 10 parses as positive integer", () => {
    const args = parseArgs(["--canary", "10"]);
    expect(args.canary).toBe(10);
  });

  it("24-03.7: --canary 0 or negative throws (positive-integer guard)", () => {
    expect(() => parseArgs(["--canary", "0"])).toThrow(/positive integer/i);
    expect(() => parseArgs(["--canary", "-3"])).toThrow(/positive integer/i);
    expect(() => parseArgs(["--canary", "notanumber"])).toThrow(/positive integer/i);
  });

  it("24-03.7: --report-only flips reportOnly to true", () => {
    const args = parseArgs(["--report-only"]);
    expect(args.reportOnly).toBe(true);
  });
});
