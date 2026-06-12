import fs from "node:fs";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { STANDARD_LIBRARY_EXERCISES } from "../src/lib/gc-fitness/exercise-standard-library.ts";

const DEFAULT_COLLECTIONS = [
  "exercises",
  "workout_templates",
  "workout_assignments",
  "workout_logs",
] as const;

type CanonicalExercise = (typeof STANDARD_LIBRARY_EXERCISES)[number];
type CanonicalName = CanonicalExercise["name"];

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
  loadEnv();
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

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
  };
}

function exercisePayload(exercise: CanonicalExercise) {
  return {
    id: exercise.exerciseId,
    name: exercise.name,
    bodyParts: exercise.bodyParts,
    muscleGroups: exercise.muscleGroups,
    equipment: exercise.equipment,
    targetMuscles: exercise.targetMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    keywords: exercise.keywords,
    variations: exercise.variations,
    overview: exercise.overview,
    tags: exercise.tags,
    source: "wger",
  };
}

function canonicalNameById() {
  return new Map(
    STANDARD_LIBRARY_EXERCISES.map((exercise) => [exercise.exerciseId, exercise.name] as const),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function rewriteExerciseNames(
  value: unknown,
  byId: Map<string, CanonicalName>,
): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const rewritten = rewriteExerciseNames(item, byId);
      if (rewritten.changed) changed = true;
      return rewritten.value;
    });
    return changed ? { value: next, changed: true } : { value, changed: false };
  }

  if (isPlainObject(value)) {
    const input = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(input)) {
      const rewritten = rewriteExerciseNames(child, byId);
      next[key] = rewritten.value;
      if (rewritten.changed) changed = true;
    }

    const exerciseId = typeof input.exerciseId === "string" ? input.exerciseId : "";
    const canonicalName = exerciseId ? byId.get(exerciseId) : undefined;
    if (canonicalName) {
      const currentName = input.name;
      const currentExerciseName = input.exerciseName;
      if (
        !currentName ||
        JSON.stringify(currentName) !== JSON.stringify(canonicalName)
      ) {
        next.name = canonicalName;
        changed = true;
      }
      if (
        !currentExerciseName ||
        JSON.stringify(currentExerciseName) !== JSON.stringify(canonicalName)
      ) {
        next.exerciseName = canonicalName;
        changed = true;
      }
    }

    return changed ? { value: next, changed: true } : { value, changed: false };
  }

  return { value, changed: false };
}

async function main() {
  initAdmin();
  const { dryRun } = parseArgs();
  const db = getFirestore();
  const canonicalById = canonicalNameById();
  const canonicalByExerciseId = new Map(
    STANDARD_LIBRARY_EXERCISES.map((exercise) => [exercise.exerciseId, exercise] as const),
  );

  const exerciseDocs = await db.collection("exercises").get();
  const collectionDocs = await Promise.all(
    DEFAULT_COLLECTIONS.slice(1).map((collection) => db.collection(collection).get()),
  );

  let exerciseUpdates = 0;
  let snapshotUpdates = 0;

  const exerciseBatchSize = 350;
  for (let i = 0; i < exerciseDocs.docs.length; i += exerciseBatchSize) {
    const batch = db.batch();
    let chunkChanges = 0;
    for (const doc of exerciseDocs.docs.slice(i, i + exerciseBatchSize)) {
      const canonical = canonicalByExerciseId.get(doc.id);
      if (!canonical) continue;
      const patch = exercisePayload(canonical);
      batch.set(doc.ref, patch, { merge: true });
      exerciseUpdates += 1;
      chunkChanges += 1;
    }
    if (chunkChanges > 0 && !dryRun) {
      await batch.commit();
    }
  }

  for (const snap of collectionDocs) {
    const batch = db.batch();
    let pending = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const rewritten = rewriteExerciseNames(data, canonicalById);
      if (!rewritten.changed) continue;
      batch.update(doc.ref, rewritten.value as Record<string, unknown>);
      snapshotUpdates += 1;
      pending += 1;
      if (pending >= 350 && !dryRun) {
        await batch.commit();
        pending = 0;
      }
    }
    if (pending > 0 && !dryRun) {
      await batch.commit();
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        exerciseDocsSeen: exerciseDocs.size,
        exerciseDocsUpdated: exerciseUpdates,
        workoutDocsUpdated: snapshotUpdates,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
