/**
 * add-hip-thrust-bench-exercise.cjs — issue #411: add the "Hip Thrust with the
 * back supported on a bench/box" (Hip Thrust con espalda en cajón) to the
 * standard exercise library.
 *
 * Standard-library convention (see add-abductor-exercises.cjs): std-* doc id to
 * avoid colliding with the prod 4-digit CSV-merged ids, source "wger",
 * ownerId null, tags ["standard-library"]. Idempotent, --dry-run, Admin SDK.
 *
 * GIF is OPTIONAL. Drop a ping-pong preview at
 *   /Users/<you>/Desktop/exercises-gifs-main/assets/<docId>.gif
 * (i.e. `std-glutes-hip-thrust-bench.gif`) and re-run to attach it; otherwise
 * the exercise ships with no media and the apps fall back to an SF Symbol keyed
 * to its primary muscle group (glutes) — a documented bootstrap fallback.
 *
 * Run:
 *   node scripts/add-hip-thrust-bench-exercise.cjs --dry-run   # preview
 *   node scripts/add-hip-thrust-bench-exercise.cjs             # write
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const ASSETS = path.join(os.homedir(), "Desktop", "exercises-gifs-main", "assets");

const ITEMS = [
  {
    docId: "std-glutes-hip-thrust-bench",
    equipment: "barbell",
    name: {
      en: "Hip Thrust (Bench-Supported)",
      es: "Hip Thrust (espalda en banco)",
    },
    description: {
      en: "Barbell hip thrust with the upper back supported on a bench or box, driving the hips to full extension to load the glutes through a large range of motion.",
      es: "Hip thrust con barra apoyando la parte alta de la espalda en un banco o cajón, llevando la cadera a la extensión completa para trabajar los glúteos en un rango amplio.",
    },
    muscleGroups: ["glutes", "hamstrings", "legs"],
    targetMuscles: ["Glutes"],
    secondaryMuscles: ["Hamstrings", "Quadriceps"],
    keywords: [
      "Hip Thrust", "Bench Hip Thrust", "Empuje de cadera",
      "Espalda en banco", "Espalda en cajón", "Glúteos", "Glutes",
    ],
    en: [
      "Sit on the floor with your upper back (shoulder blades) resting against the edge of a sturdy bench or box.",
      "Roll a loaded barbell over your hips and use a pad or towel to protect your hip bones.",
      "Plant your feet flat, shoulder-width apart, with your knees bent about 90 degrees.",
      "Brace your core, tuck your chin, and drive through your heels to lift your hips until your torso is parallel to the floor.",
      "Squeeze your glutes hard at the top and hold for a second.",
      "Lower your hips under control toward the floor without fully resting, then repeat.",
    ],
    es: [
      "Sentate en el piso con la parte alta de la espalda (omóplatos) apoyada contra el borde de un banco o cajón firme.",
      "Colocá una barra cargada sobre la cadera y usá una colchoneta o toalla para proteger los huesos de la cadera.",
      "Apoyá bien los pies, al ancho de los hombros, con las rodillas flexionadas a unos 90 grados.",
      "Activá el core, llevá el mentón hacia el pecho y empujá con los talones para elevar la cadera hasta que el torso quede paralelo al piso.",
      "Apretá fuerte los glúteos arriba y mantené la posición un segundo.",
      "Bajá la cadera de forma controlada hacia el piso sin apoyarte del todo, y repetí.",
    ],
  },
];

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

/** Uploads (once) an optional per-docId gif and returns its download URL, or
 * null when no local asset exists — media is optional (SF Symbol fallback). */
async function resolveOptionalGifUrl(bucket, docId, dryRun) {
  const local = path.join(ASSETS, `${docId}.gif`);
  if (!fs.existsSync(local)) return null;
  const dst = `exercises/library-gifs/${docId}.gif`;
  const [exists] = await bucket.file(dst).exists();
  if (!exists && !dryRun) {
    await bucket.upload(local, { destination: dst, metadata: { contentType: "image/gif" } });
    console.log(`  uploaded ${dst}`);
  }
  if (dryRun && !exists) return "(dry-run: would upload gif)";
  return getDownloadURL(bucket.file(dst));
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv(); initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log(`\nAdding ${ITEMS.length} exercise(s)${dryRun ? "  [DRY RUN]" : ""}\n`);
  for (const it of ITEMS) {
    if (it.en.length !== it.es.length) throw new Error(`Step count mismatch for ${it.docId}`);
    const gifUrl = await resolveOptionalGifUrl(bucket, it.docId, dryRun);
    const doc = {
      id: it.docId,
      name: it.name,
      description: it.description,
      overview: it.description.en,
      muscleGroups: it.muscleGroups,
      equipment: [it.equipment],
      bodyParts: ["GLUTES"],
      targetMuscles: it.targetMuscles,
      secondaryMuscles: it.secondaryMuscles,
      keywords: it.keywords,
      variations: ["Hip Thrust"],
      tags: ["standard-library"],
      source: "wger",
      metric: "reps",
      instructions: { en: it.en, es: it.es },
      gifUrl,
      thumbnailURL: gifUrl,
      imageUrl: null,
      mediaURL: null,
      ownerId: null,
      version: 1,
      deleted: false,
    };
    if (dryRun) {
      console.log(`[DRY RUN] would create ${it.docId} — ${it.name.en} (gif: ${gifUrl ?? "none → SF Symbol"})`);
      continue;
    }
    await db.collection("exercises").doc(it.docId).set({
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✓ Created ${it.docId} — ${it.name.en} (gif: ${gifUrl ?? "none → SF Symbol"}).`);
  }
  console.log("");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
