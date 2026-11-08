import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// The native catalog is the shared source of truth. Keep the complete discovery
// catalog and the SDK's compact allowlist in the same generated update.
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = resolve(
  process.argv[2] ?? resolve(repoRoot, "../mydnamap/CUSTOM_APP_COLORS.json"),
);
const catalog = JSON.parse(readFileSync(sourcePath, "utf8"));
if (!Number.isInteger(catalog.catalogVersion) || !Array.isArray(catalog.options)) {
  throw new Error("Expected a versioned native color catalog.");
}
const keys = catalog.options.map((option) => option.key);
const keySet = new Set(keys);
if (keys.length === 0 || keySet.size !== keys.length) {
  throw new Error("Color role keys must be nonempty and unique.");
}
for (const option of catalog.options) {
  if (!option.key || ![option.defaultLightColor, option.defaultDarkColor].every(
    (value) => /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(value),
  )) {
    throw new Error(`Invalid color role: ${option.key}`);
  }
}
for (const flow of catalog.alternativeTonalFlows ?? []) {
  if (!flow.roleKeys.every((key) => keySet.has(key))) {
    throw new Error(`Tonal flow ${flow.id} refers to an unknown role.`);
  }
}
for (const pair of catalog.contrastPairs ?? []) {
  if (
    !keySet.has(pair.foregroundKey) ||
    !Array.isArray(pair.backgroundKeys) ||
    pair.backgroundKeys.length === 0 ||
    !pair.backgroundKeys.every((key) => keySet.has(key)) ||
    !(pair.minimumRatio > 1 && pair.minimumRatio <= 21)
  ) {
    throw new Error(`Invalid contrast relationship: ${pair.foregroundKey}`);
  }
}
const outputs = [
  ["backoffice/catalogs/custom-app-colors.json.gz", catalog],
  ["goldencrow-sdk/catalogs/custom-app-color-validation.json.gz", {
    catalogVersion: catalog.catalogVersion,
    keys: keys.toSorted(),
  }],
];
for (const [target, value] of outputs) {
  writeFileSync(resolve(repoRoot, target), gzipSync(JSON.stringify(value), { level: 9 }));
}
console.log(`Synchronized color catalog v${catalog.catalogVersion}: ${keys.length} roles, ${(catalog.contrastPairs ?? []).length} contrast relationships.`);
