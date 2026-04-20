import type { AccentTone, ReportSourceKey } from "./moderation-types";

const COMMUNITY_TAG_COLORS: Record<string, string> = {
  haplogroups: "#E04C73",
  ethnicity: "#5FAE6A",
  migration: "#FF9E2C",
  "family tree": "#EC4C6A",
  origins: "#E0403D",
  pharmacogenomics: "#FF9E2C",
  "drug response": "#E04C73",
  metabolism: "#5FAE6A",
  "adverse effects": "#E0403D",
  dosage: "#EC4C6A",
  nutrigenomics: "#E04C73",
  macros: "#FF9E2C",
  micronutrients: "#5FAE6A",
  supplements: "#EC4C6A",
  "diet plans": "#E0403D",
  diagnostics: "#5FAE6A",
  risk: "#E0403D",
  carrier: "#E04C73",
  hereditary: "#EC4C6A",
  "rare disease": "#FF9E2C",
  "testing journey": "#E04C73",
  "doctor visit": "#5FAE6A",
  results: "#FF9E2C",
  family: "#EC4C6A",
  support: "#E0403D",
  "genetics 101": "#E04C73",
  dna: "#5FAE6A",
  rna: "#FF9E2C",
  crispr: "#EC4C6A",
  bioinformatics: "#E0403D",
  sequencing: "#F1A0C9",
  papers: "#5FAE6A",
  studies: "#E04C73",
  datasets: "#FF9E2C",
  "open science": "#EC4C6A",
  tools: "#E0403D",
  genomics: "#E04C73",
  variants: "#5FAE6A",
  data: "#FF9E2C",
  community: "#EC4C6A",
};

const COMMUNITY_TAG_FALLBACK_PALETTE = [
  "#E04C73",
  "#5FAE6A",
  "#FF9E2C",
  "#EC4C6A",
  "#E0403D",
];

const REPORT_SOURCE_META: Record<
  ReportSourceKey,
  { label: string; color: string }
> = {
  myDNAMap: { label: "PocketGenes", color: "#E5517D" },
  ActyonGenomics: { label: "ActyonGenomics", color: "#0097A7" },
  vcf: { label: "VCF", color: "#FF9E2C" },
  "2pq": { label: "2PQ", color: "#6366F1" },
};

const REPORT_STATUS_COLORS: Record<string, string> = {
  complete: "#5FAE6A",
  synced: "#5FAE6A",
  ready: "#5FAE6A",
  linked: "#5FAE6A",
  waiting: "#FF9E2C",
  pending: "#FF9E2C",
  review: "#FF9E2C",
  processing: "#4E8FBB",
  queued: "#4E8FBB",
  patient: "#EC4C6A",
  missing: "#E0403D",
  failed: "#E0403D",
  error: "#E0403D",
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCommunityTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeReportToken(value: string): string {
  return value.trim().toLowerCase();
}

export function getString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => getString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const single = getString(value);
  return single ? [single] : [];
}

export function getBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

export function pickFirstString(
  data: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const candidate = getString(data[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function formatDateTime(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  const candidate =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string"
        ? new Date(value)
        : undefined;

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(candidate);
}

export function flattenSearchValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => flattenSearchValue(entry)).join(" ");
  }

  if (isPlainRecord(value)) {
    return Object.values(value)
      .map((entry) => flattenSearchValue(entry))
      .join(" ");
  }

  return "";
}

function normalizeForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForStableStringify(entry));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForStableStringify(value[key])])
    );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

export function toPrettyJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

export function parseDocumentDraft(input: string): {
  data?: Record<string, unknown>;
  error?: string;
} {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!isPlainRecord(parsed)) {
      return { error: "The document draft must be a JSON object." };
    }

    return { data: parsed };
  } catch {
    return { error: "The document draft contains invalid JSON." };
  }
}

export function getChangedPaths(
  source: unknown,
  draft: unknown,
  prefix = ""
): string[] {
  if (stableStringify(source) === stableStringify(draft)) {
    return [];
  }

  if (Array.isArray(source) && Array.isArray(draft)) {
    const length = Math.max(source.length, draft.length);
    const changes = Array.from({ length }, (_, index) =>
      getChangedPaths(source[index], draft[index], `${prefix}[${index}]`)
    ).flat();

    return changes.length > 0 ? changes : [prefix || "document"];
  }

  if (isPlainRecord(source) && isPlainRecord(draft)) {
    const keys = new Set([...Object.keys(source), ...Object.keys(draft)]);
    const changes = [...keys]
      .map((key) =>
        getChangedPaths(
          source[key],
          draft[key],
          prefix ? `${prefix}.${key}` : key
        )
      )
      .flat();

    return changes.length > 0 ? changes : [prefix || "document"];
  }

  return [prefix || "document"];
}

export function compactList(items: Array<string | undefined>): string {
  return items.filter(Boolean).join(" • ");
}

export function toneToBadgeVariant(tone: AccentTone = "neutral") {
  switch (tone) {
    case "blue":
      return "brand";
    case "green":
      return "success";
    case "rose":
      return "rose";
    case "amber":
      return "warning";
    case "red":
      return "destructive";
    default:
      return "outline";
  }
}

export function getCommunityTagColor(tag: string): string {
  const normalizedTag = normalizeCommunityTag(tag);

  return (
    COMMUNITY_TAG_COLORS[normalizedTag] ??
    COMMUNITY_TAG_FALLBACK_PALETTE[
      hashString(normalizedTag) % COMMUNITY_TAG_FALLBACK_PALETTE.length
    ]
  );
}

export function getCommunityTagStyles(tag: string) {
  const color = getCommunityTagColor(tag);

  return {
    backgroundColor: hexToRgba(color, 0.2),
    borderColor: hexToRgba(color, 0.36),
    color,
  };
}

export function getReportSourceMeta(source: ReportSourceKey) {
  return REPORT_SOURCE_META[source] ?? REPORT_SOURCE_META.myDNAMap;
}

export function getReportPillStyles(color: string) {
  return {
    backgroundColor: hexToRgba(color, 0.16),
    borderColor: hexToRgba(color, 0.34),
    color,
  };
}

export function formatReportStatus(status?: string | null) {
  const normalized = getString(status);
  if (!normalized) {
    return undefined;
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getReportStatusColor(status?: string | null) {
  const normalized = getString(status);
  if (!normalized) {
    return "#4E8FBB";
  }

  const tokens = normalizeReportToken(normalized).split(/[\s_-]+/);
  const matchingToken = tokens.find((token) => REPORT_STATUS_COLORS[token]);
  return matchingToken ? REPORT_STATUS_COLORS[matchingToken] : "#4E8FBB";
}

export function formatReportFormat(providerFormat?: string | null) {
  const normalized = getString(providerFormat)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "mdm":
      return "MDM";
    case "ag":
      return "AG";
    case "vcf":
      return "VCF";
    case "pdf":
      return "PDF";
    case "2pq":
      return "2PQ";
    default:
      return normalized.toUpperCase();
  }
}

export function isCollectionKey(value: string): value is import("./moderation-types").CollectionKey {
  return [
    "profiles",
    "public_profiles",
    "community_users",
    "community_posts",
    "report_codes",
    "uploaded_reports",
    "file_storage",
    "report_owners",
    "user_progress",
  ].includes(value);
}

export function isSubcollectionKey(
  value: string
): value is import("./moderation-types").SubcollectionKey {
  return value === "comments" || value === "events";
}
