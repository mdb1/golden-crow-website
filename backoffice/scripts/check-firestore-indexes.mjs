#!/usr/bin/env node
// scripts/check-firestore-indexes.mjs
//
// 260529 outage guard (static, best-effort).
//
// WHY: the dashboard + recent-logs outage happened because we shipped a query
// that needs a composite Firestore index BEFORE that index existed/was READY in
// prod (FAILED_PRECONDITION). This script scans the backoffice server code for
// query shapes that REQUIRE a composite index and verifies a matching index is
// declared in `firestore.indexes.json` — so "added a query, forgot the index"
// is caught at PR time instead of in production.
//
// SCOPE / HONEST LIMITATIONS (this is a safety net, not a proof):
//   - Regex-based, not a TS AST. It resolves `FirestoreCollections.X` and string
//     literals; queries built dynamically are skipped.
//   - It flags ONLY shapes Firestore actually requires a composite index for:
//       * a range/inequality filter (<, <=, >, >=, !=, not-in) combined with
//         any other filter or an orderBy on a different field, OR
//       * an equality filter combined with orderBy on a DIFFERENT field, OR
//       * multiple range/inequality fields.
//     Equality-only multi-filter queries are NOT flagged (Firestore serves them
//     via single-field zigzag merge — no composite needed).
//   - Index match is an order-INSENSITIVE superset check, so it can MISS an
//     index whose field ORDER is wrong (false negative) but will not produce
//     false positives that needlessly block CI.
//   - It does NOT verify the index is actually DEPLOYED + READY in prod. That
//     remains a deploy-ordering responsibility: deploy `firestore:indexes` and
//     wait for READY BEFORE shipping code that depends on a new index.
//
// ESCAPE HATCH: put `fb-index-ok` in a comment on/near a query chain to skip it.
//
// INDEX FILE LOCATION: `firestore.indexes.json` lives in the sibling gc-fitness
// repo. Resolution order:
//   1. $FIRESTORE_INDEXES_PATH (set this in CI if the sibling repo is checked
//      out at a non-default path)
//   2. ../../gc-fitness/firestore.indexes.json (local two-repo checkout)
//   3. a vendored copy at <repo>/firestore.indexes.json
// If none is found the script WARNS and exits 0 (so CI without the sibling repo
// doesn't hard-fail) — wire the path in CI to get real enforcement.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKOFFICE_ROOT = resolve(__dirname, "..");
const SRC_DIR = join(BACKOFFICE_ROOT, "src");

const RANGE_OPS = new Set(["<", "<=", ">", ">=", "!=", "not-in"]);

function findIndexesFile() {
  const candidates = [
    process.env.FIRESTORE_INDEXES_PATH,
    resolve(BACKOFFICE_ROOT, "../../gc-fitness/firestore.indexes.json"),
    resolve(BACKOFFICE_ROOT, "firestore.indexes.json"),
    resolve(BACKOFFICE_ROOT, "..", "firestore.indexes.json"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function loadCollectionMap() {
  // FirestoreCollections.X -> "value" from collections.ts
  const file = join(SRC_DIR, "lib", "gc-fitness", "collections.ts");
  const map = {};
  if (!existsSync(file)) return map;
  const text = readFileSync(file, "utf8");
  const re = /(\w+):\s*"([a-zA-Z0-9_]+)"/g;
  let m;
  while ((m = re.exec(text))) map[m[1]] = m[2];
  return map;
}

function loadIndexes(indexesPath) {
  const json = JSON.parse(readFileSync(indexesPath, "utf8"));
  // collectionGroup -> array of field-name sets (excluding __name__)
  const byCollection = {};
  for (const idx of json.indexes ?? []) {
    const cg = idx.collectionGroup;
    const fields = (idx.fields ?? [])
      .map((f) => f.fieldPath)
      .filter((f) => f && f !== "__name__");
    (byCollection[cg] ??= []).push(new Set(fields));
  }
  return byCollection;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function resolveCollectionName(rawArg, collectionMap) {
  const arg = rawArg.trim();
  const lit = arg.match(/^["']([^"']+)["']$/);
  if (lit) return lit[1];
  const member = arg.match(/^FirestoreCollections\.(\w+)$/);
  if (member) return collectionMap[member[1]] ?? null;
  return null; // dynamic / unresolvable
}

// Decide whether a query shape requires a composite index, and the field set
// that index must cover. Returns null when no composite index is required.
function requiredIndexFields(wheres, orderBys) {
  const whereFields = [...new Set(wheres.map((w) => w.field))];
  const orderFields = [...new Set(orderBys)];
  const ranges = wheres.filter((w) => RANGE_OPS.has(w.op));

  const rangeWithOther =
    ranges.length >= 1 &&
    (whereFields.length >= 2 ||
      orderFields.some((f) => !ranges.some((r) => r.field === f)));
  const multipleRanges = new Set(ranges.map((r) => r.field)).size >= 2;
  const equalityPlusForeignOrderBy =
    whereFields.length >= 1 &&
    orderFields.length >= 1 &&
    orderFields.some((f) => !whereFields.includes(f));

  if (!(rangeWithOther || multipleRanges || equalityPlusForeignOrderBy)) {
    return null;
  }
  return new Set([...whereFields, ...orderFields]);
}

function isSuperset(indexSet, requiredSet) {
  for (const f of requiredSet) if (!indexSet.has(f)) return false;
  return true;
}

function scanFile(file, collectionMap, indexes, violations) {
  const text = readFileSync(file, "utf8");
  // Split on `.get(` — each segment is a query chain terminating in a read.
  const segments = text.split(/\.get\(/);
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (/fb-index-ok/.test(seg)) continue;
    // The chain's collection = the LAST `.collection(...)` in the segment
    // (handles `.collection(users).doc(uid).collection("body_weight_logs")`).
    const collMatches = [...seg.matchAll(/\.collection\(\s*([^),]+(?:\([^)]*\))?)\s*\)/g)];
    if (collMatches.length === 0) continue;
    const lastColl = collMatches[collMatches.length - 1];
    const collName = resolveCollectionName(lastColl[1], collectionMap);
    if (!collName) continue;
    // Filters/orderings AFTER the resolved collection in the chain.
    const chain = seg.slice(lastColl.index);
    const wheres = [...chain.matchAll(/\.where\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g)].map(
      (m) => ({ field: m[1], op: m[2] }),
    );
    const orderBys = [...chain.matchAll(/\.orderBy\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    if (wheres.length === 0 && orderBys.length === 0) continue;

    const required = requiredIndexFields(wheres, orderBys);
    if (!required) continue;

    const candidates = indexes[collName] ?? [];
    const covered = candidates.some((idxSet) => isSuperset(idxSet, required));
    if (!covered) {
      violations.push({
        file: file.replace(BACKOFFICE_ROOT + "/", ""),
        collection: collName,
        required: [...required].join(", "),
      });
    }
  }
}

function main() {
  const indexesPath = findIndexesFile();
  if (!indexesPath) {
    console.warn(
      "[check-firestore-indexes] WARNING: firestore.indexes.json not found " +
        "(set FIRESTORE_INDEXES_PATH or check out the sibling gc-fitness repo). " +
        "Skipping composite-index coverage check.",
    );
    process.exit(0);
  }
  console.log(`[check-firestore-indexes] using index file: ${indexesPath}`);
  const collectionMap = loadCollectionMap();
  const indexes = loadIndexes(indexesPath);
  const files = walk(SRC_DIR);
  const violations = [];
  for (const f of files) scanFile(f, collectionMap, indexes, violations);

  if (violations.length === 0) {
    console.log(
      `[check-firestore-indexes] OK — scanned ${files.length} files, ` +
        "every composite query has a matching index.",
    );
    process.exit(0);
  }

  console.error(
    `\n[check-firestore-indexes] ${violations.length} query/queries need a composite index that is NOT declared in firestore.indexes.json:\n`,
  );
  for (const v of violations) {
    console.error(`  • ${v.collection}  (fields: ${v.required})`);
    console.error(`      ${v.file}`);
  }
  console.error(
    "\nAdd the index to firestore.indexes.json (sibling gc-fitness repo), " +
      "deploy it and wait for READY, THEN ship the code. " +
      "If this is a false positive, add a `fb-index-ok` comment to the query chain.\n",
  );
  process.exit(1);
}

main();
