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

import {
  parseArgs,
  resolveTranslation,
  computePatch,
  buildWritesFromPicks,
  type FexdTranslations,
  type FexdTranslationEntry,
  type AllowlistEntry,
  type DocSnapshot,
  type AssetReport,
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
const FEXD_SOURCE: Record<string, Partial<DocSnapshot["fexd"]>> = {
  Barbell_Squat: {
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "lower back"],
    equipment: "barbell",
    mechanic: "compound",
    level: "intermediate",
    category: "strength",
  },
  Bodyweight_Squat: {
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    equipment: "body only",
    mechanic: "compound",
    level: "beginner",
    category: "strength",
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
        muscleGroups: ["quadriceps"],
        equipment: ["barbell"],
        mechanic: "compound",
        level: "intermediate",
        category: "strength",
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
        muscleGroups: ["quadriceps"],
        equipment: ["body only"],
        mechanic: "compound",
        level: "beginner",
        category: "strength",
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
  });
});
