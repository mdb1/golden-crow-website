#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const COLLECTION = "habit_templates";

const LEGACY_GLOBAL_HABIT_TEMPLATE_NAMES = new Set([
  "steps",
  "sleep",
  "protein",
  "food log",
  "energy check",
  "pasos",
  "sueno",
  "sueño",
  "proteina",
  "proteína",
  "registro de comidas",
  "chequeo de energia",
  "chequeo de energía",
]);

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

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return { dryRun: args.has("--dry-run") };
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function isLegacyGlobalHabitTemplate(row) {
  if (row.scope !== "global") return false;
  const name = row.name || {};
  const en = typeof name.en === "string" ? normalize(name.en) : "";
  const es = typeof name.es === "string" ? normalize(name.es) : "";
  return LEGACY_GLOBAL_HABIT_TEMPLATE_NAMES.has(en) || LEGACY_GLOBAL_HABIT_TEMPLATE_NAMES.has(es);
}

async function main() {
  const { dryRun } = parseArgs();
  loadEnv();
  initAdmin();

  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();
  const legacyRows = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((row) => row.data.deleted !== true)
    .filter((row) => isLegacyGlobalHabitTemplate(row.data));

  console.log(
    JSON.stringify(
      {
        candidates: legacyRows.length,
        dryRun,
        sample: legacyRows.slice(0, 20).map((row) => ({
          id: row.id,
          name: row.data.name,
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun || legacyRows.length === 0) return;

  const batchSize = 250;
  for (let i = 0; i < legacyRows.length; i += batchSize) {
    const batch = db.batch();
    for (const row of legacyRows.slice(i, i + batchSize)) {
      batch.set(
        db.collection(COLLECTION).doc(row.id),
        {
          deleted: true,
          deletedReason: "superseded-by-gc-fitness-global-habit-seed",
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
