#!/usr/bin/env tsx
/**
 * soft-delete-wger-survivors.ts — Plan 24-04 Task 3.
 *
 * Soft-deletes the wger-* survivors in /exercises that remain after
 * Plan 24-04 Task 4's rewrite-exercise-refs.ts step. Each surviving
 * wger doc receives:
 *
 *   - mapped (column 3 of WGER-TO-FEXD-REWRITE.md is a fexd-* slug):
 *       deletedAt:      serverTimestamp()
 *       deletedReason:  "wger-deprecated-fexd-equivalent"
 *       mergedInto:     <fexd-slug>
 *       updatedAt:      serverTimestamp()
 *
 *   - unmapped (column 3 is `null`):
 *       deletedAt:      serverTimestamp()
 *       deletedReason:  "wger-deprecated-no-equivalent"
 *       mergedInto:     null
 *       updatedAt:      serverTimestamp()
 *
 * Dry-run by default. --apply opt-in. Idempotent — re-running after
 * convergence finds 0 writes and exits 0 (the `already-soft-deleted`
 * skip branch enforces this).
 *
 * SAFETY GREP-GATE (REQ-24-06): this file must NEVER reference the
 * completed-log collection in any code path. Tests enforce a literal
 * grep that fails CI if the collection name appears outside comment
 * lines. Pattern S7 + Invariant I5: completed logs are IMMUTABLE
 * history and we never rewrite them.
 *
 * Defensive WARNING surface (Codex HIGH map-gap mitigation): any wger
 * survivor doc found in /exercises that is NOT in
 * WGER-TO-FEXD-REWRITE.md is logged with "WARNING: not in map" + skip.
 * Operator must reconcile the markdown before re-running.
 *
 * Usage:
 *   npx tsx soft-delete-wger-survivors.ts                # dry-run
 *   npx tsx soft-delete-wger-survivors.ts --apply        # mutates
 *   npx tsx soft-delete-wger-survivors.ts --rewriteMap <path>
 *   npx tsx soft-delete-wger-survivors.ts --help
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  commitInChunks,
  type ChunkedWrite,
} from "./curate-exercise-library";
import { parseRewriteMap } from "./rewrite-exercise-refs";

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

  const APP_NAME = "soft-delete-wger-survivors";
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

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    rewriteMap: DEFAULT_REWRITE_MAP_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--rewriteMap") args.rewriteMap = path.resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx soft-delete-wger-survivors.ts [--apply] [--rewriteMap <path>]\n\n" +
          "  --apply        Actually mutate Firestore. Default is dry-run.\n" +
          "  --rewriteMap   Path to WGER-TO-FEXD-REWRITE.md (default: Phase 24 planning path).\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Pure-function disposition helper (testable without firebase-admin)
// ---------------------------------------------------------------------------

export interface DocShape {
  id: string;
  data: Record<string, unknown> | null;
}

export type Disposition =
  | { kind: "update"; patch: Record<string, unknown>; reason: null }
  | { kind: "skip"; patch: null; reason: "not-wger" | "already-soft-deleted" | "not-in-map" };

/**
 * Decide the soft-delete disposition for an /exercises doc against the
 * hand-curated rewrite map. Sources of truth + dispositions:
 *
 *   D1 non-wger doc-id            → skip 'not-wger'
 *   D2 wger doc with deletedAt    → skip 'already-soft-deleted'
 *   D2 wger doc with deleted:true → skip 'already-soft-deleted' (legacy flag)
 *   D3 mapped (map[id] is string) → update with mergedInto: <fexd-slug>
 *      + deletedReason: 'wger-deprecated-fexd-equivalent'
 *   D4 unmapped (map[id] is null) → update with mergedInto: null
 *      + deletedReason: 'wger-deprecated-no-equivalent'
 *   D5 wger doc NOT in map        → skip 'not-in-map' (defensive — the map is
 *      the SOT and a survivor outside it indicates a missing row in
 *      WGER-TO-FEXD-REWRITE.md; operator must reconcile)
 */
export function computePatch(
  doc: DocShape,
  map: Record<string, string | null>,
): Disposition {
  // D1
  if (!doc.id.startsWith("wger-")) {
    return { kind: "skip", patch: null, reason: "not-wger" };
  }

  const data = doc.data ?? {};
  // D2 — already soft-deleted (preserve idempotency on re-run).
  if (data.deletedAt != null || data.deleted === true) {
    return { kind: "skip", patch: null, reason: "already-soft-deleted" };
  }

  // D5 — map gap (defensive).
  if (!Object.prototype.hasOwnProperty.call(map, doc.id)) {
    return { kind: "skip", patch: null, reason: "not-in-map" };
  }

  const target = map[doc.id];
  if (typeof target === "string") {
    // D3 — mapped to fexd-* equivalent.
    return {
      kind: "update",
      patch: {
        deletedAt: FieldValue.serverTimestamp(),
        deletedReason: "wger-deprecated-fexd-equivalent",
        mergedInto: target,
        updatedAt: FieldValue.serverTimestamp(),
      },
      reason: null,
    };
  }

  // D4 — explicit null in map = no equivalent; carry-forward acceptable.
  return {
    kind: "update",
    patch: {
      deletedAt: FieldValue.serverTimestamp(),
      deletedReason: "wger-deprecated-no-equivalent",
      mergedInto: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Main (Pattern S2 + Pattern S3)
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();

  process.stdout.write(
    `soft-delete-wger-survivors — ${args.apply ? "APPLY (will mutate Firestore)" : "DRY RUN (no writes)"}\n` +
      `  rewriteMap: ${args.rewriteMap}\n\n`,
  );

  if (!fs.existsSync(args.rewriteMap)) {
    throw new Error(`WGER-TO-FEXD-REWRITE.md not found at ${args.rewriteMap}`);
  }
  const md = fs.readFileSync(args.rewriteMap, "utf8");
  const map = parseRewriteMap(md);
  process.stdout.write(
    `Parsed rewrite map: ${Object.keys(map).length} entries (` +
      `${Object.values(map).filter((v) => typeof v === "string").length} mapped, ` +
      `${Object.values(map).filter((v) => v === null).length} null).\n\n`,
  );

  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write("Reading /exercises from Firestore (project gcfitness-3476b)…\n");
  const snap = await db.collection("exercises").get();
  process.stdout.write(`Scanned ${snap.size} /exercises docs.\n\n`);

  // Disposition counters + WARNING surface.
  const counts = {
    skipNonWger: 0,
    skipAlreadyDeleted: 0,
    skipNotInMap: 0,
    updateFexdEquivalent: 0,
    updateNoEquivalent: 0,
  };
  const warningsNotInMap: string[] = [];
  type WriteRow = { id: string; ref: FirebaseFirestore.DocumentReference; patch: Record<string, unknown>; reason: string };
  const writeRows: WriteRow[] = [];

  for (const docSnap of snap.docs) {
    const doc: DocShape = {
      id: docSnap.id,
      data: docSnap.exists ? (docSnap.data() as Record<string, unknown>) ?? null : null,
    };
    const disposition = computePatch(doc, map);
    if (disposition.kind === "skip") {
      if (disposition.reason === "not-wger") counts.skipNonWger++;
      else if (disposition.reason === "already-soft-deleted") counts.skipAlreadyDeleted++;
      else if (disposition.reason === "not-in-map") {
        counts.skipNotInMap++;
        warningsNotInMap.push(docSnap.id);
      }
      continue;
    }
    // disposition.kind === "update"
    const reason = disposition.patch.deletedReason as string;
    if (reason === "wger-deprecated-fexd-equivalent") counts.updateFexdEquivalent++;
    else if (reason === "wger-deprecated-no-equivalent") counts.updateNoEquivalent++;
    writeRows.push({
      id: docSnap.id,
      ref: docSnap.ref,
      patch: disposition.patch,
      reason,
    });
  }

  process.stdout.write("--- Disposition summary ---\n");
  process.stdout.write(`Skipped (not-wger):           ${counts.skipNonWger}\n`);
  process.stdout.write(`Skipped (already-soft-deleted): ${counts.skipAlreadyDeleted}\n`);
  process.stdout.write(`Skipped (not-in-map):         ${counts.skipNotInMap}\n`);
  process.stdout.write(`Updates (fexd-equivalent):    ${counts.updateFexdEquivalent}\n`);
  process.stdout.write(`Updates (no-equivalent):      ${counts.updateNoEquivalent}\n`);
  process.stdout.write(`Total pending writes:         ${writeRows.length}\n\n`);

  if (warningsNotInMap.length > 0) {
    process.stderr.write(
      `WARNING: ${warningsNotInMap.length} wger survivor doc(s) NOT in WGER-TO-FEXD-REWRITE.md ` +
        `(map-gap — operator must add them before --apply):\n`,
    );
    for (const id of warningsNotInMap.slice(0, 50)) {
      process.stderr.write(`  - ${id}\n`);
    }
    if (warningsNotInMap.length > 50) {
      process.stderr.write(`  … and ${warningsNotInMap.length - 50} more\n`);
    }
  }

  if (writeRows.length === 0) {
    process.stdout.write("All desired states already present. Committed 0 writes.\n");
    return;
  }

  if (!args.apply) {
    process.stdout.write(
      `DRY RUN: would update ${writeRows.length} doc${writeRows.length === 1 ? "" : "s"}. ` +
        `Re-run with --apply to mutate.\n`,
    );
    // Sample first 10 ops for operator review.
    process.stdout.write(`\nSample (first 10):\n`);
    for (const w of writeRows.slice(0, 10)) {
      const mergedInto = w.patch.mergedInto ?? "null";
      process.stdout.write(`  ${w.id} → ${w.reason} (mergedInto=${mergedInto})\n`);
    }
    return;
  }

  // Apply path — commitInChunks (Pattern S3 — op:'update' only).
  const writes: ChunkedWrite[] = writeRows.map((w) => ({
    ref: w.ref,
    data: w.patch,
    op: "update",
  }));
  process.stdout.write(`Applying ${writes.length} writes in chunks of 450…\n`);
  const committed = await commitInChunks(db as never, writes, true);
  process.stdout.write(`Committed ${committed} writes.\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
}
