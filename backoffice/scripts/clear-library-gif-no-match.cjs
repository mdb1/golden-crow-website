/**
 * clear-library-gif-no-match.cjs
 *
 * Companion to fix-library-gif-mismatches.cjs. 10 standard-library exercises
 * were assigned a gif of a DIFFERENT movement, and the source CSV
 * (\`exercises-gifs-main\`) has NO adequate replacement (e.g. no pigeon pose,
 * no hollow hold, no tibialis dorsiflexion raise, no seated barbell shoulder
 * press). Per product call: better NO image than a wrong one — the apps fall
 * back to a per-muscle SF Symbol placeholder when media is absent.
 *
 * This DELETES the media fields (gifUrl + thumbnailURL) on each doc so the
 * fallback chain (gifUrl -> imageUrl -> thumbnailURL -> SF Symbol) lands on the
 * SF Symbol. Backs up prior values, --dry-run, idempotent.
 *
 * Applied to prod 2026-06-13 (via Firestore REST; this script documents and
 * reproduces it). Backup: scripts/backups/library-gif-no-match-260613.json
 *
 * Usage (from backoffice/):
 *   node scripts/clear-library-gif-no-match.cjs --dry-run
 *   node scripts/clear-library-gif-no-match.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const EXERCISES = "exercises";
const MEDIA_FIELDS = ["gifUrl", "imageUrl", "thumbnailURL", "endImageUrl", "mediaURL"];

// Wrong gif + no adequate CSV replacement -> strip media, fall back to SF Symbol.
const TARGETS = [
  { docId: "1363", name: "Child's Pose (Bodyweight)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "1559", name: "Pigeon Pose (Bodyweight)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "2612", name: "Tibialis Raise (Bodyweight)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "3239", name: "Hollow Hold (Bodyweight)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "0405", name: "Military Standing Press (Dumbbell)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "1457", name: "Seated Shoulder Press (Barbell)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "0105", name: "Landmine Press (Barbell)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "1372", name: "Tibialis Raise (Machine)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "1375", name: "Tibialis Raise (Discs)", fields: ["gifUrl", "thumbnailURL"] },
  { docId: "1688", name: "Reverse Lunge (Bodyweight)", fields: ["gifUrl", "thumbnailURL"] },
];

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
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

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv();
  initAdmin();
  const db = getFirestore();

  console.log(
    `\nClearing media on ${TARGETS.length} no-replacement exercises${dryRun ? "  [DRY RUN]" : ""}\n`,
  );

  const plan = [];
  for (const t of TARGETS) {
    const ref = db.collection(EXERCISES).doc(t.docId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`  ⚠ doc ${t.docId} (${t.name}) not found — skipping`);
      continue;
    }
    const before = {};
    for (const f of MEDIA_FIELDS) {
      const v = snap.get(f);
      if (typeof v === "string") before[f] = v;
    }
    plan.push({ ...t, before });
  }

  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = process.env.BACKUP_STAMP || "manual";
  const backupPath = path.join(backupDir, `library-gif-no-match-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(plan.map((p) => ({ docid: p.docId, name: p.name, media: p.before })), null, 2),
  );
  console.log(`Backup written: ${backupPath}\n`);

  for (const p of plan) {
    console.log(`  ${p.docId}  ${p.name}  — clearing ${Object.keys(p.before).join(", ") || "(none)"}`);
  }
  console.log();

  if (dryRun) {
    console.log("[DRY RUN] no Firestore writes performed.\n");
    return;
  }

  let written = 0;
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const p of plan.slice(i, i + 400)) {
      const patch = { updatedAt: FieldValue.serverTimestamp() };
      for (const f of Object.keys(p.before)) patch[f] = FieldValue.delete();
      batch.update(db.collection(EXERCISES).doc(p.docId), patch);
      written += 1;
    }
    await batch.commit();
  }
  console.log(`\n✓ Cleared media on ${written} exercises.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
