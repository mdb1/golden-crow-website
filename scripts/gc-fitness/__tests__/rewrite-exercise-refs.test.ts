// __tests__/rewrite-exercise-refs.test.ts
//
// Unit tests for Plan 24-04 Task 2 — rewrite-exercise-refs.ts. Covers the
// 9 behaviors enumerated in PLAN.md <behavior>:
//
//   T1   parseRewriteMap returns Record<string,string|null> with N entries,
//        distinguishing the literal `null` from string fexd-* slugs.
//   T2   parseRewriteMap round-trips a 3-row fixture.
//   T3   parseUnmappedAccepted returns Set<string> with the wger- ids
//        listed in the UNMAPPED_ACCEPTED section; ignores non-wger lines.
//   T4   computeRewrites rewrites exerciseIds that are mapped to a non-null
//        fexd slug.
//   T5   computeRewrites does NOT rewrite when the map value is explicit null.
//   T6   computeRewrites returns [] for an already-converged template
//        (no exerciseIds present in the map).
//   T7   checkUnmappedRefs blocking gate: a template referencing a wger ref
//        that is NOT in the rewrite map AND NOT in UNMAPPED_ACCEPTED returns
//        an offending entry (gate fires → exit 1 caller path).
//   T8   checkUnmappedRefs: a template referencing a wger ref that IS in
//        UNMAPPED_ACCEPTED returns 0 entries (gate passes).
//   T9   REQ-24-06 grep gate: the SUT source has zero non-comment lines
//        matching /workout_logs/ — workout_logs is immutable history.
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
import * as path from "node:path";

import {
  parseRewriteMap,
  parseUnmappedAccepted,
  computeRewrites,
  checkUnmappedRefs,
} from "../rewrite-exercise-refs";

// ---------------------------------------------------------------------------
// Fixtures — minimal markdown that exercises the parsers.
// ---------------------------------------------------------------------------

const MD_FIXTURE_3ROW = `# Test fixture

## Rewrite table

| wger doc-id | wger name (EN) | fexd replacement (or null) | Notes |
| --- | --- | --- | --- |
| wger-aaaa1111 | Test A | fexd-Foo | first entry |
| wger-bbbb2222 | Test B | fexd-Bar | second entry |
| wger-cccc3333 | Test C | null | unmapped row |

## UNMAPPED_ACCEPTED

- wger-cccc3333
- wger-dddd4444
- prose line that does not start with a wger id (must be ignored)
- Some narrative text.

## Counts

- whatever
`;

// ---------------------------------------------------------------------------
// T1 + T2 — parseRewriteMap
// ---------------------------------------------------------------------------

describe("parseRewriteMap (T1, T2)", () => {
  it("T1: returns Record with N entries; distinguishes literal null from string slugs", () => {
    const map = parseRewriteMap(MD_FIXTURE_3ROW);
    expect(Object.keys(map)).toHaveLength(3);
    expect(map["wger-aaaa1111"]).toBe("fexd-Foo");
    expect(map["wger-bbbb2222"]).toBe("fexd-Bar");
    // Literal `null` cell must be parsed as JS null, NOT the string "null".
    expect(map["wger-cccc3333"]).toBeNull();
  });

  it("T2: round-trips a 3-row fixture (no stray entries from headers/separators/prose)", () => {
    const map = parseRewriteMap(MD_FIXTURE_3ROW);
    expect(Object.keys(map).sort()).toEqual([
      "wger-aaaa1111",
      "wger-bbbb2222",
      "wger-cccc3333",
    ]);
  });

  it("T2b: skips rows whose first cell is not a wger- doc-id (defensive)", () => {
    const md = `## Rewrite table

| wger doc-id | wger name (EN) | fexd replacement (or null) | Notes |
| --- | --- | --- | --- |
| not-a-wger-id | foo | fexd-Bar | should not be parsed |
| wger-xx | OK | fexd-OK | should be parsed |
`;
    const map = parseRewriteMap(md);
    expect(Object.keys(map)).toEqual(["wger-xx"]);
  });
});

// ---------------------------------------------------------------------------
// T3 — parseUnmappedAccepted
// ---------------------------------------------------------------------------

describe("parseUnmappedAccepted (T3)", () => {
  it("T3: returns Set with exactly the wger- ids enumerated in the UNMAPPED_ACCEPTED section", () => {
    const set = parseUnmappedAccepted(MD_FIXTURE_3ROW);
    expect(set.size).toBe(2);
    expect(set.has("wger-cccc3333")).toBe(true);
    expect(set.has("wger-dddd4444")).toBe(true);
    // Non-wger prose lines in the section must be ignored.
    expect(set.has("prose line that does not start with a wger id (must be ignored)"))
      .toBe(false);
  });

  it("T3b: respects section boundaries — wger ids in other ## sections are NOT included", () => {
    const md = `## UNMAPPED_ACCEPTED

- wger-only-this-one

## Some Other Section

- wger-not-included
- wger-also-not
`;
    const set = parseUnmappedAccepted(md);
    expect([...set]).toEqual(["wger-only-this-one"]);
  });

  it("T3c: empty UNMAPPED_ACCEPTED section yields an empty Set", () => {
    const md = `## UNMAPPED_ACCEPTED

(none)

## Counts
`;
    const set = parseUnmappedAccepted(md);
    expect(set.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T4, T5, T6 — computeRewrites
// ---------------------------------------------------------------------------

describe("computeRewrites (T4, T5, T6)", () => {
  it("T4: rewrites exerciseIds that map to a non-null fexd slug", () => {
    const exercises = [
      { exerciseId: "wger-aaaa1111" },
      { exerciseId: "fexd-Already_Migrated" },
    ];
    const map = { "wger-aaaa1111": "fexd-Foo" };
    const rewrites = computeRewrites({ exercises, map });
    expect(rewrites).toEqual([
      { idx: 0, from: "wger-aaaa1111", to: "fexd-Foo" },
    ]);
  });

  it("T5: does NOT rewrite when the map value is explicit null", () => {
    const exercises = [{ exerciseId: "wger-cccc3333" }];
    const map = { "wger-cccc3333": null };
    const rewrites = computeRewrites({ exercises, map });
    expect(rewrites).toEqual([]);
  });

  it("T6: returns [] for an already-converged template (no exerciseIds in the map)", () => {
    const exercises = [
      { exerciseId: "fexd-Foo" },
      { exerciseId: "fexd-Bar" },
      { exerciseId: "custom-trainer-xyz" },
    ];
    const map = { "wger-aaaa1111": "fexd-Foo", "wger-bbbb2222": "fexd-Bar" };
    expect(computeRewrites({ exercises, map })).toEqual([]);
  });

  it("T6b: ignores entries with non-string exerciseId (defensive)", () => {
    const exercises = [
      { exerciseId: "wger-aaaa1111" },
      { exerciseId: undefined as unknown as string },
      { exerciseId: 42 as unknown as string },
    ];
    const map = { "wger-aaaa1111": "fexd-Foo" };
    expect(computeRewrites({ exercises, map })).toEqual([
      { idx: 0, from: "wger-aaaa1111", to: "fexd-Foo" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// T7, T8 — checkUnmappedRefs blocking gate (Codex HIGH mitigation)
// ---------------------------------------------------------------------------

describe("checkUnmappedRefs blocking gate (T7, T8)", () => {
  it("T7: a template referencing a wger- ref NOT in map AND NOT in UNMAPPED_ACCEPTED → returns 1 entry", () => {
    const templates = [
      {
        id: "tpl-A",
        exercises: [
          { exerciseId: "fexd-OK" },
          { exerciseId: "wger-not-in-map-and-not-accepted" },
        ],
      },
    ];
    const map = { "wger-mapped-elsewhere": "fexd-X" };
    const unmappedAccepted = new Set(["wger-explicitly-accepted"]);
    const offending = checkUnmappedRefs({ templates, map, unmappedAccepted });
    expect(offending).toEqual([
      { templateId: "tpl-A", exerciseId: "wger-not-in-map-and-not-accepted" },
    ]);
  });

  it("T8: a template referencing a wger- ref in UNMAPPED_ACCEPTED → returns 0 entries", () => {
    const templates = [
      {
        id: "tpl-B",
        exercises: [
          { exerciseId: "wger-explicitly-accepted" },
          { exerciseId: "fexd-OK" },
        ],
      },
    ];
    const map = {};
    const unmappedAccepted = new Set(["wger-explicitly-accepted"]);
    const offending = checkUnmappedRefs({ templates, map, unmappedAccepted });
    expect(offending).toEqual([]);
  });

  it("T8b: a template referencing a wger- ref in the rewrite map (any value) → returns 0 entries (it will be rewritten)", () => {
    const templates = [
      {
        id: "tpl-C",
        exercises: [
          { exerciseId: "wger-mapped-to-fexd" },
          { exerciseId: "wger-mapped-to-null" },
        ],
      },
    ];
    const map = {
      "wger-mapped-to-fexd": "fexd-Y",
      "wger-mapped-to-null": null,
    };
    const unmappedAccepted = new Set<string>();
    const offending = checkUnmappedRefs({ templates, map, unmappedAccepted });
    expect(offending).toEqual([]);
  });

  it("T7b: multiple offending refs across multiple templates accumulate", () => {
    const templates = [
      { id: "tpl-X", exercises: [{ exerciseId: "wger-unknown-1" }] },
      {
        id: "tpl-Y",
        exercises: [
          { exerciseId: "fexd-Fine" },
          { exerciseId: "wger-unknown-2" },
        ],
      },
    ];
    const map = {};
    const unmappedAccepted = new Set<string>();
    const offending = checkUnmappedRefs({ templates, map, unmappedAccepted });
    expect(offending.length).toBe(2);
    expect(offending.map((o) => o.templateId).sort()).toEqual(["tpl-X", "tpl-Y"]);
    expect(offending.map((o) => o.exerciseId).sort()).toEqual([
      "wger-unknown-1",
      "wger-unknown-2",
    ]);
  });

  it("T7c: non-wger exerciseIds (fexd-*, custom-*) are never offending — they're not in scope", () => {
    const templates = [
      {
        id: "tpl-Z",
        exercises: [
          { exerciseId: "fexd-Unknown_Slug" },
          { exerciseId: "custom-trainerUid-zzz" },
        ],
      },
    ];
    expect(
      checkUnmappedRefs({
        templates,
        map: {},
        unmappedAccepted: new Set(),
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T9 — REQ-24-06 grep gate
// ---------------------------------------------------------------------------

describe("REQ-24-06 grep gate (T9)", () => {
  it("T9: rewrite-exercise-refs.ts source has zero non-comment lines referencing workout_logs", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "rewrite-exercise-refs.ts"),
      "utf8",
    );
    // Strip comment lines: any line whose first non-whitespace char is `//`
    // or `*` (handles both single-line and block-comment-body lines).
    const codeLines = src
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        if (t.startsWith("//")) return false;
        if (t.startsWith("*")) return false;
        if (t.startsWith("/*")) return false;
        return true;
      });
    for (const line of codeLines) {
      expect(line).not.toMatch(/workout_logs/);
    }
  });
});

// ---------------------------------------------------------------------------
// Module shape — defensive contract check (Plan 24-04 Task 3 imports
// `parseRewriteMap` + `parseUnmappedAccepted` from this module).
// ---------------------------------------------------------------------------

describe("module shape", () => {
  it("exports parseRewriteMap, parseUnmappedAccepted, computeRewrites, checkUnmappedRefs", () => {
    expect(typeof parseRewriteMap).toBe("function");
    expect(typeof parseUnmappedAccepted).toBe("function");
    expect(typeof computeRewrites).toBe("function");
    expect(typeof checkUnmappedRefs).toBe("function");
  });
});
