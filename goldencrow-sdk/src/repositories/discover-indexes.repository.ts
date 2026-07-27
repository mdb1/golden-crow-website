import {
  adminAccessTokenFor,
  adminProjectIdFor,
} from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";
import type {
  AdminContext,
  DiscoverFeedIndexEnsureResult,
  DiscoverFeedIndexField,
  DiscoverFeedIndexState,
  DiscoverFeedIndexStatus,
} from "../types/sdk.types.js";

type FirestoreIndex = {
  name?: string;
  queryScope?: string;
  fields?: Array<{
    fieldPath?: string;
    order?: string;
    arrayConfig?: string;
  }>;
  state?: string;
};

type FirestoreIndexListResponse = {
  indexes?: FirestoreIndex[];
  nextPageToken?: string;
};

type FirestoreOperationResponse = {
  name?: string;
};

type GoogleErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
};

const DATABASE_ID = "(default)";
const COLLECTION_GROUP = "feed_items";
const FIRESTORE_ADMIN_BASE_URL = "https://firestore.googleapis.com/v1";

const REQUIRED_DISCOVER_FEED_INDEXES: Array<{
  id: string;
  fields: DiscoverFeedIndexField[];
}> = [
  {
    id: "published-feed",
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "publishedAt", order: "DESCENDING" },
    ],
  },
  {
    id: "typed-published-feed",
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "type", order: "ASCENDING" },
      { fieldPath: "publishedAt", order: "DESCENDING" },
    ],
  },
];

function requireMydnamapFullAdmin(context: AdminContext) {
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError("Full admin access required.", 403);
  }

  if (!context.projectAccess.includes("mydnamap")) {
    throw new AdminRepositoryError("MyDNAMap project access required.", 403);
  }
}

function collectionGroupIndexesUrl(projectId: string) {
  return `${FIRESTORE_ADMIN_BASE_URL}/projects/${encodeURIComponent(
    projectId,
  )}/databases/${DATABASE_ID}/collectionGroups/${COLLECTION_GROUP}/indexes`;
}

function normalizeIndexState(state: string | undefined): DiscoverFeedIndexState {
  if (state === "READY" || state === "CREATING" || state === "NEEDS_REPAIR") {
    return state;
  }

  return "UNKNOWN";
}

function comparableFields(index: FirestoreIndex): DiscoverFeedIndexField[] {
  return (index.fields ?? [])
    .filter((field) => field.fieldPath && field.fieldPath !== "__name__")
    .filter(
      (field): field is { fieldPath: string; order: "ASCENDING" | "DESCENDING" } =>
        field.order === "ASCENDING" || field.order === "DESCENDING",
    )
    .map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order,
    }));
}

function fieldsMatch(
  actual: DiscoverFeedIndexField[],
  expected: DiscoverFeedIndexField[],
) {
  if (actual.length !== expected.length) {
    return false;
  }

  return expected.every(
    (field, index) =>
      actual[index]?.fieldPath === field.fieldPath &&
      actual[index]?.order === field.order,
  );
}

function findMatchingIndex(
  indexes: FirestoreIndex[],
  expected: DiscoverFeedIndexField[],
) {
  return indexes.find(
    (index) =>
      index.queryScope === "COLLECTION" &&
      fieldsMatch(comparableFields(index), expected),
  );
}

function statusFromIndex({
  id,
  fields,
  index,
  action,
  operationName,
}: {
  id: string;
  fields: DiscoverFeedIndexField[];
  index: FirestoreIndex;
  action: "existing" | "created";
  operationName?: string;
}): DiscoverFeedIndexStatus {
  return {
    id,
    collectionGroup: COLLECTION_GROUP,
    queryScope: "COLLECTION",
    fields,
    state: normalizeIndexState(index.state),
    action,
    name: index.name,
    operationName,
  };
}

function failedStatus(
  id: string,
  fields: DiscoverFeedIndexField[],
  error: unknown,
): DiscoverFeedIndexStatus {
  return {
    id,
    collectionGroup: COLLECTION_GROUP,
    queryScope: "COLLECTION",
    fields,
    state: "MISSING",
    action: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
}

async function googleErrorMessage(response: Response) {
  const rawText = await response.text();
  let parsed: GoogleErrorResponse | undefined;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as GoogleErrorResponse;
    } catch {
      parsed = undefined;
    }
  }

  const googleMessage = parsed?.error?.message?.trim();
  const googleStatus = parsed?.error?.status?.trim();
  const details = parsed?.error?.details
    ? JSON.stringify(parsed.error.details).slice(0, 1200)
    : undefined;

  return [
    `Firestore Admin API returned ${response.status} ${response.statusText}`.trim(),
    googleStatus ? `status=${googleStatus}` : null,
    googleMessage ?? (rawText.trim() || null),
    details ? `details=${details}` : null,
  ]
    .filter(Boolean)
    .join(": ");
}

async function fetchFirestoreAdmin<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function listFirestoreIndexes(projectId: string, accessToken: string) {
  const indexes: FirestoreIndex[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(collectionGroupIndexesUrl(projectId));
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const page = await fetchFirestoreAdmin<FirestoreIndexListResponse>(
      accessToken,
      url.toString(),
    );
    indexes.push(...(page.indexes ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return indexes;
}

async function createFirestoreIndex(
  projectId: string,
  accessToken: string,
  fields: DiscoverFeedIndexField[],
) {
  try {
    return await fetchFirestoreAdmin<FirestoreOperationResponse>(
      accessToken,
      collectionGroupIndexesUrl(projectId),
      {
        method: "POST",
        body: JSON.stringify({
          queryScope: "COLLECTION",
          fields,
        }),
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("409") || error.message.includes("ALREADY_EXISTS"))
    ) {
      return {};
    }

    throw error;
  }
}

function resultMessage(statuses: DiscoverFeedIndexStatus[], created: number) {
  const failed = statuses.filter((status) => status.action === "failed");
  if (failed.length > 0) {
    return "Discover feed indexes could not be created. Check the error details and the MyDNAMap service account permissions.";
  }

  const ready = statuses.every((status) => status.state === "READY");
  if (ready) {
    return created > 0
      ? "Discover feed indexes were created and are ready."
      : "Discover feed indexes are ready.";
  }

  if (created > 0) {
    return "Missing Discover feed indexes were created. Firestore is still building them; retry after the index state becomes READY.";
  }

  return "Discover feed indexes exist, but Firestore has not marked every index READY yet.";
}

export async function ensureDiscoverFeedIndexes(
  context: AdminContext,
): Promise<DiscoverFeedIndexEnsureResult> {
  requireMydnamapFullAdmin(context);

  const projectId = adminProjectIdFor("mydnamap");
  const accessToken = await adminAccessTokenFor("mydnamap");
  let indexes: FirestoreIndex[];

  try {
    indexes = await listFirestoreIndexes(projectId, accessToken);
  } catch (error) {
    throw new AdminRepositoryError(
      `Unable to inspect Discover Firestore indexes for project '${projectId}': ${
        error instanceof Error ? error.message : String(error)
      }`,
      502,
    );
  }

  const statuses: DiscoverFeedIndexStatus[] = [];
  let created = 0;

  for (const required of REQUIRED_DISCOVER_FEED_INDEXES) {
    const existing = findMatchingIndex(indexes, required.fields);
    if (existing) {
      statuses.push(
        statusFromIndex({
          id: required.id,
          fields: required.fields,
          index: existing,
          action: "existing",
        }),
      );
      continue;
    }

    try {
      const operation = await createFirestoreIndex(
        projectId,
        accessToken,
        required.fields,
      );
      created += 1;
      indexes = await listFirestoreIndexes(projectId, accessToken);
      const createdIndex = findMatchingIndex(indexes, required.fields);
      statuses.push(
        createdIndex
          ? statusFromIndex({
              id: required.id,
              fields: required.fields,
              index: createdIndex,
              action: "created",
              operationName: operation.name,
            })
          : {
              id: required.id,
              collectionGroup: COLLECTION_GROUP,
              queryScope: "COLLECTION",
              fields: required.fields,
              state: "CREATING",
              action: "created",
              operationName: operation.name,
            },
      );
    } catch (error) {
      statuses.push(failedStatus(required.id, required.fields, error));
    }
  }

  return {
    projectId,
    databaseId: DATABASE_ID,
    ready: statuses.every((status) => status.state === "READY"),
    created,
    indexes: statuses,
    message: resultMessage(statuses, created),
  };
}
