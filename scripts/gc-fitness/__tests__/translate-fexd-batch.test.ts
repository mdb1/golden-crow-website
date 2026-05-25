// __tests__/translate-fexd-batch.test.ts
//
// Unit tests for translate-fexd-batch.ts — the LLM-batch EN+ES translation
// pipeline for the Phase 24 expanded FEXD allowlist.
//
// 11 cases total — the 7 original cases plus 4 Codex HIGH mitigations
// (instruction-array length parity check + pre-merge backup + post-parity-fail
// non-mutation invariant).
//
// The script orchestrates an external LLM call which is treated as a black
// box. Tests cover the pure-function pipeline surface only:
//   - computeMissingKeys           : delta computation
//   - mergeTranslations            : merge invariants (no overwrite, parity-guarded)
//   - parseTranslationsBatch       : LLM-output shape validation
//   - assertInstructionLengthParity: ES.instructions_es.length === EN.instructions_en.length
//   - writePreMergeBackup          : Codex HIGH backup-before-mutate invariant
//
// firebase-admin is NOT loaded by this script (LLM batch is a planning artifact,
// not a Firestore op). No mocks needed.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  computeMissingKeys,
  mergeTranslations,
  parseTranslationsBatch,
  assertInstructionLengthParity,
  writePreMergeBackup,
  type FexdTranslations,
  type FexdTranslationEntry,
} from "../translate-fexd-batch";

// ---------------------------------------------------------------------------
// Common fixtures
// ---------------------------------------------------------------------------

const EXISTING: FexdTranslations = {
  _meta: {
    description: "test",
    generated_at: "2026-05-22T00:00:00Z",
    pick_count: 1,
  } as unknown as FexdTranslationEntry,
  "fexd-Existing_Squat": {
    name_en: "Existing Squat",
    name_es: "Sentadilla existente",
    instructions_en: ["Stand up.", "Sit down."],
    instructions_es: ["De pie.", "Sentate."],
  },
};

const VALID_NEW_ENTRY: FexdTranslationEntry = {
  name_en: "Barbell Curl",
  name_es: "Curl con barra",
  instructions_en: [
    "Stand with feet shoulder-width apart.",
    "Curl the barbell to your shoulders.",
    "Lower with control.",
  ],
  instructions_es: [
    "De pie con los pies a la anchura de los hombros.",
    "Sube la barra hasta los hombros.",
    "Baja con control.",
  ],
};

// ---------------------------------------------------------------------------
// Case 1 — computeMissingKeys excludes _meta from the lookup
// ---------------------------------------------------------------------------

describe("computeMissingKeys (case 1)", () => {
  it("excludes the reserved _meta key from the lookup", () => {
    const picks = [{ exerciseId: "_meta" }, { exerciseId: "fexd-Existing_Squat" }];
    // Even though "_meta" is in the translations object, the function treats
    // it as a reserved key and does NOT consider it a translation for the
    // pick id "_meta". So if a pick had exerciseId "_meta" it would be
    // reported as missing (defensive — _meta should never appear as a pick).
    const missing = computeMissingKeys(picks, EXISTING);
    expect(missing).toContain("_meta");
    expect(missing).not.toContain("fexd-Existing_Squat");
  });
});

// ---------------------------------------------------------------------------
// Case 2 — computeMissingKeys returns absent ids
// ---------------------------------------------------------------------------

describe("computeMissingKeys (case 2)", () => {
  it("returns picks whose id is absent from translations", () => {
    const picks = [
      { exerciseId: "fexd-Existing_Squat" },
      { exerciseId: "fexd-New_Lift_A" },
      { exerciseId: "fexd-New_Lift_B" },
    ];
    const missing = computeMissingKeys(picks, EXISTING);
    expect(missing).toEqual(["fexd-New_Lift_A", "fexd-New_Lift_B"]);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — mergeTranslations preserves existing entries verbatim
// ---------------------------------------------------------------------------

describe("mergeTranslations (case 3)", () => {
  it("preserves existing entries verbatim", () => {
    const additions: FexdTranslations = {
      "fexd-Barbell_Curl": VALID_NEW_ENTRY,
    };
    const merged = mergeTranslations(EXISTING, additions);
    // String-equal on a sample existing entry (no field mutation, no key
    // renaming, no array reordering).
    expect(JSON.stringify(merged["fexd-Existing_Squat"])).toBe(
      JSON.stringify(EXISTING["fexd-Existing_Squat"]),
    );
    expect(merged["fexd-Barbell_Curl"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Case 4 — mergeTranslations never overwrites existing keys
// ---------------------------------------------------------------------------

describe("mergeTranslations (case 4)", () => {
  it("throws when an addition would overwrite an existing translation", () => {
    const conflictingAddition: FexdTranslations = {
      "fexd-Existing_Squat": {
        name_en: "DIFFERENT NAME",
        name_es: "NOMBRE DIFERENTE",
        instructions_en: ["Different."],
        instructions_es: ["Diferente."],
      },
    };
    expect(() => mergeTranslations(EXISTING, conflictingAddition)).toThrow(
      /already exists|overwrite|conflict/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Case 5 — parseTranslationsBatch throws on missing name_es
// ---------------------------------------------------------------------------

describe("parseTranslationsBatch (case 5)", () => {
  it("throws when an entry is missing name_es", () => {
    const bad = JSON.stringify({
      "fexd-Bad_Entry": {
        name_en: "Bad Entry",
        // name_es intentionally omitted
        instructions_en: ["step"],
        instructions_es: ["paso"],
      },
    });
    expect(() => parseTranslationsBatch(bad)).toThrow(/fexd-Bad_Entry/);
    expect(() => parseTranslationsBatch(bad)).toThrow(/name_es/);
  });
});

// ---------------------------------------------------------------------------
// Case 6 — parseTranslationsBatch throws on non-array instructions_en
// ---------------------------------------------------------------------------

describe("parseTranslationsBatch (case 6)", () => {
  it("throws when instructions_en is not an array", () => {
    const bad = JSON.stringify({
      "fexd-Bad_Instructions": {
        name_en: "Bad",
        name_es: "Mala",
        instructions_en: "Single string not array",
        instructions_es: ["paso"],
      },
    });
    expect(() => parseTranslationsBatch(bad)).toThrow(/fexd-Bad_Instructions/);
    expect(() => parseTranslationsBatch(bad)).toThrow(/instructions_en/);
  });
});

// ---------------------------------------------------------------------------
// Case 7 — parseTranslationsBatch accepts a valid full entry
// ---------------------------------------------------------------------------

describe("parseTranslationsBatch (case 7)", () => {
  it("returns the parsed object when all entries are well-shaped", () => {
    const good = JSON.stringify({
      "fexd-Barbell_Curl": VALID_NEW_ENTRY,
    });
    const parsed = parseTranslationsBatch(good);
    expect(parsed["fexd-Barbell_Curl"]).toEqual(VALID_NEW_ENTRY);
    expect(parsed["fexd-Barbell_Curl"].instructions_en).toHaveLength(3);
    expect(parsed["fexd-Barbell_Curl"].instructions_es).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Case 8 — assertInstructionLengthParity passes on equal lengths (Codex HIGH)
// ---------------------------------------------------------------------------

describe("assertInstructionLengthParity (case 8 — Codex HIGH)", () => {
  it("passes when ES.instructions_es.length === EN.instructions_en.length", () => {
    const additions: FexdTranslations = {
      "fexd-Balanced_Lift": VALID_NEW_ENTRY,
    };
    expect(() => assertInstructionLengthParity(additions)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Case 9 — assertInstructionLengthParity throws with offending id + lengths (Codex HIGH)
// ---------------------------------------------------------------------------

describe("assertInstructionLengthParity (case 9 — Codex HIGH)", () => {
  it("throws when ES length differs from EN length, includes offending id + observed lengths in message", () => {
    const additions: FexdTranslations = {
      "fexd-Mismatched_Lift": {
        name_en: "Mismatched",
        name_es: "Desigual",
        instructions_en: ["a", "b", "c"], // 3
        instructions_es: ["a", "b"], // 2 — mismatch
      },
    };
    let error: Error | null = null;
    try {
      assertInstructionLengthParity(additions);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error!.message).toContain("fexd-Mismatched_Lift");
    // Error message must include BOTH observed lengths so operator can diagnose.
    expect(error!.message).toMatch(/3/);
    expect(error!.message).toMatch(/2/);
  });
});

// ---------------------------------------------------------------------------
// Case 10 — writePreMergeBackup creates a backup file (Codex HIGH)
// ---------------------------------------------------------------------------

describe("writePreMergeBackup (case 10 — Codex HIGH)", () => {
  it("copies the existing file to a backup path adjacent to the working file BEFORE any merge", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tfb-backup-"));
    const working = path.join(tmpDir, "fexd-translations.json");
    const originalContent = JSON.stringify(EXISTING, null, 2);
    fs.writeFileSync(working, originalContent, "utf8");

    const backupPath = writePreMergeBackup(working);

    // Backup file exists at the returned path.
    expect(fs.existsSync(backupPath)).toBe(true);
    // Backup lives adjacent to the working file (same directory).
    expect(path.dirname(backupPath)).toBe(path.dirname(working));
    // Backup filename follows the documented format fexd-translations.backup-{timestamp}.json
    expect(path.basename(backupPath)).toMatch(/^fexd-translations\.backup-.+\.json$/);
    // Backup content === original file content (byte-for-byte).
    expect(fs.readFileSync(backupPath, "utf8")).toBe(originalContent);
  });
});

// ---------------------------------------------------------------------------
// Case 11 — mergeTranslations throws + does NOT mutate working file on parity fail
// ---------------------------------------------------------------------------

describe("mergeTranslations parity-fail invariant (case 11 — Codex HIGH)", () => {
  it("throws AND does not return mutated translations when parity check fires", () => {
    const additions: FexdTranslations = {
      "fexd-Parity_Fail": {
        name_en: "Parity Fail",
        name_es: "Fallo de paridad",
        instructions_en: ["a", "b"], // 2
        instructions_es: ["a"], // 1 — mismatch
      },
    };
    // Snapshot the "working file" contract by capturing existing's JSON shape.
    const before = JSON.stringify(EXISTING);
    expect(() => mergeTranslations(EXISTING, additions)).toThrow(
      /fexd-Parity_Fail/,
    );
    // EXISTING object reference must be byte-identical post-throw.
    expect(JSON.stringify(EXISTING)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

describe("module shape", () => {
  it("translate-fexd-batch exports the expected pure-function surface", () => {
    expect(typeof computeMissingKeys).toBe("function");
    expect(typeof mergeTranslations).toBe("function");
    expect(typeof parseTranslationsBatch).toBe("function");
    expect(typeof assertInstructionLengthParity).toBe("function");
    expect(typeof writePreMergeBackup).toBe("function");
  });
});
