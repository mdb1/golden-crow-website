import fs from "node:fs";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { STANDARD_LIBRARY_EXERCISES } from "../src/lib/gc-fitness/exercise-standard-library.ts";

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
  "weighted": "discs",
  "assisted": "machine",
  "trap bar": "barbell",
  "bodyweight": "bodyweight",
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

const OVERRIDES: Record<string, string | null> = {
  "Bench Press (Machine)": "0577",
  "Incline Bench Press (Machine)": "1299",
  "Decline Bench Press (Machine)": "1300",
  "Chest Fly (Cable)": "0227",
  "Chest Fly (Machine)": "0596",
  "Cable Crossover (Cable)": "0227",
  "Pec Deck Fly (Machine)": "0596",
  "Dip (Machine)": "1451",
  "Pull-Up (Machine)": "0017",
  "Chin-Up (Machine)": "0572",
  "Lat Pulldown (Machine)": "0673",
  "Face Pull (Cable)": "0225",
  "Face Pull (Rope)": "0225",
  "Face Pull (Machine)": "0602",
  "Push Press (Barbell)": "0028",
  "Floor Press (Barbell)": "0065",
  "Floor Press (Dumbbell)": null,
  "Floor Press (Smith)": null,
  "Landmine Press (Barbell)": null,
  "Hip Thrust (Machine)": null,
  "Leg Press (Machine)": "2287",
  "Hack Squat (Machine)": "0743",
  "Back Squat (Machine)": "0770",
  "Front Squat (Machine)": "0770",
  "Military Standing Press (Barbell)": "1456",
  "Military Standing Press (Dumbbell)": "0426",
  "Military Standing Press (Smith)": "0774",
  "Military Standing Press (Machine)": "0587",
  "Seated Shoulder Press (Barbell)": "0091",
  "Seated Shoulder Press (Dumbbell)": "0405",
  "Seated Shoulder Press (Smith)": "0765",
  "Seated Shoulder Press (Machine)": "0603",
  "Front Raise (Discs)": "0834",
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

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
  };
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
  if (bodyMatch(exercise, row)) best += 0.08;
  return best;
}

function resolveCsvRow(
  exercise: (typeof STANDARD_LIBRARY_EXERCISES)[number],
  csvRows: CsvRow[],
): CsvRow | null {
  const override = OVERRIDES[exercise.name.en];
  if (override === null) return null;
  if (typeof override === "string") {
    return csvRows.find((row) => row.id === override) ?? null;
  }

  const exact = csvRows.find((row) => normalize(row.name) === normalize(baseName(exercise.name.en)));
  if (exact) return exact;

  let best: { row: CsvRow; score: number } | null = null;
  for (const row of csvRows) {
    const score = scoreExercise(exercise, row);
    if (!best || score > best.score) best = { row, score };
  }
  if (!best || best.score < 0.9) return null;
  return best.row;
}

function getBucketName(): string {
  return (
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ?? DEFAULT_BUCKET
  );
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
  const { dryRun } = parseArgs();
  const csvPath = process.env.GC_FITNESS_GIF_CSV_PATH ?? DEFAULT_CSV_PATH;
  const assetsDir = process.env.GC_FITNESS_GIF_ASSETS_DIR ?? DEFAULT_ASSETS_DIR;
  const csvRows = parseCsv(csvPath);
  const db = getFirestore();

  const operations: Array<{
    exerciseId: string;
    exerciseName: string;
    csvId: string;
    csvName: string;
    remotePath: string;
  }> = [];

  for (const exercise of STANDARD_LIBRARY_EXERCISES) {
    const row = resolveCsvRow(exercise, csvRows);
    if (!row) continue;
    const localPath = path.join(assetsDir, `${row.id}.gif`);
    if (!fs.existsSync(localPath)) {
      continue;
    }
    operations.push({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name.en,
      csvId: row.id,
      csvName: row.name,
      remotePath: `${REMOTE_PREFIX}/${row.id}.gif`,
    });

    if (dryRun) continue;

    const gifUrl = await uploadGif(localPath, `${REMOTE_PREFIX}/${row.id}.gif`);
    await db
      .collection(COLLECTION)
      .doc(exercise.exerciseId)
      .set(
        {
          gifUrl,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        matched: operations.length,
        sample: operations.slice(0, 40),
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
