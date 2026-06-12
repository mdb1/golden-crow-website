#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const WGER_BASE = "https://wger.de/api/v2";
const DEFAULT_COUNT = 300;

const MUSCLE_GROUPS = [
  "abs",
  "arms",
  "back",
  "biceps",
  "calves",
  "cardio",
  "chest",
  "core",
  "forearms",
  "glutes",
  "hamstrings",
  "legs",
  "quadriceps",
  "shoulders",
  "triceps",
];

const EQUIPMENT = [
  "barbell",
  "bench",
  "bodyweight",
  "cable",
  "dumbbell",
  "kettlebell",
  "machine",
  "medicine_ball",
  "none",
  "pull_up_bar",
  "discs",
  "resistance_band",
  "rope",
  "smith",
  "swiss_ball",
];

const MUSCLE_NAME_MAP = {
  Quads: "quadriceps",
  Shoulders: "shoulders",
  Glutes: "glutes",
  Abs: "abs",
  Chest: "chest",
  Hamstring: "hamstrings",
  Hamstrings: "hamstrings",
  Back: "back",
  Biceps: "biceps",
  Triceps: "triceps",
  Forearms: "forearms",
  Calves: "calves",
  Lats: "back",
  "Lower back": "back",
  Trapezius: "back",
};

const CATEGORY_MUSCLE_MAP = {
  Abs: "core",
  Arms: "arms",
  Back: "back",
  Calves: "calves",
  Cardio: "cardio",
  Chest: "chest",
  Legs: "legs",
  Shoulders: "shoulders",
};

const EQUIPMENT_MAP = {
  Barbell: "barbell",
  Dumbbell: "dumbbell",
  Cable: "cable",
  "Pull-up bar": "pull_up_bar",
  Bench: "bench",
  Kettlebell: "kettlebell",
  "Swiss Ball": "swiss_ball",
  "SZ-Bar": "barbell",
  "Resistance Band": "resistance_band",
  Bodyweight: "bodyweight",
  "Medicine Ball": "medicine_ball",
  Machine: "machine",
  Rope: "rope",
  Discs: "discs",
  Smith: "smith",
};

const TEMPLATE_SPECS = [
  {
    slug: "full-body-foundation",
    tag: "full-body",
    name: "Full Body Foundation",
    es: "Base de cuerpo completo",
    description: "Balanced beginner-friendly strength session.",
    muscles: ["legs", "chest", "back", "core", "shoulders"],
  },
  {
    slug: "push-strength",
    tag: "push",
    name: "Push Strength",
    es: "Empuje fuerza",
    description: "Chest, shoulders, and triceps emphasis.",
    muscles: ["chest", "shoulders", "triceps", "arms"],
  },
  {
    slug: "pull-strength",
    tag: "pull",
    name: "Pull Strength",
    es: "Tirón fuerza",
    description: "Back and biceps emphasis.",
    muscles: ["back", "biceps", "forearms", "arms"],
  },
  {
    slug: "leg-day",
    tag: "legs",
    name: "Leg Day",
    es: "Día de piernas",
    description: "Lower-body strength and stability.",
    muscles: ["legs", "quadriceps", "hamstrings", "glutes", "calves"],
  },
  {
    slug: "upper-hypertrophy",
    tag: "upper",
    name: "Upper Hypertrophy",
    es: "Hipertrofia superior",
    description: "Moderate-volume upper-body build.",
    muscles: ["chest", "back", "shoulders", "biceps", "triceps"],
  },
  {
    slug: "lower-hypertrophy",
    tag: "lower",
    name: "Lower Hypertrophy",
    es: "Hipertrofia inferior",
    description: "Moderate-volume lower-body build.",
    muscles: ["quadriceps", "hamstrings", "glutes", "legs", "calves"],
  },
  {
    slug: "core-control",
    tag: "custom",
    name: "Core Control",
    es: "Control del core",
    description: "Core stability and trunk control.",
    muscles: ["core", "abs", "back"],
  },
  {
    slug: "conditioning",
    tag: "full-body",
    name: "Conditioning",
    es: "Acondicionamiento",
    description: "Low-complexity conditioning circuit.",
    muscles: ["cardio", "legs", "core", "shoulders"],
  },
  {
    slug: "bodyweight-basics",
    tag: "full-body",
    name: "Bodyweight Basics",
    es: "Básicos con peso corporal",
    description: "No-equipment full-body session.",
    muscles: ["chest", "legs", "core", "back"],
    equipment: "bodyweight",
  },
  {
    slug: "dumbbell-full-body",
    tag: "full-body",
    name: "Dumbbell Full Body",
    es: "Cuerpo completo con mancuernas",
    description: "Simple dumbbell strength session.",
    muscles: ["legs", "chest", "back", "shoulders", "arms"],
    equipment: "dumbbell",
  },
  {
    slug: "posterior-chain",
    tag: "lower",
    name: "Posterior Chain",
    es: "Cadena posterior",
    description: "Glutes, hamstrings, and back focus.",
    muscles: ["glutes", "hamstrings", "back", "legs"],
  },
  {
    slug: "shoulders-arms",
    tag: "upper",
    name: "Shoulders & Arms",
    es: "Hombros y brazos",
    description: "Accessory work for delts and arms.",
    muscles: ["shoulders", "biceps", "triceps", "arms"],
  },
  {
    slug: "chest-back",
    tag: "upper",
    name: "Chest & Back",
    es: "Pecho y espalda",
    description: "Alternating push and pull upper-body work.",
    muscles: ["chest", "back", "shoulders", "arms"],
  },
  {
    slug: "athletic-legs",
    tag: "legs",
    name: "Athletic Legs",
    es: "Piernas atléticas",
    description: "Lower-body strength with unilateral work.",
    muscles: ["legs", "quadriceps", "glutes", "hamstrings"],
  },
  {
    slug: "mobility-reset",
    tag: "custom",
    name: "Mobility Reset",
    es: "Reset de movilidad",
    description: "Light session for movement quality.",
    muscles: ["core", "shoulders", "legs", "back"],
  },
];

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
  const args = process.argv.slice(2);
  const parsed = {
    exerciseCount: DEFAULT_COUNT,
    trainerEmail: undefined,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--exercise-count") {
      parsed.exerciseCount = Number.parseInt(args[++i], 10);
    } else if (arg === "--trainer-email") {
      parsed.trainerEmail = args[++i].toLowerCase();
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(parsed.exerciseCount) || parsed.exerciseCount <= 0) {
    throw new Error("--exercise-count must be a positive integer.");
  }

  return parsed;
}

function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error("Missing GC Fitness Firebase Admin env vars.");
  }

  const existing = getApps()[0];
  if (existing) return existing;

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
    }),
  });
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMuscle(name) {
  const mapped = MUSCLE_NAME_MAP[name];
  if (mapped) return mapped;
  const fallback = String(name ?? "").toLowerCase().trim();
  return MUSCLE_GROUPS.includes(fallback) ? fallback : null;
}

function normalizeEquipment(name) {
  const mapped = EQUIPMENT_MAP[name];
  if (mapped) return mapped;
  const fallback = String(name ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  return EQUIPMENT.includes(fallback) ? fallback : null;
}

function mapExercise(wger) {
  const translation = (wger.translations ?? []).find((t) => t?.name?.trim()) ?? null;
  const nameEn = String(translation?.name ?? `Exercise ${wger.id}`).trim();
  const nameEs = String(translation?.name ?? nameEn).trim();
  const descriptionEn = stripHtml(wger.description_source ?? wger.description ?? "");
  const descriptionEs = stripHtml(translation?.description ?? "") || descriptionEn || nameEs;

  const muscles = new Set();
  for (const item of [...(wger.muscles ?? []), ...(wger.muscles_secondary ?? [])]) {
    const normalized = normalizeMuscle(item.name_en);
    if (normalized) muscles.add(normalized);
  }
  const categoryFallback = CATEGORY_MUSCLE_MAP[wger.category?.name];
  if (muscles.size === 0 && categoryFallback) muscles.add(categoryFallback);

  const equipment = new Set();
  for (const item of wger.equipment ?? []) {
    const normalized = normalizeEquipment(item.name);
    if (normalized) equipment.add(normalized);
  }
  if (equipment.size === 0) equipment.add("bodyweight");

  const firstVideo = wger.videos?.[0]?.video ?? null;
  const mainImage = wger.images?.find((img) => img.is_main)?.image ?? wger.images?.[0]?.image ?? null;
  const now = new Date().toISOString();

  return {
    id: `wger-${wger.uuid}`,
    name: { en: nameEn, es: nameEs },
    description: {
      en: descriptionEn || nameEn,
      es: descriptionEs || nameEs,
    },
    muscleGroups: [...muscles].sort(),
    equipment: [...equipment].sort(),
    mediaURL: null,
    thumbnailURL: null,
    source: "wger",
    ownerId: null,
    deleted: false,
    createdAt: now,
    updatedAt: now,
    version: 1,
    license: {
      spdx: String(wger.license?.short_name ?? "").includes("3")
        ? "CC-BY-SA-3.0"
        : "CC-BY-SA-4.0",
      author: wger.license_author ?? "",
      sourceUrl: wger.license?.url ?? "",
    },
    sourceMedia: {
      wgerId: wger.id,
      imageUrl: mainImage,
      videoUrl: firstVideo,
    },
  };
}

async function fetchWgerExercises() {
  let url = `${WGER_BASE}/exerciseinfo/?limit=100`;
  const records = [];

  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`wger fetch failed: ${response.status} ${response.statusText}`);
    }
    const page = await response.json();
    records.push(...page.results);
    url = page.next;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return records;
}

function selectExercises(records, count) {
  const curated = records.filter((record) =>
    (record.translations ?? []).some((translation) => String(translation?.name ?? "").trim()),
  );

  curated.sort((a, b) => {
    const mediaScore = (item) =>
      (item.videos?.length ? 3 : 0) + (item.images?.length ? 2 : 0);
    return mediaScore(b) - mediaScore(a) || a.id - b.id;
  });

  return curated.slice(0, count);
}

async function commitInChunks(db, writes, dryRun) {
  if (dryRun) return;

  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + 450)) {
      batch.set(write.ref, write.data, { merge: true });
    }
    await batch.commit();
  }
}

function buildExerciseIndex(exercises) {
  return exercises.map((exercise) => ({
    id: exercise.id,
    name: exercise.name.en.toLowerCase(),
    muscleGroups: exercise.muscleGroups,
    equipment: exercise.equipment,
  }));
}

function pickExercises(index, spec) {
  const picked = [];
  const used = new Set();

  for (const muscle of spec.muscles) {
    let candidate = index.find(
      (exercise) =>
        !used.has(exercise.id) &&
        exercise.muscleGroups.includes(muscle) &&
        (!spec.equipment || exercise.equipment.includes(spec.equipment)),
    );
    if (!candidate) {
      candidate = index.find(
        (exercise) => !used.has(exercise.id) && exercise.muscleGroups.includes(muscle),
      );
    }
    if (!candidate) {
      candidate = index.find((exercise) => !used.has(exercise.id));
    }
    if (candidate) {
      used.add(candidate.id);
      picked.push(candidate);
    }
  }

  return picked.slice(0, 6).map((exercise, order) => ({
    exerciseId: exercise.id,
    sets: order < 2 ? 4 : 3,
    reps: spec.tag === "custom" && spec.slug.includes("mobility") ? 8 : order < 2 ? 10 : 12,
    rest_seconds: spec.tag === "custom" ? 45 : 75,
    notes: order === 0 ? "Keep 1-2 reps in reserve." : "",
    order,
  }));
}

async function main() {
  loadEnv();
  const args = parseArgs();
  const app = initAdmin();
  const db = getFirestore(app);
  const auth = getAuth(app);

  const fallbackTrainerEmail = (process.env.GC_FITNESS_TEAM_ALLOWLIST ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .find(Boolean);
  const trainerEmail = args.trainerEmail ?? fallbackTrainerEmail;
  if (!trainerEmail) throw new Error("Missing --trainer-email or GC_FITNESS_TEAM_ALLOWLIST.");

  const trainer = await auth.getUserByEmail(trainerEmail);

  process.stdout.write(`Fetching wger exercise library...\n`);
  const records = await fetchWgerExercises();
  const selected = selectExercises(records, args.exerciseCount);
  const exercises = selected.map(mapExercise);
  const withSourceMedia = exercises.filter(
    (exercise) => exercise.sourceMedia.videoUrl || exercise.sourceMedia.imageUrl,
  ).length;

  if (exercises.length < args.exerciseCount) {
    process.stdout.write(
      `Only ${exercises.length} English wger exercises found; seeding all available.\n`,
    );
  }

  const exerciseWrites = exercises.map((exercise) => ({
    ref: db.collection("exercises").doc(exercise.id),
    data: exercise,
  }));

  const exerciseIndex = buildExerciseIndex(exercises);
  const templateWrites = TEMPLATE_SPECS.map((spec) => {
    const id = `tpl-${trainer.uid}-seed-${spec.slug}`;
    return {
      ref: db.collection("workout_templates").doc(id),
      data: {
        id,
        trainerId: trainer.uid,
        name: { en: spec.name, es: spec.es },
        description: { en: spec.description, es: spec.es },
        tag: spec.tag,
        exercises: pickExercises(exerciseIndex, spec),
        version: 1,
        deleted: false,
        seedSource: "gc-fitness-library-v1",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  });

  await commitInChunks(db, exerciseWrites, args.dryRun);
  await commitInChunks(db, templateWrites, args.dryRun);

  process.stdout.write(
    `${args.dryRun ? "Would seed" : "Seeded"} ${exerciseWrites.length} exercises ` +
      `(${withSourceMedia} with upstream image/video reference) and ${templateWrites.length} workout templates ` +
      `for ${trainerEmail}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
