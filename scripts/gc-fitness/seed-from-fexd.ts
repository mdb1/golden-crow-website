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
import { mapFexdMuscles } from "./fexd-vocabulary-map";

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

/**
 * Phase 24-03 (Codex MEDIUM allowlist-path migration mitigation).
 *
 * Resolves the default --allowlist path with backward-compat:
 *  - Prefer the Phase 24 path
 *    (.planning/phases/24-exercise-library-expansion-free-exercise-db/ALLOWLIST-PROPOSAL.md)
 *  - Fall back to the legacy MO2 path
 *    (.planning/quick/260522-mo2-.../ALLOWLIST-PROPOSAL.md)
 *    when the Phase 24 file is missing (operators / scripts pinned to the
 *    older path keep working until they migrate).
 *
 * Exported for unit-test coverage of both resolution branches.
 */
export function resolveDefaultAllowlistPath(): string {
  const phase24 = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "gc-fitness",
    ".planning",
    "phases",
    "24-exercise-library-expansion-free-exercise-db",
    "ALLOWLIST-PROPOSAL.md",
  );
  const legacy = path.resolve(
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
  return fs.existsSync(phase24) ? phase24 : legacy;
}

/**
 * Phase 24-03 (Codex HIGH blast-radius mitigation).
 *
 * When `--canary <N>` is set, the seed run is capped to the first N picks
 * from the allowlist. Re-export the slicing as a pure helper so the test
 * suite can pin the contract without spinning up the full CLI.
 *
 *  - `canary === undefined` → input returned unchanged (referential identity
 *    preserved so callers can detect "no cap" cheaply).
 *  - `canary >= picks.length` → all picks returned (no past-end truncation).
 *  - `canary > 0` → first `canary` picks returned.
 */
export function applyCanaryCap<T>(picks: T[], canary: number | undefined): T[] {
  if (canary === undefined) return picks;
  return picks.slice(0, canary);
}

export interface CliArgs {
  apply: boolean;
  allowlist: string;
  translations: string;
  assetsReport: string;
  fexdData: string;
  skipIds: Set<string>;
  /** Phase 24-03 (Codex HIGH) — cap seed to first N picks; undefined = no cap. */
  canary: number | undefined;
  /** Phase 24-03 (Codex HIGH) — emit SEED-RECONCILIATION-{ts}.json; no Firestore writes. */
  reportOnly: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    apply: false,
    // Phase 24-03 (Codex MEDIUM) — Phase 24 path if present, else legacy MO2.
    allowlist: resolveDefaultAllowlistPath(),
    translations: path.resolve(__dirname, "fexd-translations.json"),
    assetsReport: path.resolve(__dirname, "fexd-assets-report.json"),
    fexdData: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
    skipIds: new Set(),
    canary: undefined,
    reportOnly: false,
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
    } else if (a === "--canary") {
      // Phase 24-03 (Codex HIGH) — positive-integer guard.
      const raw = argv[++i] ?? "";
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0 || String(n) !== raw.trim()) {
        throw new Error(
          `--canary expects a positive integer; got: ${JSON.stringify(raw)}`,
        );
      }
      args.canary = n;
    } else if (a === "--report-only") {
      args.reportOnly = true;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx seed-from-fexd.ts [--apply] [--allowlist <path>] [--translations <path>] " +
          "[--assets-report <path>] [--skip-ids <csv>] [--canary <N>] [--report-only]\n\n" +
          "Default dry-run. --apply opt-in. Idempotent. Routes per-write op: MATCH/soft-delete via batch.update, NEW via batch.set.\n" +
          "Default allowlist: Phase 24 path if present, else legacy MO2 path (Codex MEDIUM backward-compat).\n" +
          "--canary <N>: cap seed to first N picks (Codex HIGH blast-radius mitigation).\n" +
          "--report-only: emit SEED-RECONCILIATION-{timestamp}.json; do NOT mutate Firestore.\n",
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
  /** Phase 24-03 — force vector (push|pull|static|null). */
  force: "push" | "pull" | "static" | null;
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

export function buildPayload(
  pick: AllowlistEntry,
  translation: FexdTranslationEntry,
  asset: AssetReportEntry,
  fexd: FexdSourceRow | null,
): Record<string, unknown> {
  // Map fexd's `equipment` (singular string) to the array shape gc-fitness
  // already uses elsewhere (existing wger docs have equipment: string[]).
  const equipmentArr = fexd?.equipment ? [fexd.equipment] : [];
  // Phase 24-03 — muscleGroups uses GC canonical vocab via mapFexdMuscles;
  // primaryMuscles + secondaryMuscles keep the raw FEXD values for
  // downstream filter UIs (e.g. backoffice picker chip-rows can show both).
  const muscleGroups = mapFexdMuscles(fexd?.primaryMuscles ?? []);
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
    // Phase 24-03 — the "force" key is a new enrichment dimension
    // (push|pull|static|null). Defensive cast for the pre-Phase-24 in-memory
    // FEXD shape; once a re-pull from upstream lands every row has `force`
    // typed by the FexdSourceRow contract. canonical() projects "force" so
    // a doc missing it is detected as kind:'overwrite' on the next dry-run.
    force: (fexd as { force?: string | null } | null)?.force ?? null,
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

export function canonical(o: Record<string, unknown>): Record<string, unknown> {
  // Pick only the fields we care about, in canonical order, sorted.
  // Phase 24-03 — `force` is now part of the convergence projection so a
  // doc missing it triggers a kind:'overwrite' (one-time backfill), and the
  // subsequent re-run reports 0 writes (idempotency preserved).
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
    "force",
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

  const allPicks = parseAllowlistForFexd(fs.readFileSync(args.allowlist, "utf8"));
  // Phase 24-03 (Codex HIGH) — apply --canary cap before any Firestore traffic.
  const picks = applyCanaryCap(allPicks, args.canary);
  if (args.canary !== undefined) {
    process.stdout.write(
      `Canary mode: capping to first ${args.canary} picks (${allPicks.length} in allowlist).\n`,
    );
  }
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

  // Phase 24-03 (Codex HIGH auditability) — `--report-only` emits a
  // SEED-RECONCILIATION-{timestamp}.json artifact and SKIPS the
  // commitInChunks step entirely. Insert/update/skip counts here can be
  // cross-referenced against the dry-run prediction within ±2 to detect
  // race conditions or stale fexd-translations.json between runs.
  if (args.reportOnly) {
    type SkipReasonMap = Record<string, number>;
    const inserts: string[] = [];
    const updates: string[] = [];
    const softDeletes: string[] = [];
    const skipsByReason: SkipReasonMap = {};
    for (const r of rows) {
      if (r.plan.kind === "insert") inserts.push(r.snap.id);
      else if (r.plan.kind === "overwrite") updates.push(r.snap.id);
      else if (r.plan.kind === "soft-delete") softDeletes.push(r.snap.id);
      else if (r.plan.kind === "skip") {
        const key = r.plan.reason ?? "unspecified";
        skipsByReason[key] = (skipsByReason[key] ?? 0) + 1;
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "report-only",
      allowlistPath: args.allowlist,
      canary: args.canary ?? null,
      totals: {
        picks: picks.length,
        inserts: inserts.length,
        updates: updates.length,
        softDeletes: softDeletes.length,
        skips: Object.values(skipsByReason).reduce((a, b) => a + b, 0),
      },
      inserts: { count: inserts.length, docIds: inserts },
      updates: { count: updates.length, docIds: updates },
      softDeletes: { count: softDeletes.length, docIds: softDeletes },
      skips: { byReason: skipsByReason },
    };
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "gc-fitness",
      ".planning",
      "phases",
      "24-exercise-library-expansion-free-exercise-db",
      `SEED-RECONCILIATION-${ts}.json`,
    );
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.stdout.write(`\nWrote SEED-RECONCILIATION report to: ${outPath}\n`);
    return;
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
