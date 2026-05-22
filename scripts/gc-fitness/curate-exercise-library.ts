#!/usr/bin/env tsx
/**
 * curate-exercise-library.ts — APPLIES the user-approved curation pass against
 * the Golden Crow Fitness Firestore project (gcfitness-3476b).
 *
 * Task B deliverable for plan 260522-hi5. This script:
 *
 *   1. Reads /exercises via firebase-admin (cert credentials — bypasses rules,
 *      same env-var contract as backoffice/scripts/seed-gc-fitness-library.cjs).
 *   2. Parses ALLOWLIST-PROPOSAL.md to extract survivors, drops, and dedupe
 *      pairs.
 *   3. Loads the committed translations JSON (curate-exercise-library.translations.json)
 *      with clean EN+ES for every survivor.
 *   4. Computes per-doc patches:
 *        - Survivors get {name: {en, es}, updatedAt: serverTimestamp} ONLY when
 *          the on-disk values differ from the resolved translation (idempotent).
 *        - Dedupe-losers get {deletedAt, mergedInto, updatedAt}.
 *        - Other drops get {deletedAt, updatedAt}.
 *   5. Soft-deletes only — uses ONLY batch.update; never destructive batch APIs.
 *      Total doc count is conserved.
 *
 * Defaults to DRY RUN. --apply opt-in mutates Firestore.
 *
 * Usage:
 *   npx tsx curate-exercise-library.ts               # dry-run
 *   npx tsx curate-exercise-library.ts --apply       # mutates
 *   npx tsx curate-exercise-library.ts --help
 *
 * Idempotency:
 *   Re-running with --apply after convergence reports zero pending writes and
 *   exits 0. This is enforced by the "skip identical patch" branches in
 *   computePatch().
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Env + admin init (mirrors backoffice/scripts/seed-gc-fitness-library.cjs)
// ---------------------------------------------------------------------------

export function loadEnv(): void {
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

export function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error("Missing GC Fitness Firebase Admin env vars.");
  }

  const existing = getApps().find((a) => a.name === "curate-gc-fitness");
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
    },
    "curate-gc-fitness",
  );
}

// ---------------------------------------------------------------------------
// CLI arg parser
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
  allowlist: string;
  translations: string;
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
      "260522-hi5-exercise-library-curation-prune-bilingua",
      "ALLOWLIST-PROPOSAL.md",
    ),
    translations: path.resolve(__dirname, "curate-exercise-library.translations.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      args.apply = true;
    } else if (a === "--allowlist") {
      args.allowlist = path.resolve(argv[++i]);
    } else if (a === "--translations") {
      args.translations = path.resolve(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx curate-exercise-library.ts [--apply] [--allowlist <path>] [--translations <path>]\n\n" +
          "  --apply         Actually mutate Firestore. Default is dry-run.\n" +
          "  --allowlist     Path to ALLOWLIST-PROPOSAL.md (default: plan's location).\n" +
          "  --translations  Path to translations JSON (default: ./curate-exercise-library.translations.json).\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Allowlist parser — extracts survivors / drops / dedupes from the markdown.
// ---------------------------------------------------------------------------

export interface ParsedAllowlist {
  survivors: Set<string>;
  drops: Set<string>;
  dedupes: Map<string, string>; // loserId -> survivingId
}

const WGER_ID_RE = /\bwger-[0-9a-f-]+\b/g;

function extractWgerIdsFromTableRow(row: string): string[] {
  const matches = row.match(WGER_ID_RE);
  return matches ?? [];
}

export function parseAllowlist(markdown: string): ParsedAllowlist {
  const survivors = new Set<string>();
  const drops = new Set<string>();
  const dedupes = new Map<string, string>();

  // Locate section boundaries.
  const lines = markdown.split(/\r?\n/);
  let section: "none" | "approved" | "drops" | "dedupes" = "none";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## Approved allowlist")) {
      section = "approved";
      continue;
    }
    if (trimmed.startsWith("## Drop list")) {
      section = "drops";
      continue;
    }
    if (trimmed.startsWith("## Dedupe pairs")) {
      section = "dedupes";
      continue;
    }
    if (trimmed.startsWith("## Translation backfill plan") || trimmed.startsWith("## Counts cross-check")) {
      section = "none";
      continue;
    }
    if (section === "none") continue;

    // Skip table headers, separators, blockquotes, prose.
    if (!trimmed.startsWith("|")) continue;
    if (/^\|\s*[-:]+/.test(trimmed)) continue; // separator row
    if (/^\|\s*Doc id\b/i.test(trimmed)) continue;
    if (/^\|\s*Loser doc id\b/i.test(trimmed)) continue;

    const ids = extractWgerIdsFromTableRow(trimmed);
    if (ids.length === 0) continue;

    if (section === "approved") {
      for (const id of ids) survivors.add(id);
    } else if (section === "drops") {
      // The drop list row's first id is the doc being dropped; the reason
      // column may also reference a sibling wger id (e.g., "dedupe with
      // wger-xxx"). We only want the row's own id, which is the first
      // column. Split by | and pull the first wger id from each cell — the
      // FIRST cell with a wger id is the dropped doc.
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      let droppedId: string | null = null;
      for (const cell of cells) {
        const m = cell.match(WGER_ID_RE);
        if (m && m.length > 0) {
          droppedId = m[0];
          break;
        }
      }
      if (droppedId) drops.add(droppedId);
    } else if (section === "dedupes") {
      // Dedupe row format: | LoserId | LoserName | SurvivingId | SurvivingName | Reason |
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      const cellIds: string[] = [];
      for (const cell of cells) {
        const m = cell.match(WGER_ID_RE);
        if (m && m.length > 0) cellIds.push(m[0]);
      }
      if (cellIds.length >= 2) {
        const [loserId, survivingId] = cellIds;
        dedupes.set(loserId, survivingId);
        drops.add(loserId);
        survivors.add(survivingId);
      }
    }
  }

  return { survivors, drops, dedupes };
}

// ---------------------------------------------------------------------------
// Translation lookup
// ---------------------------------------------------------------------------

export interface TranslationEntry {
  name_en?: string;
  name_es?: string;
  description_en?: string;
  description_es?: string;
}

export type TranslationsJson = Record<string, TranslationEntry | undefined>;

export interface ResolvedTranslation {
  name_en: string;
  name_es: string;
}

export interface DocSnapshot {
  id: string;
  name?: { en?: string; es?: string } | null;
  description?: { en?: string; es?: string } | null;
  deletedAt?: unknown;
  mergedInto?: string | null;
}

export function resolveTranslation(
  doc: DocSnapshot,
  translations: TranslationsJson,
): ResolvedTranslation {
  const entry = translations[doc.id];
  const onDiskEn = (doc.name?.en ?? "").trim();
  const onDiskEs = (doc.name?.es ?? "").trim();

  // 1) Translations JSON wins for both EN and ES (user-curated canonical).
  const jsonEn = (entry?.name_en ?? "").trim();
  const jsonEs = (entry?.name_es ?? "").trim();

  // 2) Fallback for ES: on-disk ES if non-empty AND different from on-disk EN.
  //    Per plan B.beh.4 — translation lookup falls back to wger record.
  let resolvedEs = jsonEs;
  if (!resolvedEs) {
    if (onDiskEs && onDiskEs.toLowerCase() !== onDiskEn.toLowerCase()) {
      resolvedEs = onDiskEs;
    } else {
      throw new Error(
        `MissingTranslation: ${doc.id} has no usable ES translation (JSON has no override and on-disk ES equals on-disk EN or is empty).`,
      );
    }
  }

  // 3) Fallback for EN: JSON wins; else on-disk EN.
  const resolvedEn = jsonEn || onDiskEn;
  if (!resolvedEn) {
    throw new Error(`MissingTranslation: ${doc.id} has no usable EN name.`);
  }

  return { name_en: resolvedEn, name_es: resolvedEs };
}

// ---------------------------------------------------------------------------
// Patch planning
// ---------------------------------------------------------------------------

export interface PlannedPatch {
  id: string;
  kind: "survivor-backfill" | "drop-soft-delete" | "drop-with-merge" | "skip";
  reason: string;
  patch: Record<string, unknown> | null;
}

export function computePatch(
  doc: DocSnapshot,
  allowlist: ParsedAllowlist,
  translations: TranslationsJson,
): PlannedPatch {
  if (!doc.id.startsWith("wger-")) {
    // B.beh.7 — non-wger docs are never touched.
    return { id: doc.id, kind: "skip", reason: "not a wger-* doc", patch: null };
  }

  const inSurvivors = allowlist.survivors.has(doc.id);
  const inDrops = allowlist.drops.has(doc.id);
  const mergedTarget = allowlist.dedupes.get(doc.id);

  // Audit invariant: every wger-* doc must be accounted for.
  if (!inSurvivors && !inDrops) {
    throw new Error(
      `Doc ${doc.id} is unaccounted for in the allowlist proposal. Re-run Task A.`,
    );
  }

  // Defensive: if a doc somehow lands in both sets, mergedInto-target presence
  // wins (it must be the dedupe-loser side).
  if (mergedTarget) {
    // Idempotency: if already soft-deleted AND already pointing at the right
    // mergedInto, skip.
    const alreadyDeleted = doc.deletedAt != null;
    const alreadyMerged = (doc.mergedInto ?? null) === mergedTarget;
    if (alreadyDeleted && alreadyMerged) {
      return {
        id: doc.id,
        kind: "skip",
        reason: "already soft-deleted with correct mergedInto",
        patch: null,
      };
    }
    return {
      id: doc.id,
      kind: "drop-with-merge",
      reason: `dedupe loser → ${mergedTarget}`,
      patch: {
        deletedAt: FieldValue.serverTimestamp(),
        mergedInto: mergedTarget,
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  }

  if (inDrops) {
    // Pure soft-delete (no dedupe partner).
    if (doc.deletedAt != null) {
      return {
        id: doc.id,
        kind: "skip",
        reason: "already soft-deleted",
        patch: null,
      };
    }
    return {
      id: doc.id,
      kind: "drop-soft-delete",
      reason: "drop-list soft-delete",
      patch: {
        deletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  }

  // Survivor: backfill EN+ES if either differs from the resolved translation.
  const resolved = resolveTranslation(doc, translations);
  const onDiskEn = (doc.name?.en ?? "").trim();
  const onDiskEs = (doc.name?.es ?? "").trim();
  if (onDiskEn === resolved.name_en && onDiskEs === resolved.name_es) {
    return {
      id: doc.id,
      kind: "skip",
      reason: "survivor already has clean EN+ES",
      patch: null,
    };
  }
  return {
    id: doc.id,
    kind: "survivor-backfill",
    reason: "survivor — overwrite name.{en,es} with curated translation",
    patch: {
      name: { en: resolved.name_en, es: resolved.name_es },
      updatedAt: FieldValue.serverTimestamp(),
    },
  };
}

// ---------------------------------------------------------------------------
// Batch commit (B.beh.2 — chunks of ≤450, matches Firestore 500-ceiling)
// ---------------------------------------------------------------------------

interface BatchLike {
  update(ref: unknown, data: Record<string, unknown>): unknown;
  commit(): Promise<unknown>;
}
interface DbLike {
  batch(): BatchLike;
  collection(name: string): { doc(id: string): unknown; get?(): unknown };
}

export async function commitInChunks(
  db: DbLike,
  writes: { ref: unknown; data: Record<string, unknown> }[],
  apply: boolean,
): Promise<number> {
  if (!apply || writes.length === 0) return 0;
  let committed = 0;
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    const slice = writes.slice(i, i + 450);
    for (const w of slice) batch.update(w.ref, w.data);
    await batch.commit();
    committed += slice.length;
  }
  return committed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface CurationCounts {
  total: number;
  wger: number;
  nonWger: number;
  survivorsBackfilled: number;
  survivorsSkippedIdempotent: number;
  dropsSoftDeleted: number;
  dropsSoftDeletedIdempotent: number;
  dedupeLosersMerged: number;
  dedupeLosersIdempotent: number;
  pending: number;
}

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();

  process.stdout.write(
    `curate-exercise-library — ${args.apply ? "APPLY (will mutate Firestore)" : "DRY RUN (no writes)"}\n` +
      `  allowlist:    ${args.allowlist}\n` +
      `  translations: ${args.translations}\n\n`,
  );

  const allowlistMd = fs.readFileSync(args.allowlist, "utf8");
  const allowlist = parseAllowlist(allowlistMd);
  process.stdout.write(
    `Parsed allowlist: survivors=${allowlist.survivors.size}, drops=${allowlist.drops.size}, dedupe-pairs=${allowlist.dedupes.size}\n`,
  );

  const translations = JSON.parse(
    fs.readFileSync(args.translations, "utf8"),
  ) as TranslationsJson;
  const translationKeys = Object.keys(translations).filter((k) =>
    k.startsWith("wger-"),
  );
  process.stdout.write(`Loaded translations: ${translationKeys.length} entries\n\n`);

  const app = initAdmin();
  const db = getFirestore(app);

  process.stdout.write("Reading /exercises from Firestore (project gcfitness-3476b)…\n");
  const snap = await db.collection("exercises").get();
  process.stdout.write(`Read ${snap.size} docs.\n\n`);

  const counts: CurationCounts = {
    total: snap.size,
    wger: 0,
    nonWger: 0,
    survivorsBackfilled: 0,
    survivorsSkippedIdempotent: 0,
    dropsSoftDeleted: 0,
    dropsSoftDeletedIdempotent: 0,
    dedupeLosersMerged: 0,
    dedupeLosersIdempotent: 0,
    pending: 0,
  };

  const writes: { ref: unknown; data: Record<string, unknown> }[] = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const docShape: DocSnapshot = {
      id: docSnap.id,
      name: data.name as DocSnapshot["name"],
      description: data.description as DocSnapshot["description"],
      deletedAt: data.deletedAt,
      mergedInto: (data.mergedInto as string | undefined) ?? null,
    };

    if (!docSnap.id.startsWith("wger-")) {
      counts.nonWger++;
      continue;
    }
    counts.wger++;

    const plan = computePatch(docShape, allowlist, translations);
    if (plan.kind === "skip") {
      if (plan.reason.includes("already soft-deleted with correct mergedInto"))
        counts.dedupeLosersIdempotent++;
      else if (plan.reason.includes("already soft-deleted"))
        counts.dropsSoftDeletedIdempotent++;
      else if (plan.reason.includes("survivor already has clean"))
        counts.survivorsSkippedIdempotent++;
      // log only on dry-run to keep apply output manageable
      if (!args.apply) {
        process.stdout.write(`[DRY] SKIP   ${docSnap.id}  — ${plan.reason}\n`);
      }
      continue;
    }

    if (plan.kind === "survivor-backfill") counts.survivorsBackfilled++;
    else if (plan.kind === "drop-soft-delete") counts.dropsSoftDeleted++;
    else if (plan.kind === "drop-with-merge") counts.dedupeLosersMerged++;
    counts.pending++;

    if (plan.patch == null) continue;

    const ref = db.collection("exercises").doc(docSnap.id);
    writes.push({ ref, data: plan.patch });

    const tag = args.apply ? "" : "[DRY] ";
    const summary =
      plan.kind === "survivor-backfill"
        ? `backfill name.{en,es}`
        : plan.kind === "drop-with-merge"
          ? `soft-delete + mergedInto=${plan.patch.mergedInto}`
          : `soft-delete`;
    process.stdout.write(`${tag}${plan.kind.padEnd(22)} ${docSnap.id}  ${summary}\n`);
  }

  process.stdout.write("\n--- Summary ---\n");
  process.stdout.write(`Total /exercises docs read:    ${counts.total}\n`);
  process.stdout.write(`  wger-* docs:                 ${counts.wger}\n`);
  process.stdout.write(`  non-wger docs (skipped):     ${counts.nonWger}\n`);
  process.stdout.write(`Survivors backfilled:          ${counts.survivorsBackfilled}\n`);
  process.stdout.write(`Survivors skipped (idempotent): ${counts.survivorsSkippedIdempotent}\n`);
  process.stdout.write(`Drops soft-deleted:            ${counts.dropsSoftDeleted}\n`);
  process.stdout.write(`Drops skipped (idempotent):    ${counts.dropsSoftDeletedIdempotent}\n`);
  process.stdout.write(`Dedupe-losers merged:          ${counts.dedupeLosersMerged}\n`);
  process.stdout.write(`Dedupe-losers skipped (idem):  ${counts.dedupeLosersIdempotent}\n`);
  process.stdout.write(`Pending writes:                ${counts.pending}\n`);

  if (counts.pending === 0) {
    process.stdout.write("\nAll desired states already present. Exit 0.\n");
    return;
  }

  if (!args.apply) {
    process.stdout.write(
      `\nDRY RUN: would update ${counts.pending} doc${counts.pending === 1 ? "" : "s"}. Re-run with --apply to mutate.\n`,
    );
    return;
  }

  process.stdout.write(`\nApplying ${counts.pending} writes in chunks of 450…\n`);
  const committed = await commitInChunks(db as unknown as DbLike, writes, true);
  process.stdout.write(`Committed ${committed} writes.\n`);
}

// Run only when invoked directly (not on import for tests).
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
}

// Re-export Timestamp for tests that need it.
export { Timestamp };
