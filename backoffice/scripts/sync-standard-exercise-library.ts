import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";

import { STANDARD_LIBRARY_EXERCISES } from "../src/lib/gc-fitness/exercise-standard-library.ts";

const COLLECTION = "exercises";

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
  initAdmin();
  const db = getFirestore();
  const batchSize = 400;
  const chunks = [];
  for (let i = 0; i < STANDARD_LIBRARY_EXERCISES.length; i += batchSize) {
    chunks.push(STANDARD_LIBRARY_EXERCISES.slice(i, i + batchSize));
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
