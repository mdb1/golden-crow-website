/**
 * repair-559-snapshot-exercise-names.cjs — gc-fitness issue #559.
 *
 * An assignment's `templateSnapshot` freezes each exercise's NAME at write time. When
 * the mobile client's exercise-resolution map was missing an id at that moment, the
 * snapshot builder baked a POSITIONAL PLACEHOLDER in instead:
 *
 *     name = { en: "Ejercicio 3", es: "Ejercicio 3" }        // "<Exercise|Ejercicio> <order+1>"
 *
 * Home, Calendar, the Apple Watch payload and the Live Activity all render that frozen
 * snapshot, so they show "Ejercicio 3" forever. (The Rutinas tab resolves exercises live,
 * which is why it looks correct there — that asymmetry is the whole bug.)
 *
 * gc-fitness PR #561 stops NEW placeholders from being written. This script repairs the
 * documents that already have one, from `exercises/{exerciseId}`.
 *
 * DETECTION is deliberately strict — all three must hold for an exercise entry:
 *   1. `name.en === name.es` (the builder writes the same string into both), and
 *   2. that string matches /^(Ejercicio|Exercise)\s+(\d+)$/, and
 *   3. the captured number equals `order + 1` — i.e. it is the placeholder for THIS
 *      position, not a user who happens to have named something "Ejercicio 3".
 * A real exercise named "Ejercicio 3" sitting at a different position is never touched.
 *
 * REPAIR reads `exercises/{exerciseId}`, follows `mergedInto` (bounded, dead-chain safe —
 * see the 2026-06-12 dangling-mergedInto incident), and writes the canonical name back
 * into the snapshot entry. Everything else in the snapshot is left byte-identical: this
 * only ever replaces a placeholder `name`, so the frozen-snapshot contract holds for the
 * prescription itself.
 *
 * Idempotent (a repaired doc no longer matches the detector) and SAFE BY DEFAULT: it
 * reports only unless you pass --apply.
 *
 *   node scripts/repair-559-snapshot-exercise-names.cjs                    # dry run
 *   node scripts/repair-559-snapshot-exercise-names.cjs --apply            # write
 *   node scripts/repair-559-snapshot-exercise-names.cjs --collection=workout_logs
 *
 * Run from `backoffice/` (reads admin creds from .env.local, same as the other scripts).
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const PLACEHOLDER = /^(?:Ejercicio|Exercise)\s+(\d+)$/;
const MERGE_HOPS = 5; // bounded: a cyclic/dangling mergedInto must not spin

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
    credential: cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(pk, "base64").toString("utf8"),
    }),
  });
}

/** True when this snapshot entry carries the positional placeholder for its own order. */
function isPlaceholder(entry) {
  const name = entry && entry.name;
  if (!name || typeof name !== "object") return false;
  const { en, es } = name;
  if (typeof en !== "string" || typeof es !== "string" || en !== es) return false;
  const m = en.trim().match(PLACEHOLDER);
  if (!m) return false;
  const order = typeof entry.order === "number" ? entry.order : null;
  if (order === null) return false;
  return Number(m[1]) === order + 1;
}

/** Resolve an exercise doc, following `mergedInto` up to MERGE_HOPS. */
async function resolveExercise(db, exerciseId, cache) {
  if (cache.has(exerciseId)) return cache.get(exerciseId);
  let id = exerciseId;
  let doc = null;
  for (let hop = 0; hop < MERGE_HOPS; hop++) {
    if (!id || /^__.*__$/.test(id)) break; // reserved ids throw on .doc() — never dereference
    const snap = await db.collection("exercises").doc(id).get();
    if (!snap.exists) break;
    const data = snap.data();
    if (data.mergedInto && data.mergedInto !== id) {
      id = data.mergedInto;
      continue; // dead/dangling chains simply end at a missing doc
    }
    doc = data;
    break;
  }
  cache.set(exerciseId, doc);
  return doc;
}

/** The canonical bilingual name for an exercise doc, or null if it has none usable. */
function canonicalName(exercise) {
  if (!exercise) return null;
  const n = exercise.name;
  if (n && typeof n === "object" && (n.en || n.es)) {
    const en = (n.en || n.es || "").trim();
    const es = (n.es || n.en || "").trim();
    return en || es ? { en, es } : null;
  }
  if (typeof n === "string" && n.trim()) return { en: n.trim(), es: n.trim() };
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const collection =
    (args.find((a) => a.startsWith("--collection=")) || "--collection=workout_assignments")
      .split("=")[1];

  loadEnv();
  initAdmin();
  const db = getFirestore();

  console.log(
    `\n#559 snapshot-name repair — ${collection}${apply ? "  [APPLY]" : "  [DRY RUN — no writes]"}\n`
  );

  const cache = new Map();
  const stats = {
    docsScanned: 0,
    docsWithPlaceholder: 0,
    entriesFound: 0,
    entriesRepaired: 0,
    entriesUnresolvable: 0,
    docsWritten: 0,
  };
  const unresolvable = new Map(); // exerciseId → count

  let cursor = null;
  for (;;) {
    let q = db.collection(collection).orderBy("__name__").limit(400);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1];

    for (const doc of page.docs) {
      stats.docsScanned++;
      const data = doc.data();
      const snapshot = data.templateSnapshot;
      const exercises = snapshot && Array.isArray(snapshot.exercises) ? snapshot.exercises : null;
      if (!exercises || exercises.length === 0) continue;

      const flagged = exercises
        .map((e, i) => ({ entry: e, index: i }))
        .filter(({ entry }) => isPlaceholder(entry));
      if (flagged.length === 0) continue;

      stats.docsWithPlaceholder++;
      stats.entriesFound += flagged.length;

      // Rebuild the array in place, touching ONLY the flagged entries' `name`.
      const repaired = exercises.slice();
      let changed = 0;
      for (const { entry, index } of flagged) {
        const exercise = await resolveExercise(db, entry.exerciseId, cache);
        const name = canonicalName(exercise);
        if (!name) {
          stats.entriesUnresolvable++;
          unresolvable.set(entry.exerciseId, (unresolvable.get(entry.exerciseId) || 0) + 1);
          console.log(
            `  · ${doc.id}  [${entry.order}] "${entry.name.en}" → UNRESOLVED (${entry.exerciseId})`
          );
          continue;
        }
        repaired[index] = { ...entry, name };
        changed++;
        stats.entriesRepaired++;
        console.log(`  · ${doc.id}  [${entry.order}] "${entry.name.en}" → "${name.es || name.en}"`);
      }

      if (changed > 0 && apply) {
        // ONE field write: the whole exercises array, with only names differing.
        await doc.ref.update({ "templateSnapshot.exercises": repaired });
        stats.docsWritten++;
      }
    }
  }

  console.log("\n--- summary ---");
  console.log(`docs scanned             ${stats.docsScanned}`);
  console.log(`docs with placeholders   ${stats.docsWithPlaceholder}`);
  console.log(`placeholder entries      ${stats.entriesFound}`);
  console.log(`  repaired               ${stats.entriesRepaired}`);
  console.log(`  unresolvable           ${stats.entriesUnresolvable}`);
  console.log(`docs written             ${stats.docsWritten}${apply ? "" : "  (dry run)"}`);
  if (unresolvable.size) {
    console.log("\nunresolvable exercise ids (missing doc, or a dead mergedInto chain):");
    for (const [id, n] of [...unresolvable].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${id}  ×${n}`);
    }
  }
  if (!apply && stats.entriesFound > 0) {
    console.log("\nRe-run with --apply to write these repairs.");
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
