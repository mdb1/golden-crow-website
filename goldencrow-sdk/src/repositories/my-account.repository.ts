import type { UserInfo, UserRecord } from "firebase-admin/auth";
import { adminAuthFor } from "../config/firebase.js";
import { AdminRepositoryError, isAdminRepositoryError } from "./admin-errors.js";
import {
  getProfileSetupState,
  isProfileSetupError,
} from "./profile-setup.repository.js";
import {
  getAdminCapabilities,
  getOwnRoleForContext,
  moveOwnRoleEmailForContext,
  normalizeRoleEmail,
  updateOwnRoleProfileForContext,
} from "./roles.repository.js";
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ChangeMyAccountEmailResult {
  account: MyAccountRecord;
  previousEmail: string;
  newEmail: string;
  requiresSignIn: boolean;
}

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
      409
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

async function getProfileSummary(uid: string): Promise<MyAccountProfileSummary | null> {
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

function contextFromRole(context: AdminContext, role: RoleManagementRecord): AdminContext {
  return {
    ...context,
    email: role.email,
    role: role.role,
    organizationId: role.organizationId,
    institutionId: role.institutionId,
    doctorId: role.doctorId,
    patientId: role.patientId,
    isBootstrap: Boolean(role.bootstrap),
    canAccessBackoffice: role.isActive,
  };
}

export async function getMyAccountForContext(
  context: AdminContext
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
  payload: Pick<UserRoleRecord, "displayName" | "contactPhone" | "notes">
): Promise<MyAccountRecord> {
  const role = await updateOwnRoleProfileForContext(context, payload);
  return getMyAccountForContext(contextFromRole(context, role));
}

export async function changeMyAccountEmailForContext(
  context: AdminContext,
  nextEmail: string
): Promise<ChangeMyAccountEmailResult> {
  const currentEmail = normalizeRoleEmail(context.email);
  const normalizedNextEmail = normalizeRoleEmail(nextEmail);

  if (!EMAIL_PATTERN.test(normalizedNextEmail)) {
    throw new AdminRepositoryError("Use a valid email address.", 400);
  }

  if (context.isBootstrap) {
    throw new AdminRepositoryError(
      "Bootstrap allowlist account emails are managed by environment configuration and cannot be changed here.",
      403
    );
  }

  const currentAuthUser = await adminAuth.getUser(context.uid).catch((error) => {
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
    };
  }

  const existingAuthUser = await adminAuth
    .getUserByEmail(normalizedNextEmail)
    .catch(() => null);
  if (existingAuthUser && existingAuthUser.uid !== context.uid) {
    throw new AdminRepositoryError(
      "A Firebase Auth user already exists for the requested email.",
      409
    );
  }

  let authEmailChanged = false;

  try {
    await adminAuth.updateUser(context.uid, {
      email: normalizedNextEmail,
      emailVerified: false,
    });
    authEmailChanged = true;

    const movedRole = await moveOwnRoleEmailForContext(context, normalizedNextEmail);
    const nextContext = contextFromRole(context, movedRole);
    return {
      account: await getMyAccountForContext(nextContext),
      previousEmail: currentEmail,
      newEmail: normalizedNextEmail,
      requiresSignIn: true,
    };
  } catch (error) {
    if (authEmailChanged) {
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
