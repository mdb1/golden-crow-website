#!/usr/bin/env tsx
/**
 * seed-from-fexd.ts — Firestore migration for plan 260522-mo2 Task C.
 *
 * For each approved allowlist pick:
 *   - MATCH → overwrite the existing wger-* doc IN PLACE via batch.update.
 *     The doc-id is preserved; payload swaps to fexd source + EN/ES
 *     translations + Task B's Storage URLs. source flips to
 *     'free-exercise-db', version bumps by 1.
 *   - NEW → insert a fexd-<slug> doc via batch.set (batch.update on a
 *     non-existent doc-id throws). createdAt + updatedAt = serverTimestamp.
 *   - Soft-delete: wger-* survivors with no fexd MATCH get
 *     {deletedAt, deletedReason: 'superseded-by-fexd', updatedAt}.
 *     Already-soft-deleted docs (deletedAt non-null) are skipped.
 *
 * Reads the assets-report.json written by Task B (fetch-fexd-assets.ts) to
 * populate imageUrl/endImageUrl/gifUrl. Skips picks whose asset status is
 * not 'uploaded' or 'skipped' (with a WARN log).
 *
 * Default mode is dry-run (apply=false); --apply opt-in. Idempotent:
 * re-running --apply after convergence reports 0 writes + exit 0.
 *
 * Writes are routed through the EXTENDED commitInChunks in
 * curate-exercise-library.ts (op: 'update' | 'set' per write — Revision
 * fix #2). Chunk size = 450 (preserved from 260522-hi5 — Revision fix #5).
 *
 * Behaviors covered (PLAN.md <behavior>): C.beh.1 - C.beh.10.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import {
  commitInChunks,
  type ChunkedWrite,
} from "./curate-exercise-library";

// ---------------------------------------------------------------------------
// Env + admin init (mirrors curate-exercise-library.ts)
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

function initAdmin(): App {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error("Missing GC Fitness Firebase Admin env vars (see fetch-fexd-assets.ts).");
  }
  const existing = getApps().find((a) => a.name === "seed-from-fexd");
  if (existing) return existing;
  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
    },
    "seed-from-fexd",
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
  allowlist: string;
  translations: string;
  assetsReport: string;
  fexdData: string;
  skipIds: Set<string>;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    allowlist: path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "gc-fitness",
      ".planning",
      "quick",
      "260522-mo2-replace-exercise-library-with-free-exerc",
      "ALLOWLIST-PROPOSAL.md",
    ),
    translations: path.resolve(__dirname, "fexd-translations.json"),
    assetsReport: path.resolve(__dirname, "fexd-assets-report.json"),
    fexdData: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
    skipIds: new Set(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--allowlist") args.allowlist = path.resolve(argv[++i] ?? "");
    else if (a === "--translations") args.translations = path.resolve(argv[++i] ?? "");
    else if (a === "--assets-report") args.assetsReport = path.resolve(argv[++i] ?? "");
    else if (a === "--fexd-data") args.fexdData = argv[++i] ?? args.fexdData;
    else if (a === "--skip-ids") {
      const list = argv[++i] ?? "";
      args.skipIds = new Set(list.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx seed-from-fexd.ts [--apply] [--allowlist <path>] [--translations <path>] [--assets-report <path>] [--skip-ids <csv>]\n\n" +
          "Default dry-run. --apply opt-in. Idempotent. Routes per-write op: MATCH/soft-delete via batch.update, NEW via batch.set.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllowlistEntry {
  exerciseId: string;
  fexdSlug: string;
  fexdDir: string;
  disposition: "MATCH" | "NEW";
}

export interface FexdTranslationEntry {
  name_en: string;
  name_es: string;
  instructions_en: string[];
  instructions_es: string[];
}
export type FexdTranslations = Record<string, FexdTranslationEntry>;

export interface AssetReportEntry {
  status: "would-upload" | "uploaded" | "skipped" | "missing-source" | "error";
  imageUrl?: string;
  endImageUrl?: string;
  gifUrl?: string;
  sourceSha256?: string;
  error?: string;
}
export type AssetReport = Record<string, AssetReportEntry>;

export interface FexdSourceRow {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  mechanic: "compound" | "isolation" | null;
  level: "beginner" | "intermediate" | "expert";
  category: string;
  instructions: string[];
}

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
  fexd: FexdSourceRow | null;
}

// ---------------------------------------------------------------------------
// Allowlist parser — same as fetch-fexd-assets.ts but local to this module
// ---------------------------------------------------------------------------

export function parseAllowlistForFexd(md: string): AllowlistEntry[] {
  const lines = md.split(/\r?\n/);
  const out: AllowlistEntry[] = [];
  let inApproved = false;
  for (const ln of lines) {
    if (/^##\s+Approved allowlist\b/i.test(ln)) {
      inApproved = true;
      continue;
    }
    if (inApproved && /^##\s+/i.test(ln)) {
      inApproved = false;
      break;
    }
    if (!inApproved) continue;
    if (!ln.startsWith("|")) continue;
    if (/^\|\s*fexd id/i.test(ln) || /^\|\s*-+\s*\|/.test(ln)) continue;
    const cells = ln.split("|").map((c) => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
    if (cells.length < 6) continue;
    const fexdSlug = cells[0];
    const disposition = cells[4] as "MATCH" | "NEW";
    const targetDocId = cells[5];
    if (!fexdSlug || !targetDocId) continue;
    if (disposition !== "MATCH" && disposition !== "NEW") continue;
    out.push({
      exerciseId: targetDocId,
      fexdSlug,
      fexdDir: fexdSlug,
      disposition,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Translation lookup (C.beh.6)
// ---------------------------------------------------------------------------

export function resolveTranslation(
  docId: string,
  translations: FexdTranslations,
): FexdTranslationEntry {
  const entry = translations[docId];
  if (!entry || !entry.name_en) {
    throw new Error(`MissingTranslation: ${docId}`);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Patch computation
// ---------------------------------------------------------------------------

export type Plan =
  | { kind: "overwrite"; patch: Record<string, unknown>; reason: null }
  | { kind: "insert"; patch: Record<string, unknown>; reason: null }
  | { kind: "soft-delete"; patch: Record<string, unknown>; reason: null }
  | { kind: "skip"; patch: null; reason: string };

function buildPayload(
  pick: AllowlistEntry,
  translation: FexdTranslationEntry,
  asset: AssetReportEntry,
  fexd: FexdSourceRow | null,
): Record<string, unknown> {
  // Map fexd's `equipment` (singular string) to the array shape gc-fitness
  // already uses elsewhere (existing wger docs have equipment: string[]).
  const equipmentArr = fexd?.equipment ? [fexd.equipment] : [];
  // muscleGroups (existing schema) takes primaryMuscles as the canonical
  // bucket; we ALSO write primaryMuscles + secondaryMuscles separately for
  // downstream filters.
  const muscleGroups = fexd?.primaryMuscles ?? [];
  return {
    name: { en: translation.name_en, es: translation.name_es },
    description: { en: "", es: "" },
    instructions: {
      en: translation.instructions_en,
      es: translation.instructions_es,
    },
    primaryMuscles: fexd?.primaryMuscles ?? [],
    secondaryMuscles: fexd?.secondaryMuscles ?? [],
    muscleGroups,
    equipment: equipmentArr,
    mechanic: fexd?.mechanic ?? null,
    level: fexd?.level ?? null,
    category: fexd?.category ?? null,
    imageUrl: asset.imageUrl ?? null,
    endImageUrl: asset.endImageUrl ?? null,
    gifUrl: asset.gifUrl ?? null,
    source: "free-exercise-db",
  };
}

function isConverged(current: Record<string, unknown>, desired: Record<string, unknown>): boolean {
  // Deep-equal modulo serverTimestamp fields (updatedAt/createdAt are NOT in
  // `desired` here — buildPayload doesn't include them, the caller layers
  // serverTimestamp on top in computePatch).
  return JSON.stringify(canonical(current)) === JSON.stringify(canonical(desired));
}

function canonical(o: Record<string, unknown>): Record<string, unknown> {
  // Pick only the fields we care about, in canonical order, sorted.
  const keys = [
    "name",
    "description",
    "instructions",
    "primaryMuscles",
    "secondaryMuscles",
    "muscleGroups",
    "equipment",
    "mechanic",
    "level",
    "category",
    "imageUrl",
    "endImageUrl",
    "gifUrl",
    "source",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    out[k] = sortDeep(v);
  }
  return out;
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function computePatch(
  snap: DocSnapshot,
  pick: AllowlistEntry | null,
  translations: FexdTranslations,
  assets: AssetReport,
  unmatchedSurvivors: Set<string>,
): Plan {
  // Unmatched survivor (no allowlist pick for this id, but it IS in the
  // soft-delete set computed by Task A).
  if (pick === null && unmatchedSurvivors.has(snap.id)) {
    if (snap.data && (snap.data.deletedAt != null || snap.data.deleted === true)) {
      return { kind: "skip", patch: null, reason: "already soft-deleted" };
    }
    return {
      kind: "soft-delete",
      patch: {
        deletedAt: FieldValue.serverTimestamp(),
        deletedReason: "superseded-by-fexd",
        updatedAt: FieldValue.serverTimestamp(),
      },
      reason: null,
    };
  }
  if (pick === null) {
    return { kind: "skip", patch: null, reason: "non-target doc" };
  }

  // From here on, pick is non-null. Need a translation.
  const translation = resolveTranslation(pick.exerciseId, translations);
  const asset = assets[pick.exerciseId];

  if (!asset || (asset.status !== "uploaded" && asset.status !== "skipped")) {
    return {
      kind: "skip",
      patch: null,
      reason: `missing media (asset status=${asset?.status ?? "absent"})`,
    };
  }

  const desired = buildPayload(pick, translation, asset, snap.fexd);

  if (pick.disposition === "NEW") {
    if (snap.exists && snap.data) {
      // Already exists — converge if data matches.
      if (isConverged(snap.data, desired)) {
        return { kind: "skip", patch: null, reason: "converged (NEW already-applied)" };
      }
      // Doc exists but stale — treat as overwrite via batch.set (set is
      // idempotent for create-or-replace semantics).
      return {
        kind: "insert",
        patch: {
          ...desired,
          version: typeof snap.data.version === "number" ? snap.data.version + 1 : 1,
          createdAt: snap.data.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        reason: null,
      };
    }
    return {
      kind: "insert",
      patch: {
        ...desired,
        ownerId: "system-fexd",
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      reason: null,
    };
  }

  // MATCH
  if (!snap.exists || !snap.data) {
    return {
      kind: "skip",
      patch: null,
      reason: `MATCH target ${snap.id} no longer exists in Firestore`,
    };
  }
  if (isConverged(snap.data, desired)) {
    return { kind: "skip", patch: null, reason: "converged (MATCH already-applied)" };
  }
  return {
    kind: "overwrite",
    patch: {
      ...desired,
      version: typeof snap.data.version === "number" ? snap.data.version + 1 : 2,
      updatedAt: FieldValue.serverTimestamp(),
    },
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Writes assembly (C.beh.9 — op routing)
// ---------------------------------------------------------------------------

export function buildWritesFromPicks(
  rows: { ref: unknown; plan: Plan }[],
): ChunkedWrite[] {
  const writes: ChunkedWrite[] = [];
  for (const row of rows) {
    if (row.plan.kind === "skip" || row.plan.patch === null) continue;
    const op: "update" | "set" = row.plan.kind === "insert" ? "set" : "update";
    writes.push({ ref: row.ref, data: row.plan.patch, op });
  }
  return writes;
}

// ---------------------------------------------------------------------------
// Fexd dataset fetch (used during apply to populate primaryMuscles etc.)
// ---------------------------------------------------------------------------

async function fetchFexdSource(url: string): Promise<Map<string, FexdSourceRow>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch fexd dataset: HTTP ${res.status}`);
  const arr = (await res.json()) as FexdSourceRow[];
  const map = new Map<string, FexdSourceRow>();
  for (const r of arr) map.set(r.id, r);
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const app = initAdmin();
  const db: Firestore = getFirestore(app);

  if (!fs.existsSync(args.allowlist)) {
    throw new Error(`Allowlist not found: ${args.allowlist}`);
  }
  if (!fs.existsSync(args.translations)) {
    throw new Error(`Translations not found: ${args.translations}`);
  }
  if (!fs.existsSync(args.assetsReport)) {
    throw new Error(
      `Assets report not found: ${args.assetsReport}. Run fetch-fexd-assets.ts first.`,
    );
  }

  const picks = parseAllowlistForFexd(fs.readFileSync(args.allowlist, "utf8"));
  const translations: FexdTranslations = JSON.parse(
    fs.readFileSync(args.translations, "utf8"),
  );
  const assets: AssetReport = JSON.parse(fs.readFileSync(args.assetsReport, "utf8"));

  // Read the live /exercises wger survivors so we know which to soft-delete.
  const snap = await db.collection("exercises").get();
  const survivors = new Set<string>();
  for (const d of snap.docs) {
    if (!d.id.startsWith("wger-")) continue;
    const data = d.data();
    if (data.deletedAt != null || data.deleted === true) continue;
    survivors.add(d.id);
  }
  process.stdout.write(`Found ${survivors.size} live wger-* survivors in Firestore.\n`);

  // Map allowlist picks by id; MATCH ids reduce the survivors set to compute unmatched.
  const picksById = new Map<string, AllowlistEntry>();
  for (const p of picks) picksById.set(p.exerciseId, p);
  const matchedSurvivorIds = new Set<string>();
  for (const p of picks) if (p.disposition === "MATCH") matchedSurvivorIds.add(p.exerciseId);
  const unmatchedSurvivors = new Set<string>(
    [...survivors].filter((id) => !matchedSurvivorIds.has(id)),
  );
  process.stdout.write(
    `Allowlist: ${picks.length} picks (${[...picks].filter((p) => p.disposition === "MATCH").length} MATCH, ${
      [...picks].filter((p) => p.disposition === "NEW").length
    } NEW). Unmatched survivors → soft-delete: ${unmatchedSurvivors.size}.\n`,
  );

  // Fetch the fexd source dataset once (for primaryMuscles/equipment/etc.).
  process.stdout.write(`Fetching fexd dataset from ${args.fexdData}...\n`);
  const fexdSource = await fetchFexdSource(args.fexdData);
  process.stdout.write(`  → ${fexdSource.size} fexd source rows loaded.\n`);

  // Compute plans for each target doc-id.
  type Row = { ref: unknown; pick: AllowlistEntry | null; snap: DocSnapshot; plan: Plan };
  const rows: Row[] = [];

  // 1) Picks (MATCH + NEW)
  for (const pick of picks) {
    if (args.skipIds.has(pick.exerciseId)) continue;
    const ref = db.collection("exercises").doc(pick.exerciseId);
    const docSnap = await ref.get();
    const fexd = fexdSource.get(pick.fexdSlug) ?? null;
    const snapShape: DocSnapshot = {
      id: pick.exerciseId,
      exists: docSnap.exists,
      data: docSnap.exists ? docSnap.data() ?? null : null,
      fexd,
    };
    const plan = computePatch(snapShape, pick, translations, assets, unmatchedSurvivors);
    rows.push({ ref, pick, snap: snapShape, plan });
  }

  // 2) Soft-deletes (unmatched survivors not already in picks).
  for (const id of unmatchedSurvivors) {
    if (args.skipIds.has(id)) continue;
    if (picksById.has(id)) continue; // already handled above as MATCH
    const ref = db.collection("exercises").doc(id);
    const docSnap = await ref.get();
    const snapShape: DocSnapshot = {
      id,
      exists: docSnap.exists,
      data: docSnap.exists ? docSnap.data() ?? null : null,
      fexd: null,
    };
    const plan = computePatch(snapShape, null, translations, assets, unmatchedSurvivors);
    rows.push({ ref, pick: null, snap: snapShape, plan });
  }

  // Summary by kind.
  const counts = { overwrite: 0, insert: 0, "soft-delete": 0, skip: 0 };
  for (const r of rows) counts[r.plan.kind]++;
  process.stdout.write(
    `\nDry-run summary (mode=${args.apply ? "APPLY" : "DRY-RUN"}):\n` +
      `  MATCH overwrites (op:'update'): ${counts.overwrite}\n` +
      `  NEW inserts (op:'set'):         ${counts.insert}\n` +
      `  Soft-deletes (op:'update'):     ${counts["soft-delete"]}\n` +
      `  Skipped (idempotent / missing): ${counts.skip}\n`,
  );

  // Sample 10 ops.
  process.stdout.write(`\nSample (first 10 non-skip rows):\n`);
  let shown = 0;
  for (const r of rows) {
    if (r.plan.kind === "skip" || shown >= 10) continue;
    process.stdout.write(`  ${r.snap.id} → ${r.plan.kind}\n`);
    shown++;
  }

  // Build writes + commit (no-op when apply=false).
  const writes = buildWritesFromPicks(
    rows.map((r) => ({ ref: r.ref, plan: r.plan })),
  );
  const committed = await commitInChunks(db as unknown as never, writes, args.apply);
  process.stdout.write(`\nCommitted ${committed} writes (${args.apply ? "APPLY" : "dry-run no-op"}).\n`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
