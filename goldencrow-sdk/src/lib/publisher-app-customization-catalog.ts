import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

type TextValidationCatalog = {
  catalogVersion: number;
  keyHashes: string[];
  formats: Record<
    string,
    { formatArguments: string[]; escapedPercentCount: number }
  >;
};

type ColorValidationCatalog = {
  catalogVersion: number;
  keys: string[];
};

let textCatalog: TextValidationCatalog | undefined;
let colorCatalog: ColorValidationCatalog | undefined;
let textKeyHashes: Set<string> | undefined;
let colorKeys: Set<string> | undefined;

function readCompressedCatalog<T>(fileName: string): T {
  const catalogUrl = new URL(`../../catalogs/${fileName}`, import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(catalogUrl)).toString("utf8")) as T;
}

function getTextCatalog() {
  textCatalog ??= readCompressedCatalog<TextValidationCatalog>(
    "custom-app-text-validation.json.gz",
  );
  return textCatalog;
}

function getColorCatalog() {
  colorCatalog ??= readCompressedCatalog<ColorValidationCatalog>(
    "custom-app-color-validation.json.gz",
  );
  return colorCatalog;
}

function catalogKeyHash(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export function getPublisherAppTextCatalogOption(key: string) {
  const hash = catalogKeyHash(key);
  textKeyHashes ??= new Set(getTextCatalog().keyHashes);
  if (!textKeyHashes.has(hash)) return undefined;
  const formatting = getTextCatalog().formats[hash];
  return {
    formatArguments: formatting?.formatArguments ?? [],
    escapedPercentCount: formatting?.escapedPercentCount ?? 0,
  };
}

export function getPublisherAppColorCatalogVersion() {
  return getColorCatalog().catalogVersion;
}

export function getPublisherAppColorCatalogOption(key: string) {
  colorKeys ??= new Set(getColorCatalog().keys);
  return colorKeys.has(key) ? { key } : undefined;
}
