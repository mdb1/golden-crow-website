/**
 * backfill-library-gif-urls.cjs
 *
 * The new standard-library exercises store their media as `gs://` URIs in
 * `gifUrl` / `thumbnailURL` (e.g.
 * `gs://gcfitness-3476b.firebasestorage.app/exercises/library-gifs/0025.gif`).
 *
 * The iOS + Android apps load `https://` image URLs DIRECTLY (the legacy
 * exercises store resolved `https://` download URLs, which is why they
 * display). For a `gs://` value the iOS thumbnail view must call
 * `StorageReference.downloadURL()`, which is subject to Storage rules — and
 * `storage.rules` only matches the SINGLE-segment `exercises/{filename}`, so
 * the NESTED `exercises/library-gifs/<id>.gif` objects fall through to the
 * catch-all `allow read: if false`. Result: `downloadURL()` is denied and no
 * image renders on either app.
 *
 * Fix (data, matches the working legacy pattern): rewrite each `gs://` media
 * value to a permanent Firebase download URL
 * (`https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<enc>?alt=media&token=<token>`)
 * via the Admin SDK `getDownloadURL`. A token URL bypasses Storage rules and
 * loads directly on both apps — no app release, no rules deploy.
 *
 * SAFETY:
 *   - Only rewrites fields whose current value starts with `gs://`.
 *   - Verifies the object exists (getDownloadURL throws otherwise) and logs +
 *     skips misses instead of writing a broken URL.
 *   - Backs up touched docs (id + old gifUrl/thumbnailURL) before writing.
 *   - --dry-run prints the plan + backup, no Firestore writes.
 *   - Idempotent: a doc with no `gs://` media left is skipped.
 *   - Admin SDK required (.env.local) — runs server-side.
 *
 * Usage (from backoffice/):
 *   node scripts/backfill-library-gif-urls.cjs --dry-run
 *   node scripts/backfill-library-gif-urls.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const EXERCISES = "exercises";
const STANDARD_LIBRARY_TAG = "standard-library";
const MEDIA_FIELDS = ["gifUrl", "thumbnailURL", "imageUrl", "mediaURL"];

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
    storageBucket:
      process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
      `${projectId}.firebasestorage.app`,
  });
}

function objectPathFromGsUri(gsUri) {
  // gs://<bucket>/<object-path> → <object-path>
  const m = /^gs:\/\/[^/]+\/(.+)$/.exec(gsUri);
  return m ? m[1] : null;
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();

  console.log(
    `\nBackfilling gs:// → https download URLs on standard-library media${dryRun ? "  [DRY RUN]" : ""}\n`,
  );

  const snap = await db
    .collection(EXERCISES)
    .where("tags", "array-contains", STANDARD_LIBRARY_TAG)
    .get();

  // Resolve each distinct gs:// path once (many docs share gif + thumbnail).
  const cache = new Map();
  async function resolve(gsUri) {
    if (cache.has(gsUri)) return cache.get(gsUri);
    const objectPath = objectPathFromGsUri(gsUri);
    if (!objectPath) {
      cache.set(gsUri, null);
      return null;
    }
    try {
      const url = await getDownloadURL(bucket.file(objectPath));
      cache.set(gsUri, url);
      return url;
    } catch (err) {
      console.warn(`  ⚠ could not resolve ${gsUri}: ${err.message}`);
      cache.set(gsUri, null);
      return null;
    }
  }

  const plan = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    const before = {};
    for (const field of MEDIA_FIELDS) {
      const value = data[field];
      if (typeof value === "string" && value.startsWith("gs://")) {
        before[field] = value;
        const https = await resolve(value);
        if (https) patch[field] = https;
      }
    }
    if (Object.keys(patch).length > 0) {
      plan.push({ id: doc.id, before, patch });
    }
  }

  console.log(`Docs needing a gs:// → https rewrite: ${plan.length}\n`);

  // Backup.
  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = process.env.BACKUP_STAMP || "manual";
  const backupPath = path.join(backupDir, `library-gif-urls-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(plan.map((p) => ({ id: p.id, before: p.before })), null, 2),
  );
  console.log(`Backup written: ${backupPath}\n`);

  for (const p of plan.slice(0, 5)) {
    console.log(`e.g. ${p.id}:`);
    for (const field of Object.keys(p.patch)) {
      console.log(`   ${field}: ${p.patch[field].slice(0, 110)}…`);
    }
  }
  if (plan.length > 5) console.log(`   … and ${plan.length - 5} more\n`);

  if (dryRun) {
    console.log("\n[DRY RUN] no Firestore writes performed.\n");
    return;
  }

  let written = 0;
  // Chunk the writes into batches of 400.
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const p of plan.slice(i, i + 400)) {
      batch.update(db.collection(EXERCISES).doc(p.id), {
        ...p.patch,
        updatedAt: FieldValue.serverTimestamp(),
      });
      written += 1;
    }
    await batch.commit();
  }
  console.log(`\n✓ Rewrote media URLs on ${written} exercises.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
