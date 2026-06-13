/**
 * fix-library-gif-mismatches.cjs
 *
 * The standard-library exercises (tagged "standard-library", 4-digit doc ids)
 * had their GIFs assigned by the fuzzy name-matcher in
 * scripts/sync-standard-exercise-gifs.ts. 74 of them ended up pointing at a
 * DIFFERENT movement than the exercise name (e.g. "Mountain Climber" showing a
 * burpee, "Leg Extension" showing a hack squat). Each was audited by name +
 * target muscle + equipment + instructions against the source CSV
 * (\`exercises-gifs-main\`). This script repoints each doc to the CORRECT gif.
 *
 * For every (docId -> gifId) below it:
 *   1. Uploads assets/<gifId>.gif to exercises/library-gifs/<gifId>.gif if the
 *      object is missing (many target gifs were never uploaded). Idempotent.
 *   2. Resolves the permanent https download URL via getDownloadURL (token URL
 *      bypasses Storage rules — nested library-gifs/* objects are denied by
 *      downloadURL() otherwise; same pattern as backfill-library-gif-urls.cjs).
 *   3. Backs up the doc's current gifUrl, then sets gifUrl = the https URL.
 *
 * SAFETY:
 *   - --dry-run prints the full plan + backup, performs NO uploads or writes.
 *   - Backs up { id, beforeGifUrl } for every touched doc before writing.
 *   - Verifies each local asset exists and each doc exists before writing.
 *   - Idempotent: re-running yields the same final state.
 *   - Admin SDK required (.env.local) — runs server-side.
 *
 * Usage (from backoffice/):
 *   node scripts/fix-library-gif-mismatches.cjs --dry-run
 *   node scripts/fix-library-gif-mismatches.cjs
 *
 * NOTE: also extend the OVERRIDES map in sync-standard-exercise-gifs.ts so a
 * future re-sync does not regress these. (Tracked separately.)
 */

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const EXERCISES = "exercises";
const REMOTE_PREFIX = "exercises/library-gifs";
const ASSETS_DIR =
  process.env.GC_FITNESS_GIF_ASSETS_DIR ||
  "/Users/manu/Desktop/exercises-gifs-main/assets";

// docId = the Firestore exercise doc; gifId = the CORRECT source-CSV gif id.
// "was"/"now" are human-readable context for the PR/log only.
const CORRECTIONS = [
  { docId: "0464", gifId: "0857", name: "Ab Wheel (None)", was: "0464 (front plank with twist)", now: "wheel rollerout" },
  { docId: "0259", gifId: "0129", name: "Bench Dip (Bodyweight)", was: "0259 (close-grip push-up)", now: "bench dip (knees bent)" },
  { docId: "0078", gifId: "0809", name: "Bulgarian Split Squat (Bodyweight)", was: "0078 (barbell rear lunge)", now: "suspended split squat" },
  { docId: "3582", gifId: "0809", name: "Bulgarian Split Squat (Bodyweight)", was: "3582 (lunge with jump)", now: "suspended split squat" },
  { docId: "3635", gifId: "0809", name: "Bulgarian Split Squat (Dumbbell)", was: "3635 (dumbbell contralateral forward lunge)", now: "suspended split squat" },
  { docId: "0769", gifId: "0768", name: "Bulgarian Split Squat (Smith)", was: "0769 (smith sprint lunge)", now: "smith single leg split squat" },
  { docId: "3234", gifId: "0596", name: "Chest Fly (Machine)", was: "3234 (hyght dumbbell fly)", now: "lever seated fly" },
  { docId: "0652", gifId: "1326", name: "Chin-Up (Bodyweight)", was: "0652 (pull-up)", now: "chin-up" },
  { docId: "0528", gifId: "0028", name: "Clean and Press (Barbell)", was: "0528 (kettlebell double push press)", now: "barbell clean and press" },
  { docId: "0540", gifId: "0028", name: "Clean and Press (Dumbbell)", was: "0540 (kettlebell one arm push press)", now: "barbell clean and press" },
  { docId: "1758", gifId: "1452", name: "Crunch (Machine)", was: "1758 (assisted sit-up)", now: "lever seated crunch" },
  { docId: "0165", gifId: "0294", name: "Dumbbell Curl (Cable)", was: "0165 (cable hammer curl (with rope))", now: "dumbbell biceps curl" },
  { docId: "1675", gifId: "0447", name: "EZ-Bar Curl (Smith)", was: "1675 (dumbbell reverse spider curl)", now: "ez barbell curl" },
  { docId: "0167", gifId: "0203", name: "Face Pull (Cable)", was: "0167 (cable high row (kneeling))", now: "cable rear delt row (with rope)" },
  { docId: "0213", gifId: "0203", name: "Face Pull (Rope)", was: "0213 (cable seated high row (v-bar))", now: "cable rear delt row (with rope)" },
  { docId: "3548", gifId: "2133", name: "Farmer Carry (Dumbbell)", was: "3548 (dumbbell single arm overhead carry)", now: "farmers walk" },
  { docId: "0045", gifId: "0065", name: "Floor Press (Barbell)", was: "0045 (barbell guillotine bench press)", now: "barbell one arm floor press" },
  { docId: "1624", gifId: "0065", name: "Floor Press (Dumbbell)", was: "1624 (dumbbell reverse bench press)", now: "barbell one arm floor press" },
  { docId: "1308", gifId: "0065", name: "Floor Press (Smith)", was: "1308 (smith wide grip bench press)", now: "barbell one arm floor press" },
  { docId: "0534", gifId: "0533", name: "Front Squat (Dumbbell)", was: "0534 (kettlebell goblet squat)", now: "kettlebell front squat" },
  { docId: "0668", gifId: "3013", name: "Glute Bridge (Bodyweight)", was: "0668 (rear decline bridge)", now: "low glute bridge on floor" },
  { docId: "1422", gifId: "1409", name: "Glute Bridge (Dumbbell)", was: "1422 (pelvic tilt into bridge)", now: "barbell glute bridge" },
  { docId: "1774", gifId: "1409", name: "Glute Bridge (Smith)", was: "1774 (side bridge hip abduction)", now: "barbell glute bridge" },
  { docId: "0795", gifId: "3193", name: "Glute Ham Raise (Bodyweight)", was: "0795 (standing single leg curl)", now: "glute-ham raise" },
  { docId: "3195", gifId: "3193", name: "Glute Ham Raise (Machine)", was: "3195 (lever lying two-one leg curl)", now: "glute-ham raise" },
  { docId: "2287", gifId: "0743", name: "Hack Squat (Machine)", was: "2287 (lever alternate leg press)", now: "sled hack squat" },
  { docId: "2611", gifId: "0743", name: "Hack Squat (Machine)", was: "2611 (lever horizontal one leg press)", now: "sled hack squat" },
  { docId: "0760", gifId: "0755", name: "Hack Squat (Smith)", was: "0760 (smith leg press)", now: "smith hack squat" },
  { docId: "0630", gifId: "3636", name: "High Knees (Bodyweight)", was: "0630 (mountain climber)", now: "high knee against wall" },
  { docId: "3561", gifId: "3523", name: "Hip Thrust (Dumbbell)", was: "3561 (glute bridge march)", now: "glute bridge two legs on bench (male)" },
  { docId: "3013", gifId: "0756", name: "Hip Thrust (Smith)", was: "3013 (low glute bridge on floor)", now: "smith hip raise" },
  { docId: "1719", gifId: "0052", name: "JM Press (Barbell)", was: "1719 (barbell incline close grip bench press)", now: "barbell jm bench press" },
  { docId: "1625", gifId: "0052", name: "JM Press (Smith)", was: "1625 (smith machine decline close grip bench press)", now: "barbell jm bench press" },
  { docId: "0501", gifId: "2612", name: "Jump Rope (Rope)", was: "0501 (jack burpee)", now: "jump rope" },
  { docId: "0157", gifId: "0549", name: "Kettlebell Swing (Kettlebell)", was: "0157 (cable deadlift)", now: "kettlebell swing" },
  { docId: "1201", gifId: "0549", name: "Kettlebell Swing (Kettlebell)", was: "1201 (dumbbell burpee)", now: "kettlebell swing" },
  { docId: "1723", gifId: "0860", name: "Kickback (Cable)", was: "1723 (cable one arm tricep pushdown)", now: "cable kickback" },
  { docId: "0046", gifId: "0585", name: "Leg Extension (Machine)", was: "0046 (barbell hack squat)", now: "lever leg extension" },
  { docId: "0770", gifId: "2287", name: "Leg Press (Machine)", was: "0770 (smith squat)", now: "lever alternate leg press" },
  { docId: "1014", gifId: "0689", name: "Leg Raise (Bench)", was: "1014 (band v-up)", now: "seated leg raise" },
  { docId: "0765", gifId: "0774", name: "Military Standing Press (Smith)", was: "0765 (smith seated shoulder press)", now: "smith standing military press" },
  { docId: "1160", gifId: "0630", name: "Mountain Climber (Bodyweight)", was: "1160 (burpee)", now: "mountain climber" },
  { docId: "1286", gifId: "0596", name: "Pec Deck Fly (Machine)", was: "1286 (dumbbell one arm chest fly on exercise ball)", now: "lever seated fly" },
  { docId: "0868", gifId: "0592", name: "Preacher Curl (Machine)", was: "0868 (cable curl)", now: "lever preacher curl" },
  { docId: "0429", gifId: "0347", name: "Pronation/Supination (Dumbbell)", was: "0429 (dumbbell standing reverse curl)", now: "dumbbell lying pronation" },
  { docId: "0549", gifId: "0196", name: "Pull-Through (Cable)", was: "0549 (kettlebell swing)", now: "cable pull through (with rope)" },
  { docId: "1326", gifId: "0652", name: "Pull-Up (Bodyweight)", was: "1326 (chin-up)", now: "pull-up" },
  { docId: "0499", gifId: "0652", name: "Pull-Up (Machine)", was: "0499 (inverted row)", now: "pull-up" },
  { docId: "1456", gifId: "1700", name: "Push Press (Barbell)", was: "1456 (barbell standing close grip military press)", now: "dumbbell push press" },
  { docId: "1576", gifId: "0613", name: "Quad Stretch (Bodyweight)", was: "1576 (leg up hamstring stretch)", now: "lying (side) quads stretch" },
  { docId: "0472", gifId: "0872", name: "Reverse Crunch (Bodyweight)", was: "0472 (hanging leg raise)", now: "reverse crunch" },
  { docId: "0271", gifId: "0872", name: "Reverse Crunch (Swiss Ball)", was: "0271 (crunch (on stability ball))", now: "reverse crunch" },
  { docId: "0370", gifId: "0429", name: "Reverse Curl (Dumbbell)", was: "0370 (dumbbell peacher hammer curl)", now: "dumbbell standing reverse curl" },
  { docId: "1410", gifId: "0078", name: "Reverse Lunge (Barbell)", was: "1410 (barbell lateral lunge)", now: "barbell rear lunge" },
  { docId: "1009", gifId: "0085", name: "Romanian Deadlift (Smith)", was: "1009 (band stiff leg deadlift)", now: "barbell romanian deadlift" },
  { docId: "2405", gifId: "0200", name: "Rope Pushdown (Cable)", was: "2405 (cable triceps pushdown (v-bar) (with arm blaster))", now: "cable pushdown (with rope attachment)" },
  { docId: "0241", gifId: "0200", name: "Rope Pushdown (Rope)", was: "0241 (cable triceps pushdown (v-bar))", now: "cable pushdown (with rope attachment)" },
  { docId: "2137", gifId: "0405", name: "Seated Shoulder Press (Dumbbell)", was: "2137 (dumbbell arnold press)", now: "dumbbell seated shoulder press" },
  { docId: "0523", gifId: "0603", name: "Seated Shoulder Press (Machine)", was: "0523 (kettlebell arnold press)", now: "lever shoulder press" },
  { docId: "0774", gifId: "0765", name: "Seated Shoulder Press (Smith)", was: "0774 (smith standing military press)", now: "smith seated shoulder press" },
  { docId: "3665", gifId: "3544", name: "Side Plank (Swiss Ball)", was: "3665 (power point plank)", now: "bodyweight incline side plank" },
  { docId: "2796", gifId: "1757", name: "Single-Leg RDL (Dumbbell)", was: "2796 (dumbbell step-up lunge)", now: "dumbbell single leg deadlift" },
  { docId: "1008", gifId: "1757", name: "Single-Leg RDL (Kettlebell)", was: "1008 (band step-up)", now: "dumbbell single leg deadlift" },
  { docId: "2810", gifId: "0114", name: "Step-Up (Barbell)", was: "2810 (barbell split squat v. 2)", now: "barbell step-up" },
  { docId: "1001", gifId: "1008", name: "Step-Up (Bodyweight)", was: "1001 (band single leg split squat)", now: "band step-up" },
  { docId: "3470", gifId: "0431", name: "Step-Up (Bodyweight)", was: "3470 (forward lunge (male))", now: "dumbbell step-up" },
  { docId: "0028", gifId: "3305", name: "Thruster (Dumbbell)", was: "0028 (barbell clean and press)", now: "barbell thruster" },
  { docId: "0685", gifId: "0684", name: "Treadmill Run (Machine)", was: "0685 (run)", now: "run (equipment)" },
  { docId: "0554", gifId: "0551", name: "Turkish Get-Up (Dumbbell)", was: "0554 (kettlebell windmill)", now: "kettlebell turkish get up (squat style)" },
  { docId: "2802", gifId: "0507", name: "V-Up (Bodyweight)", was: "2802 (twisted leg raise)", now: "jackknife sit-up" },
  { docId: "0099", gifId: "1460", name: "Walking Lunge (Barbell)", was: "0099 (barbell single leg split squat)", now: "walking lunge" },
  { docId: "0098", gifId: "1460", name: "Walking Lunge (Dumbbell)", was: "0098 (barbell side split squat)", now: "walking lunge" },
  { docId: "0104", gifId: "0859", name: "Wrist Roller (Barbell)", was: "0104 (barbell standing back wrist curl)", now: "wrist rollerer" },
  { docId: "0994", gifId: "0859", name: "Wrist Roller (Discs)", was: "0994 (band reverse wrist curl)", now: "wrist rollerer" },
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

  console.log(
    `\nRepointing ${CORRECTIONS.length} standard-library exercises to the correct gif${dryRun ? "  [DRY RUN]" : ""}\n`,
  );

  // 1. Validate local assets up front.
  for (const c of CORRECTIONS) {
    const local = path.join(ASSETS_DIR, `${c.gifId}.gif`);
    if (!fs.existsSync(local)) {
      throw new Error(`Missing local asset ${local} for ${c.docId} (${c.name})`);
    }
  }

  // 2. Ensure each target gif is uploaded; resolve its https url (cache per gifId).
  const urlCache = new Map();
  async function ensureUrl(gifId) {
    if (urlCache.has(gifId)) return urlCache.get(gifId);
    const remote = `${REMOTE_PREFIX}/${gifId}.gif`;
    const file = bucket.file(remote);
    const [exists] = await file.exists();
    if (!exists) {
      if (dryRun) {
        console.log(`  [would upload] ${gifId}.gif -> ${remote}`);
      } else {
        await bucket.upload(path.join(ASSETS_DIR, `${gifId}.gif`), {
          destination: remote,
          metadata: {
            contentType: "image/gif",
            cacheControl: "public, max-age=31536000",
          },
          resumable: false,
        });
      }
    }
    // In dry-run a just-"uploaded" missing object can't be resolved; only
    // resolve when it already exists (or after a real upload).
    let url = null;
    if (exists || !dryRun) {
      url = await getDownloadURL(file);
    }
    urlCache.set(gifId, url);
    return url;
  }

  // 3. Build plan with backups.
  const plan = [];
  for (const c of CORRECTIONS) {
    const ref = db.collection(EXERCISES).doc(c.docId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`  ⚠ doc ${c.docId} (${c.name}) not found — skipping`);
      continue;
    }
    const beforeGifUrl = snap.get("gifUrl") ?? null;
    const url = await ensureUrl(c.gifId);
    plan.push({ ...c, beforeGifUrl, url });
  }

  // 4. Backup.
  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = process.env.BACKUP_STAMP || "manual";
  const backupPath = path.join(backupDir, `library-gif-mismatches-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      plan.map((p) => ({ id: p.docId, name: p.name, beforeGifUrl: p.beforeGifUrl })),
      null,
      2,
    ),
  );
  console.log(`Backup written: ${backupPath}\n`);

  for (const p of plan) {
    console.log(
      `  ${p.docId}  ${p.name}\n     was: ${p.was}\n     now: ${p.gifId} (${p.now})`,
    );
  }
  console.log();

  if (dryRun) {
    console.log("[DRY RUN] no uploads or Firestore writes performed.\n");
    return;
  }

  let written = 0;
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const p of plan.slice(i, i + 400)) {
      if (!p.url) continue;
      batch.update(db.collection(EXERCISES).doc(p.docId), {
        gifUrl: p.url,
        updatedAt: FieldValue.serverTimestamp(),
      });
      written += 1;
    }
    await batch.commit();
  }
  console.log(`\n✓ Repointed gifUrl on ${written} exercises.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
