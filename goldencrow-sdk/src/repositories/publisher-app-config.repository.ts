import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { createHash, randomInt } from "node:crypto";
import { adminDbFor } from "../config/firebase.js";
import type {
  AdminContext,
  PublisherAppAdvancedConfiguration,
  PublisherAppConfigColors,
  PublisherAppConfigAdminUpdateInput,
  PublisherAppCatalogSnapshot,
  PublisherAppCatalogSnapshotItem,
  PublisherAppConfigCreateInput,
  PublisherAppConfigInput,
  PublisherAppConfigRecord,
  PublisherAppPublicationInput,
  PublisherAppRuntimeConfig,
  PublisherAppStatus,
  PublisherAppPublisherKind,
} from "../types/sdk.types.js";
import { buildPublisherAppRuntimeConfig } from "../lib/publisher-app-runtime-config.js";
import { normalizePublisherAppAdvancedConfiguration } from "../lib/publisher-app-advanced-config.js";
import { derivePublisherAppCounterpointColors } from "../lib/publisher-app-color-identity.js";
import { isPublisherAppRuntimeEnabled, PUBLISHER_APP_STATUSES } from "../lib/publisher-app-status.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  getProfileSetupState,
  isProfileSetupError,
} from "./profile-setup.repository.js";

const adminDb = adminDbFor("mydnamap");

const APP_CONFIGS_COLLECTION = "app_configs";
const APP_CONFIG_IDENTIFIERS_COLLECTION = "app_config_identifiers";
const CUSTOM_APPS_SNAPSHOT_COLLECTION = "custom_apps_snapshot";
const CUSTOM_APPS_SNAPSHOT_DOCUMENT = "simple";
const CUSTOM_APP_ICONS_COLLECTION = "custom_app_icons";
const APP_CONFIG_SCHEMA_VERSION = 1 as const;
const RUNTIME_COLOR_CONTRACT_VERSION = 7;
const RUNTIME_COLOR_CONTRACT_VERSION_FIELD = "runtimeColorContractVersion";
const CUSTOM_APPS_SNAPSHOT_SCHEMA_VERSION = 1 as const;
const APP_TERMS_VERSION = "2026-10-31";
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const APP_PROVIDER_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type PublisherScope = {
  kind: PublisherAppPublisherKind;
  id: string;
  collection: "feed_organizations" | "feed_individuals";
};

type PublisherIdentity = PublisherScope & {
  name: string;
  tint?: string;
  email: string;
  username: string;
  imageUrl: string | null;
  imageUploadDataUrl: string | null;
  description: string;
  descriptionEn: string;
};

const APP_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const DEFAULT_ADMIN_APP_CONFIG_PAGE_SIZE = 20;
const MAX_ADMIN_APP_CONFIG_PAGE_SIZE = 100;
const APP_SNAPSHOT_PUBLISHER_READ_BATCH_SIZE = 50;
const APP_SNAPSHOT_DESCRIPTION_MAX_LENGTH = 280;

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminRepositoryError(
      `Stored publisher app config has an invalid ${label}.`,
      500,
    );
  }

  return value.trim();
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new AdminRepositoryError(
      `Stored publisher app config has an invalid ${label}.`,
      500,
    );
  }

  return value;
}

function timestampToIso(value: unknown, label: string) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  throw new AdminRepositoryError(
    `Stored publisher app config has an invalid ${label}.`,
    500,
  );
}

function normalizeColor(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new AdminRepositoryError(`${label} must be a hex color.`, 400);
  }

  const normalized = value.trim().toUpperCase();
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new AdminRepositoryError(
      `${label} must use the #RRGGBB hex format.`,
      400,
    );
  }

  return normalized;
}

function normalizeColors(colors: PublisherAppConfigColors) {
  const primary = normalizeColor(colors.primary, "Primary color");
  const automatic = derivePublisherAppCounterpointColors(primary);
  return {
    primary,
    secondary: normalizeColor(colors.secondary, "Secondary color"),
    tertiary: normalizeColor(colors.tertiary, "Tertiary color"),
    counterpointClockwise: normalizeColor(colors.counterpointClockwise ?? automatic.counterpointClockwise, "Clockwise counterpoint"),
    counterpointAnticlockwise: normalizeColor(colors.counterpointAnticlockwise ?? automatic.counterpointAnticlockwise, "Anticlockwise counterpoint"),
    counterpointFarClockwise: normalizeColor(colors.counterpointFarClockwise ?? automatic.counterpointFarClockwise, "Far clockwise counterpoint"),
    counterpointFarAnticlockwise: normalizeColor(colors.counterpointFarAnticlockwise ?? automatic.counterpointFarAnticlockwise, "Far anticlockwise counterpoint"),
  };
}

function normalizeInput(
  input: PublisherAppConfigInput,
  identity: PublisherIdentity,
): PublisherAppConfigInput & {
  advancedConfiguration: PublisherAppAdvancedConfiguration;
} {
  if (
    input.platformOption !== "ios" &&
    input.platformOption !== "ios_android"
  ) {
    throw new AdminRepositoryError(
      "Choose a supported app platform option.",
      400,
    );
  }

  for (const [label, value] of [
    ["Connect setting", input.connectEnabled],
    ["Profile setting", input.profileEnabled],
    ["Learn customization setting", input.learnCustomizationEnabled],
  ] as const) {
    if (typeof value !== "boolean") {
      throw new AdminRepositoryError(`${label} must be true or false.`, 400);
    }
  }

  if (!input.colors || typeof input.colors !== "object") {
    throw new AdminRepositoryError("App colors are required.", 400);
  }

  if (input.iconSource !== "publisher" && input.iconSource !== "custom") {
    throw new AdminRepositoryError("Choose a supported app icon source.", 400);
  }

  let iconImageUrl: string | null = null;
  let iconImageUploadDataUrl: string | null = null;
  if (input.iconSource === "publisher") {
    iconImageUrl = identity.imageUrl;
    iconImageUploadDataUrl = identity.imageUploadDataUrl;
  } else {
    const requestedUrl = input.iconImageUrl?.trim() || "";
    const requestedUpload = input.iconImageUploadDataUrl?.trim() || "";
    if (!requestedUrl && !requestedUpload) {
      throw new AdminRepositoryError(
        "Choose a custom app icon or use the publisher icon.",
        400,
      );
    }
    if (requestedUrl) {
      let parsed: URL;
      try {
        parsed = new URL(requestedUrl);
      } catch {
        throw new AdminRepositoryError("App icon URL is invalid.", 400);
      }
      if (parsed.protocol !== "https:") {
        throw new AdminRepositoryError("App icon URL must use HTTPS.", 400);
      }
      iconImageUrl = parsed.toString();
    }
    if (requestedUpload) {
      if (
        requestedUpload.length > 900_000 ||
        !APP_ICON_DATA_URL_PATTERN.test(requestedUpload)
      ) {
        throw new AdminRepositoryError(
          "App icon upload must be a supported PNG, JPG, or WebP image.",
          400,
        );
      }
      iconImageUploadDataUrl = requestedUpload;
    }
  }

  return {
    platformOption: input.platformOption,
    connectEnabled: input.connectEnabled,
    profileEnabled: input.profileEnabled,
    learnCustomizationEnabled: input.learnCustomizationEnabled,
    colors: normalizeColors(input.colors),
    iconSource: input.iconSource,
    iconImageUrl,
    iconImageUploadDataUrl,
    advancedConfiguration: normalizePublisherAppAdvancedConfiguration(
      input.advancedConfiguration,
      identity,
    ),
  };
}

function publisherScope(context: AdminContext): PublisherScope {
  if (context.role === "organization_publisher") {
    const publisherId = context.organizationId?.trim();
    if (!publisherId) {
      throw new AdminRepositoryError(
        "The publisher account is not linked to an organization.",
        403,
      );
    }

    return {
      kind: "organization",
      id: publisherId,
      collection: "feed_organizations",
    };
  }

  if (context.role === "individual_publisher") {
    const publisherId = context.individualId?.trim();
    if (!publisherId) {
      throw new AdminRepositoryError(
        "The publisher account is not linked to an individual publisher.",
        403,
      );
    }

    return {
      kind: "individual",
      id: publisherId,
      collection: "feed_individuals",
    };
  }

  throw new AdminRepositoryError(
    "Publisher portal access is required to manage an app config.",
    403,
  );
}

export function publisherAppConfigDocumentId(context: AdminContext) {
  const scope = publisherScope(context);
  return `${scope.kind}_${scope.id}`;
}

async function publisherIdentity(
  context: AdminContext,
  scope: PublisherScope,
): Promise<PublisherIdentity> {
  const [profile, publisherSnapshot] = await Promise.all([
    getProfileSetupState(context.uid).catch((error: unknown) => {
      if (isProfileSetupError(error)) {
        throw new AdminRepositoryError(error.message, error.statusCode);
      }
      throw error;
    }),
    adminDb.collection(scope.collection).doc(scope.id).get(),
  ]);
  if (!publisherSnapshot.exists) {
    throw new AdminRepositoryError("Publisher record not found.", 404);
  }

  const publisherData = (publisherSnapshot.data() ?? {}) as Record<
    string,
    unknown
  >;
  const name = requiredString(publisherData.name, "publisher name");
  const email = context.email.trim().toLowerCase();
  if (!email) {
    throw new AdminRepositoryError(
      "The publisher account does not have an email address.",
      409,
    );
  }

  const username = profile.defaults.username.trim();
  if (!username) {
    throw new AdminRepositoryError(
      "Complete the publisher profile before configuring an app.",
      409,
    );
  }

  return {
    ...scope,
    name,
    tint:
      typeof publisherData.colorHex === "string"
        ? publisherData.colorHex
        : undefined,
    email,
    username,
    imageUrl:
      typeof publisherData.imageUrl === "string" &&
      publisherData.imageUrl.trim()
        ? publisherData.imageUrl.trim()
        : null,
    imageUploadDataUrl:
      typeof publisherData.imageUploadDataUrl === "string" &&
      publisherData.imageUploadDataUrl.trim()
        ? publisherData.imageUploadDataUrl.trim()
        : null,
    description:
      typeof publisherData.description === "string"
        ? publisherData.description
        : "",
    descriptionEn:
      typeof publisherData.descriptionEn === "string"
        ? publisherData.descriptionEn
        : "",
  };
}

function storedNullableString(value: unknown, label: string) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AdminRepositoryError(
      `Stored publisher app config has an invalid ${label}.`,
      500,
    );
  }
  return value.trim() || null;
}

function storedAppStatus(value: unknown): PublisherAppStatus {
  if (value === undefined || value === null) {
    return "pending_revision";
  }
  if (PUBLISHER_APP_STATUSES.includes(value as PublisherAppStatus)) {
    return value as PublisherAppStatus;
  }
  throw new AdminRepositoryError(
    "Stored publisher app config has an invalid status.",
    500,
  );
}

function storedPositiveInteger(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new AdminRepositoryError(
      `Stored publisher app config has an invalid ${label}.`,
      500,
    );
  }
  return value;
}

function publisherNameWords(value: string) {
  const words = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.slice(0, 32));
  return words.length > 0 ? words.join("_") : "publisher";
}

function appProviderIdentifierFor(config: PublisherAppConfigRecord) {
  const kind = config.publisherKind === "organization" ? "org" : "ind";
  return `app_${kind}_${publisherNameWords(config.publisherName)}_${randomInt(
    10_000,
    100_000,
  )}`;
}

function isCurrentAppProviderIdentifier(
  value: string | undefined,
  kind: PublisherAppPublisherKind,
) {
  const kindPrefix = kind === "organization" ? "org" : "ind";
  return new RegExp(
    `^app_${kindPrefix}_[a-z0-9]+(?:_[a-z0-9]+){0,2}_[0-9]{5}$`,
  ).test(value ?? "");
}

function storedColors(value: unknown): PublisherAppConfigColors {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError(
      "Stored publisher app config has invalid colors.",
      500,
    );
  }

  return normalizeColors(value as PublisherAppConfigColors);
}

export function toPublisherAppConfigRecord(
  snapshot: DocumentSnapshot,
): PublisherAppConfigRecord {
  const data = snapshot.data() as Record<string, unknown> | undefined;
  if (!snapshot.exists || !data) {
    throw new AdminRepositoryError("Publisher app config not found.", 404);
  }

  if (data.schemaVersion !== APP_CONFIG_SCHEMA_VERSION) {
    throw new AdminRepositoryError(
      "Stored publisher app config has an unsupported schema version.",
      500,
    );
  }

  const publisherKind = data.publisherKind;
  if (publisherKind !== "organization" && publisherKind !== "individual") {
    throw new AdminRepositoryError(
      "Stored publisher app config has an invalid publisher kind.",
      500,
    );
  }

  const platformOption = data.platformOption;
  if (platformOption !== "ios" && platformOption !== "ios_android") {
    throw new AdminRepositoryError(
      "Stored publisher app config has an invalid platform option.",
      500,
    );
  }
  const termsAcceptedByUserId =
    typeof data.termsAcceptedByUserId === "string"
      ? data.termsAcceptedByUserId.trim()
      : "";
  const publisherId = requiredString(data.publisherId, "publisher id");
  const publisherName = requiredString(data.publisherName, "publisher name");
  const advancedConfiguration = normalizePublisherAppAdvancedConfiguration(
    data.advancedConfiguration as PublisherAppAdvancedConfiguration | undefined,
    { id: publisherId, kind: publisherKind, name: publisherName },
    500,
  );

  return {
    id: snapshot.id,
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    publisherKind,
    publisherId,
    publisherName,
    publisherEmail: requiredString(data.publisherEmail, "publisher email"),
    publisherUsername: requiredString(
      data.publisherUsername,
      "publisher username",
    ),
    catalogEnabled: advancedConfiguration.catalogEnabled,
    feedEnabled: advancedConfiguration.feedEnabled,
    status: storedAppStatus(data.status),
    ...(typeof data.appProviderIdentifier === "string" &&
    data.appProviderIdentifier.trim()
      ? { appProviderIdentifier: data.appProviderIdentifier.trim() }
      : {}),
    ...(data.runtimeRevision !== undefined
      ? {
          runtimeRevision: storedPositiveInteger(
            data.runtimeRevision,
            "runtime revision",
          ),
        }
      : {}),
    ...(data.activatedAt
      ? {
          activatedAt: timestampToIso(
            data.activatedAt,
            "activatedAt timestamp",
          ),
        }
      : {}),
    ...(typeof data.activatedByUserId === "string" &&
    data.activatedByUserId.trim()
      ? { activatedByUserId: data.activatedByUserId.trim() }
      : {}),
    platformOption,
    connectEnabled: requiredBoolean(data.connectEnabled, "Connect setting"),
    profileEnabled: requiredBoolean(data.profileEnabled, "Profile setting"),
    learnCustomizationEnabled: requiredBoolean(
      data.learnCustomizationEnabled,
      "Learn customization setting",
    ),
    colors: storedColors(data.colors),
    iconSource:
      data.iconSource === "custom" || data.iconSource === "publisher"
        ? data.iconSource
        : "publisher",
    iconImageUrl: storedNullableString(data.iconImageUrl, "icon image URL"),
    iconImageUploadDataUrl: storedNullableString(
      data.iconImageUploadDataUrl,
      "icon image upload",
    ),
    advancedConfiguration,
    createdAt: timestampToIso(data.createdAt, "createdAt timestamp"),
    updatedAt: timestampToIso(data.updatedAt, "updatedAt timestamp"),
    createdByUserId: requiredString(data.createdByUserId, "creator user id"),
    updatedByUserId: requiredString(data.updatedByUserId, "updater user id"),
    ...(typeof data.termsVersion === "string" && data.termsVersion.trim()
      ? { termsVersion: data.termsVersion.trim() }
      : {}),
    ...(data.termsAcceptedAt
      ? {
          termsAcceptedAt: timestampToIso(
            data.termsAcceptedAt,
            "termsAcceptedAt timestamp",
          ),
        }
      : {}),
    ...(termsAcceptedByUserId ? { termsAcceptedByUserId } : {}),
  };
}

function normalizedAdminPageSize(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_ADMIN_APP_CONFIG_PAGE_SIZE;
  }

  return Math.min(
    MAX_ADMIN_APP_CONFIG_PAGE_SIZE,
    Math.max(1, Math.trunc(limit ?? DEFAULT_ADMIN_APP_CONFIG_PAGE_SIZE)),
  );
}

export async function listPublisherAppConfigsPage(options: {
  limit?: number;
  cursor?: string;
}): Promise<{
  apps: PublisherAppConfigRecord[];
  nextCursor: string | null;
}> {
  const pageSize = normalizedAdminPageSize(options.limit);
  const collection = adminDb.collection(APP_CONFIGS_COLLECTION);
  let query = collection.orderBy("updatedAt", "desc");

  if (options.cursor) {
    const cursorSnapshot = await collection.doc(options.cursor).get();
    if (!cursorSnapshot.exists) {
      throw new AdminRepositoryError("App config page cursor not found.", 400);
    }
    query = query.startAfter(cursorSnapshot);
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const pageDocs = snapshot.docs.slice(0, pageSize);
  const lastPageDoc = pageDocs.at(-1);

  return {
    apps: pageDocs.map(toPublisherAppConfigRecord),
    nextCursor:
      snapshot.docs.length > pageSize && lastPageDoc ? lastPageDoc.id : null,
  };
}

function storedNonNegativeInteger(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    throw new AdminRepositoryError(
      `Stored publisher app snapshot has an invalid ${label}.`,
      500,
    );
  }
  return value;
}

function requiredSnapshotString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new AdminRepositoryError(
      `Stored publisher app snapshot has an invalid ${label}.`,
      500,
    );
  }
  return value.trim();
}

function requiredSnapshotStatus(value: unknown): PublisherAppStatus {
  if (
    !PUBLISHER_APP_STATUSES.includes(
      value as (typeof PUBLISHER_APP_STATUSES)[number],
    )
  ) {
    throw new AdminRepositoryError(
      "Stored publisher app snapshot has an invalid app status.",
      500,
    );
  }
  return value as PublisherAppStatus;
}

function toPublisherAppCatalogSnapshotItem(
  value: unknown,
): PublisherAppCatalogSnapshotItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError(
      "Stored publisher app snapshot has an invalid app item.",
      500,
    );
  }
  const data = value as Record<string, unknown>;
  const publisherKind = data.publisherKind;
  if (publisherKind !== "organization" && publisherKind !== "individual") {
    throw new AdminRepositoryError(
      "Stored publisher app snapshot has an invalid publisher kind.",
      500,
    );
  }

  return {
    id: requiredString(data.id, "snapshot app id"),
    appProviderIdentifier: storedNullableString(
      data.appProviderIdentifier,
      "snapshot app provider identifier",
    ),
    name: requiredString(data.name, "snapshot app name"),
    image: storedNullableString(data.image, "snapshot app image"),
    description: requiredSnapshotString(
      data.description,
      "app description",
    ),
    status: requiredSnapshotStatus(data.status),
    isActive: requiredBoolean(data.isActive, "snapshot active flag"),
    publisherKind,
    publisherId: requiredString(data.publisherId, "snapshot publisher id"),
  };
}

function toPublisherAppCatalogSnapshot(
  snapshot: DocumentSnapshot,
): PublisherAppCatalogSnapshot {
  const data = snapshot.data() as Record<string, unknown> | undefined;
  if (!snapshot.exists || !data) {
    throw new AdminRepositoryError("Publisher app snapshot not found.", 404);
  }
  if (
    snapshot.id !== CUSTOM_APPS_SNAPSHOT_DOCUMENT ||
    data.id !== CUSTOM_APPS_SNAPSHOT_DOCUMENT ||
    data.schemaVersion !== CUSTOM_APPS_SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new AdminRepositoryError(
      "Stored publisher app snapshot has an unsupported identity or schema version.",
      500,
    );
  }
  if (!Array.isArray(data.apps) || !Array.isArray(data.statusCounts)) {
    throw new AdminRepositoryError(
      "Stored publisher app snapshot has invalid catalog arrays.",
      500,
    );
  }

  const apps = data.apps.map(toPublisherAppCatalogSnapshotItem);
  const statusCounts = data.statusCounts.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AdminRepositoryError(
        "Stored publisher app snapshot has an invalid status count.",
        500,
      );
    }
    const countData = value as Record<string, unknown>;
    return {
      status: requiredSnapshotStatus(countData.status),
      count: storedNonNegativeInteger(countData.count, "status count"),
    };
  });
  // Additive workflow states may be absent in an older catalog only when no
  // stored app uses that state. Other missing counts still fail validation.
  for (const status of ["active_for_testing", "active_waiting_for_payment", "active_waiting_for_upload"] as const) {
    if (!statusCounts.some(item => item.status === status) && !apps.some(app => app.status === status)) {
      statusCounts.push({ status, count: 0 });
    }
  }
  const totalCount = storedNonNegativeInteger(data.totalCount, "total count");
  const activeCount = storedNonNegativeInteger(
    data.activeCount,
    "active count",
  );
  const inactiveCount = storedNonNegativeInteger(
    data.inactiveCount,
    "inactive count",
  );
  const expectedStatusCounts = new Map(
    PUBLISHER_APP_STATUSES.map((status) => [status, 0]),
  );
  for (const app of apps) {
    expectedStatusCounts.set(
      app.status,
      (expectedStatusCounts.get(app.status) ?? 0) + 1,
    );
  }
  const storedStatusCounts = new Map(
    statusCounts.map(({ status, count }) => [status, count]),
  );
  const expectedActiveCount = apps.filter((app) => app.isActive).length;
  if (
    new Set(apps.map((app) => app.id)).size !== apps.length ||
    apps.some((app) => app.isActive !== isPublisherAppRuntimeEnabled(app.status)) ||
    statusCounts.length !== PUBLISHER_APP_STATUSES.length ||
    storedStatusCounts.size !== PUBLISHER_APP_STATUSES.length ||
    PUBLISHER_APP_STATUSES.some(
      (status) =>
        storedStatusCounts.get(status) !== expectedStatusCounts.get(status),
    ) ||
    totalCount !== apps.length ||
    activeCount !== expectedActiveCount ||
    inactiveCount !== apps.length - expectedActiveCount
  ) {
    throw new AdminRepositoryError(
      "Stored publisher app snapshot statistics do not match its catalog.",
      500,
    );
  }

  return {
    id: CUSTOM_APPS_SNAPSHOT_DOCUMENT,
    schemaVersion: CUSTOM_APPS_SNAPSHOT_SCHEMA_VERSION,
    totalCount,
    activeCount,
    inactiveCount,
    statusCounts: PUBLISHER_APP_STATUSES.map((status) => ({ status, count: storedStatusCounts.get(status)! })),
    apps,
    sourceReadCount: storedNonNegativeInteger(
      data.sourceReadCount,
      "source read count",
    ),
    updatedAt: timestampToIso(data.updatedAt, "snapshot updatedAt timestamp"),
    updatedByUserId: requiredString(
      data.updatedByUserId,
      "snapshot updater user id",
    ),
  };
}

export async function getPublisherAppCatalogSnapshot(): Promise<
  PublisherAppCatalogSnapshot | null
> {
  const snapshot = await adminDb
    .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
    .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT)
    .get();
  return snapshot.exists ? toPublisherAppCatalogSnapshot(snapshot) : null;
}

function compactSnapshotDescription(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, APP_SNAPSHOT_DESCRIPTION_MAX_LENGTH);
}

type PublisherAppSnapshotSource = Pick<
  PublisherAppConfigRecord,
  | "id"
  | "appProviderIdentifier"
  | "publisherName"
  | "advancedConfiguration"
  | "iconImageUrl"
  | "iconImageUploadDataUrl"
  | "status"
  | "publisherKind"
  | "publisherId"
>;

function publisherAppSnapshotItemFromSource(
  config: PublisherAppSnapshotSource,
  publisher: {
    imageUrl?: string | null;
    imageUploadDataUrl?: string | null;
    description?: string;
    descriptionEn?: string;
  } = {},
): PublisherAppCatalogSnapshotItem {
  return {
    id: config.id,
    appProviderIdentifier: config.appProviderIdentifier ?? null,
    name: config.advancedConfiguration?.displayName ?? config.publisherName,
    image:
      config.iconImageUrl ??
      config.iconImageUploadDataUrl ??
      publisher.imageUrl ??
      publisher.imageUploadDataUrl ??
      null,
    description:
      compactSnapshotDescription(publisher.description) ||
      compactSnapshotDescription(publisher.descriptionEn),
    status: config.status,
    isActive: isPublisherAppRuntimeEnabled(config.status),
    publisherKind: config.publisherKind,
    publisherId: config.publisherId,
  };
}

function catalogSnapshotItemsEqual(
  left: PublisherAppCatalogSnapshotItem,
  right: PublisherAppCatalogSnapshotItem,
) {
  return (
    left.id === right.id &&
    left.appProviderIdentifier === right.appProviderIdentifier &&
    left.name === right.name &&
    left.image === right.image &&
    left.description === right.description &&
    left.status === right.status &&
    left.isActive === right.isActive &&
    left.publisherKind === right.publisherKind &&
    left.publisherId === right.publisherId
  );
}

function appConfigChangeAffectsCatalogSnapshot(
  previous: PublisherAppConfigRecord,
  next: PublisherAppCatalogSnapshotItem,
) {
  const previousItem = publisherAppSnapshotItemFromSource(previous, {
    description: next.description,
  });
  return !catalogSnapshotItemsEqual(previousItem, next);
}

// The aggregate catalog stores URLs; each uploaded icon has its own bounded,
// immutable document so image bytes cannot push the catalog over Firestore's limit.
function compactCatalogImages(
  apps: PublisherAppCatalogSnapshotItem[],
  writeIcon: (hash: string, icon: { contentType: string; base64: string }) => void,
) {
  const written = new Set<string>();
  return apps.map((app) => {
    if (!app.image?.startsWith("data:")) return app;
    const match = app.image.match(
      /^data:(image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match || app.image.length > 900_000) {
      throw new AdminRepositoryError("Stored app catalog icon is invalid or too large.", 500);
    }
    const hash = createHash("sha256").update(app.image).digest("hex");
    if (!written.has(hash)) {
      writeIcon(hash, { contentType: match[1]!, base64: match[2]! });
      written.add(hash);
    }
    return {
      ...app,
      image: `https://golden-crow-sdk.vercel.app/publisher-app/icon?hash=${hash}`,
    };
  });
}

export async function getPublisherAppCatalogIcon(hash: string) {
  const snapshot = await adminDb.collection(CUSTOM_APP_ICONS_COLLECTION).doc(hash).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data) {
    throw new AdminRepositoryError("App icon not found.", 404);
  }
  const { contentType, base64 } = data;
  if (
    typeof contentType !== "string" || typeof base64 !== "string" ||
    Object.keys(data).some((key) => key !== "contentType" && key !== "base64") ||
    base64.length > 900_000 ||
    !/^image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(contentType) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
    createHash("sha256").update(`data:${contentType};base64,${base64}`).digest("hex") !== hash
  ) {
    throw new AdminRepositoryError("Stored app icon is invalid.", 500);
  }
  return { contentType, bytes: Buffer.from(base64, "base64") };
}

function catalogSnapshotIncrementalUpdate(
  snapshot: DocumentSnapshot,
  targetId: string,
  nextItem: PublisherAppCatalogSnapshotItem | null,
  updatedByUserId: string,
) {
  if (!snapshot.exists) return null;

  const current = toPublisherAppCatalogSnapshot(snapshot);
  const previousIndex = current.apps.findIndex((app) => app.id === targetId);
  const previousItem =
    previousIndex >= 0 ? current.apps[previousIndex] ?? null : null;
  if (
    !current.apps.some((app) => app.image?.startsWith("data:")) &&
    ((previousItem &&
      nextItem &&
      catalogSnapshotItemsEqual(previousItem, nextItem)) ||
      (!previousItem && !nextItem))
  ) {
    return null;
  }

  const apps = [...current.apps];
  if (previousIndex >= 0) {
    if (nextItem) {
      apps[previousIndex] = nextItem;
    } else {
      apps.splice(previousIndex, 1);
    }
  } else if (nextItem) {
    apps.push(nextItem);
  }
  apps.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );

  const statusCounts = new Map(
    current.statusCounts.map(({ status, count }) => [status, count]),
  );
  if (previousItem) {
    statusCounts.set(
      previousItem.status,
      Math.max(0, (statusCounts.get(previousItem.status) ?? 0) - 1),
    );
  }
  if (nextItem) {
    statusCounts.set(
      nextItem.status,
      (statusCounts.get(nextItem.status) ?? 0) + 1,
    );
  }

  const activeCount =
    current.activeCount - (previousItem?.isActive ? 1 : 0) +
    (nextItem?.isActive ? 1 : 0);
  return {
    id: CUSTOM_APPS_SNAPSHOT_DOCUMENT,
    schemaVersion: CUSTOM_APPS_SNAPSHOT_SCHEMA_VERSION,
    totalCount: apps.length,
    activeCount,
    inactiveCount: apps.length - activeCount,
    statusCounts: PUBLISHER_APP_STATUSES.map((status) => ({
      status,
      count: statusCounts.get(status) ?? 0,
    })),
    apps,
    sourceReadCount: current.sourceReadCount,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId,
  };
}

function updateCatalogSnapshotInTransaction(
  transaction: Transaction,
  snapshot: DocumentSnapshot,
  targetId: string,
  nextItem: PublisherAppCatalogSnapshotItem | null,
  updatedByUserId: string,
) {
  const update = catalogSnapshotIncrementalUpdate(
    snapshot,
    targetId,
    nextItem,
    updatedByUserId,
  );
  if (update) {
    update.apps = compactCatalogImages(update.apps, (hash, icon) => {
      transaction.set(adminDb.collection(CUSTOM_APP_ICONS_COLLECTION).doc(hash), icon);
    });
    transaction.update(snapshot.ref, update);
  }
}

function publisherAppSnapshotItemPreservingDescription(
  config: PublisherAppSnapshotSource,
  snapshot: DocumentSnapshot,
) {
  const existingItem = snapshot.exists
    ? toPublisherAppCatalogSnapshot(snapshot).apps.find(
        (app) => app.id === config.id,
      )
    : undefined;
  return publisherAppSnapshotItemFromSource(config, {
    description: existingItem?.description ?? "",
  });
}

async function publisherAppSnapshotItem(
  config: PublisherAppConfigRecord,
): Promise<PublisherAppCatalogSnapshotItem> {
  const publisherCollection =
    config.publisherKind === "organization"
      ? "feed_organizations"
      : "feed_individuals";
  const publisherSnapshot = await adminDb
    .collection(publisherCollection)
    .doc(config.publisherId)
    .get();
  const publisherData = (publisherSnapshot.data() ?? {}) as Record<
    string,
    unknown
  >;
  const publisherImageUrl = storedNullableString(
    publisherData.imageUrl,
    "publisher image URL",
  );
  const publisherImageUpload = storedNullableString(
    publisherData.imageUploadDataUrl,
    "publisher image upload",
  );

  return publisherAppSnapshotItemFromSource(config, {
    imageUrl: publisherImageUrl,
    imageUploadDataUrl: publisherImageUpload,
    description:
      typeof publisherData.description === "string"
        ? publisherData.description
        : "",
    descriptionEn:
      typeof publisherData.descriptionEn === "string"
        ? publisherData.descriptionEn
        : "",
  });
}

async function loadAllPublisherAppConfigs() {
  const configs: PublisherAppConfigRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await listPublisherAppConfigsPage({
      limit: MAX_ADMIN_APP_CONFIG_PAGE_SIZE,
      cursor,
    });
    configs.push(...page.apps);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return configs;
}

export async function refreshPublisherAppCatalogSnapshot(
  context: AdminContext,
): Promise<PublisherAppCatalogSnapshot> {
  const configs = await loadAllPublisherAppConfigs();
  const apps: PublisherAppCatalogSnapshotItem[] = [];
  for (
    let index = 0;
    index < configs.length;
    index += APP_SNAPSHOT_PUBLISHER_READ_BATCH_SIZE
  ) {
    apps.push(
      ...(await Promise.all(
        configs
          .slice(index, index + APP_SNAPSHOT_PUBLISHER_READ_BATCH_SIZE)
          .map(publisherAppSnapshotItem),
      )),
    );
  }
  apps.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );

  const statusCounts = PUBLISHER_APP_STATUSES.map((status) => ({
    status,
    count: apps.filter((app) => app.status === status).length,
  }));
  const activeCount = apps.filter((app) => app.isActive).length;
  const reference = adminDb
    .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
    .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);
  const icons = new Map<string, { contentType: string; base64: string }>();
  const compactApps = compactCatalogImages(apps, (hash, icon) => icons.set(hash, icon));
  const iconEntries = [...icons.entries()];
  for (let index = 0; index < iconEntries.length; index += APP_SNAPSHOT_PUBLISHER_READ_BATCH_SIZE) {
    await Promise.all(iconEntries.slice(index, index + APP_SNAPSHOT_PUBLISHER_READ_BATCH_SIZE).map(
      ([hash, icon]) => adminDb.collection(CUSTOM_APP_ICONS_COLLECTION).doc(hash).set(icon),
    ));
  }
  await reference.set({
    id: CUSTOM_APPS_SNAPSHOT_DOCUMENT,
    schemaVersion: CUSTOM_APPS_SNAPSHOT_SCHEMA_VERSION,
    totalCount: apps.length,
    activeCount,
    inactiveCount: apps.length - activeCount,
    statusCounts,
    apps: compactApps,
    sourceReadCount: configs.length * 2,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  });

  return toPublisherAppCatalogSnapshot(await reference.get());
}

export async function getPublisherAppConfigById(
  configId: string,
): Promise<PublisherAppConfigRecord> {
  const normalizedId = configId.trim();
  if (!normalizedId) {
    throw new AdminRepositoryError("Publisher app config id is required.", 400);
  }

  const snapshot = await adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(normalizedId)
    .get();
  return toPublisherAppConfigRecord(snapshot);
}

async function adminPublisherIdentity(
  config: PublisherAppConfigRecord,
): Promise<PublisherIdentity> {
  const collection =
    config.publisherKind === "organization"
      ? "feed_organizations"
      : "feed_individuals";
  const publisherSnapshot = await adminDb
    .collection(collection)
    .doc(config.publisherId)
    .get();
  const publisherData = (publisherSnapshot.data() ?? {}) as Record<
    string,
    unknown
  >;
  const currentPublisherIcon = config.iconSource === "publisher";

  return {
    kind: config.publisherKind,
    id: config.publisherId,
    collection,
    name: config.publisherName,
    email: config.publisherEmail,
    username: config.publisherUsername,
    imageUrl:
      typeof publisherData.imageUrl === "string" &&
      publisherData.imageUrl.trim()
        ? publisherData.imageUrl.trim()
        : currentPublisherIcon
          ? config.iconImageUrl
          : null,
    imageUploadDataUrl:
      typeof publisherData.imageUploadDataUrl === "string" &&
      publisherData.imageUploadDataUrl.trim()
        ? publisherData.imageUploadDataUrl.trim()
        : currentPublisherIcon
          ? config.iconImageUploadDataUrl
          : null,
    description:
      typeof publisherData.description === "string"
        ? publisherData.description
        : "",
    descriptionEn:
      typeof publisherData.descriptionEn === "string"
        ? publisherData.descriptionEn
        : "",
  };
}

export async function updatePublisherAppConfigById(
  context: AdminContext,
  configId: string,
  input: PublisherAppConfigAdminUpdateInput,
): Promise<PublisherAppConfigRecord> {
  if (!context.isBootstrap) throw new AdminRepositoryError("GOD MODE access required", 403);
  const ref = adminDb.collection(APP_CONFIGS_COLLECTION).doc(configId.trim());
  const existing = await ref.get();
  const config = toPublisherAppConfigRecord(existing);
  const statusForSave = (current: PublisherAppConfigRecord) => {
    if ((input.expectedStatus !== undefined && input.expectedStatus !== current.status) ||
        (input.status !== config.status && current.status !== config.status)) {
      throw new AdminRepositoryError("The app status changed. Reload before saving.", 409);
    }
    return input.status === config.status ? current.status : input.status;
  };
  statusForSave(config);
  if (input.status === "active_waiting_for_payment" &&
      (config.status !== "active_waiting_for_payment" || !config.termsAcceptedAt || !config.termsAcceptedByUserId || !config.termsVersion)) {
    throw new AdminRepositoryError("Accept the terms through the publication request before waiting for payment.", 409);
  }
  const identity = await adminPublisherIdentity(config);
  const normalizedInput = normalizeInput(
    {
      ...input,
      advancedConfiguration:
        input.advancedConfiguration ??
        (config.advancedConfiguration.displayName === config.publisherName
          ? { ...config.advancedConfiguration, displayName: identity.name }
          : config.advancedConfiguration),
    },
    identity,
  );
  if (isPublisherAppRuntimeEnabled(input.status) && !config.appProviderIdentifier) {
    throw new AdminRepositoryError(
      "Create an app identifier before activating the config.",
      409,
    );
  }
  const nextSnapshotItem = publisherAppSnapshotItemFromSource(
    {
      ...config,
      ...normalizedInput,
      status: input.status,
    },
    identity,
  );
  const snapshotRelevantChange = appConfigChangeAffectsCatalogSnapshot(
    config,
    nextSnapshotItem,
  );
  const update = {
    ...normalizedInput,
    status: input.status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };

  if (snapshotRelevantChange) {
    const snapshotRef = adminDb
      .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
      .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);
    await adminDb.runTransaction(async (transaction) => {
      const currentConfigSnapshot = await transaction.get(ref);
      const currentConfig = toPublisherAppConfigRecord(currentConfigSnapshot);
      const nextStatus = statusForSave(currentConfig);
      const catalogSnapshot = await transaction.get(snapshotRef);
      transaction.update(ref, {
        ...update,
        status: nextStatus,
        ...((isPublisherAppRuntimeEnabled(currentConfig.status) || isPublisherAppRuntimeEnabled(nextStatus))
          ? {
              runtimeRevision: (currentConfig.runtimeRevision ?? 1) + 1,
              [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
            }
          : {}),
      });
      updateCatalogSnapshotInTransaction(
        transaction,
        catalogSnapshot,
        currentConfig.id,
        {
          ...nextSnapshotItem,
          status: nextStatus,
          isActive: isPublisherAppRuntimeEnabled(nextStatus),
          appProviderIdentifier:
            currentConfig.appProviderIdentifier ?? null,
        },
        context.uid,
      );
    });
  } else {
    await adminDb.runTransaction(async transaction => {
      const current = toPublisherAppConfigRecord(await transaction.get(ref));
      const nextStatus = statusForSave(current);
      transaction.update(ref, {
        ...update,
        status: nextStatus,
        ...((isPublisherAppRuntimeEnabled(current.status) || isPublisherAppRuntimeEnabled(nextStatus))
          ? {
              runtimeRevision: (current.runtimeRevision ?? 1) + 1,
              [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
            }
          : {}),
      });
    });
  }

  return toPublisherAppConfigRecord(await ref.get());
}

function isAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = error.code;
  return code === 6 || code === "6" || code === "already-exists";
}

export async function getPublisherAppConfig(
  context: AdminContext,
): Promise<PublisherAppConfigRecord | null> {
  const scope = publisherScope(context);
  const snapshot = await adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`)
    .get();

  return snapshot.exists ? toPublisherAppConfigRecord(snapshot) : null;
}

// Scope the operation to the selected publisher without impersonating an account:
// the authenticated operator remains the identity and audit/terms actor.
function organizationAppContext(
  context: AdminContext,
  organizationId: string,
): AdminContext {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
  const id = organizationId.trim();
  if (!id || id.includes("/") || id.length > 300) {
    throw new AdminRepositoryError("A valid organization id is required.", 400);
  }
  return {
    ...context,
    role: "organization_publisher",
    organizationId: id,
    individualId: undefined,
  };
}

export async function getOrganizationPublisherAppCreationData(
  context: AdminContext,
  organizationId: string,
) {
  const scopedContext = organizationAppContext(context, organizationId);
  const [identity, config] = await Promise.all([
    publisherIdentity(scopedContext, publisherScope(scopedContext)),
    getPublisherAppConfig(scopedContext),
  ]);
  return {
    config,
    publisherKind: identity.kind,
    publisherId: identity.id,
    publisherName: identity.name,
    publisherTint: identity.tint,
    publisherImageUrl:
      identity.imageUrl ?? identity.imageUploadDataUrl ?? undefined,
    publisherEmail: identity.email,
    publisherUsername: identity.username,
  };
}

export async function createOrganizationPublisherAppConfig(
  context: AdminContext,
  organizationId: string,
  input: PublisherAppConfigCreateInput,
) {
  return createPublisherAppConfig(
    organizationAppContext(context, organizationId),
    input,
  );
}

export async function createOrganizationPublisherAppIdentifier(
  context: AdminContext,
  organizationId: string,
) {
  return createPublisherAppIdentifier(
    organizationAppContext(context, organizationId),
  );
}

export async function updateOrganizationPublisherAppConfig(
  context: AdminContext,
  organizationId: string,
  input: PublisherAppConfigInput,
) {
  return updatePublisherAppConfig(organizationAppContext(context, organizationId), input);
}

export async function createPublisherAppConfig(
  context: AdminContext,
  input: PublisherAppConfigCreateInput,
): Promise<PublisherAppConfigRecord> {
  const scope = publisherScope(context);
  const ref = adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`);
  const existing = await ref.get();
  if (existing.exists) {
    throw new AdminRepositoryError(
      "A publisher app config already exists.",
      409,
    );
  }

  const identity = await publisherIdentity(context, scope);
  const normalizedInput = normalizeInput(input, identity);
  const timestamp = FieldValue.serverTimestamp();
  const document = {
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    publisherKind: identity.kind,
    publisherId: identity.id,
    publisherName: identity.name,
    publisherEmail: identity.email,
    publisherUsername: identity.username,
    catalogEnabled: true,
    feedEnabled: true,
    status: "pending_revision",
    ...normalizedInput,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdByUserId: context.uid,
    updatedByUserId: context.uid,
  };
  const snapshotItem = publisherAppSnapshotItemFromSource(
    {
      id: ref.id,
      appProviderIdentifier: undefined,
      publisherName: identity.name,
      advancedConfiguration: normalizedInput.advancedConfiguration,
      iconImageUrl: normalizedInput.iconImageUrl,
      iconImageUploadDataUrl: normalizedInput.iconImageUploadDataUrl,
      status: "pending_revision",
      publisherKind: identity.kind,
      publisherId: identity.id,
    },
    identity,
  );
  const snapshotRef = adminDb
    .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
    .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);

  try {
    await adminDb.runTransaction(async (transaction) => {
      const currentConfig = await transaction.get(ref);
      if (currentConfig.exists) {
        throw new AdminRepositoryError(
          "A publisher app config already exists.",
          409,
        );
      }
      const catalogSnapshot = await transaction.get(snapshotRef);
      transaction.create(ref, document);
      updateCatalogSnapshotInTransaction(
        transaction,
        catalogSnapshot,
        ref.id,
        snapshotItem,
        context.uid,
      );
    });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      throw new AdminRepositoryError(
        "A publisher app config already exists.",
        409,
      );
    }
    throw error;
  }

  return toPublisherAppConfigRecord(await ref.get());
}

export async function updatePublisherAppConfig(
  context: AdminContext,
  input: PublisherAppConfigInput,
): Promise<PublisherAppConfigRecord> {
  const scope = publisherScope(context);
  const ref = adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new AdminRepositoryError("Publisher app config not found.", 404);
  }

  const config = toPublisherAppConfigRecord(existing);
  const identity = await publisherIdentity(context, scope);
  const normalizedInput = normalizeInput(
    {
      ...input,
      advancedConfiguration:
        input.advancedConfiguration ??
        (config.advancedConfiguration.displayName === config.publisherName
          ? { ...config.advancedConfiguration, displayName: identity.name }
          : config.advancedConfiguration),
    },
    identity,
  );
  const nextSnapshotItem = publisherAppSnapshotItemFromSource(
    {
      ...config,
      ...normalizedInput,
      publisherName: identity.name,
    },
    identity,
  );
  const snapshotRelevantChange = appConfigChangeAffectsCatalogSnapshot(
    config,
    nextSnapshotItem,
  );
  const baseUpdate = {
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    publisherKind: identity.kind,
    publisherId: identity.id,
    publisherName: identity.name,
    publisherEmail: identity.email,
    publisherUsername: identity.username,
    catalogEnabled: true,
    feedEnabled: true,
    status: config.status,
    ...normalizedInput,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };

  if (snapshotRelevantChange) {
    const snapshotRef = adminDb
      .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
      .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);
    await adminDb.runTransaction(async (transaction) => {
      const currentConfigSnapshot = await transaction.get(ref);
      const currentConfig = toPublisherAppConfigRecord(currentConfigSnapshot);
      const catalogSnapshot = await transaction.get(snapshotRef);
      transaction.update(ref, {
        ...baseUpdate,
        status: currentConfig.status,
        ...(isPublisherAppRuntimeEnabled(currentConfig.status)
          ? {
              runtimeRevision: (currentConfig.runtimeRevision ?? 1) + 1,
              [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
            }
          : {}),
      });
      updateCatalogSnapshotInTransaction(
        transaction,
        catalogSnapshot,
        currentConfig.id,
        {
          ...nextSnapshotItem,
          appProviderIdentifier:
            currentConfig.appProviderIdentifier ?? null,
          status: currentConfig.status,
          isActive: isPublisherAppRuntimeEnabled(currentConfig.status),
        },
        context.uid,
      );
    });
  } else {
    await adminDb.runTransaction(async (transaction) => {
      const current = toPublisherAppConfigRecord(await transaction.get(ref));
      transaction.update(ref, {
        ...baseUpdate,
        status: current.status,
        ...(isPublisherAppRuntimeEnabled(current.status)
          ? {
              runtimeRevision: (current.runtimeRevision ?? 1) + 1,
              [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
            }
          : {}),
      });
    });
  }

  return toPublisherAppConfigRecord(await ref.get());
}

export async function createPublisherAppIdentifier(
  context: AdminContext,
): Promise<{ config: PublisherAppConfigRecord; createdForTesting: boolean }> {
  const scope = publisherScope(context);
  const ref = adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`);
  const catalogSnapshotRef = adminDb
    .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
    .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);

  const initialSnapshot = await ref.get();
  const initialConfig = toPublisherAppConfigRecord(initialSnapshot);
  if (
    isPublisherAppRuntimeEnabled(initialConfig.status) &&
    isCurrentAppProviderIdentifier(
      initialConfig.appProviderIdentifier,
      initialConfig.publisherKind,
    )
  ) {
    return { config: initialConfig, createdForTesting: false };
  }
  if (
    initialConfig.status !== "pending_revision" &&
    !isPublisherAppRuntimeEnabled(initialConfig.status)
  ) {
    throw new AdminRepositoryError(
      "Only an app pending revision, active for testing, or active can create an identifier.",
      409,
    );
  }

  let activated = false;
  let createdForTesting = false;
  for (let attempt = 0; attempt < 20 && !activated; attempt += 1) {
    const appProviderIdentifier = appProviderIdentifierFor(initialConfig);
    const identifierRef = adminDb
      .collection(APP_CONFIG_IDENTIFIERS_COLLECTION)
      .doc(appProviderIdentifier);

    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const config = toPublisherAppConfigRecord(snapshot);
      if (
        isPublisherAppRuntimeEnabled(config.status) &&
        isCurrentAppProviderIdentifier(
          config.appProviderIdentifier,
          config.publisherKind,
        )
      ) {
        return { activated: true, createdForTesting: false };
      }
      if (config.status !== "pending_revision" && !isPublisherAppRuntimeEnabled(config.status)) {
        throw new AdminRepositoryError(
          "Only an app pending revision, active for testing, or active can create an identifier.",
          409,
        );
      }

      const identifierSnapshot = await transaction.get(identifierRef);
      if (identifierSnapshot.exists) {
        return { activated: false, createdForTesting: false };
      }

      const activationStatus = isPublisherAppRuntimeEnabled(config.status) ? config.status : "active_for_testing";
      const catalogSnapshot = await transaction.get(catalogSnapshotRef);
      const nextSnapshotItem = publisherAppSnapshotItemPreservingDescription(
        {
          ...config,
          appProviderIdentifier,
          status: activationStatus,
        },
        catalogSnapshot,
      );

      const timestamp = FieldValue.serverTimestamp();
      transaction.create(identifierRef, {
        appProviderIdentifier,
        configId: config.id,
        publisherKind: config.publisherKind,
        publisherId: config.publisherId,
        createdAt: timestamp,
        createdByUserId: context.uid,
      });
      transaction.update(ref, {
        appProviderIdentifier,
        runtimeRevision:
          isPublisherAppRuntimeEnabled(config.status) ? (config.runtimeRevision ?? 1) + 1 : 1,
        [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
        status: activationStatus,
        activatedAt: timestamp,
        activatedByUserId: context.uid,
        updatedAt: timestamp,
        updatedByUserId: context.uid,
      });
      updateCatalogSnapshotInTransaction(
        transaction,
        catalogSnapshot,
        config.id,
        nextSnapshotItem,
        context.uid,
      );
      return { activated: true, createdForTesting: config.status === "pending_revision" };
    });
    activated = result.activated;
    createdForTesting = result.createdForTesting;
  }

  if (!activated) {
    throw new AdminRepositoryError(
      "Could not reserve a unique app identifier. Try again.",
      409,
    );
  }

  return { config: toPublisherAppConfigRecord(await ref.get()), createdForTesting };
}

async function requestAppPublication(
  context: AdminContext,
  configId: string,
  input: PublisherAppPublicationInput,
): Promise<{ config: PublisherAppConfigRecord; submitted: boolean }> {
  if (input.termsAccepted !== true) {
    throw new AdminRepositoryError("Accept the publisher app terms before requesting publication.", 400);
  }
  const ref = adminDb.collection(APP_CONFIGS_COLLECTION).doc(configId);
  const snapshotRef = adminDb.collection(CUSTOM_APPS_SNAPSHOT_COLLECTION).doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);
  const submitted = await adminDb.runTransaction(async transaction => {
    const config = toPublisherAppConfigRecord(await transaction.get(ref));
    if (config.status === "active_waiting_for_payment" && config.termsVersion === APP_TERMS_VERSION && config.termsAcceptedAt && config.termsAcceptedByUserId) {
      return false;
    }
    if (config.status !== "active_for_testing" || !isCurrentAppProviderIdentifier(config.appProviderIdentifier, config.publisherKind)) {
      throw new AdminRepositoryError("Only an app active for testing can request publication.", 409);
    }
    if (input.expectedUpdatedAt !== config.updatedAt) {
      throw new AdminRepositoryError("The app changed. Reload and review its configuration before accepting the terms.", 409);
    }
    const catalogSnapshot = await transaction.get(snapshotRef);
    const timestamp = FieldValue.serverTimestamp();
    transaction.update(ref, {
      status: "active_waiting_for_payment",
      termsVersion: APP_TERMS_VERSION,
      termsAcceptedAt: timestamp,
      termsAcceptedByUserId: context.uid,
      runtimeRevision: (config.runtimeRevision ?? 1) + 1,
      [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
      updatedAt: timestamp,
      updatedByUserId: context.uid,
    });
    updateCatalogSnapshotInTransaction(transaction, catalogSnapshot, config.id,
      publisherAppSnapshotItemPreservingDescription({ ...config, status: "active_waiting_for_payment" }, catalogSnapshot), context.uid);
    return true;
  });
  return { config: toPublisherAppConfigRecord(await ref.get()), submitted };
}

export async function requestPublisherAppPublication(context: AdminContext, input: PublisherAppPublicationInput) {
  return requestAppPublication(context, publisherAppConfigDocumentId(context), input);
}

export async function requestPublisherAppPublicationById(context: AdminContext, configId: string, input: PublisherAppPublicationInput) {
  if (!context.isBootstrap) throw new AdminRepositoryError("GOD MODE access required", 403);
  return requestAppPublication(context, configId.trim(), input);
}

export async function deactivatePublisherAppIdentifier(
  context: AdminContext,
): Promise<PublisherAppConfigRecord> {
  if (!context.isBootstrap) throw new AdminRepositoryError("GOD MODE access required", 403);
  const scope = publisherScope(context);
  const ref = adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`);
  const catalogSnapshotRef = adminDb
    .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
    .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const config = toPublisherAppConfigRecord(snapshot);
    if (!isPublisherAppRuntimeEnabled(config.status) || !config.appProviderIdentifier) {
      throw new AdminRepositoryError(
        "Only a runtime-enabled app can deactivate its identifier.",
        409,
      );
    }

    const catalogSnapshot = await transaction.get(catalogSnapshotRef);
    const nextSnapshotItem = publisherAppSnapshotItemPreservingDescription(
      {
        ...config,
        appProviderIdentifier: undefined,
        status: "pending_revision",
      },
      catalogSnapshot,
    );

    transaction.update(ref, {
      appProviderIdentifier: FieldValue.delete(),
      runtimeRevision: FieldValue.delete(),
      activatedAt: FieldValue.delete(),
      activatedByUserId: FieldValue.delete(),
      status: "pending_revision",
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: context.uid,
    });
    updateCatalogSnapshotInTransaction(
      transaction,
      catalogSnapshot,
      config.id,
      nextSnapshotItem,
      context.uid,
    );
  });

  return toPublisherAppConfigRecord(await ref.get());
}

// Existing published apps must not serve changed bytes under an old revision.
// Publish each color-contract update once, atomically, before returning it.
async function publishRuntimeColorContract(snapshot: DocumentSnapshot) {
  const config = toPublisherAppConfigRecord(snapshot);
  if (
    !isPublisherAppRuntimeEnabled(config.status) ||
    snapshot.data()?.[RUNTIME_COLOR_CONTRACT_VERSION_FIELD] === RUNTIME_COLOR_CONTRACT_VERSION
  ) {
    return config;
  }
  return adminDb.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(snapshot.ref);
    const current = toPublisherAppConfigRecord(currentSnapshot);
    if (
      !isPublisherAppRuntimeEnabled(current.status) ||
      currentSnapshot.data()?.[RUNTIME_COLOR_CONTRACT_VERSION_FIELD] === RUNTIME_COLOR_CONTRACT_VERSION
    ) {
      return current;
    }
    const runtimeRevision = (current.runtimeRevision ?? 1) + 1;
    transaction.update(snapshot.ref, {
      runtimeRevision,
      [RUNTIME_COLOR_CONTRACT_VERSION_FIELD]: RUNTIME_COLOR_CONTRACT_VERSION,
    });
    return { ...current, runtimeRevision };
  });
}

export async function getPublisherAppRuntimeConfig(
  context: AdminContext,
): Promise<PublisherAppRuntimeConfig> {
  const scope = publisherScope(context);
  const snapshot = await adminDb.collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`).get();
  return buildPublisherAppRuntimeConfig(await publishRuntimeColorContract(snapshot));
}

export async function getPublisherAppRuntimeConfigById(
  configId: string,
): Promise<PublisherAppRuntimeConfig> {
  const normalizedId = configId.trim();
  if (!normalizedId) {
    throw new AdminRepositoryError("Publisher app config id is required.", 400);
  }
  const snapshot = await adminDb.collection(APP_CONFIGS_COLLECTION).doc(normalizedId).get();
  return buildPublisherAppRuntimeConfig(await publishRuntimeColorContract(snapshot));
}

export async function getActivePublisherAppRuntimeConfig(
  appProviderIdentifier: string,
  platform: "ios" | "android",
): Promise<PublisherAppRuntimeConfig> {
  const normalizedIdentifier = appProviderIdentifier.trim();
  if (!APP_PROVIDER_IDENTIFIER_PATTERN.test(normalizedIdentifier)) {
    throw new AdminRepositoryError("Invalid app provider identifier.", 400);
  }

  const snapshot = await adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .where("appProviderIdentifier", "==", normalizedIdentifier)
    .limit(2)
    .get();
  if (snapshot.empty) {
    throw new AdminRepositoryError("App runtime config not found.", 404);
  }
  if (snapshot.docs.length > 1) {
    throw new AdminRepositoryError(
      "App provider identifier is not unique.",
      409,
    );
  }

  const configSnapshot = snapshot.docs[0];
  if (!configSnapshot) {
    throw new AdminRepositoryError("App runtime config not found.", 404);
  }
  const config = toPublisherAppConfigRecord(configSnapshot);
  if (!isPublisherAppRuntimeEnabled(config.status)) {
    throw new AdminRepositoryError("App runtime config not found.", 404);
  }
  if (platform === "android" && config.platformOption !== "ios_android") {
    throw new AdminRepositoryError(
      "This app config is not compatible with Android.",
      409,
    );
  }

  const published = await publishRuntimeColorContract(configSnapshot);
  if (!isPublisherAppRuntimeEnabled(published.status) || published.appProviderIdentifier !== normalizedIdentifier) {
    throw new AdminRepositoryError("App runtime config not found.", 404);
  }
  if (platform === "android" && published.platformOption !== "ios_android") {
    throw new AdminRepositoryError("This app config is not compatible with Android.", 409);
  }
  return buildPublisherAppRuntimeConfig(published);
}

export async function deletePublisherAppConfig(
  context: AdminContext,
): Promise<{ id: string }> {
  const scope = publisherScope(context);
  const ref = adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`);
  const catalogSnapshotRef = adminDb
    .collection(CUSTOM_APPS_SNAPSHOT_COLLECTION)
    .doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);

  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) {
      throw new AdminRepositoryError("Publisher app config not found.", 404);
    }

    const config = toPublisherAppConfigRecord(existing);
    if (config.status !== "pending_revision") {
      throw new AdminRepositoryError(
        "Only app configs pending revision can be deleted.",
        409,
      );
    }

    const catalogSnapshot = await transaction.get(catalogSnapshotRef);
    transaction.delete(ref);
    updateCatalogSnapshotInTransaction(
      transaction,
      catalogSnapshot,
      config.id,
      null,
      context.uid,
    );
    return { id: config.id };
  });
}

export async function deletePublisherAppConfigById(
  context: AdminContext,
  configId: string,
  expectedUpdatedAt: string,
): Promise<{ id: string }> {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
  const id = configId.trim();
  if (!id || id.length > 300 || id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)) {
    throw new AdminRepositoryError("A valid app config id is required.", 400);
  }
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new AdminRepositoryError("A valid expected update time is required.", 400);
  }
  const ref = adminDb.collection(APP_CONFIGS_COLLECTION).doc(id);
  const catalogRef = adminDb.collection(CUSTOM_APPS_SNAPSHOT_COLLECTION).doc(CUSTOM_APPS_SNAPSHOT_DOCUMENT);

  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists && timestampToIso(existing.data()?.updatedAt, "update time") !== new Date(expectedUpdatedAt).toISOString()) {
      throw new AdminRepositoryError("The app changed. Reload the list before deleting it.", 409);
    }
    const catalog = await transaction.get(catalogRef);
    if (existing.exists) transaction.delete(ref);
    updateCatalogSnapshotInTransaction(transaction, catalog, id, null, context.uid);
    // Identifier reservations remain permanent, including after deletion.
    return { id };
  });
}
