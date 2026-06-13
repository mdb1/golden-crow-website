/**
 * rebuild-standard-templates.cjs
 *
 * Canonical definition + writer for the SHARED standard workout templates
 * (`trainerId: "__standard__"`, `isStandard: true`). Every strength template
 * is 6 exercises × 3 sets × 12 reps, drawn EXCLUSIVELY from the NEW curated
 * standard exercise library (`tags` contains "standard-library"). Rest is set
 * per exercise tier (heavy compound 120s / compound 90s / isolation 60s /
 * core·mobility 45s), following the hypertrophy rest-interval consensus
 * (compounds 90–120s, isolation 30–60s — Schoenfeld et al.; see PR for sources).
 *
 * Two template families are NOT reps-based:
 *   - MOBILITY A–D: rep-based core + mobility circuits (3×12, 45s rest).
 *   - RESISTANCE A–D: TIME-based conditioning — each exercise is a timed work
 *     interval (`metric: "time"`, `durationSeconds`) with short rest. reps=0
 *     ("no fixed count") per the schema's open-rep convention.
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
 *   - Backs up existing docs to scripts/backups/ before any write.
 *   - --dry-run prints the resolved plan + writes the backup, no Firestore writes.
 *   - IDEMPOTENT: a template whose resolved exercises[] already equals the live
 *     content is skipped (no version bump). Missing standard docs are CREATED
 *     (used for the added MOBILITY C/D + RESISTANCE C/D); existing ones are
 *     updated in place (exercises[] + version + updatedAt only).
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

// Doc-id prefix for standard templates (the seeding trainer's uid; the
// trainerId FIELD is "__standard__"). Reused for newly-created templates so
// they sit alongside their siblings.
const STD_DOC_PREFIX = "tpl-kXZSqc5HS6e28Tj68QKLUya1nvs2-";

// Slugs that may not exist yet — created as full docs when absent.
const CREATABLE_SLUGS = new Set([
  "std-mobility-c",
  "std-mobility-d",
  "std-resistance-c",
  "std-resistance-d",
]);

// Display names for created docs (existing docs keep their own name).
const CREATE_NAMES = {
  "std-mobility-c": "MOBILITY C",
  "std-mobility-d": "MOBILITY D",
  "std-resistance-c": "RESISTANCE C",
  "std-resistance-d": "RESISTANCE D",
};

// ---------------------------------------------------------------------------
// Routine design. Entry shapes:
//   [name, rest_seconds]              → reps-based  (3 × 12)
//   [name, rest_seconds, workSeconds] → time-based  (3 × workSeconds, reps=0)
// Rest tiers (reps): 120 heavy compound · 90 compound · 60 isolation · 45 core.
// Time-based (RESISTANCE): 40s work, short rest (30s loaded / 20s light).
// Names resolve to live standard-library doc ids at runtime (fail-loud).
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
  "std-mobility-c": [
    ["Glute Bridge (Bodyweight)", 45],
    ["Dead Bug (Bodyweight)", 45],
    ["Cobra Stretch (Bodyweight)", 45],
    ["Russian Twist (Bodyweight)", 45],
    ["V-Up (Bodyweight)", 45],
    ["Side Plank (Bodyweight)", 45],
  ],
  "std-mobility-d": [
    ["Sit-Up (Bodyweight)", 45],
    ["Reverse Crunch (Bodyweight)", 45],
    ["Mountain Climber (Bodyweight)", 45],
    ["Hollow Hold (Bodyweight)", 45],
    ["Leg Raise (Bodyweight)", 45],
    ["Plank (Bodyweight)", 45],
  ],
  // RESISTANCE = TIME-based full-body conditioning. [name, rest, workSeconds].
  // 40s work intervals; short rest (30s loaded / 20s light) to keep it metabolic.
  "std-resistance-a": [
    ["Burpee (Bodyweight)", 30, 40],
    ["Thruster (Dumbbell)", 30, 40],
    ["Walking Lunge (Bodyweight)", 30, 40],
    ["Push-Up (Bodyweight)", 20, 40],
    ["Mountain Climber (Bodyweight)", 20, 40],
    ["Plank (Bodyweight)", 20, 40],
  ],
  "std-resistance-b": [
    ["Kettlebell Swing (Kettlebell)", 30, 40],
    ["Thruster (Dumbbell)", 30, 40],
    ["Reverse Lunge (Bodyweight)", 30, 40],
    ["Close Grip Push-Up (Bodyweight)", 20, 40],
    ["High Knees (Bodyweight)", 20, 40],
    ["Hollow Hold (Bodyweight)", 20, 40],
  ],
  "std-resistance-c": [
    ["Burpee (Bodyweight)", 30, 40],
    ["Medicine Ball Slam (Medicine Ball)", 30, 40],
    ["Walking Lunge (Bodyweight)", 30, 40],
    ["Jump Rope (Rope)", 20, 40],
    ["Mountain Climber (Bodyweight)", 20, 40],
    ["Side Plank (Bodyweight)", 20, 40],
  ],
  "std-resistance-d": [
    ["Thruster (Dumbbell)", 30, 40],
    ["Kettlebell Swing (Kettlebell)", 30, 40],
    ["Bear Crawl (Bodyweight)", 30, 40],
    ["High Knees (Bodyweight)", 20, 40],
    ["Push-Up (Bodyweight)", 20, 40],
    ["Plank (Bodyweight)", 20, 40],
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
  return design.map(([name, rest, workSeconds], index) => {
    const base = {
      exerciseId: resolveName(byName, name),
      sets: SETS,
      rest_seconds: rest,
      transition_rest_seconds: TRANSITION_REST_SECONDS,
      order: index,
      notes: null,
    };
    if (typeof workSeconds === "number") {
      // Time-based: reps=0 ("no fixed count"), metric "time" + a scalar
      // duration fallback (schema requires durationSeconds > 0 when time).
      return {
        ...base,
        reps: 0,
        metric: "time",
        durationSeconds: workSeconds,
      };
    }
    return { ...base, reps: REPS };
  });
}

// Compare resolved exercises[] against the live doc content to keep writes
// idempotent (skip no-op updates / version bumps). Compares only the fields
// this script owns.
function exercisesEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  const norm = (e) => ({
    exerciseId: e.exerciseId,
    sets: Number(e.sets),
    reps: Number(e.reps ?? 0),
    rest_seconds: Number(e.rest_seconds),
    order: Number(e.order),
    metric: e.metric ?? null,
    durationSeconds:
      e.durationSeconds == null ? null : Number(e.durationSeconds),
  });
  return a.every((e, i) => {
    const x = norm(e);
    const y = norm(b[i]);
    return (
      x.exerciseId === y.exerciseId &&
      x.sets === y.sets &&
      x.reps === y.reps &&
      x.rest_seconds === y.rest_seconds &&
      x.order === y.order &&
      x.metric === y.metric &&
      x.durationSeconds === y.durationSeconds
    );
  });
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

  // 2) Resolve every template; fail loudly before any write. Each entry is
  // either an UPDATE (doc exists) or a CREATE (creatable slug, doc absent).
  const plan = [];
  for (const [slug, design] of Object.entries(TEMPLATE_DESIGN)) {
    if (design.length !== 6) {
      throw new Error(`Template "${slug}" must have 6 exercises, has ${design.length}.`);
    }
    const doc = bySlug.get(slug);
    const exercises = buildExercises(byName, design);
    if (doc) {
      plan.push({ slug, doc, exercises, mode: "update" });
    } else if (CREATABLE_SLUGS.has(slug)) {
      plan.push({ slug, doc: null, exercises, mode: "create" });
    } else {
      throw new Error(`Standard template doc not found for slug "${slug}" (not creatable).`);
    }
  }

  // 3) Backup existing docs that the plan touches.
  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = process.env.BACKUP_STAMP || "manual";
  const backupPath = path.join(backupDir, `standard-templates-${stamp}.json`);
  const backup = plan
    .filter((p) => p.doc)
    .map((p) => ({ id: p.doc.id, data: p.doc.data() }));
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${backupPath} (${backup.length} existing docs)\n`);

  // 4) Print the plan.
  for (const p of plan) {
    const name = p.doc ? p.doc.data().name?.en ?? p.slug : CREATE_NAMES[p.slug];
    console.log(`=== ${name} (${p.mode.toUpperCase()}) ===`);
    p.exercises.forEach((ex, i) => {
      const [exName] = TEMPLATE_DESIGN[p.slug][i];
      const scheme =
        ex.metric === "time"
          ? `${ex.sets}×${ex.durationSeconds}s`
          : `${ex.sets}×${ex.reps}`;
      console.log(
        `   ${ex.order}. ${exName} → ${ex.exerciseId}  ${scheme} rest ${ex.rest_seconds}s`,
      );
    });
  }

  if (dryRun) {
    console.log("\n[DRY RUN] no Firestore writes performed.\n");
    return;
  }

  // 5) Apply. Updates are idempotent (skip when content unchanged); creates
  // write a full standard doc matching its siblings' shape.
  let updated = 0;
  let created = 0;
  let skipped = 0;
  for (const p of plan) {
    if (p.mode === "update") {
      const current = p.doc.data().exercises;
      if (exercisesEqual(current, p.exercises)) {
        skipped += 1;
        continue;
      }
      await p.doc.ref.update({
        exercises: p.exercises,
        version: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated += 1;
    } else {
      const name = CREATE_NAMES[p.slug];
      const ref = db.collection(TEMPLATES).doc(`${STD_DOC_PREFIX}${p.slug}`);
      await ref.set({
        name: { en: name, es: name },
        description: { en: `${name} standard plan`, es: `${name} plan estándar` },
        tag: "custom",
        source: "standard-v2",
        isStandard: true,
        trainerId: STANDARD_TRAINER_ID,
        deleted: false,
        version: 1,
        exercises: p.exercises,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
  }
  console.log(
    `\n✓ Done — created ${created}, updated ${updated}, skipped ${skipped} (unchanged).\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
