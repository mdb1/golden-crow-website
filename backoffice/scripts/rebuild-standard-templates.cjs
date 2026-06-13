/**
 * rebuild-standard-templates.cjs
 *
 * Rebuilds the 16 SHARED standard workout templates (`trainerId:
 * "__standard__"`, `isStandard: true`) so every one is exactly 6 exercises ×
 * 3 sets × 12 reps, drawn EXCLUSIVELY from the NEW curated standard exercise
 * library (`tags` contains "standard-library"). Rest is set per exercise tier
 * (heavy compound 120s / compound 90s / isolation 60s / core·mobility 45s),
 * following the hypertrophy rest-interval consensus (compounds 90–120s,
 * isolation 30–60s — Schoenfeld et al.; see PR description for sources).
 *
 * WHY: the standard templates still referenced LEGACY catalog exercises
 * (fexd-* / wger-*) which we retired from the picker (see
 * docs/legacy-exercise-retirement.md). A coach forking a standard template
 * could no longer re-pick those exercises. Rebuilding on the new library keeps
 * the starter routines fully editable + visually consistent.
 *
 * SAFETY:
 *   - Resolves every exercise by EXACT English name against the live
 *     standard-library set, failing loudly if any name is missing or lacks
 *     media — never writes a dangling exerciseId.
 *   - Backs up the current 16 docs to scripts/backups/ before any write.
 *   - --dry-run prints the resolved plan and writes the backup, but performs
 *     no Firestore writes.
 *   - Updates ONLY exercises[] + version + updatedAt; name / trainerId /
 *     isStandard / tags are preserved.
 *   - Admin SDK is REQUIRED: Firestore rules forbid trainers from updating
 *     `isStandard` templates, so this must run server-side with the admin
 *     service account (.env.local).
 *
 * Usage (from backoffice/):
 *   node scripts/rebuild-standard-templates.cjs --dry-run
 *   node scripts/rebuild-standard-templates.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const EXERCISES = "exercises";
const TEMPLATES = "workout_templates";
const STANDARD_TRAINER_ID = "__standard__";
const STANDARD_LIBRARY_TAG = "standard-library";

const SETS = 3;
const REPS = 12;
const TRANSITION_REST_SECONDS = 60; // rest between exercises

// ---------------------------------------------------------------------------
// Routine design. Each entry: [exact English exercise name, rest_seconds].
// Rest tiers: 120 heavy compound · 90 compound · 60 isolation · 45 core/mobility.
// Names are resolved to live standard-library doc ids at runtime (fail-loud).
// ---------------------------------------------------------------------------
const TEMPLATE_DESIGN = {
  "std-bodyweight-only-a": [
    ["Pull-Up (Bodyweight)", 90],
    ["Push-Up (Bodyweight)", 90],
    ["Dip (Bodyweight)", 90],
    ["Bulgarian Split Squat (Bodyweight)", 90],
    ["Glute Bridge (Bodyweight)", 60],
    ["Plank (Bodyweight)", 45],
  ],
  "std-bodyweight-only-b": [
    ["Chin-Up (Bodyweight)", 90],
    ["Close Grip Push-Up (Bodyweight)", 90],
    ["Reverse Lunge (Bodyweight)", 90],
    ["Sissy Squat (Bodyweight)", 90],
    ["Standing Calf Raise (Bodyweight)", 60],
    ["Bicycle Crunch (Bodyweight)", 45],
  ],
  "std-db-only-a": [
    ["Bench Press (Dumbbell)", 90],
    ["Chest-Supported Row (Dumbbell)", 90],
    ["Walking Lunge (Dumbbell)", 90],
    ["Seated Shoulder Press (Dumbbell)", 90],
    ["Romanian Deadlift (Dumbbell)", 90],
    ["Dumbbell Curl (Dumbbell)", 60],
  ],
  "std-db-only-b": [
    ["Incline Bench Press (Dumbbell)", 90],
    ["Chest-Supported Row (Dumbbell)", 90],
    ["Bulgarian Split Squat (Dumbbell)", 90],
    ["Stiff-Leg Deadlift (Dumbbell)", 90],
    ["Lateral Raise (Dumbbell)", 60],
    ["Hammer Curl (Dumbbell)", 60],
  ],
  "std-full-body-a": [
    ["Back Squat (Barbell)", 120],
    ["Bench Press (Barbell)", 120],
    ["Barbell Row (Barbell)", 90],
    ["Seated Shoulder Press (Dumbbell)", 90],
    ["Romanian Deadlift (Barbell)", 90],
    ["Plank (Bodyweight)", 45],
  ],
  "std-full-body-b": [
    ["Deadlift (Barbell)", 120],
    ["Incline Bench Press (Dumbbell)", 90],
    ["Lat Pulldown (Cable)", 90],
    ["Leg Press (Machine)", 90],
    ["Lateral Raise (Dumbbell)", 60],
    ["Bicycle Crunch (Bodyweight)", 45],
  ],
  "std-legs-a": [
    ["Back Squat (Barbell)", 120],
    ["Romanian Deadlift (Barbell)", 90],
    ["Leg Press (Machine)", 90],
    ["Leg Extension (Machine)", 60],
    ["Seated Leg Curl (Machine)", 60],
    ["Standing Calf Raise (Machine)", 60],
  ],
  "std-legs-b": [
    ["Romanian Deadlift (Barbell)", 120],
    ["Hip Thrust (Barbell)", 90],
    ["Bulgarian Split Squat (Dumbbell)", 90],
    ["Lying Leg Curl (Machine)", 60],
    ["Leg Extension (Machine)", 60],
    ["Standing Calf Raise (Machine)", 60],
  ],
  "std-push-a": [
    ["Bench Press (Barbell)", 120],
    ["Seated Shoulder Press (Dumbbell)", 90],
    ["Incline Bench Press (Dumbbell)", 90],
    ["Lateral Raise (Dumbbell)", 60],
    ["Pushdown (Cable)", 60],
    ["Overhead Extension (Cable)", 60],
  ],
  "std-push-b": [
    ["Military Standing Press (Barbell)", 120],
    ["Bench Press (Dumbbell)", 90],
    ["Chest Fly (Cable)", 60],
    ["Lateral Raise (Dumbbell)", 60],
    ["Skull Crusher (Dumbbell)", 60],
    ["Pushdown (Cable)", 60],
  ],
  "std-pull-a": [
    ["Pull-Up (Bodyweight)", 90],
    ["Barbell Row (Barbell)", 90],
    ["Lat Pulldown (Cable)", 90],
    ["Face Pull (Cable)", 60],
    ["Barbell Curl (Barbell)", 60],
    ["Hammer Curl (Dumbbell)", 60],
  ],
  "std-pull-b": [
    ["Deadlift (Barbell)", 120],
    ["Seated Row (Cable)", 90],
    ["Chest-Supported Row (Dumbbell)", 90],
    ["Face Pull (Cable)", 60],
    ["Preacher Curl (Dumbbell)", 60],
    ["Incline Curl (Dumbbell)", 60],
  ],
  // MOBILITY = rep-based core + mobility circuit (honors the universal
  // 3×12 rule; stretches that can't be rep-counted are intentionally avoided).
  "std-mobility-a": [
    ["Dead Bug (Bodyweight)", 45],
    ["Glute Bridge (Bodyweight)", 45],
    ["Side Plank (Bodyweight)", 45],
    ["Mountain Climber (Bodyweight)", 45],
    ["Hollow Hold (Bodyweight)", 45],
    ["Plank (Bodyweight)", 45],
  ],
  "std-mobility-b": [
    ["Reverse Crunch (Bodyweight)", 45],
    ["Russian Twist (Bodyweight)", 45],
    ["Leg Raise (Bodyweight)", 45],
    ["Bicycle Crunch (Bodyweight)", 45],
    ["Side Plank (Bodyweight)", 45],
    ["Crunch (Bodyweight)", 45],
  ],
  // RESISTANCE = full-body conditioning; short rest to keep it metabolic.
  "std-resistance-a": [
    ["Burpee (Bodyweight)", 60],
    ["Thruster (Dumbbell)", 60],
    ["Walking Lunge (Bodyweight)", 60],
    ["Push-Up (Bodyweight)", 60],
    ["Mountain Climber (Bodyweight)", 45],
    ["Plank (Bodyweight)", 45],
  ],
  "std-resistance-b": [
    ["Kettlebell Swing (Kettlebell)", 60],
    ["Thruster (Dumbbell)", 60],
    ["Reverse Lunge (Bodyweight)", 60],
    ["Close Grip Push-Up (Bodyweight)", 60],
    ["High Knees (Bodyweight)", 45],
    ["Hollow Hold (Bodyweight)", 45],
  ],
};

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

function parseArgs() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  return { dryRun };
}

function hasMedia(data) {
  return Boolean(data.gifUrl || data.imageUrl || data.thumbnailURL);
}

// Build an exact-English-name → doc-id index over the live standard library.
// When a name maps to multiple docs (same movement, different seeded ids) we
// pick the lexicographically-smallest id for determinism.
async function buildNameIndex(db) {
  const snap = await db
    .collection(EXERCISES)
    .where("tags", "array-contains", STANDARD_LIBRARY_TAG)
    .get();

  const byName = new Map();
  for (const doc of snap.docs) {
    const data = doc.data();
    const en = data?.name?.en;
    if (typeof en !== "string" || !en.trim()) continue;
    if (data.deleted === true || data.deletedAt) continue;
    const entry = byName.get(en) ?? [];
    entry.push({ id: doc.id, media: hasMedia(data) });
    byName.set(en, entry);
  }
  return byName;
}

function resolveName(byName, name) {
  const candidates = byName.get(name);
  if (!candidates || candidates.length === 0) {
    throw new Error(`Exercise not found in standard library: "${name}"`);
  }
  const withMedia = candidates.filter((c) => c.media);
  const pool = withMedia.length > 0 ? withMedia : candidates;
  if (withMedia.length === 0) {
    console.warn(`  ⚠ "${name}" has no media — using id anyway`);
  }
  pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pool[0].id;
}

function buildExercises(byName, design) {
  return design.map(([name, rest], index) => ({
    exerciseId: resolveName(byName, name),
    sets: SETS,
    reps: REPS,
    rest_seconds: rest,
    transition_rest_seconds: TRANSITION_REST_SECONDS,
    order: index,
  }));
}

async function main() {
  const { dryRun } = parseArgs();
  loadEnv();
  initAdmin();
  const db = getFirestore();

  console.log(
    `\nRebuilding 16 standard templates → 6 × ${SETS}×${REPS}${dryRun ? "  [DRY RUN]" : ""}\n`,
  );

  const byName = await buildNameIndex(db);
  console.log(`Standard-library exercises indexed: ${byName.size} unique names\n`);

  // 1) Discover the actual standard template docs (trainerId == __standard__).
  const tplSnap = await db
    .collection(TEMPLATES)
    .where("trainerId", "==", STANDARD_TRAINER_ID)
    .get();

  const bySlug = new Map();
  for (const doc of tplSnap.docs) {
    // Doc id shape: tpl-<trainerUid>-<slug>; slug is the std-* suffix.
    const m = doc.id.match(/-(std-[a-z0-9-]+)$/);
    if (m) bySlug.set(m[1], doc);
  }

  // 2) Resolve every template; fail loudly before any write.
  const plan = [];
  for (const [slug, design] of Object.entries(TEMPLATE_DESIGN)) {
    const doc = bySlug.get(slug);
    if (!doc) {
      throw new Error(`Standard template doc not found for slug "${slug}".`);
    }
    if (design.length !== 6) {
      throw new Error(`Template "${slug}" must have 6 exercises, has ${design.length}.`);
    }
    const exercises = buildExercises(byName, design);
    plan.push({ slug, doc, exercises, currentVersion: doc.data().version ?? 1 });
  }

  if (bySlug.size !== Object.keys(TEMPLATE_DESIGN).length) {
    console.warn(
      `  ⚠ found ${bySlug.size} standard docs, design covers ${Object.keys(TEMPLATE_DESIGN).length}`,
    );
  }

  // 3) Backup current docs.
  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = process.env.BACKUP_STAMP || "manual";
  const backupPath = path.join(backupDir, `standard-templates-${stamp}.json`);
  const backup = plan.map((p) => ({ id: p.doc.id, data: p.doc.data() }));
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${backupPath}\n`);

  // 4) Print the plan.
  for (const p of plan) {
    const name = p.doc.data().name?.en ?? p.slug;
    console.log(`=== ${name} (${p.doc.id}) ===`);
    p.exercises.forEach((ex, i) => {
      const [exName] = TEMPLATE_DESIGN[p.slug][i];
      console.log(
        `   ${ex.order}. ${exName} → ${ex.exerciseId}  ${ex.sets}×${ex.reps} rest ${ex.rest_seconds}s`,
      );
    });
  }

  if (dryRun) {
    console.log("\n[DRY RUN] no Firestore writes performed.\n");
    return;
  }

  // 5) Apply: update exercises[] + version + updatedAt only.
  let written = 0;
  for (const p of plan) {
    await p.doc.ref.update({
      exercises: p.exercises,
      version: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    written += 1;
  }
  console.log(`\n✓ Updated ${written} standard templates.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
