// fix-standard-library-gif-equipment.mjs
//
// One-off, IDEMPOTENT data fix for the `exercises` standard library.
//
// PROBLEM: `sync-standard-exercise-gifs.ts` matches gifs to exercises by NAME
// similarity, with equipment only a soft +0.2 bonus. When the gif dataset has
// no same-equipment clip for a movement, a wrong-equipment gif wins — e.g.
// "Thruster (Mancuerna)" shows the barbell thruster, "Press de suelo
// (Mancuerna)" shows the barbell floor press, "Overhead Extension (Dumbbell)"
// shows a swiss-ball clip. Audited: 65 / 282 standard-library docs.
//
// RULE (operator decision — "better no gif than a wrong gif"):
//   For each standard-library doc, look at the gif it actually displays
//   (gifUrl ?? imageUrl ?? thumbnailURL) and map its csvId → equipment via the
//   gif CSV. If that equipment does NOT match the doc's equipment:
//     a) if `thumbnailURL` (the per-doc <docId>.gif) HAS the right equipment
//        and its asset exists → set gifUrl = thumbnailURL (show the correct one);
//     b) otherwise → null gifUrl + imageUrl + thumbnailURL (show the placeholder).
//   none ↔ bodyweight are treated as compatible (not a mismatch).
//
// SAFE: only touches docs tagged `standard-library`; dry-run by default; writes
// a full before-state backup to scripts/backups/ before applying; idempotent
// (a second run finds nothing to change). Never deletes docs.
//
// Usage (from backoffice/):
//   node scripts/fix-standard-library-gif-equipment.mjs            # dry run
//   node scripts/fix-standard-library-gif-equipment.mjs --apply    # write

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const CSV_PATH =
  process.env.GC_FITNESS_GIF_CSV_PATH ??
  "/Users/manu/Desktop/exercises-gifs-main/exercises.csv";
const ASSETS_DIR =
  process.env.GC_FITNESS_GIF_ASSETS_DIR ??
  "/Users/manu/Desktop/exercises-gifs-main/assets";
const APPLY = process.argv.includes("--apply");

// Mirrors EQUIPMENT_MAP in sync-standard-exercise-gifs.ts.
const EQUIPMENT_MAP = {
  barbell: "barbell",
  bench: "bench",
  "body weight": "bodyweight",
  cable: "cable",
  dumbbell: "dumbbell",
  kettlebell: "kettlebell",
  "leverage machine": "machine",
  "smith machine": "smith",
  "olympic barbell": "barbell",
  "ez barbell": "barbell",
  "resistance band": "resistance_band",
  band: "resistance_band",
  "medicine ball": "medicine_ball",
  rope: "rope",
  "stability ball": "swiss_ball",
  weighted: "discs",
  assisted: "machine",
  "trap bar": "barbell",
  bodyweight: "bodyweight",
};

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function parseCsv(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(",");
  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const byId = new Map();
  for (const l of lines) {
    const v = parseLine(l);
    const row = Object.fromEntries(headers.map((h, i) => [h, v[i] ?? ""]));
    byId.set(row.id, {
      equipment: (row.equipment || "").trim().toLowerCase(),
      name: (row.name || "").toLowerCase(),
    });
  }
  return byId;
}

// Apparatus the gif NAME reveals even when the `equipment` column matches.
// A gif "…on exercise ball" is a swiss-ball variant; if the exercise isn't a
// swiss-ball exercise that gif is the wrong movement (the Overhead Extension
// (Dumbbell) → ball french-press case). Kept narrow to ball/bosu — terms like
// "bench" are NOT used here because a dumbbell press legitimately shows a bench.
const BALL_TERMS = ["exercise ball", "stability ball", "swiss ball", "yoga ball", "bosu"];
function gifNameImpliesBall(csvRow) {
  return csvRow ? BALL_TERMS.some((t) => csvRow.name.includes(t)) : false;
}

const csvIdOf = (url) => {
  if (!url || typeof url !== "string") return null;
  const m = url.match(/library-gifs(?:%2F|\/)([A-Za-z0-9_-]+)\.gif/);
  return m ? m[1] : null;
};

// Equipment compatibility: none and bodyweight are interchangeable.
const compatible = (gifEq, docEq) => {
  if (!gifEq) return null; // unknown → can't judge
  const eq = new Set(docEq);
  if (eq.has(gifEq)) return true;
  if ((gifEq === "bodyweight" || gifEq === "none") && (eq.has("bodyweight") || eq.has("none")))
    return true;
  return false;
};

async function main() {
  const env = loadEnv();
  initializeApp({
    credential: cert({
      projectId: env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID,
      clientEmail: env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: Buffer.from(env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY, "base64").toString("utf8"),
    }),
  });
  const db = getFirestore();
  const csv = parseCsv(CSV_PATH);
  const eqOf = (id) => (id && csv.get(id) ? EQUIPMENT_MAP[csv.get(id).equipment] : undefined);
  // True when the gif at `csvId` is wrong for `docEq`: either an equipment
  // mismatch OR a ball-apparatus the exercise isn't.
  const gifIsWrong = (csvId, docEq) => {
    const row = csv.get(csvId);
    const eqWrong = compatible(eqOf(csvId), docEq) === false;
    const ballWrong = gifNameImpliesBall(row) && !docEq.includes("swiss_ball");
    return { eqWrong, ballWrong, wrong: eqWrong || ballWrong };
  };

  const snap = await db.collection("exercises").where("tags", "array-contains", "standard-library").get();

  const reverts = []; // gifUrl := thumbnailURL
  const clears = []; // null all media
  const backup = [];

  for (const d of snap.docs) {
    const x = d.data();
    const docEq = Array.isArray(x.equipment) ? x.equipment : [];
    const effective = x.gifUrl || x.imageUrl || x.thumbnailURL || null;
    const effId = csvIdOf(effective);
    if (effId == null) continue; // no resolvable gif → leave (already placeholder)
    if (!gifIsWrong(effId, docEq).wrong) continue; // correct → leave

    // Wrong gif. Can the per-doc thumbnailURL rescue it (right movement + asset)?
    const thumbId = csvIdOf(x.thumbnailURL);
    const thumbOk =
      thumbId != null &&
      !gifIsWrong(thumbId, docEq).wrong &&
      eqOf(thumbId) != null && // require KNOWN-correct equipment, not just "undeterminable"
      existsSync(`${ASSETS_DIR}/${thumbId}.gif`) &&
      x.thumbnailURL !== x.gifUrl;

    backup.push({
      id: d.id,
      name: x.name?.es || x.name?.en || "",
      docEquipment: docEq,
      before: { gifUrl: x.gifUrl ?? null, imageUrl: x.imageUrl ?? null, thumbnailURL: x.thumbnailURL ?? null },
    });

    if (thumbOk) {
      reverts.push({ id: d.id, name: x.name?.es || x.name?.en, gifUrl: x.thumbnailURL });
    } else {
      clears.push({ id: d.id, name: x.name?.es || x.name?.en });
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        totalStandardLibrary: snap.size,
        willRevertToThumbnail: reverts.length,
        willClearToPlaceholder: clears.length,
        revertSample: reverts.slice(0, 10),
        clearSample: clears.slice(0, 15).map((c) => `${c.id} ${c.name}`),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("\nDRY RUN — no writes. Re-run with --apply to write.");
    return;
  }

  if (!existsSync("scripts/backups")) mkdirSync("scripts/backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `scripts/backups/fix-gif-equipment-backup-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup written: ${backupPath}`);

  let batch = db.batch();
  let n = 0;
  const flush = async () => {
    if (n > 0) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  };
  for (const r of reverts) {
    batch.set(
      db.collection("exercises").doc(r.id),
      { gifUrl: r.gifUrl, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    if (++n >= 400) await flush();
  }
  for (const c of clears) {
    batch.set(
      db.collection("exercises").doc(c.id),
      { gifUrl: null, imageUrl: null, thumbnailURL: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    if (++n >= 400) await flush();
  }
  await flush();
  console.log(`Applied: ${reverts.length} reverted, ${clears.length} cleared.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
