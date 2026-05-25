#!/usr/bin/env tsx
/**
 * translate-fexd-batch.ts — LLM-batch generator for fexd-translations.json
 * extension (Plan 24-02 Task 3).
 *
 * Computes the delta between an approved allowlist and the working
 * translations file, optionally emits a few-shot LLM prompt, validates an
 * external LLM-batch output JSON, runs an instruction-array length parity
 * check (Codex HIGH mitigation T-24-02-04), writes a pre-merge backup
 * (Codex HIGH mitigation T-24-02-05), and merges the new entries into
 * fexd-translations.json without overwriting any existing key
 * (Pitfall 8 in 24-RESEARCH.md — translation style preservation).
 *
 * The LLM call itself is treated as a black box — Plan 24-02 Task 4 is
 * the operator gate where the operator pastes the emitted prompt into a
 * Claude session and saves the response to a JSON file consumed via
 * `--from <path>`.
 *
 * Default mode is dry-run (apply=false); --apply opt-in. Idempotent:
 * re-running --apply with the same allowlist + a converged translations
 * file finds 0 missing keys and exits 0 with "Translations already
 * converged.".
 *
 * Reuses Pattern S2 (dry-run-first CLI scaffolding from seed-from-fexd.ts).
 * Does NOT import firebase-admin — no Firestore ops in this script.
 *
 * Usage:
 *   tsx translate-fexd-batch.ts --allowlist <path>
 *     # Dry-run — prints missing-key count + sample slugs.
 *   tsx translate-fexd-batch.ts --allowlist <path> --emit-prompt
 *     # Prints a few-shot LLM prompt (5 exemplars + missing source EN text)
 *     # to stdout. Pipe to a file, paste into a Claude session.
 *   tsx translate-fexd-batch.ts --from <llm-output.json> --allowlist <path>
 *     # Validates the LLM output JSON shape + parity, NO mutation.
 *   tsx translate-fexd-batch.ts --from <llm-output.json> --allowlist <path> --apply
 *     # Writes pre-merge backup + merges into fexd-translations.json + bumps _meta.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseAllowlistForFexd, type AllowlistEntry } from "./seed-from-fexd";

// ---------------------------------------------------------------------------
// Shared types — mirror seed-from-fexd.ts shape so downstream consumers can
// re-use FexdTranslations / FexdTranslationEntry from either module.
// ---------------------------------------------------------------------------

export interface FexdTranslationEntry {
  name_en: string;
  name_es: string;
  instructions_en: string[];
  instructions_es: string[];
}

export type FexdTranslations = Record<string, FexdTranslationEntry>;

interface FexdSourceRow {
  id: string;
  name: string;
  instructions: string[];
}

// ---------------------------------------------------------------------------
// Pure-function pipeline surface — testable without an LLM
// ---------------------------------------------------------------------------

/**
 * computeMissingKeys — picks whose exerciseId is absent from translations.
 *
 * The reserved `_meta` key in the translations object is NOT a translation —
 * it's a JSON-document-level metadata block. So if a pick somehow has
 * exerciseId === "_meta" (it never should), it is reported as missing.
 */
export function computeMissingKeys(
  picks: { exerciseId: string }[],
  translations: Record<string, unknown>,
): string[] {
  const have = new Set(
    Object.keys(translations).filter((k) => k !== "_meta"),
  );
  return picks.map((p) => p.exerciseId).filter((id) => !have.has(id));
}

/**
 * parseTranslationsBatch — JSON-shape validator for LLM-batch output.
 *
 * Throws with the offending exerciseId in the message on any missing field
 * or wrong type. Strict enough to catch malformed LLM responses BEFORE the
 * parity check + backup steps. Skips the reserved `_meta` key (additions
 * file may or may not include it; we drop it from the merge stream).
 */
export function parseTranslationsBatch(jsonStr: string): FexdTranslations {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `translate-fexd-batch: failed to parse LLM-batch JSON: ${
        (err as Error).message
      }`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "translate-fexd-batch: expected a JSON object keyed by exerciseId at the top level.",
    );
  }
  const out: FexdTranslations = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (id === "_meta") continue;
    if (!value || typeof value !== "object") {
      throw new Error(
        `translate-fexd-batch: entry "${id}" is not an object.`,
      );
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.name_en !== "string" || obj.name_en.length === 0) {
      throw new Error(
        `translate-fexd-batch: entry "${id}" is missing or has invalid name_en.`,
      );
    }
    if (typeof obj.name_es !== "string" || obj.name_es.length === 0) {
      throw new Error(
        `translate-fexd-batch: entry "${id}" is missing or has invalid name_es.`,
      );
    }
    if (!Array.isArray(obj.instructions_en)) {
      throw new Error(
        `translate-fexd-batch: entry "${id}" has invalid instructions_en (must be an array of strings).`,
      );
    }
    if (!Array.isArray(obj.instructions_es)) {
      throw new Error(
        `translate-fexd-batch: entry "${id}" has invalid instructions_es (must be an array of strings).`,
      );
    }
    for (const ins of obj.instructions_en as unknown[]) {
      if (typeof ins !== "string") {
        throw new Error(
          `translate-fexd-batch: entry "${id}" instructions_en contains a non-string element.`,
        );
      }
    }
    for (const ins of obj.instructions_es as unknown[]) {
      if (typeof ins !== "string") {
        throw new Error(
          `translate-fexd-batch: entry "${id}" instructions_es contains a non-string element.`,
        );
      }
    }
    out[id] = {
      name_en: obj.name_en,
      name_es: obj.name_es,
      instructions_en: obj.instructions_en as string[],
      instructions_es: obj.instructions_es as string[],
    };
  }
  return out;
}

/**
 * assertInstructionLengthParity — Codex HIGH mitigation T-24-02-04.
 *
 * For each new entry, asserts that ES.instructions_es.length equals
 * EN.instructions_en.length. Mismatch throws with both observed lengths
 * AND the offending exerciseId in the message so the operator can diagnose
 * which row needs to be regenerated.
 *
 * Called inside `mergeTranslations` BEFORE any mutation. The pure-function
 * design lets the test suite exercise it in isolation (case 8 + case 9).
 */
export function assertInstructionLengthParity(
  additions: FexdTranslations,
): void {
  for (const [id, entry] of Object.entries(additions)) {
    if (id === "_meta") continue;
    const en = entry.instructions_en.length;
    const es = entry.instructions_es.length;
    if (en !== es) {
      throw new Error(
        `translate-fexd-batch parity fail: ${id} has ${en} EN instruction(s) but ${es} ES instruction(s). LLM-batch row rejected; regenerate this row's ES translation.`,
      );
    }
  }
}

/**
 * mergeTranslations — merge additions into existing without overwriting.
 *
 * 3-step invariant:
 *   1. parity check (throws on mismatch, never mutates)
 *   2. overwrite check (throws if any addition would replace an existing key)
 *   3. returns a NEW object — existing input reference is never mutated
 *
 * Caller is expected to write the result back to disk only AFTER an
 * external `writePreMergeBackup` call (Codex HIGH mitigation T-24-02-05).
 * Pure-function design means tests can exercise the merge without touching
 * a real file (case 3, case 4, case 11).
 */
export function mergeTranslations(
  existing: FexdTranslations,
  additions: FexdTranslations,
): FexdTranslations {
  assertInstructionLengthParity(additions);
  for (const id of Object.keys(additions)) {
    if (id === "_meta") continue;
    if (Object.prototype.hasOwnProperty.call(existing, id) && id !== "_meta") {
      throw new Error(
        `translate-fexd-batch: refusing to overwrite existing translation "${id}". mergeTranslations is append-only by contract (Pitfall 8 — translation style preservation). To intentionally replace an entry, edit fexd-translations.json by hand.`,
      );
    }
  }
  const out: FexdTranslations = { ...existing };
  for (const [id, entry] of Object.entries(additions)) {
    if (id === "_meta") continue;
    out[id] = entry;
  }
  return out;
}

/**
 * writePreMergeBackup — Codex HIGH mitigation T-24-02-05.
 *
 * Copies the existing working file to
 *   <dir>/fexd-translations.backup-{ISO-timestamp-with-colons-replaced}.json
 * adjacent to the working file. Returns the absolute backup path.
 *
 * Called from the --apply flow BEFORE any merge mutation runs. Rollback
 * procedure is a file move (`mv backup working`). The backup is committed
 * alongside the apply commit as a recovery artifact.
 */
export function writePreMergeBackup(existingPath: string): string {
  const dir = path.dirname(existingPath);
  const base = path.basename(existingPath, path.extname(existingPath));
  const ts = new Date().toISOString().replace(/:/g, "-");
  const backupPath = path.join(dir, `${base}.backup-${ts}.json`);
  fs.copyFileSync(existingPath, backupPath);
  return backupPath;
}

// ---------------------------------------------------------------------------
// CLI scaffolding (Pattern S2 — dry-run-first opt-in apply)
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
  allowlist: string;
  translations: string;
  fexdData: string;
  emitPrompt: boolean;
  from: string | null;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    allowlist: path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "gc-fitness",
      ".planning",
      "phases",
      "24-exercise-library-expansion-free-exercise-db",
      "ALLOWLIST-PROPOSAL.md",
    ),
    translations: path.resolve(__dirname, "fexd-translations.json"),
    fexdData:
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
    emitPrompt: false,
    from: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--emit-prompt") args.emitPrompt = true;
    else if (a === "--allowlist") args.allowlist = path.resolve(argv[++i] ?? "");
    else if (a === "--translations") {
      args.translations = path.resolve(argv[++i] ?? "");
    } else if (a === "--fexd-data") args.fexdData = argv[++i] ?? args.fexdData;
    else if (a === "--from") args.from = path.resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx translate-fexd-batch.ts [--allowlist <path>] [--translations <path>] [--emit-prompt] [--from <path>] [--apply]\n\n" +
          "Default dry-run. Computes missing translation keys from the allowlist.\n" +
          "--emit-prompt prints a few-shot LLM prompt with 5 exemplars + missing-key EN source text.\n" +
          "--from <path> reads the LLM response JSON, validates shape + parity (does NOT touch the working file unless --apply).\n" +
          "--apply with --from writes a pre-merge backup, runs the parity check, then merges into the translations file and bumps _meta.\n\n" +
          "Idempotent: re-running --apply after convergence finds 0 missing keys and exits 0.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// FEXD source fetch (only used at runtime by --emit-prompt; tests don't load)
// ---------------------------------------------------------------------------

async function fetchFexdSource(url: string): Promise<Map<string, FexdSourceRow>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch fexd dataset: HTTP ${res.status}`);
  }
  const arr = (await res.json()) as Array<{
    id: string;
    name: string;
    instructions: string[];
  }>;
  const map = new Map<string, FexdSourceRow>();
  for (const r of arr) {
    map.set(r.id, { id: r.id, name: r.name, instructions: r.instructions });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Prompt assembly — 5 exemplars + missing-key EN source text
// ---------------------------------------------------------------------------

/**
 * Pick 5 exemplars from the existing translations (deterministic — first 5
 * fexd-* keys in alpha order) so the prompt pins translation tone + format
 * (Argentine voseo, instruction-array shape, EN source unchanged).
 * Mitigates Pitfall 8 — translation style drift.
 */
function pickExemplars(
  existing: FexdTranslations,
  n = 5,
): Array<[string, FexdTranslationEntry]> {
  const keys = Object.keys(existing)
    .filter((k) => k !== "_meta" && k.startsWith("fexd-"))
    .sort();
  const out: Array<[string, FexdTranslationEntry]> = [];
  for (const k of keys.slice(0, n)) {
    out.push([k, existing[k]]);
  }
  return out;
}

function buildPrompt(
  missingKeys: string[],
  fexdSource: Map<string, FexdSourceRow>,
  exemplars: Array<[string, FexdTranslationEntry]>,
  picks: AllowlistEntry[],
): string {
  // Build a lookup: doc-id → fexd slug.
  const docToSlug = new Map<string, string>();
  for (const p of picks) docToSlug.set(p.exerciseId, p.fexdSlug);

  const lines: string[] = [];
  lines.push(
    "You are translating English exercise descriptions into Argentine Spanish (voseo) for the GC Fitness app. Return a single JSON object keyed by the exact `exerciseId` strings I provide below. Each value must have this exact shape (no extra keys, no nested objects beyond the 2 string-arrays):",
  );
  lines.push("");
  lines.push("{");
  lines.push('  "name_en": "<verbatim English name from FEXD source>",');
  lines.push('  "name_es": "<Argentine Spanish translation>",');
  lines.push('  "instructions_en": ["<verbatim EN step 1>", "<EN step 2>", ...],');
  lines.push('  "instructions_es": ["<ES step 1>", "<ES step 2>", ...]');
  lines.push("}");
  lines.push("");
  lines.push("HARD RULES:");
  lines.push(
    "  1. `instructions_es` MUST have the SAME number of array elements as `instructions_en`. Each ES step corresponds 1:1 to the EN step at the same index.",
  );
  lines.push(
    "  2. Use Argentine Spanish voseo (e.g., 'Sostené', 'Acostate', 'Empujá') — NOT Spanish 'tu' or formal 'usted'. Match the tone of the exemplars below.",
  );
  lines.push(
    "  3. Do NOT include any preamble, hedging, apology, or commentary ('As an AI...', 'I cannot...', 'Here are the translations:'). Output ONLY the JSON object.",
  );
  lines.push(
    "  4. Do NOT truncate any instruction step. Each ES step must end with proper punctuation and convey the full meaning of its EN counterpart.",
  );
  lines.push(
    "  5. Use the verbatim EN `name` and `instructions` strings from the source data I provide — do NOT edit them.",
  );
  lines.push("");
  lines.push(
    "EXEMPLARS (use these for tone + format reference — do NOT include them in your output):",
  );
  lines.push("");
  lines.push("```json");
  const exemplarObj: Record<string, FexdTranslationEntry> = {};
  for (const [k, v] of exemplars) exemplarObj[k] = v;
  lines.push(JSON.stringify(exemplarObj, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`MISSING ENTRIES TO TRANSLATE (${missingKeys.length} total):`);
  lines.push("");
  lines.push("```json");
  const missingObj: Record<
    string,
    { name_en: string; instructions_en: string[] }
  > = {};
  for (const docId of missingKeys) {
    const slug = docToSlug.get(docId);
    if (!slug) {
      // Allowlist parse drift — surface for operator review.
      missingObj[docId] = {
        name_en: "<MISSING: no allowlist entry maps this doc-id to an fexd slug>",
        instructions_en: [],
      };
      continue;
    }
    const src = fexdSource.get(slug);
    if (!src) {
      missingObj[docId] = {
        name_en: `<MISSING: fexd source has no row for slug "${slug}">`,
        instructions_en: [],
      };
      continue;
    }
    missingObj[docId] = {
      name_en: src.name,
      instructions_en: src.instructions,
    };
  }
  lines.push(JSON.stringify(missingObj, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(
    "Return ONLY a JSON object with the same keys, each populated with the 4-field shape described at the top. No code fences in your response.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const args = parseArgs();

  if (!fs.existsSync(args.allowlist)) {
    throw new Error(`Allowlist not found: ${args.allowlist}`);
  }
  if (!fs.existsSync(args.translations)) {
    throw new Error(`Translations not found: ${args.translations}`);
  }

  const picks = parseAllowlistForFexd(fs.readFileSync(args.allowlist, "utf8"));
  const existing: FexdTranslations = JSON.parse(
    fs.readFileSync(args.translations, "utf8"),
  );

  const missing = computeMissingKeys(picks, existing);

  process.stdout.write(
    `translate-fexd-batch: ${picks.length} allowlist picks, ${Object.keys(existing).filter((k) => k !== "_meta").length} existing translations, ${missing.length} missing keys.\n`,
  );

  if (missing.length === 0 && !args.from) {
    process.stdout.write("Translations already converged.\n");
    return;
  }

  // --emit-prompt: print the few-shot LLM prompt to stdout and exit.
  if (args.emitPrompt) {
    process.stdout.write(
      `Fetching FEXD source dataset from ${args.fexdData}...\n`,
    );
    const fexdSource = await fetchFexdSource(args.fexdData);
    const exemplars = pickExemplars(existing, 5);
    const prompt = buildPrompt(missing, fexdSource, exemplars, picks);
    process.stdout.write("\n----- BEGIN PROMPT -----\n");
    process.stdout.write(prompt);
    process.stdout.write("\n----- END PROMPT -----\n");
    return;
  }

  // No --from: dry-run report only (first 10 missing slugs).
  if (!args.from) {
    process.stdout.write("\nSample of first 10 missing keys:\n");
    for (const k of missing.slice(0, 10)) process.stdout.write(`  ${k}\n`);
    process.stdout.write(
      "\nNext step: run with --emit-prompt > /tmp/prompt.txt, paste into a Claude session, save response, then run with --from <response.json> [--apply].\n",
    );
    return;
  }

  // --from: validate LLM-batch output + parity (no mutation unless --apply).
  if (!fs.existsSync(args.from)) {
    throw new Error(`LLM-batch output not found: ${args.from}`);
  }
  const llmRaw = fs.readFileSync(args.from, "utf8");
  const additions = parseTranslationsBatch(llmRaw);
  assertInstructionLengthParity(additions);
  process.stdout.write(
    `Validation OK. ${Object.keys(additions).length} entries ready to merge.\n`,
  );

  // Cross-check: every missing key has a corresponding addition.
  const additionKeys = new Set(Object.keys(additions));
  const stillMissing = missing.filter((k) => !additionKeys.has(k));
  if (stillMissing.length > 0) {
    process.stdout.write(
      `WARN: ${stillMissing.length} allowlist picks still lack a translation in the LLM-batch output:\n`,
    );
    for (const k of stillMissing.slice(0, 10)) process.stdout.write(`  ${k}\n`);
  }
  const extraneous = [...additionKeys].filter((k) => !missing.includes(k));
  if (extraneous.length > 0) {
    process.stdout.write(
      `WARN: ${extraneous.length} extraneous translations in LLM batch (no matching allowlist pick):\n`,
    );
    for (const k of extraneous.slice(0, 10)) process.stdout.write(`  ${k}\n`);
  }

  if (!args.apply) {
    process.stdout.write(
      "\nDRY-RUN. Re-run with --apply to write the pre-merge backup + merge into fexd-translations.json.\n",
    );
    return;
  }

  // --apply: backup, merge, write.
  const backupPath = writePreMergeBackup(args.translations);
  process.stdout.write(`Wrote backup: ${backupPath}\n`);

  const merged = mergeTranslations(existing, additions);

  // Bump _meta.exercise_count + _meta.generated_at on the merged doc.
  const nextMeta: Record<string, unknown> = {
    ...(((merged as unknown) as Record<string, unknown>)._meta as Record<
      string,
      unknown
    > | undefined ?? {}),
  };
  nextMeta.generated_at = new Date().toISOString();
  nextMeta.exercise_count = Object.keys(merged).filter((k) => k !== "_meta")
    .length;
  (((merged as unknown) as Record<string, unknown>))._meta = nextMeta;

  fs.writeFileSync(args.translations, JSON.stringify(merged, null, 2) + "\n", "utf8");
  process.stdout.write(
    `Merged ${Object.keys(additions).length} entries into ${args.translations}. Total now: ${nextMeta.exercise_count}.\n`,
  );
}

if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
