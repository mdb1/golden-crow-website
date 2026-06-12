import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

import { STANDARD_LIBRARY_EXERCISES, STANDARD_LIBRARY_TAG } from "../src/lib/gc-fitness/exercise-standard-library.ts";

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

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return { dryRun: args.has("--dry-run") };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function baseName(exerciseName: string): string {
  return exerciseName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function candidateTerms(exercise: (typeof STANDARD_LIBRARY_EXERCISES)[number]): string[] {
  return [
    exercise.name.en,
    baseName(exercise.name.en),
    exercise.name.es,
    exercise.overview,
    ...exercise.keywords,
    ...exercise.variations,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function scoreExercise(
  exercise: (typeof STANDARD_LIBRARY_EXERCISES)[number],
  row: Record<string, unknown>,
): number {
  const name = row.name as { en?: unknown; es?: unknown } | undefined;
  const rowName =
    typeof name?.en === "string"
      ? name.en
      : typeof name?.es === "string"
        ? name.es
        : "";
  const rowTokens = tokens(rowName);
  let best = 0;

  const rowEquipment = Array.isArray(row.equipment)
    ? (row.equipment as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const rowMuscles = Array.isArray(row.muscleGroups)
    ? (row.muscleGroups as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  for (const term of candidateTerms(exercise)) {
    const normTerm = normalize(term);
    if (!normTerm) continue;
    const termTokens = tokens(term);
    if (termTokens.size === 0) continue;
    if (normTerm === normalize(rowName)) {
      best = Math.max(best, 1.4);
      continue;
    }
    const overlap = [...termTokens].filter((token) => rowTokens.has(token)).length;
    const recall = overlap / termTokens.size;
    const precision = rowTokens.size > 0 ? overlap / rowTokens.size : 0;
    const contains =
      rowName.length > 0 && (rowName.includes(normTerm) || normTerm.includes(rowName))
        ? 1
        : 0;
    best = Math.max(best, 0.7 * recall + 0.2 * precision + 0.1 * contains);
  }

  if (rowEquipment.some((item) => exercise.equipment.includes(item as never))) best += 0.2;
  if (rowMuscles.some((item) => exercise.muscleGroups.includes(item as never))) best += 0.1;
  return best;
}

function legacyRowToKeywords(row: Record<string, unknown>): string[] {
  const name = row.name as { en?: unknown; es?: unknown } | undefined;
  const description = row.description as { en?: unknown; es?: unknown } | undefined;
  return uniq([
    typeof name?.en === "string" ? name.en : "",
    typeof name?.es === "string" ? name.es : "",
    typeof description?.en === "string" ? description.en : "",
    typeof description?.es === "string" ? description.es : "",
    ...(Array.isArray(row.keywords)
      ? (row.keywords as unknown[]).filter((v): v is string => typeof v === "string")
      : []),
  ]);
}

async function main() {
  const { dryRun } = parseArgs();
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();
  const canonicalIds = new Set(
    STANDARD_LIBRARY_EXERCISES.map((exercise) => exercise.exerciseId),
  );
  const legacyRows = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .filter((row) => {
      const source = row.data.source;
      const tags = Array.isArray(row.data.tags)
        ? (row.data.tags as unknown[]).filter((v): v is string => typeof v === "string")
        : [];
      return (
        row.data.deleted !== true &&
        !tags.includes(STANDARD_LIBRARY_TAG) &&
        (source === "wger" || source === "free-exercise-db")
      );
    });

  const updates: Array<{ id: string; mergedInto: string; name: string }> = [];
  for (const row of legacyRows) {
    let bestExercise: (typeof STANDARD_LIBRARY_EXERCISES)[number] | null = null;
    let bestScore = 0;
    for (const exercise of STANDARD_LIBRARY_EXERCISES) {
      const score = scoreExercise(exercise, row.data);
      if (score > bestScore) {
        bestScore = score;
        bestExercise = exercise;
      }
    }
    if (!bestExercise || bestScore < 0.78) continue;
    if (!canonicalIds.has(bestExercise.exerciseId)) continue;
    updates.push({
      id: row.id,
      mergedInto: bestExercise.exerciseId,
      name:
        (row.data.name as { en?: string; es?: string } | undefined)?.en ??
        row.id,
    });
  }

  console.log(
    JSON.stringify(
      {
        candidates: updates.length,
        dryRun,
        sample: updates.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const batchSize = 250;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    for (const update of updates.slice(i, i + batchSize)) {
      batch.set(
        db.collection(COLLECTION).doc(update.id),
        {
          mergedInto: update.mergedInto,
          deleted: true,
          deletedReason: "superseded-by-standard-library",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
