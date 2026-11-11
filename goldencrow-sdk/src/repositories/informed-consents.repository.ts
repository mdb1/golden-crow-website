import {
  FieldPath,
  FieldValue,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { adminAuthFor, adminDbFor } from "../config/firebase.js";
import { canAccessInformedConsentPatient } from "../lib/informed-consent-access.js";
import { isGlobalAdminRole } from "../lib/admin-roles.js";
import {
  normalizeTemporaryPassword,
  sendInformedConsentEmail,
} from "../lib/informed-consent-email.js";
import {
  getStudyRequestConsentStatus,
  INFORMED_CONSENTS_COLLECTION as CONSENTS_COLLECTION,
  type StudyRequestConsentScope,
  type StudyRequestConsentStatus,
} from "../lib/study-request-consent.js";
import {
  readSavedSignatureDataUrl,
  validateSavedSignatureDataUrl,
} from "../lib/saved-signature.js";
import type {
  AdminContext,
  InformedConsentCaseOption,
  InformedConsentDraftRecord,
  InformedConsentDraftState,
  InformedConsentDraftSummary,
  InformedConsentFile,
  InformedConsentHomeStatus,
  InformedConsentPatientOption,
  InformedConsentRecord,
  InformedConsentSavedSignature,
  PatientRecord,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { getUserRoleByEmail, normalizeRoleEmail } from "./roles.repository.js";

const adminDb = adminDbFor("mydnamap");
const CONSENT_DRAFTS_COLLECTION = "2pq-informed-consent-drafts";
const PATIENTS_COLLECTION = "patients";
const CASES_COLLECTION = "2pq_case";
const STUDY_REQUESTS_COLLECTION = "2pq_forms";
const DOCTORS_COLLECTION = "doctors";
const INSTITUTIONS_COLLECTION = "institutions";
const SEQUENCES_COLLECTION = "admin_sequences";
const CONSENTS_PAGE_SIZE = 20;
export const INFORMED_CONSENT_FILE_MAX_BYTES = 750_000;
// This version/text pair is an immutable audit snapshot. Introduce a new
// version instead of editing it when the displayed legal statement changes.
export const INFORMED_CONSENT_SIGNATURE_ATTESTATION_STATEMENT_VERSION = "es-v1";
export const INFORMED_CONSENT_SIGNATURE_ATTESTATION_STATEMENT =
  "Declaro, bajo mi responsabilidad, que soy la persona a quien se realizará este estudio, que la firma incorporada en el documento me pertenece y expresa mi voluntad, y que esta aceptación constituye una firma electrónica vinculante del consentimiento informado.";
const CONSENT_EMAIL_SENDER_EMAIL = "dopazoh+admin@gmail.com";
const PUBLISHER_CONSENT_ERROR =
  "Discover publishers cannot access informed consents.";
const SUBMITTED_CONSENT_ERROR =
  "This consent has already been submitted. You can view the submitted file.";

const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
]);

type StoredConsent = {
  collectionKey: "2pq-informed-consent";
  institutionId: string;
  doctorId: string;
  patientId: string;
  caseId: string | null;
  studyRequestFormId?: string;
  reviewStatus?: "needs_review" | "ready";
  uploadedAt?: string;
  reviewedAt?: string;
  reviewedByEmail?: string;
  file: InformedConsentFile;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
};

type ConsentWrite = StoredConsent & {
  signatureAttestation?: {
    accepted: true;
    acceptedAt: FieldValue;
    patientId: string;
    submittedByEmail: string;
    submittedByUid: string;
    submittedByRole: AdminContext["role"];
    surface: "patient_portal" | "backoffice";
    statementVersion: string;
    statement: string;
  };
};

type InformedConsentDraftMutation = InformedConsentDraftState & {
  expectedRevision: number | null;
};

const GUIDED_DRAFT_STEPS = new Set([
  "method",
  "download",
  "data",
  "signature",
  "editor",
  "preview",
]);
const DIRECT_DRAFT_STEPS = new Set([
  "method",
  "direct-download",
  "direct-sign",
  "direct-upload",
]);
const DEFAULT_PARTNER_PLACEMENT = { x: 0.72, y: 0.64, width: 0.16 };

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalDocumentId(value: unknown) {
  const id = optionalString(value);
  if (id && (id.length > 200 || id.includes("/") || id === "." || id === "..")) {
    throw new AdminRepositoryError("Invalid document identifier.", 400);
  }
  return id;
}

function requestConsentId(studyRequestFormId: string) {
  return `CONS-REQUEST-${createHash("sha256").update(studyRequestFormId).digest("hex")}`;
}

function consentDraftId(uid: string, studyRequestFormId?: string) {
  if (!studyRequestFormId) return uid;
  return createHash("sha256").update(JSON.stringify([uid, studyRequestFormId])).digest("hex");
}

function informedConsentDraftIdentity(context: AdminContext) {
  assertCanUseInformedConsents(context);
  const uid = optionalString(context.uid);
  const patientId = optionalString(context.patientId);
  if (context.role !== "patient" || !uid || !patientId) {
    throw new AdminRepositoryError(
      "Only linked patient accounts can manage consent drafts.",
      403,
    );
  }
  return { uid, patientId };
}

function normalizeDraftPlacement(
  value: unknown,
  label: string,
): InformedConsentDraftState["patientPlacement"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError(`${label} is invalid.`, 400);
  }
  const placement = value as Record<string, unknown>;
  const x = placement.x;
  const y = placement.y;
  const width = placement.width;
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    x < 0 ||
    x > 1 ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    y < 0 ||
    y > 1 ||
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width < 0.08 ||
    width > 0.5
  ) {
    throw new AdminRepositoryError(`${label} is invalid.`, 400);
  }
  return { x, y, width };
}

function normalizeDraftText(value: unknown, maximum: number, label: string) {
  if (typeof value !== "string" || value.length > maximum) {
    throw new AdminRepositoryError(`${label} is invalid.`, 400);
  }
  return value;
}

function normalizeDraftSignature(value: unknown, label: string): string | null {
  if (value === null) return null;
  try {
    return validateSavedSignatureDataUrl(value);
  } catch {
    throw new AdminRepositoryError(`${label} is invalid.`, 400);
  }
}

function normalizeInformedConsentDraftState(
  value: InformedConsentDraftState,
): InformedConsentDraftState {
  const mode = value.mode;
  if (mode !== "guided" && mode !== "direct") {
    throw new AdminRepositoryError("Consent draft mode is invalid.", 400);
  }
  if (value.schemaVersion !== 1) {
    throw new AdminRepositoryError("Consent draft schema is invalid.", 400);
  }
  if (typeof value.hasPartner !== "boolean") {
    throw new AdminRepositoryError(
      "Consent draft partner state is invalid.",
      400,
    );
  }
  if (value.selectedRole !== "patient" && value.selectedRole !== "partner") {
    throw new AdminRepositoryError(
      "Consent draft selected role is invalid.",
      400,
    );
  }

  const allowedSteps =
    mode === "guided" ? GUIDED_DRAFT_STEPS : DIRECT_DRAFT_STEPS;
  if (!allowedSteps.has(value.activeStepId)) {
    throw new AdminRepositoryError(
      "Consent draft step does not match its mode.",
      400,
    );
  }
  if (!Array.isArray(value.visitedStepIds)) {
    throw new AdminRepositoryError(
      "Consent draft visited steps are invalid.",
      400,
    );
  }
  const visitedStepIds = [...new Set(value.visitedStepIds)];
  if (
    visitedStepIds.length < 1 ||
    visitedStepIds.length > allowedSteps.size ||
    visitedStepIds.length !== value.visitedStepIds.length ||
    visitedStepIds.some((step) => !allowedSteps.has(step)) ||
    !visitedStepIds.includes(value.activeStepId)
  ) {
    throw new AdminRepositoryError(
      "Consent draft visited steps are invalid.",
      400,
    );
  }

  const signatureMethods = new Set(["draw", "import", "saved"]);
  const patientSignatureMethod = value.patientSignatureMethod;
  const partnerSignatureMethod = value.partnerSignatureMethod;
  if (
    patientSignatureMethod !== null &&
    !signatureMethods.has(patientSignatureMethod)
  ) {
    throw new AdminRepositoryError("Patient signature method is invalid.", 400);
  }
  if (
    partnerSignatureMethod !== null &&
    !signatureMethods.has(partnerSignatureMethod)
  ) {
    throw new AdminRepositoryError("Partner signature method is invalid.", 400);
  }

  const patientSignatureDataUrl = normalizeDraftSignature(
    value.patientSignatureDataUrl,
    "Patient draft signature",
  );
  const suppliedPartnerSignatureDataUrl = normalizeDraftSignature(
    value.partnerSignatureDataUrl,
    "Partner draft signature",
  );
  const partnerSignatureDataUrl = value.hasPartner
    ? suppliedPartnerSignatureDataUrl
    : null;
  if (patientSignatureDataUrl && !patientSignatureMethod) {
    throw new AdminRepositoryError(
      "Patient draft signature requires a signature method.",
      400,
    );
  }
  if (partnerSignatureDataUrl && !partnerSignatureMethod) {
    throw new AdminRepositoryError(
      "Partner draft signature requires a signature method.",
      400,
    );
  }

  return {
    schemaVersion: 1,
    mode,
    activeStepId: value.activeStepId,
    visitedStepIds,
    patientName: normalizeDraftText(value.patientName, 200, "Patient name"),
    patientDocument: normalizeDraftText(
      value.patientDocument,
      100,
      "Patient document",
    ),
    signatureDate: normalizeDraftText(
      value.signatureDate,
      10,
      "Signature date",
    ),
    hasPartner: value.hasPartner === true,
    partnerName: value.hasPartner
      ? normalizeDraftText(value.partnerName, 200, "Partner name")
      : "",
    patientSignatureDataUrl,
    partnerSignatureDataUrl,
    patientSignatureMethod,
    partnerSignatureMethod: value.hasPartner ? partnerSignatureMethod : null,
    patientPlacement: normalizeDraftPlacement(
      value.patientPlacement,
      "Patient signature placement",
    ),
    partnerPlacement: value.hasPartner
      ? normalizeDraftPlacement(
          value.partnerPlacement,
          "Partner signature placement",
        )
      : DEFAULT_PARTNER_PLACEMENT,
    selectedRole:
      value.hasPartner && value.selectedRole === "partner"
        ? "partner"
        : "patient",
  };
}

function parseStoredInformedConsentDraft(
  id: string,
  data: Record<string, unknown>,
): InformedConsentDraftRecord {
  const revision = data.revision;
  const patientId = optionalString(data.patientId);
  const createdAt = optionalString(data.createdAt);
  const updatedAt = optionalString(data.updatedAt);
  const createdByEmail = optionalString(data.createdByEmail);
  const createdByUid = optionalString(data.createdByUid);
  const updatedByEmail = optionalString(data.updatedByEmail);
  const updatedByUid = optionalString(data.updatedByUid);
  if (
    data.collectionKey !== CONSENT_DRAFTS_COLLECTION ||
    !Number.isSafeInteger(revision) ||
    Number(revision) < 1 ||
    !patientId ||
    !createdAt ||
    !updatedAt ||
    !createdByEmail ||
    !createdByUid ||
    !updatedByEmail ||
    !updatedByUid
  ) {
    throw new AdminRepositoryError("Consent draft data is invalid.", 500);
  }

  try {
    return {
      id,
      collectionKey: CONSENT_DRAFTS_COLLECTION,
      revision: Number(revision),
      patientId,
      ...(typeof data.studyRequestFormId === "string"
        ? { studyRequestFormId: data.studyRequestFormId }
        : {}),
      ...normalizeInformedConsentDraftState(
        data as unknown as InformedConsentDraftState,
      ),
      createdAt,
      updatedAt,
      createdByEmail,
      createdByUid,
      updatedByEmail,
      updatedByUid,
    };
  } catch (error) {
    if (error instanceof AdminRepositoryError && error.statusCode === 400) {
      throw new AdminRepositoryError("Consent draft data is invalid.", 500);
    }
    throw error;
  }
}

function parseStoredInformedConsentDraftSummary(
  data: Record<string, unknown>,
): InformedConsentDraftSummary & { patientId: string } {
  const patientId = optionalString(data.patientId);
  const updatedAt = optionalString(data.updatedAt);
  const revision = data.revision;
  const mode = data.mode;
  const activeStepId = data.activeStepId;
  if (mode !== "guided" && mode !== "direct") {
    throw new AdminRepositoryError("Consent draft data is invalid.", 500);
  }
  const allowedSteps =
    mode === "guided" ? GUIDED_DRAFT_STEPS : DIRECT_DRAFT_STEPS;
  if (
    !patientId ||
    !updatedAt ||
    !Number.isSafeInteger(revision) ||
    Number(revision) < 1 ||
    typeof activeStepId !== "string" ||
    !allowedSteps.has(activeStepId)
  ) {
    throw new AdminRepositoryError("Consent draft data is invalid.", 500);
  }

  return {
    patientId,
    mode,
    activeStepId: activeStepId as InformedConsentDraftSummary["activeStepId"],
    updatedAt,
    revision: Number(revision),
  };
}

function isMissingFirestoreIndexError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message =
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  return (
    code === 9 ||
    code === "failed-precondition" ||
    /requires an index|indexes\?create_composite/i.test(message)
  );
}

function toPatientRecord(
  id: string,
  data: Record<string, unknown>,
): PatientRecord {
  const now = new Date().toISOString();
  return {
    id,
    institutionId: optionalString(data.institutionId) ?? "",
    doctorId: optionalString(data.doctorId) ?? "",
    email: normalizeRoleEmail(optionalString(data.email) ?? ""),
    fullName: optionalString(data.fullName) ?? id,
    medicalRecordNumber: optionalString(data.medicalRecordNumber),
    birthDate: optionalString(data.birthDate),
    sex: optionalString(data.sex),
    status: data.status === "inactive" ? "inactive" : "active",
    notes: optionalString(data.notes),
    createdAt: optionalString(data.createdAt) ?? now,
    updatedAt: optionalString(data.updatedAt) ?? now,
  };
}

function revalidateGuidedSignaturePatient(
  context: AdminContext,
  expectedPatient: PatientRecord,
  snapshot: {
    exists: boolean;
    id: string;
    data: () => DocumentData | undefined;
  },
) {
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }

  const currentPatient = toPatientRecord(
    snapshot.id,
    (snapshot.data() ?? {}) as Record<string, unknown>,
  );
  if (!canAccessInformedConsentPatient(context, currentPatient)) {
    throw new AdminRepositoryError(
      "You cannot upload consent files for this patient.",
      403,
    );
  }
  if (
    currentPatient.id !== expectedPatient.id ||
    currentPatient.email !== expectedPatient.email ||
    currentPatient.institutionId !== expectedPatient.institutionId ||
    currentPatient.doctorId !== expectedPatient.doctorId ||
    currentPatient.status !== expectedPatient.status
  ) {
    throw new AdminRepositoryError(
      "The patient identity or assignment changed while the consent was being saved.",
      409,
    );
  }

  return currentPatient;
}

async function getPatient(patientId: string) {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .get();
  return snapshot.exists
    ? toPatientRecord(snapshot.id, snapshot.data() as Record<string, unknown>)
    : null;
}

function assertCanUseInformedConsents(context: AdminContext) {
  if (
    context.role === "organization_publisher" ||
    context.role === "individual_publisher"
  ) {
    throw new AdminRepositoryError(PUBLISHER_CONSENT_ERROR, 403);
  }
}

function isInstitutionManagerRole(role: AdminContext["role"]) {
  return (
    role === "institution_admin" ||
    role === "institution_operator" ||
    role === "institution_laboratory_staff"
  );
}

function assertCanManageConsentTraceability(context: AdminContext) {
  assertCanUseInformedConsents(context);
  if (!context.canAccessBackoffice || context.role === "patient") {
    throw new AdminRepositoryError(
      "Only backoffice users can manage consent traceability.",
      403,
    );
  }
}

function canWriteTraceabilityEntity(
  context: AdminContext,
  entity: { institutionId: string; doctorId: string },
) {
  if (isGlobalAdminRole(context.role)) return true;
  if (isInstitutionManagerRole(context.role)) {
    return context.institutionId === entity.institutionId;
  }
  return (
    context.role === "institution_doctor" &&
    context.institutionId === entity.institutionId &&
    context.doctorId === entity.doctorId
  );
}

type StudyRequestForConsent = StudyRequestConsentScope & {
  id: string;
  consentId: string | null;
  caseId: string | null;
  archived: boolean;
  biopsyClaimed: boolean;
  createdAt?: string;
  institutionName?: string;
};

function parseStudyRequestForConsent(
  id: string,
  data: DocumentData | undefined,
): StudyRequestForConsent | null {
  if (data?.formType !== "study_request") return null;
  const patientId = optionalString(data.selectedPatientId) ??
    optionalString(data.patientInformation?.patientId);
  const doctorId = optionalString(data.doctorId);
  const institutionId = optionalString(data.institutionId);
  if (!patientId || !doctorId || !institutionId) return null;
  return {
    id,
    patientId,
    doctorId,
    institutionId,
    consentId: optionalString(data.informedConsentId) ?? null,
    caseId: optionalString(data["2pq_case"]) ?? null,
    archived: Boolean(optionalString(data.archivedAt)),
    biopsyClaimed: Boolean(optionalString(data.linkedBiopsyForm)),
    createdAt: optionalString(data.createdAt),
    institutionName: optionalString(data.institutionName),
  };
}

function canReadStudyRequestConsent(context: AdminContext, scope: StudyRequestConsentScope) {
  return context.role === "patient"
    ? context.patientId === scope.patientId
    : context.canAccessBackoffice && canWriteTraceabilityEntity(context, scope);
}

function requireStudyRequestForConsent(
  context: AdminContext,
  id: string,
  data: DocumentData | undefined,
) {
  const request = parseStudyRequestForConsent(id, data);
  if (!request) {
    throw new AdminRepositoryError("Study request not found.", 404);
  }
  if (!canReadStudyRequestConsent(context, request)) {
    throw new AdminRepositoryError("You cannot access consent for this study request.", 403);
  }
  return request;
}

function assertPatientMatchesStudyRequest(
  patient: PatientRecord | null,
  request: StudyRequestForConsent,
): asserts patient is PatientRecord {
  if (
    !patient ||
    patient.id !== request.patientId ||
    patient.institutionId !== request.institutionId ||
    patient.doctorId !== request.doctorId
  ) {
    throw new AdminRepositoryError("The patient assignment does not match this study request.", 409);
  }
}

function canChangeStudyRequestConsent(request: StudyRequestForConsent) {
  return !request.archived && !request.biopsyClaimed;
}

function studyRequestReference(formId: string) {
  const id = optionalDocumentId(formId);
  if (!id) throw new AdminRepositoryError("Select a study request.", 400);
  return adminDb.collection(STUDY_REQUESTS_COLLECTION).doc(id);
}

async function getStudyRequestForConsent(context: AdminContext, formId: string) {
  assertCanUseInformedConsents(context);
  const reference = studyRequestReference(formId);
  const snapshot = await reference.get();
  return requireStudyRequestForConsent(context, reference.id, snapshot.data());
}

type StudyRequestConsentSummary = {
  id: string | null;
  status: StudyRequestConsentStatus;
  uploadedAt?: string;
  reviewedAt?: string;
};

async function projectStudyRequestConsent(
  context: AdminContext,
  request: StudyRequestForConsent,
) {
  const [patient, doctorSnapshot, institutionSnapshot, consentSnapshots] = await Promise.all([
    getPatient(request.patientId),
    adminDb.collection(DOCTORS_COLLECTION).doc(request.doctorId).get(),
    adminDb.collection(INSTITUTIONS_COLLECTION).doc(request.institutionId).get(),
    request.consentId
      ? adminDb.getAll(adminDb.collection(CONSENTS_COLLECTION).doc(request.consentId), {
          fieldMask: ["studyRequestFormId", "patientId", "institutionId", "doctorId",
            "file.name", "file.type", "file.size", "reviewStatus", "uploadedAt",
            "reviewedAt", "reviewedByEmail"],
        })
      : [],
  ]);
  assertPatientMatchesStudyRequest(patient, request);
  const consentData = consentSnapshots[0]?.data();
  const status = getStudyRequestConsentStatus(consentData, request.id, request);
  const consent: StudyRequestConsentSummary = {
    id: status === "pending" ? null : request.consentId,
    status,
    ...(status !== "pending" ? {
      uploadedAt: optionalString(consentData?.uploadedAt),
      reviewedAt: optionalString(consentData?.reviewedAt),
    } : {}),
  };
  const canChange = canChangeStudyRequestConsent(request);
  const staff = context.role !== "patient";
  const doctor = doctorSnapshot.data();
  return {
    id: request.id,
    createdAt: request.createdAt,
    patientId: patient.id,
    patientName: patient.fullName,
    patientEmail: patient.email,
    patientBirthDate: patient.birthDate,
    institutionId: request.institutionId,
    institutionName: optionalString(institutionSnapshot.data()?.name) ??
      request.institutionName ?? request.institutionId,
    doctorId: request.doctorId,
    doctorName: optionalString(doctor?.fullName),
    doctorLicenseNumber: optionalString(doctor?.licenseNumber),
    consent,
    canUpload: canChange && (staff ? status !== "ready" : !request.consentId),
    canApprove: staff && canChange && status === "needs_review" && Boolean(consent.uploadedAt),
    canResend: staff && canChange && status !== "ready" && Boolean(patient.email),
  };
}

export async function getStudyRequestConsentForContext(context: AdminContext, formId: string) {
  return projectStudyRequestConsent(context, await getStudyRequestForConsent(context, formId));
}

export async function listStudyRequestConsentsForContext(
  context: AdminContext,
  options: { patientId?: string; cursor?: string; limit?: number } = {},
) {
  assertCanUseInformedConsents(context);
  let query: Query<DocumentData> = adminDb.collection(STUDY_REQUESTS_COLLECTION);
  const requestedPatientId = optionalDocumentId(options.patientId);
  if (context.role === "patient") {
    if (!context.patientId || (requestedPatientId && requestedPatientId !== context.patientId)) {
      throw new AdminRepositoryError("You cannot view another patient's study requests.", 403);
    }
    query = query.where("selectedPatientId", "==", context.patientId);
  } else {
    assertCanManageConsentTraceability(context);
    if (requestedPatientId) {
      const patient = await getPatient(requestedPatientId);
      if (!patient || !canWriteTraceabilityEntity(context, patient)) {
        throw new AdminRepositoryError("You cannot view this patient's study requests.", 403);
      }
      query = query.where("selectedPatientId", "==", requestedPatientId);
    } else if (!isGlobalAdminRole(context.role)) {
      if (context.role === "institution_doctor" && context.doctorId) {
        query = query.where("doctorId", "==", context.doctorId);
      } else if (isInstitutionManagerRole(context.role) && context.institutionId) {
        query = query.where("institutionId", "==", context.institutionId);
      } else {
        throw new AdminRepositoryError("This account cannot view study requests.", 403);
      }
    } else {
      query = query.where("formType", "==", "study_request");
    }
  }

  // The indexed equality above scopes the scan. Filter document kind and
  // archived status within one bounded page to avoid new composite indexes.
  const limit = Math.max(1, Math.min(options.limit ?? CONSENTS_PAGE_SIZE, CONSENTS_PAGE_SIZE));
  const cursor = optionalDocumentId(options.cursor);
  query = query.orderBy(FieldPath.documentId(), "asc");
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.limit(limit + 1).get();
  const page = snapshot.docs.slice(0, limit);
  const requests = await Promise.all(page.flatMap((document) => {
    const request = parseStudyRequestForConsent(document.id, document.data());
    if (!request || request.archived || !canReadStudyRequestConsent(context, request)) return [];
    return [projectStudyRequestConsent(context, request).catch((error) => {
      // Historical requests can retain an old or deleted patient assignment.
      if (error instanceof AdminRepositoryError && error.statusCode === 409) return null;
      throw error;
    })];
  }));
  return {
    requests: requests.filter((request) => request !== null),
    nextCursor: snapshot.docs.length > limit ? page.at(-1)?.id : undefined,
  };
}

function consentQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(CONSENTS_COLLECTION);

  if (context.role === "patient") {
    if (!context.patientId) {
      throw new AdminRepositoryError(
        "This patient account is not linked to a patient record.",
        403,
      );
    }
    query = query.where("patientId", "==", context.patientId);
  } else if (!isGlobalAdminRole(context.role)) {
    if (!context.institutionId) {
      throw new AdminRepositoryError(
        "This account is not linked to an institution.",
        403,
      );
    }
    query = query.where("institutionId", "==", context.institutionId);
  }

  if (context.role === "institution_doctor" && !context.doctorId) {
    throw new AdminRepositoryError(
      "This doctor account is not linked to a doctor record.",
      403,
    );
  }

  return query.orderBy(FieldPath.documentId(), "desc");
}

function consentFallbackQueryForContext(
  context: AdminContext,
): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(CONSENTS_COLLECTION);

  if (context.role === "patient") {
    query = query.where("patientId", "==", context.patientId);
  } else if (!isGlobalAdminRole(context.role)) {
    query = query.where("institutionId", "==", context.institutionId);
  }

  return query;
}

function patientQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PATIENTS_COLLECTION);

  if (!isGlobalAdminRole(context.role)) {
    if (!context.institutionId) {
      throw new AdminRepositoryError(
        "This account is not linked to an institution.",
        403,
      );
    }
    query = query.where("institutionId", "==", context.institutionId);
  }

  if (context.role === "institution_doctor" && !context.doctorId) {
    throw new AdminRepositoryError(
      "This doctor account is not linked to a doctor record.",
      403,
    );
  }

  return query.orderBy(FieldPath.documentId(), "asc");
}

function patientFallbackQueryForContext(
  context: AdminContext,
): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PATIENTS_COLLECTION);

  if (!isGlobalAdminRole(context.role)) {
    query = query.where("institutionId", "==", context.institutionId);
  }

  return query;
}

function caseQueryForPatient(patientId: string): Query<DocumentData> {
  return adminDb
    .collection(CASES_COLLECTION)
    .where("patientId", "==", patientId)
    .orderBy(FieldPath.documentId(), "asc");
}

function caseFallbackQueryForPatient(patientId: string): Query<DocumentData> {
  return adminDb
    .collection(CASES_COLLECTION)
    .where("patientId", "==", patientId);
}

async function getPageWithIndexFallback(
  collectionName: string,
  orderedQuery: Query<DocumentData>,
  fallbackQuery: Query<DocumentData>,
  cursor?: string,
) {
  let query = orderedQuery;
  if (cursor) {
    query = query.startAfter(cursor);
  }

  try {
    return await query.limit(CONSENTS_PAGE_SIZE + 1).get();
  } catch (error) {
    if (!isMissingFirestoreIndexError(error)) {
      throw error;
    }

    let fallback = fallbackQuery;
    if (cursor) {
      const cursorSnapshot = await adminDb
        .collection(collectionName)
        .doc(cursor)
        .get();
      if (cursorSnapshot.exists) {
        fallback = fallback.startAfter(cursorSnapshot);
      }
    }
    return fallback.limit(CONSENTS_PAGE_SIZE + 1).get();
  }
}

function parseStoredFile(value: unknown): InformedConsentFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError("Consent file data is invalid.", 500);
  }
  const data = value as Record<string, unknown>;
  const name = optionalString(data.name);
  const type = optionalString(data.type);
  const content = optionalString(data.content);
  const size = typeof data.size === "number" ? data.size : Number(data.size);
  if (!name || !type || !content || !Number.isSafeInteger(size) || size < 1) {
    throw new AdminRepositoryError("Consent file data is invalid.", 500);
  }
  return { name, type, size, content };
}

function parseStoredConsent(data: Record<string, unknown>): StoredConsent {
  const institutionId = optionalString(data.institutionId);
  const doctorId = optionalString(data.doctorId);
  const patientId = optionalString(data.patientId);
  const createdAt = optionalString(data.createdAt);
  const updatedAt = optionalString(data.updatedAt);
  const createdByEmail = optionalString(data.createdByEmail);
  if (
    !institutionId ||
    !doctorId ||
    !patientId ||
    !createdAt ||
    !updatedAt ||
    !createdByEmail
  ) {
    throw new AdminRepositoryError("Consent record data is invalid.", 500);
  }
  return {
    collectionKey: "2pq-informed-consent",
    institutionId,
    doctorId,
    patientId,
    caseId: optionalString(data.caseId) ?? null,
    ...storedConsentRequestFields(data),
    file: parseStoredFile(data.file),
    createdAt,
    updatedAt,
    createdByEmail,
  };
}

function storedConsentRequestFields(data: Record<string, unknown>) {
  const studyRequestFormId = optionalString(data.studyRequestFormId);
  if (!studyRequestFormId) return {};
  const reviewStatus = data.reviewStatus === "ready" ? "ready" as const : "needs_review" as const;
  const uploadedAt = optionalString(data.uploadedAt);
  const reviewedAt = optionalString(data.reviewedAt);
  const reviewedByEmail = optionalString(data.reviewedByEmail);
  return {
    studyRequestFormId,
    reviewStatus,
    ...(uploadedAt ? { uploadedAt } : {}),
    ...(reviewedAt ? { reviewedAt } : {}),
    ...(reviewedByEmail ? { reviewedByEmail } : {}),
  };
}

function toConsentRecord(
  id: string,
  consent: StoredConsent,
  patientName: string,
): InformedConsentRecord {
  return {
    id,
    collectionKey: "2pq-informed-consent",
    institutionId: consent.institutionId,
    doctorId: consent.doctorId,
    patientId: consent.patientId,
    patientName,
    caseId: consent.caseId,
    ...storedConsentRequestFields(consent),
    file: {
      name: consent.file.name,
      type: consent.file.type,
      size: consent.file.size,
    },
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt,
    createdByEmail: consent.createdByEmail,
  };
}

function validateFile(file: InformedConsentFile): InformedConsentFile {
  const name = file.name.trim();
  const type = file.type.trim().toLowerCase();
  if (!name || name.length > 255) {
    throw new AdminRepositoryError("Use a valid file name.", 400);
  }
  if (!ALLOWED_FILE_TYPES.has(type)) {
    throw new AdminRepositoryError(
      "Consent files must be a PDF or supported image.",
      400,
    );
  }

  const match = file.content.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1]?.toLowerCase() !== type) {
    throw new AdminRepositoryError("Consent file content is invalid.", 400);
  }
  const bytes = Buffer.from(match[2] ?? "", "base64");
  if (
    bytes.length < 1 ||
    bytes.length > INFORMED_CONSENT_FILE_MAX_BYTES ||
    bytes.length !== file.size
  ) {
    throw new AdminRepositoryError(
      "Consent file size is invalid or exceeds 750 KB.",
      400,
    );
  }

  return { name, type, size: bytes.length, content: file.content };
}

async function nextConsentId() {
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb
      .collection(SEQUENCES_COLLECTION)
      .doc(CONSENTS_COLLECTION);
    const snapshot = await transaction.get(reference);
    const next = Number(snapshot.data()?.current ?? 0) + 1;
    transaction.set(
      reference,
      { current: next, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return `CONS-${String(next).padStart(5, "0")}`;
  });
}

export async function listInformedConsentsForContext(
  context: AdminContext,
  cursor?: string,
) {
  assertCanUseInformedConsents(context);

  const snapshot = await getPageWithIndexFallback(
    CONSENTS_COLLECTION,
    consentQueryForContext(context),
    consentFallbackQueryForContext(context),
    cursor,
  );
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const parsed = pageDocs
    .map((doc) => ({
      id: doc.id,
      consent: parseStoredConsent(doc.data() as Record<string, unknown>),
    }))
    .filter(({ consent }) =>
      canAccessInformedConsentPatient(context, {
        id: consent.patientId,
        institutionId: consent.institutionId,
        doctorId: consent.doctorId,
      }),
    );
  const patients = await Promise.all(
    [...new Set(parsed.map(({ consent }) => consent.patientId))].map(
      getPatient,
    ),
  );
  const patientNameById = new Map(
    patients
      .filter((patient): patient is PatientRecord => Boolean(patient))
      .map((patient) => [patient.id, patient.fullName]),
  );

  return {
    records: parsed.map(({ id, consent }) =>
      toConsentRecord(
        id,
        consent,
        patientNameById.get(consent.patientId) ?? consent.patientId,
      ),
    ),
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function listInformedConsentPatientsForContext(
  context: AdminContext,
  cursor?: string,
): Promise<{
  patients: InformedConsentPatientOption[];
  nextCursor?: string;
}> {
  assertCanUseInformedConsents(context);

  if (context.role === "patient") {
    const patient = context.patientId
      ? await getPatient(context.patientId)
      : null;
    return {
      patients: patient
        ? [{ id: patient.id, fullName: patient.fullName, email: patient.email }]
        : [],
    };
  }

  const snapshot = await getPageWithIndexFallback(
    PATIENTS_COLLECTION,
    patientQueryForContext(context),
    patientFallbackQueryForContext(context),
    cursor,
  );
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const patients = pageDocs
    .map((doc) =>
      toPatientRecord(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((patient) => canAccessInformedConsentPatient(context, patient));
  return {
    patients: patients.map((patient) => ({
      id: patient.id,
      fullName: patient.fullName,
      email: patient.email,
    })),
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function getSavedInformedConsentSignatureForContext(
  context: AdminContext,
  requestedPatientId?: string,
): Promise<InformedConsentSavedSignature> {
  assertCanUseInformedConsents(context);

  const normalizedRequestedPatientId = requestedPatientId?.trim();
  if (
    context.role === "patient" &&
    normalizedRequestedPatientId &&
    normalizedRequestedPatientId !== context.patientId
  ) {
    throw new AdminRepositoryError(
      "Patients can only access their own saved signature.",
      403,
    );
  }

  const patientId =
    context.role === "patient"
      ? context.patientId
      : normalizedRequestedPatientId;
  if (!patientId) {
    throw new AdminRepositoryError(
      context.role === "patient"
        ? "This patient account is not linked to a patient record."
        : "Select a patient.",
      context.role === "patient" ? 403 : 400,
    );
  }

  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }

  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  const patient = toPatientRecord(snapshot.id, data);
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot access this patient's saved signature.",
      403,
    );
  }

  return { savedSignature: readSavedSignatureDataUrl(data.saved_signature) };
}

export async function getInformedConsentDraftForContext(
  context: AdminContext,
  studyRequestFormId?: string,
): Promise<InformedConsentDraftRecord | null> {
  const { uid, patientId } = informedConsentDraftIdentity(context);
  const request = studyRequestFormId
    ? await getStudyRequestForConsent(context, studyRequestFormId)
    : undefined;
  if (request?.consentId) return null;
  const draftId = consentDraftId(uid, request?.id);
  const snapshot = await adminDb
    .collection(CONSENT_DRAFTS_COLLECTION)
    .doc(draftId)
    .get();
  if (!snapshot.exists) return null;

  const draft = parseStoredInformedConsentDraft(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  if (
    draft.patientId !== patientId || draft.id !== draftId ||
    (request && draft.createdByUid !== uid) || draft.studyRequestFormId !== request?.id
  ) {
    throw new AdminRepositoryError("Consent draft owner data is invalid.", 500);
  }
  return draft;
}

export async function getInformedConsentDraftStatusForContext(
  context: AdminContext,
  studyRequestFormId?: string,
): Promise<InformedConsentDraftSummary | null> {
  const { uid, patientId } = informedConsentDraftIdentity(context);
  const request = studyRequestFormId
    ? await getStudyRequestForConsent(context, studyRequestFormId)
    : undefined;
  if (request?.consentId) return null;
  const draftId = consentDraftId(uid, request?.id);
  const snapshot = await adminDb
    .collection(CONSENT_DRAFTS_COLLECTION)
    .where(FieldPath.documentId(), "==", draftId)
    .select(
      "patientId", "mode", "activeStepId", "updatedAt", "revision",
      ...(request ? ["studyRequestFormId"] : []),
    )
    .limit(1)
    .get();
  const draftDocument = snapshot.docs[0];
  if (!draftDocument) return null;

  const draft = parseStoredInformedConsentDraftSummary(
    draftDocument.data() as Record<string, unknown>,
  );
  if (
    draftDocument.id !== draftId || draft.patientId !== patientId ||
    optionalString(draftDocument.data().studyRequestFormId) !== request?.id
  ) {
    throw new AdminRepositoryError("Consent draft owner data is invalid.", 500);
  }
  return {
    mode: draft.mode,
    activeStepId: draft.activeStepId,
    updatedAt: draft.updatedAt,
    revision: draft.revision,
  };
}

export async function getInformedConsentHomeStatusForContext(
  context: AdminContext,
): Promise<InformedConsentHomeStatus> {
  const { patientId } = informedConsentDraftIdentity(context);
  const [draft, consentSnapshot] = await Promise.all([
    getInformedConsentDraftStatusForContext(context),
    Promise.resolve().then(() =>
      adminDb
        .collection(CONSENTS_COLLECTION)
        .where("patientId", "==", patientId)
        .select("patientId")
        .limit(1)
        .get(),
    ),
  ]);

  return {
    hasDraft: draft !== null,
    hasSignedConsent: consentSnapshot.docs.length > 0,
  };
}

export async function upsertInformedConsentDraftForContext(
  context: AdminContext,
  payload: InformedConsentDraftMutation,
  studyRequestFormId?: string,
): Promise<InformedConsentDraftRecord> {
  const { uid, patientId } = informedConsentDraftIdentity(context);
  if (
    payload.expectedRevision !== null &&
    (!Number.isSafeInteger(payload.expectedRevision) ||
      payload.expectedRevision < 1)
  ) {
    throw new AdminRepositoryError(
      "Consent draft expected revision is invalid.",
      400,
    );
  }

  const state = normalizeInformedConsentDraftState(payload);
  const requestRef = studyRequestFormId ? studyRequestReference(studyRequestFormId) : null;
  const draftId = consentDraftId(uid, requestRef?.id);
  const reference = adminDb.collection(CONSENT_DRAFTS_COLLECTION).doc(draftId);
  return adminDb.runTransaction(async (transaction) => {
    if (requestRef) {
      const request = requireStudyRequestForConsent(
        context, requestRef.id, (await transaction.get(requestRef)).data(),
      );
      if (request.consentId) {
        throw new AdminRepositoryError(SUBMITTED_CONSENT_ERROR, 409);
      }
      if (!canChangeStudyRequestConsent(request)) {
        throw new AdminRepositoryError("Consent for this study request can no longer be changed.", 409);
      }
    }
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists
      ? parseStoredInformedConsentDraft(
          snapshot.id,
          snapshot.data() as Record<string, unknown>,
        )
      : null;
    if (current && (
      current.patientId !== patientId || (requestRef && current.createdByUid !== uid) ||
      current.studyRequestFormId !== requestRef?.id
    )) {
      throw new AdminRepositoryError(
        "Consent draft owner data is invalid.",
        500,
      );
    }
    if (
      (current === null && payload.expectedRevision !== null) ||
      (current !== null && payload.expectedRevision !== current.revision)
    ) {
      throw new AdminRepositoryError(
        "Consent draft changed. Reload it before saving again.",
        409,
      );
    }

    const now = new Date().toISOString();
    const email = normalizeRoleEmail(context.email);
    const document: InformedConsentDraftRecord = {
      id: draftId,
      collectionKey: CONSENT_DRAFTS_COLLECTION,
      revision: (current?.revision ?? 0) + 1,
      patientId,
      ...(requestRef ? { studyRequestFormId: requestRef.id } : {}),
      ...state,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      createdByEmail: current?.createdByEmail ?? email,
      createdByUid: current?.createdByUid ?? uid,
      updatedByEmail: email,
      updatedByUid: uid,
    };
    transaction.set(reference, document);
    return document;
  });
}

export async function listInformedConsentCasesForContext(
  context: AdminContext,
  patientId: string,
  cursor?: string,
) {
  assertCanManageConsentTraceability(context);
  const normalizedPatientId = patientId.trim();
  const patient = normalizedPatientId
    ? await getPatient(normalizedPatientId)
    : null;
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot view 2PQ cases for this patient.",
      403,
    );
  }

  const snapshot = await getPageWithIndexFallback(
    CASES_COLLECTION,
    caseQueryForPatient(patient.id),
    caseFallbackQueryForPatient(patient.id),
    cursor,
  );
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const cases = pageDocs
    .map((doc) =>
      toCaseOption(
        doc.id,
        doc.data() as Record<string, unknown>,
        patient.fullName,
      ),
    )
    .filter(
      (record) =>
        record.patientId === patient.id &&
        canWriteTraceabilityEntity(context, record),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    cases,
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function createInformedConsentForContext(
  context: AdminContext,
  payload: {
    patientId?: string;
    caseId?: string;
    studyRequestFormId?: string;
    flowMode?: "guided" | "direct";
    expectedDraftRevision?: number | null;
    signatureAttestationAccepted?: boolean;
    savedSignature?: string;
    file: InformedConsentFile;
  },
) {
  assertCanUseInformedConsents(context);

  const hasExpectedDraftRevision = Object.prototype.hasOwnProperty.call(
    payload,
    "expectedDraftRevision",
  );
  if (context.role === "patient" && !hasExpectedDraftRevision) {
    throw new AdminRepositoryError(
      "Patient consent uploads require a draft revision expectation.",
      400,
    );
  }
  if (hasExpectedDraftRevision && context.role !== "patient") {
    throw new AdminRepositoryError(
      "Only patient uploads may include a consent draft revision.",
      400,
    );
  }
  const expectedDraftRevision = payload.expectedDraftRevision;
  if (
    hasExpectedDraftRevision &&
    expectedDraftRevision !== null &&
    (typeof expectedDraftRevision !== "number" ||
      !Number.isSafeInteger(expectedDraftRevision) ||
      expectedDraftRevision < 1)
  ) {
    throw new AdminRepositoryError(
      "Consent draft expected revision is invalid.",
      400,
    );
  }

  if (payload.flowMode === "guided" && !payload.savedSignature) {
    throw new AdminRepositoryError(
      "Guided consent uploads require the patient's saved signature.",
      400,
    );
  }
  if (payload.flowMode !== "guided" && payload.savedSignature) {
    throw new AdminRepositoryError(
      "Only guided consent uploads may save a patient signature.",
      400,
    );
  }
  if (
    payload.signatureAttestationAccepted !== undefined &&
    (payload.signatureAttestationAccepted !== true ||
      payload.flowMode !== "guided")
  ) {
    throw new AdminRepositoryError(
      "Only guided consent uploads may include an accepted signature attestation.",
      400,
    );
  }

  let savedSignature: string | undefined;
  if (payload.savedSignature) {
    try {
      savedSignature = validateSavedSignatureDataUrl(payload.savedSignature);
    } catch (error) {
      throw new AdminRepositoryError(
        error instanceof Error
          ? error.message
          : "The saved signature is invalid.",
        400,
      );
    }
  }

  const requestedPatientId = optionalDocumentId(payload.patientId);
  const studyRequestFormId = optionalDocumentId(payload.studyRequestFormId);
  const caseId = optionalDocumentId(payload.caseId) ?? null;
  if (context.role === "patient" && caseId) {
    throw new AdminRepositoryError(
      "Patients cannot assign consent files to 2PQ cases.",
      403,
    );
  }
  if (studyRequestFormId && caseId) {
    throw new AdminRepositoryError(
      "The study request determines any case link for this consent.",
      400,
    );
  }
  const destinationId = studyRequestFormId ?? caseId;
  if (!destinationId) {
    throw new AdminRepositoryError("Select the study request for this consent.", 400);
  }
  const request = studyRequestFormId
    ? await getStudyRequestForConsent(context, studyRequestFormId)
    : null;
  const patientId =
    request?.patientId ?? (context.role === "patient" ? context.patientId : requestedPatientId);
  if (!patientId) {
    throw new AdminRepositoryError("Select a patient.", 400);
  }
  if (
    (context.role === "patient" || request) &&
    requestedPatientId &&
    requestedPatientId !== patientId
  ) {
    throw new AdminRepositoryError(
      "The selected patient does not match this consent upload.",
      403,
    );
  }

  const patient = await getPatient(patientId);
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot upload consent files for this patient.",
      403,
    );
  }

  if (request) assertPatientMatchesStudyRequest(patient, request);

  const file = validateFile(payload.file);
  const consentId = request ? requestConsentId(request.id) : await nextConsentId();
  const now = new Date().toISOString();
  const document: ConsentWrite = {
    collectionKey: "2pq-informed-consent",
    institutionId: patient.institutionId,
    doctorId: patient.doctorId,
    patientId: patient.id,
    caseId,
    file,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
    ...(payload.signatureAttestationAccepted
      ? {
          signatureAttestation: {
            accepted: true,
            acceptedAt: FieldValue.serverTimestamp(),
            patientId: patient.id,
            submittedByEmail: normalizeRoleEmail(context.email),
            submittedByUid: context.uid,
            submittedByRole: context.role,
            surface:
              context.role === "patient" ? "patient_portal" : "backoffice",
            statementVersion:
              INFORMED_CONSENT_SIGNATURE_ATTESTATION_STATEMENT_VERSION,
            statement: INFORMED_CONSENT_SIGNATURE_ATTESTATION_STATEMENT,
          },
        }
      : {}),
  };

  const consentRef = adminDb.collection(CONSENTS_COLLECTION).doc(consentId);
  const patientRef = adminDb.collection(PATIENTS_COLLECTION).doc(patient.id);
  if (request) {
    const requestRef = studyRequestReference(request.id);
    const patientDraftRef = context.role === "patient"
      ? adminDb.collection(CONSENT_DRAFTS_COLLECTION).doc(consentDraftId(context.uid, request.id))
      : null;
    const stored = await adminDb.runTransaction(async (transaction) => {
      const [requestSnapshot, patientSnapshot, currentSnapshot, draftSnapshot] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(patientRef),
        transaction.get(consentRef),
        patientDraftRef ? transaction.get(patientDraftRef) : null,
      ]);
      const currentRequest = requireStudyRequestForConsent(context, request.id, requestSnapshot.data());
      const currentPatient = revalidateGuidedSignaturePatient(context, patient, patientSnapshot);
      assertPatientMatchesStudyRequest(currentPatient, currentRequest);
      if (context.role === "patient" && (currentRequest.consentId || currentSnapshot.exists)) {
        throw new AdminRepositoryError(SUBMITTED_CONSENT_ERROR, 409);
      }
      if (!canChangeStudyRequestConsent(currentRequest)) {
        throw new AdminRepositoryError("Consent for this study request can no longer be changed.", 409);
      }
      if (currentRequest.consentId && currentRequest.consentId !== consentId) {
        throw new AdminRepositoryError("This study request already has a different informed consent.", 409);
      }
      const previous = currentSnapshot.data();
      const previousStatus = getStudyRequestConsentStatus(previous, request.id, currentRequest);
      if (currentSnapshot.exists && previousStatus !== "needs_review") {
        throw new AdminRepositoryError("The existing consent cannot be replaced.", 409);
      }
      if (draftSnapshot) {
        const draft = draftSnapshot.exists
          ? parseStoredInformedConsentDraft(draftSnapshot.id, draftSnapshot.data()!)
          : null;
        if (draft && (
          draft.createdByUid !== context.uid || draft.patientId !== patient.id ||
          draft.studyRequestFormId !== request.id
        )) {
          throw new AdminRepositoryError("Consent draft owner data is invalid.", 500);
        }
        if ((draft?.revision ?? null) !== expectedDraftRevision) {
          throw new AdminRepositoryError("Consent draft changed. Reload it before submitting again.", 409);
        }
      }
      const linkedCaseRef = currentRequest.caseId
        ? adminDb.collection(CASES_COLLECTION).doc(currentRequest.caseId)
        : null;
      const linkedCase = linkedCaseRef ? (await transaction.get(linkedCaseRef)).data() : undefined;
      const matchesCase = linkedCase?.linkedStudyRequestFormId === request.id &&
        linkedCase.patientId === currentRequest.patientId &&
        linkedCase.institutionId === currentRequest.institutionId &&
        linkedCase.doctorId === currentRequest.doctorId;
      if (matchesCase && linkedCase.informedConsentId && linkedCase.informedConsentId !== consentId) {
        throw new AdminRepositoryError("The linked case already has a different informed consent.", 409);
      }
      const lastUpload = Date.parse(optionalString(previous?.uploadedAt) ?? "");
      const uploadedAt = new Date(Math.max(
        Date.parse(now),
        Number.isFinite(lastUpload) ? lastUpload + 1 : 0,
      )).toISOString();
      const stored: ConsentWrite = {
        ...document,
        studyRequestFormId: request.id,
        caseId: matchesCase ? linkedCaseRef!.id : null,
        reviewStatus: "needs_review",
        uploadedAt,
        createdAt: optionalString(previous?.createdAt) ?? now,
        createdByEmail: optionalString(previous?.createdByEmail) ?? context.email,
      };
      transaction.set(consentRef, stored);
      transaction.set(requestRef, { informedConsentId: consentId }, { merge: true });
      if (matchesCase && linkedCaseRef) {
        transaction.set(linkedCaseRef, { informedConsentId: consentId }, { merge: true });
      }
      if (savedSignature) {
        transaction.set(patientRef, { saved_signature: savedSignature, updatedAt: now }, { merge: true });
      }
      if (patientDraftRef) transaction.delete(patientDraftRef);
      return stored;
    });
    return toConsentRecord(consentId, stored, patient.fullName);
  }

  assertCanManageConsentTraceability(context);
  const caseRef = adminDb.collection(CASES_COLLECTION).doc(destinationId);
  await adminDb.runTransaction(async (transaction) => {
    const patientSnapshot = savedSignature
      ? await transaction.get(patientRef)
      : null;
    const caseSnapshot = await transaction.get(caseRef);
    if (patientSnapshot) {
      revalidateGuidedSignaturePatient(context, patient, patientSnapshot);
    }
    if (!caseSnapshot.exists) {
      throw new AdminRepositoryError("2PQ case not found.", 404);
    }
    if (optionalString(caseSnapshot.data()?.linkedStudyRequestFormId)) {
      throw new AdminRepositoryError(
        "This case gets its consent through the linked study request.",
        409,
      );
    }
    const targetCase = toCaseOption(
      destinationId,
      caseSnapshot.data() as Record<string, unknown>,
      patient.fullName,
    );
    if (!canWriteTraceabilityEntity(context, targetCase)) {
      throw new AdminRepositoryError("You cannot assign this 2PQ case.", 403);
    }
    if (
      targetCase.patientId !== patient.id ||
      targetCase.institutionId !== patient.institutionId ||
      targetCase.doctorId !== patient.doctorId
    ) {
      throw new AdminRepositoryError(
        "Consent and 2PQ case must belong to the same patient, institution, and doctor.",
        409,
      );
    }

    const displacedConsentRef = targetCase.informedConsentId
      ? adminDb
          .collection(CONSENTS_COLLECTION)
          .doc(targetCase.informedConsentId)
      : null;
    const displacedConsentSnapshot = displacedConsentRef
      ? await transaction.get(displacedConsentRef)
      : null;

    if (displacedConsentRef && displacedConsentSnapshot?.exists) {
      const displacedConsent = parseStoredConsent(
        displacedConsentSnapshot.data() as Record<string, unknown>,
      );
      if (displacedConsent.studyRequestFormId) {
        throw new AdminRepositoryError("Manage consent through the linked study request.", 409);
      }
      if (displacedConsent.caseId === destinationId) {
        transaction.set(
          displacedConsentRef,
          { caseId: null, updatedAt: now },
          { merge: true },
        );
      }
    }

    transaction.set(consentRef, document);
    if (savedSignature) {
      transaction.set(
        patientRef,
        { saved_signature: savedSignature, updatedAt: now },
        { merge: true },
      );
    }
    transaction.set(
      caseRef,
      {
        informedConsentId: consentId,
        updatedAt: now,
        last_updated_date: now,
        updatedByEmail: context.email,
      },
      { merge: true },
    );
  });
  return toConsentRecord(consentId, document, patient.fullName);
}

function toCaseOption(
  id: string,
  data: Record<string, unknown>,
  patientName: string,
): InformedConsentCaseOption {
  const now = new Date().toISOString();
  const linkedStudyRequestFormId = optionalString(data.linkedStudyRequestFormId);
  return {
    id,
    institutionId: optionalString(data.institutionId) ?? "",
    doctorId: optionalString(data.doctorId) ?? "",
    patientId: optionalString(data.patientId) ?? "",
    patientName,
    caseLabel: optionalString(data.caseLabel) ?? id,
    caseStatus: optionalString(data.caseStatus),
    threeLetterCode: optionalString(data.three_letter_code),
    informedConsentId: optionalString(data.informedConsentId) ?? null,
    ...(linkedStudyRequestFormId ? { linkedStudyRequestFormId } : {}),
    createdAt: optionalString(data.createdAt) ?? now,
    updatedAt: optionalString(data.updatedAt) ?? now,
  };
}

async function getConsentRecordForContext(
  context: AdminContext,
  consentId: string,
) {
  const snapshot = await adminDb
    .collection(CONSENTS_COLLECTION)
    .doc(consentId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Consent not found.", 404);
  }
  const consent = parseStoredConsent(
    snapshot.data() as Record<string, unknown>,
  );
  const patient = await getPatient(consent.patientId);
  if (
    !patient ||
    !canAccessInformedConsentPatient(context, patient) ||
    (consent.studyRequestFormId && !canReadStudyRequestConsent(context, consent))
  ) {
    throw new AdminRepositoryError("You cannot view this consent.", 403);
  }
  return {
    stored: consent,
    record: toConsentRecord(consentId, consent, patient.fullName),
    patient,
  };
}

async function getCaseOptionForContext(
  context: AdminContext,
  caseId: string,
  patientName: string,
) {
  const snapshot = await adminDb.collection(CASES_COLLECTION).doc(caseId).get();
  if (!snapshot.exists) return null;
  const option = toCaseOption(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
    patientName,
  );
  return canAccessInformedConsentPatient(context, {
    id: option.patientId,
    institutionId: option.institutionId,
    doctorId: option.doctorId,
  })
    ? option
    : null;
}

async function listCaseOptionsForPatient(
  context: AdminContext,
  patient: PatientRecord,
) {
  const snapshot = await adminDb
    .collection(CASES_COLLECTION)
    .where("patientId", "==", patient.id)
    .limit(CONSENTS_PAGE_SIZE)
    .get();
  return snapshot.docs
    .map((doc) =>
      toCaseOption(
        doc.id,
        doc.data() as Record<string, unknown>,
        patient.fullName,
      ),
    )
    .filter(
      (record) =>
        record.patientId === patient.id &&
        canAccessInformedConsentPatient(context, {
          id: record.patientId,
          institutionId: record.institutionId,
          doctorId: record.doctorId,
        }),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getInformedConsentDetailForContext(
  context: AdminContext,
  consentId: string,
) {
  assertCanManageConsentTraceability(context);
  const { record, patient } = await getConsentRecordForContext(
    context,
    consentId,
  );
  const caseOptions = record.studyRequestFormId
    ? []
    : (await listCaseOptionsForPatient(context, patient)).filter(
        (option) => !option.linkedStudyRequestFormId,
      );
  let linkedCase = record.caseId
    ? (caseOptions.find((candidate) => candidate.id === record.caseId) ?? null)
    : null;
  if (!linkedCase && record.caseId) {
    linkedCase = await getCaseOptionForContext(
      context,
      record.caseId,
      patient.fullName,
    );
  }
  return { record, linkedCase, caseOptions };
}

export async function getCaseConsentTraceabilityForContext(
  context: AdminContext,
  caseId: string,
) {
  assertCanManageConsentTraceability(context);
  const caseSnapshot = await adminDb
    .collection(CASES_COLLECTION)
    .doc(caseId)
    .get();
  if (!caseSnapshot.exists) {
    throw new AdminRepositoryError("2PQ case not found.", 404);
  }
  const caseData = caseSnapshot.data() as Record<string, unknown>;
  const patientId = optionalString(caseData.patientId);
  if (!patientId) {
    throw new AdminRepositoryError("The 2PQ case has no patient.", 409);
  }
  const patient = await getPatient(patientId);
  if (!patient || !canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError("You cannot view this 2PQ case.", 403);
  }
  const caseOption = toCaseOption(caseId, caseData, patient.fullName);

  const consentSnapshot = caseOption.linkedStudyRequestFormId
    ? null
    : await adminDb
        .collection(CONSENTS_COLLECTION)
        .where("patientId", "==", patient.id)
        .limit(CONSENTS_PAGE_SIZE)
        .get();
  const consentOptions = (consentSnapshot?.docs ?? [])
    .map((doc) => ({
      id: doc.id,
      stored: parseStoredConsent(doc.data() as Record<string, unknown>),
    }))
    .filter(({ stored }) =>
      !stored.studyRequestFormId &&
      stored.patientId === patient.id &&
      stored.institutionId === caseOption.institutionId &&
      stored.doctorId === caseOption.doctorId,
    )
    .map(({ id, stored }) => toConsentRecord(id, stored, patient.fullName))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  let linkedConsent = caseOption.informedConsentId
    ? (consentOptions.find(
        (candidate) => candidate.id === caseOption.informedConsentId,
      ) ?? null)
    : null;
  if (!linkedConsent && caseOption.informedConsentId) {
    try {
      linkedConsent = (
        await getConsentRecordForContext(context, caseOption.informedConsentId)
      ).record;
    } catch (error) {
      if (
        !(error instanceof AdminRepositoryError) ||
        error.statusCode !== 404
      ) {
        throw error;
      }
    }
  }
  return { case: caseOption, linkedConsent, consentOptions };
}

export async function setInformedConsentCaseForContext(
  context: AdminContext,
  consentId: string,
  caseId: string | null,
) {
  assertCanManageConsentTraceability(context);
  const normalizedCaseId = caseId?.trim() || null;
  const consentRef = adminDb.collection(CONSENTS_COLLECTION).doc(consentId);
  const targetCaseRef = normalizedCaseId
    ? adminDb.collection(CASES_COLLECTION).doc(normalizedCaseId)
    : null;
  const now = new Date().toISOString();

  await adminDb.runTransaction(async (transaction) => {
    const consentSnapshot = await transaction.get(consentRef);
    if (!consentSnapshot.exists) {
      throw new AdminRepositoryError("Consent not found.", 404);
    }
    const consent = parseStoredConsent(
      consentSnapshot.data() as Record<string, unknown>,
    );
    if (!canWriteTraceabilityEntity(context, consent)) {
      throw new AdminRepositoryError(
        "You cannot change this consent link.",
        403,
      );
    }
    if (consent.studyRequestFormId) {
      throw new AdminRepositoryError("This consent belongs to its study request.", 409);
    }

    const targetCaseSnapshot = targetCaseRef
      ? await transaction.get(targetCaseRef)
      : null;
    if (targetCaseRef && !targetCaseSnapshot?.exists) {
      throw new AdminRepositoryError("2PQ case not found.", 404);
    }
    const targetCaseData = targetCaseSnapshot?.exists
      ? (targetCaseSnapshot.data() as Record<string, unknown>)
      : null;
    const targetCase = targetCaseData
      ? toCaseOption(normalizedCaseId!, targetCaseData, consent.patientId)
      : null;
    if (targetCase) {
      if (!canWriteTraceabilityEntity(context, targetCase)) {
        throw new AdminRepositoryError(
          "You cannot change this 2PQ case link.",
          403,
        );
      }
      if (targetCase.linkedStudyRequestFormId) {
        throw new AdminRepositoryError("Manage consent through the linked study request.", 409);
      }
      if (
        targetCase.patientId !== consent.patientId ||
        targetCase.institutionId !== consent.institutionId ||
        targetCase.doctorId !== consent.doctorId
      ) {
        throw new AdminRepositoryError(
          "Consent and 2PQ case must belong to the same patient, institution, and doctor.",
          409,
        );
      }
    }

    const previousCaseRef =
      consent.caseId && consent.caseId !== normalizedCaseId
        ? adminDb.collection(CASES_COLLECTION).doc(consent.caseId)
        : null;
    const displacedConsentId =
      targetCase?.informedConsentId &&
      targetCase.informedConsentId !== consentId
        ? targetCase.informedConsentId
        : null;
    const displacedConsentRef = displacedConsentId
      ? adminDb.collection(CONSENTS_COLLECTION).doc(displacedConsentId)
      : null;
    const previousCaseSnapshot = previousCaseRef
      ? await transaction.get(previousCaseRef)
      : null;
    const displacedConsentSnapshot = displacedConsentRef
      ? await transaction.get(displacedConsentRef)
      : null;

    if (previousCaseRef && previousCaseSnapshot?.exists) {
      const previousCaseData = previousCaseSnapshot.data() as Record<
        string,
        unknown
      >;
      if (optionalString(previousCaseData.informedConsentId) === consentId) {
        transaction.set(
          previousCaseRef,
          {
            informedConsentId: null,
            updatedAt: now,
            last_updated_date: now,
            updatedByEmail: context.email,
          },
          { merge: true },
        );
      }
    }

    if (displacedConsentRef && displacedConsentSnapshot?.exists) {
      const displacedConsent = parseStoredConsent(
        displacedConsentSnapshot.data() as Record<string, unknown>,
      );
      if (displacedConsent.studyRequestFormId) {
        throw new AdminRepositoryError("Manage consent through the linked study request.", 409);
      }
      if (displacedConsent.caseId === normalizedCaseId) {
        transaction.set(
          displacedConsentRef,
          { caseId: null, updatedAt: now },
          { merge: true },
        );
      }
    }

    transaction.set(
      consentRef,
      { caseId: normalizedCaseId, updatedAt: now },
      { merge: true },
    );
    if (targetCaseRef) {
      transaction.set(
        targetCaseRef,
        {
          informedConsentId: consentId,
          updatedAt: now,
          last_updated_date: now,
          updatedByEmail: context.email,
        },
        { merge: true },
      );
    }
  });

  return getInformedConsentDetailForContext(context, consentId);
}

export async function sendInformedConsentEmailForContext(
  context: AdminContext,
  payload: { patientId: string },
) {
  assertCanUseInformedConsents(context);

  if (normalizeRoleEmail(context.email) !== CONSENT_EMAIL_SENDER_EMAIL) {
    throw new AdminRepositoryError(
      "This account cannot send consent email requests yet.",
      403,
    );
  }
  if (context.role === "patient") {
    throw new AdminRepositoryError(
      "Patients cannot send consent email requests.",
      403,
    );
  }

  const patientId = payload.patientId.trim();
  if (!patientId) {
    throw new AdminRepositoryError("Select a patient.", 400);
  }

  const patient = await getPatient(patientId);
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot send consent requests for this patient.",
      403,
    );
  }
  if (!patient.email) {
    throw new AdminRepositoryError("Patient does not have an email.", 400);
  }
  const patientSnapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patient.id)
    .get();
  const temporaryPassword = normalizeTemporaryPassword(
    patientSnapshot.data()?.temporary_password,
  );
  if (!temporaryPassword) {
    throw new AdminRepositoryError(
      "This patient does not have a temporary password yet.",
      404,
    );
  }

  try {
    await sendInformedConsentEmail(patient, temporaryPassword);
  } catch (error) {
    const details =
      error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new AdminRepositoryError(
      `Unable to send consent email.${details}`,
      502,
    );
  }

  return { ok: true, patientId: patient.id, email: patient.email };
}

export async function approveStudyRequestConsentForContext(
  context: AdminContext,
  formId: string,
  expectedUploadedAt: string,
) {
  assertCanManageConsentTraceability(context);
  const requestRef = studyRequestReference(formId);
  await adminDb.runTransaction(async (transaction) => {
    const request = requireStudyRequestForConsent(
      context, requestRef.id, (await transaction.get(requestRef)).data(),
    );
    if (!request.consentId) {
      throw new AdminRepositoryError("Upload the informed consent before approving it.", 409);
    }
    const consentRef = adminDb.collection(CONSENTS_COLLECTION).doc(request.consentId);
    const [consentSnapshot, patientSnapshot] = await Promise.all([
      transaction.get(consentRef),
      transaction.get(adminDb.collection(PATIENTS_COLLECTION).doc(request.patientId)),
    ]);
    const patientData = patientSnapshot.data();
    assertPatientMatchesStudyRequest(
      patientData ? toPatientRecord(patientSnapshot.id, patientData) : null,
      request,
    );
    const consent = consentSnapshot.data();
    const status = getStudyRequestConsentStatus(consent, request.id, request);
    if (!consent || status === "pending") {
      throw new AdminRepositoryError("This study request does not have a matching informed consent.", 409);
    }
    if (consent.uploadedAt !== expectedUploadedAt) {
      throw new AdminRepositoryError("The consent file changed. Open the current file before approving it.", 409);
    }
    if (status === "ready") return;
    if (!canChangeStudyRequestConsent(request)) {
      throw new AdminRepositoryError("Consent for this study request can no longer be changed.", 409);
    }
    const now = new Date().toISOString();
    transaction.set(consentRef, {
      reviewStatus: "ready",
      reviewedAt: now,
      reviewedByEmail: normalizeRoleEmail(context.email),
      updatedAt: now,
    }, { merge: true });
  });
  return getStudyRequestConsentForContext(context, formId);
}

export async function sendStudyRequestConsentInvitationForContext(
  context: AdminContext,
  formId: string,
) {
  assertCanManageConsentTraceability(context);
  const request = await getStudyRequestForConsent(context, formId);
  if (!canChangeStudyRequestConsent(request)) {
    throw new AdminRepositoryError("This study request can no longer receive consent invitations.", 409);
  }
  const [patientSnapshot, consentSnapshot] = await Promise.all([
    adminDb.collection(PATIENTS_COLLECTION).doc(request.patientId).get(),
    request.consentId
      ? adminDb.collection(CONSENTS_COLLECTION).doc(request.consentId).get()
      : null,
  ]);
  if (getStudyRequestConsentStatus(consentSnapshot?.data(), request.id, request) === "ready") {
    throw new AdminRepositoryError("The consent for this study request is already approved.", 409);
  }
  const patientData = patientSnapshot.data();
  const patient = patientData ? toPatientRecord(patientSnapshot.id, patientData) : null;
  assertPatientMatchesStudyRequest(patient, request);
  if (patient.status !== "active" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email)) {
    throw new AdminRepositoryError("Set a valid email for the active patient before sending the invitation.", 409);
  }
  const role = await getUserRoleByEmail(patient.email);
  if (role?.role !== "patient" || role.patientId !== patient.id ||
    !role.isActive || !role.canAccessPatientPortal) {
    throw new AdminRepositoryError("Enable patient portal access at the patient's current email before sending the invitation.", 409);
  }
  let temporaryPassword: string | undefined;
  const storedPassword = normalizeTemporaryPassword(patientData?.temporary_password);
  if (storedPassword) {
    // Initial credentials are useful only before the first sign-in. A
    // returning patient uses their existing portal login credentials.
    const user = await adminAuthFor("mydnamap").getUserByEmail(patient.email).catch(() => null);
    if (user && !user.disabled && !user.metadata.lastSignInTime) {
      temporaryPassword = storedPassword;
    }
  }
  try {
    await sendInformedConsentEmail(patient, temporaryPassword, request.id);
  } catch {
    throw new AdminRepositoryError("Unable to send the consent invitation.", 502);
  }
  return { ok: true as const, patientEmail: patient.email };
}

export async function getInformedConsentFileForContext(
  context: AdminContext,
  consentId: string,
) {
  assertCanUseInformedConsents(context);

  const snapshot = await adminDb
    .collection(CONSENTS_COLLECTION)
    .doc(consentId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Consent not found.", 404);
  }
  const consent = parseStoredConsent(
    snapshot.data() as Record<string, unknown>,
  );
  const patient = await getPatient(consent.patientId);
  if (
    !patient ||
    !canAccessInformedConsentPatient(context, patient) ||
    (consent.studyRequestFormId && !canReadStudyRequestConsent(context, consent))
  ) {
    throw new AdminRepositoryError("You cannot view this consent.", 403);
  }
  const validatedFile = validateFile(consent.file);
  const encoded = validatedFile.content.split(",", 2)[1] ?? "";
  return {
    name: validatedFile.name,
    type: validatedFile.type,
    bytes: Buffer.from(encoded, "base64"),
  };
}

export async function deleteInformedConsentForContext(
  context: AdminContext,
  consentId: string,
) {
  assertCanUseInformedConsents(context);
  if (!isGlobalAdminRole(context.role)) {
    throw new AdminRepositoryError(
      "Only full or 2PQ admins can delete informed consents.",
      403,
    );
  }

  const reference = adminDb.collection(CONSENTS_COLLECTION).doc(consentId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("Consent not found.", 404);
    }
    const consent = parseStoredConsent(
      snapshot.data() as Record<string, unknown>,
    );
    const requestReference = consent.studyRequestFormId
      ? studyRequestReference(consent.studyRequestFormId)
      : null;
    if (requestReference) {
      const request = requireStudyRequestForConsent(
        context,
        requestReference.id,
        (await transaction.get(requestReference)).data(),
      );
      if (
        !canChangeStudyRequestConsent(request) ||
        request.consentId !== consentId ||
        getStudyRequestConsentStatus(snapshot.data(), request.id, request) !== "needs_review"
      ) {
        throw new AdminRepositoryError("Consent for this study request cannot be deleted.", 409);
      }
    }
    const caseReference = consent.caseId
      ? adminDb.collection(CASES_COLLECTION).doc(consent.caseId)
      : null;
    const caseSnapshot = caseReference
      ? await transaction.get(caseReference)
      : null;
    if (requestReference) {
      transaction.set(requestReference, { informedConsentId: null }, { merge: true });
    }
    if (
      caseReference &&
      caseSnapshot?.exists &&
      optionalString(caseSnapshot.data()?.informedConsentId) === consentId
    ) {
      const now = new Date().toISOString();
      transaction.set(
        caseReference,
        {
          informedConsentId: null,
          updatedAt: now,
          last_updated_date: now,
          updatedByEmail: context.email,
        },
        { merge: true },
      );
    }
    transaction.delete(reference);
  });
  return { success: true as const, consentId };
}
