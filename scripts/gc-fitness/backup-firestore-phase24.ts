#!/usr/bin/env tsx
/**
 * Phase 24 pre-apply local JSON backup of /exercises + /workout_templates.
 *
 * Use case: gcloud firestore export requires datastore.importExportAdmin IAM
 * which the operator account doesn't carry. This is the pragmatic alternative —
 * dump the two collections this phase mutates to local JSON via firebase-admin
 * (uses the env-var-bound creds in backoffice/.env.local). Recovery is a
 * one-shot restore script that re-creates each doc from the JSON dump.
 *
 * Usage:
 *   npx tsx backup-firestore-phase24.ts [--out <dir>]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { loadEnv, initAdmin } from "./backfill-fexd-vocabulary";

async function dumpCollection(
  db: Firestore,
  collection: string,
): Promise<Record<string, unknown>> {
  const snap = await db.collection(collection).get();
  const out: Record<string, unknown> = {};
  snap.forEach((doc) => {
    out[doc.id] = doc.data();
  });
  return out;
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  let outDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) outDir = args[i + 1];
  }
  if (!outDir) {
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace(/Z$/, "");
    outDir = `/Users/manu/phase24-backups/pre-apply-${ts}`;
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write(`Phase 24 pre-apply backup → ${outDir}\n`);
  process.stdout.write(
    `Project: ${process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID}\n`,
  );
  process.stdout.write(`Dumping /exercises …\n`);
  const exercises = await dumpCollection(db, "exercises");
  fs.writeFileSync(
    path.join(outDir, "exercises.json"),
    JSON.stringify(exercises, null, 2),
  );
  process.stdout.write(`  ${Object.keys(exercises).length} docs\n`);

  process.stdout.write(`Dumping /workout_templates …\n`);
  const templates = await dumpCollection(db, "workout_templates");
  fs.writeFileSync(
    path.join(outDir, "workout_templates.json"),
    JSON.stringify(templates, null, 2),
  );
  process.stdout.write(`  ${Object.keys(templates).length} docs\n`);

  const meta = {
    ranAt: new Date().toISOString(),
    project: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID,
    exercisesCount: Object.keys(exercises).length,
    templatesCount: Object.keys(templates).length,
    note: "Pre-apply Phase 24 local backup. Restore via inverse-write script if needed.",
  };
  fs.writeFileSync(
    path.join(outDir, "_meta.json"),
    JSON.stringify(meta, null, 2),
  );
  process.stdout.write(`Backup complete. Restore source: ${outDir}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
