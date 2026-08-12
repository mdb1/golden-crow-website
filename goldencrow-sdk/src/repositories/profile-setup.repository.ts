import { randomInt } from "node:crypto";
import { adminAuthFor, adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` / `adminAuth.*` call below uses
// the named-app handles for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
const adminAuth = adminAuthFor("mydnamap");
import type { UserRecord } from "firebase-admin/auth";
import {
  getBackofficeEmailAccess,
  normalizeRoleEmail,
} from "./roles.repository.js";
import type { AdminRole, ProjectKey } from "../types/sdk.types.js";
import type { AuthSurface } from "../lib/access-surfaces.js";

const DEFAULT_ICON_NAME = "person.crop.circle.fill";
const DEFAULT_ICON_COLOR = "#5A4FCF";
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;
const GOOGLE_PROVIDER_ID = "google.com";
const PASSWORD_PROVIDER_ID = "password";

type RecordData = Record<string, unknown>;

export interface EmailSignupEligibility {
  email: string;
  eligible: boolean;
  viaAllowlist: boolean;
  viaRoleAssignment: boolean;
  canAccessBackoffice: boolean;
  canAccessPatientPortal: boolean;
  requiredSurface?: AuthSurface;
  role?: AdminRole;
  accountExists: boolean;
  accountHasGoogle: boolean;
  accountHasPassword: boolean;
  signInProviders: string[];
  projectAccess: ProjectKey[];
}

export interface ProfileSetupState {
  uid: string;
  email: string;
  displayName: string;
  onboardingCompleted: boolean;
  needsCompletion: boolean;
  docs: {
    profile: boolean;
    publicProfile: boolean;
    communityUser: boolean;
    reportOwner: boolean;
  };
  defaults: {
    fullName: string;
    username: string;
    iconName: string;
    iconColorHex: string;
    ownerProfession: string;
    ownerCompany: string;
    ownerContactNumber: string;
    ownerBio: string;
    gender: string;
    condition: string;
  };
}

export interface CompleteProfileSetupInput {
  fullName: string;
  username: string;
  iconName: string;
  iconColorHex: string;
  ownerProfession?: string;
  ownerCompany?: string;
  ownerContactNumber?: string;
  ownerBio?: string;
  gender?: string;
  condition?: string;
}

class ProfileSetupError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ProfileSetupError";
  }
}

function isPlainRecord(value: unknown): value is RecordData {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown): RecordData {
  return isPlainRecord(value) ? value : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirstString(data: RecordData, keys: string[]) {
  for (const key of keys) {
    const value = getString(data[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStatsRecord(data: RecordData) {
  const nested = getRecord(data.stats);
  const readValue = (flatKey: string, nestedKey: string) =>
    getNumber(data[flatKey]) ?? getNumber(nested[nestedKey]) ?? 0;

  return {
    total_likes: readValue("stats.total_likes", "total_likes"),
    posts_created: readValue("stats.posts_created", "posts_created"),
    total_replies: readValue("stats.total_replies", "total_replies"),
    aminoacids_collected: readValue(
      "stats.aminoacids_collected",
      "aminoacids_collected"
    ),
    lessons_learned: readValue("stats.lessons_learned", "lessons_learned"),
  };
}

function buildUsernameSuggestion(email: string) {
  const localPart = normalizeRoleEmail(email).split("@")[0] ?? "";
  const sanitized = localPart
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  if (sanitized.length >= 3) {
    return sanitized.slice(0, 32);
  }

  return "member";
}

export function buildPatientUsername(
  email: string,
  numericSuffix = randomInt(0, 1000),
) {
  const suffix = Math.min(Math.max(Math.trunc(numericSuffix), 0), 999)
    .toString()
    .padStart(3, "0");
  const base = buildUsernameSuggestion(email).slice(0, 32 - suffix.length);
  return `${base}${suffix}`;
}

export function buildPatientProfileSetupInput(
  email: string,
  fullName: string,
  numericSuffix?: number,
): CompleteProfileSetupInput {
  return {
    fullName,
    username: buildPatientUsername(email, numericSuffix),
    iconName: DEFAULT_ICON_NAME,
    iconColorHex: DEFAULT_ICON_COLOR,
    ownerProfession: "",
    ownerCompany: "",
    ownerContactNumber: "",
    ownerBio: "",
    gender: "",
    condition: "",
  };
}

function validateCompleteProfileInput(input: CompleteProfileSetupInput) {
  const fullName = input.fullName.trim();
  if (!fullName) {
    throw new ProfileSetupError("Full name is required.", 400);
  }

  if (fullName.length > 100) {
    throw new ProfileSetupError("Full name must be 100 characters or fewer.", 400);
  }

  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new ProfileSetupError(
      "Username must be 3-32 characters using lowercase letters, numbers, dots, underscores, or hyphens.",
      400
    );
  }

  if (!input.iconName.trim()) {
    throw new ProfileSetupError("An icon is required.", 400);
  }

  if (!COLOR_PATTERN.test(input.iconColorHex.trim())) {
    throw new ProfileSetupError("Choose a valid icon color.", 400);
  }

  if (input.ownerContactNumber?.trim() && !PHONE_PATTERN.test(input.ownerContactNumber.trim())) {
    throw new ProfileSetupError("Use a valid contact number.", 400);
  }

  if ((input.ownerBio ?? "").trim().length > 600) {
    throw new ProfileSetupError("Bio must be 600 characters or fewer.", 400);
  }
}

export async function getEmailSignupEligibility(
  email: string,
  surface: AuthSurface = "backoffice",
): Promise<EmailSignupEligibility> {
  const access = await getBackofficeEmailAccess(email);
  const authUser = access.email
    ? await adminAuth.getUserByEmail(access.email).catch(() => null)
    : null;
  const signInProviders = [
    ...new Set(
      authUser?.providerData
        .map((provider) => provider.providerId)
        .filter((providerId): providerId is string => Boolean(providerId)) ?? []
    ),
  ].sort();

  return {
    email: access.email,
    eligible:
      surface === "patient-portal"
        ? access.canAccessPatientPortal
        : access.canAccessBackoffice,
    viaAllowlist: access.viaAllowlist,
    viaRoleAssignment:
      surface === "patient-portal"
        ? access.canAccessPatientPortal
        : access.viaRoleAssignment,
    canAccessBackoffice: access.canAccessBackoffice,
    canAccessPatientPortal: access.canAccessPatientPortal,
    requiredSurface: access.canAccessBackoffice
      ? "backoffice"
      : access.canAccessPatientPortal
        ? "patient-portal"
        : undefined,
    role: access.roleRecord?.role,
    accountExists: Boolean(authUser),
    accountHasGoogle: signInProviders.includes(GOOGLE_PROVIDER_ID),
    accountHasPassword: signInProviders.includes(PASSWORD_PROVIDER_ID),
    signInProviders,
    projectAccess: access.projectAccess,
  };
}

export async function createEligibleEmailAccount(input: {
  email: string;
  password: string;
  surface?: AuthSurface;
}) {
  const eligibility = await getEmailSignupEligibility(
    input.email,
    input.surface,
  );
  if (!eligibility.eligible) {
    throw new ProfileSetupError(
      input.surface === "patient-portal"
        ? "This email does not have patient portal access yet."
        : "This email does not have backoffice access yet.",
      403
    );
  }

  if (eligibility.accountExists) {
    throw new ProfileSetupError(
      "An account already exists for this email. Sign in with email instead.",
      409
    );
  }

  let createdUser: UserRecord;
  try {
    createdUser = await adminAuth.createUser({
      email: eligibility.email,
      password: input.password,
    });
  } catch (error) {
    const code =
      typeof error === "object" &&
      error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "";

    if (code === "auth/email-already-exists") {
      throw new ProfileSetupError(
        "An account already exists for this email. Sign in with email instead.",
        409
      );
    }

    if (code === "auth/invalid-password" || code === "auth/password-does-not-meet-requirements") {
      throw new ProfileSetupError(
        "Password does not meet Firebase requirements.",
        400
      );
    }

    throw error;
  }

  return {
    uid: createdUser.uid,
    email: eligibility.email,
  };
}

export async function getProfileSetupState(
  uid: string
): Promise<ProfileSetupState> {
  const [authUser, profileSnap, publicProfileSnap, communityUserSnap, reportOwnerSnap] =
    await Promise.all([
      adminAuth.getUser(uid).catch(() => null),
      adminDb.collection("profiles").doc(uid).get(),
      adminDb.collection("public_profiles").doc(uid).get(),
      adminDb.collection("community_users").doc(uid).get(),
      adminDb.collection("report_owners").doc(uid).get(),
    ]);

  if (!authUser) {
    throw new ProfileSetupError("Authenticated user not found.", 404);
  }

  const profileData = getRecord(profileSnap.data());
  const publicProfileData = getRecord(publicProfileSnap.data());
  const communityUserData = getRecord(communityUserSnap.data());
  const reportOwnerData = getRecord(reportOwnerSnap.data());

  const onboardingCompleted = getBoolean(profileData.onboardingCompleted) ?? false;
  const fullName =
    pickFirstString(publicProfileData, ["fullName", "full_name"]) ||
    pickFirstString(reportOwnerData, ["owner_name", "ownerName"]) ||
    pickFirstString(profileData, ["displayName"]) ||
    getString(authUser.displayName);
  const username =
    pickFirstString(publicProfileData, ["username"]) ||
    pickFirstString(communityUserData, ["username"]) ||
    buildUsernameSuggestion(authUser.email ?? "");
  const iconName =
    pickFirstString(profileData, ["iconName"]) ||
    pickFirstString(publicProfileData, ["iconName", "icon_name"]) ||
    pickFirstString(communityUserData, ["iconName", "icon_name"]) ||
    DEFAULT_ICON_NAME;
  const iconColorHex =
    pickFirstString(profileData, ["iconColorHex"]) ||
    pickFirstString(publicProfileData, ["iconColorHex", "icon_color_hex"]) ||
    pickFirstString(communityUserData, ["iconColorHex", "icon_color_hex"]) ||
    DEFAULT_ICON_COLOR;

  const docs = {
    profile: profileSnap.exists,
    publicProfile: publicProfileSnap.exists,
    communityUser: communityUserSnap.exists,
    reportOwner: reportOwnerSnap.exists,
  };

  return {
    uid,
    email: authUser.email ?? "",
    displayName: getString(authUser.displayName),
    onboardingCompleted,
    needsCompletion:
      !onboardingCompleted ||
      !docs.profile ||
      !docs.publicProfile ||
      !docs.communityUser ||
      !docs.reportOwner,
    docs,
    defaults: {
      fullName,
      username,
      iconName,
      iconColorHex,
      ownerProfession: pickFirstString(reportOwnerData, [
        "owner_profession",
        "ownerProfession",
      ]),
      ownerCompany: pickFirstString(reportOwnerData, [
        "owner_company",
        "ownerCompany",
      ]),
      ownerContactNumber: pickFirstString(reportOwnerData, [
        "owner_contact_number",
        "ownerContactNumber",
      ]),
      ownerBio: pickFirstString(reportOwnerData, ["owner_bio", "ownerBio"]),
      gender: pickFirstString(publicProfileData, ["gender"]),
      condition: pickFirstString(publicProfileData, ["condition"]),
    },
  };
}

export async function completePatientProfileSetup(
  uid: string,
  patientId: string,
): Promise<ProfileSetupState> {
  const currentState = await getProfileSetupState(uid);
  if (!currentState.needsCompletion) {
    return currentState;
  }

  const patientSnap = await adminDb.collection("patients").doc(patientId).get();
  if (!patientSnap.exists) {
    throw new ProfileSetupError("Linked patient not found.", 404);
  }

  const patientData = getRecord(patientSnap.data());
  const fullName = pickFirstString(patientData, ["fullName", "full_name", "name"]);
  if (!fullName) {
    throw new ProfileSetupError("The linked patient does not have a full name.", 400);
  }

  return completeProfileSetup(
    uid,
    "patient",
    buildPatientProfileSetupInput(currentState.email, fullName),
  );
}

export async function completeProfileSetup(
  uid: string,
  role: AdminRole,
  input: CompleteProfileSetupInput
): Promise<ProfileSetupState> {
  validateCompleteProfileInput(input);

  const [authUser, profileSnap, publicProfileSnap, communityUserSnap, reportOwnerSnap] =
    await Promise.all([
      adminAuth.getUser(uid).catch(() => null),
      adminDb.collection("profiles").doc(uid).get(),
      adminDb.collection("public_profiles").doc(uid).get(),
      adminDb.collection("community_users").doc(uid).get(),
      adminDb.collection("report_owners").doc(uid).get(),
    ]);

  if (!authUser || !authUser.email) {
    throw new ProfileSetupError("Authenticated user not found.", 404);
  }

  const profileData = getRecord(profileSnap.data());
  const publicProfileData = getRecord(publicProfileSnap.data());
  const communityUserData = getRecord(communityUserSnap.data());
  const reportOwnerData = getRecord(reportOwnerSnap.data());

  const now = new Date().toISOString();
  const fullName = input.fullName.trim();
  const username = input.username.trim().toLowerCase();
  const iconName = input.iconName.trim();
  const iconColorHex = input.iconColorHex.trim();
  const ownerProfession = input.ownerProfession?.trim() ?? "";
  const ownerCompany = input.ownerCompany?.trim() ?? "";
  const ownerContactNumber = input.ownerContactNumber?.trim() ?? "";
  const ownerBio = input.ownerBio?.trim() ?? "";
  const gender = input.gender?.trim() ?? "";
  const condition = input.condition?.trim() ?? "";

  const batch = adminDb.batch();

  batch.set(
    adminDb.collection("profiles").doc(uid),
    {
      displayName: fullName,
      iconName,
      iconColorHex,
      conditions: condition ? [condition] : [],
      onboardingCompleted: true,
      createdAt: pickFirstString(profileData, ["createdAt"]) || now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    adminDb.collection("community_users").doc(uid),
    {
      username,
      email: authUser.email,
      is_activity_public: getBoolean(communityUserData.is_activity_public) ?? false,
      is_clinician: getBoolean(communityUserData.is_clinician) ?? role !== "patient",
      iconName,
      iconColorHex,
      owned_reports: getStringArray(communityUserData.owned_reports),
      stats: getStatsRecord(communityUserData),
      createdAt: pickFirstString(communityUserData, ["createdAt"]) || now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    adminDb.collection("public_profiles").doc(uid),
    {
      fullName,
      email: authUser.email,
      username,
      gender,
      condition,
      has_profile_image:
        getBoolean(publicProfileData.has_profile_image) ?? false,
      iconName,
      iconColorHex,
      createdAt: pickFirstString(publicProfileData, ["createdAt"]) || now,
      updatedAt: now,
      date_created: pickFirstString(publicProfileData, ["date_created"]) || now,
      date_modified: now,
    },
    { merge: true }
  );

  batch.set(
    adminDb.collection("report_owners").doc(uid),
    {
      accepted_terms:
        getBoolean(reportOwnerData.accepted_terms) ?? false,
      accepted_terms_at:
        reportOwnerData.accepted_terms_at ?? null,
      owner_name: fullName,
      owner_contact_email: authUser.email,
      owner_profession: ownerProfession || null,
      owner_company: ownerCompany || null,
      owner_contact_number: ownerContactNumber || null,
      owner_bio: ownerBio || null,
      createdAt: pickFirstString(reportOwnerData, ["createdAt"]) || now,
      updatedAt: now,
    },
    { merge: true }
  );

  await batch.commit();
  await adminAuth.updateUser(uid, { displayName: fullName });

  return getProfileSetupState(uid);
}

export function isProfileSetupError(error: unknown): error is ProfileSetupError {
  return error instanceof ProfileSetupError;
}
