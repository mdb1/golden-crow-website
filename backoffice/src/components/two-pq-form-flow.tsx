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
  Save,
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
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
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
type PreviewValidationStatus =
  | WholeDataValidationStatus
  | "draft-checkpoint-error";

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

type PreviewValidationReport = {
  status: PreviewValidationStatus;
  issues: WholeDataValidationIssue[];
  draftErrorMessage?: string;
  draftErrorDetails?: string;
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
  "institutionInformation",
  "previewAndSignature",
];

const SAMPLE_STEPS: StepKey[] = [
  "linkedStudyRequest",
  "patientInformation",
  "requestedTest",
  "sampleInformation",
  "samplingInformation",
  "previewAndSignature",
];

const STEP_LABELS: Record<StepKey, string> = {
  linkedStudyRequest: "Pick linked study request form",
  patientInformation: "Patient information",
  medicalInformation: "Medical information",
  previousGeneticTests: "Karyotype",
  requestedTest: "Requested test",
  institutionInformation: "Institution information",
  previewAndSignature: "Preview and signature",
  sampleInformation: "Biopsy form information",
  doctorInformation: "Doctor Information",
  caseInformation: "2PQ case",
  samplingInformation: "Biopsy table",
};

const VALIDATION_FIELD_LABELS: Record<string, string> = {
  linkedStudyRequest: "Linked study request form",
  linkedStudyRequestFormId: "Linked study request form",
  selectedPatientId: "Pick existing patient",
  selectedInstitutionId: "Pick existing institution",
  doctorInformation: "Doctor Information",
  selectedRequestingDoctorId: "Requesting doctor",
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
  "medicalInformation.otherBackground": "Observations",
  "previousGeneticTests.karyotype": "Has karyotype information?",
  "previousGeneticTests.karyotypeResult": "Karyotype result",
  "previousGeneticTests.karyotypeFileContent": "Karyotype file",
  "requestedTest": "Requested test",
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
  "sampleInformation.biopsyCount": "Number of biopsies",
  samplingTableGenerated: "Sampling table",
  "caseInformation.caseLabel": "Case label",
  "caseInformation.caseStatus": "Case status",
  "caseInformation.caseType": "Case type",
  "caseInformation.priority": "Priority",
  "caseInformation.requestedAt": "Requested at",
  "caseInformation.dueAt": "Due at",
  samplingInformation: "2PQ sampling",
  "samplingInformation.sampleId": "Sample ID",
  "samplingInformation.sampleType": "Sample type",
  "samplingInformation.processingStatus": "Processing status",
  "samplingInformation.internalCode": "Internal code",
  "samplingInformation.embryoStageDay": "Stage day 5, 6 or 7",
  "samplingInformation.morphology": "Morphology",
  "samplingInformation.sentUl": "Sent uL",
  "samplingInformation.biopsiedCells": "Biopsied cells",
  "samplingInformation.cellsVisualized": "Cells visualized?",
  "samplingInformation.notes": "Comments",
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
  { value: "3_or_more", label: "3 or more (recurrent)" },
];

const KARYOTYPE_FILE_MAX_BYTES = 750_000;

const SAMPLE_TYPE_OPTIONS = [
  { value: "biopsia de trofoectodermo", label: "Trophectoderm biopsy" },
  {
    value: "rebiopsia de trofoectodermo",
    label: "Trophectoderm rebiopsy",
  },
  { value: "otro", label: "Other" },
];

const SAMPLE_CASE_TYPE_OPTIONS = [
  { value: "PGT FAST", label: "PGT FAST" },
  { value: "PGT SR", label: "PGT SR" },
  { value: "PGT A STANDARD", label: "PGT A STANDARD" },
];

const REQUESTED_STUDY_TEST_OPTIONS = [
  { value: "pgtSr", label: "PGT SR" },
  { value: "pgtAStandard", label: "PGT A standard" },
  { value: "pgtAFast", label: "PGT A fast" },
];

const REQUESTED_TEST_TO_CASE_TYPE: Record<string, string> = {
  pgtSr: "PGT SR",
  pgtAStandard: "PGT A STANDARD",
  pgtAFast: "PGT FAST",
};

const MORPHOLOGY_PATTERN = /^[a-zA-Z0-9]{1,3}$/;

const BIOPSY_COUNT_OPTIONS = Array.from({ length: 30 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: value };
});

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
      "linked-study-request",
      t("Link study request form"),
      flowState.linkedStudyRequestFormId
        ? `${t("Use form")} ${flowState.linkedStudyRequestFormId} ${t("as the linked study request.")}`
        : t("Confirm the sample has a linked study request form.")
    ),
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
      "requesting-doctor",
      t("Link selected requesting doctor"),
      `${t("Use doctor")} ${
        flowState.selectedRequestingDoctorId || flowState.patientInformation.doctorId
      } ${t("as requesting doctor.")}`
    ),
    pendingProcessingStep(
      "case",
      flowState.selectedCaseId
        ? t("Link existing 2PQ case")
        : `${t("Create 2PQ case")} ${caseLabel}`,
      flowState.selectedCaseId
        ? `${t("Use case")} ${flowState.selectedCaseId} ${t("after confirming it matches box code")} ${boxCode}.`
        : t(
            "Create the case from the 2PQ case step and attach it to the patient, institution, and doctor."
          )
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
      t("Persist the form with linked study request, patient, case, sample, and sampling records.")
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
    caseType: "",
    priority: "",
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

function priorityForSampleCaseType(caseType: string) {
  return caseType === "PGT FAST" ? "urgent" : caseType ? "routine" : "";
}

function withCaseDefaultsForBoxCode(flowState: FlowState): FlowState {
  if (flowState.selectedCaseId) {
    return flowState;
  }

  const defaults = newCaseDefaultsForBoxCode(flowState.sampleInformation.boxCode);
  const currentCase = flowState.caseInformation;
  const nextCase = {
    ...currentCase,
    caseLabel: defaults.caseLabel,
    caseStatus: "intake",
    priority:
      currentCase.priority || priorityForSampleCaseType(currentCase.caseType),
    requestedAt: todayDateInputValue(),
    dueAt: "",
    trackingNumber: "",
  };

  if (
    nextCase.caseLabel === currentCase.caseLabel &&
    nextCase.caseStatus === currentCase.caseStatus &&
    nextCase.priority === currentCase.priority &&
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
    internalCode: "",
    embryoStageDay: "",
    morphology: "",
    sentUl: "",
    biopsiedCells: "",
    cellsVisualized: "",
    notes: "",
  };
}

function generatedSamplingSampleId(boxCode: string, index: number) {
  const normalizedBoxCode = normalizeBoxCodeInput(boxCode);
  return normalizedBoxCode
    ? `${normalizedBoxCode}${String(index + 1).padStart(3, "0")}`
    : "";
}

function generatedSamplingNotes(index: number, rowCount: number) {
  if (index === rowCount - 2) {
    return "CONTROL";
  }
  if (index === rowCount - 1) {
    return "BLANCO";
  }
  return "";
}

function answerToFormValue(value: unknown) {
  if (value === true) return "si";
  if (value === false) return "no";
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(normalized)) return "si";
  if (["no", "false", "0"].includes(normalized)) return "no";
  return "";
}

function selectedRequestedTestKey(requestedTest: RequestedTestFormState) {
  if (answerToFormValue(requestedTest.pgtSr) === "si") return "pgtSr";
  if (answerToFormValue(requestedTest.pgtAStandard) === "si") {
    return "pgtAStandard";
  }
  if (answerToFormValue(requestedTest.pgtAFast) === "si") return "pgtAFast";
  return "";
}

function requestedTestKeyLabel(key: string) {
  return REQUESTED_STUDY_TEST_OPTIONS.find((option) => option.value === key)?.label ?? "";
}

function caseTypeForRequestedTestKey(key: string) {
  return REQUESTED_TEST_TO_CASE_TYPE[key] ?? "";
}

function requestedTestKeyFromRecord(record: Record<string, unknown> | undefined) {
  if (!record) return "";
  if (answerToFormValue(record.pgtSr) === "si") return "pgtSr";
  if (answerToFormValue(record.pgtAStandard) === "si") return "pgtAStandard";
  if (answerToFormValue(record.pgtAFast) === "si") return "pgtAFast";
  const testName = stringField(record, "testName").toUpperCase();
  if (testName.includes("PGT SR")) return "pgtSr";
  if (testName.includes("STANDARD")) return "pgtAStandard";
  if (testName.includes("FAST")) return "pgtAFast";
  return "";
}

function requestedTestToFormState(
  record: Record<string, unknown> | undefined,
  fallback: RequestedTestFormState
): RequestedTestFormState {
  if (!record) {
    return fallback;
  }

  return {
    ...fallback,
    pgtAFast: answerToFormValue(record.pgtAFast),
    pgtAFastReportsMosaicism: answerToFormValue(record.pgtAFastReportsMosaicism),
    pgtAFastReportsSex: answerToFormValue(record.pgtAFastReportsSex),
    pgtAStandard: answerToFormValue(record.pgtAStandard),
    pgtAStandardReportsMosaicism: answerToFormValue(
      record.pgtAStandardReportsMosaicism
    ),
    pgtAStandardReportsSex: answerToFormValue(record.pgtAStandardReportsSex),
    pgtSr: answerToFormValue(record.pgtSr),
    pgtSrReportsMosaicism: answerToFormValue(record.pgtSrReportsMosaicism),
    pgtSrReportsSex: answerToFormValue(record.pgtSrReportsSex),
    testName: stringField(record, "testName") || fallback.testName,
    testCode: stringField(record, "testCode") || fallback.testCode,
    priority: stringField(record, "priority") || fallback.priority,
    reason: stringField(record, "reason") || fallback.reason,
    notes: stringField(record, "notes") || fallback.notes,
  };
}

function withRequestedStudyTestSelection(
  current: RequestedTestFormState,
  selectedKey: string
): RequestedTestFormState {
  const pgtAFastSelected = selectedKey === "pgtAFast";
  const pgtAStandardSelected = selectedKey === "pgtAStandard";
  const pgtSrSelected = selectedKey === "pgtSr";

  return {
    ...current,
    testName: requestedTestKeyLabel(selectedKey),
    pgtAFast: selectedKey ? (pgtAFastSelected ? "si" : "no") : "",
    pgtAFastReportsMosaicism: pgtAFastSelected
      ? current.pgtAFastReportsMosaicism
      : "",
    pgtAFastReportsSex: pgtAFastSelected ? current.pgtAFastReportsSex : "",
    pgtAStandard: selectedKey ? (pgtAStandardSelected ? "si" : "no") : "",
    pgtAStandardReportsMosaicism: pgtAStandardSelected
      ? current.pgtAStandardReportsMosaicism
      : "",
    pgtAStandardReportsSex: pgtAStandardSelected
      ? current.pgtAStandardReportsSex
      : "",
    pgtSr: selectedKey ? (pgtSrSelected ? "si" : "no") : "",
    pgtSrReportsMosaicism: pgtSrSelected ? current.pgtSrReportsMosaicism : "",
    pgtSrReportsSex: pgtSrSelected ? current.pgtSrReportsSex : "",
  };
}

function withGeneratedSamplingTable(flowState: FlowState): FlowState {
  const biopsyCount = Number(flowState.sampleInformation.biopsyCount);
  if (!Number.isInteger(biopsyCount) || biopsyCount <= 0) {
    return flowState;
  }

  const rowCount = biopsyCount + 2;
  return {
    ...flowState,
    samplingTableGenerated: true,
    samplingInformation: Array.from({ length: rowCount }, (_, index) => ({
      ...(flowState.samplingInformation[index] ?? emptySampling()),
      sampleId: generatedSamplingSampleId(flowState.sampleInformation.boxCode, index),
      sampleType: flowState.sampleInformation.sampleType,
      processingStatus: "awaiting_reception",
      notes: generatedSamplingNotes(index, rowCount),
    })),
  };
}

function displayCaseLabel(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const xxxMatch = /^([A-Za-z]{3})XXX$/i.exec(normalized);
  return xxxMatch ? xxxMatch[1].toUpperCase() : normalized;
}

function buildInitialState(
  institutionId: string,
  doctorId: string,
  referenceEmail = ""
): FlowState {
  return {
    linkedStudyRequestFormId: "",
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
      biopsyCount: "",
    },
    caseInformation: emptyCase(),
    samplingInformation: [emptySampling()],
    samplingTableGenerated: false,
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
    (step === "linkedStudyRequest" && key === "linkedStudyRequestFormId") ||
    (step === "patientInformation" && key === "selectedPatientId") ||
    (step === "institutionInformation" && key === "selectedInstitutionId") ||
    (step === "doctorInformation" && key === "selectedRequestingDoctorId") ||
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
    internalCode: merged.internalCode,
    embryoStageDay: merged.embryoStageDay,
    morphology: merged.morphology,
    sentUl: merged.sentUl,
    biopsiedCells: merged.biopsiedCells,
    cellsVisualized: merged.cellsVisualized,
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
    linkedStudyRequestFormId:
      typeof draftState.linkedStudyRequestFormId === "string"
        ? draftState.linkedStudyRequestFormId
        : defaultState.linkedStudyRequestFormId,
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
    samplingTableGenerated:
      typeof draftState.samplingTableGenerated === "boolean"
        ? draftState.samplingTableGenerated
        : defaultState.samplingTableGenerated,
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

  if (step === "linkedStudyRequest") {
    if (!flowState.linkedStudyRequestFormId.trim()) {
      errors.linkedStudyRequestFormId = t("Select a linked study request form.");
    }
  }

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
      errors["medicalInformation.otherBackground"] = t("Observations are required.");
    }
  }

  if (step === "previousGeneticTests") {
    if (!flowState.previousGeneticTests.karyotype) {
      errors["previousGeneticTests.karyotype"] =
        t("Select whether there is karyotype information.");
    }
    if (
      flowState.previousGeneticTests.karyotype === "si" &&
      !flowState.previousGeneticTests.karyotypeFileContent.trim()
    ) {
      errors["previousGeneticTests.karyotypeFileContent"] =
        t("Attach the karyotype file.");
    }
  }

  if (step === "requestedTest") {
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
    const selectedTestKey = selectedRequestedTestKey(flowState.requestedTest);

    if (!selectedTestKey) {
      errors.requestedTest = t("Select one requested test.");
    }

    requestedStudyTests.forEach((test) => {
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

    if (requestedStudyTests.filter((test) => test.value === "si").length > 1) {
      errors.requestedTest = t("Select only one requested test.");
    }

    if (formType === "study_request") {
      if (!flowState.previousGeneticTests.karyotype) {
        errors["previousGeneticTests.karyotype"] =
          t("Select whether there is karyotype information.");
      }
      if (
        flowState.previousGeneticTests.karyotype === "si" &&
        !flowState.previousGeneticTests.karyotypeFileContent.trim()
      ) {
        errors["previousGeneticTests.karyotypeFileContent"] =
          t("Attach the karyotype file.");
      }

      return errors;
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
    const biopsyCount = Number(flowState.sampleInformation.biopsyCount);
    if (
      !flowState.sampleInformation.biopsyCount ||
      !Number.isInteger(biopsyCount) ||
      biopsyCount <= 0
    ) {
      errors["sampleInformation.biopsyCount"] = t("Select number of biopsies.");
    }
  }

  if (step === "doctorInformation") {
    const requestingDoctorId =
      flowState.selectedRequestingDoctorId || flowState.patientInformation.doctorId;
    if (!requestingDoctorId.trim()) {
      errors.selectedRequestingDoctorId = t("Requesting doctor is required.");
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
    if (!flowState.caseInformation.caseType.trim()) {
      errors["caseInformation.caseType"] = t("Select a 2PQ case type.");
    } else if (
      !SAMPLE_CASE_TYPE_OPTIONS.some(
        (option) => option.value === flowState.caseInformation.caseType
      )
    ) {
      errors["caseInformation.caseType"] = t("Case type is not valid.");
    }
    if (!flowState.caseInformation.priority.trim()) {
      errors["caseInformation.priority"] = t("Priority is required.");
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
    const biopsyCount = Number(flowState.sampleInformation.biopsyCount);
    if (
      !flowState.sampleInformation.biopsyCount ||
      !Number.isInteger(biopsyCount) ||
      biopsyCount <= 0
    ) {
      errors["sampleInformation.biopsyCount"] = t("Select number of biopsies.");
    }
    if (!flowState.samplingTableGenerated) {
      errors.samplingTableGenerated = t("Generate the sampling table.");
    } else if (
      Number.isInteger(biopsyCount) &&
      biopsyCount > 0 &&
      flowState.samplingInformation.length !== biopsyCount + 2
    ) {
      errors.samplingTableGenerated = t(
        "Sampling table row count must match number of biopsies plus two."
      );
    }
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
      if (
        sampling.embryoStageDay &&
        !["5", "6", "7"].includes(sampling.embryoStageDay)
      ) {
        errors[`samplingInformation.${index}.embryoStageDay`] =
          `${row}: ${t("Stage day must be 5, 6 or 7.")}`;
      }
      if (sampling.morphology && !MORPHOLOGY_PATTERN.test(sampling.morphology)) {
        errors[`samplingInformation.${index}.morphology`] =
          `${row}: ${t("Morphology must be 1 to 3 alphanumeric characters.")}`;
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
  studyRequestForms,
}: {
  flowState: FlowState;
  steps: StepKey[];
  formType: TwoPQFormType;
  language: AppLanguage;
  institutions: InstitutionListItem[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
  cases: TwoPQListItem[];
  studyRequestForms: TwoPQFormRecord[];
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
    const linkedStudyRequestForm = studyRequestForms.find(
      (form) => form.id === flowState.linkedStudyRequestFormId
    );
    if (!flowState.linkedStudyRequestFormId) {
      addIssue(
        "linkedStudyRequest",
        "linkedStudyRequestFormId",
        t("Select a linked study request form.")
      );
    } else if (!linkedStudyRequestForm) {
      addIssue(
        "linkedStudyRequest",
        "linkedStudyRequestFormId",
        t("Linked study request form is not available in the current lookup data.")
      );
    } else {
      const linkedPatientId =
        linkedStudyRequestForm.selectedPatientId ??
        (typeof linkedStudyRequestForm.patientInformation.patientId === "string"
          ? linkedStudyRequestForm.patientInformation.patientId
          : "");
      const linkedDoctorId = formDoctorId(linkedStudyRequestForm);
      if (
        linkedStudyRequestForm.institutionId !== institutionId ||
        linkedDoctorId !== doctorId
      ) {
        addIssue(
          "linkedStudyRequest",
          "linkedStudyRequestFormId",
          t("Linked study request form must match the patient institution and doctor.")
        );
      }
      if (
        linkedPatientId &&
        flowState.selectedPatientId &&
        linkedPatientId !== flowState.selectedPatientId
      ) {
        addIssue(
          "linkedStudyRequest",
          "linkedStudyRequestFormId",
          t("Linked study request form must match the selected patient.")
        );
      }
    }

    const boxCode = normalizeBoxCodeForValidation(flowState.sampleInformation.boxCode);
    const selectedRequestingDoctorId =
      flowState.selectedRequestingDoctorId || doctorId;
    if (!selectedRequestingDoctorId) {
      addIssue(
        "doctorInformation",
        "selectedRequestingDoctorId",
        t("Requesting doctor is required.")
      );
    } else {
      const requestingDoctor = doctors.find(
        (doctor) => doctor.id === selectedRequestingDoctorId
      );
      if (!requestingDoctor) {
        addIssue(
          "doctorInformation",
          "selectedRequestingDoctorId",
          t("Selected requesting doctor is not available in the current lookup data.")
        );
      } else if (requestingDoctor.institutionId !== institutionId) {
        addIssue(
          "doctorInformation",
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

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function formDoctorId(form: TwoPQFormRecord) {
  return form.doctorId || stringField(form.patientInformation, "doctorId");
}

function studyRequestPatientToFormState(
  form: TwoPQFormRecord
): PatientInformationFormState {
  const patientInformation = form.patientInformation;
  const fullName =
    stringField(patientInformation, "fullName") || form.patientName || "";
  const splitName = splitFullName(fullName);
  const partnerFullName = stringField(patientInformation, "partnerFullName");
  const splitPartnerName = splitFullName(partnerFullName);

  return {
    institutionId: form.institutionId,
    doctorId: formDoctorId(form),
    email: stringField(patientInformation, "email") || form.patientEmail || "",
    firstName: stringField(patientInformation, "firstName") || splitName.firstName,
    lastName: stringField(patientInformation, "lastName") || splitName.lastName,
    fullName,
    medicalRecordNumber: stringField(patientInformation, "medicalRecordNumber"),
    birthDate: toDateInputValue(stringField(patientInformation, "birthDate")),
    sex: stringField(patientInformation, "sex"),
    status:
      stringField(patientInformation, "status") === "inactive"
        ? "inactive"
        : "active",
    notes: stringField(patientInformation, "notes"),
    includesPartnerInformation: Boolean(
      partnerFullName ||
        stringField(patientInformation, "partnerMedicalRecordNumber") ||
        stringField(patientInformation, "partnerBirthDate") ||
        stringField(patientInformation, "partnerNotes")
    ),
    partnerFirstName: splitPartnerName.firstName,
    partnerLastName: splitPartnerName.lastName,
    partnerMedicalRecordNumber: stringField(
      patientInformation,
      "partnerMedicalRecordNumber"
    ),
    partnerBirthDate: toDateInputValue(
      stringField(patientInformation, "partnerBirthDate")
    ),
    partnerNotes: stringField(patientInformation, "partnerNotes"),
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

function applyScopedInstitutionSelection(
  flowState: FlowState,
  institution: InstitutionListItem | undefined
): FlowState {
  if (!institution) {
    return flowState;
  }

  return {
    ...flowState,
    selectedInstitutionId: institution.id,
    institutionInformation: institutionToFormState(institution),
    patientInformation: {
      ...flowState.patientInformation,
      institutionId: institution.id,
      email:
        flowState.patientInformation.email ||
        institution.contactEmail ||
        "",
    },
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

type PreviewField = {
  label: string;
  value: string;
  wide?: boolean;
};

type PreviewSectionData = {
  title: string;
  fields: PreviewField[];
};

function PreviewPaperSection({ section }: { section: PreviewSectionData }) {
  return (
    <section className="border-t border-black/12 pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-heading text-base font-semibold text-black">
        {section.title}
      </h3>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {section.fields.map((field) => (
          <div
            key={`${section.title}-${field.label}`}
            className={field.wide ? "sm:col-span-2" : undefined}
          >
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-black/55">
              {field.label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap break-words border-b border-black/12 pb-2 text-sm leading-6 text-black">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
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
  studyRequestForms = [],
  initialDraft = null,
}: {
  formType: TwoPQFormType;
  institutions: InstitutionListItem[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
  cases?: TwoPQListItem[];
  studyRequestForms?: TwoPQFormRecord[];
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
    () => {
      const hydratedState = hydrateDraftState(
        buildInitialState(
          defaultInstitutionId,
          defaultDoctorId,
          defaultInstitution?.contactEmail ?? ""
        ),
        matchingDraft
      );

      return scopedInstitutionId
        ? applyScopedInstitutionSelection(hydratedState, defaultInstitution)
        : hydratedState;
    },
    [
      defaultDoctorId,
      defaultInstitution,
      defaultInstitution?.contactEmail,
      defaultInstitutionId,
      matchingDraft,
      scopedInstitutionId,
    ]
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
  const [previewValidationReport, setPreviewValidationReport] =
    useState<PreviewValidationReport | null>(null);
  const [storedFormId, setStoredFormId] = useState<string | null>(null);
  const [doctorResponsibilityAlertOpen, setDoctorResponsibilityAlertOpen] =
    useState(false);
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
  const requestingDoctorId =
    state.selectedRequestingDoctorId || state.patientInformation.doctorId;
  const selectedRequestingDoctor = requestingDoctorId
    ? doctors.find((doctor) => doctor.id === requestingDoctorId)
    : null;
  const selectedPatient = patients.find(
    (patient) => patient.id === state.selectedPatientId
  );
  const selectedStudyRequestForm = studyRequestForms.find(
    (form) => form.id === state.linkedStudyRequestFormId
  );
  const selectedStudyRequestDoctorId = selectedStudyRequestForm
    ? formDoctorId(selectedStudyRequestForm)
    : "";
  const selectedStudyRequestDoctor = selectedStudyRequestDoctorId
    ? doctors.find((doctor) => doctor.id === selectedStudyRequestDoctorId)
    : null;
  const studyRequestFormOptions = studyRequestForms.map((form) => {
    const linkedDoctorId = formDoctorId(form);
    const linkedDoctor = linkedDoctorId
      ? doctors.find((doctor) => doctor.id === linkedDoctorId)
      : null;

    return {
      value: form.id,
      label: [
        form.patientName || stringField(form.patientInformation, "fullName") || form.id,
        form.requestedTestName,
        linkedDoctor?.fullName || linkedDoctorId,
        form.createdAt ? toDateInputValue(form.createdAt) : "",
        form.id,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));
  const doctorOptions = availableDoctors.map((doctor) => ({
    value: doctor.id,
    label: `${doctor.fullName} (${doctor.id})`,
  }));
  const patientOptions = patients.map((patient) => ({
    value: patient.id,
    label: `${patient.fullName} (${patient.id})`,
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
  const sampleCaseTypeOptions = SAMPLE_CASE_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const requestedStudyTestOptions = REQUESTED_STUDY_TEST_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  const biopsyCountOptions = BIOPSY_COUNT_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  const sampleTypeOptions = SAMPLE_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const personStatusOptions = PERSON_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const processingOptions = PROCESSING_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label),
  }));
  const selectedRequestedTest = selectedRequestedTestKey(state.requestedTest);
  const selectedStudyRequestOriginalTest = requestedTestKeyFromRecord(
    selectedStudyRequestForm?.requestedTest
  );
  const sampleRequestedTestChanged = Boolean(
    formType === "sample" &&
      selectedStudyRequestOriginalTest &&
      selectedRequestedTest &&
      selectedStudyRequestOriginalTest !== selectedRequestedTest
  );
  const selectedCaseType = caseTypeForRequestedTestKey(selectedRequestedTest);
  const notProvidedLabel = t("Not provided");
  const previewValue = (value: string | undefined | null) =>
    value?.trim() || notProvidedLabel;
  const previewOptionValue = (
    options: Array<{ value: string; label: string }>,
    value: string | undefined | null
  ) => {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      return notProvidedLabel;
    }

    return options.find((option) => option.value === normalizedValue)?.label ??
      normalizedValue;
  };
  const previewDateValue = (value: string | undefined | null) => {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      return notProvidedLabel;
    }

    if (!optionalValidDateInput(normalizedValue)) {
      return normalizedValue;
    }

    const [year, month, day] = normalizedValue.split("-").map(Number);
    return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  const previewFileSizeValue = (value: string) => {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) {
      return notProvidedLabel;
    }

    return `${Math.round(size / 1024)} KB`;
  };
  const karyotypeImageContent =
    state.previousGeneticTests.karyotypeFileContent.startsWith("data:image/")
      ? state.previousGeneticTests.karyotypeFileContent
      : "";
  const doctorInformationPreviewSection: PreviewSectionData = {
    title: t("Requesting doctor"),
    fields: [
      {
        label: t("Doctor ID"),
        value: previewValue(requestingDoctorId),
      },
      {
        label: t("Institution ID"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.institutionId)
          : previewValue(state.patientInformation.institutionId),
      },
      {
        label: t("Institution name"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.institutionName)
          : previewValue(selectedInstitution?.name),
      },
      {
        label: t("Full name"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.fullName)
          : previewValue(""),
      },
      {
        label: t("Auth email"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.authEmail)
          : previewValue(""),
      },
      {
        label: t("Auth UID"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.authUid)
          : previewValue(""),
      },
      {
        label: t("Specialty"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.specialty)
          : previewValue(""),
      },
      {
        label: t("License number"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.licenseNumber)
          : previewValue(""),
      },
      {
        label: t("Contact phone"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.contactPhone)
          : previewValue(""),
      },
      {
        label: t("Status"),
        value: selectedRequestingDoctor
          ? previewValue(
              t(selectedRequestingDoctor.status === "inactive" ? "Inactive" : "Active")
            )
          : previewValue(""),
      },
      {
        label: t("Notes"),
        value: selectedRequestingDoctor
          ? previewValue(selectedRequestingDoctor.notes)
          : previewValue(""),
        wide: true,
      },
    ],
  };
  const previewSelectedPatient = selectedPatient
    ? `${selectedPatient.fullName} (${selectedPatient.id})`
    : state.selectedPatientId || t("Manual patient information");
  const previewSelectedInstitution = selectedInstitution
    ? `${selectedInstitution.name} (${selectedInstitution.id})`
    : state.selectedInstitutionId || t("Manual institution information");
  const patientPreviewFields: PreviewField[] = [
    { label: t("Pick existing patient"), value: previewSelectedPatient },
    {
      label: t("Institution"),
      value: selectedInstitution
        ? `${selectedInstitution.name} (${selectedInstitution.id})`
        : previewValue(state.patientInformation.institutionId),
    },
    {
      label: t("Doctor"),
      value: selectedDoctor
        ? `${selectedDoctor.fullName} (${selectedDoctor.id})`
        : previewValue(state.patientInformation.doctorId),
    },
    {
      label: t("Patient reference email"),
      value: previewValue(state.patientInformation.email),
    },
    {
      label: t("Patient DNI"),
      value: previewValue(state.patientInformation.medicalRecordNumber),
    },
    {
      label: t("Patient first name"),
      value: previewValue(state.patientInformation.firstName),
    },
    {
      label: t("Patient last name"),
      value: previewValue(state.patientInformation.lastName),
    },
    {
      label: t("Patient birth date"),
      value: previewDateValue(state.patientInformation.birthDate),
    },
    {
      label: t("Patient notes"),
      value: previewValue(state.patientInformation.notes),
      wide: true,
    },
    {
      label: t("Includes partner information"),
      value: state.patientInformation.includesPartnerInformation
        ? t("Yes")
        : t("No"),
    },
  ];
  const partnerPreviewFields: PreviewField[] =
    state.patientInformation.includesPartnerInformation
      ? [
          {
            label: t("Partner first name"),
            value: previewValue(state.patientInformation.partnerFirstName),
          },
          {
            label: t("Partner last name"),
            value: previewValue(state.patientInformation.partnerLastName),
          },
          {
            label: t("Partner DNI"),
            value: previewValue(
              state.patientInformation.partnerMedicalRecordNumber
            ),
          },
          {
            label: t("Partner birth date"),
            value: previewDateValue(state.patientInformation.partnerBirthDate),
          },
          {
            label: t("Partner notes"),
            value: previewValue(state.patientInformation.partnerNotes),
            wide: true,
          },
        ]
      : [];
  const studyRequestPreviewSections: PreviewSectionData[] = [
    {
      title: t("Patient data"),
      fields: [...patientPreviewFields, ...partnerPreviewFields],
    },
    {
      title: t("Medical data"),
      fields: [
        {
          label: t("Previous miscarriages"),
          value: previewOptionValue(
            previousMiscarriagesOptions,
            state.medicalInformation.previousMiscarriagesCount
          ),
        },
        {
          label: t("Male factor"),
          value: previewOptionValue(yesNoOptions, state.medicalInformation.maleFactor),
        },
        {
          label: t("Sperm"),
          value: previewOptionValue(
            gameteSourceOptions,
            state.medicalInformation.spermGameteSource
          ),
        },
        {
          label: t("Oocytes"),
          value: previewOptionValue(
            gameteSourceOptions,
            state.medicalInformation.oocyteGameteSource
          ),
        },
        {
          label: t("Observations"),
          value: previewValue(state.medicalInformation.otherBackground),
          wide: true,
        },
      ],
    },
    {
      title: t("Requested test and karyotype"),
      fields: [
        {
          label: t("Requested test"),
          value: previewValue(requestedTestKeyLabel(selectedRequestedTest)),
        },
        {
          label: t("Reports mosaicism"),
          value: previewOptionValue(
            yesNoOptions,
            selectedRequestedTest === "pgtAFast"
              ? state.requestedTest.pgtAFastReportsMosaicism
              : selectedRequestedTest === "pgtAStandard"
                ? state.requestedTest.pgtAStandardReportsMosaicism
                : selectedRequestedTest === "pgtSr"
                  ? state.requestedTest.pgtSrReportsMosaicism
                  : ""
          ),
        },
        {
          label: t("Reports sex"),
          value: previewOptionValue(
            yesNoOptions,
            selectedRequestedTest === "pgtAFast"
              ? state.requestedTest.pgtAFastReportsSex
              : selectedRequestedTest === "pgtAStandard"
                ? state.requestedTest.pgtAStandardReportsSex
                : selectedRequestedTest === "pgtSr"
                  ? state.requestedTest.pgtSrReportsSex
                  : ""
          ),
        },
        {
          label: t("Has karyotype information?"),
          value: previewOptionValue(
            yesNoOptions,
            state.previousGeneticTests.karyotype
          ),
        },
        {
          label: t("Karyotype file name"),
          value: previewValue(state.previousGeneticTests.karyotypeFileName),
        },
        {
          label: t("Karyotype file type"),
          value: previewValue(state.previousGeneticTests.karyotypeFileType),
        },
        {
          label: t("Karyotype file size"),
          value: previewFileSizeValue(
            state.previousGeneticTests.karyotypeFileSize
          ),
        },
      ],
    },
    {
      title: t("Institution data"),
      fields: [
        {
          label: t("Pick existing institution"),
          value: previewSelectedInstitution,
        },
        {
          label: t("Institution name"),
          value: previewValue(state.institutionInformation.name),
        },
        {
          label: t("Contact email"),
          value: previewValue(state.institutionInformation.contactEmail),
        },
        {
          label: t("Contact phone"),
          value: previewValue(state.institutionInformation.contactPhone),
        },
        {
          label: t("Notes"),
          value: previewValue(state.institutionInformation.notes),
          wide: true,
        },
      ],
    },
  ];
  const linkedStudyCreatedDate = selectedStudyRequestForm?.createdAt
    ? previewDateValue(toDateInputValue(selectedStudyRequestForm.createdAt))
    : notProvidedLabel;
  const biopsyFormPreviewSections: PreviewSectionData[] = [
    {
      title: t("Linked study request form"),
      fields: [
        {
          label: t("Form"),
          value: previewValue(state.linkedStudyRequestFormId),
        },
        {
          label: t("Study creation date"),
          value: linkedStudyCreatedDate,
        },
        {
          label: t("Original requested test"),
          value: previewValue(requestedTestKeyLabel(selectedStudyRequestOriginalTest)),
        },
      ],
    },
    {
      title: t("Patient data"),
      fields: [
        {
          label: t("Institution"),
          value: selectedInstitution
            ? `${selectedInstitution.name} (${selectedInstitution.id})`
            : previewValue(state.patientInformation.institutionId),
        },
        {
          label: t("Doctor"),
          value: selectedDoctor
            ? `${selectedDoctor.fullName} (${selectedDoctor.id})`
            : previewValue(state.patientInformation.doctorId),
        },
        {
          label: t("Email"),
          value: previewValue(state.patientInformation.email),
        },
        {
          label: t("Patient DNI"),
          value: previewValue(state.patientInformation.medicalRecordNumber),
        },
        {
          label: t("Full name"),
          value: previewValue(
            state.patientInformation.fullName ||
              joinNameParts(
                state.patientInformation.firstName,
                state.patientInformation.lastName
              )
          ),
        },
        {
          label: t("Birth date"),
          value: previewDateValue(state.patientInformation.birthDate),
        },
        {
          label: t("Study creation date"),
          value: linkedStudyCreatedDate,
        },
      ],
    },
    {
      title: t("Requested test"),
      fields: [
        {
          label: t("Selected requested test"),
          value: previewValue(requestedTestKeyLabel(selectedRequestedTest)),
        },
        {
          label: t("Original requested test"),
          value: previewValue(requestedTestKeyLabel(selectedStudyRequestOriginalTest)),
        },
        {
          label: t("Reports mosaicism"),
          value: previewOptionValue(
            yesNoOptions,
            selectedRequestedTest === "pgtAFast"
              ? state.requestedTest.pgtAFastReportsMosaicism
              : selectedRequestedTest === "pgtAStandard"
                ? state.requestedTest.pgtAStandardReportsMosaicism
                : selectedRequestedTest === "pgtSr"
                  ? state.requestedTest.pgtSrReportsMosaicism
                  : ""
          ),
        },
        {
          label: t("Reports sex"),
          value: previewOptionValue(
            yesNoOptions,
            selectedRequestedTest === "pgtAFast"
              ? state.requestedTest.pgtAFastReportsSex
              : selectedRequestedTest === "pgtAStandard"
                ? state.requestedTest.pgtAStandardReportsSex
                : selectedRequestedTest === "pgtSr"
                  ? state.requestedTest.pgtSrReportsSex
                  : ""
          ),
        },
        {
          label: t("Change warning"),
          value: sampleRequestedTestChanged
            ? t(
                "The biopsy form test is different from the linked study request test."
              )
            : t("No changes from linked study request."),
          wide: true,
        },
      ],
    },
    {
      title: t("Biopsy form information"),
      fields: [
        {
          label: t("Box code"),
          value: previewValue(state.sampleInformation.boxCode),
        },
        {
          label: t("Sample type"),
          value: previewOptionValue(sampleTypeOptions, state.sampleInformation.sampleType),
        },
        {
          label: t("Process date"),
          value: previewDateValue(state.sampleInformation.processDate),
        },
        {
          label: t("Processed by"),
          value: previewValue(
            joinNameParts(
              state.sampleInformation.processedByFirstName,
              state.sampleInformation.processedByLastName
            )
          ),
        },
        {
          label: t("Number of biopsies"),
          value: previewValue(state.sampleInformation.biopsyCount),
        },
      ],
    },
    doctorInformationPreviewSection,
    {
      title: t("2PQ case"),
      fields: [
        {
          label: t("Case label"),
          value: previewValue(displayCaseLabel(state.caseInformation.caseLabel)),
        },
        {
          label: t("Case status"),
          value: t("Intake"),
        },
        {
          label: t("Case type"),
          value: previewValue(state.caseInformation.caseType || selectedCaseType),
        },
        {
          label: t("Priority"),
          value: state.caseInformation.priority || selectedCaseType
            ? (state.caseInformation.priority ||
                priorityForSampleCaseType(selectedCaseType)) === "urgent"
              ? t("Urgent")
              : t("Routine")
            : notProvidedLabel,
        },
        {
          label: t("Requested at"),
          value: previewDateValue(state.caseInformation.requestedAt),
        },
      ],
    },
  ];

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
  const previewValidationSteps =
    formType === "sample"
      ? ([
          ...steps.filter((step) => step !== "previewAndSignature"),
          "doctorInformation",
          "caseInformation",
        ] as StepKey[])
      : steps.filter((step) => step !== "previewAndSignature");
  const previewStepIndex = steps.indexOf("previewAndSignature");
  const currentStepContinuesToPreview =
    ((formType === "study_request" && currentStep === "institutionInformation") ||
      (formType === "sample" && currentStep === "samplingInformation")) &&
    previewStepIndex >= 0;
  const processDialogOpen =
    Boolean(wholeDataValidationReport) || storageProcessingSteps.length > 0;
  const previewValidationDialogOpen = Boolean(previewValidationReport);
  const previewValidationIssueStepIndex = previewValidationReport?.issues[0]
    ? steps.indexOf(previewValidationReport.issues[0].step)
    : -1;

  function clientErrorDetails(error: unknown) {
    if (error instanceof SdkRequestError) {
      const detailsWithoutRequestBody = error.details
        .split("\n\n")
        .filter((detail) => !detail.startsWith("Request body:"))
        .join("\n\n");

      return {
        message: error.message,
        details: detailsWithoutRequestBody,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        details: error.stack ?? error.message,
      };
    }

    return {
      message: t("Unknown error"),
      details: String(error),
    };
  }

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
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: options.errorMessage ?? t("Unable to save the form draft."),
      });
      throw error instanceof Error
        ? error
        : new Error(t("Unable to save the form draft."));
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

  function selectRequestedStudyTest(selectedKey: string) {
    setState((current) => {
      const requestedTest = withRequestedStudyTestSelection(
        current.requestedTest,
        selectedKey
      );
      const caseType = caseTypeForRequestedTestKey(selectedKey);
      return {
        ...current,
        requestedTest,
        caseInformation:
          formType === "sample"
            ? {
                ...current.caseInformation,
                caseType,
                priority: priorityForSampleCaseType(caseType),
              }
            : current.caseInformation,
      };
    });
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
      const biopsyCountChanged =
        Object.prototype.hasOwnProperty.call(patch, "biopsyCount") &&
        patch.biopsyCount !== current.sampleInformation.biopsyCount;

      if (!boxCodeChanged) {
        return {
          ...current,
          sampleInformation: nextSampleInformation,
          samplingTableGenerated: biopsyCountChanged
            ? false
            : current.samplingTableGenerated,
        };
      }

      return {
        ...current,
        selectedCaseId: "",
        sampleInformation: nextSampleInformation,
        samplingTableGenerated: biopsyCountChanged
          ? false
          : current.samplingTableGenerated,
        caseInformation: {
          ...newCaseDefaultsForBoxCode(nextSampleInformation.boxCode),
          caseType: current.caseInformation.caseType,
          priority: priorityForSampleCaseType(current.caseInformation.caseType),
        },
      };
    });
  }

  function selectLinkedStudyRequestForm(formId: string) {
    const linkedForm = studyRequestForms.find((form) => form.id === formId);
    if (!linkedForm) {
      setState((current) => ({
        ...current,
        linkedStudyRequestFormId: "",
        selectedPatientId: "",
        selectedInstitutionId: "",
        selectedRequestingDoctorId: "",
        patientInformation: buildInitialState(
          defaultInstitutionId,
          defaultDoctorId,
          defaultInstitution?.contactEmail ?? ""
        ).patientInformation,
      }));
      return;
    }

    const linkedPatientInformation = studyRequestPatientToFormState(linkedForm);
    const linkedInstitution = institutions.find(
      (institution) => institution.id === linkedForm.institutionId
    );
    const linkedPatientId =
      linkedForm.selectedPatientId ||
      stringField(linkedForm.patientInformation, "patientId");
    const linkedRequestedTest = requestedTestToFormState(
      linkedForm.requestedTest,
      buildInitialState(
        defaultInstitutionId,
        defaultDoctorId,
        defaultInstitution?.contactEmail ?? ""
      ).requestedTest
    );
    const linkedRequestedTestKey = selectedRequestedTestKey(linkedRequestedTest);
    const linkedCaseType = caseTypeForRequestedTestKey(linkedRequestedTestKey);

    setState((current) => ({
      ...current,
      linkedStudyRequestFormId: linkedForm.id,
      selectedPatientId: linkedPatientId,
      selectedInstitutionId:
        linkedForm.selectedInstitutionId || linkedForm.institutionId,
      selectedCaseId: "",
      selectedRequestingDoctorId: formDoctorId(linkedForm),
      patientInformation: linkedPatientInformation,
      institutionInformation: linkedInstitution
        ? institutionToFormState(linkedInstitution)
        : mergeDraftSection(emptyInstitution(), linkedForm.institutionInformation),
      requestedTest: linkedRequestedTest,
      caseInformation: {
        ...withCaseDefaultsForBoxCode({
          ...current,
          selectedCaseId: "",
          patientInformation: linkedPatientInformation,
        }).caseInformation,
        caseType: linkedCaseType,
        priority: priorityForSampleCaseType(linkedCaseType),
      },
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.linkedStudyRequestFormId;
      delete next.selectedPatientId;
      return next;
    });
  }

  function updateSampleCaseType(caseType: string) {
    updateCaseInformation({
      caseType,
      priority: priorityForSampleCaseType(caseType),
    });
  }

  function generateSamplingTable() {
    setState((current) => withGeneratedSamplingTable(current));
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

  function showDoctorResponsibilityAlert() {
    setDoctorResponsibilityAlertOpen(true);
    setStepErrors("patientInformation", {
      "patientInformation.doctorId": t("Select a doctor."),
    });
    setStepValidation((current) => ({
      ...current,
      patientInformation: "invalid",
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

  function closePreviewValidationDialog(goToFirstIssue = false) {
    const issueStepIndex = previewValidationReport?.issues[0]
      ? steps.indexOf(previewValidationReport.issues[0].step)
      : -1;

    setPreviewValidationReport(null);
    if (goToFirstIssue && issueStepIndex >= 0) {
      setStepIndex(issueStepIndex);
    }
  }

  function openPreviewWithoutDraftCheckpoint() {
    if (previewStepIndex < 0) {
      return;
    }

    setPreviewValidationReport(null);
    setStepIndex(previewStepIndex);
  }

  async function validateAndContinueToPreview() {
    if (previewStepIndex < 0) {
      return;
    }

    setPreviewValidationReport({ status: "running", issues: [] });
    await wait(180);

    const wholeValidation = validateWholeDocument({
      flowState: state,
      steps: previewValidationSteps,
      formType,
      language,
      institutions,
      doctors,
      patients,
      cases,
      studyRequestForms,
    });
    setFieldErrors(wholeValidation.fieldErrors);
    setStepValidation((current) => ({
      ...current,
      ...wholeValidation.stepValidation,
    }));

    if (wholeValidation.issues.length > 0) {
      setPreviewValidationReport({
        status: "error",
        issues: wholeValidation.issues,
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Preview validation found issues."),
      });
      return;
    }

    setPreviewValidationReport({ status: "success", issues: [] });
    await wait(220);

    try {
      await persistDraftSnapshot(previewStepIndex, state, {
        errorMessage: t(
          "Preview validation passed, but the draft checkpoint could not be saved."
        ),
      });
      setPreviewValidationReport(null);
      setStepIndex(previewStepIndex);
    } catch (error) {
      const { message, details } = clientErrorDetails(error);
      setPreviewValidationReport({
        status: "draft-checkpoint-error",
        issues: [],
        draftErrorMessage: message,
        draftErrorDetails: details,
      });
    }
  }

  async function goNext() {
    if (
      currentStep === "patientInformation" &&
      !state.patientInformation.doctorId
    ) {
      showDoctorResponsibilityAlert();
      return;
    }

    if (currentStepContinuesToPreview) {
      await validateAndContinueToPreview();
      return;
    }

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
      formType === "sample" &&
      currentStep === "sampleInformation" &&
      steps[nextStepIndex] === "samplingInformation"
        ? withGeneratedSamplingTable(
            withCaseDefaultsForBoxCode({ ...state, selectedCaseId: "" })
          )
        : steps[nextStepIndex] === "caseInformation"
          ? withCaseDefaultsForBoxCode({ ...state, selectedCaseId: "" })
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

    if (
      boundedStepIndex > stepIndex &&
      currentStep === "linkedStudyRequest" &&
      !state.linkedStudyRequestFormId
    ) {
      const errors = validateStepFields(currentStep, state, formType, language);
      setStepErrors(currentStep, errors);
      setToast({
        id: Date.now(),
        tone: "error",
        message: firstErrorMessage(errors),
      });
      return;
    }

    if (
      steps[boundedStepIndex] === "previewAndSignature" &&
      currentStep !== "previewAndSignature"
    ) {
      await validateAndContinueToPreview();
      return;
    }

    if (
      boundedStepIndex > stepIndex &&
      stepIndex === 0 &&
      !state.patientInformation.doctorId
    ) {
      showDoctorResponsibilityAlert();
      return;
    }

    try {
      const nextState =
        steps[boundedStepIndex] === "caseInformation"
          ? withCaseDefaultsForBoxCode({ ...state, selectedCaseId: "" })
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
      formType === "sample"
        ? withGeneratedSamplingTable(
            withCaseDefaultsForBoxCode({ ...state, selectedCaseId: "" })
          )
        : state;
    if (submissionState !== state) {
      setState(submissionState);
    }

    setStorageProcessingSteps([]);
    setStorageProcessingError(null);
    setStoredFormId(null);

    if (!submissionState.patientInformation.doctorId) {
      setWholeDataValidationReport(null);
      showDoctorResponsibilityAlert();
      setStepIndex(0);
      return;
    }

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
      studyRequestForms,
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
              linkedStudyRequestFormId: submissionState.linkedStudyRequestFormId,
              selectedPatientId: submissionState.selectedPatientId,
              selectedCaseId: submissionState.selectedCaseId,
              selectedRequestingDoctorId:
                submissionState.selectedRequestingDoctorId ||
                submissionState.patientInformation.doctorId,
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
      router.push(
        `/2pq-dashboard/forms?createdId=${response.form.id}&createdType=${formType}`
      );
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
        open={doctorResponsibilityAlertOpen}
        onOpenChange={setDoctorResponsibilityAlertOpen}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("Doctor is required")}</DialogTitle>
            <DialogDescription>
              {t(
                "The patient must always belong to a doctor from the institution. The doctor signs the document and is responsible for the form, so this field cannot be empty."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDoctorResponsibilityAlertOpen(false)}>
              {t("Understood")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={previewValidationDialogOpen}
        onOpenChange={(open) => {
          if (
            !open &&
            previewValidationReport?.status !== "running" &&
            !draftPending
          ) {
            closePreviewValidationDialog(false);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100vh-1.5rem)] max-w-3xl overflow-hidden rounded-2xl border border-indigo-100 p-0 shadow-[0_28px_90px_rgba(79,70,229,0.22)] dark:border-indigo-300/20">
          <DialogHeader className="border-b border-indigo-100 bg-indigo-50/70 px-6 py-5 dark:border-indigo-300/16 dark:bg-indigo-950/26">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="font-heading text-2xl font-semibold">
                  {t("Preview validation")}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm">
                  {t(
                    "The form validates steps 1 to 5 before opening the read-only preview."
                  )}
                </DialogDescription>
              </div>
              {previewValidationReport ? (
                <Badge
                  variant={
                    previewValidationReport.status === "success"
                      ? "success"
                      : previewValidationReport.status === "running"
                        ? "brand"
                        : "destructive"
                  }
                >
                  {previewValidationReport.status === "draft-checkpoint-error"
                    ? t("draft checkpoint failed")
                    : t(previewValidationReport.status)}
                </Badge>
              ) : null}
            </div>
          </DialogHeader>

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-5">
            {previewValidationReport?.status === "running" ? (
              <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/75 px-4 py-4 text-sm text-indigo-950/76 dark:border-indigo-300/16 dark:bg-indigo-400/10 dark:text-indigo-50/76">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-700 dark:text-indigo-200" />
                {t("Validating steps 1 to 5 before opening preview.")}
              </div>
            ) : null}

            {previewValidationReport?.status === "success" ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/75 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                {draftPending
                  ? t("Steps 1 to 5 passed validation. Saving draft checkpoint.")
                  : t("Steps 1 to 5 passed validation. Opening preview.")}
              </div>
            ) : null}

            {previewValidationReport?.status === "error" ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("Fix these issues before opening the preview.")}
                </p>
                {previewValidationReport.issues.map((issue, index) => {
                  const issueStepIndex = steps.indexOf(issue.step);
                  const stepLabel =
                    language === "es"
                      ? `Paso ${issueStepIndex + 1} de ${
                          previewValidationSteps.length
                        }`
                      : `Step ${issueStepIndex + 1} of ${
                          previewValidationSteps.length
                        }`;

                  return (
                    <div
                      key={issue.id}
                      className="rounded-xl border border-red-200 bg-red-50/82 px-4 py-4 text-red-950 dark:border-red-300/22 dark:bg-red-950/22 dark:text-red-100"
                    >
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-semibold text-red-700 dark:border-red-300/24 dark:bg-red-400/10 dark:text-red-100">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-950/56 dark:text-red-100/58">
                            {stepLabel}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
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
                  );
                })}
              </div>
            ) : null}

            {previewValidationReport?.status === "draft-checkpoint-error" ? (
              <div className="grid gap-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-amber-950 dark:border-amber-300/22 dark:bg-amber-950/24 dark:text-amber-100">
                  <div className="flex gap-3">
                    <CircleX className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold">{t("Draft checkpoint failed")}</p>
                      <p className="mt-1 text-sm text-amber-950/74 dark:text-amber-100/74">
                        {t(
                          "The information passed validation, but the draft checkpoint failed. You can open the preview anyway; final submission will try to save again and may show the same backend error."
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                {previewValidationReport.draftErrorMessage ? (
                  <div className="rounded-xl border border-border bg-background px-4 py-4">
                    <p className="text-sm font-semibold">
                      {previewValidationReport.draftErrorMessage}
                    </p>
                    {previewValidationReport.draftErrorDetails ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t("Technical details")}
                        </p>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted px-3 py-3 text-xs text-muted-foreground">
                          {previewValidationReport.draftErrorDetails}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {previewValidationReport?.status === "error" ||
          previewValidationReport?.status === "draft-checkpoint-error" ? (
            <DialogFooter className="gap-3 border-t border-border bg-muted/30 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => closePreviewValidationDialog(false)}
              >
                {t("Close and review data")}
              </Button>
              {previewValidationReport.status === "error" &&
              previewValidationIssueStepIndex >= 0 ? (
                <Button
                  type="button"
                  onClick={() => closePreviewValidationDialog(true)}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {t("Go to first issue")}
                </Button>
              ) : null}
              {previewValidationReport.status === "draft-checkpoint-error" ? (
                <Button
                  type="button"
                  onClick={openPreviewWithoutDraftCheckpoint}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {t("Open preview anyway")}
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
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
              {formType === "study_request"
                ? t("Study request form")
                : t("Biopsy form")}
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

        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((step, index) => {
            const active = step === currentStep;
            const storedStatus = stepValidation[step];
            const stepStatus =
              storedStatus === "valid" &&
              hasErrors(validateStepFields(step, state, formType, language))
                ? "invalid"
                : storedStatus;
            const completed = stepStatus === "valid";
            const stepButtonClass = [
              "flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
              completed
                ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
                : active
                  ? "border-indigo-300 bg-indigo-500/12 text-indigo-950 dark:border-indigo-300/40 dark:text-indigo-100"
                  : stepStatus === "invalid"
                    ? "border-red-200 bg-red-50/65 text-red-950 hover:bg-red-50 dark:border-red-300/28 dark:bg-red-950/18 dark:text-red-100"
                    : "border-border/80 bg-background/54 text-muted-foreground hover:bg-background/80",
            ].join(" ");
            const stepNumberClass = [
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
              completed
                ? "border-white/70 bg-white/18 text-white"
                : active
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_6px_14px_rgba(79,70,229,0.24)]"
                  : stepStatus === "invalid"
                    ? "border-red-300 bg-red-100 text-red-700 dark:border-red-300/42 dark:bg-red-400/12 dark:text-red-200"
                    : "border-indigo-300/80 bg-transparent text-indigo-700 dark:border-indigo-300/45 dark:text-indigo-200",
            ].join(" ");
            return (
              <button
                key={step}
                type="button"
                onClick={() => void selectStep(index)}
                disabled={pending || draftPending}
                className={stepButtonClass}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={stepNumberClass}>
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate">{t(STEP_LABELS[step])}</span>
                </span>
                {completed ? (
                  <CheckCircle2 className="size-4 text-white" />
                ) : stepStatus === "invalid" ? (
                  <CircleX className="size-4 text-red-600" />
                ) : null}
              </button>
            );
          })}
        </div>

        {currentStep === "linkedStudyRequest" ? (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{t("Linked study request form")}</Label>
              <OptionSelectField
                options={studyRequestFormOptions}
                value={state.linkedStudyRequestFormId}
                onChange={selectLinkedStudyRequestForm}
                placeholder={t("Select linked study request form")}
              />
              <FieldError message={errorFor("linkedStudyRequestFormId")} />
            </div>
            {selectedStudyRequestForm ? (
              <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm dark:border-indigo-300/18 dark:bg-indigo-950/20 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Patient")}
                  </p>
                  <p className="mt-1 font-medium">
                    {selectedStudyRequestForm.patientName ||
                      stringField(
                        selectedStudyRequestForm.patientInformation,
                        "fullName"
                      ) ||
                      t("Not provided")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Requested tests")}
                  </p>
                  <p className="mt-1 font-medium">
                    {selectedStudyRequestForm.requestedTestName ||
                      t("Not provided")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Institution")}
                  </p>
                  <p className="mt-1 font-medium">
                    {selectedStudyRequestForm.institutionName ||
                      selectedStudyRequestForm.institutionId}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Doctor")}
                  </p>
                  <p className="mt-1 font-medium">
                    {selectedStudyRequestDoctor
                      ? selectedStudyRequestDoctor.fullName
                      : selectedStudyRequestDoctorId || t("Not provided")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Form")}
                  </p>
                  <p className="mt-1 font-mono text-xs">
                    {selectedStudyRequestForm.id}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Study creation date")}
                  </p>
                  <p className="mt-1 font-medium">
                    {selectedStudyRequestForm.createdAt
                      ? previewDateValue(
                          toDateInputValue(selectedStudyRequestForm.createdAt)
                        )
                      : t("Not provided")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === "patientInformation" ? (
          <>
            {formType === "sample" ? (
              <div className="grid gap-4 md:grid-cols-2">
              {[
                [t("Linked study request form"), state.linkedStudyRequestFormId],
                [t("Institution"), selectedInstitution?.name ?? state.patientInformation.institutionId],
                [t("Doctor"), selectedDoctor?.fullName ?? state.patientInformation.doctorId],
                [t("Email"), state.patientInformation.email],
                [t("Patient DNI"), state.patientInformation.medicalRecordNumber],
                [
                  t("Full name"),
                  state.patientInformation.fullName ||
                    joinNameParts(
                      state.patientInformation.firstName,
                      state.patientInformation.lastName
                    ),
                ],
                [t("Birth date"), previewDateValue(state.patientInformation.birthDate)],
                [t("Study creation date"), linkedStudyCreatedDate],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border/70 bg-background/60 px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
                    {value || t("Not provided")}
                  </p>
                </div>
              ))}
              </div>
            ) : (
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
                  id="form-patient-dni"
                  label={t("Patient DNI")}
                  value={state.patientInformation.medicalRecordNumber}
                  onChange={(medicalRecordNumber) =>
                    updatePatientInformation({ medicalRecordNumber })
                  }
                />
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
            )}
          </>
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
              {state.medicalInformation.maleFactor === "si" ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-300/24 dark:bg-amber-950/20 dark:text-amber-50">
                  {t(
                    "Male factor is selected. Specify the type of male factor in observations."
                  )}
                </div>
              ) : null}
              <TextAreaField
                id="form-other-background"
                label={t("Observations")}
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
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>{t("Requested test")}</Label>
                <OptionSelectField
                  options={requestedStudyTestOptions}
                  value={selectedRequestedTest}
                  onChange={selectRequestedStudyTest}
                  placeholder={t("Not set")}
                  emptyLabel={t("Not set")}
                />
                <FieldError message={errorFor("requestedTest")} />
              </div>
              {selectedRequestedTest ? (
                <section className="rounded-xl border border-border/70 bg-background/50 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 dark:border-emerald-300/24 dark:bg-emerald-950/20 dark:text-emerald-50">
                      {requestedTestKeyLabel(selectedRequestedTest)}: {t("Yes")}
                    </div>
                    <YesNoField
                      label={t("Reports mosaicism")}
                      value={
                        selectedRequestedTest === "pgtAFast"
                          ? state.requestedTest.pgtAFastReportsMosaicism
                          : selectedRequestedTest === "pgtAStandard"
                            ? state.requestedTest.pgtAStandardReportsMosaicism
                            : state.requestedTest.pgtSrReportsMosaicism
                      }
                      onChange={(value) =>
                        selectedRequestedTest === "pgtAFast"
                          ? updateRequestedTest({
                              pgtAFastReportsMosaicism: value,
                            })
                          : selectedRequestedTest === "pgtAStandard"
                            ? updateRequestedTest({
                                pgtAStandardReportsMosaicism: value,
                              })
                            : updateRequestedTest({
                                pgtSrReportsMosaicism: value,
                              })
                      }
                      error={
                        selectedRequestedTest === "pgtAFast"
                          ? errorFor("requestedTest.pgtAFastReportsMosaicism")
                          : selectedRequestedTest === "pgtAStandard"
                            ? errorFor("requestedTest.pgtAStandardReportsMosaicism")
                            : errorFor("requestedTest.pgtSrReportsMosaicism")
                      }
                      options={yesNoOptions}
                      placeholder={t("Select")}
                    />
                    <YesNoField
                      label={t("Reports sex")}
                      value={
                        selectedRequestedTest === "pgtAFast"
                          ? state.requestedTest.pgtAFastReportsSex
                          : selectedRequestedTest === "pgtAStandard"
                            ? state.requestedTest.pgtAStandardReportsSex
                            : state.requestedTest.pgtSrReportsSex
                      }
                      onChange={(value) =>
                        selectedRequestedTest === "pgtAFast"
                          ? updateRequestedTest({
                              pgtAFastReportsSex: value,
                            })
                          : selectedRequestedTest === "pgtAStandard"
                            ? updateRequestedTest({
                                pgtAStandardReportsSex: value,
                              })
                            : updateRequestedTest({
                                pgtSrReportsSex: value,
                              })
                      }
                      error={
                        selectedRequestedTest === "pgtAFast"
                          ? errorFor("requestedTest.pgtAFastReportsSex")
                          : selectedRequestedTest === "pgtAStandard"
                            ? errorFor("requestedTest.pgtAStandardReportsSex")
                            : errorFor("requestedTest.pgtSrReportsSex")
                      }
                      options={yesNoOptions}
                      placeholder={t("Select")}
                    />
                  </div>
                </section>
              ) : null}
              <section className="rounded-xl border border-border/70 bg-background/50 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <YesNoField
                    label={t("Has karyotype information?")}
                    value={state.previousGeneticTests.karyotype}
                    onChange={(karyotype) => {
                      updatePreviousGeneticTests({ karyotype });
                      if (karyotype !== "si") {
                        clearKaryotypeFile();
                      }
                    }}
                    error={errorFor("previousGeneticTests.karyotype")}
                    options={yesNoOptions}
                    placeholder={t("Select")}
                  />
                  {state.previousGeneticTests.karyotype === "si" ? (
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
                            <label
                              htmlFor="form-karyotype-file"
                              className="cursor-pointer"
                            >
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
                        accept="image/*,application/pdf"
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
                      <FieldError
                        message={errorFor("previousGeneticTests.karyotypeFileContent")}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>{t("Requested test")}</Label>
                <OptionSelectField
                  options={requestedStudyTestOptions}
                  value={selectedRequestedTest}
                  onChange={selectRequestedStudyTest}
                  placeholder={t("Not set")}
                  emptyLabel={t("Not set")}
                />
                <FieldError message={errorFor("requestedTest")} />
              </div>
              {sampleRequestedTestChanged ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-300/24 dark:bg-amber-950/20 dark:text-amber-50">
                  {t(
                    "The biopsy form test is different from the linked study request test."
                  )}{" "}
                  {t("Original requested test")}:{" "}
                  {requestedTestKeyLabel(selectedStudyRequestOriginalTest) ||
                    t("Not provided")}
                </div>
              ) : null}
              {selectedRequestedTest ? (
                <section className="rounded-xl border border-border/70 bg-background/50 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 dark:border-emerald-300/24 dark:bg-emerald-950/20 dark:text-emerald-50">
                      {requestedTestKeyLabel(selectedRequestedTest)}: {t("Yes")}
                    </div>
                    <YesNoField
                      label={t("Reports mosaicism")}
                      value={
                        selectedRequestedTest === "pgtAFast"
                          ? state.requestedTest.pgtAFastReportsMosaicism
                          : selectedRequestedTest === "pgtAStandard"
                            ? state.requestedTest.pgtAStandardReportsMosaicism
                            : state.requestedTest.pgtSrReportsMosaicism
                      }
                      onChange={(value) =>
                        selectedRequestedTest === "pgtAFast"
                          ? updateRequestedTest({
                              pgtAFastReportsMosaicism: value,
                            })
                          : selectedRequestedTest === "pgtAStandard"
                            ? updateRequestedTest({
                                pgtAStandardReportsMosaicism: value,
                              })
                            : updateRequestedTest({
                                pgtSrReportsMosaicism: value,
                              })
                      }
                      error={
                        selectedRequestedTest === "pgtAFast"
                          ? errorFor("requestedTest.pgtAFastReportsMosaicism")
                          : selectedRequestedTest === "pgtAStandard"
                            ? errorFor("requestedTest.pgtAStandardReportsMosaicism")
                            : errorFor("requestedTest.pgtSrReportsMosaicism")
                      }
                      options={yesNoOptions}
                      placeholder={t("Select")}
                    />
                    <YesNoField
                      label={t("Reports sex")}
                      value={
                        selectedRequestedTest === "pgtAFast"
                          ? state.requestedTest.pgtAFastReportsSex
                          : selectedRequestedTest === "pgtAStandard"
                            ? state.requestedTest.pgtAStandardReportsSex
                            : state.requestedTest.pgtSrReportsSex
                      }
                      onChange={(value) =>
                        selectedRequestedTest === "pgtAFast"
                          ? updateRequestedTest({
                              pgtAFastReportsSex: value,
                            })
                          : selectedRequestedTest === "pgtAStandard"
                            ? updateRequestedTest({
                                pgtAStandardReportsSex: value,
                              })
                            : updateRequestedTest({
                                pgtSrReportsSex: value,
                              })
                      }
                      error={
                        selectedRequestedTest === "pgtAFast"
                          ? errorFor("requestedTest.pgtAFastReportsSex")
                          : selectedRequestedTest === "pgtAStandard"
                            ? errorFor("requestedTest.pgtAStandardReportsSex")
                            : errorFor("requestedTest.pgtSrReportsSex")
                      }
                      options={yesNoOptions}
                      placeholder={t("Select")}
                    />
                  </div>
                </section>
              ) : null}
              <div className="grid gap-3 rounded-xl border border-border/70 bg-background/58 p-4 md:grid-cols-2">
                {[
                  [t("Original requested test"), requestedTestKeyLabel(selectedStudyRequestOriginalTest)],
                  [t("Selected requested test"), requestedTestKeyLabel(selectedRequestedTest)],
                  [t("Case type"), state.caseInformation.caseType || selectedCaseType],
                  [
                    t("Priority"),
                    state.caseInformation.priority || selectedCaseType
                      ? (state.caseInformation.priority ||
                          priorityForSampleCaseType(selectedCaseType)) === "urgent"
                        ? t("Urgent")
                        : t("Routine")
                      : "",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {value || t("Not provided")}
                    </p>
                  </div>
                ))}
              </div>
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
                disabled={Boolean(scopedInstitutionId)}
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

        {currentStep === "previewAndSignature" ? (
          <div className="space-y-6">
            <div className="mx-auto max-w-5xl rounded-sm bg-white px-6 py-8 text-black shadow-[0_24px_70px_rgba(15,23,42,0.16)] ring-1 ring-black/10 sm:px-10 sm:py-12">
              <div className="border-b border-black/20 pb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/55">
                  2PQ
                </p>
                <h2 className="mt-2 font-heading text-2xl font-semibold text-black">
                  {formType === "study_request"
                    ? t("Study request form preview")
                    : t("Biopsy form preview")}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-black/70">
                  {t(
                    "This preview is read-only. Go back to previous steps to make changes before signing."
                  )}
                </p>
              </div>

              <div className="mt-8 space-y-8">
                {(formType === "study_request"
                  ? studyRequestPreviewSections
                  : biopsyFormPreviewSections
                ).map((section) => (
                  <PreviewPaperSection key={section.title} section={section} />
                ))}
                {formType === "study_request" && karyotypeImageContent ? (
                  <section className="border-t border-black/12 pt-5">
                    <h3 className="font-heading text-base font-semibold text-black">
                      {t("Karyotype attached image")}
                    </h3>
                    <div className="mt-4 overflow-hidden rounded-sm border border-black/20 bg-white">
                      <img
                        src={karyotypeImageContent}
                        alt={t("Karyotype attached image")}
                        className="max-h-[34rem] w-full object-contain"
                      />
                    </div>
                  </section>
                ) : null}
                {formType === "sample" ? (
                  <section className="border-t border-black/12 pt-5">
                    <h3 className="font-heading text-base font-semibold text-black">
                      {t("Biopsy rows")}
                    </h3>
                    <div className="mt-4 overflow-x-auto border border-black/20">
                      <table className="min-w-[76rem] border-collapse text-sm">
                        <thead className="bg-black/[0.04] text-left text-[0.68rem] uppercase tracking-[0.08em] text-black/65">
                          <tr>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Sample ID")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Internal code")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Stage day 5, 6 or 7")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Morphology")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Sent uL")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Biopsied cells")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Cells visualized?")}
                            </th>
                            <th className="border border-black/20 px-3 py-2">
                              {t("Comments")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.samplingInformation.map((sampling, index) => (
                            <tr key={`${sampling.sampleId}-${index}`}>
                              {[
                                sampling.sampleId,
                                sampling.internalCode,
                                sampling.embryoStageDay,
                                sampling.morphology,
                                sampling.sentUl,
                                sampling.biopsiedCells,
                                previewOptionValue(
                                  yesNoOptions,
                                  sampling.cellsVisualized
                                ),
                                sampling.notes,
                              ].map((value, valueIndex) => (
                                <td
                                  key={`${sampling.sampleId}-${valueIndex}`}
                                  className="whitespace-pre-wrap border border-black/20 px-3 py-2 align-top text-black"
                                >
                                  {value || t("Not provided")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="mt-10 border-t border-black/20 pt-6">
                <h3 className="font-heading text-base font-semibold text-black">
                  {t("Signature and submission")}
                </h3>
                <p className="mt-2 text-sm leading-6 text-black/70">
                  {t(
                    "By signing, the responsible doctor confirms the information shown here."
                  )}
                </p>
              </div>
            </div>

            <div className="mx-auto max-w-5xl rounded-2xl border border-indigo-200 bg-indigo-50/72 p-5 shadow-[0_18px_48px_rgba(79,70,229,0.12)] dark:border-indigo-300/22 dark:bg-indigo-950/22">
              <Button
                type="button"
                variant="outline"
                onClick={() => void selectStep(stepIndex - 1)}
                disabled={pending || draftPending}
                className="mb-4 bg-white/80 text-indigo-950 hover:bg-white"
              >
                <ArrowLeft className="size-4" />
                {t("Previous")}
              </Button>
              <p className="text-sm leading-6 text-indigo-950/78 dark:text-indigo-50/78">
                {t(
                  "After submission, the form cannot be changed. If you find an error after sending it, contact 2PQ directly so they can correct it."
                )}
              </p>
              <Button
                type="button"
                onClick={() => void submitForm()}
                disabled={pending || draftPending}
                className="mt-4 min-h-14 w-full bg-indigo-600 text-base font-semibold text-white hover:bg-indigo-700 sm:text-lg"
              >
                {pending ? (
                  <FileText className="size-5 animate-pulse" />
                ) : (
                  <Save className="size-5" />
                )}
                {pending ? t("Sending...") : t("Sign and send form")}
              </Button>
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
            <section className="md:col-span-2">
              <div className="border-y border-border/70 py-5">
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
            <section className="md:col-span-2">
              <div className="rounded-xl border border-border/70 bg-background/58 p-4">
                <div className="space-y-2">
                  <Label>{t("Number of biopsies")}</Label>
                  <OptionSelectField
                    options={biopsyCountOptions}
                    value={state.sampleInformation.biopsyCount}
                    onChange={(biopsyCount) =>
                      updateSampleInformation({ biopsyCount })
                    }
                    placeholder={t("Not set")}
                    emptyLabel={t("Not set")}
                  />
                  <FieldError message={errorFor("sampleInformation.biopsyCount")} />
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentStep === "doctorInformation" ? (
          <div className="space-y-4">
            <div className="rounded-sm border border-black/12 bg-white px-6 py-6 text-black shadow-sm">
              <PreviewPaperSection section={doctorInformationPreviewSection} />
            </div>
            <FieldError message={errorFor("selectedRequestingDoctorId")} />
          </div>
        ) : null}

        {currentStep === "caseInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <BoxCodeLinkCard code={state.sampleInformation.boxCode} translate={t} />
            <div className="space-y-2">
              <Label htmlFor="form-case-label">{t("Case label")}</Label>
              <Input
                id="form-case-label"
                value={state.caseInformation.caseLabel}
                disabled
              />
              <FieldError message={errorFor("caseInformation.caseLabel")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-case-status">{t("Case status")}</Label>
              <Input
                id="form-case-status"
                value={t("Intake")}
                disabled
              />
              <FieldError message={errorFor("caseInformation.caseStatus")} />
            </div>
            <div className="space-y-2">
              <Label>{t("Case type")}</Label>
              <OptionSelectField
                options={sampleCaseTypeOptions}
                value={state.caseInformation.caseType}
                onChange={updateSampleCaseType}
                placeholder={t("Select case type")}
              />
              <FieldError message={errorFor("caseInformation.caseType")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-case-priority">{t("Priority")}</Label>
              <Input
                id="form-case-priority"
                value={
                  state.caseInformation.priority === "urgent"
                    ? t("Urgent")
                    : state.caseInformation.priority === "routine"
                      ? t("Routine")
                      : ""
                }
                disabled
              />
              <FieldError message={errorFor("caseInformation.priority")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-case-requested-at">{t("Requested at")}</Label>
              <Input
                id="form-case-requested-at"
                type="date"
                value={state.caseInformation.requestedAt}
                disabled
              />
              <FieldError message={errorFor("caseInformation.requestedAt")} />
            </div>
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
            {state.samplingTableGenerated ? (
              <div className="overflow-x-auto rounded-sm border border-slate-300 bg-white text-slate-950 shadow-sm">
                <table className="min-w-[88rem] border-collapse bg-white text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase text-slate-700">
                    <tr>
                      <th className="min-w-36 border border-slate-300 px-3 py-2">
                        {t("Sample ID")}
                      </th>
                      <th className="min-w-44 border border-slate-300 px-3 py-2">
                        {t("Internal code")}
                      </th>
                      <th className="min-w-44 border border-slate-300 px-3 py-2">
                        {t("Stage day 5, 6 or 7")}
                      </th>
                      <th className="min-w-40 border border-slate-300 px-3 py-2">
                        {t("Morphology")}
                      </th>
                      <th className="min-w-36 border border-slate-300 px-3 py-2">
                        {t("Sent uL")}
                      </th>
                      <th className="min-w-44 border border-slate-300 px-3 py-2">
                        {t("Biopsied cells")}
                      </th>
                      <th className="min-w-44 border border-slate-300 px-3 py-2">
                        {t("Cells visualized?")}
                      </th>
                      <th className="min-w-80 border border-slate-300 px-3 py-2">
                        {t("Comments")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.samplingInformation.map((sampling, index) => (
                      <tr key={index}>
                        <td className="border border-slate-300 bg-slate-50 px-3 py-2 align-top font-mono text-xs font-semibold text-slate-900">
                          {sampling.sampleId || t("Not provided")}
                          <FieldError
                            message={errorFor(
                              `samplingInformation.${index}.sampleId`
                            )}
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <Input
                            id={`form-sampling-internal-code-${index}`}
                            value={sampling.internalCode}
                            onChange={(event) =>
                              updateSamplingInformation(index, {
                                internalCode: event.target.value,
                              })
                            }
                            className="h-10 rounded-none border-0 bg-white shadow-none focus-visible:ring-1"
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <OptionSelectField
                            options={["5", "6", "7"].map((value) => ({
                              value,
                              label: value,
                            }))}
                            value={sampling.embryoStageDay}
                            onChange={(embryoStageDay) =>
                              updateSamplingInformation(index, {
                                embryoStageDay,
                              })
                            }
                            placeholder={t("Not set")}
                            emptyLabel={t("Not set")}
                          />
                          <FieldError
                            message={errorFor(
                              `samplingInformation.${index}.embryoStageDay`
                            )}
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <Input
                            id={`form-sampling-morphology-${index}`}
                            value={sampling.morphology}
                            maxLength={3}
                            onChange={(event) =>
                              updateSamplingInformation(index, {
                                morphology: event.target.value,
                              })
                            }
                            className="h-10 rounded-none border-0 bg-white shadow-none focus-visible:ring-1"
                          />
                          <FieldError
                            message={errorFor(
                              `samplingInformation.${index}.morphology`
                            )}
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <Input
                            id={`form-sampling-sent-ul-${index}`}
                            value={sampling.sentUl}
                            inputMode="decimal"
                            onChange={(event) =>
                              updateSamplingInformation(index, {
                                sentUl: event.target.value,
                              })
                            }
                            className="h-10 rounded-none border-0 bg-white shadow-none focus-visible:ring-1"
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <Input
                            id={`form-sampling-biopsied-cells-${index}`}
                            value={sampling.biopsiedCells}
                            inputMode="numeric"
                            onChange={(event) =>
                              updateSamplingInformation(index, {
                                biopsiedCells: event.target.value,
                              })
                            }
                            className="h-10 rounded-none border-0 bg-white shadow-none focus-visible:ring-1"
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <OptionSelectField
                            options={yesNoOptions}
                            value={sampling.cellsVisualized}
                            onChange={(cellsVisualized) =>
                              updateSamplingInformation(index, {
                                cellsVisualized,
                              })
                            }
                            placeholder={t("Not set")}
                            emptyLabel={t("Not set")}
                          />
                        </td>
                        <td className="border border-slate-300 p-0 align-top">
                          <Textarea
                            id={`form-sampling-notes-${index}`}
                            value={sampling.notes}
                            onChange={(event) =>
                              updateSamplingInformation(index, {
                                notes: event.target.value,
                              })
                            }
                            rows={2}
                            className="min-h-10 rounded-none border-0 bg-white shadow-none focus-visible:ring-1"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 bg-background/50 px-4 py-5 text-sm text-muted-foreground">
                {t("Generate the biopsy table from the previous step.")}
              </div>
            )}
          </div>
        ) : null}

        {currentStep === "previewAndSignature" ? null : (
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
                disabled={
                  pending ||
                  draftPending ||
                  (currentStep === "sampleInformation" &&
                    formType === "sample" &&
                    !state.sampleInformation.biopsyCount)
                }
                className={
                  currentStep === "sampleInformation" &&
                  formType === "sample" &&
                  !state.sampleInformation.biopsyCount
                    ? "bg-muted text-muted-foreground hover:bg-muted"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }
              >
                {currentStep === "institutionInformation" &&
                formType === "study_request"
                  ? t("Continue to preview")
                  : currentStep === "sampleInformation" && formType === "sample"
                    ? t("Generate table")
                    : currentStep === "samplingInformation" && formType === "sample"
                      ? t("Continue to preview")
                  : t("Continue")}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
        )}
      </section>
    </div>
  );
}
