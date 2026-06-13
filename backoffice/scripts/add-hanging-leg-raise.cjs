/**
 * add-hanging-leg-raise.cjs — adds the missing Hanging Leg Raise (Bodyweight).
 * Uses the ExerciseDB CSV 0472 "hanging leg raise" gif (uploaded from the
 * Desktop assets dir; doc id 0472 is already taken by Reverse Crunch, so this
 * uses a std-* id + its own library-gifs object). EN (CSV) + ES instructions.
 * Idempotent, --dry-run, Admin SDK.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const DOC_ID = "std-abs-hanging-leg-raise-bodyweight";
const ASSET = "/Users/manu/Desktop/exercises-gifs-main/assets/0472.gif";
const DST = "exercises/library-gifs/std-abs-hanging-leg-raise-bodyweight.gif";

const INSTRUCTIONS = {
  en: [
    "Hang from a pull-up bar with your arms fully extended and your palms facing away from you.",
    "Engage your core and lift your legs up in front of you, keeping them straight.",
    "Continue lifting until your legs are parallel to the ground or as high as you can comfortably go.",
    "Pause for a moment at the top, then slowly lower your legs back down to the starting position.",
    "Repeat for the desired number of repetitions.",
  ],
  es: [
    "Colgate de una barra de dominadas con los brazos completamente extendidos y las palmas hacia adelante.",
    "Activá el core y elevá las piernas al frente, manteniéndolas estiradas.",
    "Seguí subiendo hasta que las piernas queden paralelas al piso o tan alto como puedas con comodidad.",
    "Hacé una pausa arriba y después bajá las piernas lentamente a la posición inicial.",
    "Repetí las repeticiones deseadas.",
  ],
};

function loadEnv() {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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
  loadEnv(); initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log(`\nAdding ${DOC_ID}${dryRun ? "  [DRY RUN]" : ""}\n`);
  if (!fs.existsSync(ASSET)) throw new Error(`Missing asset ${ASSET}`);
  const [exists] = await bucket.file(DST).exists();
  if (!exists && !dryRun) { await bucket.upload(ASSET, { destination: DST, metadata: { contentType: "image/gif" } }); console.log(`Uploaded ${DST}`); }
  let gifUrl = "(dry-run)";
  if (!dryRun || exists) gifUrl = await getDownloadURL(bucket.file(DST));
  console.log(`gifUrl: ${gifUrl}\n`);
  const doc = {
    id: DOC_ID,
    name: { en: "Hanging Leg Raise (Bodyweight)", es: "Elevación de piernas colgado (Peso corporal)" },
    description: { en: "Hanging core movement for lower-ab strength.", es: "Movimiento de core colgado para fuerza del abdomen inferior." },
    overview: "Hanging core movement for lower-ab strength.",
    muscleGroups: ["abs", "core"], equipment: ["pull_up_bar"],
    bodyParts: ["ABS"], targetMuscles: ["Abs"], secondaryMuscles: ["Core", "Forearms"],
    keywords: ["Hanging Leg Raise", "Leg Raise", "Elevación de piernas colgado", "Abdominales colgado"],
    variations: ["Leg Raise", "Reverse Crunch", "Hanging Knee Raise"],
    tags: ["standard-library"], source: "wger", metric: "reps",
    instructions: INSTRUCTIONS,
    gifUrl, thumbnailURL: gifUrl, imageUrl: null, mediaURL: null,
    ownerId: null, version: 1, deleted: false,
  };
  if (dryRun) { console.log("[DRY RUN] would create", DOC_ID); return; }
  await db.collection("exercises").doc(DOC_ID).set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log(`✓ Created ${DOC_ID}.\n`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
