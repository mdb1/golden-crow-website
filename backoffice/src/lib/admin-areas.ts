export type AdminRole =
  | "full_admin"
  | "institution_admin"
  | "institution_operator"
  | "institution_laboratory_staff"
  | "institution_doctor"
  | "patient";

/**
 * Pitfall 7 same-source-of-truth mirror.
 *
 * The canonical declaration of this union lives in
 * `golden-crow-website/goldencrow-sdk/src/types/sdk.types.ts` — the SDK is
 * the upstream because it owns the named-app Firebase registry that
 * indexes per-project credentials by these literal strings (Phase 11-01).
 *
 * This mirror exists because the backoffice's runtime does NOT currently
 * import from the SDK package at type-check time (the two are deployed as
 * independent Vercel functions). Adding a new project means:
 *   1. Append the literal here AND in `goldencrow-sdk/src/types/sdk.types.ts`
 *      in the SAME commit.
 *   2. Run `bash scripts/check-no-default-app.sh` to confirm no default-app
 *      initializeApp() crept in (Pitfall 16).
 *   3. The Jest case in `goldencrow-sdk/src/__tests__/firebase-registry.test.ts`
 *      (11-01) provides the cross-surface lock for the SDK side.
 */
export type ProjectKey = "mydnamap" | "pocket-gyms" | "gc-fitness";

export interface AdminContextRecord {
  email: string;
  uid: string;
  role: AdminRole;
  institutionId?: string;
  doctorId?: string;
  patientId?: string;
  isBootstrap: boolean;
  canAccessBackoffice: boolean;
  project: ProjectKey;
  projectAccess: ProjectKey[];
}

export interface AdminContextResponse {
  context: AdminContextRecord;
  capabilities: string[];
}

export interface InstitutionRecord {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstitutionListItem extends InstitutionRecord {
  doctorCount: number;
  patientCount: number;
  institutionAdminCount: number;
  administrativeOperatorCount: number;
  laboratoryStaffCount: number;
}

export interface DoctorRecord {
  id: string;
  institutionId: string;
  authEmail: string;
  authUid?: string;
  fullName: string;
  specialty?: string;
  licenseNumber?: string;
  contactPhone?: string;
  status: "active" | "inactive";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorListItem extends DoctorRecord {
  institutionName?: string;
  patientCount: number;
  roleEmail?: string;
  roleActive?: boolean;
}

export interface PatientRecord {
  id: string;
  institutionId: string;
  doctorId: string;
  email: string;
  fullName: string;
  medicalRecordNumber?: string;
  birthDate?: string;
  sex?: string;
  status: "active" | "inactive";
  notes?: string;
  additionalInformation?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PatientListItem extends PatientRecord {
  institutionName?: string;
  doctorName?: string;
  doctorEmail?: string;
}

export interface RoleManagementRecord {
  email: string;
  role: AdminRole;
  institutionId?: string;
  doctorId?: string;
  patientId?: string;
  isActive: boolean;
  displayName?: string;
  contactPhone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
  institutionName?: string;
  doctorName?: string;
  patientName?: string;
  bootstrap?: boolean;
}

export interface InstitutionDetailRecord {
  institution: InstitutionListItem;
  doctors: DoctorListItem[];
  institutionAdmins: RoleManagementRecord[];
}

export interface DoctorDetailRecord {
  doctor: DoctorListItem;
  institution: InstitutionRecord | null;
  patients: PatientListItem[];
  roleRecord: RoleManagementRecord | null;
}

export interface PatientDetailRecord {
  patient: PatientListItem;
  institution: InstitutionRecord | null;
  doctor: DoctorListItem | null;
  roleRecord: RoleManagementRecord | null;
}

export interface MyAccountProviderInfo {
  providerId: string;
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
}

export interface MyAccountAuthRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  tenantId?: string;
  customClaims: Record<string, unknown>;
  providerData: MyAccountProviderInfo[];
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
    lastRefreshTime?: string;
  };
  tokensValidAfterTime?: string;
}

export interface MyAccountProfileSummary {
  username?: string;
  fullName?: string;
  onboardingCompleted: boolean;
  needsCompletion: boolean;
  docs: {
    profile: boolean;
    publicProfile: boolean;
    communityUser: boolean;
    reportOwner: boolean;
  };
}

export interface MyAccountRecord {
  context: AdminContextRecord;
  role: RoleManagementRecord | null;
  capabilities: string[];
  auth: MyAccountAuthRecord;
  profile: MyAccountProfileSummary | null;
}

export interface ChangeMyAccountEmailResponse {
  account: MyAccountRecord;
  previousEmail: string;
  newEmail: string;
  requiresSignIn: boolean;
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  full_admin: "Full admin",
  institution_admin: "Institution admin",
  institution_operator: "Institution operator",
  institution_laboratory_staff: "Institution laboratory staff",
  institution_doctor: "Institution doctor",
  patient: "Patient",
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  full_admin:
    "Global control over institutions, users, roles, and the legacy moderation tools.",
  institution_admin:
    "Institution-scoped control over one institution, its doctors, its patients, and local role assignments.",
  institution_operator:
    "Institution-scoped administrative operations over one institution, its doctors, its patients, and existing local role assignments.",
  institution_laboratory_staff:
    "Institution-scoped laboratory operations over one institution. It includes 2PQ operational work, but not local role administration.",
  institution_doctor:
    "Read access to the institution, full control over the doctor's own profile, and CRUD on the doctor's own patients.",
  patient:
    "Informational role record only. Patients do not enter the backoffice.",
};

export const ROLE_OPTIONS: Array<{ value: AdminRole; label: string }> = [
  { value: "full_admin", label: "Full admin" },
  { value: "institution_admin", label: "Institution admin" },
  { value: "institution_operator", label: "Institution operator" },
  {
    value: "institution_laboratory_staff",
    label: "Institution laboratory staff",
  },
  { value: "institution_doctor", label: "Institution doctor" },
  { value: "patient", label: "Patient" },
];

export const PERSON_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

export function getAssignableRoleOptions(role: AdminRole) {
  if (role === "full_admin") {
    return ROLE_OPTIONS;
  }

  if (role === "institution_admin") {
    return ROLE_OPTIONS.filter(
      (option) =>
        option.value === "institution_admin" ||
        option.value === "institution_operator" ||
        option.value === "institution_laboratory_staff" ||
        option.value === "institution_doctor" ||
        option.value === "patient",
    );
  }

  if (role === "institution_operator") {
    return ROLE_OPTIONS.filter(
      (option) =>
        option.value === "institution_operator" ||
        option.value === "institution_laboratory_staff" ||
        option.value === "institution_doctor" ||
        option.value === "patient",
    );
  }

  if (role === "institution_laboratory_staff") {
    return [];
  }

  if (role === "institution_doctor") {
    return ROLE_OPTIONS.filter((option) => option.value === "patient");
  }

  return [];
}

export function isInstitutionManagerRole(role: AdminRole) {
  return (
    role === "institution_admin" ||
    role === "institution_operator" ||
    role === "institution_laboratory_staff"
  );
}
