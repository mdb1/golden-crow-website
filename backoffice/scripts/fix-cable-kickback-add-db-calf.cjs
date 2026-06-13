/**
 * fix-cable-kickback-add-db-calf.cjs
 * (1) "Cable Kickback (Cable)" (doc 0860) is a GLUTE kickback but its gif +
 *     instructions came from CSV 0860 "cable kickback" whose target is TRICEPS.
 *     Repoints the gif to a cable glute kickback (CSV 0228 "cable standing hip
 *     extension", target glutes) and rewrites instructions + muscle groups.
 * (2) Adds Calf Raise (Dumbbell) (CSV 0417 "dumbbell standing calf raise").
 * Idempotent, --dry-run, Admin SDK. Assets: Desktop exercises-gifs-main/assets.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const ASSETS = "/Users/manu/Desktop/exercises-gifs-main/assets";

const GLUTE_KB = {
  en: [
    "Attach an ankle strap to a low cable pulley and secure it around one ankle.",
    "Face the machine and hold the frame for support, with a slight bend in your supporting knee.",
    "Keeping the working leg fairly straight, kick it back and up, squeezing the glute at the top.",
    "Pause briefly, then return under control to the starting position.",
    "Finish the reps, then switch legs.",
  ],
  es: [
    "Enganchá una cinta de tobillo a una polea baja y asegurala alrededor de un tobillo.",
    "Ponete de frente a la máquina y sostené el marco para estabilizarte, con una leve flexión en la rodilla de apoyo.",
    "Manteniendo la pierna que trabaja bastante estirada, llevala hacia atrás y arriba, apretando el glúteo arriba.",
    "Hacé una pausa breve y volvé de forma controlada a la posición inicial.",
    "Terminá las repeticiones y cambiá de pierna.",
  ],
};

const DB_CALF = {
  docId: "std-calves-calf-raise-dumbbell", csvGif: "0417",
  name: { en: "Calf Raise (Dumbbell)", es: "Elevación de talones (Mancuerna)" },
  en: [
    "Stand with your feet shoulder-width apart, holding a dumbbell in each hand.",
    "Raise your heels off the ground as high as possible, using your calves.",
    "Pause for a moment at the top, then slowly lower your heels back down to the starting position.",
    "Repeat for the desired number of repetitions.",
  ],
  es: [
    "Parate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano.",
    "Elevá los talones del piso lo más alto posible, usando los gemelos.",
    "Hacé una pausa arriba y después bajá los talones lentamente a la posición inicial.",
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
async function uploadAndUrl(bucket, csvGif, dst, dryRun) {
  const local = path.join(ASSETS, `${csvGif}.gif`);
  if (!fs.existsSync(local)) throw new Error(`Missing asset ${local}`);
  const [exists] = await bucket.file(dst).exists();
  if (!exists && !dryRun) { await bucket.upload(local, { destination: dst, metadata: { contentType: "image/gif" } }); console.log(`Uploaded ${dst}`); }
  return (!dryRun || exists) ? getDownloadURL(bucket.file(dst)) : "(dry-run)";
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv(); initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log(`\nfix cable kickback + add db calf${dryRun ? "  [DRY RUN]" : ""}\n`);

  // (1) Repoint Cable Kickback (Cable) 0860 → glute kickback gif + fix data.
  const kbUrl = await uploadAndUrl(bucket, "0228", "exercises/library-gifs/std-glutes-cable-kickback.gif", dryRun);
  if (!dryRun) {
    await db.collection("exercises").doc("0860").update({
      gifUrl: kbUrl, thumbnailURL: kbUrl,
      muscleGroups: ["glutes", "legs"], bodyParts: ["GLUTES"], targetMuscles: ["Glutes"], secondaryMuscles: ["Hamstrings"],
      instructions: GLUTE_KB, updatedAt: FieldValue.serverTimestamp(),
    });
    console.log("✓ Fixed Cable Kickback (Cable) 0860 (gif + instructions + muscles).");
  } else console.log(`[DRY RUN] would repoint 0860 → ${kbUrl.slice(0, 70)}…`);

  // (2) Add Calf Raise (Dumbbell).
  if (DB_CALF.en.length !== DB_CALF.es.length) throw new Error("calf step mismatch");
  const calfUrl = await uploadAndUrl(bucket, DB_CALF.csvGif, `exercises/library-gifs/${DB_CALF.docId}.gif`, dryRun);
  const doc = {
    id: DB_CALF.docId, name: DB_CALF.name,
    description: { en: "Standing calf raise loaded with dumbbells.", es: "Elevación de talones de pie con mancuernas." },
    overview: "Standing calf raise loaded with dumbbells.",
    muscleGroups: ["calves", "legs"], equipment: ["dumbbell"],
    bodyParts: ["CALVES"], targetMuscles: ["Calves"], secondaryMuscles: [],
    keywords: ["Calf Raise", "Standing Calf Raise", "Elevación de talones", "Gemelos"],
    variations: ["Standing Calf Raise", "Seated Calf Raise"], tags: ["standard-library"], source: "wger", metric: "reps",
    instructions: { en: DB_CALF.en, es: DB_CALF.es },
    gifUrl: calfUrl, thumbnailURL: calfUrl, imageUrl: null, mediaURL: null,
    ownerId: null, version: 1, deleted: false,
  };
  if (dryRun) { console.log(`[DRY RUN] would create ${DB_CALF.docId}`); return; }
  await db.collection("exercises").doc(DB_CALF.docId).set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log(`✓ Created ${DB_CALF.docId} ${DB_CALF.name.en}.\n`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
