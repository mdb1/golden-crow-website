import {
  DocumentReference,
  GeoPoint,
  Query,
  Timestamp,
} from "firebase-admin/firestore";
import { adminDb } from "../config/firebase.js";
import type {
  ModerationCollectionKey,
  ModerationDocumentRecord,
  ModerationSubcollectionKey,
} from "../types/sdk.types.js";

type CollectionConfig = {
  path: ModerationCollectionKey;
  orderByField?: string;
  subcollections?: Partial<Record<ModerationSubcollectionKey, { orderByField?: string }>>;
};

const COLLECTION_CONFIG: Record<ModerationCollectionKey, CollectionConfig> = {
  profiles: {
    path: "profiles",
    orderByField: "updatedAt",
  },
  public_profiles: {
    path: "public_profiles",
    orderByField: "updatedAt",
  },
  community_users: {
    path: "community_users",
    orderByField: "updatedAt",
    subcollections: {
      events: { orderByField: "createdAt" },
    },
  },
  community_posts: {
    path: "community_posts",
    orderByField: "createdAt",
    subcollections: {
      comments: { orderByField: "createdAt" },
    },
  },
  report_codes: {
    path: "report_codes",
  },
  uploaded_reports: {
    path: "uploaded_reports",
    orderByField: "date_modified",
  },
  report_owners: {
    path: "report_owners",
    orderByField: "updatedAt",
  },
  user_progress: {
    path: "user_progress",
  },
};

const LEGACY_COMMUNITY_COMMENTS_COLLECTION = "community_comments";

function getCollectionConfig(collectionKey: ModerationCollectionKey): CollectionConfig {
  return COLLECTION_CONFIG[collectionKey];
}

function isCommunityCommentSubcollection(
  collectionKey: ModerationCollectionKey,
  subcollectionKey: ModerationSubcollectionKey
) {
  return collectionKey === "community_posts" && subcollectionKey === "comments";
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof GeoPoint) {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof DocumentReference) {
    return {
      path: value.path,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeValue(entry),
      ])
    );
  }

  return value;
}

function toRecord(
  collection: string,
  documentPath: string,
  docId: string,
  data: Record<string, unknown>
): ModerationDocumentRecord {
  return {
    id: docId,
    path: documentPath,
    collection,
    data: serializeValue(data) as Record<string, unknown>,
  };
}

function getRecordTimestamp(record: ModerationDocumentRecord) {
  const createdAt = record.data.createdAt;

  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

async function listCommunityCommentRecords(documentId: string, limit: number) {
  const nestedRef = adminDb
    .collection("community_posts")
    .doc(documentId)
    .collection("comments");
  const legacyRef = adminDb.collection(LEGACY_COMMUNITY_COMMENTS_COLLECTION);

  const [nestedSnapshot, legacySnapshot] = await Promise.all([
    executeListQuery(
      () => nestedRef.orderBy("createdAt", "desc").limit(limit),
      () => nestedRef.limit(limit)
    ),
    legacyRef.where("postId", "==", documentId).limit(limit).get(),
  ]);

  const records = new Map<string, ModerationDocumentRecord>();

  nestedSnapshot.docs.forEach((doc) => {
    records.set(
      doc.id,
      toRecord(
        "comments",
        `community_posts/${documentId}/comments/${doc.id}`,
        doc.id,
        doc.data()
      )
    );
  });

  legacySnapshot.docs.forEach((doc) => {
    if (records.has(doc.id)) {
      return;
    }

    records.set(
      doc.id,
      toRecord("comments", `${LEGACY_COMMUNITY_COMMENTS_COLLECTION}/${doc.id}`, doc.id, doc.data())
    );
  });

  return Array.from(records.values())
    .sort((left, right) => getRecordTimestamp(right) - getRecordTimestamp(left))
    .slice(0, limit);
}

async function getCommunityCommentSnapshot(documentId: string, subdocumentId: string) {
  const nestedRef = adminDb
    .collection("community_posts")
    .doc(documentId)
    .collection("comments")
    .doc(subdocumentId);
  const legacyRef = adminDb.collection(LEGACY_COMMUNITY_COMMENTS_COLLECTION).doc(subdocumentId);

  const [nestedSnapshot, legacySnapshot] = await Promise.all([
    nestedRef.get(),
    legacyRef.get(),
  ]);

  const hasLegacyMatch =
    legacySnapshot.exists && legacySnapshot.data()?.postId === documentId;

  return {
    nestedRef,
    nestedSnapshot,
    legacyRef,
    legacySnapshot: hasLegacyMatch ? legacySnapshot : null,
  };
}

async function executeListQuery(
  queryFactory: () => Query,
  fallbackFactory: () => Query
) {
  try {
    const orderedSnapshot = await queryFactory().get();
    if (!orderedSnapshot.empty) {
      return orderedSnapshot;
    }

    return fallbackFactory().get();
  } catch (error) {
    console.warn("[moderation] Falling back to unordered query.", error);
    return fallbackFactory().get();
  }
}

function coerceValueLikeExisting(nextValue: unknown, existingValue: unknown): unknown {
  if (existingValue instanceof Timestamp || existingValue instanceof Date) {
    if (typeof nextValue === "string" || typeof nextValue === "number") {
      const parsed = new Date(nextValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return nextValue;
  }

  if (existingValue instanceof GeoPoint) {
    if (
      nextValue &&
      typeof nextValue === "object" &&
      "latitude" in nextValue &&
      "longitude" in nextValue
    ) {
      const { latitude, longitude } = nextValue as {
        latitude: number;
        longitude: number;
      };
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return new GeoPoint(latitude, longitude);
      }
    }
    return nextValue;
  }

  if (existingValue instanceof DocumentReference && typeof nextValue === "string") {
    return adminDb.doc(nextValue);
  }

  if (Array.isArray(existingValue) && Array.isArray(nextValue)) {
    return nextValue.map((item, index) =>
      coerceValueLikeExisting(item, existingValue[index])
    );
  }

  if (
    existingValue &&
    typeof existingValue === "object" &&
    nextValue &&
    typeof nextValue === "object" &&
    !Array.isArray(existingValue) &&
    !Array.isArray(nextValue)
  ) {
    const nextObject = nextValue as Record<string, unknown>;
    const existingObject = existingValue as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(nextObject).map(([key, entry]) => [
        key,
        coerceValueLikeExisting(entry, existingObject[key]),
      ])
    );
  }

  return nextValue;
}

async function deleteConfiguredSubcollections(ref: DocumentReference, collectionKey: ModerationCollectionKey) {
  const config = getCollectionConfig(collectionKey);
  const subcollections = Object.keys(config.subcollections ?? {}) as ModerationSubcollectionKey[];

  await Promise.all(
    subcollections.map(async (subcollectionKey) => {
      const snapshot = await ref.collection(subcollectionKey).get();
      if (snapshot.empty) {
        return;
      }

      const batch = adminDb.batch();
      snapshot.docs.slice(0, 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    })
  );
}

export async function listModerationDocuments(
  collectionKey: ModerationCollectionKey,
  limit = 100
): Promise<ModerationDocumentRecord[]> {
  const config = getCollectionConfig(collectionKey);
  const collectionRef = adminDb.collection(config.path);

  const snapshot = await executeListQuery(
    () =>
      config.orderByField
        ? collectionRef.orderBy(config.orderByField, "desc").limit(limit)
        : collectionRef.limit(limit),
    () => collectionRef.limit(limit)
  );

  return snapshot.docs.map((doc) =>
    toRecord(config.path, `${config.path}/${doc.id}`, doc.id, doc.data())
  );
}

export async function getModerationDocument(
  collectionKey: ModerationCollectionKey,
  documentId: string
): Promise<ModerationDocumentRecord | null> {
  const config = getCollectionConfig(collectionKey);
  const snapshot = await adminDb.collection(config.path).doc(documentId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toRecord(
    config.path,
    `${config.path}/${snapshot.id}`,
    snapshot.id,
    snapshot.data() ?? {}
  );
}

export async function updateModerationDocument(
  collectionKey: ModerationCollectionKey,
  documentId: string,
  data: Record<string, unknown>
): Promise<ModerationDocumentRecord | null> {
  const config = getCollectionConfig(collectionKey);
  const ref = adminDb.collection(config.path).doc(documentId);
  const existing = await ref.get();
  if (!existing.exists) {
    return null;
  }

  const payload = coerceValueLikeExisting(data, existing.data() ?? {}) as Record<
    string,
    unknown
  >;

  await ref.set(payload, { merge: false });
  return getModerationDocument(collectionKey, documentId);
}

export async function deleteModerationDocument(
  collectionKey: ModerationCollectionKey,
  documentId: string
): Promise<boolean> {
  const config = getCollectionConfig(collectionKey);
  const ref = adminDb.collection(config.path).doc(documentId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  await deleteConfiguredSubcollections(ref, collectionKey);
  await ref.delete();
  return true;
}

export async function listModerationSubdocuments(
  collectionKey: ModerationCollectionKey,
  documentId: string,
  subcollectionKey: ModerationSubcollectionKey,
  limit = 100
): Promise<ModerationDocumentRecord[]> {
  if (isCommunityCommentSubcollection(collectionKey, subcollectionKey)) {
    return listCommunityCommentRecords(documentId, limit);
  }

  const config = getCollectionConfig(collectionKey);
  const subcollectionConfig = config.subcollections?.[subcollectionKey];

  if (!subcollectionConfig) {
    throw new Error(
      `Subcollection ${subcollectionKey} is not supported for ${collectionKey}`
    );
  }

  const subcollectionRef = adminDb
    .collection(config.path)
    .doc(documentId)
    .collection(subcollectionKey);

  const snapshot = await executeListQuery(
    () =>
      subcollectionConfig.orderByField
        ? subcollectionRef.orderBy(subcollectionConfig.orderByField, "desc").limit(limit)
        : subcollectionRef.limit(limit),
    () => subcollectionRef.limit(limit)
  );

  return snapshot.docs.map((doc) =>
    toRecord(
      subcollectionKey,
      `${config.path}/${documentId}/${subcollectionKey}/${doc.id}`,
      doc.id,
      doc.data()
    )
  );
}

export async function getModerationSubdocument(
  collectionKey: ModerationCollectionKey,
  documentId: string,
  subcollectionKey: ModerationSubcollectionKey,
  subdocumentId: string
): Promise<ModerationDocumentRecord | null> {
  if (isCommunityCommentSubcollection(collectionKey, subcollectionKey)) {
    const { nestedSnapshot, legacySnapshot } = await getCommunityCommentSnapshot(
      documentId,
      subdocumentId
    );

    if (nestedSnapshot.exists) {
      return toRecord(
        subcollectionKey,
        `community_posts/${documentId}/comments/${nestedSnapshot.id}`,
        nestedSnapshot.id,
        nestedSnapshot.data() ?? {}
      );
    }

    if (legacySnapshot?.exists) {
      return toRecord(
        subcollectionKey,
        `${LEGACY_COMMUNITY_COMMENTS_COLLECTION}/${legacySnapshot.id}`,
        legacySnapshot.id,
        legacySnapshot.data() ?? {}
      );
    }

    return null;
  }

  const config = getCollectionConfig(collectionKey);
  const subcollectionConfig = config.subcollections?.[subcollectionKey];
  if (!subcollectionConfig) {
    throw new Error(
      `Subcollection ${subcollectionKey} is not supported for ${collectionKey}`
    );
  }

  const snapshot = await adminDb
    .collection(config.path)
    .doc(documentId)
    .collection(subcollectionKey)
    .doc(subdocumentId)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return toRecord(
    subcollectionKey,
    `${config.path}/${documentId}/${subcollectionKey}/${snapshot.id}`,
    snapshot.id,
    snapshot.data() ?? {}
  );
}

export async function updateModerationSubdocument(
  collectionKey: ModerationCollectionKey,
  documentId: string,
  subcollectionKey: ModerationSubcollectionKey,
  subdocumentId: string,
  data: Record<string, unknown>
): Promise<ModerationDocumentRecord | null> {
  if (isCommunityCommentSubcollection(collectionKey, subcollectionKey)) {
    const {
      nestedRef,
      nestedSnapshot,
      legacyRef,
      legacySnapshot,
    } = await getCommunityCommentSnapshot(documentId, subdocumentId);

    if (!nestedSnapshot.exists && !legacySnapshot?.exists) {
      return null;
    }

    const batch = adminDb.batch();

    if (nestedSnapshot.exists) {
      const nestedPayload = coerceValueLikeExisting(
        data,
        nestedSnapshot.data() ?? {}
      ) as Record<string, unknown>;
      batch.set(nestedRef, nestedPayload, { merge: false });
    }

    if (legacySnapshot?.exists) {
      const legacyPayload = coerceValueLikeExisting(
        data,
        legacySnapshot.data() ?? {}
      ) as Record<string, unknown>;
      batch.set(legacyRef, legacyPayload, { merge: false });
    }

    batch.set(
      adminDb.collection("community_posts").doc(documentId),
      { updatedAt: new Date().toISOString() },
      { merge: true }
    );

    await batch.commit();
    return getModerationSubdocument(
      collectionKey,
      documentId,
      subcollectionKey,
      subdocumentId
    );
  }

  const config = getCollectionConfig(collectionKey);
  const subcollectionConfig = config.subcollections?.[subcollectionKey];
  if (!subcollectionConfig) {
    throw new Error(
      `Subcollection ${subcollectionKey} is not supported for ${collectionKey}`
    );
  }

  const ref = adminDb
    .collection(config.path)
    .doc(documentId)
    .collection(subcollectionKey)
    .doc(subdocumentId);

  const existing = await ref.get();
  if (!existing.exists) {
    return null;
  }

  const payload = coerceValueLikeExisting(data, existing.data() ?? {}) as Record<
    string,
    unknown
  >;

  await ref.set(payload, { merge: false });
  return getModerationSubdocument(
    collectionKey,
    documentId,
    subcollectionKey,
    subdocumentId
  );
}

export async function deleteModerationSubdocument(
  collectionKey: ModerationCollectionKey,
  documentId: string,
  subcollectionKey: ModerationSubcollectionKey,
  subdocumentId: string
): Promise<boolean> {
  if (isCommunityCommentSubcollection(collectionKey, subcollectionKey)) {
    const {
      nestedRef,
      nestedSnapshot,
      legacyRef,
      legacySnapshot,
    } = await getCommunityCommentSnapshot(documentId, subdocumentId);

    if (!nestedSnapshot.exists && !legacySnapshot?.exists) {
      return false;
    }

    const parentRef = adminDb.collection("community_posts").doc(documentId);
    const parentSnapshot = await parentRef.get();
    const parentData = parentSnapshot.data() ?? {};
    const currentCommentCount =
      typeof parentData.commentCount === "number" && Number.isFinite(parentData.commentCount)
        ? parentData.commentCount
        : 0;

    const batch = adminDb.batch();

    if (nestedSnapshot.exists) {
      batch.delete(nestedRef);
    }

    if (legacySnapshot?.exists) {
      batch.delete(legacyRef);
    }

    batch.set(
      parentRef,
      {
        commentCount: Math.max(currentCommentCount - 1, 0),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await batch.commit();
    return true;
  }

  const config = getCollectionConfig(collectionKey);
  const subcollectionConfig = config.subcollections?.[subcollectionKey];
  if (!subcollectionConfig) {
    throw new Error(
      `Subcollection ${subcollectionKey} is not supported for ${collectionKey}`
    );
  }

  const ref = adminDb
    .collection(config.path)
    .doc(documentId)
    .collection(subcollectionKey)
    .doc(subdocumentId);

  const existing = await ref.get();
  if (!existing.exists) {
    return false;
  }

  if (collectionKey === "community_posts" && subcollectionKey === "comments") {
    const parentRef = adminDb.collection(config.path).doc(documentId);
    const parentSnapshot = await parentRef.get();
    const parentData = parentSnapshot.data() ?? {};
    const currentCommentCount =
      typeof parentData.commentCount === "number" && Number.isFinite(parentData.commentCount)
        ? parentData.commentCount
        : 0;

    const batch = adminDb.batch();
    batch.delete(ref);
    batch.set(
      parentRef,
      {
        commentCount: Math.max(currentCommentCount - 1, 0),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await batch.commit();
    return true;
  }

  await ref.delete();
  return true;
}
