// fix-standard-library-gif-overrides.mjs
//
// Targeted, IDEMPOTENT corrections for standard-library gifs whose EQUIPMENT
// matches but whose MOVEMENT is wrong — undetectable by
// fix-standard-library-gif-equipment.mjs (which keys on equipment). These are
// found by eyeballing the app; add an entry here as they're reported.
//
// Each OVERRIDES entry maps a Firestore doc id → the CORRECT gif csvId from the
// gif dataset (or `null` to clear the gif → placeholder). The script uploads
// the csvId's local asset to Storage if it's not already there, mints a
// download token, and points BOTH gifUrl and thumbnailURL at it.
//
// Usage (from backoffice/):
//   node scripts/fix-standard-library-gif-overrides.mjs           # dry run
//   node scripts/fix-standard-library-gif-overrides.mjs --apply   # write
//
// REVIEW LOG (docId | exercise | was → now):
//   0872 | Crunch (Bodyweight) | "reverse crunch" (0872) → "crunch floor" (0274)

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// docId → csvId (correct gif) | null (clear to placeholder)
const OVERRIDES = {
  "0872": "0274", // Crunch (Bodyweight): reverse-crunch gif → plain floor crunch
};

const ASSETS_DIR =
  process.env.GC_FITNESS_GIF_ASSETS_DIR ?? "/Users/manu/Desktop/exercises-gifs-main/assets";
const REMOTE_PREFIX = "exercises/library-gifs";
const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function downloadUrl(bucketName, remotePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    remotePath,
  )}?alt=media&token=${token}`;
}

async function main() {
  const env = loadEnv();
  initializeApp({
    credential: cert({
      projectId: env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID,
      clientEmail: env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: Buffer.from(env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY, "base64").toString("utf8"),
    }),
  });
  const db = getFirestore();
  const bucketName =
    env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ?? "gcfitness-3476b.firebasestorage.app";
  const bucket = getStorage().bucket(bucketName);

  const plan = [];
  const backup = [];

  for (const [docId, csvId] of Object.entries(OVERRIDES)) {
    const ref = db.collection("exercises").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      plan.push({ docId, action: "SKIP (doc not found)" });
      continue;
    }
    const x = snap.data();
    backup.push({
      docId,
      name: x.name?.es || x.name?.en || "",
      before: { gifUrl: x.gifUrl ?? null, imageUrl: x.imageUrl ?? null, thumbnailURL: x.thumbnailURL ?? null },
    });

    if (csvId === null) {
      plan.push({ docId, name: x.name?.es, action: "CLEAR → placeholder" });
      if (APPLY) {
        await ref.set(
          { gifUrl: null, imageUrl: null, thumbnailURL: null, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
      continue;
    }

    const remotePath = `${REMOTE_PREFIX}/${csvId}.gif`;
    const file = bucket.file(remotePath);
    let [exists] = await file.exists();
    let token;
    if (exists) {
      const [md] = await file.getMetadata();
      token = (md.metadata?.firebaseStorageDownloadTokens || "").split(",")[0];
    }
    const localPath = `${ASSETS_DIR}/${csvId}.gif`;
    const needUpload = !exists || !token;
    if (needUpload && !existsSync(localPath)) {
      plan.push({ docId, name: x.name?.es, action: `ERROR: local asset missing ${localPath}` });
      continue;
    }
    plan.push({
      docId,
      name: x.name?.es,
      action: `${exists ? "reuse" : "upload"} ${csvId}.gif → gifUrl+thumbnailURL`,
    });

    if (!APPLY) continue;

    if (needUpload) {
      token = randomUUID();
      await bucket.upload(localPath, {
        destination: remotePath,
        metadata: {
          contentType: "image/gif",
          cacheControl: "public, max-age=31536000",
          metadata: { firebaseStorageDownloadTokens: token },
        },
        resumable: false,
      });
    }
    const url = downloadUrl(bucketName, remotePath, token);
    await ref.set(
      { gifUrl: url, thumbnailURL: url, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  console.log(JSON.stringify({ apply: APPLY, plan }, null, 2));

  if (APPLY) {
    if (!existsSync("scripts/backups")) mkdirSync("scripts/backups", { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const p = `scripts/backups/fix-gif-overrides-backup-${stamp}.json`;
    writeFileSync(p, JSON.stringify(backup, null, 2));
    console.log(`Backup written: ${p}`);
  } else {
    console.log("\nDRY RUN — no writes. Re-run with --apply.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
