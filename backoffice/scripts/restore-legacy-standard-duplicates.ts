import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

const COLLECTION = "exercises";
const LEGACY_REASONS = new Set(["superseded-by-standard-library"]);

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase admin credentials in environment.");
  }
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKey, "base64").toString("utf8"),
    }),
  });
}

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return { dryRun: args.has("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs();
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();

  const restoreIds = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .filter((row) => {
      if (row.data.deleted !== true) return false;
      if (!LEGACY_REASONS.has(String(row.data.deletedReason ?? ""))) return false;
      const mergedInto = row.data.mergedInto;
      if (typeof mergedInto !== "string" || mergedInto.trim().length === 0) return false;
      const source = row.data.source;
      return source === "wger" || source === "free-exercise-db";
    });

  console.log(
    JSON.stringify(
      {
        candidates: restoreIds.length,
        dryRun,
        sample: restoreIds.slice(0, 20).map((row) => row.id),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const batchSize = 250;
  for (let i = 0; i < restoreIds.length; i += batchSize) {
    const batch = db.batch();
    for (const row of restoreIds.slice(i, i + batchSize)) {
      batch.set(
        db.collection(COLLECTION).doc(row.id),
        {
          deleted: false,
          deletedAt: FieldValue.delete(),
          deletedReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
