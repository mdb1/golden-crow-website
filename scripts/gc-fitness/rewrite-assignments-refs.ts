#!/usr/bin/env tsx
/**
 * Phase 24 V2 remediation: rewrite wger-{uuid} refs in workout_assignments to
 * canonical fexd-{slug} refs.
 *
 * Closes the V2-EXP-24-04-wger-assignment-snapshots carry-forward from Plan
 * 24-04 (operator-accepted "deleted exercise" UX fallout on iOS UI).
 *
 * Two-phase execution (idempotent + dry-run-first):
 *   1. CLONE — for each Group-A wger-{uuid} doc with source='free-exercise-db',
 *      insert a parallel active fexd-{slug} doc with same FEXD content,
 *      stripping deletedAt + deletedReason + mergedInto. Skip if target slug
 *      already exists (sha check).
 *   2. REWRITE — for each wger-{uuid} ref in workout_assignments, look up the
 *      mapping in ASSIGNMENT-REWRITE-MAP.json, and rewrite
 *      templateSnapshot.exercises[].exerciseId to the fexd-{slug} target.
 *      Skip residuals (Group C; no FEXD equivalent).
 *
 * Map file: ../../gc-fitness/.planning/phases/24-.../ASSIGNMENT-REWRITE-MAP.json
 *
 * Usage:
 *   npx tsx rewrite-assignments-refs.ts            # dry-run
 *   npx tsx rewrite-assignments-refs.ts --apply    # mutate
 *
 * Idempotency: re-running --apply after convergence reports 0 writes.
 *
 * Invariant: NEVER mutates workout_logs (REQ-24-06 / I5).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type {
  DocumentReference,
  Firestore,
  WriteBatch,
} from "firebase-admin/firestore";
import { loadEnv, initAdmin } from "./backfill-fexd-vocabulary";

interface CliArgs {
  apply: boolean;
  map: string;
  collection: string;
  diffOut: string;
}

const DEFAULT_MAP_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "gc-fitness",
  ".planning",
  "phases",
  "24-exercise-library-expansion-free-exercise-db",
  "ASSIGNMENT-REWRITE-MAP.json",
);

const DEFAULT_COLLECTION = "workout_assignments";

const DEFAULT_DIFF_OUT_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "gc-fitness",
  ".planning",
  "phases",
  "24-exercise-library-expansion-free-exercise-db",
  "ASSIGNMENT-REWRITE-DIFF.json",
);

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    map: DEFAULT_MAP_PATH,
    collection: DEFAULT_COLLECTION,
    diffOut: DEFAULT_DIFF_OUT_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--map") args.map = path.resolve(argv[++i] ?? "");
    else if (a === "--collection") args.collection = argv[++i] ?? args.collection;
    else if (a === "--diffOut") args.diffOut = path.resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx rewrite-assignments-refs.ts [--apply] [--map <path>] [--collection <name>] [--diffOut <path>]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

interface RewriteMap {
  groupA_clone_and_rewrite: Record<string, { name: string; newFexdSlug: string; refs: number }>;
  groupB_existing_fexd_match: Record<string, { name: string; rewriteTo: string; rewriteJustification: string; refs: number }>;
  groupC_residual_no_equivalent: Record<string, { name: string; reason: string; refs: number }>;
}

export function loadMap(mapPath: string): RewriteMap {
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  if (
    !raw.groupA_clone_and_rewrite ||
    !raw.groupB_existing_fexd_match ||
    !raw.groupC_residual_no_equivalent
  ) {
    throw new Error("Invalid map: missing groupA/B/C keys");
  }
  return raw;
}

interface ResolvedRewrite {
  newRef: string;
  source: "groupA" | "groupB";
}

export function buildResolver(
  map: RewriteMap,
): Record<string, ResolvedRewrite> {
  const out: Record<string, ResolvedRewrite> = {};
  for (const [wgerId, info] of Object.entries(map.groupA_clone_and_rewrite)) {
    out[wgerId] = { newRef: info.newFexdSlug, source: "groupA" };
  }
  for (const [wgerId, info] of Object.entries(map.groupB_existing_fexd_match)) {
    out[wgerId] = { newRef: info.rewriteTo, source: "groupB" };
  }
  return out;
}

async function phase1Clone(
  db: Firestore,
  groupA: RewriteMap["groupA_clone_and_rewrite"],
  apply: boolean,
): Promise<{ cloned: string[]; skipped: string[]; errors: string[] }> {
  const cloned: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const [wgerId, info] of Object.entries(groupA)) {
    const targetId = info.newFexdSlug;
    const targetRef = db.collection("exercises").doc(targetId);
    const targetSnap = await targetRef.get();
    if (targetSnap.exists) {
      const tdata = targetSnap.data() as any;
      if (tdata.deletedAt == null) {
        skipped.push(`${targetId} (already exists, active)`);
        continue;
      }
      skipped.push(`${targetId} (exists but soft-deleted; will not overwrite)`);
      continue;
    }
    const sourceSnap = await db.collection("exercises").doc(wgerId).get();
    if (!sourceSnap.exists) {
      errors.push(`${wgerId}: source doc not found`);
      continue;
    }
    const sdata = { ...(sourceSnap.data() as any) };
    if (sdata.source !== "free-exercise-db") {
      errors.push(
        `${wgerId}: source='${sdata.source}' (expected 'free-exercise-db'); skipping clone`,
      );
      continue;
    }
    delete sdata.deletedAt;
    delete sdata.deletedReason;
    delete sdata.mergedInto;
    sdata.updatedAt = FieldValue.serverTimestamp();
    if (!sdata.createdAt) sdata.createdAt = FieldValue.serverTimestamp();
    process.stdout.write(
      `  CLONE ${wgerId} → ${targetId}  (${info.refs} refs in assignments)\n`,
    );
    if (apply) {
      await targetRef.set(sdata);
      cloned.push(targetId);
    } else {
      cloned.push(`${targetId} (dry-run; would be inserted)`);
    }
  }
  return { cloned, skipped, errors };
}

interface RewriteDiffEntry {
  assignmentId: string;
  changes: Array<{
    order?: number;
    exerciseName?: string;
    from: string;
    to: string;
    source: "groupA" | "groupB";
  }>;
}

async function phase2Rewrite(
  db: Firestore,
  collection: string,
  resolver: Record<string, ResolvedRewrite>,
  apply: boolean,
): Promise<{
  scanned: number;
  rewrites: number;
  affectedDocs: number;
  diff: RewriteDiffEntry[];
  residualRefs: number;
}> {
  const snap = await db.collection(collection).get();
  const diff: RewriteDiffEntry[] = [];
  let rewrites = 0;
  let affectedDocs = 0;
  let residualRefs = 0;
  const writeRefs: Array<{ ref: DocumentReference; data: any }> = [];

  snap.forEach((doc) => {
    const data = doc.data() as any;
    const exs = data.templateSnapshot?.exercises;
    if (!Array.isArray(exs)) return;
    const entry: RewriteDiffEntry = { assignmentId: doc.id, changes: [] };
    let mutated = false;
    const newExs = exs.map((ex: any) => {
      const id: string | undefined = ex?.exerciseId;
      if (typeof id !== "string" || !id.startsWith("wger-")) return ex;
      const resolved = resolver[id];
      if (!resolved) {
        residualRefs++;
        return ex; // group C residual; leave alone
      }
      entry.changes.push({
        order: ex.order,
        exerciseName:
          typeof ex.name === "string" ? ex.name : ex.name?.en ?? ex.name?.es,
        from: id,
        to: resolved.newRef,
        source: resolved.source,
      });
      mutated = true;
      rewrites++;
      return { ...ex, exerciseId: resolved.newRef };
    });
    if (mutated) {
      affectedDocs++;
      diff.push(entry);
      writeRefs.push({
        ref: doc.ref,
        data: {
          templateSnapshot: { ...data.templateSnapshot, exercises: newExs },
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }
  });

  process.stdout.write(
    `\nScanned ${snap.size} ${collection} docs; ${affectedDocs} affected; ${rewrites} ref rewrites; ${residualRefs} residual refs left alone.\n`,
  );

  if (apply && writeRefs.length) {
    process.stdout.write(`Applying ${writeRefs.length} updates in chunks of 450...\n`);
    let committed = 0;
    for (let i = 0; i < writeRefs.length; i += 450) {
      const chunk = writeRefs.slice(i, i + 450);
      const batch: WriteBatch = db.batch();
      for (const { ref, data } of chunk) batch.update(ref, data);
      await batch.commit();
      committed += chunk.length;
    }
    process.stdout.write(`Committed ${committed} writes.\n`);
  }

  return {
    scanned: snap.size,
    rewrites,
    affectedDocs,
    diff,
    residualRefs,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  process.stdout.write(
    `rewrite-assignments-refs — ${args.apply ? "APPLY (will mutate Firestore)" : "DRY RUN (no writes)"}\n` +
      `  map:        ${args.map}\n` +
      `  collection: ${args.collection}\n` +
      `  diffOut:    ${args.diffOut}\n\n`,
  );

  const map = loadMap(args.map);
  const resolver = buildResolver(map);
  process.stdout.write(
    `Loaded map: ${Object.keys(map.groupA_clone_and_rewrite).length} groupA + ` +
      `${Object.keys(map.groupB_existing_fexd_match).length} groupB + ` +
      `${Object.keys(map.groupC_residual_no_equivalent).length} residual.\n\n`,
  );

  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write(`=== Phase 1: clone Group-A wger docs to fexd-{slug} ===\n`);
  const phase1 = await phase1Clone(db, map.groupA_clone_and_rewrite, args.apply);
  process.stdout.write(
    `Cloned: ${phase1.cloned.length}, Skipped: ${phase1.skipped.length}, Errors: ${phase1.errors.length}\n`,
  );
  if (phase1.skipped.length) {
    process.stdout.write(`Skipped reasons:\n`);
    for (const s of phase1.skipped) process.stdout.write(`  - ${s}\n`);
  }
  if (phase1.errors.length) {
    process.stdout.write(`ERRORS (continuing without these targets):\n`);
    for (const e of phase1.errors) process.stdout.write(`  - ${e}\n`);
  }

  process.stdout.write(
    `\n=== Phase 2: rewrite wger refs in ${args.collection} ===\n`,
  );
  const phase2 = await phase2Rewrite(
    db,
    args.collection,
    resolver,
    args.apply,
  );

  fs.writeFileSync(args.diffOut, JSON.stringify(phase2.diff, null, 2), "utf8");
  process.stdout.write(
    `\nWrote ASSIGNMENT-REWRITE-DIFF artifact to ${args.diffOut} (${phase2.diff.length} entries)\n`,
  );

  process.stdout.write(
    `\nFinal:\n` +
      `  ${args.collection} scanned: ${phase2.scanned}\n` +
      `  affected docs:              ${phase2.affectedDocs}\n` +
      `  ref rewrites:               ${phase2.rewrites}\n` +
      `  residual wger refs left:    ${phase2.residualRefs}  (group C; no FEXD equivalent)\n` +
      `  clones inserted:            ${phase1.cloned.length}\n`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
