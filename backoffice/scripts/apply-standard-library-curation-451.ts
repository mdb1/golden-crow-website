// apply-standard-library-curation-451.ts — puts #460's standard-library
// curation into production Firestore (gcfitness-3476b), and nothing else.
//
//   node --experimental-transform-types scripts/apply-standard-library-curation-451.ts           (dry run)
//   node --experimental-transform-types scripts/apply-standard-library-curation-451.ts --apply   (writes)
//
// WHY NOT `sync-standard-exercise-library.ts`: it `set(…,{merge:true})`s EVERY
// std-* doc with the source's fields — resetting descriptions (#165
// instructions backfill), muscle data (#1075 backfill), `deleted:false`
// (resurrects soft-deleted twins) and nulling mediaURL. This script writes
// only the fields below, on only these docs.
//
// 1. RETIRE the 14 twins in RETIRED_STANDARD_LIBRARY_IDS — the apps' curation
//    shape: `mergedInto: <canonical>`, `deleted: true` (iOS/Android pickers
//    hide it), `deletedAt` (the backoffice library hides it), `deletedReason`.
//    Never deleted: 6 routines, 90 assignments and 1 log reference them, and
//    every resolver (iOS/Android fetchMapByIds, backoffice exercise-resolution)
//    follows `mergedInto`. Precondition, per the 2026-06-12 dangling-mergedInto
//    incident: the TARGET exists, is live and is not itself merged.
// 2. RENAME the twins that share a name but are different exercises:
//    - std-* Dips + warm-ups → the source's display names (#460);
//    - the numeric Dips, which #460 couldn't reach (not in the TS source):
//      0251/0009 are the chest-primary twins (muscleGroups chest-first, same
//      gifs as std-chest-dip-*), 0814/0019 the triceps-primary ones. Without
//      this the pickers would offer "Dip", "Chest Dip" and "Triceps Dip".
//    Precondition: the doc still has the OLD name, so a coach-facing edit made
//    since is never overwritten.
//
// Idempotent: a doc already in its target state is reported and skipped.
// Every doc it would touch is backed up to scripts/backups/ before writing.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import {
  RETIRED_STANDARD_LIBRARY_IDS,
  STANDARD_LIBRARY_EXERCISES,
} from "../src/lib/gc-fitness/exercise-standard-library.ts";

const COLLECTION = "exercises";
const APPLY = process.argv.includes("--apply");

type Name = { en: string; es: string };

const STD_RENAMES = [
  "std-chest-dip-bodyweight",
  "std-chest-dip-machine",
  "std-triceps-dip-bodyweight",
  "std-triceps-dip-machine",
  "std-warmup-high-knees-bodyweight",
  "std-warmup-mountain-climber-bodyweight",
  "std-warmup-jump-rope-rope",
];

const NUMERIC_RENAMES: Record<string, { from: string; to: Name }> = {
  "0251": { from: "Dip (Bodyweight)", to: { en: "Chest Dip (Bodyweight)", es: "Fondo para pecho (Peso corporal)" } },
  "0009": { from: "Dip (Machine)", to: { en: "Chest Dip (Machine)", es: "Fondo para pecho (Maquina)" } },
  "0814": { from: "Dip (Bodyweight)", to: { en: "Triceps Dip (Bodyweight)", es: "Fondo para triceps (Peso corporal)" } },
  "0019": { from: "Dip (Machine)", to: { en: "Triceps Dip (Machine)", es: "Fondo para triceps (Maquina)" } },
};

// The names #460 replaced, per std id (the precondition for renaming it).
const STD_OLD_NAMES: Record<string, string> = {
  "std-chest-dip-bodyweight": "Dip (Bodyweight)",
  "std-chest-dip-machine": "Dip (Machine)",
  "std-triceps-dip-bodyweight": "Dip (Bodyweight)",
  "std-triceps-dip-machine": "Dip (Machine)",
  "std-warmup-high-knees-bodyweight": "High Knees (Bodyweight)",
  "std-warmup-mountain-climber-bodyweight": "Mountain Climber (Bodyweight)",
  "std-warmup-jump-rope-rope": "Jump Rope (Rope)",
};

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase admin credentials in environment.");
  }
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKey, "base64").toString("utf8"),
    }),
  });
}

const isLive = (d: Record<string, unknown> | undefined) =>
  !!d && d.deletedAt == null && d.deleted !== true;

async function main() {
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} against ${projectId}`);

  const ids = [
    ...Object.keys(RETIRED_STANDARD_LIBRARY_IDS),
    ...Object.values(RETIRED_STANDARD_LIBRARY_IDS),
    ...STD_RENAMES,
    ...Object.keys(NUMERIC_RENAMES),
  ];
  const snaps = await Promise.all(ids.map((id) => db.collection(COLLECTION).doc(id).get()));
  const docs = new Map(snaps.map((s) => [s.id, s.exists ? (s.data() as Record<string, unknown>) : undefined]));

  const writes: Array<{ id: string; data: Record<string, unknown>; why: string }> = [];
  const problems: string[] = [];

  for (const [retired, canonical] of Object.entries(RETIRED_STANDARD_LIBRARY_IDS)) {
    const r = docs.get(retired);
    const c = docs.get(canonical);
    if (!r) { problems.push(`${retired}: missing in prod`); continue; }
    if (!isLive(c) || (c && typeof c.mergedInto === "string" && c.mergedInto)) {
      problems.push(`${retired}: target ${canonical} is not a live, unmerged doc`);
      continue;
    }
    if (r.mergedInto === canonical && r.deleted === true && r.deletedAt != null) {
      console.log(`  = ${retired} already retired → ${canonical}`);
      continue;
    }
    if (typeof r.mergedInto === "string" && r.mergedInto && r.mergedInto !== canonical) {
      problems.push(`${retired}: already merged into ${r.mergedInto}, expected ${canonical}`);
      continue;
    }
    writes.push({
      id: retired,
      why: `retire → ${canonical}`,
      data: {
        mergedInto: canonical,
        deleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        deletedReason: "duplicate-standard-library-twin (#451)",
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  const renames: Array<{ id: string; from: string; to: Name; keywords?: string[] }> = [
    ...STD_RENAMES.map((id) => {
      const source = STANDARD_LIBRARY_EXERCISES.find((e) => e.exerciseId === id);
      if (!source) throw new Error(`${id} not in the standard library source`);
      return { id, from: STD_OLD_NAMES[id], to: source.name, keywords: [...source.keywords] };
    }),
    ...Object.entries(NUMERIC_RENAMES).map(([id, r]) => ({ id, from: r.from, to: r.to })),
  ];
  for (const r of renames) {
    const d = docs.get(r.id);
    const name = d?.name as Partial<Name> | undefined;
    if (!d) { problems.push(`${r.id}: missing in prod`); continue; }
    if (name?.en === r.to.en && name?.es === r.to.es) {
      console.log(`  = ${r.id} already "${r.to.en}"`);
      continue;
    }
    if (name?.en !== r.from) {
      problems.push(`${r.id}: name is "${name?.en}", expected "${r.from}" — edited since? not touching it`);
      continue;
    }
    writes.push({
      id: r.id,
      why: `rename "${r.from}" → "${r.to.en}"`,
      data: {
        name: r.to,
        ...(r.keywords ? { keywords: r.keywords } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  for (const w of writes) console.log(`  ${APPLY ? "→" : "would"} ${w.id}: ${w.why}`);
  if (problems.length) {
    console.error(`\n${problems.length} precondition problem(s) — NOTHING written:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exitCode = 1;
    return;
  }
  if (!APPLY) {
    console.log(`\n${writes.length} write(s) planned. Re-run with --apply to write.`);
    return;
  }
  if (writes.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  const backupDir = path.resolve(process.cwd(), "scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `standard-library-curation-451-${Date.now()}.json`);
  const backup = Object.fromEntries(writes.map((w) => [w.id, docs.get(w.id)]));
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup of ${writes.length} doc(s): ${path.relative(process.cwd(), backupPath)}`);

  const batch = db.batch();
  for (const w of writes) batch.set(db.collection(COLLECTION).doc(w.id), w.data, { merge: true });
  await batch.commit();

  // Verify by re-reading: retired docs point at live targets, names landed.
  let bad = 0;
  for (const w of writes) {
    const after = (await db.collection(COLLECTION).doc(w.id).get()).data() ?? {};
    if (typeof w.data.mergedInto === "string") {
      const target = (await db.collection(COLLECTION).doc(w.data.mergedInto).get()).data();
      const ok = after.mergedInto === w.data.mergedInto && after.deleted === true && after.deletedAt != null && isLive(target);
      if (!ok) { bad++; console.error(`  ✗ ${w.id} did not land as retired`); }
    } else {
      const want = w.data.name as Name;
      const got = after.name as Partial<Name> | undefined;
      if (got?.en !== want.en || got?.es !== want.es) { bad++; console.error(`  ✗ ${w.id} name did not land`); }
    }
  }
  console.log(bad ? `\n${bad} verification failure(s)` : `\n✓ ${writes.length} write(s) applied and verified.`);
  if (bad) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
