#!/usr/bin/env tsx
/**
 * backfill-series-id.ts — one-shot backfill that retro-fits the new
 * `seriesId` field onto legacy recurring `/workout_assignments` docs that
 * were created BEFORE 260522-ki7 Task A's assignTemplateRecurring change.
 *
 * Task B deliverable for plan 260522-ki7. This script:
 *
 *   1. Reads /workout_assignments via firebase-admin (cert credentials —
 *      bypasses rules, same env-var contract as
 *      backoffice/scripts/seed-gc-fitness-library.cjs +
 *      scripts/gc-fitness/curate-exercise-library.ts).
 *   2. Filters to docs WITH `recurrence` set AND WITHOUT `seriesId` (so the
 *      script is idempotent — a 2nd run after convergence is a no-op).
 *   3. Groups by composite key
 *        `${clientId}|${trainerId}|${templateId}|${recurrence.weekday}|${floor(createdAt.toMillis() / 300000)}`
 *      — the 5-minute createdAt bucket tolerates the μs-level drift within
 *      a single batched write while preventing a hypothetical second-series-
 *      with-same-(client+trainer+template+weekday) collision.
 *   4. For each group: generate ONE `randomUUID()`. In dry-run mode, print
 *      the proposed assignment. In --apply mode, build a Firestore batched-
 *      writes commit (chunks of 450) calling `ref.update({ seriesId, updatedAt })`
 *      on every doc in every group.
 *
 * Defaults to DRY RUN. --apply opt-in mutates Firestore.
 *
 * Usage:
 *   npx tsx backfill-series-id.ts               # dry-run
 *   npx tsx backfill-series-id.ts --apply       # mutates
 *   npx tsx backfill-series-id.ts --help
 *
 * Idempotency:
 *   Re-running with --apply after convergence reports zero pending writes
 *   and exits 0. Enforced by the "skip docs that already have seriesId"
 *   branch in groupDocsBySeries().
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Env + admin init (mirrors curate-exercise-library.ts loadEnv/initAdmin)
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

  const existing = getApps().find((a) => a.name === "backfill-series-id");
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
    },
    "backfill-series-id",
  );
}

// ---------------------------------------------------------------------------
// CLI arg parser
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      args.apply = true;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx backfill-series-id.ts [--apply]\n\n" +
          "  --apply   Actually mutate Firestore. Default is dry-run.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Group-key composition + clustering
// ---------------------------------------------------------------------------

/**
 * Minimal shape of an existing /workout_assignments doc that the backfill
 * needs in order to compose a group key. The script enumerates the whole
 * collection so we accept `Record<string, unknown>` from the Firestore SDK
 * and project the relevant fields here.
 */
export interface AssignmentDocShape {
  id: string;
  clientId?: unknown;
  trainerId?: unknown;
  templateId?: unknown;
  recurrence?: { kind?: unknown; weekday?: unknown } | null;
  seriesId?: unknown;
  createdAt?: { toMillis?: () => number } | null | undefined;
}

/**
 * Returns the canonical 5-tuple group key for a given assignment doc, or
 * `null` if the doc does not qualify for grouping (no recurrence, missing
 * required identity field, or createdAt cannot be measured in ms).
 *
 * 5-min bucket on createdAt: tolerates μs-level drift within a single
 * Firestore WriteBatch (per-doc createdAt timestamps can land in different
 * micros even though the same batched write committed) while preventing
 * two distinct trainer "create recurring" actions for the same
 * (client+trainer+template+weekday) tuple within 5 minutes from collapsing
 * into one group. That collision is structurally implausible — a trainer
 * cannot physically click "Create" twice that fast — but the dry-run + the
 * Task B.gate human checkpoint catches any anomaly before --apply.
 */
export function computeGroupKey(doc: AssignmentDocShape): string | null {
  if (!doc.recurrence || typeof doc.recurrence !== "object") return null;
  const weekday = (doc.recurrence as { weekday?: unknown }).weekday;
  if (typeof weekday !== "number") return null;

  const clientId = doc.clientId;
  const trainerId = doc.trainerId;
  const templateId = doc.templateId;
  if (typeof clientId !== "string") return null;
  if (typeof trainerId !== "string") return null;
  if (typeof templateId !== "string") return null;

  const createdAt = doc.createdAt;
  if (!createdAt || typeof createdAt.toMillis !== "function") return null;
  const bucket = Math.floor(createdAt.toMillis() / 300_000);

  return `${clientId}|${trainerId}|${templateId}|${weekday}|${bucket}`;
}

/**
 * Cluster a flat list of assignment docs into groups keyed by computeGroupKey.
 * Docs that already have a seriesId set are SKIPPED (idempotency — re-running
 * the backfill after convergence is a no-op). Docs with no recurrence field
 * are ALSO skipped (non-recurring singletons never join a series).
 */
export function groupDocsBySeries(
  docs: AssignmentDocShape[],
): Map<string, AssignmentDocShape[]> {
  const groups = new Map<string, AssignmentDocShape[]>();
  for (const doc of docs) {
    // Idempotency: any doc with seriesId already set is treated as belonging
    // to an existing series — the backfill never touches it.
    if (typeof doc.seriesId === "string" && doc.seriesId.length > 0) continue;
    // Non-recurring docs are never grouped.
    if (!doc.recurrence) continue;
    const key = computeGroupKey(doc);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Batched commit (chunks of 450 to stay under Firestore's 500-op ceiling)
// ---------------------------------------------------------------------------

interface BatchLike {
  update(ref: unknown, data: Record<string, unknown>): unknown;
  commit(): Promise<unknown>;
}
interface DbLike {
  batch(): BatchLike;
  collection(name: string): {
    doc(id: string): unknown;
    get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
  };
}

export async function commitInChunks(
  db: DbLike,
  writes: { ref: unknown; data: Record<string, unknown> }[],
  apply: boolean,
): Promise<number> {
  if (!apply || writes.length === 0) return 0;
  let committed = 0;
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    const slice = writes.slice(i, i + 450);
    for (const w of slice) batch.update(w.ref, w.data);
    await batch.commit();
    committed += slice.length;
  }
  return committed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();

  process.stdout.write(
    `backfill-series-id — ${args.apply ? "APPLY (will mutate Firestore)" : "DRY RUN (no writes)"}\n\n`,
  );

  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write(
    "Reading /workout_assignments from Firestore (project gcfitness-3476b)…\n",
  );
  const snap = await db.collection("workout_assignments").get();
  process.stdout.write(`Read ${snap.size} docs.\n\n`);

  // Project the Firestore snapshot docs into AssignmentDocShape entries.
  const allDocs: AssignmentDocShape[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      clientId: data.clientId,
      trainerId: data.trainerId,
      templateId: data.templateId,
      recurrence: (data.recurrence ?? null) as AssignmentDocShape["recurrence"],
      seriesId: data.seriesId,
      createdAt: data.createdAt as AssignmentDocShape["createdAt"],
    };
  });

  const recurringDocsTotal = allDocs.filter((d) => d.recurrence).length;
  const alreadyHasSeriesId = allDocs.filter(
    (d) => typeof d.seriesId === "string" && d.seriesId.length > 0,
  ).length;

  process.stdout.write(`Recurring docs total:           ${recurringDocsTotal}\n`);
  process.stdout.write(`Already have seriesId (skip):   ${alreadyHasSeriesId}\n`);

  const groups = groupDocsBySeries(allDocs);
  process.stdout.write(`Groups detected (need backfill): ${groups.size}\n\n`);

  let totalDocsInGroups = 0;
  const writes: { ref: unknown; data: Record<string, unknown> }[] = [];

  for (const [key, members] of groups) {
    const seriesId = randomUUID();
    totalDocsInGroups += members.length;
    const sampleParts = key.split("|");
    const clientId = sampleParts[0];
    const weekday = sampleParts[3];
    const tag = args.apply ? "[APPLY]" : "[DRY-RUN]";
    process.stdout.write(
      `${tag} series ${seriesId}: ${members.length} doc(s) — ` +
        `client=${clientId} weekday=${weekday}\n`,
    );
    for (const member of members) {
      const ref = db.collection("workout_assignments").doc(member.id);
      writes.push({
        ref,
        data: {
          seriesId,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }
  }

  process.stdout.write("\n--- Summary ---\n");
  process.stdout.write(`Total /workout_assignments docs read: ${snap.size}\n`);
  process.stdout.write(`Recurring docs total:                 ${recurringDocsTotal}\n`);
  process.stdout.write(`Already-seriesId (skipped):           ${alreadyHasSeriesId}\n`);
  process.stdout.write(`Groups detected:                      ${groups.size}\n`);
  process.stdout.write(`Docs to receive seriesId:             ${totalDocsInGroups}\n`);
  process.stdout.write(`Pending writes:                       ${writes.length}\n`);

  if (writes.length === 0) {
    process.stdout.write("\nAll desired states already present. Exit 0.\n");
    return;
  }

  if (!args.apply) {
    process.stdout.write(
      `\nDRY RUN: would update ${writes.length} doc${writes.length === 1 ? "" : "s"}. ` +
        `Re-run with --apply to commit.\n`,
    );
    return;
  }

  process.stdout.write(
    `\nApplying ${writes.length} writes in chunks of 450…\n`,
  );
  const committed = await commitInChunks(db as unknown as DbLike, writes, true);
  process.stdout.write(
    `Wrote ${committed} docs across ${groups.size} group${groups.size === 1 ? "" : "s"}.\n`,
  );
}

// Run only when invoked directly (not on import for tests).
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
}

// Re-export Timestamp for tests that need a stub.
export { Timestamp };
