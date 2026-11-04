import "server-only";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type {
  PublisherAppColorCatalogOption,
  PublisherAppCustomizationCatalogPage,
  PublisherAppTextCatalogOption,
} from "@/lib/publisher-app-config";

type TextCatalog = {
  catalogVersion: number;
  options: PublisherAppTextCatalogOption[];
};

type ColorCatalog = {
  catalogVersion: number;
  options: PublisherAppColorCatalogOption[];
};

let textCatalog: TextCatalog | undefined;
let colorCatalog: ColorCatalog | undefined;

const TEXT_CATALOG_URL = new URL(
  "../../catalogs/custom-app-texts.json.gz",
  import.meta.url,
);
const COLOR_CATALOG_URL = new URL(
  "../../catalogs/custom-app-colors.json.gz",
  import.meta.url,
);

function readCompressedCatalog<T>(catalogUrl: URL): T {
  return JSON.parse(gunzipSync(readFileSync(catalogUrl)).toString("utf8")) as T;
}

function getTextCatalog() {
  textCatalog ??= readCompressedCatalog<TextCatalog>(TEXT_CATALOG_URL);
  return textCatalog;
}

function getColorCatalog() {
  colorCatalog ??= readCompressedCatalog<ColorCatalog>(COLOR_CATALOG_URL);
  return colorCatalog;
}

function normalizedSearch(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("en") ?? "";
}

function matchesSearch(values: string[], query: string) {
  if (!query) return true;
  const haystack = values.join("\n").toLocaleLowerCase("en");
  return query.split(/\s+/).every((token) => haystack.includes(token));
}

function pageCatalog<T>(
  options: T[],
  catalogVersion: number,
  groups: string[],
  matches: (option: T) => boolean,
  cursor: number,
  limit: number,
): PublisherAppCustomizationCatalogPage<T> {
  const filtered = options.filter(matches);
  const items = filtered.slice(cursor, cursor + limit);
  return {
    catalogVersion,
    items,
    groups,
    totalCount: filtered.length,
    nextCursor:
      cursor + items.length < filtered.length
        ? String(cursor + items.length)
        : null,
  };
}

export function searchPublisherAppTextCatalog(input: {
  query?: string;
  group?: string;
  cursor: number;
  limit: number;
}) {
  const catalog = getTextCatalog();
  const query = normalizedSearch(input.query);
  const group = input.group?.trim();
  const groups = [
    ...new Set(catalog.options.flatMap((option) => option.groups)),
  ].sort((left, right) => left.localeCompare(right));

  return pageCatalog(
    catalog.options,
    catalog.catalogVersion,
    groups,
    (option) => {
      if (group && !option.groups.includes(group)) return false;
      return matchesSearch(
        [
          option.key,
          option.defaultEnglishText,
          option.defaultSpanishText,
          ...option.groups,
        ],
        query,
      );
    },
    input.cursor,
    input.limit,
  );
}

export function searchPublisherAppColorCatalog(input: {
  query?: string;
  group?: string;
  cursor: number;
  limit: number;
}) {
  const catalog = getColorCatalog();
  const query = normalizedSearch(input.query);
  const group = input.group?.trim();
  const groups = [
    ...new Set(catalog.options.map((option) => option.group)),
  ].sort((left, right) => left.localeCompare(right));

  return pageCatalog(
    catalog.options,
    catalog.catalogVersion,
    groups,
    (option) => {
      if (group && option.group !== group) return false;
      return matchesSearch(
        [option.key, option.title, option.usageDescription, option.group],
        query,
      );
    },
    input.cursor,
    input.limit,
  );
}
