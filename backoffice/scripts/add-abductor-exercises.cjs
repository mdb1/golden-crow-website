/**
 * add-abductor-exercises.cjs — adds the missing hip-abductor exercises
 * (Machine / Resistance Band / Bodyweight) with their ExerciseDB CSV gifs
 * (uploaded from the Desktop assets dir) + EN/ES instructions. std-* doc ids
 * to avoid collisions with existing 4-digit docs. Idempotent, --dry-run, Admin.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const ASSETS = "/Users/manu/Desktop/exercises-gifs-main/assets";

const ITEMS = [
  {
    docId: "std-glutes-hip-abduction-machine", csvGif: "0597", equipment: "machine",
    name: { en: "Hip Abduction (Machine)", es: "Abducción de cadera (Máquina)" },
    en: [
      "Adjust the seat height so that your knees are at a 90-degree angle.",
      "Sit on the machine with your back against the backrest and your feet on the footrests.",
      "Place your hands on the side handles for stability.",
      "Engage your abductors and slowly push your legs apart, away from the midline of your body.",
      "Pause for a moment at the end of the movement, then slowly bring your legs back together to the starting position.",
      "Repeat for the desired number of repetitions.",
    ],
    es: [
      "Ajustá la altura del asiento para que las rodillas queden en un ángulo de 90 grados.",
      "Sentate en la máquina con la espalda contra el respaldo y los pies en los apoyos.",
      "Apoyá las manos en los agarres laterales para estabilizarte.",
      "Activá los abductores y empujá las piernas lentamente hacia afuera, alejándolas de la línea media del cuerpo.",
      "Hacé una pausa al final del movimiento y después juntá las piernas lentamente hasta la posición inicial.",
      "Repetí las repeticiones deseadas.",
    ],
  },
  {
    docId: "std-glutes-hip-abduction-resistance-band", csvGif: "3006", equipment: "resistance_band",
    name: { en: "Hip Abduction (Resistance Band)", es: "Abducción de cadera (Banda elástica)" },
    en: [
      "Sit on a chair or bench with your back straight and feet flat on the ground.",
      "Wrap the resistance band around your thighs, just above your knees.",
      "Place your hands on the sides of the chair or bench for support.",
      "Engage your abductors (outer thigh muscles) and slowly push your knees apart, against the resistance of the band.",
      "Pause for a moment at the end of the movement, then slowly bring your knees back together.",
      "Repeat for the desired number of repetitions.",
    ],
    es: [
      "Sentate en una silla o banco con la espalda recta y los pies apoyados en el piso.",
      "Colocá la banda elástica alrededor de los muslos, justo por encima de las rodillas.",
      "Apoyá las manos a los costados de la silla o banco para sostenerte.",
      "Activá los abductores (parte externa del muslo) y abrí las rodillas lentamente contra la resistencia de la banda.",
      "Hacé una pausa al final del movimiento y después juntá las rodillas lentamente.",
      "Repetí las repeticiones deseadas.",
    ],
  },
  {
    docId: "std-glutes-hip-abduction-bodyweight", csvGif: "0710", equipment: "bodyweight",
    name: { en: "Hip Abduction (Bodyweight)", es: "Abducción de cadera (Peso corporal)" },
    en: [
      "Stand with your feet shoulder-width apart and your hands on your hips.",
      "Shift your weight to one leg and lift the opposite leg out to the side, keeping it straight.",
      "Pause for a moment at the top, then slowly lower your leg back down to the starting position.",
      "Repeat on the other side.",
      "Continue alternating sides for the desired number of repetitions.",
    ],
    es: [
      "Parate con los pies separados al ancho de los hombros y las manos en la cadera.",
      "Pasá el peso a una pierna y elevá la otra pierna hacia el costado, manteniéndola estirada.",
      "Hacé una pausa arriba y después bajá la pierna lentamente a la posición inicial.",
      "Repetí del otro lado.",
      "Seguí alternando lados por las repeticiones deseadas.",
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
async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  loadEnv(); initAdmin();
  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log(`\nAdding ${ITEMS.length} abductor exercises${dryRun ? "  [DRY RUN]" : ""}\n`);
  for (const it of ITEMS) {
    if (it.en.length !== it.es.length) throw new Error(`Step mismatch ${it.docId}`);
    const local = path.join(ASSETS, `${it.csvGif}.gif`);
    if (!fs.existsSync(local)) throw new Error(`Missing asset ${local}`);
    const dst = `exercises/library-gifs/${it.docId}.gif`;
    const [exists] = await bucket.file(dst).exists();
    if (!exists && !dryRun) { await bucket.upload(local, { destination: dst, metadata: { contentType: "image/gif" } }); console.log(`Uploaded ${dst}`); }
    let gifUrl = "(dry-run)";
    if (!dryRun || exists) gifUrl = await getDownloadURL(bucket.file(dst));
    const doc = {
      id: it.docId, name: it.name,
      description: { en: "Hip abductor isolation — open the legs against resistance.", es: "Aislamiento de abductores de cadera — abrí las piernas contra resistencia." },
      overview: "Hip abductor isolation — open the legs against resistance.",
      muscleGroups: ["glutes", "legs"], equipment: [it.equipment],
      bodyParts: ["GLUTES"], targetMuscles: ["Abductors"], secondaryMuscles: ["Glutes"],
      keywords: ["Hip Abduction", "Abductor", "Abductors", "Abducción de cadera", "Abductores"],
      variations: ["Hip Abduction"], tags: ["standard-library"], source: "wger", metric: "reps",
      instructions: { en: it.en, es: it.es },
      gifUrl, thumbnailURL: gifUrl, imageUrl: null, mediaURL: null,
      ownerId: null, version: 1, deleted: false,
    };
    if (dryRun) { console.log(`[DRY RUN] would create ${it.docId} ${it.name.en}`); continue; }
    await db.collection("exercises").doc(it.docId).set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    console.log(`✓ Created ${it.docId} ${it.name.en}.`);
  }
  console.log("");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
