#!/usr/bin/env tsx
/**
 * verify-fexd-assets.ts — Read-only post-run audit for plan 260522-mo2.
 *
 * Default mode (full): for every approved allowlist pick, confirm:
 *   (a) All 3 Storage objects exist at exercises/{id}/{start.jpg|end.jpg|preview.gif}.
 *   (b) The corresponding Firestore /exercises/{id} doc's imageUrl/endImageUrl/gifUrl
 *       all resolve to firebasestorage.googleapis.com (NOT raw.githubusercontent.com).
 *
 * --storage-only mode (Task B verify block): skip the Firestore checks — useful
 * BEFORE Task C has migrated the docs.
 *
 * Exit non-zero on any missing asset / Firestore-URL mismatch / raw.github leak.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { parseAllowlistForFexd, type AllowlistEntry } from "./fetch-fexd-assets";

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
    throw new Error("Missing GC Fitness Firebase Admin env vars (see fetch-fexd-assets.ts).");
  }
  const existing = getApps().find((a) => a.name === "verify-fexd-assets");
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
    "verify-fexd-assets",
  );
}

interface CliArgs {
  allowlist: string;
  storageOnly: boolean;
}

function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
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
    storageOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--storage-only") args.storageOnly = true;
    else if (a === "--allowlist") args.allowlist = path.resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: tsx verify-fexd-assets.ts [--storage-only] [--allowlist <path>]\n\n" +
          "Default (full): asserts all Storage objects + Firestore URL fields exist.\n" +
          "--storage-only: skips Firestore checks (run before Task C migrates the docs).\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const app = initAdmin();
  const storage = getStorage(app);
  const bucket = storage.bucket();
  const db = getFirestore(app);

  if (!fs.existsSync(args.allowlist)) {
    throw new Error(`Allowlist not found: ${args.allowlist}`);
  }
  const picks: AllowlistEntry[] = parseAllowlistForFexd(fs.readFileSync(args.allowlist, "utf8"));
  process.stdout.write(
    `Loaded ${picks.length} picks. Bucket: ${bucket.name}. Mode: ${
      args.storageOnly ? "STORAGE-ONLY" : "FULL"
    }.\n`,
  );

  let storageMissing = 0;
  let firestoreMissing = 0;
  let rawGithubLeaks = 0;
  let okCount = 0;

  for (const pick of picks) {
    const paths = ["start.jpg", "end.jpg", "preview.gif"].map(
      (n) => `exercises/${pick.exerciseId}/${n}`,
    );
    const existsResults = await Promise.all(paths.map((p) => bucket.file(p).exists()));
    const allExist = existsResults.every((e) => e[0]);
    if (!allExist) {
      storageMissing++;
      const miss = paths.filter((_, i) => !existsResults[i][0]);
      process.stdout.write(`  MISSING storage: ${pick.exerciseId} — ${miss.join(", ")}\n`);
      continue;
    }

    if (args.storageOnly) {
      okCount++;
      continue;
    }

    // Full mode — read Firestore doc and check URL fields.
    const snap = await db.collection("exercises").doc(pick.exerciseId).get();
    if (!snap.exists) {
      firestoreMissing++;
      process.stdout.write(`  MISSING firestore doc: ${pick.exerciseId}\n`);
      continue;
    }
    const data = snap.data() ?? {};
    const urls = [
      data.imageUrl as string | undefined,
      data.endImageUrl as string | undefined,
      data.gifUrl as string | undefined,
    ];
    let pickOk = true;
    for (const u of urls) {
      if (!u || typeof u !== "string") {
        firestoreMissing++;
        pickOk = false;
        process.stdout.write(`  MISSING url field on ${pick.exerciseId}\n`);
        break;
      }
      if (/githubusercontent\.com/i.test(u)) {
        rawGithubLeaks++;
        pickOk = false;
        process.stdout.write(`  RAW-GITHUB leak on ${pick.exerciseId}: ${u}\n`);
        break;
      }
      // Accept any of the three valid Firebase Storage URL shapes:
      //   1. firebasestorage.googleapis.com/v0/b/<bucket>/o/<path> (consumer SDK getDownloadURL)
      //   2. storage.googleapis.com/<bucket>/<path>?GoogleAccessId=... (Admin SDK v2 getSignedUrl)
      //   3. gs://<bucket>/<path> (admin-only)
      // The Admin SDK's getSignedUrl returns shape #2 — the bucket name
      // appears in the URL path, which is what we verify here.
      const isFirebaseStorageHost =
        /firebasestorage\.googleapis\.com/i.test(u) ||
        /storage\.googleapis\.com/i.test(u) ||
        u.startsWith("gs://");
      if (!isFirebaseStorageHost) {
        firestoreMissing++;
        pickOk = false;
        process.stdout.write(`  UNEXPECTED url host on ${pick.exerciseId}: ${u}\n`);
        break;
      }
      // Cross-check that the URL references the expected bucket (project
      // gcfitness-3476b). This catches cross-project leaks.
      if (!u.includes(bucket.name) && !u.includes(`gcfitness-3476b`)) {
        firestoreMissing++;
        pickOk = false;
        process.stdout.write(
          `  UNEXPECTED bucket on ${pick.exerciseId}: ${u}\n`,
        );
        break;
      }
    }
    if (pickOk) okCount++;
  }

  process.stdout.write(
    `\nverify-fexd-assets ${args.storageOnly ? "storage-only" : "full"}: ` +
      `${okCount}/${picks.length} OK. ` +
      `Storage-missing=${storageMissing} ` +
      `Firestore-missing=${firestoreMissing} ` +
      `Raw-github-leaks=${rawGithubLeaks}.\n`,
  );

  if (storageMissing > 0 || firestoreMissing > 0 || rawGithubLeaks > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
