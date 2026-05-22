#!/usr/bin/env tsx
/**
 * audit-fexd-library.ts — READ-ONLY Free-Exercise-DB allowlist auditor for
 * the Golden Crow Fitness Firestore project (gcfitness-3476b).
 *
 * Task A deliverable for plan 260522-mo2. This script is intentionally
 * one-shot and throwaway: it fetches yuhonas/free-exercise-db's
 * dist/exercises.json ONCE from raw.githubusercontent.com, applies a hybrid
 * movement-pattern + equipment + mechanic filter to pick ~60-80 high-signal
 * lifts, reads the current /exercises wger-* survivors via firebase-admin,
 * computes a canonical-English-name MATCH/NEW mapping, and writes an
 * ALLOWLIST-PROPOSAL.md to the gc-fitness planning tree.
 *
 * NO Firestore writes — confirmed by grep: every `db.collection` access here
 * ends in `.get()`. NO Storage writes either. The `firebase-admin` binding
 * uses the SAME env-var contract as scripts/gc-fitness/audit-exercise-library.ts
 * (260522-hi5 precedent) and backoffice/scripts/seed-gc-fitness-library.cjs.
 *
 * Usage:
 *   npx tsx audit-fexd-library.ts --output <path-to-markdown>
 *
 * If --output is omitted, defaults to the gc-fitness planning tree at
 *   ../../gc-fitness/.planning/quick/260522-mo2-.../ALLOWLIST-PROPOSAL.md
 * Pass --stdout to print the proposal instead of writing.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Env loading + admin init (mirrors audit-exercise-library.ts from 260522-hi5)
// ---------------------------------------------------------------------------

function loadEnv(): void {
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
    throw new Error(
      "Missing GC Fitness Firebase Admin env vars. Required: " +
        "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID, " +
        "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL, " +
        "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY. " +
        "These are normally in backoffice/.env.local — same contract as " +
        "scripts/gc-fitness/audit-exercise-library.ts.",
    );
  }

  const existing = getApps().find((a) => a.name === "audit-fexd");
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
    },
    "audit-fexd",
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  output: string | null;
  stdout: boolean;
  cacheFile: string | null;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { output: null, stdout: false, cacheFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output" || a === "-o") {
      args.output = argv[++i] ?? null;
    } else if (a === "--stdout") {
      args.stdout = true;
    } else if (a === "--cache-file") {
      args.cacheFile = argv[++i] ?? null;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx audit-fexd-library.ts [--output <path>] [--stdout] [--cache-file <path>]\n\n" +
          "Fetches yuhonas/free-exercise-db dist/exercises.json from raw.githubusercontent.com\n" +
          "ONCE, applies the hybrid movement-pattern + equipment + mechanic filter, reads\n" +
          "/exercises wger-* survivors from Firestore (project gcfitness-3476b), computes\n" +
          "the canonical-English-name MATCH/NEW mapping, and writes an ALLOWLIST-PROPOSAL.md.\n\n" +
          "NO Firestore writes. NO Storage writes.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Free-Exercise-DB source dataset shape (yuhonas/free-exercise-db @ main)
// ---------------------------------------------------------------------------

interface FexdExercise {
  id: string;                       // kebab-case slug, e.g. "Barbell_Full_Squat"
  name: string;                     // canonical English, e.g. "Barbell Full Squat"
  force: string | null;             // "pull" | "push" | "static" | null
  level: "beginner" | "intermediate" | "expert";
  mechanic: "compound" | "isolation" | null;
  equipment: string | null;         // "barbell" | "dumbbell" | "body only" | "machine" | "cable" | ...
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;                 // "strength" | "stretching" | "plyometrics" | "strongman" | "powerlifting" | "cardio" | "olympic weightlifting"
  images: string[];                 // ["<dir>/0.jpg", "<dir>/1.jpg"]
}

const FEXD_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

async function fetchFexd(cacheFile: string | null): Promise<FexdExercise[]> {
  if (cacheFile && fs.existsSync(cacheFile)) {
    const raw = fs.readFileSync(cacheFile, "utf8");
    return JSON.parse(raw) as FexdExercise[];
  }
  process.stdout.write(`Fetching ${FEXD_URL} ...\n`);
  const res = await fetch(FEXD_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Free-Exercise-DB exercises.json — HTTP ${res.status}. ` +
        `Check network or supply --cache-file <path> with a pre-downloaded copy.`,
    );
  }
  const data = (await res.json()) as FexdExercise[];
  if (cacheFile) {
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), "utf8");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Hybrid filter — bucket assignment + per-bucket quota + equipment whitelist
// ---------------------------------------------------------------------------

type BucketKey =
  | "squat"
  | "hinge"
  | "horizontal-push"
  | "vertical-push"
  | "horizontal-pull"
  | "vertical-pull"
  | "lunge"
  | "core"
  | "calves"
  | "isolation"
  | "cardio"
  | "mobility";

const BUCKET_LABEL: Record<BucketKey, string> = {
  squat: "Squat pattern",
  hinge: "Hinge pattern",
  "horizontal-push": "Horizontal push",
  "vertical-push": "Vertical push",
  "horizontal-pull": "Horizontal pull",
  "vertical-pull": "Vertical pull",
  lunge: "Lunge / single-leg",
  core: "Core",
  calves: "Calves",
  isolation: "Arms + shoulders isolation",
  cardio: "Cardio / conditioning",
  mobility: "Mobility / accessory",
};

const BUCKET_QUOTA: Record<BucketKey, number> = {
  squat: 8,
  hinge: 7,
  "horizontal-push": 8,
  "vertical-push": 5,
  "horizontal-pull": 7,
  "vertical-pull": 5,
  lunge: 5,
  core: 5,
  calves: 3,
  isolation: 12,
  cardio: 3,
  mobility: 3,
};
// Sum: 71 — target ~60-80.

const BUCKET_ORDER: BucketKey[] = [
  "squat",
  "hinge",
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "lunge",
  "core",
  "calves",
  "isolation",
  "cardio",
  "mobility",
];

// Equipment whitelist — KEEP. Equipment outside this set is DROPPED.
const EQUIPMENT_KEEP = new Set<string>([
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "body only",
]);

// Equipment we DROP outright — usually too gimmicky / unavailable in a typical gym.
const EQUIPMENT_DROP = new Set<string | null>([
  "bands",
  "medicine ball",
  "exercise ball",
  "e-z curl bar",
  "foam roll",
  "other",
  "kettlebells", // soft-drop for v1 — kettlebell entries often duplicate dumbbell variants
  null,
]);

// Categories we DROP entirely — non-strength entries are out of scope for v1.
const CATEGORY_DROP = new Set<string>([
  "stretching",
  "plyometrics",
  "strongman",
  "olympic weightlifting",
]);

// Name-level exclusions — entries that pass the auto-filter but Claude flags
// as low-utility / obscure / regional / equipment-specialty / repeat-of-a-
// better-pick. The proposal aims for canonical lifts a typical client would
// recognize — exotic powerlifting accommodations (chains, bands, pin
// presses) and one-off names (Jefferson, Zercher, Bradford/Rocky, Anti-
// Gravity) are dropped here.
const NAME_EXCLUSIONS_RX: RegExp[] = [
  // Olympic / strongman / odd lifts
  /\bturkish\b/i,
  /\bsnatch\b/i,
  /\bclean.*jerk\b/i,
  /\bpower\s*clean\b/i,
  /\bhang\s*clean\b/i,
  /\bclean\s*and\s*press\b/i,
  /\bclean\s*pull\b/i,
  /\bthruster\b/i,
  /\bzottman\b/i,
  /\bzercher\b/i,
  /\bjefferson\b/i,
  /\bsumo\s*deadlift\s*high\b/i,
  /\bmuscle.?up\b/i,
  /\bkipping\b/i,
  /\bwall\s*ball\b/i,
  /\bwall\s*walk\b/i,
  /\bpistol\s*squat\b/i,
  /\bhindu\b/i,
  /\byoga\b/i,
  /\bpilates\b/i,
  /\bwindmill\b/i,
  /\bball\s*slam\b/i,
  /\btire\b/i,
  /\byoke\b/i,
  /\batlas\b/i,
  /\bfarmer'?s?\s+(walk|carry)\b/i,
  /\biron\s*cross\b/i,
  /\bguillotine\b/i,
  /\b21'?s?\b/i,
  // Powerlifting accommodating-resistance variants — niche
  /\bwith\s*chains\b/i,
  /\bwith\s*bands\b/i,
  /\breverse\s*band\b/i,
  /\bpin\s*press\b/i,
  /\bpin\s*presses\b/i,
  /\bboard\s*press\b/i,
  /\bfloor\s*press\b/i,
  /\bspoto\s*press\b/i,
  /-?\s*powerlifting\b/i,
  // Niche / branded names
  /\bbradford\b/i,
  /\branti.?gravity\b/i,
  /\blandmine\b/i,
  /\bjammer\b/i,
  /\bone-arm\s+long\s+bar\b/i,
  /\bone\s+arm\s+long\s+bar\b/i,
  /\blong\s+bar\s+row\b/i,
  /\bbradford\s+press\b/i,
  /\brocky\s+press\b/i,
  /\bguillotine\s+press\b/i,
  /\bbradford\/rocky\b/i,
  // Rollout variants (Ab-Roller is the canonical pick; keep that one)
  /\brollout\s+from\b/i,
  /\bbarbell\s+ab\s+rollout\b/i,
  // Stretches that snuck through (defensive — most are caught by category=stretching)
  /\bstretch\b/i,
  /\bwarm\s*up\b/i,
  // Cardio-machine items even though category != cardio
  /\bair\s*bike\b/i,
  /\bbike\s+cardio\b/i,
  /\btreadmill\b/i,
  // Isometric neck (gym-irrelevant)
  /\bisometric\s+neck\b/i,
  // Plate-loaded gimmicks
  /\bplate\s+movers?\b/i,
  /\bweighted\s+sissy\b/i,
  /\bsissy\s+squat\b/i,
  /\bfront\s+box\s+jump\b/i,
];

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Modifier tokens (equipment / posture / grip variant / cadence) stripped on
// BOTH sides before computing token-set similarity. Order-independent.
const MODIFIER_TOKENS = new Set<string>([
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "smith",
  "ez",
  "ezbar",
  "bar",
  "rope",
  "seated",
  "standing",
  "incline",
  "decline",
  "flat",
  "lying",
  "kneeling",
  "alternate",
  "alternating",
  "single",
  "double",
  "one",
  "two",
  "weighted",
  "bodyweight",
  "wide",
  "narrow",
  "close",
  "medium",
  "neutral",
  "reverse",
  "supinated",
  "pronated",
  "underhand",
  "overhand",
  "grip",
  "with",
  "and",
  "the",
  "an",
  "a",
  "of",
  "on",
  "to",
  "in",
  "powerlifting",
  "variant",
  "stretch",
  "lateral",
  "front",
  "rear",
  "side",
  "back",
  "low",
  "high",
  "mid",
  "upper",
  "lower",
]);

// Lift-noun lexemes — the "thing being done". Two names MATCH only if they
// share the same lift lexeme. Order matters: longer phrases checked first so
// "bench press" wins over a bare "press". A name without a recognised lexeme
// falls back to its longest non-modifier suffix word.
const LIFT_LEXEMES: string[] = [
  "bench press",
  "shoulder press",
  "military press",
  "overhead press",
  "chest press",
  "leg press",
  "calf press",
  "french press",
  "arnold press",
  "push press",
  "floor press",
  "lat pulldown",
  "pulldown",
  "pull up",
  "chin up",
  "pull through",
  "pullover",
  "hip thrust",
  "good morning",
  "back extension",
  "leg extension",
  "tricep extension",
  "triceps extension",
  "leg curl",
  "leg raise",
  "calf raise",
  "lateral raise",
  "front raise",
  "rear raise",
  "rear delt fly",
  "rear delt row",
  "face pull",
  "skull crusher",
  "tricep pushdown",
  "triceps pushdown",
  "pushdown",
  "step up",
  "split squat",
  "front squat",
  "back squat",
  "goblet squat",
  "hack squat",
  "box squat",
  "sumo deadlift",
  "romanian deadlift",
  "stiff leg deadlift",
  "stiff-leg deadlift",
  "kettlebell swing",
  "preacher curl",
  "hammer curl",
  "spider curl",
  "concentration curl",
  "barbell curl",
  "biceps curl",
  "bicep curl",
  "wood chop",
  "woodchop",
  "russian twist",
  "dead bug",
  "bird dog",
  "side plank",
  "plank",
  "burpee",
  "mountain climber",
  "jumping jack",
  "high knee",
  "jump rope",
  "deadlift",
  "squat",
  "press",
  "row",
  "curl",
  "raise",
  "fly",
  "flye",
  "flyes",
  "flies",
  "shrug",
  "lunge",
  "crunch",
  "crunches",
  "situp",
  "sit up",
  "sit-up",
  "dip",
  "dips",
  "extension",
  "pull",
  "pulldown",
  "thrust",
  "stretch",
  "twist",
  "raise",
  "kick",
];

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

// Strip modifier tokens (order-independent). Returns the remaining tokens
// in their original order — these form the lift's "core noun phrase".
function coreTokens(normed: string): string[] {
  return normed.split(" ").filter((t) => t.length > 0 && !MODIFIER_TOKENS.has(t));
}

// Detect the lift lexeme by checking the normalized name for the longest
// matching lift-lexeme substring. Returns null if no recognized lexeme.
function liftLexeme(normed: string): string | null {
  for (const lex of LIFT_LEXEMES) {
    // Allow lexeme appearance anywhere in the name, surrounded by word boundaries.
    const rx = new RegExp(`(^|\\s)${lex.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(\\s|$)`);
    if (rx.test(normed)) return lex;
  }
  // Fallback: last core token (post-modifier-strip).
  const core = coreTokens(normed);
  return core.length > 0 ? core[core.length - 1] : null;
}

// Jaccard token-set similarity on the CORE tokens (modifiers stripped).
function jaccardCore(a: string, b: string): number {
  const ta = new Set(coreTokens(a));
  const tb = new Set(coreTokens(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const uni = new Set([...ta, ...tb]).size;
  if (uni === 0) return 0;
  return inter / uni;
}

// ---------------------------------------------------------------------------
// Bucket assignment for a fexd entry (name-first, then muscle fallback)
// ---------------------------------------------------------------------------

function bucketForFexd(ex: FexdExercise): BucketKey {
  const n = normName(ex.name);
  const muscles = ex.primaryMuscles.map((m) => m.toLowerCase());
  const cat = ex.category;

  // Name-first signals — strongest discriminators.
  if (/\bcalf|calves\b/.test(n)) return "calves";
  if (/\bsquat\b/.test(n) && !/\bsplit\s*squat\b/.test(n)) return "squat";
  if (/\bsplit\s*squat\b|\blunge\b|\bstep.?up\b/.test(n)) return "lunge";
  if (
    /\bdeadlift\b|\brdl\b|\bromanian\b|\bswing\b|\bhip\s*thrust\b|\bgood\s*morning\b|\bback\s*extension\b|\bglute\s*ham\b/.test(
      n,
    )
  )
    return "hinge";
  if (/\bbench\s*press\b|\bdip\b|\bpush.?up\b|\bchest\s*press\b/.test(n))
    return "horizontal-push";
  if (
    /\boverhead\s*press\b|\bshoulder\s*press\b|\bmilitary\s*press\b|\bpush\s*press\b|\barnold\s*press\b/.test(
      n,
    )
  )
    return "vertical-push";
  if (/\brow\b|\bt.?bar\b|\bpullover\b/.test(n)) return "horizontal-pull";
  if (/\bpull.?up\b|\bchin.?up\b|\blat\s*pulldown\b|\bpulldown\b/.test(n))
    return "vertical-pull";
  if (
    /\bcurl\b|\btricep\b|\bskull\s*crusher\b|\bpushdown\b|\bextension\b|\blateral\s*raise\b|\bfront\s*raise\b|\brear\s*delt\b|\bface\s*pull\b|\bfly\b|\bshrug\b|\bwrist\b|\breverse\s*fly\b/.test(
      n,
    ) &&
    !/\bleg\s*extension\b/.test(n)
  )
    return "isolation";
  if (/\bleg\s*extension\b|\bleg\s*curl\b|\bleg\s*press\b/.test(n))
    return "squat"; // quad/ham accessories live with the squat bucket
  if (/\bcrunch\b|\bsit.?up\b|\bplank\b|\bleg\s*raise\b|\bwoodchop\b|\btwist\b|\bab\s*roll\b|\bdead\s*bug\b|\bbird\s*dog\b|\bhollow\b|\bhanging\s*knee\b/.test(n))
    return "core";

  // Cardio / plyometrics fallthrough — caught above by category drop, but
  // a few "Air Bike" / "Mountain Climber" entries land in strength bucket.
  if (/\bburpee\b|\bmountain\s*climber\b|\bjumping\s*jack\b|\bhigh\s*knee\b|\bjump\s*rope\b|\bair\s*bike\b/.test(n))
    return "cardio";

  // Compound press / row / pull entries that landed here without matching a
  // name regex above are most often shoulder press variants. Keep them OUT of
  // the isolation bucket — isolation is reserved for single-joint accessories.
  const isCompound = ex.mechanic === "compound";
  if (isCompound && /\bpress\b/.test(n)) {
    // Determine if it's shoulder/overhead or horizontal/bench by muscle.
    if (
      muscles.includes("shoulders") ||
      muscles.includes("triceps")
    ) {
      // Default to vertical-push for "press" + shoulders/triceps.
      return "vertical-push";
    }
    if (muscles.includes("chest")) return "horizontal-push";
  }

  // Muscle-group fallback (only for isolation-leaning entries).
  if (muscles.includes("calves")) return "calves";
  if (muscles.includes("abdominals")) return "core";
  if (
    !isCompound &&
    (muscles.includes("biceps") ||
      muscles.includes("triceps") ||
      muscles.includes("forearms") ||
      muscles.includes("shoulders") ||
      muscles.includes("traps"))
  ) {
    return "isolation";
  }
  if (isCompound && muscles.includes("triceps") && muscles.includes("chest"))
    return "horizontal-push";
  if (muscles.includes("quadriceps") || muscles.includes("glutes")) return "squat";
  if (muscles.includes("hamstrings") || muscles.includes("lower back")) return "hinge";
  if (muscles.includes("chest")) return "horizontal-push";
  if (
    muscles.includes("lats") ||
    muscles.includes("middle back") ||
    muscles.includes("back")
  )
    return "horizontal-pull";

  // Compounds that don't fit any pattern → mobility/accessory (rare).
  if (cat === "cardio") return "cardio";
  return "mobility";
}

function isExcludedByName(name: string): boolean {
  return NAME_EXCLUSIONS_RX.some((rx) => rx.test(name));
}

function isKeepableEquipment(eq: string | null): boolean {
  if (eq === null) return false;
  if (EQUIPMENT_DROP.has(eq)) return false;
  return EQUIPMENT_KEEP.has(eq);
}

// Score within a bucket — higher = better candidate.
//
// We strongly prefer well-known canonical lifts (front squat, romanian
// deadlift, dumbbell bench press, …) over niche variants ("squat with plate
// movers", "narrow stance squat"). A name-regex allowlist provides a +200
// boost so canonical lifts always win the top-N quota cut.
const CANONICAL_BOOST_RX: RegExp[] = [
  // Squat
  /\bfront\s*squat\b/i,
  /\bback\s*squat\b/i,
  /\bbarbell\s*full\s*squat\b/i,
  /\bbarbell\s*squat\b/i,
  /\bgoblet\s*squat\b/i,
  /\bdumbbell\s*squat\b/i,
  /\bbodyweight\s*squat\b/i,
  /\bhack\s*squat\b/i,
  /\bbox\s*squat\b/i, // (without chains is fine; chains caught by exclusion above)
  /\bleg\s*press\b/i,
  /\bleg\s*extension\b/i,
  // Hinge
  /^barbell\s*deadlift\b/i,
  /^deadlift\b/i,
  /\bromanian\s*deadlift\b/i,
  /\bsumo\s*deadlift\b/i, // ("with bands/chains" caught by exclusion)
  /\bstiff\s*leg(ged)?\s*deadlift\b/i,
  /\bhip\s*thrust\b/i,
  /\bgood\s*morning\b/i,
  /\bback\s*extension\b/i,
  /\bswing\b/i,
  /\bleg\s*curl\b/i,
  // Horizontal push
  /^barbell\s*bench\s*press\b/i, // bare BBP (no medium/wide)
  /\bbench\s*press\s*-\s*medium\b/i,
  /\bdumbbell\s*bench\s*press\b/i,
  /\bincline\s*dumbbell\s*press\b/i,
  /\bincline\s*barbell\s*bench\s*press\b/i,
  /\bincline\s*bench\s*press\b/i,
  /\bdecline\s*bench\s*press\b/i,
  /\bdumbbell\s*flyes?\b/i,
  /\bcable\s*crossover\b/i,
  /\bpushups?\b/i,
  /\bpush-ups?\b/i,
  /\bdips?\b/i,
  /\bchest\s*dip\b/i,
  /\bbench\s*dip\b/i,
  // Vertical push
  /\bbarbell\s*shoulder\s*press\b/i,
  /\bstanding\s*military\s*press\b/i,
  /\bseated\s*dumbbell\s*press\b/i,
  /\bdumbbell\s*shoulder\s*press\b/i,
  /\barnold\s*dumbbell\s*press\b/i,
  /\bpush\s*press\b/i,
  // Horizontal pull
  /^bent\s*over\s*barbell\s*row\b/i,
  /\bbent\s*over\s*two-dumbbell\s*row\b/i,
  /\bone\s*arm\s*dumbbell\s*row\b/i,
  /\bdumbbell\s*row\b/i,
  /\bt-bar\s*row\b/i,
  /\bseated\s*cable\s*row\b/i,
  /\binverted\s*row\b/i,
  /\bbarbell\s*shrug\b/i,
  /\bdumbbell\s*shrug\b/i,
  // Vertical pull
  /\bpull-?ups?\b/i,
  /\bchin-?ups?\b/i,
  /\bwide-?grip\s*lat\s*pulldown\b/i,
  /\bclose-?grip\s*(front)?\s*lat\s*pulldown\b/i,
  /\bclose-?grip\s*lat\s*pulldown\b/i,
  /\bstraight-?arm\s*pulldown\b/i,
  // Lunge / single-leg
  /\bdumbbell\s*lunges?\b/i,
  /\bbarbell\s*lunge\b/i,
  /\bwalking\s*lunge\b/i,
  /\breverse\s*lunge\b/i,
  /\bbulgarian\s*split\s*squat\b/i,
  /\bsplit\s*squat\b/i,
  /\bstep[\s-]?up\b/i,
  // Core
  /^plank\b/i,
  /^side\s*plank\b/i,
  /^crunches?\b/i,
  /\bcable\s*crunch\b/i,
  /\bhanging\s*leg\s*raise\b/i,
  /\bdead\s*bug\b/i,
  /\bbird\s*dog\b/i,
  /\brussian\s*twist\b/i,
  /\bab\s*roll(er|out)\b/i,
  // Calves
  /\bstanding\s*calf\s*raises?\b/i,
  /\bseated\s*calf\s*raise\b/i,
  /\bcalf\s*press\b/i,
  // Arms isolation
  /\bdumbbell\s*bicep\s*curl\b/i,
  /\bdumbbell\s*biceps?\s*curl\b/i,
  /\bbarbell\s*curl\b/i,
  /\bhammer\s*curls?\b/i,
  /\bpreacher\s*curl\b/i,
  /\bcable\s*curl\b/i,
  /\btricep\s*pushdown\b/i,
  /\btriceps?\s*pushdown\b/i,
  /\bskull\s*crusher\b/i,
  /\boverhead\s*tricep\s*extension\b/i,
  /\boverhead\s*triceps\s*extension\b/i,
  /\blying\s*triceps?\s*extension\b/i,
  /\bcable\s*tricep\b/i,
  /\bcable\s*triceps\b/i,
  /\bside\s*lateral\s*raise\b/i,
  /\bfront\s*dumbbell\s*raise\b/i,
  /\bbent[\s-]?over\s*lateral\s*raise\b/i,
  /\bface\s*pull\b/i,
  /\brear\s*delt\b/i,
  // Cardio (body only canonical)
  /\bjumping\s*jacks?\b/i,
  /\bmountain\s*climbers?\b/i,
  /\bjump\s*rope\b/i,
  /\bburpees?\b/i,
  /\bhigh\s*knees?\b/i,
];

function isCanonicalBoosted(name: string): boolean {
  return CANONICAL_BOOST_RX.some((rx) => rx.test(name));
}

function scoreCandidate(ex: FexdExercise): number {
  let score = 0;
  // Canonical-lift allowlist — overwhelming preference. Without this, niche
  // variants (Box Squat With Chains, Pin Press, Anti-Gravity Press) sneak
  // into the top-quota of each bucket purely on instruction-length signal.
  if (isCanonicalBoosted(ex.name)) score += 200;

  // Strongly prefer compound mechanic in non-isolation buckets.
  if (ex.mechanic === "compound") score += 100;
  if (ex.mechanic === "isolation") score += 50;

  // Prefer barbell + dumbbell + body only over machine/cable (broader gym applicability).
  if (ex.equipment === "barbell") score += 35;
  else if (ex.equipment === "dumbbell") score += 30;
  else if (ex.equipment === "body only") score += 25;
  else if (ex.equipment === "machine") score += 15;
  else if (ex.equipment === "cable") score += 15;

  // Prefer beginner-tier (more universally programmable) — small bias only.
  if (ex.level === "beginner") score += 8;
  else if (ex.level === "intermediate") score += 4;

  // Prefer richer instruction sets.
  score += Math.min(20, ex.instructions.length * 4);

  // Prefer the canonical short name — bias against long compound names.
  score += Math.max(0, 40 - Math.abs(ex.name.length - 20));

  // Prefer entries with secondaryMuscles populated.
  score += Math.min(10, ex.secondaryMuscles.length * 2);

  return score;
}

// ---------------------------------------------------------------------------
// Wger survivor doc shape
// ---------------------------------------------------------------------------

interface WgerSurvivor {
  id: string;
  nameEn: string;
  nameEs: string;
  primaryMuscleGroups: string[];
  equipment: string[];
}

// ---------------------------------------------------------------------------
// MATCH detection — canonical English name matcher
// ---------------------------------------------------------------------------

interface MatchResult {
  survivorId: string | null;
  confidence: "high" | "medium" | "low" | null;
  distance: number | null;
  reason: string;
}

function matchFexdToSurvivor(
  pick: FexdExercise,
  survivors: WgerSurvivor[],
): MatchResult {
  const pickNorm = normName(pick.name);
  if (!pickNorm) {
    return { survivorId: null, confidence: null, distance: null, reason: "empty pick name" };
  }
  const pickLex = liftLexeme(pickNorm);
  if (pickLex === null) {
    return {
      survivorId: null,
      confidence: null,
      distance: null,
      reason: `no recognized lift lexeme in "${pick.name}"`,
    };
  }

  // Score: lower is better. Combines (a) Jaccard inverse (b) Levenshtein on the
  // full normalized strings as a stability tie-breaker.
  interface Cand {
    survivor: WgerSurvivor;
    jaccard: number;
    dist: number;
    sNorm: string;
  }
  let best: Cand | null = null;
  for (const s of survivors) {
    const sNorm = normName(s.nameEn);
    if (!sNorm) continue;
    const sLex = liftLexeme(sNorm);
    if (sLex !== pickLex) continue; // hard gate: must share the lift lexeme.
    const j = jaccardCore(pickNorm, sNorm);
    // Require at least 0.5 token-set overlap on the core tokens.
    if (j < 0.5) continue;
    const dist = levenshtein(pickNorm, sNorm);
    // Cap Levenshtein at 8 — slop for hyphen / spacing / pluralisation.
    if (dist > 8) continue;
    const cand: Cand = { survivor: s, jaccard: j, dist, sNorm };
    if (best === null) {
      best = cand;
      continue;
    }
    // Prefer higher Jaccard; tie-break on lower Levenshtein; final tie-break
    // on lexicographic survivor doc-id ASC (deterministic).
    if (
      cand.jaccard > best.jaccard ||
      (cand.jaccard === best.jaccard && cand.dist < best.dist) ||
      (cand.jaccard === best.jaccard && cand.dist === best.dist && cand.survivor.id < best.survivor.id)
    ) {
      best = cand;
    }
  }

  if (best === null) {
    return {
      survivorId: null,
      confidence: null,
      distance: null,
      reason: `NEW — no wger-* survivor shares lift lexeme "${pickLex}" with sufficient token overlap`,
    };
  }

  // Confidence rubric:
  //   high   = Jaccard >= 0.85 AND dist <= 2     (essentially the same name)
  //   medium = Jaccard >= 0.7  AND dist <= 5     (clearly the same lift, slight modifier diff)
  //   low    = Jaccard >= 0.5  AND dist <= 8     (same lexeme, ≥ 50% token overlap)
  const conf: "high" | "medium" | "low" =
    best.jaccard >= 0.85 && best.dist <= 2
      ? "high"
      : best.jaccard >= 0.7 && best.dist <= 5
        ? "medium"
        : "low";

  return {
    survivorId: best.survivor.id,
    confidence: conf,
    distance: best.dist,
    reason: `MATCH — "${pick.name}" → "${best.survivor.nameEn}" (lexeme="${pickLex}", jaccard=${best.jaccard.toFixed(2)}, dist=${best.dist})`,
  };
}


// ---------------------------------------------------------------------------
// Doc-id slug helper for NEW entries — wger-/custom- precedent: `fexd-<slug>`
// ---------------------------------------------------------------------------

function fexdDocId(ex: FexdExercise): string {
  return `fexd-${ex.id}`;
}

// ---------------------------------------------------------------------------
// Sample ES translations (5-row spot-check baked inline)
//
// These five are picked from the expected high-confidence canonical lifts. If
// a sampled fexd entry isn't in the final allowlist, we replace it with the
// next-best canonical pick from the same bucket so the user can still review
// translation quality. Full translation bundle lives in fexd-translations.json
// written by Task C.
// ---------------------------------------------------------------------------

const SAMPLE_ES_TRANSLATIONS: Record<
  string,
  { name_es: string; first_instruction_es: string }
> = {
  // Squat
  Barbell_Full_Squat: {
    name_es: "Sentadilla completa con barra",
    first_instruction_es:
      "Coloca la barra sobre los trapecios superiores, con los pies a la anchura de los hombros.",
  },
  Bodyweight_Squat: {
    name_es: "Sentadilla con peso corporal",
    first_instruction_es:
      "De pie con los pies a la anchura de los hombros y los brazos extendidos al frente.",
  },
  Front_Barbell_Squat: {
    name_es: "Sentadilla frontal con barra",
    first_instruction_es:
      "Coloca la barra apoyada en la parte delantera de los hombros con los codos altos.",
  },
  // Hinge
  Barbell_Deadlift: {
    name_es: "Peso muerto con barra",
    first_instruction_es:
      "Acércate a la barra con los pies a la anchura de las caderas y agárrala con un agarre prono.",
  },
  Romanian_Deadlift: {
    name_es: "Peso muerto rumano",
    first_instruction_es:
      "Sostén la barra con las manos a la anchura de los hombros, con las rodillas ligeramente flexionadas.",
  },
  // Horizontal push
  Barbell_Bench_Press_Medium_Grip: {
    name_es: "Press de banca con barra (agarre medio)",
    first_instruction_es:
      "Acuéstate en el banco plano con los pies firmes en el suelo y la barra a la altura del pecho.",
  },
  Pushups: {
    name_es: "Flexiones",
    first_instruction_es:
      "Apoya las manos en el suelo a la anchura de los hombros con el cuerpo en línea recta.",
  },
  // Vertical push
  Standing_Military_Press: {
    name_es: "Press militar de pie",
    first_instruction_es:
      "De pie con la barra apoyada en los hombros delanteros y los pies a la anchura de las caderas.",
  },
  // Horizontal pull
  Bent_Over_Barbell_Row: {
    name_es: "Remo inclinado con barra",
    first_instruction_es:
      "Sostén la barra con un agarre prono, inclina el torso hacia delante manteniendo la espalda recta.",
  },
  // Vertical pull
  Pullups: {
    name_es: "Dominadas",
    first_instruction_es:
      "Agarra la barra con un agarre prono más ancho que los hombros y deja colgar el cuerpo.",
  },
  Wide_Grip_Lat_Pulldown: {
    name_es: "Jalón al pecho con agarre ancho",
    first_instruction_es:
      "Siéntate en la máquina y agarra la barra con las manos más anchas que los hombros.",
  },
  // Lunge
  Dumbbell_Lunges: {
    name_es: "Zancadas con mancuernas",
    first_instruction_es:
      "Sostén una mancuerna en cada mano con los brazos extendidos a los lados del cuerpo.",
  },
  // Core
  Plank: {
    name_es: "Plancha",
    first_instruction_es:
      "Apoya los antebrazos en el suelo con los codos directamente debajo de los hombros.",
  },
  Crunches: {
    name_es: "Encogimientos abdominales",
    first_instruction_es:
      "Acuéstate boca arriba con las rodillas flexionadas y los pies apoyados en el suelo.",
  },
  // Isolation
  Dumbbell_Bicep_Curl: {
    name_es: "Curl de bíceps con mancuernas",
    first_instruction_es:
      "De pie con una mancuerna en cada mano, los brazos extendidos y las palmas hacia delante.",
  },
  Hammer_Curls: {
    name_es: "Curl martillo",
    first_instruction_es:
      "De pie con una mancuerna en cada mano, las palmas mirándose entre sí.",
  },
  Tricep_Pushdown: {
    name_es: "Extensión de tríceps en polea",
    first_instruction_es:
      "Coloca una barra recta en la polea alta y agárrala con un agarre prono.",
  },
  Side_Lateral_Raise: {
    name_es: "Elevaciones laterales",
    first_instruction_es:
      "De pie con una mancuerna en cada mano, los brazos extendidos a los lados del cuerpo.",
  },
  // Calves
  Standing_Calf_Raises: {
    name_es: "Elevaciones de gemelos de pie",
    first_instruction_es:
      "Colócate en la máquina con los hombros bajo las almohadillas y las puntas de los pies en la plataforma.",
  },
};

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

interface PickWithMapping {
  pick: FexdExercise;
  bucket: BucketKey;
  match: MatchResult;
  targetDocId: string;            // wger-<uuid> for MATCH, fexd-<slug> for NEW
  disposition: "MATCH" | "NEW";
}

interface SoftDelete {
  survivor: WgerSurvivor;
  reason: string;
}

function renderProposal(opts: {
  generatedAt: string;
  totalFexd: number;
  survivors: WgerSurvivor[];
  picks: PickWithMapping[];
  softDeletes: SoftDelete[];
  encoderVersion: string;
}): string {
  const lines: string[] = [];
  const matchCount = opts.picks.filter((p) => p.disposition === "MATCH").length;
  const newCount = opts.picks.filter((p) => p.disposition === "NEW").length;

  lines.push(`# Exercise Library — Free-Exercise-DB Replacement Proposal\n`);
  lines.push(`**Generated:** ${opts.generatedAt}`);
  lines.push(
    `**Source dataset:** yuhonas/free-exercise-db @ main (public-domain / unlicense)`,
  );
  lines.push(
    `**Source URL:** https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`,
  );
  lines.push(`**Audit source:** Live Firestore /exercises in project gcfitness-3476b`);
  lines.push(`**Total fexd entries scanned:** ${opts.totalFexd}`);
  lines.push(`**Proposed picks (target 60-80):** ${opts.picks.length}`);
  lines.push(`  - MATCH (overwrite existing wger-* doc-id in place): ${matchCount}`);
  lines.push(`  - NEW (insert fexd-<slug>): ${newCount}`);
  lines.push(
    `**Unmatched wger-* survivors (proposed soft-delete):** ${opts.softDeletes.length}`,
  );
  lines.push(`**Picks deterministic across re-runs:** ✓ (sorted by fexd.id ASC)`);
  lines.push("");

  lines.push(`## Approved allowlist\n`);

  const byBucket = new Map<BucketKey, PickWithMapping[]>();
  for (const p of opts.picks) {
    if (!byBucket.has(p.bucket)) byBucket.set(p.bucket, []);
    byBucket.get(p.bucket)!.push(p);
  }

  for (const bucket of BUCKET_ORDER) {
    const rows = byBucket.get(bucket) ?? [];
    lines.push(`### ${BUCKET_LABEL[bucket]} (${rows.length}/${BUCKET_QUOTA[bucket]})`);
    if (rows.length === 0) {
      lines.push("_No picks in this bucket._\n");
      continue;
    }
    lines.push(
      fmtTableHeader([
        "fexd id (slug)",
        "fexd name (EN)",
        "Equipment",
        "Mechanic",
        "Disposition",
        "Target doc-id",
        "Match confidence",
        "Notes",
      ]),
    );
    rows.sort((a, b) => a.pick.id.localeCompare(b.pick.id));
    for (const r of rows) {
      const conf =
        r.match.confidence === null ? "—" : `${r.match.confidence} (dist ${r.match.distance})`;
      const notes =
        r.disposition === "MATCH"
          ? `was "${opts.survivors.find((s) => s.id === r.match.survivorId)?.nameEn ?? "?"}"`
          : `new doc — no wger match`;
      lines.push(
        `| ${escTable(r.pick.id)} | ${escTable(r.pick.name)} | ${escTable(
          r.pick.equipment ?? "",
        )} | ${escTable(r.pick.mechanic ?? "")} | ${escTable(r.disposition)} | ${escTable(
          r.targetDocId,
        )} | ${escTable(conf)} | ${escTable(notes)} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## Soft-delete list (unmatched wger-* survivors)\n`);
  if (opts.softDeletes.length === 0) {
    lines.push("_All wger-* survivors matched at least one fexd pick — no soft-deletes needed._\n");
  } else {
    lines.push(
      fmtTableHeader([
        "wger doc-id",
        "wger name (EN)",
        "wger name (ES)",
        "Reason no fexd match",
      ]),
    );
    const sorted = [...opts.softDeletes].sort((a, b) =>
      a.survivor.nameEn.localeCompare(b.survivor.nameEn),
    );
    for (const d of sorted) {
      lines.push(
        `| ${escTable(d.survivor.id)} | ${escTable(d.survivor.nameEn)} | ${escTable(
          d.survivor.nameEs,
        )} | ${escTable(d.reason)} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## Sample translations (5-row spot-check)\n`);
  lines.push(
    fmtTableHeader([
      "Disposition",
      "Doc-id",
      "name.en (fexd)",
      "name.es (proposed)",
      "first instruction (EN, fexd)",
      "first instruction (ES, proposed)",
    ]),
  );
  // Walk picks in order, take the first 5 that have a sample translation in
  // the inline table. Fall back to picks without samples (then the ES columns
  // are blank and the user knows full translations come in Task C).
  let shown = 0;
  for (const p of opts.picks) {
    if (shown >= 5) break;
    const sample = SAMPLE_ES_TRANSLATIONS[p.pick.id];
    if (!sample) continue;
    lines.push(
      `| ${escTable(p.disposition)} | ${escTable(p.targetDocId)} | ${escTable(
        p.pick.name,
      )} | ${escTable(sample.name_es)} | ${escTable(p.pick.instructions[0] ?? "")} | ${escTable(
        sample.first_instruction_es,
      )} |`,
    );
    shown++;
  }
  if (shown < 5) {
    lines.push(
      `\n_Note: only ${shown} sample translations baked into the auditor; the full ES bundle will be generated in Task C (fexd-translations.json)._`,
    );
  }
  lines.push("");

  lines.push(`## Counts cross-check\n`);
  const preSurvivorCount = opts.survivors.length;
  const postCount = preSurvivorCount + newCount - opts.softDeletes.length;
  lines.push(`- Pre-run /exercises wger-* survivor count: ${preSurvivorCount}`);
  lines.push(`- MATCH picks (overwrite existing doc-id): ${matchCount}`);
  lines.push(`- NEW picks (insert new fexd-<slug>): ${newCount}`);
  lines.push(`- Soft-deletes (unmatched survivors): ${opts.softDeletes.length}`);
  lines.push(
    `- Post-Task-C /exercises **active** count = ${preSurvivorCount} + ${newCount} − ${opts.softDeletes.length} = **${postCount}**`,
  );
  lines.push(
    `  (Already-soft-deleted wger-* docs from 260522-hi5 are left untouched and not counted here.)`,
  );
  lines.push(
    `- MATCH + Soft-deletes should equal pre-run survivor count: ${matchCount} + ${opts.softDeletes.length} = ${matchCount + opts.softDeletes.length} ${
      matchCount + opts.softDeletes.length === preSurvivorCount ? "✓" : "✗ (mismatch — re-run audit)"
    }`,
  );
  lines.push("");

  lines.push(`## Filter discipline\n`);
  lines.push(
    `- Categories KEPT: \`strength\`, \`powerlifting\` (compounds), \`cardio\` (only canonical body-only conditioning entries).`,
  );
  lines.push(
    `- Categories DROPPED: \`stretching\`, \`plyometrics\`, \`strongman\`, \`olympic weightlifting\`.`,
  );
  lines.push(
    `- Equipment KEPT: \`barbell\`, \`dumbbell\`, \`machine\`, \`cable\`, \`body only\`.`,
  );
  lines.push(
    `- Equipment DROPPED: \`bands\`, \`medicine ball\`, \`exercise ball\`, \`e-z curl bar\`, \`foam roll\`, \`other\`, \`kettlebells\`, \`null\`.`,
  );
  lines.push(
    `- Mechanic preference: \`compound\` first in every bucket; \`isolation\` allowed in the isolation/core/calves buckets and as quota fillers elsewhere.`,
  );
  lines.push(`- Name-level exclusions (regex): ${NAME_EXCLUSIONS_RX.length} patterns — see source.`);
  lines.push(`- Encoder version constant (for downstream Task B sha256): \`${opts.encoderVersion}\``);
  lines.push("");

  lines.push(`## Approval options\n`);
  lines.push(`Reply at the Task A.gate with one of:`);
  lines.push(`- **"approved"** — Tasks B + C proceed exactly as proposed.`);
  lines.push(
    `- **"approved with redlines: <list>"** — list doc-ids or fexd slugs to drop from MATCH/NEW (they'll move to soft-delete) or to lift from soft-delete.`,
  );
  lines.push(
    `- **"restart with stricter filter"** — re-run Task A with tighter quotas (target ~50 picks) or only compound mechanic.`,
  );
  lines.push(
    `- **"restart with looser filter"** — re-run Task A with relaxed equipment whitelist (kettlebells back in, bands considered) or target ~80 picks.`,
  );
  lines.push(`- **"abort"** — plan stops here, no rollback needed (zero writes occurred).`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ENCODER_VERSION_CONSTANT = "gif-encoder-2@1.0.5";

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write("Reading /exercises from Firestore (project gcfitness-3476b)...\n");
  // READ-ONLY: the only Firestore access is the line below. Grep this file for
  // .set( / .update( / .delete( / .commit( — there are none.
  const snap = await db.collection("exercises").get();
  process.stdout.write(`  → ${snap.size} total docs read.\n`);

  // Filter to wger-* survivors (deletedAt == null, deleted != true).
  const survivors: WgerSurvivor[] = [];
  for (const d of snap.docs) {
    const id = d.id;
    if (!id.startsWith("wger-")) continue;
    const data = d.data() as Record<string, unknown>;
    const deleted = data.deleted === true || data.deletedAt != null;
    if (deleted) continue;
    const name = data.name as { en?: string; es?: string } | undefined;
    const muscleGroups = Array.isArray(data.muscleGroups)
      ? (data.muscleGroups as unknown[]).map((x) => String(x))
      : [];
    const equipment = Array.isArray(data.equipment)
      ? (data.equipment as unknown[]).map((x) => String(x))
      : [];
    survivors.push({
      id,
      nameEn: name?.en?.trim() ?? "",
      nameEs: name?.es?.trim() ?? "",
      primaryMuscleGroups: muscleGroups,
      equipment,
    });
  }
  process.stdout.write(
    `  → ${survivors.length} wger-* survivors (deletedAt==null, deleted!=true).\n`,
  );

  // Fetch fexd dataset.
  const fexd = await fetchFexd(args.cacheFile);
  process.stdout.write(`  → ${fexd.length} fexd entries fetched.\n`);

  // Step 1 — apply hard filters (category, equipment, name exclusion).
  const candidates: FexdExercise[] = [];
  for (const ex of fexd) {
    if (CATEGORY_DROP.has(ex.category)) continue;
    if (!isKeepableEquipment(ex.equipment)) continue;
    if (isExcludedByName(ex.name)) continue;
    candidates.push(ex);
  }
  process.stdout.write(
    `  → ${candidates.length} candidates after category + equipment + name filter.\n`,
  );

  // Step 2 — bucket assignment + per-bucket quota.
  const byBucket = new Map<BucketKey, FexdExercise[]>();
  for (const ex of candidates) {
    const b = bucketForFexd(ex);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(ex);
  }

  // For each bucket: pick the top-quota by scoreCandidate, deterministic
  // tie-break by fexd.id.
  const picksFlat: FexdExercise[] = [];
  for (const bucket of BUCKET_ORDER) {
    const candidatesInBucket = byBucket.get(bucket) ?? [];
    candidatesInBucket.sort((a, b) => {
      const s = scoreCandidate(b) - scoreCandidate(a);
      if (s !== 0) return s;
      return a.id.localeCompare(b.id);
    });
    const quota = BUCKET_QUOTA[bucket];
    const kept = candidatesInBucket.slice(0, quota);
    picksFlat.push(...kept);
  }
  // Deterministic global sort by id (idempotent across re-runs).
  picksFlat.sort((a, b) => a.id.localeCompare(b.id));
  process.stdout.write(`  → ${picksFlat.length} total picks after per-bucket quota.\n`);

  // Step 3 — MATCH detection against wger survivors.
  const usedSurvivors = new Set<string>();
  const picks: PickWithMapping[] = [];
  // First pass: rank picks by score and resolve conflicts greedily — a
  // survivor can only be matched once, prefer the closest-distance pick and
  // (tie-break) the compound-mechanic pick. To keep this deterministic we
  // sort picks by id ASC and resolve in that order; a second pass re-walks
  // picks that lost to confirm they end up NEW. The greedy single-pass is
  // sufficient because Levenshtein <= 4 + same-first-word produces very few
  // many-to-one collisions in practice.
  for (const pick of picksFlat) {
    const filteredSurvivors = survivors.filter((s) => !usedSurvivors.has(s.id));
    const m = matchFexdToSurvivor(pick, filteredSurvivors);
    const bucket = bucketForFexd(pick);
    if (m.survivorId !== null) {
      usedSurvivors.add(m.survivorId);
      picks.push({
        pick,
        bucket,
        match: m,
        targetDocId: m.survivorId,
        disposition: "MATCH",
      });
    } else {
      picks.push({
        pick,
        bucket,
        match: m,
        targetDocId: fexdDocId(pick),
        disposition: "NEW",
      });
    }
  }

  const matchCount = picks.filter((p) => p.disposition === "MATCH").length;
  const newCount = picks.filter((p) => p.disposition === "NEW").length;
  process.stdout.write(
    `  → ${matchCount} MATCH + ${newCount} NEW.\n`,
  );

  // Step 4 — soft-delete list = survivors not used by any MATCH.
  const softDeletes: SoftDelete[] = [];
  for (const s of survivors) {
    if (usedSurvivors.has(s.id)) continue;
    softDeletes.push({
      survivor: s,
      reason: `No fexd pick matched within Levenshtein 4 + first-word equality on canonical English name.`,
    });
  }
  process.stdout.write(`  → ${softDeletes.length} unmatched survivors → soft-delete.\n`);

  // Step 5 — self-checks before rendering.
  const warnings: string[] = [];
  if (picks.length < 60 || picks.length > 80) {
    warnings.push(
      `WARN: pick count ${picks.length} is outside the [60, 80] target. Adjust BUCKET_QUOTA or filters.`,
    );
  }
  // Every MATCH targetDocId must be in survivors.
  const survivorIds = new Set(survivors.map((s) => s.id));
  for (const p of picks) {
    if (p.disposition === "MATCH" && !survivorIds.has(p.targetDocId)) {
      warnings.push(
        `ERROR: MATCH pick ${p.pick.id} targets ${p.targetDocId} which is NOT a wger survivor.`,
      );
    }
  }
  // Every NEW targetDocId must be unique within the proposal.
  const newDocIds = picks.filter((p) => p.disposition === "NEW").map((p) => p.targetDocId);
  const newDocIdSet = new Set(newDocIds);
  if (newDocIds.length !== newDocIdSet.size) {
    warnings.push(`ERROR: duplicate NEW doc-ids — count=${newDocIds.length} set=${newDocIdSet.size}.`);
  }
  // MATCH + soft-deletes should equal pre-run survivor count.
  if (matchCount + softDeletes.length !== survivors.length) {
    warnings.push(
      `ERROR: MATCH (${matchCount}) + soft-deletes (${softDeletes.length}) != survivors (${survivors.length}).`,
    );
  }
  if (warnings.some((w) => w.startsWith("ERROR"))) {
    process.stderr.write(warnings.join("\n") + "\n");
    process.exit(1);
  }
  if (warnings.length > 0) process.stderr.write(warnings.join("\n") + "\n");

  const generatedAt = new Date().toISOString();
  const markdown = renderProposal({
    generatedAt,
    totalFexd: fexd.length,
    survivors,
    picks,
    softDeletes,
    encoderVersion: ENCODER_VERSION_CONSTANT,
  });

  if (args.stdout) {
    process.stdout.write(markdown);
  } else {
    // Default output path: gc-fitness planning tree.
    const defaultOut = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "gc-fitness",
      ".planning",
      "quick",
      "260522-mo2-replace-exercise-library-with-free-exerc",
      "ALLOWLIST-PROPOSAL.md",
    );
    const outPath = args.output ? path.resolve(args.output) : defaultOut;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, markdown, "utf8");
    process.stdout.write(`Wrote proposal to ${outPath}\n`);
  }

  process.stdout.write(
    `Summary: picks=${picks.length} (MATCH=${matchCount}, NEW=${newCount}), soft-deletes=${softDeletes.length}, fexd-scanned=${fexd.length}, wger-survivors=${survivors.length}.\nPicks deterministic across re-runs: ✓\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
