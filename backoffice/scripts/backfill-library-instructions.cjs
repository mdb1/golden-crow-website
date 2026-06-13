/**
 * backfill-library-instructions.cjs
 *
 * Writes step-by-step `instructions` (EN + ES) and a Spanish `description.es`
 * onto the standard-library exercises, which shipped with NO instructions and
 * an English-only description (description.es was a copy of the English).
 *
 * SOURCE / CORRECTNESS:
 *   The instruction text lives in the committed data file
 *   `scripts/data/library-exercise-instructions.json` keyed by the exercise
 *   doc id. English steps come from the ExerciseDB CSV; Spanish is an
 *   Argentine-Spanish translation. CRUCIALLY, the steps are keyed to the
 *   exercise's CORRECTED gif (`exercises/library-gifs/<csvId>.gif`) — the
 *   seed had mapped ~77 exercises to the wrong source movement, repointed by
 *   `fix-library-gif-mismatches.cjs`, so the instructions match what the user
 *   actually sees. Exercises whose gif is still uncovered/wrong were left out
 *   of the data file (no instructions rather than wrong ones).
 *
 * SAFETY:
 *   - Reads the committed data file; never re-derives mappings at run time.
 *   - Backs up each touched doc's prior instructions + description before writing.
 *   - --dry-run prints the plan + backup, no Firestore writes.
 *   - Idempotent: writing the same content twice is a no-op-equivalent (only
 *     updatedAt churns). Uses field path `description.es` so `description.en`
 *     is preserved.
 *   - Admin SDK required (.env.local).
 *
 * Usage (from backoffice/):
 *   node scripts/backfill-library-instructions.cjs --dry-run
 *   node scripts/backfill-library-instructions.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const EXERCISES = "exercises";
const DATA_FILE = path.resolve(
  process.cwd(),
  "scripts/data/library-exercise-instructions.json",
);

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error("Missing GC Fitness Firebase Admin env vars in .env.local.");
  }
  if (getApps()[0]) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
    }),
  });
}

function isStepArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.trim());
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv();
  initAdmin();
  const db = getFirestore();

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const ids = Object.keys(data);
  console.log(
    `\nBackfilling instructions + description.es on ${ids.length} exercises${dryRun ? "  [DRY RUN]" : ""}\n`,
  );

  // Validate the data file up front (fail loud).
  for (const id of ids) {
    const e = data[id];
    if (!isStepArray(e.en) || !isStepArray(e.es)) {
      throw new Error(`Bad instruction data for ${id} (en/es must be non-empty string arrays).`);
    }
    if (e.en.length !== e.es.length) {
      throw new Error(`Step-count mismatch for ${id}: en=${e.en.length} es=${e.es.length}.`);
    }
  }

  // Backup prior state.
  const refs = ids.map((id) => db.collection(EXERCISES).doc(id));
  const snaps = await db.getAll(...refs);
  const backup = [];
  let missing = 0;
  for (const snap of snaps) {
    if (!snap.exists) {
      missing += 1;
      console.warn(`  ⚠ doc not found, will skip: ${snap.id}`);
      continue;
    }
    const d = snap.data();
    backup.push({ id: snap.id, instructions: d.instructions ?? null, description: d.description ?? null });
  }
  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = process.env.BACKUP_STAMP || "manual";
  const backupPath = path.join(backupDir, `library-instructions-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${backupPath} (${backup.length} docs, ${missing} missing)\n`);

  if (dryRun) {
    const sample = ids[0];
    console.log(`e.g. ${sample}: ${data[sample].en.length} EN steps, ${data[sample].es.length} ES steps`);
    console.log(`   en[0]: ${data[sample].en[0]}`);
    console.log(`   es[0]: ${data[sample].es[0]}`);
    console.log("\n[DRY RUN] no Firestore writes performed.\n");
    return;
  }

  const existing = new Set(backup.map((b) => b.id));
  let written = 0;
  const writable = ids.filter((id) => existing.has(id));
  for (let i = 0; i < writable.length; i += 400) {
    const batch = db.batch();
    for (const id of writable.slice(i, i + 400)) {
      const e = data[id];
      batch.update(db.collection(EXERCISES).doc(id), {
        instructions: { en: e.en, es: e.es },
        "description.es": e.descEs ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      written += 1;
    }
    await batch.commit();
  }
  console.log(`\n✓ Wrote instructions + description.es on ${written} exercises.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
