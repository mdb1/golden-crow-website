// __tests__/curate-exercise-library.test.ts
//
// Unit tests for the Task B curation script (plan 260522-hi5). All 8 behaviors
// listed in PLAN.md <behavior> are covered:
//
//   B.beh.1  Default is dry-run
//   B.beh.2  --apply flips dry-run + batches at ≤450
//   B.beh.3  Allowlist parser identifies survivors / drops / dedupe-losers
//   B.beh.4  Translation lookup falls back to wger record
//   B.beh.5  mergedInto only set on the loser side
//   B.beh.6  Survivors get name backfilled idempotently
//   B.beh.7  Non-wger docs are never touched
//   B.beh.8  Doc count is unchanged (only batch.update, never set/delete)
//
// firebase-admin/firestore is mocked — no live network calls.

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "__SERVER_TIMESTAMP__"),
  },
  Timestamp: {
    now: jest.fn(() => ({ __ts__: 12345 })),
  },
  getFirestore: jest.fn(),
}));

jest.mock("firebase-admin/app", () => ({
  cert: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

import * as fs from "node:fs";
import * as path from "node:path";

import {
  parseArgs,
  parseAllowlist,
  resolveTranslation,
  computePatch,
  commitInChunks,
  type ParsedAllowlist,
  type TranslationsJson,
  type DocSnapshot,
} from "../curate-exercise-library";

// ---------------------------------------------------------------------------
// B.beh.1 — Default is dry-run
// B.beh.2 — --apply flips it
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("B.beh.1: defaults to dry-run (apply=false)", () => {
    const args = parseArgs([]);
    expect(args.apply).toBe(false);
  });

  it("B.beh.2: --apply sets apply=true", () => {
    const args = parseArgs(["--apply"]);
    expect(args.apply).toBe(true);
  });

  it("--allowlist overrides default path", () => {
    const args = parseArgs(["--allowlist", "/tmp/x.md"]);
    expect(args.allowlist).toBe(path.resolve("/tmp/x.md"));
  });

  it("--translations overrides default path", () => {
    const args = parseArgs(["--translations", "/tmp/y.json"]);
    expect(args.translations).toBe(path.resolve("/tmp/y.json"));
  });

  it("unknown args throw", () => {
    expect(() => parseArgs(["--what"])).toThrow(/Unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// B.beh.2 — commitInChunks honors apply flag + chunks at ≤450
// ---------------------------------------------------------------------------

function makeMockBatch() {
  const ops: { op: string; ref: unknown; data?: Record<string, unknown> }[] = [];
  const batch = {
    update: jest.fn((ref: unknown, data: Record<string, unknown>) => {
      ops.push({ op: "update", ref, data });
    }),
    commit: jest.fn(async () => undefined),
  };
  return { batch, ops };
}

function makeMockDb(batches: ReturnType<typeof makeMockBatch>["batch"][]) {
  let i = 0;
  return {
    batch: jest.fn(() => batches[i++]),
    collection: jest.fn(() => ({ doc: jest.fn() })),
  };
}

describe("commitInChunks", () => {
  it("B.beh.1+2: skips commit entirely when apply=false (dry-run)", async () => {
    const b1 = makeMockBatch();
    const db = makeMockDb([b1.batch]);
    const writes = Array.from({ length: 10 }, (_, idx) => ({
      ref: `ref-${idx}`,
      data: { x: idx },
    }));
    const committed = await commitInChunks(db as never, writes, false);
    expect(committed).toBe(0);
    expect(b1.batch.commit).not.toHaveBeenCalled();
    expect(b1.batch.update).not.toHaveBeenCalled();
  });

  it("B.beh.2: apply=true commits one batch per ≤450 writes", async () => {
    const b1 = makeMockBatch();
    const b2 = makeMockBatch();
    const db = makeMockDb([b1.batch, b2.batch]);
    const writes = Array.from({ length: 600 }, (_, idx) => ({
      ref: `ref-${idx}`,
      data: { x: idx },
    }));
    const committed = await commitInChunks(db as never, writes, true);
    expect(committed).toBe(600);
    // First batch holds 450, second holds 150.
    expect(b1.batch.update).toHaveBeenCalledTimes(450);
    expect(b1.batch.commit).toHaveBeenCalledTimes(1);
    expect(b2.batch.update).toHaveBeenCalledTimes(150);
    expect(b2.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("B.beh.8: only batch.update is called — never set or delete", async () => {
    const b1 = makeMockBatch();
    const setSpy = jest.fn();
    const deleteSpy = jest.fn();
    // Augment the batch mock with set/delete tracker spies — they MUST stay at 0.
    Object.assign(b1.batch, { set: setSpy, delete: deleteSpy });
    const db = makeMockDb([b1.batch]);
    await commitInChunks(
      db as never,
      [{ ref: "r", data: { deletedAt: "x" } }],
      true,
    );
    expect(setSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(b1.batch.update).toHaveBeenCalledTimes(1);
  });

  it("B.beh.8: no batch.delete( or batch.set( CALL site appears in the script source", () => {
    // Grep-level guard — protects against future regressions where someone
    // pattern-matches a copy/pasted block from seed-gc-fitness-library.cjs that
    // contains `batch.set(`. The curation pass is SOFT-DELETE ONLY.
    //
    // We require an open paren immediately after the call so comments that
    // merely mention the names (e.g., this very line) don't trip the check.
    // Comment lines must NOT contain the literal `batch.set(` / `batch.delete(`
    // tokens — that's the contract.
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "curate-exercise-library.ts"),
      "utf8",
    );
    expect(/batch\.delete\s*\(/.test(src)).toBe(false);
    expect(/batch\.set\s*\(/.test(src)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B.beh.3 — Allowlist parser
// ---------------------------------------------------------------------------

const SAMPLE_ALLOWLIST = `# Exercise Library Curation — Allowlist Proposal

**Proposed survivors:** 3
**Proposed soft-deletes:** 2
**Dedupe pairs (loser → surviving):** 1

## Approved allowlist

### Squat pattern (1)
| Doc id | Name (EN) | Name (ES) | Muscle groups | Equipment | Media? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| wger-aaaa1111-0000-0000-0000-000000000001 | Squat | Sentadilla | quadriceps | barbell | video | — |

### Hinge pattern (2)
| Doc id | Name (EN) | Name (ES) | Muscle groups | Equipment | Media? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| wger-bbbb2222-0000-0000-0000-000000000002 | Deadlift | Peso muerto | hamstrings | barbell | video | — |
| wger-cccc3333-0000-0000-0000-000000000003 | RDL | Peso muerto rumano | hamstrings | barbell | video | — |

## Drop list (soft-deletes)

| Doc id | Name (EN) | Reason | Bucket if known |
| --- | --- | --- | --- |
| wger-dddd4444-0000-0000-0000-000000000004 | Whatever | bucket quota | squat |
| wger-eeee5555-0000-0000-0000-000000000005 | Other | dedupe with wger-aaaa1111-0000-0000-0000-000000000001 | squat |

## Dedupe pairs

| Loser doc id | Loser name | Surviving doc id | Surviving name | Reason |
| --- | --- | --- | --- | --- |
| wger-eeee5555-0000-0000-0000-000000000005 | Other | wger-aaaa1111-0000-0000-0000-000000000001 | Squat | dist 2 |

## Translation backfill plan

(any prose here is ignored)

## Counts cross-check

(also ignored)
`;

describe("parseAllowlist (B.beh.3)", () => {
  let parsed: ParsedAllowlist;
  beforeAll(() => {
    parsed = parseAllowlist(SAMPLE_ALLOWLIST);
  });

  it("collects every doc id under '## Approved allowlist' into survivors", () => {
    expect(parsed.survivors).toContain("wger-aaaa1111-0000-0000-0000-000000000001");
    expect(parsed.survivors).toContain("wger-bbbb2222-0000-0000-0000-000000000002");
    expect(parsed.survivors).toContain("wger-cccc3333-0000-0000-0000-000000000003");
  });

  it("collects every doc id under '## Drop list' into drops (NOT the reason-cell sibling id)", () => {
    expect(parsed.drops).toContain("wger-dddd4444-0000-0000-0000-000000000004");
    expect(parsed.drops).toContain("wger-eeee5555-0000-0000-0000-000000000005");
    // The "dedupe with wger-aaaa…" reference in the reason cell must NOT make the survivor look dropped.
    expect(parsed.drops.has("wger-aaaa1111-0000-0000-0000-000000000001")).toBe(false);
  });

  it("collects every dedupe loser into both drops AND dedupes (mapped to its surviving id)", () => {
    expect(parsed.drops).toContain("wger-eeee5555-0000-0000-0000-000000000005");
    expect(parsed.dedupes.get("wger-eeee5555-0000-0000-0000-000000000005")).toBe(
      "wger-aaaa1111-0000-0000-0000-000000000001",
    );
  });

  it("every dedupe surviving id is in survivors", () => {
    for (const survivingId of parsed.dedupes.values()) {
      expect(parsed.survivors).toContain(survivingId);
    }
  });
});

// ---------------------------------------------------------------------------
// B.beh.4 — Translation lookup fallback
// ---------------------------------------------------------------------------

describe("resolveTranslation (B.beh.4)", () => {
  const translations: TranslationsJson = {
    "wger-aaaa1111-0000-0000-0000-000000000001": {
      name_en: "Squat",
      name_es: "Sentadilla",
    },
  };

  it("uses translations JSON when present", () => {
    const doc: DocSnapshot = {
      id: "wger-aaaa1111-0000-0000-0000-000000000001",
      name: { en: "Sentadílla", es: "Sentadílla" },
    };
    const r = resolveTranslation(doc, translations);
    expect(r.name_en).toBe("Squat");
    expect(r.name_es).toBe("Sentadilla");
  });

  it("falls back to on-disk ES if JSON missing AND on-disk ES differs from on-disk EN", () => {
    const doc: DocSnapshot = {
      id: "wger-no-entry",
      name: { en: "Push-up", es: "Flexión" },
    };
    const r = resolveTranslation(doc, {});
    expect(r.name_en).toBe("Push-up");
    expect(r.name_es).toBe("Flexión");
  });

  it("throws MissingTranslation when JSON missing AND on-disk ES equals EN (or empty)", () => {
    const doc: DocSnapshot = {
      id: "wger-no-entry",
      name: { en: "Plank", es: "Plank" },
    };
    expect(() => resolveTranslation(doc, {})).toThrow(/MissingTranslation/);
  });
});

// ---------------------------------------------------------------------------
// B.beh.5 — mergedInto only on loser
// B.beh.6 — Survivors backfilled idempotently
// B.beh.7 — Non-wger docs untouched
// ---------------------------------------------------------------------------

describe("computePatch", () => {
  const allowlist: ParsedAllowlist = {
    survivors: new Set([
      "wger-aaaa1111-0000-0000-0000-000000000001",
      "wger-bbbb2222-0000-0000-0000-000000000002",
    ]),
    drops: new Set([
      "wger-dddd4444-0000-0000-0000-000000000004",
      "wger-eeee5555-0000-0000-0000-000000000005",
    ]),
    dedupes: new Map([
      ["wger-eeee5555-0000-0000-0000-000000000005", "wger-aaaa1111-0000-0000-0000-000000000001"],
    ]),
  };
  const translations: TranslationsJson = {
    "wger-aaaa1111-0000-0000-0000-000000000001": {
      name_en: "Squat",
      name_es: "Sentadilla",
    },
    "wger-bbbb2222-0000-0000-0000-000000000002": {
      name_en: "Deadlift",
      name_es: "Peso muerto",
    },
  };

  it("B.beh.7: non-wger doc returns skip", () => {
    const plan = computePatch(
      { id: "custom-trainerUid-zzz", name: { en: "Anything", es: "Cualquiera" } },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.patch).toBeNull();
  });

  it("B.beh.5: dedupe loser gets deletedAt + mergedInto + updatedAt", () => {
    const plan = computePatch(
      {
        id: "wger-eeee5555-0000-0000-0000-000000000005",
        name: { en: "Other", es: "Otro" },
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("drop-with-merge");
    expect(plan.patch).toEqual({
      deletedAt: "__SERVER_TIMESTAMP__",
      mergedInto: "wger-aaaa1111-0000-0000-0000-000000000001",
      updatedAt: "__SERVER_TIMESTAMP__",
    });
  });

  it("B.beh.5: dedupe SURVIVOR does NOT get a mergedInto", () => {
    const plan = computePatch(
      {
        id: "wger-aaaa1111-0000-0000-0000-000000000001",
        name: { en: "Old name", es: "Nombre viejo" },
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("survivor-backfill");
    expect(plan.patch).not.toHaveProperty("mergedInto");
    expect(plan.patch).not.toHaveProperty("deletedAt");
  });

  it("B.beh.6: survivor already at clean EN+ES is skipped (idempotent)", () => {
    const plan = computePatch(
      {
        id: "wger-aaaa1111-0000-0000-0000-000000000001",
        name: { en: "Squat", es: "Sentadilla" },
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.patch).toBeNull();
  });

  it("B.beh.6: survivor with stale name gets name.{en,es} backfill (no other fields)", () => {
    const plan = computePatch(
      {
        id: "wger-bbbb2222-0000-0000-0000-000000000002",
        name: { en: "Kreuzheben", es: "Kreuzheben" },
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("survivor-backfill");
    expect(plan.patch).toEqual({
      name: { en: "Deadlift", es: "Peso muerto" },
      updatedAt: "__SERVER_TIMESTAMP__",
    });
  });

  it("drop (non-dedupe) gets soft-delete only — no mergedInto", () => {
    const plan = computePatch(
      {
        id: "wger-dddd4444-0000-0000-0000-000000000004",
        name: { en: "Whatever", es: "Lo que sea" },
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("drop-soft-delete");
    expect(plan.patch).toEqual({
      deletedAt: "__SERVER_TIMESTAMP__",
      updatedAt: "__SERVER_TIMESTAMP__",
    });
  });

  it("drop already soft-deleted is skipped (idempotent)", () => {
    const plan = computePatch(
      {
        id: "wger-dddd4444-0000-0000-0000-000000000004",
        name: { en: "Whatever", es: "Lo que sea" },
        deletedAt: { __ts__: 1 },
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("skip");
  });

  it("dedupe-loser already soft-deleted with right mergedInto is skipped (idempotent)", () => {
    const plan = computePatch(
      {
        id: "wger-eeee5555-0000-0000-0000-000000000005",
        name: { en: "Other", es: "Otro" },
        deletedAt: { __ts__: 1 },
        mergedInto: "wger-aaaa1111-0000-0000-0000-000000000001",
      },
      allowlist,
      translations,
    );
    expect(plan.kind).toBe("skip");
  });

  it("doc unaccounted for in allowlist throws audit-failure error", () => {
    expect(() =>
      computePatch(
        { id: "wger-not-in-allowlist", name: { en: "x", es: "y" } },
        allowlist,
        translations,
      ),
    ).toThrow(/unaccounted for in the allowlist proposal/);
  });
});
