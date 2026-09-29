import type { UserInfo, UserRecord } from "firebase-admin/auth";
import type {
  DocumentReference,
  WriteBatch,
} from "firebase-admin/firestore";
import { adminAuthFor, adminDbFor } from "../config/firebase.js";
import {
  AdminRepositoryError,
  isAdminRepositoryError,
} from "./admin-errors.js";
import {
  getProfileSetupState,
  isProfileSetupError,
} from "./profile-setup.repository.js";
import {
  getAdminCapabilities,
  getOwnRoleForContext,
  getRoleCollectionName,
  normalizeRoleEmail,
  resolveLinkedCommunityUserForRole,
  updateOwnRoleProfileForContext,
} from "./roles.repository.js";
import {
  canAccessBackoffice,
  canAccessPatientPortal,
  canAccessPGFlex,
  canAccessPublisherPortal,
} from "../lib/access-surfaces.js";
import type {
  AdminContext,
  MyAccountAuthRecord,
  MyAccountProfileSummary,
  MyAccountRecord,
  RoleManagementRecord,
  UserRoleRecord,
} from "../types/sdk.types.js";

// Pitfall 16 — My Account belongs to the legacy PocketGenes auth surface, so
// every Firebase Auth operation here uses the MyDNAMap named Admin handle.
const adminAuth = adminAuthFor("mydnamap");
const adminDb = adminDbFor("mydnamap");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ChangeMyAccountEmailResult {
  account: MyAccountRecord;
  previousEmail: string;
  newEmail: string;
  requiresSignIn: boolean;
  syncSteps: AccountEmailSyncStepResult[];
}

export type AccountEmailSyncStep =
  | "firebase_auth"
  | "role_assignment"
  | "private_profile"
  | "public_profile"
  | "community_user"
  | "report_owners"
  | "object_owners"
  | "linked_entity"
  | "two_pq_clients";

export interface AccountEmailSyncStepResult {
  step: AccountEmailSyncStep;
  status: "updated" | "unchanged" | "not_found";
  updatedCount: number;
  message: string;
}

type ExistingDocument = {
  ref: DocumentReference;
  data: Record<string, unknown>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFirebaseErrorCode(error: unknown) {
  return typeof error === "object" &&
    error &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "";
}

function mapFirebaseAuthError(error: unknown): AdminRepositoryError | null {
  const code = getFirebaseErrorCode(error);

  if (code === "auth/email-already-exists") {
    return new AdminRepositoryError(
      "A Firebase Auth user already exists for the requested email.",
      409,
    );
  }

  if (code === "auth/invalid-email") {
    return new AdminRepositoryError("Use a valid email address.", 400);
  }

  if (code === "auth/user-not-found") {
    return new AdminRepositoryError("Firebase Auth user not found.", 404);
  }

  return null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function existingDocuments(collection: string, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const snapshots = await Promise.all(
    uniqueIds.map((id) => adminDb.collection(collection).doc(id).get()),
  );
  return snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => ({
      ref: snapshot.ref,
      data: (snapshot.data() ?? {}) as Record<string, unknown>,
    }));
}

async function documentsMatchingEmails(
  collection: string,
  field: string,
  emails: string[],
) {
  const normalizedEmails = [...
    new Set(emails.map(normalizeRoleEmail).filter(Boolean)),
  ];
  const snapshots = await Promise.all(
    normalizedEmails.map((email) =>
      adminDb
        .collection(collection)
        .where(field, "==", email)
        .limit(20)
        .get(),
    ),
  );
  const documents = new Map<string, ExistingDocument>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      documents.set(document.ref.path, {
        ref: document.ref,
        data: document.data() as Record<string, unknown>,
      });
    }
  }
  return [...documents.values()];
}

function emailSyncStep(
  step: AccountEmailSyncStep,
  documents: ExistingDocument[],
  nextEmail: string,
  field: string,
  label: string,
): AccountEmailSyncStepResult {
  if (documents.length === 0) {
    return {
      step,
      status: "not_found",
      updatedCount: 0,
      message: `No ${label} record was available.`,
    };
  }

  const updatedCount = documents.filter(
    (document) =>
      normalizeRoleEmail(optionalString(document.data[field]) ?? "") !==
      nextEmail,
  ).length;
  return {
    step,
    status: updatedCount > 0 ? "updated" : "unchanged",
    updatedCount,
    message:
      updatedCount > 0
        ? `Updated ${updatedCount} ${label} record(s).`
        : `The ${label} email was already current.`,
  };
}

function mergeEmailUpdates(
  batch: WriteBatch,
  documents: ExistingDocument[],
  nextEmail: string,
  field: string,
  timestampField: string,
  now: string,
) {
  for (const document of documents) {
    if (
      normalizeRoleEmail(optionalString(document.data[field]) ?? "") ===
      nextEmail
    ) {
      continue;
    }
    batch.set(
      document.ref,
      { [field]: nextEmail, [timestampField]: now },
      { merge: true },
    );
  }
}

function toProviderInfo(provider: UserInfo) {
  return {
    providerId: provider.providerId,
    uid: provider.uid,
    displayName: provider.displayName ?? undefined,
    email: provider.email ?? undefined,
    phoneNumber: provider.phoneNumber ?? undefined,
    photoURL: provider.photoURL ?? undefined,
  };
}

function toAuthRecord(user: UserRecord): MyAccountAuthRecord {
  return {
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    displayName: user.displayName ?? undefined,
    phoneNumber: user.phoneNumber ?? undefined,
    photoURL: user.photoURL ?? undefined,
    tenantId: user.tenantId ?? undefined,
    customClaims: isPlainRecord(user.customClaims) ? user.customClaims : {},
    providerData: user.providerData.map(toProviderInfo),
    metadata: {
      creationTime: user.metadata.creationTime ?? undefined,
      lastSignInTime: user.metadata.lastSignInTime ?? undefined,
      lastRefreshTime: user.metadata.lastRefreshTime ?? undefined,
    },
    tokensValidAfterTime: user.tokensValidAfterTime ?? undefined,
  };
}

async function getProfileSummary(
  uid: string,
): Promise<MyAccountProfileSummary | null> {
  try {
    const state = await getProfileSetupState(uid);
    return {
      username: state.defaults.username || undefined,
      fullName: state.defaults.fullName || undefined,
      onboardingCompleted: state.onboardingCompleted,
      needsCompletion: state.needsCompletion,
      docs: state.docs,
    };
  } catch (error) {
    if (isProfileSetupError(error)) {
      return null;
    }

    throw error;
  }
}

function contextFromRole(
  context: AdminContext,
  role: RoleManagementRecord,
): AdminContext {
  return {
    ...context,
    email: role.email,
    role: role.role,
    organizationId: role.organizationId,
    individualId: role.individualId,
    institutionId: role.institutionId,
    doctorId: role.doctorId,
    patientId: role.patientId,
    isBootstrap: Boolean(role.bootstrap),
    canAccessBackoffice: canAccessBackoffice(role, context.isBootstrap),
    canAccessPatientPortal: canAccessPatientPortal(role, context.isBootstrap),
    canAccessPGFlex: canAccessPGFlex(role, context.isBootstrap),
    canAccessPublisherPortal: canAccessPublisherPortal(
      role,
      context.isBootstrap,
    ),
  };
}

export async function getMyAccountForContext(
  context: AdminContext,
): Promise<MyAccountRecord> {
  const [authUser, role, profile] = await Promise.all([
    adminAuth.getUser(context.uid),
    getOwnRoleForContext(context),
    getProfileSummary(context.uid),
  ]);

  return {
    context,
    role,
    capabilities: getAdminCapabilities(context),
    auth: toAuthRecord(authUser),
    profile,
  };
}

export async function updateMyAccountRoleProfileForContext(
  context: AdminContext,
  payload: Pick<UserRoleRecord, "displayName" | "contactPhone" | "notes">,
): Promise<MyAccountRecord> {
  const role = await updateOwnRoleProfileForContext(context, payload);
  return getMyAccountForContext(contextFromRole(context, role));
}

export async function changeMyAccountEmailForContext(
  context: AdminContext,
  nextEmail: string,
): Promise<ChangeMyAccountEmailResult> {
  const currentEmail = normalizeRoleEmail(context.email);
  const normalizedNextEmail = normalizeRoleEmail(nextEmail);

  if (!EMAIL_PATTERN.test(normalizedNextEmail)) {
    throw new AdminRepositoryError("Use a valid email address.", 400);
  }

  if (context.isBootstrap) {
    throw new AdminRepositoryError(
      "Bootstrap allowlist account emails are managed by environment configuration and cannot be changed here.",
      403,
    );
  }

  const currentAuthUser = await adminAuth
    .getUser(context.uid)
    .catch((error) => {
      const mapped = mapFirebaseAuthError(error);
      throw mapped ?? error;
    });
  const previousFirebaseEmail = currentAuthUser.email ?? currentEmail;

  if (normalizedNextEmail === currentEmail) {
    return {
      account: await getMyAccountForContext(context),
      previousEmail: currentEmail,
      newEmail: normalizedNextEmail,
      requiresSignIn: false,
      syncSteps: [
        {
          step: "firebase_auth",
          status: "unchanged",
          updatedCount: 0,
          message: "The Firebase Auth email was already current.",
        },
        {
          step: "role_assignment",
          status: "unchanged",
          updatedCount: 0,
          message: "The role assignment email was already current.",
        },
      ],
    };
  }

  const existingAuthUser = await adminAuth
    .getUserByEmail(normalizedNextEmail)
    .catch(() => null);
  if (existingAuthUser && existingAuthUser.uid !== context.uid) {
    throw new AdminRepositoryError(
      "A Firebase Auth user already exists for the requested email.",
      409,
    );
  }

  const role = await getOwnRoleForContext(context);
  if (!role || role.bootstrap) {
    throw new AdminRepositoryError(
      "Role assignment not found for the current user.",
      404,
    );
  }

  const roleCollection = adminDb.collection(getRoleCollectionName());
  const currentRoleRef = roleCollection.doc(currentEmail);
  const nextRoleRef = roleCollection.doc(normalizedNextEmail);
  const [currentRoleSnapshot, nextRoleSnapshot, linkedCommunityUser] =
    await Promise.all([
      currentRoleRef.get(),
      nextRoleRef.get(),
      resolveLinkedCommunityUserForRole(role, context.uid),
    ]);

  if (!currentRoleSnapshot.exists) {
    throw new AdminRepositoryError(
      "Role assignment not found for the current user.",
      404,
    );
  }
  if (nextRoleSnapshot.exists) {
    throw new AdminRepositoryError(
      "A role assignment already exists for the requested email.",
      409,
    );
  }

  const ownerIds = [
    context.uid,
    linkedCommunityUser?.id,
    role.patientId,
    role.doctorId,
    role.individualId,
  ].filter((value): value is string => Boolean(value));
  const oldEmails = [
    currentEmail,
    previousFirebaseEmail,
    role.communityUserOriginalEmail,
    linkedCommunityUser?.email,
  ].filter((value): value is string => Boolean(value));

  const linkedEntityCollection = role.patientId
    ? "patients"
    : role.doctorId
      ? "doctors"
      : role.individualId
        ? "feed_individuals"
        : null;
  const linkedEntityId =
    role.patientId ?? role.doctorId ?? role.individualId ?? null;
  const linkedEntityEmailField = role.patientId
    ? "email"
    : role.doctorId
      ? "authEmail"
      : role.individualId
        ? "contactEmail"
        : "email";

  const [
    privateProfiles,
    publicProfiles,
    communityUsers,
    reportOwners,
    objectOwners,
    linkedEntities,
    clientsByClientEmail,
    clientsByRoleEmail,
  ] = await Promise.all([
    existingDocuments("profiles", [context.uid]),
    existingDocuments("public_profiles", [context.uid]),
    linkedCommunityUser
      ? existingDocuments("community_users", [linkedCommunityUser.id])
      : Promise.resolve([]),
    existingDocuments("report_owners", ownerIds),
    existingDocuments("object_owners", ownerIds),
    linkedEntityCollection && linkedEntityId
      ? existingDocuments(linkedEntityCollection, [linkedEntityId])
      : Promise.resolve([]),
    documentsMatchingEmails("2pq_client", "clientEmail", oldEmails),
    documentsMatchingEmails("2pq_client", "roleEmail", oldEmails),
  ]);

  const twoPQClients = [
    ...new Map(
      [...clientsByClientEmail, ...clientsByRoleEmail].map((document) => [
        document.ref.path,
        document,
      ]),
    ).values(),
  ];
  const normalizedOldEmails = new Set(oldEmails.map(normalizeRoleEmail));
  const now = new Date().toISOString();
  const batch = adminDb.batch();

  mergeEmailUpdates(
    batch,
    privateProfiles,
    normalizedNextEmail,
    "email",
    "updatedAt",
    now,
  );
  mergeEmailUpdates(
    batch,
    publicProfiles,
    normalizedNextEmail,
    "email",
    "updatedAt",
    now,
  );
  for (const profile of publicProfiles) {
    if (
      normalizeRoleEmail(optionalString(profile.data.email) ?? "") !==
      normalizedNextEmail
    ) {
      batch.set(profile.ref, { date_modified: now }, { merge: true });
    }
  }
  mergeEmailUpdates(
    batch,
    communityUsers,
    normalizedNextEmail,
    "email",
    "updatedAt",
    now,
  );
  mergeEmailUpdates(
    batch,
    reportOwners,
    normalizedNextEmail,
    "owner_contact_email",
    "updated_at",
    now,
  );
  mergeEmailUpdates(
    batch,
    objectOwners,
    normalizedNextEmail,
    "owner_contact_email",
    "updated_at",
    now,
  );
  mergeEmailUpdates(
    batch,
    linkedEntities,
    normalizedNextEmail,
    linkedEntityEmailField,
    "updatedAt",
    now,
  );

  let updatedTwoPQClientCount = 0;
  for (const client of twoPQClients) {
    const update: Record<string, unknown> = {};
    for (const field of ["clientEmail", "roleEmail"] as const) {
      const storedEmail = normalizeRoleEmail(
        optionalString(client.data[field]) ?? "",
      );
      if (
        storedEmail !== normalizedNextEmail &&
        normalizedOldEmails.has(storedEmail)
      ) {
        update[field] = normalizedNextEmail;
      }
    }
    if (Object.keys(update).length > 0) {
      batch.set(client.ref, { ...update, updatedAt: now }, { merge: true });
      updatedTwoPQClientCount += 1;
    }
  }

  const currentRoleData = (currentRoleSnapshot.data() ?? {}) as Record<
    string,
    unknown
  >;
  const communityUserOriginalEmail =
    role.communityUserOriginalEmail ??
    linkedCommunityUser?.email ??
    previousFirebaseEmail;
  const communityUserOriginalUsername =
    role.communityUserOriginalUsername ?? linkedCommunityUser?.username;
  const nextRoleData: Record<string, unknown> = {
    ...currentRoleData,
    email: normalizedNextEmail,
    firebaseUid: context.uid,
    updatedAt: now,
  };
  if (linkedCommunityUser?.id) {
    nextRoleData.communityUserId = linkedCommunityUser.id;
  }
  if (communityUserOriginalEmail) {
    nextRoleData.communityUserOriginalEmail = communityUserOriginalEmail;
  }
  if (communityUserOriginalUsername) {
    nextRoleData.communityUserOriginalUsername =
      communityUserOriginalUsername;
  }
  batch.set(nextRoleRef, nextRoleData);
  batch.delete(currentRoleRef);

  let authEmailChanged = false;
  let firestoreCommitted = false;
  let updatedAuthUser: UserRecord | null = null;

  try {
    updatedAuthUser = await adminAuth.updateUser(context.uid, {
      email: normalizedNextEmail,
      emailVerified: false,
    });
    authEmailChanged = true;

    await batch.commit();
    firestoreCommitted = true;

    const movedRole: RoleManagementRecord = {
      ...role,
      email: normalizedNextEmail,
      firebaseUid: context.uid,
      communityUserId:
        linkedCommunityUser?.id ?? role.communityUserId,
      communityUserOriginalEmail,
      communityUserOriginalUsername,
      updatedAt: now,
    };
    const nextContext = contextFromRole(context, movedRole);
    const account = await getMyAccountForContext(nextContext).catch(() => ({
      context: nextContext,
      role: movedRole,
      capabilities: getAdminCapabilities(nextContext),
      auth: toAuthRecord(updatedAuthUser as UserRecord),
      profile: null,
    }));
    const twoPQStep: AccountEmailSyncStepResult =
      twoPQClients.length === 0
        ? {
            step: "two_pq_clients",
            status: "not_found",
            updatedCount: 0,
            message: "No linked 2PQ client record was available.",
          }
        : {
            step: "two_pq_clients",
            status:
              updatedTwoPQClientCount > 0 ? "updated" : "unchanged",
            updatedCount: updatedTwoPQClientCount,
            message:
              updatedTwoPQClientCount > 0
                ? `Updated ${updatedTwoPQClientCount} linked 2PQ client record(s).`
                : "The linked 2PQ client email was already current.",
          };
    return {
      account,
      previousEmail: currentEmail,
      newEmail: normalizedNextEmail,
      requiresSignIn: true,
      syncSteps: [
        {
          step: "firebase_auth",
          status: "updated",
          updatedCount: 1,
          message: "Updated the Firebase Auth email.",
        },
        {
          step: "role_assignment",
          status: "updated",
          updatedCount: 1,
          message: "Moved the role assignment to the new email.",
        },
        emailSyncStep(
          "community_user",
          communityUsers,
          normalizedNextEmail,
          "email",
          "community account",
        ),
        emailSyncStep(
          "private_profile",
          privateProfiles,
          normalizedNextEmail,
          "email",
          "private profile",
        ),
        emailSyncStep(
          "public_profile",
          publicProfiles,
          normalizedNextEmail,
          "email",
          "public profile",
        ),
        emailSyncStep(
          "report_owners",
          reportOwners,
          normalizedNextEmail,
          "owner_contact_email",
          "report owner account",
        ),
        emailSyncStep(
          "object_owners",
          objectOwners,
          normalizedNextEmail,
          "owner_contact_email",
          "object owner account",
        ),
        emailSyncStep(
          "linked_entity",
          linkedEntities,
          normalizedNextEmail,
          linkedEntityEmailField,
          "linked patient, doctor, or professional",
        ),
        twoPQStep,
      ],
    };
  } catch (error) {
    if (authEmailChanged && !firestoreCommitted) {
      await adminAuth
        .updateUser(context.uid, {
          email: previousFirebaseEmail,
          emailVerified: currentAuthUser.emailVerified,
        })
        .catch(() => undefined);
    }

    if (isAdminRepositoryError(error)) {
      throw error;
    }

    const mapped = mapFirebaseAuthError(error);
    throw mapped ?? error;
  }
}
