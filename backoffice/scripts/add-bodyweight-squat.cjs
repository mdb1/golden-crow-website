/**
 * add-bodyweight-squat.cjs
 *
 * Adds the missing "Squat (Bodyweight)" standard-library exercise + its gif.
 * The new library shipped with split/Bulgarian/sissy squats but no plain
 * bodyweight (air) squat, and the source ExerciseDB CSV has no clean air-squat
 * gif. We reuse the proven legacy `fexd-Bodyweight_Squat` gif (a real air
 * squat) by COPYING it into the `exercises/library-gifs/` namespace so the new
 * doc is self-contained alongside its siblings, then point the doc at the
 * copied object's permanent download URL.
 *
 * SAFETY: idempotent — re-running copies only if the target is absent and
 * `set`s the same doc. `--dry-run` performs no Storage/Firestore writes.
 * Admin SDK (.env.local).
 *
 * Usage (from backoffice/):
 *   node scripts/add-bodyweight-squat.cjs --dry-run
 *   node scripts/add-bodyweight-squat.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const EXERCISES = "exercises";
const DOC_ID = "std-legs-squat-bodyweight";
const SRC_GIF = "exercises/fexd-Bodyweight_Squat/preview.gif";
const DST_GIF = "exercises/library-gifs/std-legs-squat-bodyweight.gif";

const INSTRUCTIONS = {
  en: [
    "Stand with your feet shoulder-width apart and your toes pointed slightly outward.",
    "Keep your chest up and your core braced, arms extended forward for balance.",
    "Bend your knees and push your hips back, lowering until your thighs are at least parallel to the floor.",
    "Keep your knees tracking over your toes and your heels flat on the ground.",
    "Drive through your heels to stand back up to the starting position.",
    "Repeat for the desired number of repetitions.",
  ],
  es: [
    "Parate con los pies separados al ancho de los hombros y las puntas levemente hacia afuera.",
    "Mantené el pecho erguido y el core firme, con los brazos extendidos al frente para equilibrar.",
    "Flexioná las rodillas y llevá la cadera hacia atrás, bajando hasta que los muslos queden al menos paralelos al piso.",
    "Mantené las rodillas alineadas con las puntas de los pies y los talones apoyados.",
    "Empujá con los talones para volver a la posición inicial.",
    "Repetí las repeticiones deseadas.",
  ],
};

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
    storageBucket:
      process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
      `${projectId}.firebasestorage.app`,
  });
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();

  console.log(`\nAdding ${DOC_ID}${dryRun ? "  [DRY RUN]" : ""}\n`);

  const [srcExists] = await bucket.file(SRC_GIF).exists();
  if (!srcExists) throw new Error(`Source gif missing: ${SRC_GIF}`);

  const [dstExists] = await bucket.file(DST_GIF).exists();
  if (dstExists) {
    console.log(`Gif already copied: ${DST_GIF}`);
  } else if (dryRun) {
    console.log(`[DRY RUN] would copy ${SRC_GIF} → ${DST_GIF}`);
  } else {
    await bucket.file(SRC_GIF).copy(bucket.file(DST_GIF));
    console.log(`Copied gif → ${DST_GIF}`);
  }

  let gifUrl = "(dry-run, not resolved)";
  if (!dryRun || dstExists) {
    gifUrl = await getDownloadURL(bucket.file(DST_GIF));
  }
  console.log(`gifUrl: ${gifUrl}\n`);

  const doc = {
    id: DOC_ID,
    name: { en: "Squat (Bodyweight)", es: "Sentadilla (Peso corporal)" },
    description: {
      en: "Fundamental lower-body movement for quad and glute strength.",
      es: "Movimiento fundamental de tren inferior para fuerza de cuádriceps y glúteos.",
    },
    overview: "Fundamental lower-body movement for quad and glute strength.",
    muscleGroups: ["quadriceps", "glutes", "legs"],
    equipment: ["bodyweight"],
    bodyParts: ["QUADRICEPS"],
    targetMuscles: ["Quadriceps"],
    secondaryMuscles: ["Glutes", "Core"],
    keywords: ["Squat", "Bodyweight Squat", "Air Squat", "Sentadilla", "Sentadilla con peso corporal"],
    variations: ["Split Squat", "Bulgarian Split Squat", "Front Squat"],
    tags: ["standard-library"],
    source: "wger",
    metric: "reps",
    instructions: INSTRUCTIONS,
    gifUrl,
    thumbnailURL: gifUrl,
    imageUrl: null,
    mediaURL: null,
    ownerId: null,
    version: 1,
    deleted: false,
  };

  if (dryRun) {
    console.log("[DRY RUN] would set doc:");
    console.log(JSON.stringify({ ...doc, instructions: `${doc.instructions.en.length} en / ${doc.instructions.es.length} es steps` }, null, 1));
    console.log("\n[DRY RUN] no Firestore writes performed.\n");
    return;
  }

  await db.collection(EXERCISES).doc(DOC_ID).set({
    ...doc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Created exercise ${DOC_ID}.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
