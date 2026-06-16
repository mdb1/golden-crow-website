/**
 * Assign exercise gifs that DON'T live in the Desktop CSV/assets dataset used by
 * `sync-standard-exercise-gifs.ts`. Some standard-library exercises (e.g. Hollow
 * Hold) have no clip in the free-exercise-db CSV, so the fuzzy matcher there would
 * pick an unrelated movement. For those we host a hand-picked external gif:
 * download it, upload to the SAME public-read `exercises/library-gifs/` namespace,
 * and point the exercise doc's `gifUrl` at the `gs://` path (the apps' media
 * resolver turns that into a tokenless download URL — the library-gifs path is
 * public-read, so no `?token=` is baked in and re-uploads don't 403).
 *
 * Keyed by `name.en` so the exercise doc id is resolved from the single source of
 * truth (`STANDARD_LIBRARY_EXERCISES`), exactly like the CSV sync. The matching
 * entry in `sync-standard-exercise-gifs.ts` OVERRIDES is set to `null` so a full
 * gif re-sync never clobbers what we set here.
 *
 *   node --experimental-transform-types scripts/assign-external-gifs.ts [--dry-run]
 *
 * Requires admin creds in `.env.local` (same vars the other sync scripts use).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { STANDARD_LIBRARY_EXERCISES } from "../src/lib/gc-fitness/exercise-standard-library.ts";

const DEFAULT_BUCKET = "gcfitness-3476b.firebasestorage.app";
const COLLECTION = "exercises";
const REMOTE_PREFIX = "exercises/library-gifs";

/**
 * `name.en` → externally hosted gif URL. The remote object is named after the
 * exercise slug so it never collides with the 4-digit CSV ids.
 */
const EXTERNAL_GIFS: Record<string, string> = {
  "Hollow Hold (Bodyweight)":
    "https://fitcron.com/wp-content/uploads/2024/05/12461301-Hollow-Hold_Waist_720.gif",
};

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
  if (getApps().length > 0) return;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase admin credentials in environment.");
  }
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKey, "base64").toString("utf8"),
    }),
  });
}

function getBucketName(): string {
  return (
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ?? DEFAULT_BUCKET
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function downloadToTemp(url: string, slug: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `ext-gif-${slug}.gif`);
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}

async function uploadGif(localPath: string, remotePath: string): Promise<string> {
  const bucket = getStorage().bucket(getBucketName());
  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: {
      contentType: "image/gif",
      cacheControl: "public, max-age=31536000",
    },
    resumable: false,
  });
  return `gs://${getBucketName()}/${remotePath}`;
}

async function main() {
  loadEnv();
  initAdmin();
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const db = getFirestore();

  const results: Array<Record<string, unknown>> = [];

  for (const [nameEn, url] of Object.entries(EXTERNAL_GIFS)) {
    const exercise = STANDARD_LIBRARY_EXERCISES.find((e) => e.name.en === nameEn);
    if (!exercise) {
      results.push({ nameEn, status: "SKIP — no exercise with that name.en" });
      continue;
    }

    const docRef = db.collection(COLLECTION).doc(exercise.exerciseId);
    const snap = await docRef.get();
    if (!snap.exists) {
      results.push({
        nameEn,
        exerciseId: exercise.exerciseId,
        status: "SKIP — doc not seeded in prod (run library sync first)",
      });
      continue;
    }

    const slug = slugify(exercise.exerciseId);
    const remotePath = `${REMOTE_PREFIX}/${slug}.gif`;

    if (dryRun) {
      results.push({
        nameEn,
        exerciseId: exercise.exerciseId,
        currentGifUrl: snap.get("gifUrl") ?? null,
        wouldUpload: url,
        wouldSetGifUrl: `gs://${getBucketName()}/${remotePath}`,
        status: "DRY RUN",
      });
      continue;
    }

    const tmpPath = await downloadToTemp(url, slug);
    const gifUrl = await uploadGif(tmpPath, remotePath);
    fs.rmSync(tmpPath, { force: true });
    await docRef.set(
      { gifUrl, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    results.push({
      nameEn,
      exerciseId: exercise.exerciseId,
      previousGifUrl: snap.get("gifUrl") ?? null,
      gifUrl,
      status: "UPDATED",
    });
  }

  console.log(JSON.stringify({ dryRun, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
