/**
 * add-one-arm-dumbbell-row.cjs
 *
 * Adds the missing "One-Arm Row (Dumbbell)" standard-library exercise + its
 * gif. The source ExerciseDB CSV has no clean one-arm dumbbell row, so we
 * reuse the proven legacy `fexd-One-Arm_Dumbbell_Row` gif by COPYING it into
 * `exercises/library-gifs/` so the doc is self-contained, then point at the
 * copied object's permanent download URL. Mirrors add-bodyweight-squat.cjs.
 *
 * Idempotent, --dry-run, Admin SDK (.env.local).
 */

const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const EXERCISES = "exercises";
const DOC_ID = "std-back-one-arm-row-dumbbell";
const SRC_GIF = "exercises/fexd-One-Arm_Dumbbell_Row/preview.gif";
const DST_GIF = "exercises/library-gifs/std-back-one-arm-row-dumbbell.gif";

const INSTRUCTIONS = {
  en: [
    "Place one knee and the same-side hand on a bench, with the other foot on the floor and a dumbbell in the free hand.",
    "Let the dumbbell hang with your arm extended, keeping your back flat and core braced.",
    "Pull the dumbbell up toward your hip, driving the elbow back and squeezing the back at the top.",
    "Lower the dumbbell under control back to the hanging position.",
    "Finish the reps, then switch arms.",
  ],
  es: [
    "Apoyá una rodilla y la mano del mismo lado sobre un banco, con el otro pie en el piso y una mancuerna en la mano libre.",
    "Dejá colgar la mancuerna con el brazo extendido, manteniendo la espalda recta y el core firme.",
    "Tirá de la mancuerna hacia la cadera llevando el codo hacia atrás y apretando la espalda arriba.",
    "Bajá la mancuerna de forma controlada hasta la posición colgada.",
    "Terminá las repeticiones y cambiá de brazo.",
  ],
};

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const pk = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !pk) throw new Error("Missing admin env vars.");
  if (getApps()[0]) return getApps()[0];
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: Buffer.from(pk, "base64").toString("utf8") }),
    storageBucket: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
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
  if (dstExists) console.log(`Gif already copied: ${DST_GIF}`);
  else if (dryRun) console.log(`[DRY RUN] would copy ${SRC_GIF} → ${DST_GIF}`);
  else { await bucket.file(SRC_GIF).copy(bucket.file(DST_GIF)); console.log(`Copied gif → ${DST_GIF}`); }

  let gifUrl = "(dry-run)";
  if (!dryRun || dstExists) gifUrl = await getDownloadURL(bucket.file(DST_GIF));
  console.log(`gifUrl: ${gifUrl}\n`);

  const doc = {
    id: DOC_ID,
    name: { en: "One-Arm Row (Dumbbell)", es: "Remo a una mano (Mancuerna)" },
    description: {
      en: "Unilateral back row for lat and mid-back thickness.",
      es: "Remo unilateral para grosor de dorsales y espalda media.",
    },
    overview: "Unilateral back row for lat and mid-back thickness.",
    muscleGroups: ["back", "biceps", "forearms"],
    equipment: ["dumbbell"],
    bodyParts: ["BACK"],
    targetMuscles: ["Back"],
    secondaryMuscles: ["Biceps", "Forearms"],
    keywords: ["One-Arm Dumbbell Row", "One-Arm Row", "Dumbbell Row", "Remo a una mano con mancuerna", "Remo unilateral"],
    variations: ["Chest-Supported Row", "Barbell Row", "Seated Row"],
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
    console.log("[DRY RUN] would set:", JSON.stringify({ ...doc, instructions: `${doc.instructions.en.length}/${doc.instructions.es.length} steps` }, null, 1));
    return;
  }
  await db.collection(EXERCISES).doc(DOC_ID).set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log(`✓ Created exercise ${DOC_ID}.\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
