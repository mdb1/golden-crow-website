// Known limitation: posts/comments with authorId='anonymous' (from web app fallback)
// will not be found by this cascade delete.

import { adminDbFor, adminAuthFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` / `adminAuth.*` call below uses
// the named-app handles for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
const adminAuth = adminAuthFor("mydnamap");
import { ENV } from "../config/env.js";
import type {
  AdminUser,
  AdminUserVerificationSummary,
  CascadeDeleteResult,
} from "../types/sdk.types.js";

class VerificationEmailError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "VerificationEmailError";
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : String(entry ?? "")))
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return undefined;
}

function asBooleanRecord(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      Boolean(entry),
    ])
  );
}

const PUBLIC_PROFILE_SCAFFOLD_FIELDS = new Set([
  "email",
  "iconName",
  "iconColorHex",
  "updatedAt",
  "createdAt",
  "date_created",
  "date_modified",
]);

function hasMeaningfulPublicProfile(
  profileData: Record<string, unknown> | undefined
): boolean {
  if (!profileData) {
    return false;
  }

  return Object.entries(profileData).some(([key, value]) => {
    if (value === null || value === undefined) {
      return false;
    }

    if (key === "has_profile_image") {
      return value === true;
    }

    if (PUBLIC_PROFILE_SCAFFOLD_FIELDS.has(key)) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  });
}

/**
 * Merge a Firebase Auth UserRecord with a Firestore profile doc into AdminUser.
 */
function mergeUser(
  authUser: {
    uid: string;
    email?: string;
    emailVerified: boolean;
    disabled: boolean;
    metadata: { creationTime?: string; lastSignInTime?: string };
    photoURL?: string;
    displayName?: string;
  },
  profileData: Record<string, unknown>,
  linkedRecords?: AdminUser["linkedRecords"]
): AdminUser {
  const conditions =
    asStringArray(profileData["conditions"]).length > 0
      ? asStringArray(profileData["conditions"])
      : asStringArray(profileData["condition"]);

  return {
    uid: authUser.uid,
    email: authUser.email ?? "",
    emailVerified: authUser.emailVerified,
    disabled: authUser.disabled,
    createdAt: authUser.metadata.creationTime ?? "",
    lastSignInAt: authUser.metadata.lastSignInTime ?? "",
    photoURL: authUser.photoURL ?? null,
    displayName:
      (profileData["displayName"] as string | undefined) ??
      authUser.displayName ??
      "",
    age: (profileData["age"] as number | string | undefined) ?? asString(profileData["age"]),
    sex:
      (profileData["sex"] as AdminUser["sex"]) ??
      (profileData["gender"] as AdminUser["sex"]) ??
      undefined,
    country: profileData["country"] as string | undefined,
    conditions,
    onboardingCompleted: (profileData["onboardingCompleted"] as boolean) ?? false,
    visibilitySettings: asBooleanRecord(profileData["visibilitySettings"]),
    lastReportDate: profileData["lastReportDate"] as string | undefined,
    patientID: profileData["patientID"] as string | undefined,
    profileImage:
      (profileData["profileImage"] as string | undefined) ??
      (profileData["avatarURL"] as string | undefined),
    hiddenFields: (profileData["hiddenFields"] as string[]) ?? [],
    iconName: (profileData["iconName"] as string) ?? "person.crop.circle.fill",
    iconColorHex: (profileData["iconColorHex"] as string) ?? "",
    linkedRecords,
  };
}

/**
 * List users with pagination.
 * Uses Firebase Auth pageToken (string) — NOT a Firestore cursor.
 */
export async function listUsers(
  pageToken?: string
): Promise<{ users: AdminUser[]; nextPageToken?: string }> {
  const result = await adminAuth.listUsers(50, pageToken);

  const [
    profileSnaps,
    publicProfileSnaps,
    communityUserSnaps,
    reportOwnerSnaps,
    userProgressSnaps,
  ] = await Promise.all([
    Promise.all(result.users.map((u) => adminDb.collection("profiles").doc(u.uid).get())),
    Promise.all(
      result.users.map((u) => adminDb.collection("public_profiles").doc(u.uid).get())
    ),
    Promise.all(
      result.users.map((u) => adminDb.collection("community_users").doc(u.uid).get())
    ),
    Promise.all(
      result.users.map((u) => adminDb.collection("report_owners").doc(u.uid).get())
    ),
    Promise.all(
      result.users.map((u) => adminDb.collection("user_progress").doc(u.uid).get())
    ),
  ]);

  const users: AdminUser[] = result.users.map((authUser, i) => {
    const profileData = profileSnaps[i]?.data() ?? {};
    const publicProfileData = publicProfileSnaps[i]?.data() as
      | Record<string, unknown>
      | undefined;
    return mergeUser(authUser, profileData as Record<string, unknown>, {
      profile: profileSnaps[i]?.exists ?? false,
      publicProfile:
        (publicProfileSnaps[i]?.exists ?? false) &&
        hasMeaningfulPublicProfile(publicProfileData),
      communityUser: communityUserSnaps[i]?.exists ?? false,
      reportOwner: reportOwnerSnaps[i]?.exists ?? false,
      userProgress: userProgressSnaps[i]?.exists ?? false,
    });
  });

  const response: { users: AdminUser[]; nextPageToken?: string } = { users };
  if (result.pageToken) {
    response.nextPageToken = result.pageToken;
  }
  return response;
}

/**
 * Fetch a single user by UID, returns null if auth record not found.
 */
export async function getUserById(uid: string): Promise<AdminUser | null> {
  const [
    authUser,
    profileSnap,
    publicProfileSnap,
    communityUserSnap,
    reportOwnerSnap,
    userProgressSnap,
  ] = await Promise.all([
    adminAuth.getUser(uid).catch(() => null),
    adminDb.collection("profiles").doc(uid).get(),
    adminDb.collection("public_profiles").doc(uid).get(),
    adminDb.collection("community_users").doc(uid).get(),
    adminDb.collection("report_owners").doc(uid).get(),
    adminDb.collection("user_progress").doc(uid).get(),
  ]);

  if (!authUser) return null;

  const profileData = profileSnap.data() ?? {};
  const publicProfileData = publicProfileSnap.data() as
    | Record<string, unknown>
    | undefined;
  return mergeUser(authUser, profileData, {
    profile: profileSnap.exists,
    publicProfile:
      publicProfileSnap.exists && hasMeaningfulPublicProfile(publicProfileData),
    communityUser: communityUserSnap.exists,
    reportOwner: reportOwnerSnap.exists,
    userProgress: userProgressSnap.exists,
  });
}

export async function getUserVerificationSummaries(
  uids: string[]
): Promise<AdminUserVerificationSummary[]> {
  const orderedUids = [...new Set(uids.map((uid) => uid.trim()).filter(Boolean))].slice(
    0,
    100
  );

  if (orderedUids.length === 0) {
    return [];
  }

  const result = await adminAuth.getUsers(
    orderedUids.map((uid) => ({
      uid,
    }))
  );

  const summariesByUid = new Map<string, AdminUserVerificationSummary>();

  result.users.forEach((user) => {
    summariesByUid.set(user.uid, {
      uid: user.uid,
      exists: true,
      email: user.email ?? "",
      emailVerified: user.emailVerified,
      disabled: user.disabled,
    });
  });

  return orderedUids.map(
    (uid) =>
      summariesByUid.get(uid) ?? {
        uid,
        exists: false,
        email: "",
        emailVerified: false,
        disabled: false,
      }
  );
}

type FirebaseCustomTokenSignInResponse = {
  idToken?: string;
  error?: {
    message?: string;
  };
};

async function parseFirebaseRestError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
      };
    };
    return body.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function signInAsUserWithCustomToken(uid: string): Promise<string> {
  if (!ENV.FIREBASE_WEB_API_KEY) {
    throw new VerificationEmailError(
      "FIREBASE_WEB_API_KEY is required to send verification emails.",
      500
    );
  }

  const customToken = await adminAuth.createCustomToken(uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(
      ENV.FIREBASE_WEB_API_KEY
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    throw new VerificationEmailError(
      `Unable to sign in as the target user: ${await parseFirebaseRestError(response)}`,
      response.status >= 400 && response.status < 500 ? 400 : 502
    );
  }

  const body = (await response.json()) as FirebaseCustomTokenSignInResponse;
  if (!body.idToken) {
    throw new VerificationEmailError(
      "Firebase did not return an idToken for the verification flow.",
      502
    );
  }

  return body.idToken;
}

async function requestFirebaseVerificationEmail(idToken: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
      ENV.FIREBASE_WEB_API_KEY
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestType: "VERIFY_EMAIL",
        idToken,
        continueUrl: ENV.EMAIL_VERIFICATION_CONTINUE_URL,
      }),
    }
  );

  if (!response.ok) {
    throw new VerificationEmailError(
      `Firebase could not send the verification email: ${await parseFirebaseRestError(
        response
      )}`,
      response.status >= 400 && response.status < 500 ? 400 : 502
    );
  }
}

export async function sendUserVerificationEmail(uid: string): Promise<{
  uid: string;
  email: string;
  alreadyVerified: boolean;
}> {
  const user = await adminAuth.getUser(uid).catch(() => null);

  if (!user) {
    throw new VerificationEmailError("User not found.", 404);
  }

  if (!user.email) {
    throw new VerificationEmailError(
      "The selected auth account does not have an email address.",
      400
    );
  }

  if (user.disabled) {
    throw new VerificationEmailError(
      "Cannot send a verification email for a disabled account.",
      409
    );
  }

  if (user.emailVerified) {
    return {
      uid: user.uid,
      email: user.email,
      alreadyVerified: true,
    };
  }

  const idToken = await signInAsUserWithCustomToken(uid);
  await requestFirebaseVerificationEmail(idToken);

  return {
    uid: user.uid,
    email: user.email,
    alreadyVerified: false,
  };
}

/**
 * Update allowed Firestore profile fields for a user.
 * Uses set+merge so it works even when the profile doc doesn't exist yet.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      AdminUser,
      | "displayName"
      | "age"
      | "sex"
      | "country"
      | "conditions"
      | "iconName"
      | "iconColorHex"
      | "hiddenFields"
      | "patientID"
      | "onboardingCompleted"
      | "visibilitySettings"
      | "lastReportDate"
      | "profileImage"
      | "photoURL"
      | "emailVerified"
      | "disabled"
    >
  >
): Promise<AdminUser | null> {
  const firestoreFieldKeys = new Set([
    "displayName",
    "age",
    "sex",
    "country",
    "conditions",
    "iconName",
    "iconColorHex",
    "hiddenFields",
    "patientID",
    "onboardingCompleted",
    "visibilitySettings",
    "lastReportDate",
    "profileImage",
  ]);

  // Build Firestore update object, excluding undefined fields
  const firestoreUpdate: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && firestoreFieldKeys.has(key)) {
      firestoreUpdate[key] = value;
    }
  }

  await adminDb.collection("profiles").doc(uid).set(firestoreUpdate, { merge: true });

  const authUpdate: {
    displayName?: string;
    photoURL?: string;
    emailVerified?: boolean;
    disabled?: boolean;
  } = {};

  if (updates.displayName !== undefined) {
    authUpdate.displayName = updates.displayName;
  }

  if (updates.photoURL !== undefined) {
    authUpdate.photoURL = updates.photoURL || undefined;
  }

  if (updates.emailVerified !== undefined) {
    authUpdate.emailVerified = updates.emailVerified;
  }

  if (updates.disabled !== undefined) {
    authUpdate.disabled = updates.disabled;
  }

  if (Object.keys(authUpdate).length > 0) {
    await adminAuth.updateUser(uid, authUpdate);
  }

  return getUserById(uid);
}

/**
 * Cascade-delete a user and all associated data across Firestore collections.
 * Returns { success, errors } — always resolves (never throws).
 */
export async function deleteUserCascade(uid: string): Promise<CascadeDeleteResult> {
  const errors: string[] = [];

  // Step 1: Delete Firebase Auth account
  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    errors.push(`Auth delete failed: ${String(err)}`);
  }

  // Step 2: Delete Firestore profile doc
  try {
    await adminDb.collection("profiles").doc(uid).delete();
  } catch (err) {
    errors.push(`Profile delete failed: ${String(err)}`);
  }

  try {
    await adminDb.collection("public_profiles").doc(uid).delete();
  } catch (err) {
    errors.push(`Public profile delete failed: ${String(err)}`);
  }

  try {
    const eventsSnap = await adminDb
      .collection("community_users")
      .doc(uid)
      .collection("events")
      .get();

    if (!eventsSnap.empty) {
      const batch = adminDb.batch();
      eventsSnap.docs.slice(0, 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    await adminDb.collection("community_users").doc(uid).delete();
  } catch (err) {
    errors.push(`Community user delete failed: ${String(err)}`);
  }

  // Step 3: Delete posts where authorId == uid
  try {
    const postSnap = await adminDb.collection("community_posts").where("authorId", "==", uid).get();
    if (postSnap.docs.length > 500) {
      console.warn(`[deleteUserCascade] User ${uid} has ${postSnap.docs.length} posts; only deleting first 500.`);
    }
    if (!postSnap.empty) {
      const batch = adminDb.batch();
      for (const doc of postSnap.docs.slice(0, 500)) {
        const commentsSnap = await doc.ref.collection("comments").get();
        commentsSnap.docs.slice(0, 500).forEach((commentDoc) => batch.delete(commentDoc.ref));
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
  } catch (err) {
    errors.push(`Posts delete failed: ${String(err)}`);
  }

  // Step 4: Delete comments where authorId == uid
  try {
    const commentSnap = await adminDb
      .collectionGroup("comments")
      .where("authorId", "==", uid)
      .get();
    if (commentSnap.docs.length > 500) {
      console.warn(`[deleteUserCascade] User ${uid} has ${commentSnap.docs.length} comments; only deleting first 500.`);
    }
    if (!commentSnap.empty) {
      const batch = adminDb.batch();
      commentSnap.docs.slice(0, 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  } catch (err) {
    errors.push(`Comments delete failed: ${String(err)}`);
  }

  // Step 5: Delete report_codes where owner_id == uid
  try {
    const reportSnap = await adminDb.collection("report_codes").where("owner_id", "==", uid).get();
    if (reportSnap.docs.length > 500) {
      console.warn(`[deleteUserCascade] User ${uid} has ${reportSnap.docs.length} report_codes; only deleting first 500.`);
    }
    if (!reportSnap.empty) {
      const batch = adminDb.batch();
      reportSnap.docs.slice(0, 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  } catch (err) {
    errors.push(`Report codes delete failed: ${String(err)}`);
  }

  // Step 6: Delete user_progress document
  try {
    await adminDb.collection("user_progress").doc(uid).delete();
  } catch (err) {
    errors.push(`User progress delete failed: ${String(err)}`);
  }

  try {
    await adminDb.collection("report_owners").doc(uid).delete();
  } catch (err) {
    errors.push(`Report owner delete failed: ${String(err)}`);
  }

  try {
    const [uploadedOwnerSnap, uploadedCommunitySnap] = await Promise.all([
      adminDb.collection("uploaded_reports").where("report_owner_id", "==", uid).get(),
      adminDb.collection("uploaded_reports").where("owner_community_user_id", "==", uid).get(),
    ]);

    const uploadDocs = [
      ...uploadedOwnerSnap.docs,
      ...uploadedCommunitySnap.docs.filter(
        (doc) => !uploadedOwnerSnap.docs.some((ownerDoc) => ownerDoc.id === doc.id)
      ),
    ];

    if (uploadDocs.length > 0) {
      const batch = adminDb.batch();
      uploadDocs.slice(0, 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  } catch (err) {
    errors.push(`Uploaded reports delete failed: ${String(err)}`);
  }

  return { success: errors.length === 0, errors };
}

export function isVerificationEmailError(
  error: unknown
): error is VerificationEmailError {
  return error instanceof VerificationEmailError;
}
