#!/usr/bin/env tsx
/**
 * backfill-fexd-vocabulary.ts — one-shot idempotent admin script that
 * rewrites `muscleGroups` on the 63 existing FEXD docs in /exercises to
 * use the GC canonical 16-item vocabulary (abs/back/chest/...) instead
 * of the raw FEXD 17-item vocabulary (abdominals/lats/middle back/...).
 *
 * Plan 24-01 Task 2 deliverable. Mirrors the dry-run-first + commitInChunks
 * patterns from backfill-series-id.ts (Pattern S1 + S2) and the per-write
 * op-routed batched commits from seed-from-fexd.ts (Pattern S3 — every
 * write here is op:'update'; the script never inserts).
 *
 * Behaviors (PLAN.md <behavior>):
 *  - computePatch for a FEXD doc whose muscleGroups already === mapFexdMuscles(primaryMuscles)
 *    → kind:'skip', reason:'already-converged'
 *  - computePatch for a FEXD doc with raw FEXD muscleGroups
 *    → kind:'update', patch:{ muscleGroups: <mapped>, updatedAt: FieldValue.serverTimestamp() }
 *  - computePatch for source !== 'free-exercise-db'
 *    → kind:'skip', reason:'not-fexd' (NEVER mutate wger / trainer docs)
 *  - computePatch for a doc with deletedAt set
 *    → kind:'skip', reason:'soft-deleted' (NEVER resurrect soft-deletes)
 *  - computePatch for a FEXD doc with missing or non-array primaryMuscles
 *    → kind:'malformed', observed:<JSON.stringify(value)>  (Codex LOW)
 *  - Dry-run prints proposed updates + writes BACKFILL-VOCAB-DRY-RUN-{ts}.json
 *    artifact at the phase path with totals + updated[] + skipped[] +
 *    malformed[] arrays (Codex LOW — structured input for the human-verify
 *    checkpoint).
 *  - For each malformed doc, emits `console.warn("MALFORMED: doc <id> has
 *    non-array primaryMuscles: <observed>")` to stderr.
 *  - --apply runs commitInChunks; re-run after convergence reports 0 writes.
 *
 * SAFETY INVARIANTS:
 *  - Source-guarded: never mutates source !== 'free-exercise-db' docs (T-24-01-01).
 *  - Soft-delete-guarded: never resurrects deletedAt-set docs (T-24-01-02).
 *  - Chunked at 450/batch via curate-exercise-library.commitInChunks (T-24-01-03).
 *  - Dry-run-first + human gate before --apply (T-24-01-04).
 *  - Malformed detection + JSON-report surfacing (T-24-01-05).
 *
 * Usage:
 *   npx tsx backfill-fexd-vocabulary.ts               # dry-run (default)
 *   npx tsx backfill-fexd-vocabulary.ts --apply       # mutates Firestore
 *   npx tsx backfill-fexd-vocabulary.ts --help
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import { commitInChunks, type ChunkedWrite } from "./curate-exercise-library";
import { mapFexdMuscles } from "./fexd-vocabulary-map";

// ---------------------------------------------------------------------------
// Env + admin init (Pattern S1 — copy of backfill-series-id.ts:49-93 with a
// unique app name "backfill-fexd-vocabulary")
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

export function initAdmin(): App {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error(
      "Missing GC Fitness Firebase Admin env vars. Need: " +
        "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID, " +
        "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL, " +
        "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }
  const APP_NAME = "backfill-fexd-vocabulary";
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
// CLI arg parser (Pattern S2 — dry-run by default; --apply opt-in)
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
  reportDir: string;
}

const DEFAULT_REPORT_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "gc-fitness",
  ".planning",
  "phases",
  "24-exercise-library-expansion-free-exercise-db",
);

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    reportDir: DEFAULT_REPORT_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      args.apply = true;
    } else if (a === "--report-dir") {
      args.reportDir = path.resolve(argv[++i] ?? "");
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx backfill-fexd-vocabulary.ts [--apply] [--report-dir <path>]\n\n" +
          "  --apply        Actually mutate Firestore. Default is dry-run.\n" +
          "  --report-dir   Directory for the BACKFILL-VOCAB-DRY-RUN-*.json artifact\n" +
          "                 (default: gc-fitness/.planning/phases/24-.../).\n\n" +
          "Rewrites muscleGroups on existing FEXD docs from raw FEXD vocabulary\n" +
          "(abdominals/lats/middle back/...) to GC canonical (abs/back/...).\n" +
          "Idempotent: re-run --apply after convergence reports 0 writes.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Pure dispatch — the testable surface
// ---------------------------------------------------------------------------

/**
 * Minimal projection of an /exercises doc that computePatch needs. The main
 * script projects Firestore docs into this shape before dispatching.
 *
 * Note `primaryMuscles` is typed as `string[]` for the happy path but the
 * Case 7 (Codex LOW) malformed branch defensively detects any non-array
 * value (string, undefined, object, etc.) at runtime.
 */
export interface ExerciseDocShape {
  id: string;
  source?: unknown;
  primaryMuscles: string[];
  muscleGroups?: unknown;
  deletedAt?: unknown;
}

export type PatchPlan =
  | { kind: "skip"; reason: "not-fexd" | "soft-deleted" | "already-converged" }
  | {
      kind: "update";
      patch: { muscleGroups: string[]; updatedAt: unknown };
    }
  | { kind: "malformed"; observed: string };

/**
 * Returns a Set-equality check for two string lists — required because
 * mapFexdMuscles output order is insertion-derived, but the on-disk
 * muscleGroups may have been written in a different order historically.
 */
function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const v of b) if (!sa.has(v)) return false;
  return true;
}

export function computePatch(doc: ExerciseDocShape): PatchPlan {
  // Guard (a) — source-guard. Never mutate non-FEXD docs (T-24-01-01).
  if (doc.source !== "free-exercise-db") {
    return { kind: "skip", reason: "not-fexd" };
  }

  // Guard (b) — soft-delete-guard. Never resurrect (T-24-01-02).
  if (doc.deletedAt != null) {
    return { kind: "skip", reason: "soft-deleted" };
  }

  // Guard (c) — malformed primaryMuscles. JSON-stringify the observed
  // value so the operator sees the actual wire shape (Codex LOW).
  // JSON.stringify(undefined) === undefined (not a string), so coerce to
  // the literal "undefined" so the operator's report never shows an
  // empty / missing observed field.
  if (!Array.isArray(doc.primaryMuscles)) {
    const stringified = JSON.stringify(doc.primaryMuscles);
    return {
      kind: "malformed",
      observed: stringified ?? String(doc.primaryMuscles),
    };
  }

  // Compute the canonical target and compare against current value.
  const mapped = mapFexdMuscles(doc.primaryMuscles);
  const current = Array.isArray(doc.muscleGroups) ? (doc.muscleGroups as string[]) : [];

  if (setEqual(mapped, current)) {
    return { kind: "skip", reason: "already-converged" };
  }

  return {
    kind: "update",
    patch: {
      muscleGroups: mapped,
      updatedAt: FieldValue.serverTimestamp(),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON dry-run report (Codex LOW — structured input for human-verify)
// ---------------------------------------------------------------------------

export interface DryRunReport {
  ranAt: string;
  mode: "DRY-RUN" | "APPLY";
  totals: { updated: number; skipped: number; malformed: number };
  updated: { docId: string; from: string[]; to: string[] }[];
  skipped: { docId: string; reason: string }[];
  malformed: { docId: string; observed: string }[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  process.stdout.write(
    `backfill-fexd-vocabulary — ${args.apply ? "APPLY (will mutate Firestore)" : "DRY RUN (no writes)"}\n` +
      `  report-dir: ${args.reportDir}\n\n`,
  );

  const app = initAdmin();
  const db: Firestore = getFirestore(app);

  process.stdout.write(
    "Reading /exercises from Firestore (project gcfitness-3476b)...\n",
  );
  const snap = await db.collection("exercises").get();
  process.stdout.write(`Read ${snap.size} docs.\n\n`);

  const report: DryRunReport = {
    ranAt: new Date().toISOString(),
    mode: args.apply ? "APPLY" : "DRY-RUN",
    totals: { updated: 0, skipped: 0, malformed: 0 },
    updated: [],
    skipped: [],
    malformed: [],
  };

  const writes: ChunkedWrite[] = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const shape: ExerciseDocShape = {
      id: docSnap.id,
      source: data.source,
      primaryMuscles: data.primaryMuscles as string[],
      muscleGroups: data.muscleGroups,
      deletedAt: data.deletedAt,
    };

    const plan = computePatch(shape);

    if (plan.kind === "skip") {
      report.totals.skipped++;
      report.skipped.push({ docId: docSnap.id, reason: plan.reason });
      continue;
    }

    if (plan.kind === "malformed") {
      report.totals.malformed++;
      report.malformed.push({ docId: docSnap.id, observed: plan.observed });
      // Codex LOW — surface silent no-ops to stderr.
      console.warn(
        `MALFORMED: doc ${docSnap.id} has non-array primaryMuscles: ${plan.observed}`,
      );
      continue;
    }

    // plan.kind === "update"
    report.totals.updated++;
    const fromValue = Array.isArray(shape.muscleGroups)
      ? (shape.muscleGroups as string[])
      : [];
    report.updated.push({
      docId: docSnap.id,
      from: fromValue,
      to: plan.patch.muscleGroups,
    });

    const ref = db.collection("exercises").doc(docSnap.id);
    writes.push({ ref, data: plan.patch, op: "update" });
  }

  // Print summary grouped by kind.
  process.stdout.write("--- Summary ---\n");
  process.stdout.write(`Total /exercises docs read:  ${snap.size}\n`);
  process.stdout.write(`Pending updates:             ${report.totals.updated}\n`);
  process.stdout.write(`Skipped:                     ${report.totals.skipped}\n`);
  process.stdout.write(`Malformed (no-op + warned):  ${report.totals.malformed}\n\n`);

  // Print sample of first 10 proposed updates.
  if (report.updated.length > 0) {
    process.stdout.write("Sample updates (first 10):\n");
    for (const u of report.updated.slice(0, 10)) {
      process.stdout.write(
        `  ${u.docId}: [${u.from.join(", ")}] → [${u.to.join(", ")}]\n`,
      );
    }
    process.stdout.write("\n");
  }

  // Emit BACKFILL-VOCAB-DRY-RUN-{timestamp}.json artifact (Codex LOW).
  const tsSlug = report.ranAt.replace(/[:.]/g, "-");
  const reportPath = path.join(
    args.reportDir,
    `BACKFILL-VOCAB-DRY-RUN-${tsSlug}.json`,
  );
  if (!fs.existsSync(args.reportDir)) {
    fs.mkdirSync(args.reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote dry-run report: ${reportPath}\n\n`);

  if (writes.length === 0) {
    process.stdout.write("All FEXD docs already on canonical vocabulary. Exit 0.\n");
    return;
  }

  if (!args.apply) {
    process.stdout.write(
      `DRY-RUN. Re-run with --apply to mutate (would update ${writes.length} doc${writes.length === 1 ? "" : "s"}).\n`,
    );
    return;
  }

  process.stdout.write(
    `Applying ${writes.length} writes in chunks of 450...\n`,
  );
  const committed = await commitInChunks(db as unknown as never, writes, true);
  process.stdout.write(`Committed ${committed} writes.\n`);
}

// Run only when invoked directly (not on import for tests).
if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
