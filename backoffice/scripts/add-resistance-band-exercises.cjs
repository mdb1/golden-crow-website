/**
 * add-resistance-band-exercises.cjs — issue #406: add the missing
 * resistance-band ("banda de resistencia" / "banda elástica") exercises to the
 * standard exercise library. The committed generator only had Pallof Press on
 * a band; this adds a core set covering push / pull / legs / glutes / arms.
 *
 * Standard-library convention (see add-abductor-exercises.cjs): std-* doc ids to
 * avoid colliding with the prod 4-digit CSV-merged ids, source "wger",
 * ownerId null, tags ["standard-library"], equipment ["resistance_band"].
 * Idempotent, --dry-run, Admin SDK.
 *
 * GIF is OPTIONAL. Drop a ping-pong preview at
 *   ~/Desktop/exercises-gifs-main/assets/<docId>.gif
 * and re-run to attach it; otherwise the exercise ships with no media and the
 * apps fall back to an SF Symbol keyed to its primary muscle group (documented
 * bootstrap fallback).
 *
 * Run:
 *   node scripts/add-resistance-band-exercises.cjs --dry-run   # preview
 *   node scripts/add-resistance-band-exercises.cjs             # write
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
    docId: "std-back-band-pull-apart-band",
    muscleGroups: ["back", "shoulders"],
    targetMuscles: ["Rear Deltoids"], secondaryMuscles: ["Upper Back", "Trapezius"],
    name: { en: "Band Pull-Apart", es: "Aperturas con banda (Pull-Apart)" },
    description: {
      en: "Rear-delt and upper-back exercise: hold a band in front of you and pull it apart by squeezing the shoulder blades.",
      es: "Ejercicio para deltoides posterior y espalda alta: sostené una banda al frente y separala juntando los omóplatos.",
    },
    keywords: ["Band Pull Apart", "Pull Apart", "Banda", "Aperturas", "Resistance band"],
    en: [
      "Stand tall and hold a resistance band with both hands in front of you at shoulder height, arms straight.",
      "Set your hands about shoulder-width apart so the band has slight tension.",
      "Keeping your arms straight, pull the band apart by squeezing your shoulder blades together.",
      "Bring the band toward your chest until your arms are out to the sides.",
      "Pause briefly, then slowly return to the starting position under control.",
    ],
    es: [
      "Parate erguido y sostené una banda con ambas manos al frente, a la altura de los hombros y con los brazos estirados.",
      "Separá las manos al ancho de los hombros para que la banda tenga algo de tensión.",
      "Manteniendo los brazos estirados, separá la banda juntando los omóplatos.",
      "Llevá la banda hacia el pecho hasta abrir los brazos a los costados.",
      "Hacé una pausa breve y volvé lentamente a la posición inicial de forma controlada.",
    ],
  },
  {
    docId: "std-legs-band-squat-band",
    muscleGroups: ["quadriceps", "glutes", "legs"],
    targetMuscles: ["Quadriceps"], secondaryMuscles: ["Glutes", "Hamstrings"],
    name: { en: "Banded Squat", es: "Sentadilla con banda" },
    description: {
      en: "Squat driven against a loop band around the thighs to add tension and cue the knees out.",
      es: "Sentadilla contra una banda circular en los muslos que agrega tensión y ayuda a abrir las rodillas.",
    },
    keywords: ["Banded Squat", "Sentadilla", "Banda", "Resistance band"],
    en: [
      "Step both feet through a loop band and position it just above your knees.",
      "Stand with feet shoulder-width apart, toes slightly out.",
      "Push your knees outward against the band to keep tension.",
      "Sit back and down into a squat until your thighs are about parallel to the floor.",
      "Drive through your heels to stand back up, keeping the knees pressed out.",
      "Repeat for the desired number of repetitions.",
    ],
    es: [
      "Pasá ambos pies por una banda circular y ubicala justo por encima de las rodillas.",
      "Parate con los pies al ancho de los hombros y las puntas levemente hacia afuera.",
      "Empujá las rodillas hacia afuera contra la banda para mantener la tensión.",
      "Bajá llevando la cadera atrás hasta que los muslos queden casi paralelos al piso.",
      "Empujá con los talones para subir, manteniendo las rodillas abiertas.",
      "Repetí las repeticiones deseadas.",
    ],
  },
  {
    docId: "std-glutes-band-glute-bridge-band",
    muscleGroups: ["glutes", "hamstrings"],
    targetMuscles: ["Glutes"], secondaryMuscles: ["Hamstrings"],
    name: { en: "Banded Glute Bridge", es: "Puente de glúteos con banda" },
    description: {
      en: "Floor glute bridge with a loop band around the thighs to increase glute activation.",
      es: "Puente de glúteos en el piso con una banda circular en los muslos para aumentar la activación glútea.",
    },
    keywords: ["Glute Bridge", "Puente de glúteos", "Banda", "Resistance band"],
    en: [
      "Lie on your back with knees bent and feet flat on the floor, a loop band just above your knees.",
      "Set your feet hip-width apart and press your knees slightly outward against the band.",
      "Brace your core and drive through your heels to lift your hips toward the ceiling.",
      "Squeeze your glutes at the top until your body forms a straight line from shoulders to knees.",
      "Lower your hips under control back to the floor, then repeat.",
    ],
    es: [
      "Acostate boca arriba con las rodillas flexionadas y los pies apoyados, con una banda circular justo por encima de las rodillas.",
      "Ubicá los pies al ancho de la cadera y empujá las rodillas levemente hacia afuera contra la banda.",
      "Activá el core y empujá con los talones para elevar la cadera hacia el techo.",
      "Apretá los glúteos arriba hasta que el cuerpo forme una línea recta de los hombros a las rodillas.",
      "Bajá la cadera de forma controlada hasta el piso y repetí.",
    ],
  },
  {
    docId: "std-back-band-row-band",
    muscleGroups: ["back", "biceps"],
    targetMuscles: ["Lats"], secondaryMuscles: ["Biceps", "Upper Back"],
    name: { en: "Seated Band Row", es: "Remo sentado con banda" },
    description: {
      en: "Rowing pull with a band anchored at your feet, targeting the mid-back.",
      es: "Remo con banda anclada en los pies, enfocado en la espalda media.",
    },
    keywords: ["Band Row", "Remo", "Banda", "Resistance band"],
    en: [
      "Sit on the floor with your legs extended and loop the band around the soles of your feet.",
      "Hold one end of the band in each hand with arms extended and a tall torso.",
      "Pull the band toward your waist by driving your elbows back and squeezing your shoulder blades.",
      "Pause when your hands reach your torso.",
      "Slowly extend your arms back to the start, keeping tension on the band.",
    ],
    es: [
      "Sentate en el piso con las piernas extendidas y pasá la banda por las plantas de los pies.",
      "Tomá un extremo de la banda con cada mano, con los brazos estirados y el torso erguido.",
      "Traé la banda hacia la cintura llevando los codos atrás y juntando los omóplatos.",
      "Hacé una pausa cuando las manos lleguen al torso.",
      "Estirá los brazos lentamente hasta el inicio, manteniendo la tensión en la banda.",
    ],
  },
  {
    docId: "std-chest-band-chest-press-band",
    muscleGroups: ["chest", "triceps", "shoulders"],
    targetMuscles: ["Chest"], secondaryMuscles: ["Triceps", "Front Deltoids"],
    name: { en: "Band Chest Press", es: "Press de pecho con banda" },
    description: {
      en: "Pressing movement with a band anchored behind you, working the chest.",
      es: "Movimiento de empuje con banda anclada detrás, que trabaja el pecho.",
    },
    keywords: ["Band Chest Press", "Press de pecho", "Banda", "Resistance band"],
    en: [
      "Anchor the band behind you at chest height (around a post or under your upper back).",
      "Hold one end in each hand at chest level with your elbows bent.",
      "Step forward to create tension and stagger your stance for balance.",
      "Press your hands forward until your arms are extended in front of your chest.",
      "Slowly return to the start, keeping tension on the band.",
    ],
    es: [
      "Anclá la banda detrás tuyo a la altura del pecho (en un poste o pasándola por la espalda alta).",
      "Tomá un extremo con cada mano a la altura del pecho, con los codos flexionados.",
      "Da un paso adelante para generar tensión y separá los pies para mayor equilibrio.",
      "Empujá las manos hacia adelante hasta estirar los brazos frente al pecho.",
      "Volvé lentamente al inicio, manteniendo la tensión en la banda.",
    ],
  },
  {
    docId: "std-shoulders-band-overhead-press-band",
    muscleGroups: ["shoulders", "triceps"],
    targetMuscles: ["Shoulders"], secondaryMuscles: ["Triceps"],
    name: { en: "Band Overhead Press", es: "Press militar con banda" },
    description: {
      en: "Overhead press against a band anchored under the feet, working the shoulders.",
      es: "Press por encima de la cabeza contra una banda anclada bajo los pies, para los hombros.",
    },
    keywords: ["Band Overhead Press", "Press militar", "Banda", "Resistance band"],
    en: [
      "Stand on the middle of the band with feet shoulder-width apart.",
      "Hold one end in each hand at shoulder height, palms facing forward.",
      "Brace your core and press your hands straight overhead until your arms are extended.",
      "Pause briefly at the top without locking out harshly.",
      "Lower your hands back to shoulder height under control, then repeat.",
    ],
    es: [
      "Parate sobre el centro de la banda con los pies al ancho de los hombros.",
      "Tomá un extremo con cada mano a la altura de los hombros, con las palmas hacia adelante.",
      "Activá el core y empujá las manos hacia arriba hasta estirar los brazos por encima de la cabeza.",
      "Hacé una pausa breve arriba sin bloquear con fuerza.",
      "Bajá las manos a la altura de los hombros de forma controlada y repetí.",
    ],
  },
  {
    docId: "std-biceps-band-curl-band",
    muscleGroups: ["biceps", "arms"],
    targetMuscles: ["Biceps"], secondaryMuscles: ["Forearms"],
    name: { en: "Band Biceps Curl", es: "Curl de bíceps con banda" },
    description: {
      en: "Biceps curl against a band anchored under the feet.",
      es: "Curl de bíceps contra una banda anclada bajo los pies.",
    },
    keywords: ["Band Curl", "Curl de bíceps", "Banda", "Resistance band"],
    en: [
      "Stand on the middle of the band with feet hip-width apart.",
      "Hold one end in each hand at your sides, palms facing forward.",
      "Keeping your elbows tucked at your sides, curl your hands toward your shoulders.",
      "Squeeze your biceps at the top.",
      "Lower your hands back down under control, keeping tension on the band.",
    ],
    es: [
      "Parate sobre el centro de la banda con los pies al ancho de la cadera.",
      "Tomá un extremo con cada mano a los costados, con las palmas hacia adelante.",
      "Manteniendo los codos pegados al cuerpo, flexioná los brazos llevando las manos hacia los hombros.",
      "Apretá los bíceps arriba.",
      "Bajá las manos de forma controlada, manteniendo la tensión en la banda.",
    ],
  },
  {
    docId: "std-triceps-band-pushdown-band",
    muscleGroups: ["triceps", "arms"],
    targetMuscles: ["Triceps"], secondaryMuscles: [],
    name: { en: "Band Triceps Pushdown", es: "Extensión de tríceps con banda" },
    description: {
      en: "Triceps pushdown against a band anchored above head height.",
      es: "Extensión de tríceps contra una banda anclada por encima de la cabeza.",
    },
    keywords: ["Band Pushdown", "Extensión de tríceps", "Banda", "Resistance band"],
    en: [
      "Anchor the band above head height (e.g. a door anchor or bar).",
      "Hold one end in each hand with your elbows bent and tucked at your sides.",
      "Keeping your elbows fixed, push your hands down until your arms are fully extended.",
      "Squeeze your triceps at the bottom.",
      "Slowly let your hands rise back to the start, keeping your elbows still.",
    ],
    es: [
      "Anclá la banda por encima de la cabeza (por ejemplo con un anclaje de puerta o una barra).",
      "Tomá un extremo con cada mano, con los codos flexionados y pegados al cuerpo.",
      "Manteniendo los codos fijos, empujá las manos hacia abajo hasta estirar los brazos por completo.",
      "Apretá los tríceps abajo.",
      "Dejá que las manos suban lentamente al inicio, manteniendo los codos quietos.",
    ],
  },
  {
    docId: "std-shoulders-band-lateral-raise-band",
    muscleGroups: ["shoulders"],
    targetMuscles: ["Lateral Deltoids"], secondaryMuscles: [],
    name: { en: "Band Lateral Raise", es: "Elevaciones laterales con banda" },
    description: {
      en: "Lateral deltoid raise against a band under the feet.",
      es: "Elevación lateral de deltoides contra una banda bajo los pies.",
    },
    keywords: ["Band Lateral Raise", "Elevaciones laterales", "Banda", "Resistance band"],
    en: [
      "Stand on the middle of the band with your feet together.",
      "Hold one end in each hand at your sides with a slight bend in your elbows.",
      "Raise your arms out to the sides until they reach shoulder height.",
      "Pause briefly at the top.",
      "Lower your arms back down under control, keeping tension on the band.",
    ],
    es: [
      "Parate sobre el centro de la banda con los pies juntos.",
      "Tomá un extremo con cada mano a los costados, con una leve flexión en los codos.",
      "Elevá los brazos hacia los costados hasta la altura de los hombros.",
      "Hacé una pausa breve arriba.",
      "Bajá los brazos de forma controlada, manteniendo la tensión en la banda.",
    ],
  },
  {
    docId: "std-back-band-face-pull-band",
    muscleGroups: ["back", "shoulders"],
    targetMuscles: ["Rear Deltoids"], secondaryMuscles: ["Upper Back", "Trapezius"],
    name: { en: "Band Face Pull", es: "Face Pull con banda" },
    description: {
      en: "Pull toward the face with a band anchored at head height, working rear delts and upper back.",
      es: "Tirón hacia la cara con una banda anclada a la altura de la cabeza, para deltoides posterior y espalda alta.",
    },
    keywords: ["Face Pull", "Banda", "Resistance band", "Deltoides posterior"],
    en: [
      "Anchor the band at about head height and hold one end in each hand.",
      "Step back to create tension with your arms extended in front of you.",
      "Pull the band toward your face, flaring your elbows out and up.",
      "Squeeze your rear shoulders and upper back at the end of the pull.",
      "Slowly return to the start under control.",
    ],
    es: [
      "Anclá la banda a la altura de la cabeza y tomá un extremo con cada mano.",
      "Da un paso atrás para generar tensión, con los brazos estirados al frente.",
      "Traé la banda hacia la cara, abriendo los codos hacia afuera y arriba.",
      "Apretá los deltoides posteriores y la espalda alta al final del tirón.",
      "Volvé lentamente al inicio de forma controlada.",
    ],
  },
  {
    docId: "std-hamstrings-band-good-morning-band",
    muscleGroups: ["hamstrings", "glutes", "back"],
    targetMuscles: ["Hamstrings"], secondaryMuscles: ["Glutes", "Lower Back"],
    name: { en: "Banded Good Morning", es: "Buenos días con banda (Good Morning)" },
    description: {
      en: "Hip hinge against a band looped under the feet and over the shoulders, targeting hamstrings and glutes.",
      es: "Bisagra de cadera contra una banda pasada bajo los pies y sobre los hombros, para isquiotibiales y glúteos.",
    },
    keywords: ["Good Morning", "Buenos días", "Banda", "Resistance band", "Isquiotibiales"],
    en: [
      "Stand on the middle of the band and loop the top over the back of your neck and shoulders.",
      "Set your feet shoulder-width apart with a slight bend in your knees.",
      "Keeping your back flat, hinge at the hips and push your glutes back.",
      "Lower your torso until you feel a stretch in your hamstrings.",
      "Drive your hips forward to stand back up tall, then repeat.",
    ],
    es: [
      "Parate sobre el centro de la banda y pasá la parte de arriba por la nuca y los hombros.",
      "Ubicá los pies al ancho de los hombros con una leve flexión en las rodillas.",
      "Manteniendo la espalda recta, hacé una bisagra de cadera llevando los glúteos hacia atrás.",
      "Bajá el torso hasta sentir un estiramiento en los isquiotibiales.",
      "Empujá la cadera hacia adelante para volver a pararte erguido y repetí.",
    ],
  },
  {
    docId: "std-glutes-band-lateral-walk-band",
    muscleGroups: ["glutes", "legs"],
    targetMuscles: ["Glutes"], secondaryMuscles: ["Abductors"],
    name: { en: "Band Lateral Walk", es: "Caminata lateral con banda" },
    description: {
      en: "Side-stepping against a loop band around the legs to work the glutes and hip abductors.",
      es: "Pasos laterales contra una banda circular en las piernas para trabajar glúteos y abductores de cadera.",
    },
    keywords: ["Lateral Walk", "Monster Walk", "Caminata lateral", "Banda", "Resistance band"],
    en: [
      "Place a loop band around your legs just above the knees (or around the ankles for more difficulty).",
      "Stand with feet hip-width apart and drop into a quarter-squat, knees pushed out.",
      "Step one foot out to the side, keeping tension on the band.",
      "Follow with the other foot to return to hip-width, staying low.",
      "Continue stepping in one direction, then repeat in the other direction.",
    ],
    es: [
      "Colocá una banda circular alrededor de las piernas justo por encima de las rodillas (o en los tobillos para más dificultad).",
      "Parate con los pies al ancho de la cadera y bajá a una media sentadilla, con las rodillas hacia afuera.",
      "Da un paso hacia el costado con un pie, manteniendo la tensión en la banda.",
      "Acompañá con el otro pie para volver al ancho de la cadera, sin subir.",
      "Seguí dando pasos hacia un lado y después repetí hacia el otro.",
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
  const ids = new Set(ITEMS.map((i) => i.docId));
  if (ids.size !== ITEMS.length) throw new Error("Duplicate docId in ITEMS.");
  console.log(`\nAdding ${ITEMS.length} resistance-band exercises${dryRun ? "  [DRY RUN]" : ""}\n`);
  for (const it of ITEMS) {
    if (it.en.length !== it.es.length) throw new Error(`Step count mismatch for ${it.docId}`);
    const gifUrl = await resolveOptionalGifUrl(bucket, it.docId, dryRun);
    const doc = {
      id: it.docId,
      name: it.name,
      description: it.description,
      overview: it.description.en,
      muscleGroups: it.muscleGroups,
      equipment: ["resistance_band"],
      bodyParts: [it.muscleGroups[0].toUpperCase()],
      targetMuscles: it.targetMuscles,
      secondaryMuscles: it.secondaryMuscles,
      keywords: it.keywords,
      variations: [],
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
