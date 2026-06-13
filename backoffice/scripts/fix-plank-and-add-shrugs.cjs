/**
 * fix-plank-and-add-shrugs.cjs
 *
 * (1) Repoints Plank (Bodyweight) — its gif was a side-plank (CSV 3544 =
 *     "bodyweight incline side plank"). Copies the correct legacy fexd-Plank
 *     front-plank gif into library-gifs/ and repoints the doc.
 * (2) Adds the missing Shrug variations (Dumbbell / Barbell / Smith) with the
 *     CSV gifs (uploaded from the Desktop assets dir) + EN/ES instructions.
 *
 * NOTE: Plank (Swiss Ball) + the Side-Plank gifs are NOT fixed here — the
 * source CSV has no clean swiss-ball / side-plank gif. Left for manual sourcing.
 *
 * Idempotent, --dry-run, Admin SDK (.env.local). Asset/CSV dir:
 *   /Users/manu/Desktop/exercises-gifs-main/
 */

const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const ASSETS = "/Users/manu/Desktop/exercises-gifs-main/assets";
const EXERCISES = "exercises";

const PLANK_DOC = "3544";
const PLANK_SRC = "exercises/fexd-Plank/preview.gif";
const PLANK_DST = "exercises/library-gifs/std-core-plank-front-bodyweight.gif";

const SHRUGS = [
  {
    id: "0406", equipment: "dumbbell",
    name: { en: "Shrug (Dumbbell)", es: "Encogimiento de hombros (Mancuerna)" },
    es: [
      "Parate con los pies separados al ancho de los hombros y sostené una mancuerna en cada mano con las palmas hacia el cuerpo.",
      "Mantené los brazos estirados y dejá colgar las mancuernas a los costados.",
      "Elevá los hombros lo más alto posible, como si quisieras tocarte las orejas con los hombros.",
      "Mantené la contracción un segundo y después bajá los hombros lentamente a la posición inicial.",
      "Repetí las repeticiones deseadas.",
    ],
  },
  {
    id: "0095", equipment: "barbell",
    name: { en: "Shrug (Barbell)", es: "Encogimiento de hombros (Barra)" },
    es: [
      "Parate con los pies separados al ancho de los hombros y sostené una barra adelante con agarre prono.",
      "Mantené los brazos y la espalda rectos durante todo el ejercicio.",
      "Elevá los hombros hacia las orejas lo más alto posible, apretando los trapecios arriba.",
      "Mantené un instante y después bajá los hombros lentamente a la posición inicial.",
      "Repetí las repeticiones deseadas.",
    ],
  },
  {
    id: "0767", equipment: "smith",
    name: { en: "Shrug (Smith)", es: "Encogimiento de hombros (Smith)" },
    es: [
      "Parate con los pies separados al ancho de los hombros y las rodillas levemente flexionadas.",
      "Agarrá la barra del Smith con agarre prono, las manos un poco más anchas que los hombros.",
      "Mantené los brazos estirados y los hombros relajados.",
      "Elevá los hombros hacia las orejas, apretando los trapecios arriba.",
      "Mantené un instante y después bajá los hombros lentamente a la posición inicial.",
      "Repetí las repeticiones deseadas.",
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
function csvInstructions(csvId) {
  const text = fs.readFileSync("/Users/manu/Desktop/exercises-gifs-main/exercises.csv", "utf8");
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (c === "\r") {} else cur += c; } }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const h = rows[0]; const idIdx = h.indexOf("id");
  const ii = h.map((x, i) => (x.startsWith("instructions/") ? i : -1)).filter((i) => i >= 0);
  const r = rows.find((rr) => rr[idIdx] === csvId);
  return r ? ii.map((i) => r[i]).filter((s) => s && s.trim()).map((s) => s.trim()) : [];
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv(); initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log(`\nfix-plank-and-add-shrugs${dryRun ? "  [DRY RUN]" : ""}\n`);

  // (1) Plank (Bodyweight) gif → fexd front-plank.
  const [srcOk] = await bucket.file(PLANK_SRC).exists();
  if (!srcOk) throw new Error(`Missing ${PLANK_SRC}`);
  const [dstOk] = await bucket.file(PLANK_DST).exists();
  if (!dstOk && !dryRun) { await bucket.file(PLANK_SRC).copy(bucket.file(PLANK_DST)); console.log(`Copied front-plank gif → ${PLANK_DST}`); }
  if (!dryRun || dstOk) {
    const url = await getDownloadURL(bucket.file(PLANK_DST));
    if (!dryRun) {
      await db.collection(EXERCISES).doc(PLANK_DOC).update({ gifUrl: url, thumbnailURL: url, updatedAt: FieldValue.serverTimestamp() });
      console.log(`✓ Repointed Plank (Bodyweight) ${PLANK_DOC} gif.`);
    } else console.log(`[DRY RUN] would repoint ${PLANK_DOC} → ${url.slice(0, 80)}…`);
  }

  // (2) Shrugs.
  for (const s of SHRUGS) {
    const en = csvInstructions(s.id);
    if (en.length !== s.es.length) throw new Error(`Step mismatch ${s.id}: en=${en.length} es=${s.es.length}`);
    const local = path.join(ASSETS, `${s.id}.gif`);
    if (!fs.existsSync(local)) throw new Error(`Missing asset ${local}`);
    const dst = `exercises/library-gifs/${s.id}.gif`;
    const [exists] = await bucket.file(dst).exists();
    if (!exists && !dryRun) { await bucket.upload(local, { destination: dst, metadata: { contentType: "image/gif" } }); console.log(`Uploaded ${dst}`); }
    let gifUrl = "(dry-run)";
    if (!dryRun || exists) gifUrl = await getDownloadURL(bucket.file(dst));
    const doc = {
      id: s.id, name: s.name,
      description: { en: "Trap isolation — shrug the shoulders straight up.", es: "Aislamiento de trapecios — encogé los hombros hacia arriba." },
      overview: "Trap isolation — shrug the shoulders straight up.",
      muscleGroups: ["back", "shoulders"], equipment: [s.equipment],
      bodyParts: ["BACK"], targetMuscles: ["Traps"], secondaryMuscles: ["Shoulders"],
      keywords: ["Shrug", "Encogimiento de hombros", "Trapecios", "Traps"],
      variations: ["Shrug"], tags: ["standard-library"], source: "wger", metric: "reps",
      instructions: { en, es: s.es },
      gifUrl, thumbnailURL: gifUrl, imageUrl: null, mediaURL: null,
      ownerId: null, version: 1, deleted: false,
    };
    if (dryRun) { console.log(`[DRY RUN] would create ${s.id} ${s.name.en} (${en.length} steps)`); continue; }
    await db.collection(EXERCISES).doc(s.id).set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    console.log(`✓ Created ${s.id} ${s.name.en}.`);
  }
  console.log("");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
