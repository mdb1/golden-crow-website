#!/usr/bin/env tsx
/**
 * audit-exercise-library.ts — READ-ONLY exercise library auditor for the
 * Golden Crow Fitness Firestore project (gcfitness-3476b).
 *
 * Task A deliverable for plan 260522-hi5. This script is intentionally one-shot
 * and throwaway: it reads /exercises via firebase-admin, runs the hybrid
 * auto-filter (movement-pattern buckets + media-completeness + near-duplicate
 * dedupe), and writes an ALLOWLIST-PROPOSAL.md file to the gc-fitness planning
 * tree. NO Firestore writes — confirmed by grep: every `db.collection` access
 * here ends in `.get()`. The `firebase-admin` binding uses the SAME env-var
 * contract as backoffice/scripts/seed-gc-fitness-library.cjs (project id +
 * cert credentials base64-decoded).
 *
 * Usage:
 *   npx tsx audit-exercise-library.ts --output <path-to-markdown>
 *
 * If --output is omitted, the proposal is printed to stdout.
 *
 * Re-used in Task D as the post-curation cross-check.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Env loading + admin init (mirrors backoffice/scripts/seed-gc-fitness-library.cjs)
// ---------------------------------------------------------------------------

function loadEnv(): void {
  // The script lives at golden-crow-website/scripts/gc-fitness/, so the
  // backoffice .env.local is two directories up.
  const candidates = [
    path.resolve(__dirname, "..", "..", "backoffice", ".env.local"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "backoffice", ".env.local"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error("Missing GC Fitness Firebase Admin env vars.");
  }

  const existing = getApps().find((a) => a.name === "audit-gc-fitness");
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
    },
    "audit-gc-fitness",
  );
}

// ---------------------------------------------------------------------------
// CLI arg parser
// ---------------------------------------------------------------------------

interface CliArgs {
  output: string | null;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output" || a === "-o") {
      args.output = argv[++i] ?? null;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx audit-exercise-library.ts [--output <path>]\n\n" +
          "Reads /exercises from Firestore (project gcfitness-3476b) and writes\n" +
          "an ALLOWLIST-PROPOSAL.md to <path>. If --output is omitted, the\n" +
          "proposal is printed to stdout. NO Firestore writes.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Exercise doc shape (Firestore wire format)
// ---------------------------------------------------------------------------

interface NameLocalized {
  en?: string;
  es?: string;
}

interface DescriptionLocalized {
  en?: string;
  es?: string;
}

interface ExerciseDoc {
  id: string;
  name?: NameLocalized;
  description?: DescriptionLocalized;
  muscleGroups?: string[];
  equipment?: string[];
  mediaURL?: string | null;
  thumbnailURL?: string | null;
  source?: string;
  ownerId?: string | null;
  deleted?: boolean;
  deletedAt?: unknown;
  license?: { spdx?: string; author?: string; sourceUrl?: string };
  sourceMedia?: { wgerId?: number; imageUrl?: string | null; videoUrl?: string | null };
}

// ---------------------------------------------------------------------------
// Movement-pattern buckets + canonical exercise names
// ---------------------------------------------------------------------------

interface Bucket {
  key: string;
  label: string;
  muscleHints: string[];     // first-muscle-group hints
  equipmentHints: string[];  // typical equipment patterns
  canonical: string[];       // ideal canonical exercises (for human review)
}

const BUCKETS: Bucket[] = [
  {
    key: "squat",
    label: "Squat pattern",
    muscleHints: ["quadriceps", "legs", "glutes"],
    equipmentHints: ["barbell", "dumbbell", "bodyweight", "kettlebell"],
    canonical: [
      "Back Squat",
      "Front Squat",
      "Goblet Squat",
      "Bodyweight Squat",
      "Bulgarian Split Squat",
    ],
  },
  {
    key: "hinge",
    label: "Hinge pattern",
    muscleHints: ["hamstrings", "glutes", "back"],
    equipmentHints: ["barbell", "dumbbell", "kettlebell"],
    canonical: [
      "Conventional Deadlift",
      "Romanian Deadlift",
      "Sumo Deadlift",
      "Kettlebell Swing",
      "Hip Thrust",
      "Good Morning",
    ],
  },
  {
    key: "horizontal-push",
    label: "Horizontal push",
    muscleHints: ["chest", "triceps", "shoulders"],
    equipmentHints: ["barbell", "dumbbell", "bodyweight", "bench"],
    canonical: [
      "Bench Press",
      "Dumbbell Bench Press",
      "Incline Dumbbell Press",
      "Push-up",
      "Dip",
    ],
  },
  {
    key: "vertical-push",
    label: "Vertical push",
    muscleHints: ["shoulders", "triceps"],
    equipmentHints: ["barbell", "dumbbell"],
    canonical: ["Overhead Press", "Seated Dumbbell Press", "Arnold Press", "Push Press"],
  },
  {
    key: "horizontal-pull",
    label: "Horizontal pull",
    muscleHints: ["back", "biceps"],
    equipmentHints: ["barbell", "dumbbell", "cable"],
    canonical: ["Bent-Over Row", "Dumbbell Row", "Cable Row", "Inverted Row", "T-Bar Row"],
  },
  {
    key: "vertical-pull",
    label: "Vertical pull",
    muscleHints: ["back", "biceps"],
    equipmentHints: ["bodyweight", "cable", "pull_up_bar"],
    canonical: ["Pull-up", "Chin-up", "Lat Pulldown", "Assisted Pull-up"],
  },
  {
    key: "single-leg",
    label: "Single-leg",
    muscleHints: ["legs", "glutes", "quadriceps", "hamstrings"],
    equipmentHints: ["bodyweight", "dumbbell"],
    canonical: ["Lunge", "Reverse Lunge", "Step-up", "Walking Lunge"],
  },
  {
    key: "core-stability",
    label: "Core stability",
    muscleHints: ["core", "abs"],
    equipmentHints: ["bodyweight"],
    canonical: ["Plank", "Side Plank", "Dead Bug", "Bird Dog", "Hollow Hold"],
  },
  {
    key: "core-dynamic",
    label: "Core dynamic",
    muscleHints: ["core", "abs"],
    equipmentHints: ["bodyweight", "cable"],
    canonical: ["Crunch", "Hanging Leg Raise", "Cable Woodchop", "Russian Twist"],
  },
  {
    key: "arms-isolation",
    label: "Arms isolation",
    muscleHints: ["biceps", "triceps", "forearms", "arms"],
    equipmentHints: ["barbell", "dumbbell", "cable"],
    canonical: ["Bicep Curl", "Hammer Curl", "Tricep Pushdown", "Skull Crusher", "Cable Curl"],
  },
  {
    key: "shoulders-isolation",
    label: "Shoulders isolation",
    muscleHints: ["shoulders"],
    equipmentHints: ["dumbbell", "cable"],
    canonical: ["Lateral Raise", "Front Raise", "Rear Delt Fly", "Face Pull"],
  },
  {
    key: "calves",
    label: "Calves",
    muscleHints: ["calves"],
    equipmentHints: ["barbell", "dumbbell", "machine", "bodyweight"],
    canonical: ["Standing Calf Raise", "Seated Calf Raise"],
  },
  {
    key: "cardio-conditioning",
    label: "Cardio / conditioning",
    muscleHints: ["cardio"],
    equipmentHints: ["bodyweight"],
    canonical: ["Burpee", "Mountain Climber", "Jumping Jacks", "High Knees"],
  },
  {
    key: "mobility-other",
    label: "Mobility / other",
    muscleHints: [],
    equipmentHints: [],
    canonical: ["Cat-Cow", "World's Greatest Stretch", "90/90 Hip Switch"],
  },
];

// ---------------------------------------------------------------------------
// Manual exclusion list — names (case-insensitive substring match) that
// Claude flags as low-utility / regional / obscure even if they pass the
// other auto-filter gates. Tweaked iteratively while running the auditor.
// ---------------------------------------------------------------------------

const MANUAL_EXCLUSIONS: string[] = [
  "axe hold",
  "axe-hold",
  "captain",
  "wrestler",
  "windshield wiper",
  "scissors",
  "donkey kicks",
  "donkey kick",
  "around the world",
  "scissor",
  "salutation",
  "sun salutation",
  "tibialis",
  "drag curl",
  "concentration curl",
  "preacher curl",
  "21s",
  "21'",
  "21 ",
  "iron cross",
  "guillotine",
  "around-the-world",
  "kipping",
  "muscle up",
  "muscle-up",
  "flutter kick",
  "spider curl",
  "zottman",
  "zercher",
  "jefferson",
  "thruster",
  "clean and jerk",
  "snatch",
  "power clean",
  "hang clean",
  "turkish",
  "windmill",
  "wall walk",
  "frog stand",
  "pistol squat",
  "shrimp squat",
  "hindu squat",
  "hindu push",
  "yoga",
  "pilates",
  "tabata",
  "burpee box",
  "wall ball",
  "ball slam",
  "tire flip",
  "farmer",
  "yoke",
  "atlas",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function bucketFor(doc: ExerciseDoc): string {
  const muscles = (doc.muscleGroups ?? []).map((m) => m.toLowerCase());
  const equipment = (doc.equipment ?? []).map((e) => e.toLowerCase());
  const nameLower = normName(doc.name?.en ?? "");

  // Name-level overrides — strongest signal.
  if (/\bsquat\b/.test(nameLower)) return "squat";
  if (/\bdeadlift|\brdl\b|\bswing\b|\bhip thrust|good morning/.test(nameLower)) return "hinge";
  if (/\bbench press|push.?up|chest dip|\bdip\b|incline.*press/.test(nameLower))
    return "horizontal-push";
  if (/overhead press|shoulder press|arnold press|push press|military press/.test(nameLower))
    return "vertical-push";
  if (/\brow\b|\bt.?bar\b/.test(nameLower)) return "horizontal-pull";
  if (/pull.?up|chin.?up|lat pulldown|pulldown/.test(nameLower)) return "vertical-pull";
  if (/\blunge\b|step.?up|split squat/.test(nameLower)) return "single-leg";
  if (/\bplank\b|dead bug|bird dog|hollow hold|side plank/.test(nameLower))
    return "core-stability";
  if (/\bcrunch\b|leg raise|woodchop|russian twist|sit.?up/.test(nameLower))
    return "core-dynamic";
  if (/curl|tricep|skull crusher|pushdown|extension/.test(nameLower) && !/leg/.test(nameLower))
    return "arms-isolation";
  if (/lateral raise|front raise|rear delt|face pull|delt fly|reverse fly/.test(nameLower))
    return "shoulders-isolation";
  if (/calf|calves/.test(nameLower)) return "calves";
  if (/burpee|mountain climber|jumping jack|high knee|jump rope/.test(nameLower))
    return "cardio-conditioning";

  // Muscle-group fallback.
  for (const b of BUCKETS) {
    if (b.muscleHints.length === 0) continue;
    if (muscles.some((m) => b.muscleHints.includes(m))) {
      const eqMatch =
        b.equipmentHints.length === 0 ||
        equipment.some((e) => b.equipmentHints.includes(e)) ||
        equipment.length === 0;
      if (eqMatch) return b.key;
    }
  }

  return "mobility-other";
}

interface AutoFilterFlags {
  missingName: boolean;
  shortDescription: boolean;
  emptyMuscleGroups: boolean;
  manualExclusion: boolean;
  alreadySoftDeleted: boolean;
}

function autoFilterFlags(doc: ExerciseDoc): AutoFilterFlags {
  const nameEn = (doc.name?.en ?? "").trim();
  const descEn = (doc.description?.en ?? "").trim();
  const muscles = doc.muscleGroups ?? [];
  const nameLower = nameEn.toLowerCase();
  return {
    missingName: nameEn.length === 0,
    shortDescription: descEn.length < 20,
    emptyMuscleGroups: muscles.length === 0,
    manualExclusion: MANUAL_EXCLUSIONS.some((tok) => nameLower.includes(tok)),
    alreadySoftDeleted: doc.deleted === true || doc.deletedAt != null,
  };
}

function shouldAutoDrop(flags: AutoFilterFlags): { drop: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (flags.missingName) reasons.push("missing name.en");
  if (flags.emptyMuscleGroups) reasons.push("no muscle groups");
  if (flags.manualExclusion) reasons.push("manual-exclusion list");
  if (flags.alreadySoftDeleted) reasons.push("already soft-deleted (legacy)");
  // shortDescription is informational only — it does NOT trigger a hard drop;
  // it surfaces in the proposal so a human can decide. (Many wger records have
  // short descriptions but are still valuable canonical exercises.)
  return { drop: reasons.length > 0, reasons };
}

interface DedupePair {
  loser: ExerciseDoc;
  surviving: ExerciseDoc;
  distance: number;
  reason: string;
}

function findDedupePairs(docs: ExerciseDoc[]): DedupePair[] {
  const pairs: DedupePair[] = [];
  const used = new Set<string>();
  // Group by bucket + first muscle group + equipment-set signature to keep the
  // O(n^2) inner loop tractable.
  const groups = new Map<string, ExerciseDoc[]>();
  for (const doc of docs) {
    const muscle = (doc.muscleGroups ?? [])[0] ?? "_none_";
    const eq = [...(doc.equipment ?? [])].sort().join(",");
    const sig = `${muscle}|${eq}`;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(doc);
  }
  for (const docsInGroup of groups.values()) {
    if (docsInGroup.length < 2) continue;
    for (let i = 0; i < docsInGroup.length; i++) {
      for (let j = i + 1; j < docsInGroup.length; j++) {
        const a = docsInGroup[i];
        const b = docsInGroup[j];
        if (used.has(a.id) || used.has(b.id)) continue;
        const na = normName(a.name?.en ?? "");
        const nb = normName(b.name?.en ?? "");
        if (!na || !nb) continue;
        const dist = levenshtein(na, nb);
        const tooClose = dist <= 3 && Math.abs(na.length - nb.length) <= 4;
        if (!tooClose) continue;
        // Pick survivor: prefer longer description; then media presence; then
        // shorter, cleaner name.
        const score = (doc: ExerciseDoc) =>
          (doc.description?.en?.length ?? 0) +
          (doc.mediaURL ? 200 : 0) +
          (doc.thumbnailURL ? 100 : 0) +
          (doc.sourceMedia?.videoUrl ? 200 : 0) +
          (doc.sourceMedia?.imageUrl ? 100 : 0) -
          Math.abs((doc.name?.en?.length ?? 100) - 20);
        const surviving = score(a) >= score(b) ? a : b;
        const loser = surviving === a ? b : a;
        pairs.push({
          loser,
          surviving,
          distance: dist,
          reason: `Levenshtein dist ${dist} on name.en (same muscle+equipment group); kept the doc with better media + description.`,
        });
        used.add(loser.id);
        used.add(surviving.id);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Bucket-quota enforcement — caps the survivor count from any single bucket
// to keep the curated library balanced (target ~60-80 total).
// ---------------------------------------------------------------------------

const BUCKET_QUOTA: Record<string, number> = {
  squat: 7,
  hinge: 7,
  "horizontal-push": 8,
  "vertical-push": 5,
  "horizontal-pull": 7,
  "vertical-pull": 5,
  "single-leg": 5,
  "core-stability": 5,
  "core-dynamic": 5,
  "arms-isolation": 8,
  "shoulders-isolation": 5,
  calves: 3,
  "cardio-conditioning": 5,
  "mobility-other": 5,
};

function scoreSurvivor(doc: ExerciseDoc): number {
  // Higher = better candidate to keep within a bucket.
  return (
    (doc.description?.en?.length ?? 0) +
    (doc.sourceMedia?.videoUrl ? 250 : 0) +
    (doc.sourceMedia?.imageUrl ? 150 : 0) +
    (doc.mediaURL ? 200 : 0) +
    (doc.thumbnailURL ? 100 : 0) +
    // Prefer shorter, canonical-sounding names.
    Math.max(0, 60 - Math.abs((doc.name?.en ?? "").length - 22))
  );
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function fmtTableHeader(headers: string[]): string {
  return `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |`;
}

function escTable(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function renderProposal(opts: {
  generatedAt: string;
  totalDocs: number;
  wgerDocs: number;
  trainerDocs: number;
  legacySoftDeleted: number;
  survivors: { doc: ExerciseDoc; bucket: string }[];
  drops: { doc: ExerciseDoc; reasons: string[]; bucket: string }[];
  dedupePairs: DedupePair[];
  esCoverage: { fromWger: number; needsClaude: number };
}): string {
  const lines: string[] = [];
  lines.push(`# Exercise Library Curation — Allowlist Proposal\n`);
  lines.push(`**Generated:** ${opts.generatedAt}`);
  lines.push(`**Audit source:** Live Firestore /exercises in project gcfitness-3476b`);
  lines.push(`**Total /exercises docs read:** ${opts.totalDocs}`);
  lines.push(`**Total wger-* docs read:** ${opts.wgerDocs}`);
  lines.push(`**Trainer-authored (custom-*) docs:** ${opts.trainerDocs} (NOT touched by this curation)`);
  lines.push(`**Already-soft-deleted (legacy):** ${opts.legacySoftDeleted}`);
  lines.push(`**Proposed survivors:** ${opts.survivors.length}`);
  lines.push(`**Proposed soft-deletes:** ${opts.drops.length}`);
  lines.push(`**Dedupe pairs (loser → surviving):** ${opts.dedupePairs.length}`);
  lines.push("");

  lines.push(`## Approved allowlist\n`);

  const byBucket = new Map<string, ExerciseDoc[]>();
  for (const { doc, bucket } of opts.survivors) {
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(doc);
  }

  for (const b of BUCKETS) {
    const docs = byBucket.get(b.key) ?? [];
    lines.push(`### ${b.label} (${docs.length})`);
    if (docs.length === 0) {
      lines.push("_No survivors in this bucket._\n");
      lines.push(`Canonical exercises this bucket should ideally contain: ${b.canonical.join(", ")}.\n`);
      continue;
    }
    lines.push(
      fmtTableHeader([
        "Doc id",
        "Name (EN)",
        "Name (ES)",
        "Muscle groups",
        "Equipment",
        "Media?",
        "Notes",
      ]),
    );
    docs.sort((a, b) => (a.name?.en ?? "").localeCompare(b.name?.en ?? ""));
    for (const d of docs) {
      const media =
        d.mediaURL || d.sourceMedia?.videoUrl
          ? "video"
          : d.thumbnailURL || d.sourceMedia?.imageUrl
            ? "image"
            : "—";
      const notes: string[] = [];
      const esEqualEn =
        (d.name?.es ?? "").trim().length > 0 &&
        (d.name?.es ?? "").trim().toLowerCase() ===
          (d.name?.en ?? "").trim().toLowerCase();
      const esEmpty = !(d.name?.es ?? "").trim();
      if (esEmpty) notes.push("needs ES translation (Claude-generated)");
      else if (esEqualEn) notes.push("ES==EN (acceptable if word is same in both; else Claude override)");
      const descShort = ((d.description?.en ?? "").trim().length ?? 0) < 20;
      if (descShort) notes.push("short description");
      lines.push(
        `| ${escTable(d.id)} | ${escTable(d.name?.en)} | ${escTable(d.name?.es)} | ${escTable(
          (d.muscleGroups ?? []).join(", "),
        )} | ${escTable((d.equipment ?? []).join(", "))} | ${escTable(media)} | ${escTable(
          notes.join("; "),
        )} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## Drop list (soft-deletes)\n`);
  lines.push(fmtTableHeader(["Doc id", "Name (EN)", "Reason", "Bucket if known"]));
  for (const { doc, reasons, bucket } of opts.drops.sort((a, b) =>
    (a.doc.name?.en ?? "").localeCompare(b.doc.name?.en ?? ""),
  )) {
    lines.push(
      `| ${escTable(doc.id)} | ${escTable(doc.name?.en)} | ${escTable(reasons.join("; "))} | ${escTable(
        bucket,
      )} |`,
    );
  }
  lines.push("");

  lines.push(`## Dedupe pairs\n`);
  if (opts.dedupePairs.length === 0) {
    lines.push("_No near-duplicate pairs detected._\n");
  } else {
    lines.push(
      fmtTableHeader([
        "Loser doc id",
        "Loser name",
        "Surviving doc id",
        "Surviving name",
        "Reason loser was chosen",
      ]),
    );
    for (const p of opts.dedupePairs) {
      lines.push(
        `| ${escTable(p.loser.id)} | ${escTable(p.loser.name?.en)} | ${escTable(
          p.surviving.id,
        )} | ${escTable(p.surviving.name?.en)} | ${escTable(p.reason)} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## Translation backfill plan\n`);
  lines.push(
    "For each survivor the proposed `name.es` is the value shown in the **Name (ES)** column above. If the value is empty or equal to the English string (and the word isn't legitimately the same in both languages, e.g., \"Plank\"), Task B's `curate-exercise-library.translations.json` must provide a Claude-generated override.",
  );
  lines.push("");
  lines.push(
    `**Translation coverage:** ${opts.esCoverage.fromWger}/${opts.survivors.length} survivors have a usable upstream ES (different from EN), ${opts.esCoverage.needsClaude}/${opts.survivors.length} need a Claude-generated entry in the translations JSON.`,
  );
  lines.push("");

  lines.push(`## Counts cross-check\n`);
  const totalAccounted = opts.survivors.length + opts.drops.length;
  lines.push(`- Survivors + Soft-deletes = ${opts.survivors.length} + ${opts.drops.length} = ${totalAccounted}`);
  lines.push(`- Total wger-* docs = ${opts.wgerDocs}`);
  lines.push(`- Match? ${totalAccounted === opts.wgerDocs ? "✓" : "✗ (mismatch — re-run audit)"}`);
  const dedupeLosersInDrops = opts.dedupePairs.every((p) =>
    opts.drops.some((d) => d.doc.id === p.loser.id),
  );
  const dedupeSurvivingInSurvivors = opts.dedupePairs.every((p) =>
    opts.survivors.some((s) => s.doc.id === p.surviving.id),
  );
  lines.push(
    `- Every dedupe loser is in the soft-delete list ${dedupeLosersInDrops ? "✓" : "✗"}`,
  );
  lines.push(
    `- Every dedupe surviving id is in the survivor list ${dedupeSurvivingInSurvivors ? "✓" : "✗"}`,
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write("Reading /exercises from Firestore (project gcfitness-3476b)...\n");
  // READ-ONLY: the only Firestore access is the line below. Grep this file for
  // .set( / .update( / .delete( / .commit( — there are none.
  const snap = await db.collection("exercises").get();

  const allDocs: ExerciseDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as ExerciseDoc[];
  const wgerDocs = allDocs.filter((d) => d.id.startsWith("wger-"));
  const trainerDocs = allDocs.filter((d) => !d.id.startsWith("wger-"));
  const legacySoftDeleted = wgerDocs.filter((d) => d.deleted === true || d.deletedAt != null).length;

  process.stdout.write(
    `Total docs: ${allDocs.length}. wger-*: ${wgerDocs.length}. trainer-authored: ${trainerDocs.length}. legacy soft-deleted: ${legacySoftDeleted}.\n`,
  );

  // Step 1 — apply hard auto-drops (missing name, no muscle groups, manual
  // exclusion list, already-soft-deleted).
  const candidates: ExerciseDoc[] = [];
  const drops: { doc: ExerciseDoc; reasons: string[]; bucket: string }[] = [];
  for (const doc of wgerDocs) {
    const flags = autoFilterFlags(doc);
    const decision = shouldAutoDrop(flags);
    const bucket = bucketFor(doc);
    if (decision.drop) {
      drops.push({ doc, reasons: decision.reasons, bucket });
    } else {
      candidates.push(doc);
    }
  }

  // Step 2 — detect near-duplicate pairs among the survivors.
  const pairs = findDedupePairs(candidates);
  const dedupeLoserIds = new Set(pairs.map((p) => p.loser.id));
  // Dedupe survivors are PROTECTED from the per-bucket quota — they are the
  // canonical doc Task B will point dedupe-loser mergedInto references at. If
  // we ever quota-prune a dedupe survivor, the proposal's cross-check fails
  // (a loser would have nowhere to merge into) and Task B can't run.
  const dedupeSurvivingIds = new Set(pairs.map((p) => p.surviving.id));
  const afterDedupe = candidates.filter((d) => !dedupeLoserIds.has(d.id));
  for (const p of pairs) {
    drops.push({ doc: p.loser, reasons: [`dedupe with ${p.surviving.id}`, p.reason], bucket: bucketFor(p.loser) });
  }

  // Step 3 — apply per-bucket quotas. For each bucket pick the top-N candidates
  // by scoreSurvivor; the rest go to drops. Dedupe survivors bypass the quota.
  const byBucket = new Map<string, ExerciseDoc[]>();
  for (const doc of afterDedupe) {
    const b = bucketFor(doc);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(doc);
  }
  const survivors: { doc: ExerciseDoc; bucket: string }[] = [];
  for (const [bucket, docs] of byBucket) {
    const quota = BUCKET_QUOTA[bucket] ?? 5;
    // Pull protected dedupe survivors out first so they aren't subject to the
    // quota cap.
    const protectedDocs = docs.filter((d) => dedupeSurvivingIds.has(d.id));
    const unprotected = docs.filter((d) => !dedupeSurvivingIds.has(d.id));
    unprotected.sort((a, b) => scoreSurvivor(b) - scoreSurvivor(a));
    const slotsLeft = Math.max(0, quota - protectedDocs.length);
    const kept = unprotected.slice(0, slotsLeft);
    const dropped = unprotected.slice(slotsLeft);
    for (const k of [...protectedDocs, ...kept]) survivors.push({ doc: k, bucket });
    for (const d of dropped) {
      drops.push({
        doc: d,
        reasons: [`bucket quota (${bucket} cap ${quota})`],
        bucket,
      });
    }
  }

  // Step 4 — compute ES translation coverage.
  let fromWger = 0;
  let needsClaude = 0;
  for (const { doc } of survivors) {
    const en = (doc.name?.en ?? "").trim().toLowerCase();
    const es = (doc.name?.es ?? "").trim().toLowerCase();
    if (es && es !== en) fromWger++;
    else needsClaude++;
  }

  const generatedAt = new Date().toISOString();
  const markdown = renderProposal({
    generatedAt,
    totalDocs: allDocs.length,
    wgerDocs: wgerDocs.length,
    trainerDocs: trainerDocs.length,
    legacySoftDeleted,
    survivors,
    drops,
    dedupePairs: pairs,
    esCoverage: { fromWger, needsClaude },
  });

  if (args.output) {
    const outPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, markdown, "utf8");
    process.stdout.write(`Wrote proposal to ${outPath}\n`);
  } else {
    process.stdout.write(markdown);
  }

  process.stdout.write(
    `Summary: survivors=${survivors.length}, drops=${drops.length}, dedupe-pairs=${pairs.length}, es-from-wger=${fromWger}, es-needs-claude=${needsClaude}.\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
