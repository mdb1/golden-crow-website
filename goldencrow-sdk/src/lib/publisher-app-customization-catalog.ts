import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export type PublisherAppTextCatalogOption = {
  key: string;
  defaultEnglishText: string;
  defaultSpanishText: string;
  groups: string[];
  platforms: Array<"ios" | "android">;
  formatArguments: string[];
};

export type PublisherAppColorCatalogOption = {
  key: string;
  title: string;
  usageDescription: string;
  defaultLightColor: string;
  defaultDarkColor: string;
  group: string;
  platforms: Array<"ios" | "android">;
};

type TextCatalog = {
  catalogVersion: number;
  options: PublisherAppTextCatalogOption[];
};

type ColorCatalog = {
  catalogVersion: number;
  options: PublisherAppColorCatalogOption[];
};

export type PublisherAppCatalogPage<T> = {
  catalogVersion: number;
  items: T[];
  groups: string[];
  totalCount: number;
  nextCursor: string | null;
};

let textCatalog: TextCatalog | undefined;
let colorCatalog: ColorCatalog | undefined;
let textOptionsByKey: Map<string, PublisherAppTextCatalogOption> | undefined;
let colorOptionsByKey: Map<string, PublisherAppColorCatalogOption> | undefined;

function readCompressedCatalog<T>(fileName: string): T {
  const catalogUrl = new URL(`../../catalogs/${fileName}`, import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(catalogUrl)).toString("utf8")) as T;
}

function getTextCatalog() {
  textCatalog ??= readCompressedCatalog<TextCatalog>(
    "custom-app-texts.json.gz",
  );
  return textCatalog;
}

function getColorCatalog() {
  colorCatalog ??= readCompressedCatalog<ColorCatalog>(
    "custom-app-colors.json.gz",
  );
  return colorCatalog;
}

export function getPublisherAppTextCatalogOption(key: string) {
  if (!textOptionsByKey) {
    textOptionsByKey = new Map(
      getTextCatalog().options.map((option) => [option.key, option]),
    );
  }
  return textOptionsByKey.get(key);
}

export function getPublisherAppColorCatalogOption(key: string) {
  if (!colorOptionsByKey) {
    colorOptionsByKey = new Map(
      getColorCatalog().options.map((option) => [option.key, option]),
    );
  }
  return colorOptionsByKey.get(key);
}

function normalizedSearch(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("en") ?? "";
}

function pageCatalog<T>(
  options: T[],
  catalogVersion: number,
  groups: string[],
  matches: (option: T) => boolean,
  cursor: number,
  limit: number,
): PublisherAppCatalogPage<T> {
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
      if (!query) return true;
      return [
        option.key,
        option.defaultEnglishText,
        option.defaultSpanishText,
        ...option.groups,
      ].some((value) => value.toLocaleLowerCase("en").includes(query));
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
      if (!query) return true;
      return [
        option.key,
        option.title,
        option.usageDescription,
        option.group,
      ].some((value) => value.toLocaleLowerCase("en").includes(query));
    },
    input.cursor,
    input.limit,
  );
}
