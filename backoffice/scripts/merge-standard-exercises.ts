import fs from "node:fs";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { STANDARD_LIBRARY_EXERCISES, STANDARD_LIBRARY_TAG } from "../src/lib/gc-fitness/exercise-standard-library.ts";

const DEFAULT_CSV_PATH = "/Users/manu/Desktop/exercises-gifs-main/exercises.csv";
const DEFAULT_ASSETS_DIR = "/Users/manu/Desktop/exercises-gifs-main/assets";
const DEFAULT_BUCKET = "gcfitness-3476b.firebasestorage.app";
const COLLECTION = "exercises";
const REMOTE_PREFIX = "exercises/library-gifs";

type CsvRow = {
  bodyPart: string;
  equipment: string;
  id: string;
  name: string;
  target: string;
  secondaryMuscles: string[];
};

const EQUIPMENT_MAP: Record<string, string> = {
  barbell: "barbell",
  bench: "bench",
  "body weight": "bodyweight",
  cable: "cable",
  dumbbell: "dumbbell",
  kettlebell: "kettlebell",
  "leverage machine": "machine",
  "smith machine": "smith",
  "olympic barbell": "barbell",
  "ez barbell": "barbell",
  "resistance band": "resistance_band",
  band: "resistance_band",
  "medicine ball": "medicine_ball",
  rope: "rope",
  "stability ball": "swiss_ball",
  weighted: "discs",
  assisted: "machine",
  "trap bar": "barbell",
  bodyweight: "bodyweight",
};

const BODY_MAP: Record<string, string[]> = {
  CHEST: ["chest"],
  BACK: ["back"],
  SHOULDERS: ["shoulders"],
  LEGS: ["upper legs", "lower legs"],
  GLUTES: ["upper legs"],
  HAMSTRINGS: ["upper legs"],
  QUADRICEPS: ["upper legs"],
  BICEPS: ["upper arms"],
  TRICEPS: ["upper arms"],
  FOREARMS: ["lower arms", "upper arms"],
  ABS: ["waist"],
  CORE: ["waist"],
  CALVES: ["lower legs"],
  FULL_BODY: ["cardio", "waist", "upper legs", "back", "chest", "shoulders"],
  CARDIO: ["cardio"],
  FLEXIBILITY: ["waist", "upper legs", "lower legs", "back", "chest", "shoulders"],
  ARMS: ["upper arms"],
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
    storageBucket: DEFAULT_BUCKET,
  });
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    csvPath: readArg("--csv", DEFAULT_CSV_PATH),
    assetsDir: readArg("--assets", DEFAULT_ASSETS_DIR),
  };
}

function readArg(flag: string, fallback: string): string {
  const args = process.argv.slice(2);
  const idx = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  if (hit.includes("=")) return hit.split("=", 2)[1] ?? fallback;
  return args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : fallback;
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

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\ufeff/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift()?.split(",") ?? [];
  const rows: CsvRow[] = [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    while (out.length < headers.length) out.push("");
    return out;
  };

  for (const line of lines) {
    const values = parseLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])) as Record<
      string,
      string
    >;
    rows.push({
      bodyPart: row.bodyPart,
      equipment: row.equipment,
      id: row.id,
      name: row.name,
      target: row.target,
      secondaryMuscles: Object.entries(row)
        .filter(([key, value]) => key.startsWith("secondaryMuscles/") && value)
        .map(([, value]) => value),
    });
  }

  return rows;
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

function equipmentMatch(exercise: (typeof STANDARD_LIBRARY_EXERCISES)[number], row: CsvRow): boolean {
  const mapped = EQUIPMENT_MAP[row.equipment.trim().toLowerCase()];
  return mapped ? exercise.equipment.includes(mapped as (typeof exercise.equipment)[number]) : false;
}

function bodyMatch(exercise: (typeof STANDARD_LIBRARY_EXERCISES)[number], row: CsvRow): boolean {
  return BODY_MAP[exercise.bodyParts[0] ?? ""].includes(row.bodyPart);
}

function scoreExercise(
  exercise: (typeof STANDARD_LIBRARY_EXERCISES)[number],
  row: CsvRow,
): number {
  const rowName = normalize(row.name);
  const rowTokens = tokens(row.name);
  let best = 0;

  for (const term of candidateTerms(exercise)) {
    const normTerm = normalize(term);
    if (!normTerm) continue;
    const termTokens = tokens(term);
    if (termTokens.size === 0) continue;
    if (normTerm === rowName) {
      best = Math.max(best, 1.4);
      continue;
    }
    const overlap = [...termTokens].filter((token) => rowTokens.has(token)).length;
    const recall = overlap / termTokens.size;
    const precision = overlap / rowTokens.size;
    const contains =
      rowName.includes(normTerm) || normTerm.includes(rowName) ? 1 : 0;
    best = Math.max(best, 0.7 * recall + 0.2 * precision + 0.1 * contains);
  }

  if (equipmentMatch(exercise, row)) best += 0.2;
  if (bodyMatch(exercise, row)) best += 0.1;
  return best;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function assetUrl(id: string): string {
  return `gs://${DEFAULT_BUCKET}/${REMOTE_PREFIX}/${id}.gif`;
}

type StorageBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

async function uploadGifIfPresent(bucket: StorageBucket, assetsDir: string, id: string) {
  const local = path.join(assetsDir, `${id}.gif`);
  if (!fs.existsSync(local)) return false;
  await bucket.file(`${REMOTE_PREFIX}/${id}.gif`).save(fs.readFileSync(local), {
    contentType: "image/gif",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return true;
}

async function main() {
  loadEnv();
  initAdmin();
  const { dryRun, csvPath, assetsDir } = parseArgs();
  const db = getFirestore();
  const bucket = getStorage().bucket(DEFAULT_BUCKET);
  const rows = parseCsv(csvPath);

  const rankedRowsByExercise = STANDARD_LIBRARY_EXERCISES.map((exercise) => {
    const ranked = rows
      .map((row) => ({ row, score: scoreExercise(exercise, row) }))
      .sort((a, b) => b.score - a.score);
    return { exercise, ranked };
  });
  const usedRowIds = new Set<string>();
  const updates: Array<{
    id: string;
    stdDocId: string;
    payload: Record<string, unknown>;
    deleteStdDoc: boolean;
  }> = [];
  const failures: string[] = [];

  for (const { exercise, ranked } of rankedRowsByExercise) {
    const match = ranked.find(({ row, score }) => score >= 0.72 && !usedRowIds.has(row.id));
    const row = match?.row ?? null;
    if (row) usedRowIds.add(row.id);
    const targetId = row?.id ?? exercise.exerciseId;
    const gifPath = path.join(assetsDir, `${targetId}.gif`);
    const hasGif = fs.existsSync(gifPath);
    if (!dryRun && hasGif) {
      await uploadGifIfPresent(bucket, assetsDir, targetId);
    }

    updates.push({
      id: targetId,
      stdDocId: exercise.exerciseId,
      payload: {
        id: targetId,
        name: exercise.name,
        description: { en: exercise.overview, es: exercise.overview },
        bodyParts: exercise.bodyParts,
        muscleGroups: exercise.muscleGroups,
        equipment: exercise.equipment,
        targetMuscles: exercise.targetMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        keywords: uniq([
          ...exercise.keywords,
          ...(row
            ? [row.name, baseName(row.name), row.target, ...row.secondaryMuscles]
            : []),
        ]),
        tags: [STANDARD_LIBRARY_TAG],
        variations: exercise.variations,
        overview: exercise.overview,
        source: "wger",
        ownerId: null,
        version: 1,
        metric: "reps",
        deleted: false,
        deletedAt: FieldValue.delete(),
        deletedReason: FieldValue.delete(),
        mergedInto: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        gifUrl: hasGif ? assetUrl(targetId) : null,
        imageUrl: null,
        thumbnailURL: hasGif ? assetUrl(targetId) : null,
        mediaURL: null,
      },
      deleteStdDoc: Boolean(row),
    });
    if (!row) {
      failures.push(`${exercise.name.en} -> no confident CSV match`);
    }
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          matched: updates.length,
          unmatched: failures.length,
          failures,
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const group of chunk(updates, 250)) {
    const batch = db.batch();
    for (const update of group) {
      batch.set(db.collection(COLLECTION).doc(update.id), update.payload, { merge: true });
    }
    await batch.commit();
  }

  const stdDocIds = updates
    .filter((update) => update.deleteStdDoc)
    .map((update) => update.stdDocId);
  for (const group of chunk(stdDocIds, 250)) {
    const batch = db.batch();
    for (const id of group) {
      batch.delete(db.collection(COLLECTION).doc(id));
    }
    await batch.commit();
  }

  console.log(
    JSON.stringify(
      {
        updated: updates.length,
        deletedStdDocs: stdDocIds.length,
        unmatched: failures.length,
        failures,
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
