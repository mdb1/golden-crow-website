import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import type {
  AdminContext,
  PublisherAppConfigColors,
  PublisherAppConfigInput,
  PublisherAppConfigRecord,
  PublisherAppStatus,
  PublisherAppPublisherKind,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  getProfileSetupState,
  isProfileSetupError,
} from "./profile-setup.repository.js";

const adminDb = adminDbFor("mydnamap");

const APP_CONFIGS_COLLECTION = "app_configs";
const APP_CONFIG_SCHEMA_VERSION = 1 as const;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

type PublisherScope = {
  kind: PublisherAppPublisherKind;
  id: string;
  collection: "feed_organizations" | "feed_individuals";
};

type PublisherIdentity = PublisherScope & {
  name: string;
  email: string;
  username: string;
  imageUrl: string | null;
  imageUploadDataUrl: string | null;
};

const APP_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

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
  return {
    primary: normalizeColor(colors.primary, "Primary color"),
    secondary: normalizeColor(colors.secondary, "Secondary color"),
    tertiary: normalizeColor(colors.tertiary, "Tertiary color"),
  };
}

function normalizeInput(
  input: PublisherAppConfigInput,
  identity: PublisherIdentity,
): PublisherAppConfigInput {
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
  if (
    value === "pending_revision" ||
    value === "approved" ||
    value === "changes_requested" ||
    value === "rejected"
  ) {
    return value;
  }
  throw new AdminRepositoryError(
    "Stored publisher app config has an invalid status.",
    500,
  );
}

function storedColors(value: unknown): PublisherAppConfigColors {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError(
      "Stored publisher app config has invalid colors.",
      500,
    );
  }

  const colors = value as Record<string, unknown>;
  return {
    primary: normalizeColor(colors.primary, "Primary color"),
    secondary: normalizeColor(colors.secondary, "Secondary color"),
    tertiary: normalizeColor(colors.tertiary, "Tertiary color"),
  };
}

function toPublisherAppConfigRecord(
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

  return {
    id: snapshot.id,
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    publisherKind,
    publisherId: requiredString(data.publisherId, "publisher id"),
    publisherName: requiredString(data.publisherName, "publisher name"),
    publisherEmail: requiredString(data.publisherEmail, "publisher email"),
    publisherUsername: requiredString(
      data.publisherUsername,
      "publisher username",
    ),
    catalogEnabled: true,
    feedEnabled: true,
    status: storedAppStatus(data.status),
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
    createdAt: timestampToIso(data.createdAt, "createdAt timestamp"),
    updatedAt: timestampToIso(data.updatedAt, "updatedAt timestamp"),
    createdByUserId: requiredString(data.createdByUserId, "creator user id"),
    updatedByUserId: requiredString(data.updatedByUserId, "updater user id"),
  };
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

export async function createPublisherAppConfig(
  context: AdminContext,
  input: PublisherAppConfigInput,
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

  try {
    await ref.create(document);
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

  const identity = await publisherIdentity(context, scope);
  const normalizedInput = normalizeInput(input, identity);
  const existingData = (existing.data() ?? {}) as Record<string, unknown>;
  await ref.update({
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    publisherKind: identity.kind,
    publisherId: identity.id,
    publisherName: identity.name,
    publisherEmail: identity.email,
    publisherUsername: identity.username,
    catalogEnabled: true,
    feedEnabled: true,
    status: storedAppStatus(existingData.status),
    ...normalizedInput,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  });

  return toPublisherAppConfigRecord(await ref.get());
}

export async function deletePublisherAppConfig(
  context: AdminContext,
): Promise<{ id: string }> {
  const scope = publisherScope(context);
  const ref = adminDb
    .collection(APP_CONFIGS_COLLECTION)
    .doc(`${scope.kind}_${scope.id}`);

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

    transaction.delete(ref);
    return { id: config.id };
  });
}
