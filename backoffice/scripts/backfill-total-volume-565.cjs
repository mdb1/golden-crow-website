/**
 * backfill-total-volume-565.cjs — gc-fitness issue #565.
 *
 * #565 changed the volume rule: EVERY set type now contributes. Warm-up /
 * failure / drop set all count exactly like a normal set; `set_type` became a
 * display marker (the W/F/D letter) instead of a multiplier. Before it, a
 * warm-up contributed 0.
 *
 * `workout_logs.total_volume_kg` is computed ONCE at finalize and FROZEN on the
 * doc — the iOS `WorkoutProgressCharts` volume trend, the Android
 * `ProgressAggregator` daily/weekly volume and the backoffice history rows all
 * read that stored number rather than re-summing `sets[]`. So without this
 * script a client's chart would step: everything before the #565 release keeps
 * its warm-up-excluded total, everything after includes warm-ups. This
 * recomputes the historical logs under the new rule so the series is continuous.
 *
 * FORMULA (the exact twin of iOS `WorkoutVolume.setVolumeKg`, Android
 * `WorkoutVolume.setVolumeKg` and backoffice `computeTotalVolumeKg`):
 *
 *     time set (duration_seconds > 0) → weight_kg × (duration_seconds / 60)
 *     reps set                        → weight_kg × reps
 *     Σ over EVERY set in sets[] — no set-type filter.
 *
 * Only `status: "completed"` logs are touched (an in-progress log has no
 * meaningful stored total and will be computed at finalize by the new code).
 * Only `total_volume_kg` and `updatedAt` are written; `sets[]` is never
 * rewritten, so the logged record itself is untouched.
 *
 * Idempotent — a doc already carrying the new total differs by < 0.01 kg and is
 * skipped — and SAFE BY DEFAULT: it reports only unless you pass --apply.
 *
 *   node scripts/backfill-total-volume-565.cjs                  # dry run
 *   node scripts/backfill-total-volume-565.cjs --apply          # write
 *   node scripts/backfill-total-volume-565.cjs --client=<uid>   # one client
 *
 * Run from `backoffice/` (reads admin creds from .env.local, same as the other
 * scripts). Run it ONCE, AFTER the #565 apps are released — a client still on an
 * old build would keep writing warm-up-excluded totals for new workouts.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/** Below this the stored total already matches — treat as no-op (float dust). */
const EPSILON_KG = 0.01;
const PAGE_SIZE = 400;

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

/** Tolerant numeric coercion — the wire has carried both numbers and strings. */
function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Σ volume over EVERY set (#565). Twin of WorkoutVolume.setVolumeKg — accepts
 * both the snake_case wire keys and the camelCase fallbacks the readers accept.
 */
function totalVolumeKg(sets) {
  let total = 0;
  for (const s of sets) {
    const weight = num(s.weight_kg ?? s.weight);
    const duration = num(s.duration_seconds ?? s.durationSeconds);
    total += duration > 0 ? weight * (duration / 60) : weight * num(s.reps);
  }
  return Math.round(total * 100) / 100;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const clientArg = args.find((a) => a.startsWith("--client="));
  const clientId = clientArg ? clientArg.split("=")[1] : null;

  loadEnv();
  initAdmin();
  const db = getFirestore();

  console.log(
    `\n#565 total_volume_kg backfill${clientId ? ` — client ${clientId}` : ""}` +
      `${apply ? "  [APPLY]" : "  [DRY RUN — no writes]"}\n`,
  );

  const stats = {
    scanned: 0,
    skippedNotCompleted: 0,
    skippedNoSets: 0,
    alreadyCorrect: 0,
    changed: 0,
    written: 0,
    deltaKg: 0,
  };

  let cursor = null;
  for (;;) {
    // `__name__` ordering + startAfter pages the whole collection with no
    // composite index; the optional clientId equality rides the automatic
    // single-field index.
    let q = db.collection("workout_logs");
    if (clientId) q = q.where("clientId", "==", clientId);
    q = q.orderBy("__name__").limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1];

    for (const doc of page.docs) {
      stats.scanned++;
      const data = doc.data();

      if (data.status !== "completed") {
        stats.skippedNotCompleted++;
        continue;
      }
      const sets = Array.isArray(data.sets) ? data.sets : null;
      if (!sets || sets.length === 0) {
        stats.skippedNoSets++;
        continue;
      }

      const next = totalVolumeKg(sets);
      const current = num(data.total_volume_kg ?? data.totalVolumeKg);
      if (Math.abs(next - current) < EPSILON_KG) {
        stats.alreadyCorrect++;
        continue;
      }

      stats.changed++;
      stats.deltaKg += next - current;
      console.log(
        `  · ${doc.id}  ${current.toFixed(1)} kg → ${next.toFixed(1)} kg  ` +
          `(+${(next - current).toFixed(1)}, ${sets.length} sets)`,
      );

      if (apply) {
        await doc.ref.update({
          total_volume_kg: next,
          updatedAt: FieldValue.serverTimestamp(),
        });
        stats.written++;
      }
    }

    if (page.size < PAGE_SIZE) break;
  }

  console.log("\n--- summary ---");
  console.log(`logs scanned             ${stats.scanned}`);
  console.log(`  skipped (not completed)${String(stats.skippedNotCompleted).padStart(6)}`);
  console.log(`  skipped (no sets)      ${String(stats.skippedNoSets).padStart(6)}`);
  console.log(`  already correct        ${String(stats.alreadyCorrect).padStart(6)}`);
  console.log(`  needing a new total    ${String(stats.changed).padStart(6)}`);
  console.log(`  written                ${String(stats.written).padStart(6)}`);
  console.log(`total volume added       ${stats.deltaKg.toFixed(1)} kg`);
  if (!apply && stats.changed > 0) {
    console.log("\nDry run — re-run with --apply to write.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
