// __tests__/soft-delete-wger-survivors.test.ts
//
// Unit tests for Plan 24-04 Task 3 — soft-delete-wger-survivors.ts. Covers
// the 5 dispositions enumerated in PLAN.md <behavior>:
//
//   D1   computePatch(non-wger doc) returns kind:'skip' reason:'not-wger'
//   D2   computePatch(wger doc with deletedAt set) returns kind:'skip'
//        reason:'already-soft-deleted'
//   D3   computePatch(wger doc with map[id] = 'fexd-Foo') returns kind:'update'
//        patch:{ deletedAt, deletedReason:'wger-deprecated-fexd-equivalent',
//                mergedInto:'fexd-Foo' }
//   D4   computePatch(wger doc with map[id] = null) returns kind:'update'
//        patch:{ deletedAt, deletedReason:'wger-deprecated-no-equivalent',
//                mergedInto:null }
//   D5   computePatch(wger doc NOT in map) returns kind:'skip'
//        reason:'not-in-map' (defensive — operator must reconcile)
//
// Plus a guard:
//   D6   REQ-24-06 grep gate — source has zero non-comment workout_logs refs.
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

import { computePatch } from "../soft-delete-wger-survivors";

// ---------------------------------------------------------------------------
// Fixture map — 1 mapped + 1 unmapped entry.
// ---------------------------------------------------------------------------

const REWRITE_MAP: Record<string, string | null> = {
  "wger-mapped-id": "fexd-Foo",
  "wger-unmapped-id": null,
};

// ---------------------------------------------------------------------------
// D1 — non-wger doc → skip
// ---------------------------------------------------------------------------

describe("computePatch — non-wger (D1)", () => {
  it("D1: fexd-* doc returns kind:'skip' reason:'not-wger'", () => {
    const plan = computePatch(
      { id: "fexd-Bodyweight_Squat", data: { source: "free-exercise-db" } },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toBe("not-wger");
  });

  it("D1b: trainer-authored custom-* doc returns kind:'skip' reason:'not-wger'", () => {
    const plan = computePatch(
      { id: "custom-trainerUid-xyz", data: { source: "trainer" } },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toBe("not-wger");
  });
});

// ---------------------------------------------------------------------------
// D2 — already soft-deleted → skip
// ---------------------------------------------------------------------------

describe("computePatch — already soft-deleted (D2)", () => {
  it("D2: wger doc with deletedAt set returns kind:'skip' reason:'already-soft-deleted'", () => {
    const plan = computePatch(
      {
        id: "wger-mapped-id",
        data: {
          source: "free-exercise-db",
          deletedAt: { __ts__: 999 },
          deletedReason: "wger-deprecated-fexd-equivalent",
          mergedInto: "fexd-Foo",
        },
      },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toBe("already-soft-deleted");
  });

  it("D2b: wger doc with `deleted: true` (legacy boolean flag) also returns skip", () => {
    const plan = computePatch(
      {
        id: "wger-mapped-id",
        data: { source: "wger", deleted: true },
      },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toBe("already-soft-deleted");
  });
});

// ---------------------------------------------------------------------------
// D3 — mapped wger doc → update with mergedInto + fexd-equivalent reason
// ---------------------------------------------------------------------------

describe("computePatch — mapped wger doc (D3)", () => {
  it("D3: returns kind:'update' patch with mergedInto + wger-deprecated-fexd-equivalent reason", () => {
    const plan = computePatch(
      { id: "wger-mapped-id", data: { source: "free-exercise-db" } },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("update");
    expect(plan.patch).not.toBeNull();
    expect(plan.patch!.deletedReason).toBe("wger-deprecated-fexd-equivalent");
    expect(plan.patch!.mergedInto).toBe("fexd-Foo");
    expect(plan.patch!.deletedAt).toBe("__SERVER_TIMESTAMP__");
  });
});

// ---------------------------------------------------------------------------
// D4 — unmapped wger doc (map value = null) → update with no merge target
// ---------------------------------------------------------------------------

describe("computePatch — unmapped wger doc (D4)", () => {
  it("D4: returns kind:'update' patch with mergedInto:null + wger-deprecated-no-equivalent reason", () => {
    const plan = computePatch(
      { id: "wger-unmapped-id", data: { source: "free-exercise-db" } },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("update");
    expect(plan.patch).not.toBeNull();
    expect(plan.patch!.deletedReason).toBe("wger-deprecated-no-equivalent");
    expect(plan.patch!.mergedInto).toBeNull();
    expect(plan.patch!.deletedAt).toBe("__SERVER_TIMESTAMP__");
  });
});

// ---------------------------------------------------------------------------
// D5 — wger doc NOT in the rewrite map → skip with "not-in-map" reason
//      (defensive — points to a missing row in WGER-TO-FEXD-REWRITE.md)
// ---------------------------------------------------------------------------

describe("computePatch — wger doc not in map (D5)", () => {
  it("D5: returns kind:'skip' reason:'not-in-map' (operator must reconcile WGER-TO-FEXD-REWRITE.md)", () => {
    const plan = computePatch(
      { id: "wger-unknown-id", data: { source: "wger" } },
      REWRITE_MAP,
    );
    expect(plan.kind).toBe("skip");
    expect(plan.reason).toBe("not-in-map");
  });
});

// ---------------------------------------------------------------------------
// D6 — REQ-24-06 grep gate
// ---------------------------------------------------------------------------

describe("REQ-24-06 grep gate (D6)", () => {
  it("D6: soft-delete-wger-survivors.ts source has zero non-comment lines referencing workout_logs", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "soft-delete-wger-survivors.ts"),
      "utf8",
    );
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
// Module shape
// ---------------------------------------------------------------------------

describe("module shape", () => {
  it("exports computePatch", () => {
    expect(typeof computePatch).toBe("function");
  });
});
