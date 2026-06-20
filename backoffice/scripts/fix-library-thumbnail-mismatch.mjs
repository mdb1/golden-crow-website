// fix-library-thumbnail-mismatch.mjs
//
// Issue #356 ("wrong gif for Fondo en banco") — and the latent class behind it.
//
// PR #164 corrected the `gifUrl` of mis-matched standard-library exercises
// (e.g. Bench Dip / "Fondo en banco" was re-pointed from gif 0259 — a
// close-grip push-up — to the correct 0129). But that pass only wrote
// `gifUrl`; it never updated `thumbnailURL`, which still pointed at the
// ORIGINAL wrong gif (almost always the gif whose csvId equals the doc id —
// the fuzzy-matcher's first guess). Surfaces that render `thumbnailURL`
// (cards / still-frame thumbnails) therefore kept showing the wrong movement
// even though the animated preview (`gifUrl`) was correct.
//
// `gifUrl` is the corrected source of truth. This script aligns the stale
// `thumbnailURL` to it: for every exercise doc whose `gifUrl` and
// `thumbnailURL` reference DIFFERENT `library-gifs/<csvId>.gif` assets, it
// sets `thumbnailURL := gifUrl` (verbatim — same URL form, no re-upload, no
// token rotation). Docs that already agree, or that don't use a library-gif
// on both fields, are left untouched. Fully idempotent.
//
// Usage (from backoffice/):
//   node scripts/fix-library-thumbnail-mismatch.mjs           # dry run
//   node scripts/fix-library-thumbnail-mismatch.mjs --apply   # write + backup
//
// Run AFTER the regression-prevention change in sync-standard-exercise-gifs.ts
// (which now writes thumbnailURL alongside gifUrl) so a future full re-sync
// keeps the two fields aligned.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const COLLECTION = "exercises";

// Extract the library-gifs csvId from either URL form we use in prod:
//   https://.../o/exercises%2Flibrary-gifs%2F0129.gif?...   (tokenless/token)
//   gs://<bucket>/exercises/library-gifs/0129.gif
// Returns null for any URL that isn't a library-gifs asset (external gifs,
// signed fexd previews, nulls) — those are intentionally left alone.
function libraryGifId(url) {
  if (!url) return null;
  const m = String(url).match(/library-gifs[/%2F]+(\d+)\.gif/i);
  return m ? m[1] : null;
}

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  initializeApp({
    credential: cert({
      projectId: env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID,
      clientEmail: env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: Buffer.from(
        env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY,
        "base64",
      ).toString("utf8"),
    }),
  });
  const db = getFirestore();

  const snap = await db.collection(COLLECTION).get();
  const plan = [];
  const backup = [];

  for (const doc of snap.docs) {
    const x = doc.data();
    const gifId = libraryGifId(x.gifUrl);
    const thumbId = libraryGifId(x.thumbnailURL);
    // Only act when BOTH are library gifs and they disagree. gifUrl wins.
    if (!gifId || !thumbId || gifId === thumbId) continue;

    plan.push({
      docId: doc.id,
      name: x.name?.en ?? x.name?.es ?? "",
      thumbWas: thumbId,
      thumbNow: gifId,
    });
    backup.push({
      docId: doc.id,
      name: x.name?.es ?? x.name?.en ?? "",
      before: { gifUrl: x.gifUrl ?? null, thumbnailURL: x.thumbnailURL ?? null },
    });

    if (!APPLY) continue;
    await doc.ref.set(
      { thumbnailURL: x.gifUrl, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  console.log(
    JSON.stringify({ apply: APPLY, count: plan.length, plan }, null, 2),
  );

  if (APPLY) {
    if (!existsSync("scripts/backups")) {
      mkdirSync("scripts/backups", { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const p = `scripts/backups/thumbnail-mismatch-backup-${stamp}.json`;
    writeFileSync(p, JSON.stringify(backup, null, 2));
    console.log(`\nApplied ${plan.length} doc(s). Backup written: ${p}`);
  } else {
    console.log("\nDRY RUN — no writes. Re-run with --apply.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
