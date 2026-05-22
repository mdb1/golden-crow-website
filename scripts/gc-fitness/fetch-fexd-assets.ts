#!/usr/bin/env tsx
/**
 * fetch-fexd-assets.ts — Image pipeline for plan 260522-mo2 Task B.
 *
 * For each approved fexd allowlist pick:
 *   1. Download start frame (0.jpg) + end frame (1.jpg) from
 *      raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<dir>/.
 *   2. Generate a 2-frame ping-pong infinite-loop preview.gif via gif-encoder-2
 *      (delay=800ms/frame, neuquant 256-color palette).
 *   3. Upload all 3 objects to gs://gcfitness-3476b.firebasestorage.app/
 *      exercises/{exerciseId}/{start.jpg|end.jpg|preview.gif} with
 *      customMetadata.sha256 stamping for idempotency.
 *   4. Capture long-lived getSignedUrl URLs in the run report
 *      (scripts/gc-fitness/fexd-assets-report.json) consumed by Task C.
 *
 * Default mode is dry-run (apply=false); --apply flips to write mode.
 * Storage uploads are RECOVERABLE: re-running --apply after a fix converges
 * via the sha256 customMetadata idempotency check. No Firestore writes.
 *
 * Behaviors from PLAN.md (verified by __tests__/fetch-fexd-assets.test.ts):
 *   B.beh.1  Default dry-run; --apply flips.
 *   B.beh.2  Source 404 → status:'missing-source' (no crash).
 *   B.beh.3  Ping-pong GIF round-trips back through gif-encoder-2's encode shape.
 *   B.beh.4  All 3 objects uploaded with customMetadata.sha256 + getSignedUrl.
 *   B.beh.5  Existing customMetadata.sha256 match → status:'skipped'.
 *   B.beh.6  Paths follow exercises/{id}/{start.jpg|end.jpg|preview.gif}.
 *   B.beh.7  Report status ∈ {would-upload,uploaded,skipped,missing-source,error}.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// gif-encoder-2 is a CommonJS pure-JS GIF encoder; require() shape works under tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const GIFEncoder = require("gif-encoder-2") as new (
  w: number,
  h: number,
  algorithm?: string,
  useOptimizer?: boolean,
  totalFrames?: number,
) => {
  start(): void;
  setRepeat(r: number): void;
  setDelay(ms: number): void;
  setQuality(q: number): void;
  addFrame(rgba: Buffer | Uint8Array): void;
  finish(): void;
  out: { getData(): Buffer };
};
// jpeg-js is a pure-JS JPEG decoder.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpeg = require("jpeg-js") as {
  decode(buf: Buffer, opts?: { useTArray?: boolean }): {
    width: number;
    height: number;
    data: Uint8Array;
  };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ENCODER_VERSION_CONSTANT = "gif-encoder-2@1.0.5";
const RAW_FEXD_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const FRAME_DELAY_MS = 800;
const STORAGE_PATHS = ["start.jpg", "end.jpg", "preview.gif"] as const;
const CONCURRENCY = 4;

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
  const storageBucket =
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
    (projectId ? `${projectId}.firebasestorage.app` : undefined);

  if (!projectId || !clientEmail || !privateKeyB64) {
    throw new Error(
      "Missing GC Fitness Firebase Admin env vars. Required: " +
        "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID, " +
        "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL, " +
        "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY. " +
        "These are normally in backoffice/.env.local — same contract as " +
        "scripts/gc-fitness/curate-exercise-library.ts.",
    );
  }

  const existing = getApps().find((a) => a.name === "fetch-fexd-assets");
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      }),
      storageBucket,
    },
    "fetch-fexd-assets",
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliArgs {
  apply: boolean;
  allowlist: string;
  report: string;
  storageBucket: string | null;
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
    report: path.resolve(__dirname, "fexd-assets-report.json"),
    storageBucket: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--allowlist") args.allowlist = path.resolve(argv[++i] ?? "");
    else if (a === "--report") args.report = path.resolve(argv[++i] ?? "");
    else if (a === "--storage-bucket") args.storageBucket = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx fetch-fexd-assets.ts [--apply] [--allowlist <path>] [--report <path>] [--storage-bucket <name>]\n\n" +
          "Downloads start/end JPGs for each approved allowlist pick from yuhonas/free-exercise-db,\n" +
          "generates a 2-frame ping-pong preview.gif, and uploads all 3 objects to\n" +
          "exercises/{id}/* in the gcfitness-3476b.firebasestorage.app bucket.\n\n" +
          "Default mode is dry-run. --apply opt-in. Idempotent via sha256 customMetadata.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Allowlist parser — extracts (exerciseId, fexdSlug) from the proposal
// ---------------------------------------------------------------------------

export interface AllowlistEntry {
  exerciseId: string;
  fexdSlug: string;
  fexdDir: string;
  disposition: "MATCH" | "NEW";
}

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
      // Left the section.
      inApproved = false;
      break;
    }
    if (!inApproved) continue;
    if (!ln.startsWith("|")) continue;
    // Skip header + separator rows.
    if (/^\|\s*fexd id/i.test(ln) || /^\|\s*-+\s*\|/.test(ln)) continue;
    const cells = ln
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
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
// Ping-pong GIF generation (B.beh.3)
// ---------------------------------------------------------------------------

export function generatePingPongGif(startJpg: Buffer, endJpg: Buffer): Buffer {
  const startDec = jpeg.decode(startJpg, { useTArray: true });
  const endDec = jpeg.decode(endJpg, { useTArray: true });

  // Resize via simple letterbox/scale if dimensions differ — for v1 we just
  // use the larger of the two and zero-pad the smaller. Most fexd JPG pairs
  // are identical 600x800.
  const width = Math.max(startDec.width, endDec.width);
  const height = Math.max(startDec.height, endDec.height);

  const startRgba = padToCanvas(startDec.data, startDec.width, startDec.height, width, height);
  const endRgba = padToCanvas(endDec.data, endDec.width, endDec.height, width, height);

  const enc = new GIFEncoder(width, height, "neuquant", false, 2);
  enc.start();
  enc.setRepeat(0); // 0 = infinite loop
  enc.setDelay(FRAME_DELAY_MS);
  enc.setQuality(10);
  enc.addFrame(Buffer.from(startRgba));
  enc.addFrame(Buffer.from(endRgba));
  enc.finish();
  return enc.out.getData();
}

function padToCanvas(
  src: Uint8Array,
  sw: number,
  sh: number,
  tw: number,
  th: number,
): Uint8Array {
  if (sw === tw && sh === th) return src;
  const out = new Uint8Array(tw * th * 4);
  // Center the src on a black canvas.
  const offX = Math.floor((tw - sw) / 2);
  const offY = Math.floor((th - sh) / 2);
  for (let y = 0; y < sh; y++) {
    const srcRow = y * sw * 4;
    const dstRow = (y + offY) * tw * 4 + offX * 4;
    out.set(src.subarray(srcRow, srcRow + sw * 4), dstRow);
  }
  // Fill alpha=255 on the pad band so encoders don't treat it as transparent.
  for (let i = 3; i < out.length; i += 4) {
    if (out[i] === 0) out[i] = 255;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source-JPG fetch + upload
// ---------------------------------------------------------------------------

class MissingSourceError extends Error {
  constructor(public statusCode: number, public url: string) {
    super(`Missing source JPG: HTTP ${statusCode} at ${url}`);
    this.name = "MissingSourceError";
  }
}

async function fetchSourceJpg(slug: string, frame: 0 | 1): Promise<Buffer> {
  const url = `${RAW_FEXD_BASE}/${slug}/${frame}.jpg`;
  const maxRetries = 3;
  const backoffs = [250, 500, 1000];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) throw new MissingSourceError(404, url);
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (err) {
      if (err instanceof MissingSourceError) throw err;
      lastErr = err;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, backoffs[attempt]));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Minimal duck-typed bucket interface — keeps the SUT decoupled from
// firebase-admin types so jest mocks can satisfy it.
export interface StorageFile {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{
    customMetadata?: Record<string, string>;
    metadata?: Record<string, string>;
  }]>;
  save(
    buf: Buffer,
    opts: {
      metadata: {
        contentType: string;
        customMetadata?: Record<string, string>;
        metadata?: Record<string, string>;
      };
    },
  ): Promise<unknown>;
  getSignedUrl(opts: { action: string; expires: string }): Promise<[string]>;
}
export interface StorageBucket {
  name: string;
  file(p: string): StorageFile;
}

export interface UploadOpts {
  dryRun: boolean;
}
export interface UploadResult {
  status: "uploaded" | "skipped" | "missing-source" | "would-upload" | "error";
  imageUrl?: string;
  endImageUrl?: string;
  gifUrl?: string;
  sourceSha256?: string;
  error?: string;
}

export async function uploadAssetsForExercise(
  pick: { exerciseId: string; fexdSlug: string; fexdDir: string },
  bucket: StorageBucket,
  opts: UploadOpts,
): Promise<UploadResult> {
  let startJpg: Buffer;
  let endJpg: Buffer;
  try {
    startJpg = await fetchSourceJpg(pick.fexdDir, 0);
    endJpg = await fetchSourceJpg(pick.fexdDir, 1);
  } catch (err) {
    if (err instanceof MissingSourceError) {
      return { status: "missing-source", error: err.message };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }

  const sha = crypto
    .createHash("sha256")
    .update(startJpg)
    .update(endJpg)
    .update(ENCODER_VERSION_CONSTANT)
    .digest("hex");

  const paths = STORAGE_PATHS.map((n) => `exercises/${pick.exerciseId}/${n}`);

  // Idempotency check — only when not dry-running. (Dry-run still walks the
  // same code path so we can detect 'would-upload' even on already-present
  // objects with non-matching sha.)
  if (!opts.dryRun) {
    const metas = await Promise.all(
      paths.map(async (p) => {
        const file = bucket.file(p);
        const [exists] = await file.exists();
        if (!exists) return { exists: false, sha: null as string | null, file };
        const [meta] = await file.getMetadata();
        // Google Cloud Storage / firebase-admin: user-set custom metadata
        // appears under either `customMetadata` (some firebase-admin paths
        // expose it that way) or `metadata` (raw GCS shape). Check both.
        const cm =
          (meta as { customMetadata?: Record<string, string> })?.customMetadata ??
          (meta as { metadata?: Record<string, string> })?.metadata ??
          {};
        return {
          exists: true,
          sha: cm.sha256 ?? null,
          file,
        };
      }),
    );
    const allExist = metas.every((m) => m.exists);
    const allShaMatch = metas.every((m) => m.sha === sha);
    if (allExist && allShaMatch) {
      // Recover existing URLs.
      const urls = await Promise.all(
        metas.map(async (m) => (await m.file.getSignedUrl({
          action: "read",
          expires: "2099-01-01T00:00:00Z",
        }))[0]),
      );
      return {
        status: "skipped",
        imageUrl: urls[0],
        endImageUrl: urls[1],
        gifUrl: urls[2],
        sourceSha256: sha,
      };
    }
  }

  // Generate GIF.
  let gif: Buffer;
  try {
    gif = generatePingPongGif(startJpg, endJpg);
  } catch (err) {
    return { status: "error", error: `GIF encode failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (opts.dryRun) {
    return {
      status: "would-upload",
      sourceSha256: sha,
    };
  }

  const buffers: Buffer[] = [startJpg, endJpg, gif];
  const contentTypes = ["image/jpeg", "image/jpeg", "image/gif"];
  const urls: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const file = bucket.file(paths[i]);
    const customMeta = {
      sha256: sha,
      sourceUrl: `${RAW_FEXD_BASE}/${pick.fexdDir}/${i === 1 ? "1" : "0"}.jpg`,
      generatedAt: new Date().toISOString(),
      fexdSlug: pick.fexdSlug,
      encoderVersion: ENCODER_VERSION_CONSTANT,
    };
    await file.save(buffers[i], {
      metadata: {
        contentType: contentTypes[i],
        // Set BOTH shapes so getMetadata() reads back the sha256 across
        // both firebase-admin (`customMetadata`) and raw GCS (`metadata`).
        customMetadata: customMeta,
        metadata: customMeta,
      },
    });
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: "2099-01-01T00:00:00Z",
    });
    urls.push(signedUrl);
  }

  return {
    status: "uploaded",
    imageUrl: urls[0],
    endImageUrl: urls[1],
    gifUrl: urls[2],
    sourceSha256: sha,
  };
}

// ---------------------------------------------------------------------------
// Report shape (B.beh.7)
// ---------------------------------------------------------------------------

export interface AssetReportEntry {
  status: "would-upload" | "uploaded" | "skipped" | "missing-source" | "error";
  imageUrl?: string;
  endImageUrl?: string;
  gifUrl?: string;
  sourceSha256?: string;
  error?: string;
}

export type AssetReport = Record<string, AssetReportEntry>;

// ---------------------------------------------------------------------------
// Concurrency-bounded runner
// ---------------------------------------------------------------------------

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => lane());
  await Promise.all(lanes);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const app = initAdmin();
  const storage = getStorage(app);
  const bucket = (args.storageBucket
    ? storage.bucket(args.storageBucket)
    : storage.bucket()) as unknown as StorageBucket;

  if (!fs.existsSync(args.allowlist)) {
    throw new Error(`Allowlist not found: ${args.allowlist}`);
  }
  const md = fs.readFileSync(args.allowlist, "utf8");
  const picks = parseAllowlistForFexd(md);
  process.stdout.write(
    `Loaded ${picks.length} picks from ${args.allowlist}. ` +
      `Bucket: ${bucket.name}. Mode: ${args.apply ? "APPLY" : "DRY-RUN"}.\n`,
  );

  const report: AssetReport = {};
  const dryRun = !args.apply;

  await runWithConcurrency(picks, CONCURRENCY, async (p, i) => {
    const tag = `[${i + 1}/${picks.length}] ${p.exerciseId}`;
    try {
      const res = await uploadAssetsForExercise(p, bucket, { dryRun });
      report[p.exerciseId] = res;
      const stamp = res.status.toUpperCase();
      process.stdout.write(`${tag}: ${stamp}\n`);
    } catch (err) {
      report[p.exerciseId] = {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      process.stdout.write(
        `${tag}: ERROR — ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  });

  fs.writeFileSync(args.report, JSON.stringify(report, null, 2), "utf8");

  // Summary.
  const counts: Record<string, number> = {};
  for (const entry of Object.values(report)) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  process.stdout.write(`\nReport written to ${args.report}.\nCounts:\n`);
  for (const [k, v] of Object.entries(counts)) {
    process.stdout.write(`  ${k}: ${v}\n`);
  }
}

// Only run main() when invoked directly via tsx, not when imported by jest.
if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
