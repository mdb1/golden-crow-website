import type { ModerationDocumentRecord } from "./moderation-types";
import { getBoolean, getString, getStringArray } from "./moderation-utils";

interface BaseCommunityRecord {
  id: string;
  sourceData: Record<string, unknown>;
}

export interface PublicProfileRecord extends BaseCommunityRecord {
  fullName: string;
  email: string;
  username: string;
  gender: string;
  condition: string;
  hasProfileImage: boolean;
  iconName: string;
  iconColorHex: string;
  updatedAt?: string;
}

export interface CommunityUserRecord extends BaseCommunityRecord {
  username: string;
  email: string;
  isActivityPublic: boolean;
  isClinician: boolean;
  iconName: string;
  iconColorHex: string;
  ownedReports: string[];
  stats: {
    totalLikes: number;
    postsCreated: number;
    totalReplies: number;
    aminoacidsCollected: number;
    lessonsLearned: number;
  };
  updatedAt?: string;
}

export interface CommunityPostRecord extends BaseCommunityRecord {
  title: string;
  body: string;
  community: string;
  tags: string[];
  authorId: string;
  authorEmail: string;
  authorIconName: string;
  authorIconColorHex: string;
  commentCount: number;
  upvotes: number;
  downvotes: number;
  score: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommunityCommentRecord extends BaseCommunityRecord {
  body: string;
  authorId: string;
  authorEmail: string;
  authorIconName: string;
  authorIconColorHex: string;
  associatedReference: string;
  createdAt?: string;
  upvotes: number;
  downvotes: number;
  score: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwnKey(data: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function getFieldValue(data: Record<string, unknown>, path: string): unknown {
  if (hasOwnKey(data, path)) {
    return data[path];
  }

  if (!path.includes(".")) {
    return data[path];
  }

  const segments = path.split(".");
  let current: unknown = data;

  for (const segment of segments) {
    if (!isPlainRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function pickFirstValue(data: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = getFieldValue(data, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function getStringField(data: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = getString(getFieldValue(data, path));
    if (value) {
      return value;
    }
  }

  return "";
}

function getBooleanField(
  data: Record<string, unknown>,
  paths: string[],
  fallback = false
) {
  for (const path of paths) {
    const value = getBoolean(getFieldValue(data, path));
    if (value !== undefined) {
      return value;
    }
  }

  return fallback;
}

function getNumberField(
  data: Record<string, unknown>,
  paths: string[],
  fallback = 0
) {
  for (const path of paths) {
    const value = pickFirstValue(data, [path]);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function getStringArrayField(data: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = getFieldValue(data, path);
    const entries = getStringArray(value);
    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
}

export function cloneDocumentData(data: Record<string, unknown>) {
  return typeof structuredClone === "function"
    ? structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
}

function hasPathLikeSource(data: Record<string, unknown>, path: string) {
  return hasOwnKey(data, path) || getFieldValue(data, path) !== undefined;
}

export function setFieldLikeSource(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  preferredPath: string,
  value: unknown,
  aliases: string[] = []
) {
  const resolvedPath =
    [preferredPath, ...aliases].find((path) => hasPathLikeSource(source, path)) ??
    preferredPath;

  if (hasOwnKey(target, resolvedPath)) {
    target[resolvedPath] = value;
    return;
  }

  if (!resolvedPath.includes(".")) {
    target[resolvedPath] = value;
    return;
  }

  const segments = resolvedPath.split(".");
  let current = target;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isPlainRecord(next)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

export function parsePublicProfileRecord(
  document: ModerationDocumentRecord
): PublicProfileRecord {
  const data = document.data;

  return {
    id: document.id,
    fullName: getStringField(data, ["fullName", "full_name"]),
    email: getStringField(data, ["email"]),
    username: getStringField(data, ["username"]),
    gender: getStringField(data, ["gender"]),
    condition: getStringField(data, ["condition"]),
    hasProfileImage: getBooleanField(data, ["has_profile_image"]),
    iconName: getStringField(data, ["iconName", "icon_name"]),
    iconColorHex: getStringField(data, ["iconColorHex", "icon_color_hex"]),
    updatedAt: getString(getFieldValue(data, "updatedAt")),
    sourceData: data,
  };
}

export function parseCommunityUserRecord(
  document: ModerationDocumentRecord
): CommunityUserRecord {
  const data = document.data;

  return {
    id: document.id,
    username: getStringField(data, ["username"]),
    email: getStringField(data, ["email"]),
    isActivityPublic: getBooleanField(data, ["is_activity_public"]),
    isClinician: getBooleanField(data, ["is_clinician"]),
    iconName: getStringField(data, ["iconName", "icon_name"]),
    iconColorHex: getStringField(data, ["iconColorHex", "icon_color_hex"]),
    ownedReports: getStringArrayField(data, ["owned_reports"]),
    stats: {
      totalLikes: getNumberField(data, ["stats.total_likes"]),
      postsCreated: getNumberField(data, ["stats.posts_created"]),
      totalReplies: getNumberField(data, ["stats.total_replies"]),
      aminoacidsCollected: getNumberField(data, ["stats.aminoacids_collected"]),
      lessonsLearned: getNumberField(data, ["stats.lessons_learned"]),
    },
    updatedAt: getString(getFieldValue(data, "updatedAt")),
    sourceData: data,
  };
}

export function parseCommunityPostRecord(
  document: ModerationDocumentRecord
): CommunityPostRecord {
  const data = document.data;

  return {
    id: document.id,
    title: getStringField(data, ["title"]),
    body: getStringField(data, ["body"]),
    community: getStringField(data, ["community"]),
    tags: getStringArrayField(data, ["tags"]),
    authorId: getStringField(data, ["authorId"]),
    authorEmail: getStringField(data, ["authorEmail"]),
    authorIconName: getStringField(data, ["authorIconName"]),
    authorIconColorHex: getStringField(data, ["authorIconColorHex"]),
    commentCount: getNumberField(data, ["commentCount"]),
    upvotes: getNumberField(data, ["upvotes"]),
    downvotes: getNumberField(data, ["downvotes"]),
    score: getNumberField(data, ["score"]),
    createdAt: getString(getFieldValue(data, "createdAt")),
    updatedAt: getString(getFieldValue(data, "updatedAt")),
    sourceData: data,
  };
}

export function parseCommunityCommentRecord(
  document: ModerationDocumentRecord
): CommunityCommentRecord {
  const data = document.data;

  return {
    id: document.id,
    body: getStringField(data, ["body"]),
    authorId: getStringField(data, ["authorId"]),
    authorEmail: getStringField(data, ["authorEmail"]),
    authorIconName: getStringField(data, ["authorIconName"]),
    authorIconColorHex: getStringField(data, ["authorIconColorHex"]),
    associatedReference: getStringField(data, ["associatedReference"]),
    createdAt: getString(getFieldValue(data, "createdAt")),
    upvotes: getNumberField(data, ["upvotes"]),
    downvotes: getNumberField(data, ["downvotes"]),
    score: getNumberField(data, ["score"]),
    sourceData: data,
  };
}
