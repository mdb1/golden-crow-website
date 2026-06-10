"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  CircleX,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { OptionSelectField } from "@/components/constrained-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  DoctorListItem,
  InstitutionListItem,
  PatientListItem,
} from "@/lib/admin-areas";
import { PERSON_STATUS_OPTIONS } from "@/lib/admin-areas";
import { appText, type AppLanguage } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import {
  type CaseInformationFormState,
  type InstitutionInformationFormState,
  type MedicalInformationFormState,
  type PatientInformationFormState,
  type PreviousGeneticTestsFormState,
  type RequestedTestFormState,
  type SampleInformationFormState,
  type SamplingInformationFormState,
  type TwoPQFormDraftRecord,
  type TwoPQFormDraftState,
  type TwoPQFormDraftStepKey,
  type TwoPQFormRecord,
  type TwoPQFormType,
} from "@/lib/two-pq-forms";

type StepKey = TwoPQFormDraftStepKey;
type FlowState = TwoPQFormDraftState;
type FieldErrors = Record<string, string>;
type StepValidationStatus = "valid" | "invalid";
type StepValidationState = Partial<Record<StepKey, StepValidationStatus>>;
type FormStorageProcessingStatus = "pending" | "running" | "success" | "error";
type WholeDataValidationStatus = "running" | "success" | "error";

type FormStorageProcessingStep = {
  id: string;
  label: string;
  detail: string;
  status: FormStorageProcessingStatus;
};

type WholeDataValidationIssue = {
  id: string;
  step: StepKey;
  stepLabel: string;
  fieldLabel: string;
  message: string;
  fieldKey?: string;
};

type WholeDataValidationReport = {
  status: WholeDataValidationStatus;
  issues: WholeDataValidationIssue[];
};

type WholeDataValidationResult = {
  fieldErrors: FieldErrors;
  stepValidation: StepValidationState;
  issues: WholeDataValidationIssue[];
  firstInvalidStepIndex: number;
};

const STUDY_REQUEST_STEPS: StepKey[] = [
  "patientInformation",
  "medicalInformation",
  "requestedTest",
  "previousGeneticTests",
  "institutionInformation",
];

const SAMPLE_STEPS: StepKey[] = [
  "patientInformation",
  "requestedTest",
  "sampleInformation",
  "caseInformation",
  "samplingInformation",
];

const STEP_LABELS: Record<StepKey, string> = {
  patientInformation: "Patient information",
  medicalInformation: "Medical information",
  previousGeneticTests: "Karyotype",
  requestedTest: "Requested test",
  institutionInformation: "Institution information",
  sampleInformation: "Sample information",
  caseInformation: "2PQ case",
  samplingInformation: "2PQ sampling",
};

const VALIDATION_FIELD_LABELS: Record<string, string> = {
  selectedPatientId: "Pick existing patient",
  selectedInstitutionId: "Pick existing institution",
  selectedRequestingDoctorId: "Pick existing doctor",
  selectedCaseId: "Pick existing 2PQ case",
  "patientInformation.institutionId": "Institution",
  "patientInformation.doctorId": "Doctor",
  "patientInformation.email": "Patient reference email",
  "patientInformation.firstName": "Patient first name",
  "patientInformation.lastName": "Patient last name",
  "patientInformation.fullName": "Full name",
  "patientInformation.birthDate": "Birth date",
  "patientInformation.partnerBirthDate": "Partner birth date",
  "medicalInformation.spermGameteSource": "Sperm",
  "medicalInformation.oocyteGameteSource": "Oocytes",
  "medicalInformation.previousMiscarriagesCount": "Previous miscarriages",
  "medicalInformation.maleFactor": "Male factor",
  "medicalInformation.otherBackground": "Other background",
  "previousGeneticTests.karyotypeResult": "Karyotype result",
  "previousGeneticTests.karyotypeFileContent": "Karyotype file",
  "requestedTest.pgtAFast": "PGT-A FAST",
  "requestedTest.pgtAFastReportsMosaicism": "PGT-A FAST reports mosaicism",
  "requestedTest.pgtAFastReportsSex": "PGT-A FAST reports sex",
  "requestedTest.pgtAStandard": "PGT-A STANDARD",
  "requestedTest.pgtAStandardReportsMosaicism":
    "PGT-A STANDARD reports mosaicism",
  "requestedTest.pgtAStandardReportsSex": "PGT-A STANDARD reports sex",
  "requestedTest.pgtA": "PGT-A",
  "requestedTest.pgtSr": "PGT-SR",
  "requestedTest.pgtSrReportsMosaicism": "PGT-SR reports mosaicism",
  "requestedTest.pgtSrReportsSex": "PGT-SR reports sex",
  "requestedTest.reportsMosaicism": "Reports mosaicism",
  "requestedTest.reportsSex": "Reports sex",
  "requestedTest.requestReason": "Request reason",
  "requestedTest.requestDate": "Date",
  "institutionInformation.name": "Institution name",
  "institutionInformation.contactEmail": "Contact email",
  "sampleInformation.fivCenter": "FIV center",
  "sampleInformation.centerCode": "Center code",
  "sampleInformation.requestingDoctorFullName": "Requesting doctor",
  "sampleInformation.requestingDoctorAuthEmail": "Auth email",
  "sampleInformation.sampleType": "Sample type",
  "sampleInformation.processedByFirstName": "First name",
  "sampleInformation.processedByLastName": "Last name",
  "sampleInformation.processDate": "Process date",
  "sampleInformation.boxCode": "Box code",
  "caseInformation.caseLabel": "Case label",
  "caseInformation.caseStatus": "Case status",
  "caseInformation.priority": "Priority",
  "caseInformation.requestedAt": "Requested at",
  "caseInformation.dueAt": "Due at",
  samplingInformation: "2PQ sampling",
  "samplingInformation.sampleId": "Sample ID",
  "samplingInformation.sampleType": "Sample type",
  "samplingInformation.processingStatus": "Processing status",
};

const YES_NO_OPTIONS = [
  { value: "si", label: "Yes" },
  { value: "no", label: "No" },
];

const GAMETE_SOURCE_OPTIONS = [
  { value: "propio", label: "Own" },
  { value: "donado", label: "Donated" },
];

const PREVIOUS_MISCARRIAGES_OPTIONS = [
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3_or_more", label: "3 or more" },
  { value: "recurrent", label: "Recurrent" },
];

const KARYOTYPE_FILE_MAX_BYTES = 750_000;

const SAMPLE_TYPE_OPTIONS = [
  { value: "biopsia de trofoectodermo", label: "Trophectoderm biopsy" },
  {
    value: "rebiopsia de trofoectodermo",
    label: "Trophectoderm rebiopsy",
  },
  { value: "medio de cultivo", label: "Culture media" },
  { value: "otro", label: "Other" },
];

const CASE_STATUS_OPTIONS = [
  { value: "intake", label: "Intake" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "reporting", label: "Reporting" },
  { value: "delivered", label: "Delivered" },
];

const PRIORITY_OPTIONS = [
  { value: "routine", label: "Routine" },
  { value: "priority", label: "Priority" },
  { value: "urgent", label: "Urgent" },
];

const PROCESSING_OPTIONS = [
  { value: "awaiting_reception", label: "Awaiting reception" },
  { value: "received", label: "Received" },
  { value: "processing", label: "Processing" },
  { value: "qc_hold", label: "QC hold" },
  { value: "ready_for_sequencing", label: "Ready for sequencing" },
];

const BOX_CODE_PATTERN = /^[A-Z]{3}$/;

function normalizeBoxCodeInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function normalizeBoxCodeForValidation(value: string) {
  return value.trim().toUpperCase();
}

function isValidBoxCode(value: string) {
  return BOX_CODE_PATTERN.test(normalizeBoxCodeForValidation(value));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function optionalValidEmail(value: string) {
  return !value.trim() || isValidEmail(value);
}

function isValidDateInput(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return false;
  }
  const [year, month, day] = trimmedValue.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function optionalValidDateInput(value: string) {
  return !value.trim() || isValidDateInput(value);
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function joinNameParts(firstName: string, lastName: string) {
  return [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function splitFullName(fullName: string) {
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length <= 1) {
    return {
      firstName: nameParts[0] ?? "",
      lastName: "",
    };
  }

  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(" "),
  };
}

function todayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function pendingProcessingStep(
  id: string,
  label: string,
  detail: string
): FormStorageProcessingStep {
  return {
    id,
    label,
    detail,
    status: "pending",
  };
}

function buildFormStorageProcessingSteps(
  flowState: FlowState,
  formType: TwoPQFormType,
  language: AppLanguage
): FormStorageProcessingStep[] {
  const t = (text: string) => appText(language, text);
  const sharedSteps = [
    pendingProcessingStep(
      "validate-payload",
      t("Validate form payload"),
      t("Confirm every required field across the current form is complete.")
    ),
    pendingProcessingStep(
      "save-draft",
      t("Save temporary draft checkpoint"),
      t("Persist the final in-progress state before handing it to storage.")
    ),
  ];

  if (formType === "study_request") {
    return [
      ...sharedSteps,
      pendingProcessingStep(
        "patient",
        flowState.selectedPatientId
          ? t("Link selected scoped patient")
          : t("Create scoped patient"),
        flowState.selectedPatientId
          ? `${t("Use patient")} ${flowState.selectedPatientId} ${t("as the form patient.")}`
          : t("Create the scoped patient from step 1 and link it to the form.")
      ),
      pendingProcessingStep(
        "institution",
        flowState.selectedInstitutionId
          ? t("Link selected institution")
          : t("Create scoped institution"),
        flowState.selectedInstitutionId
          ? `${t("Use institution")} ${flowState.selectedInstitutionId} ${t("for the request.")}`
          : t("Create the institution details provided in the request.")
      ),
      pendingProcessingStep(
        "store-form",
        t("Store joined 2PQ form"),
        t("Persist the final form document with patient, institution, and test payloads.")
      ),
      pendingProcessingStep(
        "clean-draft",
        t("Clean temporary draft"),
        t("Remove the one-user temporary draft after storage succeeds.")
      ),
    ];
  }

  const boxCode = normalizeBoxCodeInput(flowState.sampleInformation.boxCode);
  const caseLabel =
    flowState.selectedCaseId ||
    flowState.caseInformation.caseLabel ||
    (boxCode ? `${boxCode}XXX` : "new case");
  const samplingSteps = flowState.samplingInformation.map((sampling, index) =>
    pendingProcessingStep(
      `sampling-${index}`,
      `${t("Create sampling")} ${sampling.sampleId || index + 1}`,
      `${t("Link this sampling to")} ${caseLabel}; ${t("collection date, reception date, run ID, and QC status stay nil.")}`
    )
  );

  return [
    ...sharedSteps,
    pendingProcessingStep(
      "patient",
      flowState.selectedPatientId
        ? t("Link selected scoped patient")
        : t("Create scoped patient"),
      flowState.selectedPatientId
        ? `${t("Use patient")} ${flowState.selectedPatientId} ${t("as the sample patient.")}`
        : t("Create the scoped patient from step 1 and link it to the stored form.")
    ),
    pendingProcessingStep(
      "doctor",
      flowState.selectedRequestingDoctorId
        ? t("Link selected requesting doctor")
        : t("Create scoped requesting doctor"),
      flowState.selectedRequestingDoctorId
        ? `${t("Use doctor")} ${flowState.selectedRequestingDoctorId} ${t("as requesting doctor.")}`
        : t("Create the scoped doctor from the manual requesting doctor fields.")
    ),
    pendingProcessingStep(
      "case",
      flowState.selectedCaseId
        ? t("Link existing 2PQ case")
        : `${t("Create 2PQ case")} ${caseLabel}`,
      flowState.selectedCaseId
        ? `${t("Use case")} ${flowState.selectedCaseId} ${t("after confirming it matches box code")} ${boxCode}.`
        : t("Create the case from step 4 and attach it to the patient, institution, and doctor.")
    ),
    pendingProcessingStep(
      "box-code",
      t("Bind three-letter box code"),
      boxCode
        ? `${t("Store box code")} ${boxCode} ${t("as the case three_letter_code and keep the form linked to it.")}`
        : t("Store the validated box code as the case three_letter_code.")
    ),
    ...samplingSteps,
    pendingProcessingStep(
      "store-form",
      t("Store joined 2PQ form"),
      t("Persist the form with linked patient, doctor, case, sample, and sampling records.")
    ),
    pendingProcessingStep(
      "clean-draft",
      t("Clean temporary draft"),
      t("Remove the one-user temporary draft after the final form is stored.")
    ),
  ];
}

function emptyInstitution(): InstitutionInformationFormState {
  return {
    code: "",
    name: "",
    legalName: "",
    contactEmail: "",
    contactPhone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    country: "",
    notes: "",
  };
}

function emptyCase(): CaseInformationFormState {
  return {
    caseLabel: "",
    caseStatus: "intake",
    caseType: "PGT",
    priority: "routine",
    trackingNumber: "",
    requestedAt: todayDateInputValue(),
    dueAt: "",
    notes: "",
  };
}

function newCaseDefaultsForBoxCode(boxCode: string): CaseInformationFormState {
  const normalizedBoxCode = normalizeBoxCodeInput(boxCode);
  return {
    ...emptyCase(),
    caseLabel: normalizedBoxCode ? `${normalizedBoxCode}XXX` : "",
  };
}

function withCaseDefaultsForBoxCode(flowState: FlowState): FlowState {
  if (flowState.selectedCaseId) {
    return flowState;
  }

  const defaults = newCaseDefaultsForBoxCode(flowState.sampleInformation.boxCode);
  const currentCase = flowState.caseInformation;
  const nextCase = {
    ...currentCase,
    caseLabel: currentCase.caseLabel.trim()
      ? currentCase.caseLabel
      : defaults.caseLabel,
    requestedAt: currentCase.requestedAt || defaults.requestedAt,
  };

  if (
    nextCase.caseLabel === currentCase.caseLabel &&
    nextCase.requestedAt === currentCase.requestedAt
  ) {
    return flowState;
  }

  return {
    ...flowState,
    caseInformation: nextCase,
  };
}

function emptySampling(): SamplingInformationFormState {
  return {
    sampleId: "",
    sampleType: "",
    processingStatus: "awaiting_reception",
    notes: "",
  };
}

function buildInitialState(
  institutionId: string,
  doctorId: string,
  referenceEmail = ""
): FlowState {
  return {
    selectedPatientId: "",
    selectedInstitutionId: "",
    selectedCaseId: "",
    patientInformation: {
      institutionId,
      doctorId,
      email: referenceEmail,
      firstName: "",
      lastName: "",
      fullName: "",
      medicalRecordNumber: "",
      birthDate: "",
      sex: "",
      status: "active",
      notes: "",
      includesPartnerInformation: false,
      partnerFirstName: "",
      partnerLastName: "",
      partnerMedicalRecordNumber: "",
      partnerBirthDate: "",
      partnerNotes: "",
    },
    medicalInformation: {
      previousMiscarriagesCount: "",
      maleFactor: "",
      spermGameteSource: "",
      oocyteGameteSource: "",
      otherBackground: "",
    },
    previousGeneticTests: {
      pgtASr: "",
      karyotype: "",
      pgtResult: "",
      karyotypeResult: "",
      karyotypeFileName: "",
      karyotypeFileType: "",
      karyotypeFileSize: "",
      karyotypeFileContent: "",
    },
    requestedTest: {
      testName: "",
      testCode: "",
      priority: "",
      reason: "",
      notes: "",
      pgtAFast: "",
      pgtAFastReportsMosaicism: "",
      pgtAFastReportsSex: "",
      pgtAStandard: "",
      pgtAStandardReportsMosaicism: "",
      pgtAStandardReportsSex: "",
      pgtA: "",
      pgtSr: "",
      pgtSrReportsMosaicism: "",
      pgtSrReportsSex: "",
      reportsMosaicism: "",
      reportsSex: "",
      requestReason: "",
      requestDate: "",
    },
    institutionInformation: emptyInstitution(),
    sampleInformation: {
      fivCenter: "",
      centerCode: "",
      requestingDoctorFullName: "",
      requestingDoctorAuthEmail: "",
      requestingDoctorAuthUid: "",
      requestingDoctorSpecialty: "",
      requestingDoctorLicenseNumber: "",
      requestingDoctorContactPhone: "",
      requestingDoctorStatus: "active",
      requestingDoctorNotes: "",
      sampleType: "",
      processedByFirstName: "",
      processedByLastName: "",
      processDate: todayDateInputValue(),
      boxCode: "",
    },
    caseInformation: emptyCase(),
    samplingInformation: [emptySampling()],
    selectedRequestingDoctorId: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

function firstErrorMessage(errors: FieldErrors) {
  return Object.values(errors)[0] ?? "Complete the highlighted fields.";
}

function isStepErrorKey(key: string, step: StepKey) {
  if (key === step || key.startsWith(`${step}.`)) {
    return true;
  }

  return (
    (step === "patientInformation" && key === "selectedPatientId") ||
    (step === "institutionInformation" && key === "selectedInstitutionId") ||
    (step === "sampleInformation" && key === "selectedRequestingDoctorId") ||
    (step === "caseInformation" && key === "selectedCaseId")
  );
}

function validationStatusFor(errors: FieldErrors): StepValidationStatus {
  return hasErrors(errors) ? "invalid" : "valid";
}

function mergeDraftSection<T extends object>(base: T, value: unknown): T {
  return isRecord(value) ? { ...base, ...value } as T : base;
}

function mergePatientInformationDraft(
  base: PatientInformationFormState,
  value: unknown
): PatientInformationFormState {
  const merged = mergeDraftSection(base, value);
  const hasLegacyPartnerInformation = Boolean(
    merged.partnerFirstName.trim() ||
      merged.partnerLastName.trim() ||
      merged.partnerMedicalRecordNumber.trim() ||
      merged.partnerBirthDate.trim() ||
      merged.partnerNotes.trim()
  );
  const mergedWithPartnerFlag = {
    ...merged,
    includesPartnerInformation:
      merged.includesPartnerInformation || hasLegacyPartnerInformation,
  };
  if (
    (!mergedWithPartnerFlag.firstName.trim() ||
      !mergedWithPartnerFlag.lastName.trim()) &&
    mergedWithPartnerFlag.fullName.trim()
  ) {
    const splitName = splitFullName(mergedWithPartnerFlag.fullName);
    return {
      ...mergedWithPartnerFlag,
      firstName: mergedWithPartnerFlag.firstName.trim()
        ? mergedWithPartnerFlag.firstName
        : splitName.firstName,
      lastName: mergedWithPartnerFlag.lastName.trim()
        ? mergedWithPartnerFlag.lastName
        : splitName.lastName,
    };
  }

  return {
    ...mergedWithPartnerFlag,
    fullName: mergedWithPartnerFlag.fullName.trim()
      ? mergedWithPartnerFlag.fullName
      : joinNameParts(
          mergedWithPartnerFlag.firstName,
          mergedWithPartnerFlag.lastName
        ),
  };
}

function mergeSampleInformationDraft(
  base: SampleInformationFormState,
  value: unknown
): SampleInformationFormState {
  const merged = mergeDraftSection(base, value);
  const mergedWithProcessDate = merged.processDate.trim()
    ? merged
    : { ...merged, processDate: todayDateInputValue() };
  if (!isRecord(value) || mergedWithProcessDate.requestingDoctorFullName.trim()) {
    return mergedWithProcessDate;
  }

  const firstName =
    typeof value.requestingDoctorFirstName === "string"
      ? value.requestingDoctorFirstName.trim()
      : "";
  const lastName =
    typeof value.requestingDoctorLastName === "string"
      ? value.requestingDoctorLastName.trim()
      : "";

  return {
    ...mergedWithProcessDate,
    requestingDoctorFullName: [firstName, lastName].filter(Boolean).join(" "),
  };
}

function mergeSamplingInformationDraft(
  value: unknown
): SamplingInformationFormState {
  const merged = mergeDraftSection(emptySampling(), value);

  return {
    sampleId: merged.sampleId,
    sampleType: merged.sampleType,
    processingStatus: merged.processingStatus,
    notes: merged.notes,
  };
}

function hydrateDraftState(
  defaultState: FlowState,
  draft: TwoPQFormDraftRecord | null | undefined
): FlowState {
  if (!draft?.state || !isRecord(draft.state)) {
    return defaultState;
  }

  const draftState = draft.state;
  return {
    ...defaultState,
    selectedPatientId:
      typeof draftState.selectedPatientId === "string"
        ? draftState.selectedPatientId
        : defaultState.selectedPatientId,
    selectedInstitutionId:
      typeof draftState.selectedInstitutionId === "string"
        ? draftState.selectedInstitutionId
        : defaultState.selectedInstitutionId,
    selectedCaseId:
      typeof draftState.selectedCaseId === "string"
        ? draftState.selectedCaseId
        : defaultState.selectedCaseId,
    selectedRequestingDoctorId:
      typeof draftState.selectedRequestingDoctorId === "string"
        ? draftState.selectedRequestingDoctorId
        : defaultState.selectedRequestingDoctorId,
    patientInformation: mergePatientInformationDraft(
      defaultState.patientInformation,
      draftState.patientInformation
    ),
    medicalInformation: mergeDraftSection(
      defaultState.medicalInformation,
      draftState.medicalInformation
    ),
    previousGeneticTests: mergeDraftSection(
      defaultState.previousGeneticTests,
      draftState.previousGeneticTests
    ),
    requestedTest: mergeDraftSection(
      defaultState.requestedTest,
      draftState.requestedTest
    ),
    institutionInformation: mergeDraftSection(
      defaultState.institutionInformation,
      draftState.institutionInformation
    ),
    sampleInformation: mergeSampleInformationDraft(
      defaultState.sampleInformation,
      draftState.sampleInformation
    ),
    caseInformation: mergeDraftSection(
      defaultState.caseInformation,
      draftState.caseInformation
    ),
    samplingInformation:
      Array.isArray(draftState.samplingInformation) &&
      draftState.samplingInformation.length > 0
        ? draftState.samplingInformation.map((entry) =>
            mergeSamplingInformationDraft(entry)
          )
        : defaultState.samplingInformation,
  };
}

function resolveDraftStepIndex(
  draft: TwoPQFormDraftRecord | null | undefined,
  steps: StepKey[]
) {
  if (!draft) {
    return 0;
  }

  const stepFromKey = steps.indexOf(draft.currentStep);
  if (stepFromKey >= 0) {
    return stepFromKey;
  }

  if (Number.isInteger(draft.stepIndex)) {
    return Math.min(Math.max(draft.stepIndex, 0), steps.length - 1);
  }

  return 0;
}

function validateStepFields(
  step: StepKey,
  flowState: FlowState,
  formType: TwoPQFormType,
  language: AppLanguage
): FieldErrors {
  const errors: FieldErrors = {};
  const t = (text: string) => appText(language, text);

  if (step === "patientInformation") {
    if (!flowState.patientInformation.institutionId) {
      errors["patientInformation.institutionId"] = t("Select an institution.");
    }
    if (!flowState.patientInformation.doctorId) {
      errors["patientInformation.doctorId"] = t("Select a doctor.");
    }
    if (!isValidEmail(flowState.patientInformation.email)) {
      errors["patientInformation.email"] =
        formType === "study_request"
          ? t("Enter a valid patient reference email.")
          : t("Enter a valid patient email.");
    }
    if (formType === "study_request") {
      if (!flowState.patientInformation.firstName.trim()) {
        errors["patientInformation.firstName"] =
          t("Patient first name is required.");
      }
      if (!flowState.patientInformation.lastName.trim()) {
        errors["patientInformation.lastName"] =
          t("Patient last name is required.");
      }
    } else if (!flowState.patientInformation.fullName.trim()) {
      errors["patientInformation.fullName"] = t("Patient full name is required.");
    }
    if (
      flowState.patientInformation.birthDate &&
      !optionalValidDateInput(flowState.patientInformation.birthDate)
    ) {
      errors["patientInformation.birthDate"] = t("Birth date must be a valid date.");
    }
    if (
      flowState.patientInformation.includesPartnerInformation &&
      flowState.patientInformation.partnerBirthDate &&
      !optionalValidDateInput(flowState.patientInformation.partnerBirthDate)
    ) {
      errors["patientInformation.partnerBirthDate"] =
        t("Partner birth date must be a valid date.");
    }
  }

  if (step === "medicalInformation") {
    const validGameteSourceValues = new Set(
      GAMETE_SOURCE_OPTIONS.map((option) => option.value)
    );
    const spermGameteSource = flowState.medicalInformation.spermGameteSource;
    const oocyteGameteSource = flowState.medicalInformation.oocyteGameteSource;
    if (spermGameteSource && !validGameteSourceValues.has(spermGameteSource)) {
      errors["medicalInformation.spermGameteSource"] =
        t("Sperm gamete source is not valid.");
    }
    if (oocyteGameteSource && !validGameteSourceValues.has(oocyteGameteSource)) {
      errors["medicalInformation.oocyteGameteSource"] =
        t("Oocyte gamete source is not valid.");
    }
    if (!flowState.medicalInformation.previousMiscarriagesCount) {
      errors["medicalInformation.previousMiscarriagesCount"] =
        t("Select previous miscarriages.");
    } else if (
      !PREVIOUS_MISCARRIAGES_OPTIONS.some(
        (option) =>
          option.value === flowState.medicalInformation.previousMiscarriagesCount
      )
    ) {
      errors["medicalInformation.previousMiscarriagesCount"] =
        t("Previous miscarriages selection is not valid.");
    }
    if (!flowState.medicalInformation.maleFactor) {
      errors["medicalInformation.maleFactor"] = t("Select male factor.");
    }
    if (!flowState.medicalInformation.otherBackground.trim()) {
      errors["medicalInformation.otherBackground"] = t("Other background is required.");
    }
  }

  if (step === "previousGeneticTests") {
    if (!flowState.previousGeneticTests.karyotypeResult.trim()) {
      errors["previousGeneticTests.karyotypeResult"] =
        t("Karyotype result is required.");
    }
  }

  if (step === "requestedTest") {
    if (formType === "study_request") {
      const requestedStudyTests = [
        {
          key: "pgtAFast",
          value: flowState.requestedTest.pgtAFast,
          label: "PGT-A FAST",
          mosaicismKey: "pgtAFastReportsMosaicism",
          mosaicismValue: flowState.requestedTest.pgtAFastReportsMosaicism,
          sexKey: "pgtAFastReportsSex",
          sexValue: flowState.requestedTest.pgtAFastReportsSex,
        },
        {
          key: "pgtAStandard",
          value: flowState.requestedTest.pgtAStandard,
          label: "PGT-A STANDARD",
          mosaicismKey: "pgtAStandardReportsMosaicism",
          mosaicismValue: flowState.requestedTest.pgtAStandardReportsMosaicism,
          sexKey: "pgtAStandardReportsSex",
          sexValue: flowState.requestedTest.pgtAStandardReportsSex,
        },
        {
          key: "pgtSr",
          value: flowState.requestedTest.pgtSr,
          label: "PGT-SR",
          mosaicismKey: "pgtSrReportsMosaicism",
          mosaicismValue: flowState.requestedTest.pgtSrReportsMosaicism,
          sexKey: "pgtSrReportsSex",
          sexValue: flowState.requestedTest.pgtSrReportsSex,
        },
      ];

      requestedStudyTests.forEach((test) => {
        if (!test.value) {
          errors[`requestedTest.${test.key}`] = t(`Select ${test.label}.`);
        }
        if (test.value === "si") {
          if (!test.mosaicismValue) {
            errors[`requestedTest.${test.mosaicismKey}`] =
              t(`Select ${test.label} reports mosaicism.`);
          }
          if (!test.sexValue) {
            errors[`requestedTest.${test.sexKey}`] =
              t(`Select ${test.label} reports sex.`);
          }
        }
      });

      if (
        requestedStudyTests.every((test) => test.value) &&
        !requestedStudyTests.some((test) => test.value === "si")
      ) {
        requestedStudyTests.forEach((test) => {
          errors[`requestedTest.${test.key}`] =
            t("Select Yes for at least one requested test.");
        });
      }

      return errors;
    }

    if (!flowState.requestedTest.pgtA) {
      errors["requestedTest.pgtA"] = t("Select PGT-A.");
    }
    if (!flowState.requestedTest.pgtSr) {
      errors["requestedTest.pgtSr"] = t("Select PGT-SR.");
    }
    if (
      flowState.requestedTest.pgtA &&
      flowState.requestedTest.pgtSr &&
      flowState.requestedTest.pgtA !== "si" &&
      flowState.requestedTest.pgtSr !== "si"
    ) {
      errors["requestedTest.pgtA"] = t("Select Yes for at least one requested test.");
      errors["requestedTest.pgtSr"] = t("Select Yes for at least one requested test.");
    }
  }

  if (step === "institutionInformation") {
    if (!flowState.institutionInformation.name.trim()) {
      errors["institutionInformation.name"] = t("Institution name is required.");
    }
    if (!optionalValidEmail(flowState.institutionInformation.contactEmail)) {
      errors["institutionInformation.contactEmail"] =
        t("Enter a valid institution contact email.");
    }
  }

  if (step === "sampleInformation") {
    if (!flowState.sampleInformation.fivCenter.trim()) {
      errors["sampleInformation.fivCenter"] = t("FIV center is required.");
    }
    if (!flowState.sampleInformation.centerCode.trim()) {
      errors["sampleInformation.centerCode"] = t("Center code is required.");
    }
    if (!flowState.sampleInformation.requestingDoctorFullName.trim()) {
      errors["sampleInformation.requestingDoctorFullName"] =
        t("Full name is required.");
    }
    if (!isValidEmail(flowState.sampleInformation.requestingDoctorAuthEmail)) {
      errors["sampleInformation.requestingDoctorAuthEmail"] =
        t("Auth email must be valid.");
    }
    if (!flowState.sampleInformation.sampleType.trim()) {
      errors["sampleInformation.sampleType"] = t("Sample type is required.");
    } else if (
      !SAMPLE_TYPE_OPTIONS.some(
        (option) => option.value === flowState.sampleInformation.sampleType
      )
    ) {
      errors["sampleInformation.sampleType"] = t("Sample type is not valid.");
    }
    if (!flowState.sampleInformation.processedByFirstName.trim()) {
      errors["sampleInformation.processedByFirstName"] =
        t("First name is required.");
    }
    if (!flowState.sampleInformation.processedByLastName.trim()) {
      errors["sampleInformation.processedByLastName"] =
        t("Last name is required.");
    }
    if (!flowState.sampleInformation.processDate.trim()) {
      errors["sampleInformation.processDate"] = t("Process date is required.");
    } else if (!isValidDateInput(flowState.sampleInformation.processDate)) {
      errors["sampleInformation.processDate"] = t("Process date must be a valid date.");
    }
    if (!flowState.sampleInformation.boxCode.trim()) {
      errors["sampleInformation.boxCode"] = t("Box code is required.");
    } else if (!isValidBoxCode(flowState.sampleInformation.boxCode)) {
      errors["sampleInformation.boxCode"] =
        t("Box code must be exactly three letters (A-Z).");
    }
  }

  if (step === "caseInformation" && !flowState.selectedCaseId) {
    if (!flowState.caseInformation.caseLabel.trim()) {
      errors["caseInformation.caseLabel"] = t("2PQ case label is required.");
    }
    if (!flowState.caseInformation.caseStatus.trim()) {
      errors["caseInformation.caseStatus"] = t("Select a 2PQ case status.");
    } else if (
      !CASE_STATUS_OPTIONS.some(
        (option) => option.value === flowState.caseInformation.caseStatus
      )
    ) {
      errors["caseInformation.caseStatus"] = t("Case status is not valid.");
    }
    if (
      flowState.caseInformation.priority &&
      !PRIORITY_OPTIONS.some(
        (option) => option.value === flowState.caseInformation.priority
      )
    ) {
      errors["caseInformation.priority"] = t("Priority is not valid.");
    }
    if (!flowState.caseInformation.requestedAt.trim()) {
      errors["caseInformation.requestedAt"] =
        t("Requested at is required for a new 2PQ case.");
    }
    if (
      flowState.caseInformation.requestedAt &&
      !optionalValidDateInput(flowState.caseInformation.requestedAt)
    ) {
      errors["caseInformation.requestedAt"] = t("Requested at must be a valid date.");
    }
    if (
      flowState.caseInformation.dueAt &&
      !optionalValidDateInput(flowState.caseInformation.dueAt)
    ) {
      errors["caseInformation.dueAt"] = t("Due at must be a valid date.");
    }
  }

  if (step === "samplingInformation") {
    if (flowState.samplingInformation.length === 0) {
      errors.samplingInformation = t("Add at least one 2PQ sampling record.");
    }
    const sampleIds = new Set<string>();
    flowState.samplingInformation.forEach((sampling, index) => {
      const row = `${t("Sampling")} ${index + 1}`;
      const trimmedSampleId = sampling.sampleId.trim();
      const normalizedSampleId = trimmedSampleId.toLowerCase();
      if (!trimmedSampleId) {
        errors[`samplingInformation.${index}.sampleId`] = `${row}: ${t("Sample ID is required.")}`;
      } else if (sampleIds.has(normalizedSampleId)) {
        errors[`samplingInformation.${index}.sampleId`] =
          `${row}: ${t("Sample ID must be unique in this form.")}`;
      } else {
        sampleIds.add(normalizedSampleId);
      }
      if (!sampling.sampleType.trim()) {
        errors[`samplingInformation.${index}.sampleType`] =
          `${row}: ${t("Sample type is required.")}`;
      }
      if (!sampling.processingStatus.trim()) {
        errors[`samplingInformation.${index}.processingStatus`] =
          `${row}: ${t("Select processing status.")}`;
      } else if (
        !PROCESSING_OPTIONS.some(
          (option) => option.value === sampling.processingStatus
        )
      ) {
        errors[`samplingInformation.${index}.processingStatus`] =
          `${row}: ${t("Processing status is not valid.")}`;
      }
    });
  }

  return errors;
}

function buildInitialStepValidation(
  flowState: FlowState,
  steps: StepKey[],
  stepIndex: number,
  formType: TwoPQFormType,
  language: AppLanguage
): StepValidationState {
  return steps.slice(0, stepIndex).reduce<StepValidationState>((statuses, step) => {
    statuses[step] = validationStatusFor(
      validateStepFields(step, flowState, formType, language)
    );
    return statuses;
  }, {});
}

function validationFieldLabel(fieldKey: string, language: AppLanguage) {
  const t = (text: string) => appText(language, text);
  const samplingMatch = /^samplingInformation\.(\d+)\.(.+)$/.exec(fieldKey);
  if (samplingMatch) {
    const rowNumber = Number(samplingMatch[1]) + 1;
    const rowFieldLabel =
      VALIDATION_FIELD_LABELS[`samplingInformation.${samplingMatch[2]}`] ??
      samplingMatch[2];

    return `${t("Sampling")} ${rowNumber}: ${t(rowFieldLabel)}`;
  }

  return t(VALIDATION_FIELD_LABELS[fieldKey] ?? fieldKey);
}

function validateWholeDocument({
  flowState,
  steps,
  formType,
  language,
  institutions,
  doctors,
  patients,
  cases,
}: {
  flowState: FlowState;
  steps: StepKey[];
  formType: TwoPQFormType;
  language: AppLanguage;
  institutions: InstitutionListItem[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
  cases: TwoPQListItem[];
}): WholeDataValidationResult {
  const t = (text: string) => appText(language, text);
  const fieldErrors: FieldErrors = {};
  const issues: WholeDataValidationIssue[] = [];
  const invalidSteps = new Set<StepKey>();
  const issueIds = new Set<string>();

  function addIssue(step: StepKey, fieldKey: string, message: string) {
    const issueId = `${step}:${fieldKey}:${message}`;
    if (issueIds.has(issueId)) {
      return;
    }

    issueIds.add(issueId);
    invalidSteps.add(step);
    if (!fieldErrors[fieldKey]) {
      fieldErrors[fieldKey] = message;
    }
    issues.push({
      id: issueId,
      step,
      stepLabel: t(STEP_LABELS[step]),
      fieldLabel: validationFieldLabel(fieldKey, language),
      message,
      fieldKey,
    });
  }

  steps.forEach((step) => {
    const stepErrors = validateStepFields(step, flowState, formType, language);
    Object.entries(stepErrors).forEach(([fieldKey, message]) => {
      addIssue(step, fieldKey, message);
    });
  });

  const institutionId = flowState.patientInformation.institutionId;
  const doctorId = flowState.patientInformation.doctorId;
  const selectedInstitution = institutionId
    ? institutions.find((institution) => institution.id === institutionId)
    : null;
  const selectedDoctor = doctorId
    ? doctors.find((doctor) => doctor.id === doctorId)
    : null;

  if (institutionId && !selectedInstitution) {
    addIssue(
      "patientInformation",
      "patientInformation.institutionId",
      t("Selected institution is not available in the current lookup data.")
    );
  }

  if (doctorId && !selectedDoctor) {
    addIssue(
      "patientInformation",
      "patientInformation.doctorId",
      t("Selected doctor is not available in the current lookup data.")
    );
  }

  if (selectedDoctor && institutionId && selectedDoctor.institutionId !== institutionId) {
    addIssue(
      "patientInformation",
      "patientInformation.doctorId",
      t("Selected doctor must belong to the selected institution.")
    );
  }

  if (flowState.selectedPatientId) {
    const selectedPatient = patients.find(
      (patient) => patient.id === flowState.selectedPatientId
    );
    if (!selectedPatient) {
      addIssue(
        "patientInformation",
        "selectedPatientId",
        t("Selected patient is not available in the current lookup data.")
      );
    } else if (
      selectedPatient.institutionId !== institutionId ||
      selectedPatient.doctorId !== doctorId
    ) {
      addIssue(
        "patientInformation",
        "selectedPatientId",
        t("Selected patient must belong to the selected institution and doctor.")
      );
    }
  }

  if (formType === "study_request" && flowState.selectedInstitutionId) {
    const requestInstitution = institutions.find(
      (institution) => institution.id === flowState.selectedInstitutionId
    );
    if (!requestInstitution) {
      addIssue(
        "institutionInformation",
        "selectedInstitutionId",
        t("Selected institution is not available in the current lookup data.")
      );
    } else if (institutionId && requestInstitution.id !== institutionId) {
      addIssue(
        "institutionInformation",
        "selectedInstitutionId",
        t("Selected institution must match the form institution scope.")
      );
    }
  }

  if (formType === "sample") {
    const boxCode = normalizeBoxCodeForValidation(flowState.sampleInformation.boxCode);
    const selectedRequestingDoctorId = flowState.selectedRequestingDoctorId;
    if (selectedRequestingDoctorId) {
      const requestingDoctor = doctors.find(
        (doctor) => doctor.id === selectedRequestingDoctorId
      );
      if (!requestingDoctor) {
        addIssue(
          "sampleInformation",
          "selectedRequestingDoctorId",
          t("Selected requesting doctor is not available in the current lookup data.")
        );
      } else if (requestingDoctor.institutionId !== institutionId) {
        addIssue(
          "sampleInformation",
          "selectedRequestingDoctorId",
          t("Selected requesting doctor must belong to the selected institution.")
        );
      }
    }

    if (flowState.selectedCaseId) {
      const selectedCase = cases.find(
        (caseRecord) => caseRecord.id === flowState.selectedCaseId
      );
      if (!selectedCase) {
        addIssue(
          "caseInformation",
          "selectedCaseId",
          t("Selected 2PQ case is not available in the current lookup data.")
        );
      } else {
        if (
          selectedCase.institutionId !== institutionId ||
          selectedCase.doctorId !== doctorId
        ) {
          addIssue(
            "caseInformation",
            "selectedCaseId",
            t("Selected 2PQ case must belong to the selected institution and doctor.")
          );
        }
        if (!flowState.selectedPatientId && selectedCase.patientId) {
          addIssue(
            "caseInformation",
            "selectedCaseId",
            t("Selected 2PQ case is already linked to an existing patient. Pick that patient or create a new case.")
          );
        }
        if (
          flowState.selectedPatientId &&
          selectedCase.patientId &&
          selectedCase.patientId !== flowState.selectedPatientId
        ) {
          addIssue(
            "caseInformation",
            "selectedCaseId",
            t("Selected 2PQ case must belong to the selected patient.")
          );
        }
        if (
          isValidBoxCode(boxCode) &&
          normalizeBoxCodeForValidation(selectedCase.three_letter_code ?? "") !== boxCode
        ) {
          addIssue(
            "caseInformation",
            "selectedCaseId",
            t("Selected 2PQ case must match the validated box code.")
          );
        }
      }
    } else if (
      isValidBoxCode(boxCode) &&
      flowState.caseInformation.caseLabel.trim() &&
      !flowState.caseInformation.caseLabel.trim().toUpperCase().startsWith(boxCode)
    ) {
      addIssue(
        "caseInformation",
        "caseInformation.caseLabel",
        t("Case label must start with the validated box code.")
      );
    }
  }

  const stepValidation = steps.reduce<StepValidationState>((next, step) => {
    next[step] = invalidSteps.has(step) ? "invalid" : "valid";
    return next;
  }, {});
  const firstInvalidStepIndex = steps.findIndex((step) => invalidSteps.has(step));

  return {
    fieldErrors,
    stepValidation,
    issues,
    firstInvalidStepIndex,
  };
}

function patientToFormState(patient: PatientListItem): PatientInformationFormState {
  const splitName = splitFullName(patient.fullName);

  return {
    institutionId: patient.institutionId,
    doctorId: patient.doctorId,
    email: patient.email,
    firstName: splitName.firstName,
    lastName: splitName.lastName,
    fullName: patient.fullName,
    medicalRecordNumber: patient.medicalRecordNumber ?? "",
    birthDate: toDateInputValue(patient.birthDate),
    sex: patient.sex ?? "",
    status: patient.status,
    notes: patient.notes ?? "",
    includesPartnerInformation: false,
    partnerFirstName: "",
    partnerLastName: "",
    partnerMedicalRecordNumber: "",
    partnerBirthDate: "",
    partnerNotes: "",
  };
}

function institutionToFormState(
  institution: InstitutionListItem
): InstitutionInformationFormState {
  return {
    code: institution.code ?? "",
    name: institution.name ?? "",
    legalName: institution.legalName ?? "",
    contactEmail: institution.contactEmail ?? "",
    contactPhone: institution.contactPhone ?? "",
    addressLine1: institution.addressLine1 ?? "",
    addressLine2: institution.addressLine2 ?? "",
    city: institution.city ?? "",
    state: institution.state ?? "",
    country: institution.country ?? "",
    notes: institution.notes ?? "",
  };
}

function caseToFormState(record: TwoPQListItem): CaseInformationFormState {
  return {
    caseLabel: record.caseLabel ?? "",
    caseStatus: record.caseStatus ?? "intake",
    caseType: record.caseType ?? "",
    priority: record.priority ?? "routine",
    trackingNumber: record.trackingNumber ?? "",
    requestedAt: toDateInputValue(record.requestedAt) || todayDateInputValue(),
    dueAt: toDateInputValue(record.dueAt),
    notes: record.notes ?? "",
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        step={step}
        value={value}
        className={error ? "border-red-300 focus-visible:ring-red-500" : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="text-xs font-medium text-red-600 dark:text-red-300">
      {message}
    </p>
  );
}

function BoxCodeField({
  value,
  onChange,
  error,
  translate,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  translate: (text: string) => string;
}) {
  const displayedValue = value.toUpperCase();
  const isComplete = isValidBoxCode(displayedValue);

  return (
    <section className="md:col-span-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/72 p-4 shadow-[0_18px_42px_rgba(16,185,129,0.12)] dark:border-emerald-300/20 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {translate("Box code")}
            </p>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-white/72 text-emerald-900 dark:border-emerald-300/22 dark:bg-emerald-400/10 dark:text-emerald-100"
            >
              {isComplete ? translate("Validated") : translate("Required first")}
            </Badge>
          </div>
          <div className="max-w-xl space-y-2">
            <Label htmlFor="form-box-code">{translate("Three-letter code")}</Label>
            <Input
              id="form-box-code"
              value={displayedValue}
              maxLength={3}
              pattern="[A-Za-z]{3}"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "form-box-code-error" : undefined}
              className={[
                "bg-white/90 font-mono text-base font-semibold uppercase shadow-sm dark:bg-white/95 dark:text-emerald-950",
                error ? "border-red-300 focus-visible:ring-red-500" : "",
              ].join(" ")}
              onChange={(event) =>
                onChange(normalizeBoxCodeInput(event.target.value))
              }
            />
            <FieldError id="form-box-code-error" message={error} />
            <p className="text-xs font-medium text-emerald-950/72 dark:text-emerald-50/74">
              {translate(
                "Exactly three letters. Numbers and special characters are not accepted."
              )}
            </p>
          </div>
        </div>
        <div className="flex justify-start lg:justify-end">
          <div className="rounded-2xl border border-emerald-100 bg-white/72 p-3 shadow-inner dark:border-emerald-300/18 dark:bg-emerald-50/12">
            <BoxCodeVisualizer code={displayedValue} />
          </div>
        </div>
      </div>
    </section>
  );
}

function BoxCodeVisualizer({ code }: { code: string }) {
  const normalizedCode = normalizeBoxCodeInput(code);
  const glyphs = Array.from(
    { length: 3 },
    (_, index) => normalizedCode[index] ?? "-"
  );

  return (
    <div className="flex items-center gap-2.5" aria-label={`Caja code ${normalizedCode}`}>
      {glyphs.map((glyph, index) => (
        <div
          key={`${glyph}-${index}`}
          className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-emerald-100 bg-white/92 text-lg font-black uppercase text-emerald-950 shadow-[0_10px_24px_rgba(16,185,129,0.16)] dark:border-emerald-300/18 dark:bg-emerald-50/94 dark:text-emerald-950"
        >
          {glyph}
        </div>
      ))}
    </div>
  );
}

function BoxCodeLinkCard({
  code,
  translate,
}: {
  code: string;
  translate: (text: string) => string;
}) {
  const normalizedCode = normalizeBoxCodeInput(code);

  return (
    <div className="md:col-span-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/72 p-4 shadow-[0_18px_42px_rgba(16,185,129,0.12)] dark:border-emerald-300/20 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {translate("Box code")}
            </p>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-white/72 text-emerald-900 dark:border-emerald-300/22 dark:bg-emerald-400/10 dark:text-emerald-100"
            >
              {translate("Validated")}
            </Badge>
          </div>
          <h3 className="font-heading text-lg font-semibold text-emerald-950 dark:text-emerald-50">
            {translate("Linked caja request")}
          </h3>
          <p className="max-w-2xl text-sm text-emerald-950/72 dark:text-emerald-50/74">
            {translate(
              "This sample request will be linked to the validated three-letter caja code. It is shown read-only here before the 2PQ case is created or selected."
            )}
          </p>
        </div>
        <BoxCodeVisualizer code={normalizedCode} />
      </div>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  error,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <OptionSelectField
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <FieldError message={error} />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        className={error ? "border-red-300 focus-visible:ring-red-500" : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read file."));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function RequestedStudyTestSection({
  title,
  value,
  mosaicismValue,
  sexValue,
  onValueChange,
  onMosaicismChange,
  onSexChange,
  errors,
  yesNoOptions,
  translate,
}: {
  title: string;
  value: string;
  mosaicismValue: string;
  sexValue: string;
  onValueChange: (value: string) => void;
  onMosaicismChange: (value: string) => void;
  onSexChange: (value: string) => void;
  errors: {
    value?: string;
    mosaicism?: string;
    sex?: string;
  };
  yesNoOptions: Array<{ value: string; label: string }>;
  translate: (text: string) => string;
}) {
  return (
    <section className="md:col-span-2 rounded-xl border border-border/70 bg-background/50 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <YesNoField
          label={title}
          value={value}
          onChange={onValueChange}
          error={errors.value}
          options={yesNoOptions}
          placeholder={translate("Select")}
        />
        {value === "si" ? (
          <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <YesNoField
              label={translate("Reports mosaicism")}
              value={mosaicismValue}
              onChange={onMosaicismChange}
              error={errors.mosaicism}
              options={yesNoOptions}
              placeholder={translate("Select")}
            />
            <YesNoField
              label={translate("Reports sex")}
              value={sexValue}
              onChange={onSexChange}
              error={errors.sex}
              options={yesNoOptions}
              placeholder={translate("Select")}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TwoPQFormFlow({
  formType,
  institutions,
  doctors,
  patients,
  cases = [],
  initialDraft = null,
}: {
  formType: TwoPQFormType;
  institutions: InstitutionListItem[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
  cases?: TwoPQListItem[];
  initialDraft?: TwoPQFormDraftRecord | null;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const router = useRouter();
  const t = (text: string) => appText(language, text);
  const steps = formType === "study_request" ? STUDY_REQUEST_STEPS : SAMPLE_STEPS;
  const matchingDraft = initialDraft?.formType === formType ? initialDraft : null;
  const scopedInstitutionId =
    adminContext.role === "institution_admin" || adminContext.role === "institution_doctor"
      ? adminContext.institutionId ?? ""
      : "";
  const scopedDoctorId =
    adminContext.role === "institution_doctor" ? adminContext.doctorId ?? "" : "";
  const defaultInstitutionId =
    scopedInstitutionId || (institutions.length === 1 ? institutions[0]?.id ?? "" : "");
  const defaultInstitution = institutions.find(
    (institution) => institution.id === defaultInstitutionId
  );
  const defaultDoctorId =
    scopedDoctorId ||
    (doctors.length === 1 && doctors[0]?.institutionId === defaultInstitutionId
      ? doctors[0]?.id ?? ""
      : "");
  const initialStepIndex = useMemo(
    () => resolveDraftStepIndex(matchingDraft, steps),
    [matchingDraft, steps]
  );
  const initialFlowState = useMemo(
    () =>
      hydrateDraftState(
        buildInitialState(
          defaultInstitutionId,
          defaultDoctorId,
          defaultInstitution?.contactEmail ?? ""
        ),
        matchingDraft
      ),
    [defaultDoctorId, defaultInstitution?.contactEmail, defaultInstitutionId, matchingDraft]
  );

  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [pending, setPending] = useState(false);
  const [draftPending, setDraftPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [state, setState] = useState<FlowState>(initialFlowState);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [stepValidation, setStepValidation] = useState<StepValidationState>(() =>
    buildInitialStepValidation(
      initialFlowState,
      steps,
      initialStepIndex,
      formType,
      language
    )
  );
  const [storageProcessingSteps, setStorageProcessingSteps] = useState<
    FormStorageProcessingStep[]
  >([]);
  const [storageProcessingError, setStorageProcessingError] = useState<string | null>(
    null
  );
  const [wholeDataValidationReport, setWholeDataValidationReport] =
    useState<WholeDataValidationReport | null>(null);
  const [storedFormId, setStoredFormId] = useState<string | null>(null);
  const currentStep = steps[stepIndex] ?? steps[0];
  const currentStepLabel = t(STEP_LABELS[currentStep]);
  const availableDoctors = doctors.filter((doctor) =>
    state.patientInformation.institutionId
      ? doctor.institutionId === state.patientInformation.institutionId
      : true
  );
  const selectedInstitution = institutions.find(
    (institution) => institution.id === state.patientInformation.institutionId
  );
  const selectedDoctor = doctors.find(
    (doctor) => doctor.id === state.patientInformation.doctorId
  );
  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));
  const doctorOptions = availableDoctors.map((doctor) => ({
    value: doctor.id,
    label: `${doctor.fullName} (${doctor.id})`,
  }));
  const requestingDoctorOptions = doctors
    .filter((doctor) =>
      state.patientInformation.institutionId
        ? doctor.institutionId === state.patientInformation.institutionId
        : true
    )
    .map((doctor) => ({
      value: doctor.id,
      label: `${doctor.fullName} (${doctor.authEmail || doctor.id})`,
    }));
  const patientOptions = patients.map((patient) => ({
    value: patient.id,
    label: `${patient.fullName} (${patient.id})`,
  }));
  const normalizedCaseBoxCode = isValidBoxCode(state.sampleInformation.boxCode)
    ? normalizeBoxCodeForValidation(state.sampleInformation.boxCode)
    : "";
  const availableCases = cases.filter((caseRecord) => {
    if (!normalizedCaseBoxCode) {
      return false;
    }
    if (
      normalizeBoxCodeInput(caseRecord.three_letter_code ?? "") !==
      normalizedCaseBoxCode
    ) {
      return false;
    }
    if (
      state.patientInformation.institutionId &&
      caseRecord.institutionId !== state.patientInformation.institutionId
    ) {
      return false;
    }
    if (
      state.patientInformation.doctorId &&
      caseRecord.doctorId !== state.patientInformation.doctorId
    ) {
      return false;
    }
    if (
      state.selectedPatientId &&
      caseRecord.patientId &&
      caseRecord.patientId !== state.selectedPatientId
    ) {
      return false;
    }
    return true;
  });
  const caseOptions = availableCases.map((caseRecord) => ({
    value: caseRecord.id,
    label: `${caseRecord.caseLabel ?? caseRecord.id} (${
      caseRecord.three_letter_code ?? caseRecord.id
    })`,
  }));
  const yesNoOptions = YES_NO_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const gameteSourceOptions = GAMETE_SOURCE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const previousMiscarriagesOptions = PREVIOUS_MISCARRIAGES_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: t(option.label),
    })
  );
  const sampleTypeOptions = SAMPLE_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const personStatusOptions = PERSON_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const caseStatusOptions = CASE_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const priorityOptions = PRIORITY_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const processingOptions = PROCESSING_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));

  const progressLabel = useMemo(
    () =>
      language === "es"
        ? `${stepIndex + 1} de ${steps.length}`
        : `${stepIndex + 1} of ${steps.length}`,
    [language, stepIndex, steps.length]
  );
  const restoredFromDraft = Boolean(matchingDraft);
  const storageProcessingCompletedCount = storageProcessingSteps.filter(
    (step) => step.status === "success"
  ).length;
  const storageProcessingBlockedCount = storageProcessingSteps.filter(
    (step) => step.status === "error"
  ).length;
  const storageProcessingPendingCount = storageProcessingSteps.filter(
    (step) => step.status === "pending"
  ).length;
  const storageProcessingPercent =
    storageProcessingSteps.length > 0
      ? storedFormId
        ? 100
        : Math.max(
            pending ? 4 : 0,
            Math.round(
              (storageProcessingCompletedCount /
                Math.max(storageProcessingSteps.length, 1)) *
                100
            )
          )
      : 0;
  const runningStorageStep = storageProcessingSteps.find(
    (step) => step.status === "running"
  );
  const processDialogOpen =
    Boolean(wholeDataValidationReport) || storageProcessingSteps.length > 0;

  function updateStorageProcessingStep(
    stepId: string,
    status: FormStorageProcessingStatus
  ) {
    setStorageProcessingSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, status } : step))
    );
  }

  async function runStorageProcessingStep(
    stepId: string,
    action?: () => Promise<void>
  ) {
    updateStorageProcessingStep(stepId, "running");
    try {
      await action?.();
      updateStorageProcessingStep(stepId, "success");
      await wait(140);
    } catch (error) {
      updateStorageProcessingStep(stepId, "error");
      throw error;
    }
  }

  async function completeStorageProcessingStepSequence(stepIds: string[]) {
    for (const stepId of stepIds) {
      updateStorageProcessingStep(stepId, "running");
      await wait(120);
      updateStorageProcessingStep(stepId, "success");
      await wait(120);
    }
  }

  async function persistDraftSnapshot(
    nextStepIndex: number,
    nextState: FlowState = state,
    options: { quiet?: boolean; errorMessage?: string } = {}
  ) {
    const boundedStepIndex = Math.min(
      Math.max(nextStepIndex, 0),
      steps.length - 1
    );
    const nextStep = steps[boundedStepIndex] ?? steps[0];

    if (!options.quiet) {
      setDraftPending(true);
    }

    try {
      await sdkFetch<{ draft: TwoPQFormDraftRecord }>("/2pq/form-draft", {
        method: "PUT",
        body: JSON.stringify({
          formType,
          currentStep: nextStep,
          stepIndex: boundedStepIndex,
          state: nextState,
        }),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: options.errorMessage ?? t("Unable to save the form draft."),
      });
      throw new Error(t("Unable to save the form draft."));
    } finally {
      if (!options.quiet) {
        setDraftPending(false);
      }
    }
  }

  useEffect(() => {
    void persistDraftSnapshot(stepIndex, state, {
      quiet: true,
      errorMessage: t("Unable to prepare the form draft."),
    }).catch(() => undefined);
  }, []);

  function updatePatientInformation(
    patch: Partial<PatientInformationFormState>
  ) {
    setState((current) => ({
      ...current,
      patientInformation: {
        ...current.patientInformation,
        ...patch,
      },
    }));
  }

  function updatePartnerInformationIncluded(includesPartnerInformation: boolean) {
    updatePatientInformation(
      includesPartnerInformation
        ? { includesPartnerInformation }
        : {
            includesPartnerInformation,
            partnerFirstName: "",
            partnerLastName: "",
            partnerMedicalRecordNumber: "",
            partnerBirthDate: "",
            partnerNotes: "",
          }
    );
  }

  function buildPatientInformationSubmission(
    patientInformation: PatientInformationFormState
  ) {
    const fullName =
      formType === "study_request"
        ? joinNameParts(patientInformation.firstName, patientInformation.lastName)
        : patientInformation.fullName.trim() ||
          joinNameParts(patientInformation.firstName, patientInformation.lastName);
    const partnerFullName = joinNameParts(
      patientInformation.partnerFirstName,
      patientInformation.partnerLastName
    );
    const hasPartnerInformation = Boolean(
      formType === "study_request" &&
        patientInformation.includesPartnerInformation &&
        (partnerFullName ||
          patientInformation.partnerMedicalRecordNumber.trim() ||
          patientInformation.partnerBirthDate.trim() ||
          patientInformation.partnerNotes.trim())
    );

    return {
      institutionId: patientInformation.institutionId,
      doctorId: patientInformation.doctorId,
      email: patientInformation.email,
      fullName,
      medicalRecordNumber: patientInformation.medicalRecordNumber,
      birthDate: patientInformation.birthDate,
      ...(formType === "study_request" ? {} : { sex: patientInformation.sex }),
      status:
        formType === "study_request"
          ? "active"
          : patientInformation.status === "inactive"
            ? "inactive"
            : "active",
      notes: patientInformation.notes,
      ...(hasPartnerInformation
        ? {
            partnerFullName,
            partnerMedicalRecordNumber:
              patientInformation.partnerMedicalRecordNumber,
            partnerBirthDate: patientInformation.partnerBirthDate,
            partnerNotes: patientInformation.partnerNotes,
          }
        : {}),
    };
  }

  function updateInstitutionInformation(
    patch: Partial<InstitutionInformationFormState>
  ) {
    setState((current) => ({
      ...current,
      institutionInformation: {
        ...current.institutionInformation,
        ...patch,
      },
    }));
  }

  function updateMedicalInformation(patch: Partial<MedicalInformationFormState>) {
    setState((current) => ({
      ...current,
      medicalInformation: { ...current.medicalInformation, ...patch },
    }));
  }

  function updatePreviousGeneticTests(
    patch: Partial<PreviousGeneticTestsFormState>
  ) {
    setState((current) => ({
      ...current,
      previousGeneticTests: { ...current.previousGeneticTests, ...patch },
    }));
  }

  async function attachKaryotypeFile(file: File) {
    if (file.size > KARYOTYPE_FILE_MAX_BYTES) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Karyotype file is too large."),
      });
      return;
    }

    try {
      const content = await fileToDataUrl(file);
      updatePreviousGeneticTests({
        karyotypeFileName: file.name,
        karyotypeFileType: file.type || "application/octet-stream",
        karyotypeFileSize: String(file.size),
        karyotypeFileContent: content,
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to read karyotype file."),
      });
    }
  }

  function clearKaryotypeFile() {
    updatePreviousGeneticTests({
      karyotypeFileName: "",
      karyotypeFileType: "",
      karyotypeFileSize: "",
      karyotypeFileContent: "",
    });
  }

  function updateRequestedTest(patch: Partial<RequestedTestFormState>) {
    setState((current) => ({
      ...current,
      requestedTest: { ...current.requestedTest, ...patch },
    }));
  }

  function updateRequestedStudyTest(
    key: "pgtAFast" | "pgtAStandard" | "pgtSr",
    value: string
  ) {
    const patch: Partial<RequestedTestFormState> = { [key]: value };
    if (key === "pgtAFast" && value !== "si") {
      patch.pgtAFastReportsMosaicism = "";
      patch.pgtAFastReportsSex = "";
    }
    if (key === "pgtAStandard" && value !== "si") {
      patch.pgtAStandardReportsMosaicism = "";
      patch.pgtAStandardReportsSex = "";
    }
    if (key === "pgtSr" && value !== "si") {
      patch.pgtSrReportsMosaicism = "";
      patch.pgtSrReportsSex = "";
    }
    updateRequestedTest(patch);
  }

  function updateSampleInformation(patch: Partial<SampleInformationFormState>) {
    setState((current) => {
      const nextSampleInformation = {
        ...current.sampleInformation,
        ...patch,
      };
      const boxCodeChanged =
        Object.prototype.hasOwnProperty.call(patch, "boxCode") &&
        patch.boxCode !== current.sampleInformation.boxCode;

      if (!boxCodeChanged) {
        return {
          ...current,
          sampleInformation: nextSampleInformation,
        };
      }

      return {
        ...current,
        selectedCaseId: "",
        sampleInformation: nextSampleInformation,
        caseInformation: newCaseDefaultsForBoxCode(
          nextSampleInformation.boxCode
        ),
      };
    });
  }

  function updateCaseInformation(patch: Partial<CaseInformationFormState>) {
    setState((current) => ({
      ...current,
      caseInformation: { ...current.caseInformation, ...patch },
    }));
  }

  function updateSamplingInformation(
    index: number,
    patch: Partial<SamplingInformationFormState>
  ) {
    setState((current) => ({
      ...current,
      samplingInformation: current.samplingInformation.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      ),
    }));
  }

  function addSamplingInformation() {
    setState((current) => ({
      ...current,
      samplingInformation: [...current.samplingInformation, emptySampling()],
    }));
  }

  function removeSamplingInformation(index: number) {
    setState((current) => ({
      ...current,
      samplingInformation:
        current.samplingInformation.length <= 1
          ? current.samplingInformation
          : current.samplingInformation.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  function selectPatient(patientId: string) {
    const patient = patients.find((candidate) => candidate.id === patientId);
    const patientInstitution = patient
      ? institutions.find((institution) => institution.id === patient.institutionId)
      : null;
    const fallbackInstitution = institutions.find(
      (institution) => institution.id === defaultInstitutionId
    );
    setState((current) => ({
      ...current,
      selectedPatientId: patientId,
      selectedCaseId: "",
      selectedRequestingDoctorId: "",
      selectedInstitutionId: patientInstitution?.id ?? current.selectedInstitutionId,
      institutionInformation: patientInstitution
        ? institutionToFormState(patientInstitution)
        : current.institutionInformation,
      patientInformation: patient
        ? patientToFormState(patient)
        : {
            ...current.patientInformation,
            institutionId: defaultInstitutionId,
            doctorId: defaultDoctorId,
            email: fallbackInstitution?.contactEmail ?? "",
            firstName: "",
            lastName: "",
            fullName: "",
          },
    }));
  }

  function selectCase(caseId: string) {
    const caseRecord = cases.find((candidate) => candidate.id === caseId);
    setState((current) => ({
      ...current,
      selectedCaseId: caseId,
      caseInformation: caseRecord
        ? caseToFormState(caseRecord)
        : newCaseDefaultsForBoxCode(current.sampleInformation.boxCode),
    }));
  }

  function selectRequestingDoctor(doctorId: string) {
    const doctor = doctors.find((candidate) => candidate.id === doctorId);
    setState((current) => ({
      ...current,
      selectedRequestingDoctorId: doctorId,
      sampleInformation: doctor
        ? {
            ...current.sampleInformation,
            requestingDoctorFullName: doctor.fullName,
            requestingDoctorAuthEmail: doctor.authEmail,
            requestingDoctorAuthUid: doctor.authUid ?? "",
            requestingDoctorSpecialty: doctor.specialty ?? "",
            requestingDoctorLicenseNumber: doctor.licenseNumber ?? "",
            requestingDoctorContactPhone: doctor.contactPhone ?? "",
            requestingDoctorStatus: doctor.status,
            requestingDoctorNotes: doctor.notes ?? "",
          }
        : current.sampleInformation,
    }));
  }

  function selectInstitution(institutionId: string) {
    const institution = institutions.find((candidate) => candidate.id === institutionId);
    setState((current) => ({
      ...current,
      selectedInstitutionId: institutionId,
      selectedRequestingDoctorId: "",
      institutionInformation: institution
        ? institutionToFormState(institution)
        : emptyInstitution(),
    }));
  }

  function errorFor(key: string) {
    return fieldErrors[key];
  }

  function setStepErrors(step: StepKey, errors: FieldErrors) {
    setFieldErrors((current) => ({
      ...Object.fromEntries(
        Object.entries(current).filter(([key]) => !isStepErrorKey(key, step))
      ),
      ...errors,
    }));
    setStepValidation((current) => ({
      ...current,
      [step]: validationStatusFor(errors),
    }));
  }

  function markSkippedStepsInvalid(nextStepIndex: number) {
    setStepValidation((current) => {
      const next: StepValidationState = { ...current };
      steps.forEach((step, index) => {
        if (index < nextStepIndex && next[step] !== "valid") {
          next[step] = "invalid";
        }
      });
      return next;
    });
  }

  async function goNext() {
    const errors = validateStepFields(currentStep, state, formType, language);
    setStepErrors(currentStep, errors);
    if (hasErrors(errors)) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: firstErrorMessage(errors),
      });
      return;
    }

    const nextStepIndex = Math.min(stepIndex + 1, steps.length - 1);
    const nextState =
      steps[nextStepIndex] === "caseInformation"
        ? withCaseDefaultsForBoxCode(state)
        : state;
    try {
      await persistDraftSnapshot(nextStepIndex, nextState);
      setState(nextState);
      setStepIndex(nextStepIndex);
    } catch {
      return;
    }
  }

  async function selectStep(nextStepIndex: number) {
    const boundedStepIndex = Math.min(
      Math.max(nextStepIndex, 0),
      steps.length - 1
    );
    if (boundedStepIndex === stepIndex) {
      return;
    }

    try {
      const nextState =
        steps[boundedStepIndex] === "caseInformation"
          ? withCaseDefaultsForBoxCode(state)
          : state;
      await persistDraftSnapshot(boundedStepIndex, nextState);
      setState(nextState);
      if (boundedStepIndex > stepIndex) {
        markSkippedStepsInvalid(boundedStepIndex);
      }
      setStepIndex(boundedStepIndex);
    } catch {
      return;
    }
  }

  async function submitForm() {
    const submissionState =
      formType === "sample" ? withCaseDefaultsForBoxCode(state) : state;
    if (submissionState !== state) {
      setState(submissionState);
    }

    setStorageProcessingSteps([]);
    setStorageProcessingError(null);
    setStoredFormId(null);
    setWholeDataValidationReport({ status: "running", issues: [] });
    setPending(true);
    await wait(180);

    const wholeValidation = validateWholeDocument({
      flowState: submissionState,
      steps,
      formType,
      language,
      institutions,
      doctors,
      patients,
      cases,
    });
    setFieldErrors(wholeValidation.fieldErrors);
    setStepValidation(wholeValidation.stepValidation);

    if (wholeValidation.issues.length > 0) {
      setWholeDataValidationReport({
        status: "error",
        issues: wholeValidation.issues,
      });
      if (wholeValidation.firstInvalidStepIndex >= 0) {
        setStepIndex(wholeValidation.firstInvalidStepIndex);
      }
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Whole data validation found issues before storage."),
      });
      setPending(false);
      return;
    }

    setWholeDataValidationReport({ status: "success", issues: [] });
    await wait(260);

    const nextStorageProcessingSteps = buildFormStorageProcessingSteps(
      submissionState,
      formType,
      language
    );
    const remoteProcessingStepIds = nextStorageProcessingSteps
      .map((step) => step.id)
      .filter((stepId) => stepId !== "validate-payload" && stepId !== "save-draft");
    setStorageProcessingSteps(nextStorageProcessingSteps);

    try {
      await runStorageProcessingStep("validate-payload", async () => wait(160));
      await runStorageProcessingStep("save-draft", async () =>
        persistDraftSnapshot(stepIndex, submissionState)
      );

      const body =
        formType === "study_request"
          ? {
              formType,
              selectedPatientId: submissionState.selectedPatientId,
              selectedInstitutionId: submissionState.selectedInstitutionId,
              patientInformation: buildPatientInformationSubmission(
                submissionState.patientInformation
              ),
              medicalInformation: submissionState.medicalInformation,
              previousGeneticTests: submissionState.previousGeneticTests,
              requestedTest: submissionState.requestedTest,
              institutionInformation: submissionState.institutionInformation,
            }
          : {
              formType,
              selectedPatientId: submissionState.selectedPatientId,
              selectedCaseId: submissionState.selectedCaseId,
              selectedRequestingDoctorId: submissionState.selectedRequestingDoctorId,
              patientInformation: buildPatientInformationSubmission(
                submissionState.patientInformation
              ),
              requestedTest: submissionState.requestedTest,
              sampleInformation: submissionState.sampleInformation,
              caseInformation: submissionState.caseInformation,
              samplingInformation: submissionState.samplingInformation,
            };
      const firstRemoteStepId = remoteProcessingStepIds[0];
      if (firstRemoteStepId) {
        updateStorageProcessingStep(firstRemoteStepId, "running");
      }
      const response = await sdkFetch<{ form: TwoPQFormRecord }>("/2pq/forms", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await completeStorageProcessingStepSequence(remoteProcessingStepIds);
      setStoredFormId(response.form.id);

      setToast({
        id: Date.now(),
        tone: "success",
        message: `${t("Form")} ${response.form.id} ${t("stored.")}`,
      });
      await wait(700);
      router.push(`/2pq-dashboard/forms?createdId=${response.form.id}`);
      router.refresh();
    } catch (error) {
      setStorageProcessingSteps((current) =>
        current.map((step) =>
          step.status === "running" ? { ...step, status: "error" } : step
        )
      );
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message
          : t("Unable to store the form. Review the form and try again.");
      setStorageProcessingError(errorMessage);
      setToast({
        id: Date.now(),
        tone: "error",
        message: errorMessage,
      });
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
      <Dialog
        open={processDialogOpen}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setWholeDataValidationReport(null);
            setStorageProcessingSteps([]);
            setStorageProcessingError(null);
            setStoredFormId(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(48rem,calc(100vh-1.5rem))] max-h-[calc(100vh-1.5rem)] min-w-[80vw] w-[80vw] max-w-[96vw] sm:max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-indigo-100 [background:linear-gradient(155deg,rgba(250,251,255,0.98),rgba(238,242,255,0.98)_54%,rgba(199,210,254,0.94))] p-0 text-indigo-950 shadow-[0_34px_120px_rgba(99,102,241,0.24)] dark:border-indigo-400/28 dark:[background:linear-gradient(150deg,rgba(17,24,39,0.98),rgba(30,27,75,0.96)_48%,rgba(79,70,229,0.22))] dark:text-indigo-50 dark:shadow-[0_30px_110px_rgba(49,46,129,0.38)]"
        >
          <DialogHeader className="relative border-b border-indigo-100 px-6 py-5 pr-16 dark:border-indigo-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
              {t("2PQ form storage")}
            </DialogTitle>
            <DialogDescription className="text-indigo-950/68 dark:text-indigo-50/72">
              {t(
                "Phase 1 validates the whole document. Phase 2 stores the scoped records and linked 2PQ entities."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <div
              className={[
                "grid gap-5",
                wholeDataValidationReport && storageProcessingSteps.length > 0
                  ? "xl:grid-cols-[minmax(24rem,0.85fr)_minmax(42rem,1.35fr)] xl:items-start"
                  : "",
              ].join(" ")}
            >
            {wholeDataValidationReport ? (
              <div className="rounded-[1.5rem] border border-indigo-100 bg-white/78 px-5 py-5 shadow-[0_14px_36px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-950/52 dark:text-indigo-50/58">
                      {t("Phase 1")}
                    </p>
                    <h3 className="mt-2 font-heading text-lg font-semibold text-indigo-950 dark:text-indigo-50">
                      {t("Whole data validation")}
                    </h3>
                    <p className="mt-2 text-sm text-indigo-950/72 dark:text-indigo-50/72">
                      {wholeDataValidationReport.status === "running"
                        ? t(
                            "Checking required fields, formats, linked records, and cross-step consistency."
                          )
                        : wholeDataValidationReport.status === "success"
                          ? t(
                              "No missing or malformed data was found. Storage processing can continue."
                            )
                          : t("Fix these issues before storage processing starts.")}
                    </p>
                  </div>
                  <Badge
                    variant={
                      wholeDataValidationReport.status === "success"
                        ? "success"
                        : wholeDataValidationReport.status === "error"
                          ? "destructive"
                          : "brand"
                    }
                    className={
                      wholeDataValidationReport.status === "running"
                        ? "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-100"
                        : undefined
                    }
                  >
                    {t(wholeDataValidationReport.status)}
                  </Badge>
                </div>

                {wholeDataValidationReport.status === "running" ? (
                  <div className="mt-5 flex items-center gap-3 rounded-[1.15rem] border border-indigo-100 bg-indigo-50/70 px-4 py-4 text-sm text-indigo-950/72 dark:border-indigo-300/16 dark:bg-indigo-400/10 dark:text-indigo-50/72">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-700 dark:text-indigo-200" />
                    {t("Running whole document validation.")}
                  </div>
                ) : null}

                {wholeDataValidationReport.status === "success" ? (
                  <div className="mt-5 flex items-center gap-3 rounded-[1.15rem] border border-emerald-200 bg-emerald-50/75 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("Whole data validation passed.")}
                  </div>
                ) : null}

                {wholeDataValidationReport.status === "error" ? (
                  <div className="mt-5 grid gap-3">
                    {wholeDataValidationReport.issues.map((issue, index) => (
                      <div
                        key={issue.id}
                        className="rounded-[1.15rem] border border-red-200 bg-red-50/82 px-4 py-4 text-red-950 dark:border-red-300/22 dark:bg-red-950/22 dark:text-red-100"
                      >
                        <div className="flex gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-semibold text-red-700 dark:border-red-300/24 dark:bg-red-400/10 dark:text-red-100">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">
                                {issue.stepLabel}
                              </p>
                              <span className="text-xs text-red-950/48 dark:text-red-100/54">
                                /
                              </span>
                              <p className="text-sm font-semibold">
                                {issue.fieldLabel}
                              </p>
                            </div>
                            <p className="mt-1 text-sm text-red-950/72 dark:text-red-100/72">
                              {issue.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {storageProcessingSteps.length > 0 ? (
            <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-indigo-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-950/52 dark:text-indigo-50/58">
                    {t("Phase 2")}
                  </p>
                  <h3 className="mt-2 font-heading text-lg font-semibold text-indigo-950 dark:text-indigo-50">
                    {t("2PQ form storage processing")}
                  </h3>
                  <p className="mt-2 text-sm text-indigo-950/72 dark:text-indigo-50/72">
                    {storageProcessingError
                      ? t("Storage paused on the blocked checklist item.")
                      : storedFormId
                        ? `${t("Form")} ${storedFormId} ${t("stored. Redirecting to forms.")}`
                        : runningStorageStep
                          ? runningStorageStep.detail
                          : t("Preparing the storage checklist.")}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-indigo-200 bg-white/72 text-indigo-950 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-50"
                >
                  {storageProcessingPercent}%
                </Badge>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-indigo-100/90 dark:bg-indigo-950/50">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(79,70,229,0.94),rgba(14,165,233,0.92))] transition-[width] duration-300"
                  style={{ width: `${storageProcessingPercent}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.15rem] border border-indigo-100 bg-white/78 px-4 py-4 dark:border-indigo-200/16 dark:bg-indigo-950/24">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-950/52 dark:text-indigo-50/58">
                    {t("Completed")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
                    {storageProcessingCompletedCount}
                  </p>
                </div>
                <div className="rounded-[1.15rem] border border-indigo-100 bg-white/78 px-4 py-4 dark:border-indigo-200/16 dark:bg-indigo-950/24">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-950/52 dark:text-indigo-50/58">
                    {t("Pending")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
                    {storageProcessingPendingCount}
                  </p>
                </div>
                <div className="rounded-[1.15rem] border border-indigo-100 bg-white/78 px-4 py-4 dark:border-indigo-200/16 dark:bg-indigo-950/24">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-950/52 dark:text-indigo-50/58">
                    {t("Blocked")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
                    {storageProcessingBlockedCount}
                  </p>
                </div>
              </div>
            </div>

            {storageProcessingError ? (
              <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                {storageProcessingError}
              </div>
            ) : null}

            <div className="grid gap-3 2xl:grid-cols-2">
              {storageProcessingSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="rounded-[1.25rem] border border-indigo-100 bg-white/76 px-4 py-4 shadow-[0_12px_30px_rgba(224,231,255,0.58)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none"
                >
                  <div className="flex gap-3">
                    <div
                      className={[
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                        step.status === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                          : step.status === "error"
                            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-300/20 dark:bg-red-400/10 dark:text-red-200"
                            : step.status === "running"
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-200"
                              : "border-indigo-100 bg-white text-indigo-400 dark:border-indigo-300/16 dark:bg-indigo-950/20 dark:text-indigo-200/58",
                      ].join(" ")}
                    >
                      {step.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : step.status === "error" ? (
                        <CircleX className="h-4 w-4" />
                      ) : step.status === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CircleDashed className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-sm font-semibold text-indigo-950 dark:text-indigo-50">
                          {step.label}
                        </p>
                        <Badge
                          variant={
                            step.status === "success"
                              ? "success"
                              : step.status === "error"
                                ? "destructive"
                                : step.status === "running"
                                  ? "brand"
                                  : "outline"
                          }
                          className={
                            step.status === "running"
                              ? "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-100"
                              : undefined
                          }
                        >
                          {t(step.status)}
                        </Badge>
                        <span className="font-mono text-xs text-indigo-950/46 dark:text-indigo-50/48">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-indigo-950/64 dark:text-indigo-50/66">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </div>
            ) : null}
            </div>
          </div>

          {wholeDataValidationReport?.status === "error" || storageProcessingError ? (
            <DialogFooter className="gap-3 border-indigo-100/90 bg-white/55 px-6 py-5 dark:border-indigo-300/14 dark:bg-indigo-950/16">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setWholeDataValidationReport(null);
                  setStorageProcessingSteps([]);
                  setStorageProcessingError(null);
                  setStoredFormId(null);
                }}
                disabled={pending}
                className="h-11 px-6"
              >
                {t("Close and review data")}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">
            <ArrowLeft className="size-3.5" />
            {t("Back to forms")}
          </Link>
        </Button>
      </div>

      <section className="glass-panel flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              {formType === "study_request" ? t("Study request form") : t("Sample")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentStepLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {restoredFromDraft ? (
              <Badge variant="rose">{t("Recovered draft")}</Badge>
            ) : null}
            {draftPending ? <Badge variant="outline">{t("Saving draft")}</Badge> : null}
            <Badge variant="outline">{progressLabel}</Badge>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((step, index) => {
            const active = step === currentStep;
            const storedStatus = stepValidation[step];
            const stepStatus =
              storedStatus === "valid" &&
              hasErrors(validateStepFields(step, state, formType, language))
                ? "invalid"
                : storedStatus;
            return (
              <button
                key={step}
                type="button"
                onClick={() => void selectStep(index)}
                disabled={pending || draftPending}
                className={[
                  "flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-indigo-300 bg-indigo-500/12 text-indigo-950 dark:border-indigo-300/40 dark:text-indigo-100"
                    : stepStatus === "invalid"
                      ? "border-red-200 bg-red-50/65 text-red-950 hover:bg-red-50 dark:border-red-300/28 dark:bg-red-950/18 dark:text-red-100"
                    : "border-border/80 bg-background/54 text-muted-foreground hover:bg-background/80",
                ].join(" ")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                      active
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_6px_14px_rgba(79,70,229,0.24)]"
                        : stepStatus === "invalid"
                          ? "border-red-300 bg-red-100 text-red-700 dark:border-red-300/42 dark:bg-red-400/12 dark:text-red-200"
                        : "border-indigo-300/80 bg-transparent text-indigo-700 dark:border-indigo-300/45 dark:text-indigo-200",
                    ].join(" ")}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate">{t(STEP_LABELS[step])}</span>
                </span>
                {stepStatus === "valid" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : stepStatus === "invalid" ? (
                  <CircleX className="size-4 text-red-600" />
                ) : null}
              </button>
            );
          })}
        </div>

        {currentStep === "patientInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>{t("Pick existing patient")}</Label>
              <OptionSelectField
                options={patientOptions}
                value={state.selectedPatientId}
                onChange={selectPatient}
                placeholder={t("Select patient")}
                emptyLabel={t("Manual patient information")}
              />
              <FieldError message={errorFor("selectedPatientId")} />
            </div>
            <div className="space-y-2">
              <Label>{t("Institution")}</Label>
              <OptionSelectField
                options={institutionOptions}
                value={state.patientInformation.institutionId}
                onChange={(institutionId) => {
                  const institution = institutions.find(
                    (candidate) => candidate.id === institutionId
                  );
                  const nextDoctors = doctors.filter(
                    (doctor) => doctor.institutionId === institutionId
                  );
                  setState((current) => ({
                    ...current,
                    selectedCaseId: "",
                    selectedRequestingDoctorId: "",
                    patientInformation: {
                      ...current.patientInformation,
                      institutionId,
                      email: institution?.contactEmail ?? current.patientInformation.email,
                      doctorId: nextDoctors.some(
                        (doctor) => doctor.id === current.patientInformation.doctorId
                      )
                        ? current.patientInformation.doctorId
                        : "",
                    },
                  }));
                }}
                placeholder={t("Select institution")}
                emptyLabel={t("No institution")}
                disabled={Boolean(scopedInstitutionId)}
              />
              <FieldError message={errorFor("patientInformation.institutionId")} />
            </div>
            <div className="space-y-2">
              <Label>{t("Doctor")}</Label>
              <OptionSelectField
                options={doctorOptions}
                value={state.patientInformation.doctorId}
                onChange={(doctorId) =>
                  setState((current) => ({
                    ...current,
                    selectedCaseId: "",
                    patientInformation: {
                      ...current.patientInformation,
                      doctorId,
                    },
                  }))
                }
                placeholder={t("Select doctor")}
                emptyLabel={t("No doctor")}
                disabled={Boolean(scopedDoctorId)}
              />
              <FieldError message={errorFor("patientInformation.doctorId")} />
            </div>
            <Field
              id="form-patient-email"
              label={
                formType === "study_request"
                  ? t("Patient reference email")
                  : t("Email")
              }
              value={state.patientInformation.email}
              onChange={(email) => updatePatientInformation({ email })}
              error={errorFor("patientInformation.email")}
            />
            {formType === "study_request" ? (
              <>
                <Field
                  id="form-patient-first-name"
                  label={t("Patient first name")}
                  value={state.patientInformation.firstName}
                  onChange={(firstName) => updatePatientInformation({ firstName })}
                  error={errorFor("patientInformation.firstName")}
                />
                <Field
                  id="form-patient-last-name"
                  label={t("Patient last name")}
                  value={state.patientInformation.lastName}
                  onChange={(lastName) => updatePatientInformation({ lastName })}
                  error={errorFor("patientInformation.lastName")}
                />
                <Field
                  id="form-patient-dni"
                  label={t("Patient DNI")}
                  value={state.patientInformation.medicalRecordNumber}
                  onChange={(medicalRecordNumber) =>
                    updatePatientInformation({ medicalRecordNumber })
                  }
                />
                <Field
                  id="form-patient-birth-date"
                  label={t("Patient birth date")}
                  type="date"
                  value={state.patientInformation.birthDate}
                  onChange={(birthDate) => updatePatientInformation({ birthDate })}
                  error={errorFor("patientInformation.birthDate")}
                />
                <div className="md:col-span-2">
                  <TextAreaField
                    id="form-patient-notes"
                    label={t("Patient notes")}
                    value={state.patientInformation.notes}
                    onChange={(notes) => updatePatientInformation({ notes })}
                  />
                </div>
                <section className="md:col-span-2">
                  <div className="border-y border-border/70 py-5">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="form-includes-partner-information"
                        checked={
                          state.patientInformation.includesPartnerInformation
                        }
                        onCheckedChange={(checked) =>
                          updatePartnerInformationIncluded(checked === true)
                        }
                      />
                      <Label
                        htmlFor="form-includes-partner-information"
                        className="cursor-pointer font-medium text-foreground"
                      >
                        {t("Includes partner information")}
                      </Label>
                    </div>
                    {state.patientInformation.includesPartnerInformation ? (
                      <div className="mt-5">
                        <h3 className="font-heading text-lg font-semibold text-foreground">
                          {t("Partner")}
                        </h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field
                            id="form-partner-first-name"
                            label={t("Partner first name")}
                            value={state.patientInformation.partnerFirstName}
                            onChange={(partnerFirstName) =>
                              updatePatientInformation({ partnerFirstName })
                            }
                          />
                          <Field
                            id="form-partner-last-name"
                            label={t("Partner last name")}
                            value={state.patientInformation.partnerLastName}
                            onChange={(partnerLastName) =>
                              updatePatientInformation({ partnerLastName })
                            }
                          />
                          <Field
                            id="form-partner-dni"
                            label={t("Partner DNI")}
                            value={
                              state.patientInformation
                                .partnerMedicalRecordNumber
                            }
                            onChange={(partnerMedicalRecordNumber) =>
                              updatePatientInformation({
                                partnerMedicalRecordNumber,
                              })
                            }
                          />
                          <Field
                            id="form-partner-birth-date"
                            label={t("Partner birth date")}
                            type="date"
                            value={state.patientInformation.partnerBirthDate}
                            onChange={(partnerBirthDate) =>
                              updatePatientInformation({ partnerBirthDate })
                            }
                            error={errorFor(
                              "patientInformation.partnerBirthDate"
                            )}
                          />
                          <div className="md:col-span-2">
                            <TextAreaField
                              id="form-partner-notes"
                              label={t("Partner notes")}
                              value={state.patientInformation.partnerNotes}
                              onChange={(partnerNotes) =>
                                updatePatientInformation({ partnerNotes })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : (
              <>
                <Field
                  id="form-patient-full-name"
                  label={t("Full name")}
                  value={state.patientInformation.fullName}
                  onChange={(fullName) => updatePatientInformation({ fullName })}
                  error={errorFor("patientInformation.fullName")}
                />
                <Field
                  id="form-patient-mrn"
                  label={t("Medical record number")}
                  value={state.patientInformation.medicalRecordNumber}
                  onChange={(medicalRecordNumber) =>
                    updatePatientInformation({ medicalRecordNumber })
                  }
                />
                <Field
                  id="form-patient-birth-date"
                  label={t("Birth date")}
                  type="date"
                  value={state.patientInformation.birthDate}
                  onChange={(birthDate) => updatePatientInformation({ birthDate })}
                  error={errorFor("patientInformation.birthDate")}
                />
                <Field
                  id="form-patient-sex"
                  label={t("Sex / gender")}
                  value={state.patientInformation.sex}
                  onChange={(sex) => updatePatientInformation({ sex })}
                />
                <div className="space-y-2">
                  <Label>{t("Status")}</Label>
                  <OptionSelectField
                    options={personStatusOptions}
                    value={state.patientInformation.status}
                    onChange={(status) =>
                      updatePatientInformation({
                        status: status === "inactive" ? "inactive" : "active",
                      })
                    }
                    placeholder={t("Select status")}
                  />
                </div>
                <div className="md:col-span-2">
                  <TextAreaField
                    id="form-patient-notes"
                    label={t("Notes")}
                    value={state.patientInformation.notes}
                    onChange={(notes) => updatePatientInformation({ notes })}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}

        {currentStep === "medicalInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="md:col-span-2">
              <div className="border-b border-border/70 pb-5">
                <div className="mb-4">
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {t("Gamete donation")}
                  </h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("Sperm")}</Label>
                    <OptionSelectField
                      options={gameteSourceOptions}
                      value={state.medicalInformation.spermGameteSource}
                      onChange={(spermGameteSource) =>
                        updateMedicalInformation({ spermGameteSource })
                      }
                      placeholder={t("Select")}
                      emptyLabel={t("Not set")}
                    />
                    <FieldError
                      message={errorFor("medicalInformation.spermGameteSource")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Oocytes")}</Label>
                    <OptionSelectField
                      options={gameteSourceOptions}
                      value={state.medicalInformation.oocyteGameteSource}
                      onChange={(oocyteGameteSource) =>
                        updateMedicalInformation({ oocyteGameteSource })
                      }
                      placeholder={t("Select")}
                      emptyLabel={t("Not set")}
                    />
                    <FieldError
                      message={errorFor("medicalInformation.oocyteGameteSource")}
                    />
                  </div>
                </div>
              </div>
            </section>
            <YesNoField
              label={t("Male factor")}
              value={state.medicalInformation.maleFactor}
              onChange={(maleFactor) => updateMedicalInformation({ maleFactor })}
              error={errorFor("medicalInformation.maleFactor")}
              options={yesNoOptions}
              placeholder={t("Select")}
            />
            <div className="space-y-2">
              <Label>{t("Previous miscarriages")}</Label>
              <OptionSelectField
                options={previousMiscarriagesOptions}
                value={state.medicalInformation.previousMiscarriagesCount}
                onChange={(previousMiscarriagesCount) =>
                  updateMedicalInformation({ previousMiscarriagesCount })
                }
                placeholder={t("Select")}
                emptyLabel={t("Not set")}
              />
              <FieldError
                message={errorFor("medicalInformation.previousMiscarriagesCount")}
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-other-background"
                label={t("Other background")}
                value={state.medicalInformation.otherBackground}
                onChange={(otherBackground) =>
                  updateMedicalInformation({ otherBackground })
                }
                error={errorFor("medicalInformation.otherBackground")}
              />
            </div>
          </div>
        ) : null}

        {currentStep === "previousGeneticTests" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <TextAreaField
                id="form-karyotype-result"
                label={t("Karyotype result")}
                value={state.previousGeneticTests.karyotypeResult}
                onChange={(karyotypeResult) =>
                  updatePreviousGeneticTests({ karyotypeResult })
                }
                error={errorFor("previousGeneticTests.karyotypeResult")}
              />
            </div>
            <div className="md:col-span-2 rounded-xl border border-border/70 bg-background/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="form-karyotype-file">
                    {t("Karyotype file")}
                  </Label>
                  {state.previousGeneticTests.karyotypeFileName ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {state.previousGeneticTests.karyotypeFileName}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("No file selected")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" asChild>
                    <label htmlFor="form-karyotype-file" className="cursor-pointer">
                      <Upload className="size-4" />
                      {t("Upload file")}
                    </label>
                  </Button>
                  {state.previousGeneticTests.karyotypeFileName ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearKaryotypeFile}
                    >
                      <X className="size-4" />
                      {t("Remove file")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <Input
                id="form-karyotype-file"
                type="file"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void attachKaryotypeFile(file);
                  }
                }}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Maximum file size: 750 KB.")}
              </p>
            </div>
          </div>
        ) : null}

        {currentStep === "requestedTest" ? (
          formType === "study_request" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <RequestedStudyTestSection
                title="PGT-A FAST"
                value={state.requestedTest.pgtAFast}
                mosaicismValue={state.requestedTest.pgtAFastReportsMosaicism}
                sexValue={state.requestedTest.pgtAFastReportsSex}
                onValueChange={(pgtAFast) =>
                  updateRequestedStudyTest("pgtAFast", pgtAFast)
                }
                onMosaicismChange={(pgtAFastReportsMosaicism) =>
                  updateRequestedTest({ pgtAFastReportsMosaicism })
                }
                onSexChange={(pgtAFastReportsSex) =>
                  updateRequestedTest({ pgtAFastReportsSex })
                }
                errors={{
                  value: errorFor("requestedTest.pgtAFast"),
                  mosaicism: errorFor("requestedTest.pgtAFastReportsMosaicism"),
                  sex: errorFor("requestedTest.pgtAFastReportsSex"),
                }}
                yesNoOptions={yesNoOptions}
                translate={t}
              />
              <RequestedStudyTestSection
                title="PGT-A STANDARD"
                value={state.requestedTest.pgtAStandard}
                mosaicismValue={
                  state.requestedTest.pgtAStandardReportsMosaicism
                }
                sexValue={state.requestedTest.pgtAStandardReportsSex}
                onValueChange={(pgtAStandard) =>
                  updateRequestedStudyTest("pgtAStandard", pgtAStandard)
                }
                onMosaicismChange={(pgtAStandardReportsMosaicism) =>
                  updateRequestedTest({ pgtAStandardReportsMosaicism })
                }
                onSexChange={(pgtAStandardReportsSex) =>
                  updateRequestedTest({ pgtAStandardReportsSex })
                }
                errors={{
                  value: errorFor("requestedTest.pgtAStandard"),
                  mosaicism: errorFor(
                    "requestedTest.pgtAStandardReportsMosaicism"
                  ),
                  sex: errorFor("requestedTest.pgtAStandardReportsSex"),
                }}
                yesNoOptions={yesNoOptions}
                translate={t}
              />
              <RequestedStudyTestSection
                title="PGT-SR"
                value={state.requestedTest.pgtSr}
                mosaicismValue={state.requestedTest.pgtSrReportsMosaicism}
                sexValue={state.requestedTest.pgtSrReportsSex}
                onValueChange={(pgtSr) =>
                  updateRequestedStudyTest("pgtSr", pgtSr)
                }
                onMosaicismChange={(pgtSrReportsMosaicism) =>
                  updateRequestedTest({ pgtSrReportsMosaicism })
                }
                onSexChange={(pgtSrReportsSex) =>
                  updateRequestedTest({ pgtSrReportsSex })
                }
                errors={{
                  value: errorFor("requestedTest.pgtSr"),
                  mosaicism: errorFor("requestedTest.pgtSrReportsMosaicism"),
                  sex: errorFor("requestedTest.pgtSrReportsSex"),
                }}
                yesNoOptions={yesNoOptions}
                translate={t}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <YesNoField
                label="PGT-A"
                value={state.requestedTest.pgtA}
                onChange={(pgtA) => updateRequestedTest({ pgtA })}
                error={errorFor("requestedTest.pgtA")}
                options={yesNoOptions}
                placeholder={t("Select")}
              />
              <YesNoField
                label="PGT-SR"
                value={state.requestedTest.pgtSr}
                onChange={(pgtSr) => updateRequestedTest({ pgtSr })}
                error={errorFor("requestedTest.pgtSr")}
                options={yesNoOptions}
                placeholder={t("Select")}
              />
            </div>
          )
        ) : null}

        {currentStep === "institutionInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>{t("Pick existing institution")}</Label>
              <OptionSelectField
                options={institutionOptions}
                value={state.selectedInstitutionId}
                onChange={selectInstitution}
                placeholder={t("Select institution")}
                emptyLabel={t("Manual institution information")}
              />
              <FieldError message={errorFor("selectedInstitutionId")} />
            </div>
            <Field
              id="form-institution-name"
              label={t("Institution name")}
              value={state.institutionInformation.name}
              onChange={(name) => updateInstitutionInformation({ name })}
              error={errorFor("institutionInformation.name")}
            />
            <Field
              id="form-institution-email"
              label={t("Contact email")}
              value={state.institutionInformation.contactEmail}
              onChange={(contactEmail) =>
                updateInstitutionInformation({ contactEmail })
              }
              error={errorFor("institutionInformation.contactEmail")}
            />
            <Field
              id="form-institution-phone"
              label={t("Contact phone")}
              value={state.institutionInformation.contactPhone}
              onChange={(contactPhone) =>
                updateInstitutionInformation({ contactPhone })
              }
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-institution-notes"
                label={t("Notes")}
                value={state.institutionInformation.notes}
                onChange={(notes) => updateInstitutionInformation({ notes })}
              />
            </div>
          </div>
        ) : null}

        {currentStep === "sampleInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <BoxCodeField
              value={state.sampleInformation.boxCode}
              onChange={(boxCode) => updateSampleInformation({ boxCode })}
              error={errorFor("sampleInformation.boxCode")}
              translate={t}
            />
            <Field
              id="form-fiv-center"
              label={t("FIV center")}
              value={state.sampleInformation.fivCenter}
              onChange={(fivCenter) => updateSampleInformation({ fivCenter })}
              error={errorFor("sampleInformation.fivCenter")}
            />
            <Field
              id="form-center-code"
              label={t("Center code")}
              value={state.sampleInformation.centerCode}
              onChange={(centerCode) => updateSampleInformation({ centerCode })}
              error={errorFor("sampleInformation.centerCode")}
            />
            <section className="md:col-span-2">
              <div className="border-y border-border/70 py-5">
                <div className="mb-4">
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {t("Requesting doctor")}
                  </h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t("Pick existing doctor")}</Label>
                    <OptionSelectField
                      options={requestingDoctorOptions}
                      value={state.selectedRequestingDoctorId}
                      onChange={selectRequestingDoctor}
                      placeholder={t("Select requesting doctor")}
                      emptyLabel={t("Manual requesting doctor information")}
                    />
                    <FieldError message={errorFor("selectedRequestingDoctorId")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="form-requesting-doctor-institution">
                      {t("Institution")}
                    </Label>
                    <Input
                      id="form-requesting-doctor-institution"
                      value={
                        selectedInstitution
                          ? `${selectedInstitution.name} (${selectedInstitution.id})`
                          : state.patientInformation.institutionId
                      }
                      disabled
                    />
                  </div>
                  <Field
                    id="form-requesting-doctor-full-name"
                    label={t("Full name")}
                    value={state.sampleInformation.requestingDoctorFullName}
                    onChange={(requestingDoctorFullName) =>
                      updateSampleInformation({ requestingDoctorFullName })
                    }
                    error={errorFor("sampleInformation.requestingDoctorFullName")}
                  />
                  <Field
                    id="form-requesting-doctor-auth-email"
                    label={t("Auth email")}
                    value={state.sampleInformation.requestingDoctorAuthEmail}
                    onChange={(requestingDoctorAuthEmail) =>
                      updateSampleInformation({ requestingDoctorAuthEmail })
                    }
                    error={errorFor("sampleInformation.requestingDoctorAuthEmail")}
                  />
                  <Field
                    id="form-requesting-doctor-auth-uid"
                    label={t("Auth UID")}
                    value={state.sampleInformation.requestingDoctorAuthUid}
                    onChange={(requestingDoctorAuthUid) =>
                      updateSampleInformation({ requestingDoctorAuthUid })
                    }
                  />
                  <div className="space-y-2">
                    <Label>{t("Status")}</Label>
                    <OptionSelectField
                      options={personStatusOptions}
                      value={state.sampleInformation.requestingDoctorStatus}
                      onChange={(requestingDoctorStatus) =>
                        updateSampleInformation({
                          requestingDoctorStatus:
                            requestingDoctorStatus === "inactive"
                              ? "inactive"
                              : "active",
                        })
                      }
                      placeholder={t("Select status")}
                    />
                  </div>
                  <Field
                    id="form-requesting-doctor-specialty"
                    label={t("Specialty")}
                    value={state.sampleInformation.requestingDoctorSpecialty}
                    onChange={(requestingDoctorSpecialty) =>
                      updateSampleInformation({ requestingDoctorSpecialty })
                    }
                  />
                  <Field
                    id="form-requesting-doctor-license"
                    label={t("License number")}
                    value={state.sampleInformation.requestingDoctorLicenseNumber}
                    onChange={(requestingDoctorLicenseNumber) =>
                      updateSampleInformation({ requestingDoctorLicenseNumber })
                    }
                  />
                  <Field
                    id="form-requesting-doctor-phone"
                    label={t("Contact phone")}
                    value={state.sampleInformation.requestingDoctorContactPhone}
                    onChange={(requestingDoctorContactPhone) =>
                      updateSampleInformation({ requestingDoctorContactPhone })
                    }
                  />
                  <div className="md:col-span-2">
                    <TextAreaField
                      id="form-requesting-doctor-notes"
                      label={t("Notes")}
                      value={state.sampleInformation.requestingDoctorNotes}
                      onChange={(requestingDoctorNotes) =>
                        updateSampleInformation({ requestingDoctorNotes })
                      }
                    />
                  </div>
                </div>
              </div>
            </section>
            <section className="md:col-span-2">
              <div className="border-b border-border/70 pb-5">
                <div className="mb-4">
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {t("Sample")}
                  </h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("Sample type")}</Label>
                    <OptionSelectField
                      options={sampleTypeOptions}
                      value={state.sampleInformation.sampleType}
                      onChange={(sampleType) =>
                        updateSampleInformation({ sampleType })
                      }
                      placeholder={t("Select")}
                    />
                    <FieldError message={errorFor("sampleInformation.sampleType")} />
                  </div>
                  <Field
                    id="form-process-date"
                    label={t("Process date")}
                    type="date"
                    value={state.sampleInformation.processDate}
                    onChange={(processDate) =>
                      updateSampleInformation({ processDate })
                    }
                    error={errorFor("sampleInformation.processDate")}
                  />
                </div>
              </div>
            </section>
            <section className="md:col-span-2">
              <div className="border-b border-border/70 pb-5">
                <div className="mb-4">
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {t("Processed by")}
                  </h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    id="form-processed-by-first-name"
                    label={t("First name")}
                    value={state.sampleInformation.processedByFirstName}
                    onChange={(processedByFirstName) =>
                      updateSampleInformation({ processedByFirstName })
                    }
                    error={errorFor("sampleInformation.processedByFirstName")}
                  />
                  <Field
                    id="form-processed-by-last-name"
                    label={t("Last name")}
                    value={state.sampleInformation.processedByLastName}
                    onChange={(processedByLastName) =>
                      updateSampleInformation({ processedByLastName })
                    }
                    error={errorFor("sampleInformation.processedByLastName")}
                  />
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentStep === "caseInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <BoxCodeLinkCard code={state.sampleInformation.boxCode} translate={t} />
            <div className="space-y-2 md:col-span-2">
              <Label>{t("Pick existing 2PQ case")}</Label>
              <OptionSelectField
                options={caseOptions}
                value={state.selectedCaseId}
                onChange={selectCase}
                placeholder={t("Select 2PQ case")}
                emptyLabel={t("Create a new 2PQ case from these fields")}
              />
              <FieldError message={errorFor("selectedCaseId")} />
            </div>
            <Field
              id="form-case-label"
              label={t("Case label")}
              value={state.caseInformation.caseLabel}
              onChange={(caseLabel) => updateCaseInformation({ caseLabel })}
              error={errorFor("caseInformation.caseLabel")}
            />
            <div className="space-y-2">
              <Label>{t("Case status")}</Label>
              <OptionSelectField
                options={caseStatusOptions}
                value={state.caseInformation.caseStatus}
                onChange={(caseStatus) => updateCaseInformation({ caseStatus })}
                placeholder={t("Select status")}
              />
              <FieldError message={errorFor("caseInformation.caseStatus")} />
            </div>
            <Field
              id="form-case-type"
              label={t("Case type")}
              value={state.caseInformation.caseType}
              onChange={(caseType) => updateCaseInformation({ caseType })}
            />
            <div className="space-y-2">
              <Label>{t("Priority")}</Label>
              <OptionSelectField
                options={priorityOptions}
                value={state.caseInformation.priority}
                onChange={(priority) => updateCaseInformation({ priority })}
                placeholder={t("Select priority")}
              />
              <FieldError message={errorFor("caseInformation.priority")} />
            </div>
            <Field
              id="form-case-tracking"
              label={t("Tracking number")}
              value={state.caseInformation.trackingNumber}
              onChange={(trackingNumber) =>
                updateCaseInformation({ trackingNumber })
              }
            />
            <Field
              id="form-case-requested-at"
              label={t("Requested at")}
              type="date"
              value={state.caseInformation.requestedAt}
              onChange={(requestedAt) => updateCaseInformation({ requestedAt })}
              error={errorFor("caseInformation.requestedAt")}
            />
            <Field
              id="form-case-due-at"
              label={t("Due at")}
              type="date"
              value={state.caseInformation.dueAt}
              onChange={(dueAt) => updateCaseInformation({ dueAt })}
              error={errorFor("caseInformation.dueAt")}
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-case-notes"
                label={t("Case notes")}
                value={state.caseInformation.notes}
                onChange={(notes) => updateCaseInformation({ notes })}
              />
            </div>
          </div>
        ) : null}

        {currentStep === "samplingInformation" ? (
          <div className="space-y-4">
            {state.samplingInformation.map((sampling, index) => (
              <div
                key={index}
                className="rounded-2xl border border-emerald-200/70 bg-emerald-50/35 p-4 dark:border-emerald-300/20 dark:bg-emerald-950/12"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {t("2PQ sampling")}
                    </p>
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      {t("Sampling")} {index + 1}
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeSamplingInformation(index)}
                    disabled={state.samplingInformation.length <= 1}
                  >
                    <Trash2 className="size-3.5" />
                    {t("Remove")}
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    id={`form-sampling-id-${index}`}
                    label={t("Sample ID")}
                    value={sampling.sampleId}
                    onChange={(sampleId) =>
                      updateSamplingInformation(index, { sampleId })
                    }
                    error={errorFor(`samplingInformation.${index}.sampleId`)}
                  />
                  <Field
                    id={`form-sampling-type-${index}`}
                    label={t("Sample type")}
                    value={sampling.sampleType}
                    onChange={(sampleType) =>
                      updateSamplingInformation(index, { sampleType })
                    }
                    error={errorFor(`samplingInformation.${index}.sampleType`)}
                  />
                  <div className="space-y-2">
                    <Label>{t("Processing status")}</Label>
                    <OptionSelectField
                      options={processingOptions}
                      value={sampling.processingStatus}
                      onChange={(processingStatus) =>
                        updateSamplingInformation(index, { processingStatus })
                      }
                      placeholder={t("Select status")}
                    />
                    <FieldError
                      message={errorFor(`samplingInformation.${index}.processingStatus`)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <TextAreaField
                      id={`form-sampling-notes-${index}`}
                      label={t("Sampling notes")}
                      value={sampling.notes}
                      onChange={(notes) => updateSamplingInformation(index, { notes })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={addSamplingInformation}
            >
              <Plus className="size-4" />
              {t("Add sampling")}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedInstitution?.name ?? state.institutionInformation.name
              ? `${t("Institution")}: ${
                  selectedInstitution?.name ?? state.institutionInformation.name
                }`
              : t("No institution selected")}{" "}
            {selectedDoctor ? `· ${t("Doctor")}: ${selectedDoctor.fullName}` : ""}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => void selectStep(stepIndex - 1)}
              disabled={stepIndex === 0 || pending || draftPending}
            >
              <ArrowLeft className="size-4" />
              {t("Previous")}
            </Button>
            {stepIndex === steps.length - 1 ? (
              <Button
                onClick={() => void submitForm()}
                disabled={pending || draftPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {pending ? <FileText className="size-4 animate-pulse" /> : <Save className="size-4" />}
                {pending ? t("Storing...") : t("Store form")}
              </Button>
            ) : (
              <Button
                onClick={() => void goNext()}
                disabled={pending || draftPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {t("Continue")}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
