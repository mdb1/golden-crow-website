#!/usr/bin/env tsx
/**
 * rewrite-exercise-refs.ts — Plan 24-04 Task 2.
 *
 * Scans the workout_templates collection for `.exercises[].exerciseId`
 * references to wger-* doc-ids, then rewrites them to fexd-<slug>
 * equivalents per the hand-curated WGER-TO-FEXD-REWRITE.md table.
 *
 * Dry-run by default. --apply opt-in. Idempotent — re-running after
 * convergence finds 0 rewrites and exits 0.
 *
 * SAFETY GREP-GATE (REQ-24-06): this file must NEVER reference the
 * workout-logs collection in any code path. The test suite enforces a
 * literal grep that fails CI if the collection name appears outside
 * comment lines. Per Pattern S7 + Invariant I5 the completed-log
 * collection is IMMUTABLE history — references in completed logs are
 * left alone and the denormalized `templateSnapshot.exercises[].name`
 * preserves the historical label.
 *
 * Codex HIGH mitigation (single point of failure on the hand-curated
 * map): `checkUnmappedRefs` is invoked BEFORE any rewrite emission. If
 * any wger-* ref appears in workout_templates whose doc-id is neither
 * in the rewrite map nor in the UNMAPPED_ACCEPTED set, the script
 * prints the offending pairs and exits with code 1. The dry-run also
 * emits a per-template before/after diff to
 * WGER-REWRITE-DIFF.json for operator review before --apply.
 *
 * Usage:
 *   npx tsx rewrite-exercise-refs.ts                  # dry-run
 *   npx tsx rewrite-exercise-refs.ts --apply          # mutates
 *   npx tsx rewrite-exercise-refs.ts --rewriteMap <path>  # override map
 *   npx tsx rewrite-exercise-refs.ts --help
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  commitInChunks,
  type ChunkedWrite,
} from "./curate-exercise-library";

// ---------------------------------------------------------------------------
// Env + admin init (Pattern S1 — app name unique per script)
// ---------------------------------------------------------------------------

export function loadEnv(): void {
  const candidates = [
    path.resolve(__dirname, "..", "..", "backoffice", ".env.local"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "backoffice", ".env.local"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

export function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error(
      "Missing GC Fitness Firebase Admin env vars. " +
        "Need: NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID, " +
        "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL, " +
        "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  const APP_NAME = "rewrite-exercise-refs";
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
    },
    APP_NAME,
  );
}

// ---------------------------------------------------------------------------
// CLI args (Pattern S2 — dry-run first)
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
  rewriteMap: string;
  collection: string;
  diffOut: string;
}

const DEFAULT_REWRITE_MAP_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "gc-fitness",
  ".planning",
  "phases",
  "24-exercise-library-expansion-free-exercise-db",
  "WGER-TO-FEXD-REWRITE.md",
);

const DEFAULT_DIFF_OUT_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "gc-fitness",
  ".planning",
  "phases",
  "24-exercise-library-expansion-free-exercise-db",
  "WGER-REWRITE-DIFF.json",
);

// Default collection = `workout_templates`. The script MUST NEVER target the
// completed-log collection (see SAFETY GREP-GATE in the header comment).
const DEFAULT_COLLECTION = "workout_templates";

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    rewriteMap: DEFAULT_REWRITE_MAP_PATH,
    collection: DEFAULT_COLLECTION,
    diffOut: DEFAULT_DIFF_OUT_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--rewriteMap") args.rewriteMap = path.resolve(argv[++i] ?? "");
    else if (a === "--collection") args.collection = argv[++i] ?? args.collection;
    else if (a === "--diffOut") args.diffOut = path.resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx rewrite-exercise-refs.ts [--apply] [--rewriteMap <path>] [--collection <name>] [--diffOut <path>]\n\n" +
          "  --apply        Actually mutate Firestore. Default is dry-run.\n" +
          "  --rewriteMap   Path to WGER-TO-FEXD-REWRITE.md (default: Phase 24 planning path).\n" +
          "  --collection   Firestore collection to scan (default: workout_templates).\n" +
          "  --diffOut      Path for the WGER-REWRITE-DIFF.json artifact (default: Phase 24 planning path).\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Markdown parsers — defensive table reader + UNMAPPED_ACCEPTED section reader.
// ---------------------------------------------------------------------------

/**
 * Parse the `## Rewrite table` rows from WGER-TO-FEXD-REWRITE.md. Each row is
 * `| wger-<uuid> | wger name | fexd-<slug> OR null | notes |`. Returns a
 * Record mapping every wger doc-id to either its fexd-* replacement slug or
 * the literal `null` (meaning: do not rewrite). Defensive against header /
 * separator / non-wger rows — only lines whose first cell begins with `wger-`
 * are parsed.
 */
export function parseRewriteMap(markdown: string): Record<string, string | null> {
  const lines = markdown.split(/\r?\n/);
  const out: Record<string, string | null> = {};
  for (const ln of lines) {
    if (!ln.startsWith("|")) continue;
    // Split into cells, drop the empty cells produced by leading/trailing `|`.
    const cells = ln
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
    if (cells.length < 3) continue;
    const wgerId = cells[0];
    if (!/^wger-/.test(wgerId)) continue;
    const target = cells[2];
    if (target === "null" || target === "") {
      out[wgerId] = null;
    } else {
      out[wgerId] = target;
    }
  }
  return out;
}

/**
 * Parse the `## UNMAPPED_ACCEPTED` section from WGER-TO-FEXD-REWRITE.md. Each
 * accepted id is on its own line as `- wger-<uuid> ...`. Stops at the next
 * `## ` heading. Lines that don't start with `- wger-` are ignored (allows
 * narrative bullets / blank lines in the section without polluting the Set).
 */
export function parseUnmappedAccepted(markdown: string): Set<string> {
  const lines = markdown.split(/\r?\n/);
  const out = new Set<string>();
  let inSection = false;
  for (const ln of lines) {
    if (/^##\s+UNMAPPED_ACCEPTED\b/i.test(ln)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s/.test(ln)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const m = ln.match(/^-\s+(wger-[A-Za-z0-9_-]+)/);
    if (m) out.add(m[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pure-function rewrite + gate helpers (testable without firebase-admin).
// ---------------------------------------------------------------------------

export interface RewriteEntry {
  idx: number;
  from: string;
  to: string;
}

/**
 * Compute the per-template rewrites: walk `exercises[]`, look each
 * `exerciseId` up in the map. Emit an entry only when the map value is a
 * non-null string (explicit `null` means: do not rewrite; carry-forward
 * acceptable). Non-string exerciseId values are skipped defensively.
 */
export function computeRewrites(args: {
  exercises: Array<{ exerciseId?: string }>;
  map: Record<string, string | null>;
}): RewriteEntry[] {
  const out: RewriteEntry[] = [];
  for (let i = 0; i < args.exercises.length; i++) {
    const from = args.exercises[i]?.exerciseId;
    if (typeof from !== "string") continue;
    const to = args.map[from];
    if (typeof to !== "string") continue; // null OR absent OR explicit-null
    out.push({ idx: i, from, to });
  }
  return out;
}

export interface OffendingRef {
  templateId: string;
  exerciseId: string;
}

export interface TemplateLike {
  id: string;
  exercises: Array<{ exerciseId?: string }>;
}

/**
 * Blocking-gate audit (Codex HIGH single-point-of-failure mitigation): scan
 * every template's exercises[] and report any wger-* exerciseId that is
 * NEITHER in the rewrite map (would be silently rewritten) NOR in the
 * UNMAPPED_ACCEPTED set (would be explicitly carry-forward-accepted).
 *
 * An empty return list = gate passes. A non-empty return list = caller MUST
 * print the offending pairs and exit with code 1 — the operator has to
 * reconcile WGER-TO-FEXD-REWRITE.md before --apply can proceed.
 *
 * Non-wger exerciseIds (fexd-*, custom-*, etc.) are never offending — they
 * are out of scope for this script.
 */
export function checkUnmappedRefs(args: {
  templates: TemplateLike[];
  map: Record<string, string | null>;
  unmappedAccepted: Set<string>;
}): OffendingRef[] {
  const out: OffendingRef[] = [];
  for (const tpl of args.templates) {
    for (const ex of tpl.exercises) {
      const id = ex?.exerciseId;
      if (typeof id !== "string") continue;
      if (!id.startsWith("wger-")) continue;
      if (Object.prototype.hasOwnProperty.call(args.map, id)) continue;
      if (args.unmappedAccepted.has(id)) continue;
      out.push({ templateId: tpl.id, exerciseId: id });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff artifact emission (Codex HIGH — operator-reviewed before --apply)
// ---------------------------------------------------------------------------

export interface DiffEntry {
  templateId: string;
  beforeExerciseIds: string[];
  afterExerciseIds: string[];
}

export function buildDiffEntries(args: {
  rows: Array<{ id: string; beforeExerciseIds: string[]; rewrites: RewriteEntry[] }>;
}): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const row of args.rows) {
    if (row.rewrites.length === 0) continue;
    const after = [...row.beforeExerciseIds];
    for (const rw of row.rewrites) {
      after[rw.idx] = rw.to;
    }
    out.push({
      templateId: row.id,
      beforeExerciseIds: row.beforeExerciseIds,
      afterExerciseIds: after,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main (Pattern S2 — dry-run-first; Pattern S3 — commitInChunks op:'update')
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();

  process.stdout.write(
    `rewrite-exercise-refs — ${args.apply ? "APPLY (will mutate Firestore)" : "DRY RUN (no writes)"}\n` +
      `  rewriteMap: ${args.rewriteMap}\n` +
      `  collection: ${args.collection}\n` +
      `  diffOut:    ${args.diffOut}\n\n`,
  );

  if (!fs.existsSync(args.rewriteMap)) {
    throw new Error(`WGER-TO-FEXD-REWRITE.md not found at ${args.rewriteMap}`);
  }
  const md = fs.readFileSync(args.rewriteMap, "utf8");
  const map = parseRewriteMap(md);
  const unmappedAccepted = parseUnmappedAccepted(md);
  process.stdout.write(
    `Parsed rewrite map: ${Object.keys(map).length} entries (` +
      `${Object.values(map).filter((v) => typeof v === "string").length} mapped, ` +
      `${Object.values(map).filter((v) => v === null).length} null).\n`,
  );
  process.stdout.write(`UNMAPPED_ACCEPTED: ${unmappedAccepted.size} ids.\n\n`);

  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write(
    `Reading ${args.collection} from Firestore (project gcfitness-3476b)…\n`,
  );
  const snap = await db.collection(args.collection).get();
  process.stdout.write(`Scanned ${snap.size} ${args.collection} docs.\n\n`);

  // Project snapshot into the pure-function shape used by checkUnmappedRefs +
  // computeRewrites.
  type RowProjection = {
    ref: FirebaseFirestore.DocumentReference;
    id: string;
    exercises: Array<{ exerciseId?: string }>;
    beforeExerciseIds: string[];
  };
  const rows: RowProjection[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as { exercises?: Array<{ exerciseId?: string }> };
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];
    const beforeExerciseIds = exercises.map((e) =>
      typeof e?.exerciseId === "string" ? e.exerciseId : "",
    );
    rows.push({
      ref: doc.ref,
      id: doc.id,
      exercises,
      beforeExerciseIds,
    });
  }

  // Blocking gate FIRST — abort before any rewrite emission.
  const offending = checkUnmappedRefs({
    templates: rows.map((r) => ({ id: r.id, exercises: r.exercises })),
    map,
    unmappedAccepted,
  });
  if (offending.length > 0) {
    process.stderr.write(
      `BLOCKED: ${offending.length} unmapped wger refs found in ${args.collection} ` +
        `(not in rewrite map AND not in UNMAPPED_ACCEPTED). ` +
        `Add them to WGER-TO-FEXD-REWRITE.md or UNMAPPED_ACCEPTED.\n`,
    );
    for (const o of offending.slice(0, 50)) {
      process.stderr.write(`  ${o.templateId}: ${o.exerciseId}\n`);
    }
    if (offending.length > 50) {
      process.stderr.write(`  … and ${offending.length - 50} more\n`);
    }
    process.exit(1);
  }

  // Compute per-template rewrites.
  const rewritesByRow = rows.map((r) => ({
    row: r,
    rewrites: computeRewrites({ exercises: r.exercises, map }),
  }));
  const affected = rewritesByRow.filter((r) => r.rewrites.length > 0);
  process.stdout.write(
    `Templates with rewrites pending: ${affected.length} (out of ${rows.length}).\n`,
  );
  for (const r of affected.slice(0, 10)) {
    const detail = r.rewrites
      .map((x) => `[${x.idx}] ${x.from}→${x.to}`)
      .join("; ");
    process.stdout.write(`  ${r.row.id}: ${detail}\n`);
  }

  // Emit WGER-REWRITE-DIFF.json artifact (always — every run reflects the
  // current Firestore state). Operator reviews this before --apply.
  const diff = buildDiffEntries({
    rows: rewritesByRow.map((r) => ({
      id: r.row.id,
      beforeExerciseIds: r.row.beforeExerciseIds,
      rewrites: r.rewrites,
    })),
  });
  fs.mkdirSync(path.dirname(args.diffOut), { recursive: true });
  fs.writeFileSync(args.diffOut, JSON.stringify(diff, null, 2), "utf8");
  process.stdout.write(`\nWrote WGER-REWRITE-DIFF artifact to ${args.diffOut}\n`);

  if (!args.apply) {
    process.stdout.write(
      `\nDRY-RUN. Re-run with --apply to mutate. Total pending rewrites: ${affected.length}.\n`,
    );
    return;
  }

  // Apply path — build ChunkedWrite[] with op:'update' (templates already
  // exist; never insert).
  const writes: ChunkedWrite[] = [];
  for (const r of affected) {
    const exercises = [...r.row.exercises].map((e) => ({ ...e }));
    for (const rw of r.rewrites) {
      exercises[rw.idx] = { ...exercises[rw.idx], exerciseId: rw.to };
    }
    writes.push({
      ref: r.row.ref,
      data: { exercises, updatedAt: FieldValue.serverTimestamp() },
      op: "update",
    });
  }

  if (writes.length === 0) {
    process.stdout.write("\nAll templates already converged. Committed 0 writes.\n");
    return;
  }

  process.stdout.write(`\nApplying ${writes.length} writes in chunks of 450…\n`);
  const committed = await commitInChunks(db as never, writes, true);
  process.stdout.write(`Committed ${committed} writes.\n`);
}

// Run only when invoked directly (not on import for tests).
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
}
