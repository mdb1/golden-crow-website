import fs from "node:fs";
import path from "node:path";

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";

import { STANDARD_LIBRARY_EXERCISES } from "../src/lib/gc-fitness/exercise-standard-library.ts";

const COLLECTION = "exercises";

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

async function main() {
  loadEnv();
  initAdmin();
  const db = getFirestore();

  // `--only=id1,id2` restricts the sync to specific exerciseIds. Adding a single
  // new exercise should NOT re-write all ~260 docs (that bumps every timestamp and
  // resets `deleted:false`, which could resurrect a soft-deleted dup). Without the
  // flag, behaves as before (full sync).
  const onlyArg = process.argv
    .slice(2)
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length);
  const onlyIds = onlyArg
    ? new Set(onlyArg.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const exercises = onlyIds
    ? STANDARD_LIBRARY_EXERCISES.filter((e) => onlyIds.has(e.exerciseId))
    : STANDARD_LIBRARY_EXERCISES;
  if (onlyIds && exercises.length !== onlyIds.size) {
    const found = new Set(exercises.map((e) => e.exerciseId));
    const missing = [...onlyIds].filter((id) => !found.has(id));
    throw new Error(`--only ids not in library: ${missing.join(", ")}`);
  }

  const batchSize = 400;
  const chunks = [];
  for (let i = 0; i < exercises.length; i += batchSize) {
    chunks.push(exercises.slice(i, i + batchSize));
  }

  let written = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const exercise of chunk) {
      const ref = db.collection(COLLECTION).doc(exercise.exerciseId);
      batch.set(
        ref,
        {
          id: exercise.exerciseId,
          name: exercise.name,
          description: {
            en: exercise.overview,
            es: exercise.overview,
          },
          bodyParts: exercise.bodyParts,
          muscleGroups: exercise.muscleGroups,
          equipment: exercise.equipment,
          targetMuscles: exercise.targetMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
          keywords: exercise.keywords,
          tags: exercise.tags,
          variations: exercise.variations,
          overview: exercise.overview,
          source: "wger",
          ownerId: null,
          version: 1,
          metric: exercise.metric,
          deleted: false,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          mediaURL: null,
          thumbnailURL: null,
        },
        { merge: true },
      );
      written += 1;
    }
    await batch.commit();
  }

  console.log(`Synced ${written} standard exercises.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
