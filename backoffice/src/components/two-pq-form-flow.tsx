"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAdminContext } from "@/components/admin-context-provider";
import { OptionSelectField } from "@/components/constrained-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  DoctorListItem,
  InstitutionListItem,
  PatientListItem,
} from "@/lib/admin-areas";
import { PERSON_STATUS_OPTIONS } from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import {
  TWO_PQ_FORM_LABELS,
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

const STUDY_REQUEST_STEPS: StepKey[] = [
  "patientInformation",
  "medicalInformation",
  "previousGeneticTests",
  "requestedTest",
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
  previousGeneticTests: "Previous genetic tests",
  requestedTest: "Test solicitado",
  institutionInformation: "Institution information",
  sampleInformation: "Sample information",
  caseInformation: "2PQ Case",
  samplingInformation: "2PQ Sampling",
};

const YES_NO_OPTIONS = [
  { value: "si", label: "SI" },
  { value: "no", label: "NO" },
];

const SAMPLE_TYPE_OPTIONS = [
  { value: "biopsia de trofoectodermo", label: "biopsia de trofoectodermo" },
  {
    value: "rebiopsia de trofoectodermo",
    label: "rebiopsia de trofoectodermo",
  },
  { value: "medio de cultivo", label: "medio de cultivo" },
  { value: "otro", label: "otro" },
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

function isNonNegativeInteger(value: string) {
  if (!value.trim()) {
    return false;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function todayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
    requestedAt: "",
    dueAt: "",
    notes: "",
  };
}

function emptySampling(): SamplingInformationFormState {
  return {
    sampleId: "",
    sampleType: "",
    processingStatus: "awaiting_reception",
    collectionDate: "",
    receptionDate: "",
    runId: "",
    qcStatus: "",
    notes: "",
  };
}

function buildInitialState(
  institutionId: string,
  doctorId: string
): FlowState {
  return {
    selectedPatientId: "",
    selectedInstitutionId: "",
    selectedCaseId: "",
    patientInformation: {
      institutionId,
      doctorId,
      email: "",
      fullName: "",
      medicalRecordNumber: "",
      birthDate: "",
      sex: "",
      status: "active",
      notes: "",
    },
    medicalInformation: {
      previousConceptionsCount: "",
      previousMiscarriagesCount: "",
      previousBirthsCount: "",
      previousCyclesCount: "",
      maleFactor: "",
      otherBackground: "",
    },
    previousGeneticTests: {
      pgtASr: "",
      karyotype: "",
      pgtResult: "",
      karyotypeResult: "",
    },
    requestedTest: {
      testName: "",
      testCode: "",
      priority: "",
      reason: "",
      notes: "",
      pgtA: "",
      pgtSr: "",
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

function mergeDraftSection<T extends object>(base: T, value: unknown): T {
  return isRecord(value) ? { ...base, ...value } as T : base;
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
    patientInformation: mergeDraftSection(
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
            mergeDraftSection(emptySampling(), entry)
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

function patientToFormState(patient: PatientListItem): PatientInformationFormState {
  return {
    institutionId: patient.institutionId,
    doctorId: patient.doctorId,
    email: patient.email,
    fullName: patient.fullName,
    medicalRecordNumber: patient.medicalRecordNumber ?? "",
    birthDate: toDateInputValue(patient.birthDate),
    sex: patient.sex ?? "",
    status: patient.status,
    notes: patient.notes ?? "",
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
    requestedAt: toDateInputValue(record.requestedAt),
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
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
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function BoxCodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const displayedValue = value.toUpperCase();

  return (
    <div className="space-y-2">
      <Label htmlFor="form-box-code">CODIGO CAJA</Label>
      <Input
        id="form-box-code"
        value={displayedValue}
        maxLength={3}
        pattern="[A-Za-z]{3}"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="font-mono text-base font-semibold uppercase"
        onChange={(event) => onChange(normalizeBoxCodeInput(event.target.value))}
      />
      <p className="text-xs font-medium text-muted-foreground">
        Exactly three letters. Numbers and special characters are not accepted.
      </p>
    </div>
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

function BoxCodeLinkCard({ code }: { code: string }) {
  const normalizedCode = normalizeBoxCodeInput(code);

  return (
    <div className="md:col-span-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/72 p-4 shadow-[0_18px_42px_rgba(16,185,129,0.12)] dark:border-emerald-300/20 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-eyebrow text-emerald-800 dark:text-emerald-200">
              CODIGO CAJA
            </p>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-white/72 text-emerald-900 dark:border-emerald-300/22 dark:bg-emerald-400/10 dark:text-emerald-100"
            >
              Validated
            </Badge>
          </div>
          <h3 className="font-heading text-lg font-semibold text-emerald-950 dark:text-emerald-50">
            Linked caja request
          </h3>
          <p className="max-w-2xl text-sm text-emerald-950/72 dark:text-emerald-50/74">
            This sample request will be linked to the validated three-letter caja
            code. It is shown read-only here before the 2PQ case is created or
            selected.
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <OptionSelectField
        options={YES_NO_OPTIONS}
        value={value}
        onChange={onChange}
        placeholder="Seleccionar"
      />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
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
  const router = useRouter();
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
  const defaultDoctorId =
    scopedDoctorId ||
    (doctors.length === 1 && doctors[0]?.institutionId === defaultInstitutionId
      ? doctors[0]?.id ?? ""
      : "");

  const [stepIndex, setStepIndex] = useState(() =>
    resolveDraftStepIndex(matchingDraft, steps)
  );
  const [pending, setPending] = useState(false);
  const [draftPending, setDraftPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [state, setState] = useState<FlowState>(() =>
    hydrateDraftState(
      buildInitialState(defaultInstitutionId, defaultDoctorId),
      matchingDraft
    )
  );
  const currentStep = steps[stepIndex] ?? steps[0];
  const currentStepLabel = STEP_LABELS[currentStep];
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
  const availableCases = cases.filter((caseRecord) => {
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
    label: `${caseRecord.caseLabel ?? caseRecord.id} (${caseRecord.id})`,
  }));

  const progressLabel = useMemo(
    () => `${stepIndex + 1} of ${steps.length}`,
    [stepIndex, steps.length]
  );
  const restoredFromDraft = Boolean(matchingDraft);

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
        message: options.errorMessage ?? "Unable to save the form draft.",
      });
      throw new Error("Unable to save the form draft.");
    } finally {
      if (!options.quiet) {
        setDraftPending(false);
      }
    }
  }

  useEffect(() => {
    void persistDraftSnapshot(stepIndex, state, {
      quiet: true,
      errorMessage: "Unable to prepare the form draft.",
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

  function updateRequestedTest(patch: Partial<RequestedTestFormState>) {
    setState((current) => ({
      ...current,
      requestedTest: { ...current.requestedTest, ...patch },
    }));
  }

  function updateSampleInformation(patch: Partial<SampleInformationFormState>) {
    setState((current) => ({
      ...current,
      sampleInformation: { ...current.sampleInformation, ...patch },
    }));
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
          },
    }));
  }

  function selectCase(caseId: string) {
    const caseRecord = cases.find((candidate) => candidate.id === caseId);
    setState((current) => ({
      ...current,
      selectedCaseId: caseId,
      caseInformation: caseRecord ? caseToFormState(caseRecord) : emptyCase(),
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

  function validationError(step: StepKey) {
    if (step === "patientInformation") {
      if (!state.patientInformation.institutionId) return "Select an institution.";
      if (!state.patientInformation.doctorId) return "Select a doctor.";
      if (!isValidEmail(state.patientInformation.email)) {
        return "Enter a valid patient email.";
      }
      if (!state.patientInformation.fullName.trim()) {
        return "Patient full name is required.";
      }
    }

    if (step === "medicalInformation") {
      const integerFields: Array<[string, string]> = [
        [
          state.medicalInformation.previousConceptionsCount,
          "Numero concepciones previas",
        ],
        [
          state.medicalInformation.previousMiscarriagesCount,
          "Numero abortos previos",
        ],
        [state.medicalInformation.previousBirthsCount, "Numero nacimientos previos"],
        [state.medicalInformation.previousCyclesCount, "Numero ciclos previos"],
      ];
      const invalidInteger = integerFields.find(
        ([value]) => !isNonNegativeInteger(value)
      );
      if (invalidInteger) {
        return `${invalidInteger[1]} must be a whole number of 0 or more.`;
      }
      if (!state.medicalInformation.maleFactor) {
        return "Select Factor masculino.";
      }
      if (!state.medicalInformation.otherBackground.trim()) {
        return "Otros antecedentes is required.";
      }
    }

    if (step === "previousGeneticTests") {
      if (!state.previousGeneticTests.pgtASr) {
        return "Select PGT-A / PGT-SR.";
      }
      if (!state.previousGeneticTests.karyotype) {
        return "Select CARIOTIPO.";
      }
      if (
        state.previousGeneticTests.pgtASr === "si" &&
        !state.previousGeneticTests.pgtResult.trim()
      ) {
        return "RESULTADO PGT is required when PGT-A / PGT-SR is SI.";
      }
      if (
        state.previousGeneticTests.karyotype === "si" &&
        !state.previousGeneticTests.karyotypeResult.trim()
      ) {
        return "RESULTADO CARIOTIPO is required when CARIOTIPO is SI.";
      }
    }

    if (step === "requestedTest") {
      if (!state.requestedTest.pgtA) return "Select PGT-A.";
      if (!state.requestedTest.pgtSr) return "Select PGT-SR.";
      if (
        state.requestedTest.pgtA !== "si" &&
        state.requestedTest.pgtSr !== "si"
      ) {
        return "Select SI for at least one requested test.";
      }
    }

    if (step === "requestedTest" && formType === "study_request") {
      if (!state.requestedTest.reportsMosaicism) {
        return "Select INFORMA MOSAICISMOS.";
      }
      if (!state.requestedTest.reportsSex) {
        return "Select INFORMA SEXO.";
      }
      if (!state.requestedTest.requestReason.trim()) {
        return "MOTIVO DE SOLICITUD is required.";
      }
      if (!state.requestedTest.requestDate) {
        return "FECHA is required.";
      }
    }

    if (step === "institutionInformation") {
      if (!state.institutionInformation.name.trim()) {
        return "Institution name is required.";
      }
      if (!optionalValidEmail(state.institutionInformation.contactEmail)) {
        return "Enter a valid institution contact email.";
      }
    }

    if (step === "sampleInformation") {
      if (!state.sampleInformation.fivCenter.trim()) return "CENTRO FIV is required.";
      if (!state.sampleInformation.centerCode.trim()) {
        return "CODIGO CENTRO is required.";
      }
      if (!state.sampleInformation.requestingDoctorFullName.trim()) {
        return "MEDICO SOLICITANTE full name is required.";
      }
      if (!isValidEmail(state.sampleInformation.requestingDoctorAuthEmail)) {
        return "MEDICO SOLICITANTE auth email must be valid.";
      }
      if (!state.sampleInformation.sampleType.trim()) {
        return "TIPO DE MUESTRA is required.";
      }
      if (!state.sampleInformation.processedByFirstName.trim()) {
        return "PROCESADO POR nombre is required.";
      }
      if (!state.sampleInformation.processedByLastName.trim()) {
        return "PROCESADO POR apellido is required.";
      }
      if (!state.sampleInformation.processDate.trim()) {
        return "FECHA PROCESO is required.";
      }
      if (!state.sampleInformation.boxCode.trim()) {
        return "CODIGO CAJA is required.";
      }
      if (!isValidBoxCode(state.sampleInformation.boxCode)) {
        return "CODIGO CAJA must be exactly three letters (A-Z).";
      }
    }

    if (step === "caseInformation") {
      if (!state.selectedCaseId) {
        if (!state.caseInformation.caseLabel.trim()) {
          return "2PQ case label is required.";
        }
        if (!state.caseInformation.caseStatus.trim()) {
          return "Select a 2PQ case status.";
        }
      }
    }

    if (step === "samplingInformation") {
      if (state.samplingInformation.length === 0) {
        return "Add at least one 2PQ sampling record.";
      }
      const sampleIds = new Set<string>();
      for (const [index, sampling] of state.samplingInformation.entries()) {
        const row = `Sampling ${index + 1}`;
        if (!sampling.sampleId.trim()) return `${row}: Sample ID is required.`;
        if (sampleIds.has(sampling.sampleId.trim())) {
          return `${row}: Sample ID must be unique in this form.`;
        }
        sampleIds.add(sampling.sampleId.trim());
        if (!sampling.sampleType.trim()) return `${row}: Sample type is required.`;
        if (!sampling.processingStatus.trim()) {
          return `${row}: Select processing status.`;
        }
      }
    }

    return null;
  }

  async function goNext() {
    const message = validationError(currentStep);
    if (message) {
      setToast({ id: Date.now(), tone: "error", message });
      return;
    }

    const nextStepIndex = Math.min(stepIndex + 1, steps.length - 1);
    try {
      await persistDraftSnapshot(nextStepIndex);
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
      await persistDraftSnapshot(boundedStepIndex);
      setStepIndex(boundedStepIndex);
    } catch {
      return;
    }
  }

  async function submitForm() {
    const message = validationError(currentStep);
    if (message) {
      setToast({ id: Date.now(), tone: "error", message });
      return;
    }

    try {
      await persistDraftSnapshot(stepIndex);
    } catch {
      return;
    }

    setPending(true);
    try {
      const body =
        formType === "study_request"
          ? {
              formType,
              selectedPatientId: state.selectedPatientId,
              selectedInstitutionId: state.selectedInstitutionId,
              patientInformation: state.patientInformation,
              medicalInformation: state.medicalInformation,
              previousGeneticTests: state.previousGeneticTests,
              requestedTest: state.requestedTest,
              institutionInformation: state.institutionInformation,
            }
          : {
              formType,
              selectedPatientId: state.selectedPatientId,
              selectedCaseId: state.selectedCaseId,
              selectedRequestingDoctorId: state.selectedRequestingDoctorId,
              patientInformation: state.patientInformation,
              requestedTest: state.requestedTest,
              sampleInformation: state.sampleInformation,
              caseInformation: state.caseInformation,
              samplingInformation: state.samplingInformation,
            };
      const response = await sdkFetch<{ form: TwoPQFormRecord }>("/2pq/forms", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setToast({
        id: Date.now(),
        tone: "success",
        message: `Form ${response.form.id} stored.`,
      });
      router.push(`/2pq-dashboard/forms?createdId=${response.form.id}`);
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to store the form.",
      });
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">
            <ArrowLeft className="size-3.5" />
            Back to forms
          </Link>
        </Button>
      </div>

      <section className="glass-panel flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              {TWO_PQ_FORM_LABELS[formType]}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentStepLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {restoredFromDraft ? <Badge variant="rose">Recovered draft</Badge> : null}
            {draftPending ? <Badge variant="outline">Saving draft</Badge> : null}
            <Badge variant="outline">{progressLabel}</Badge>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((step, index) => {
            const active = step === currentStep;
            const complete = index < stepIndex;
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
                    : "border-border/80 bg-background/54 text-muted-foreground hover:bg-background/80",
                ].join(" ")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                      active
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_6px_14px_rgba(79,70,229,0.24)]"
                        : "border-indigo-300/80 bg-transparent text-indigo-700 dark:border-indigo-300/45 dark:text-indigo-200",
                    ].join(" ")}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate">{STEP_LABELS[step]}</span>
                </span>
                {complete ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
              </button>
            );
          })}
        </div>

        {currentStep === "patientInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Pick existing patient</Label>
              <OptionSelectField
                options={patientOptions}
                value={state.selectedPatientId}
                onChange={selectPatient}
                placeholder="Select patient"
                emptyLabel="Manual patient information"
              />
            </div>
            <div className="space-y-2">
              <Label>Institution</Label>
              <OptionSelectField
                options={institutionOptions}
                value={state.patientInformation.institutionId}
                onChange={(institutionId) => {
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
                      doctorId: nextDoctors.some(
                        (doctor) => doctor.id === current.patientInformation.doctorId
                      )
                        ? current.patientInformation.doctorId
                        : "",
                    },
                  }));
                }}
                placeholder="Select institution"
                emptyLabel="No institution"
                disabled={Boolean(scopedInstitutionId)}
              />
            </div>
            <div className="space-y-2">
              <Label>Doctor</Label>
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
                placeholder="Select doctor"
                emptyLabel="No doctor"
                disabled={Boolean(scopedDoctorId)}
              />
            </div>
            <Field
              id="form-patient-email"
              label="Email"
              value={state.patientInformation.email}
              onChange={(email) => updatePatientInformation({ email })}
            />
            <Field
              id="form-patient-full-name"
              label="Full name"
              value={state.patientInformation.fullName}
              onChange={(fullName) => updatePatientInformation({ fullName })}
            />
            <Field
              id="form-patient-mrn"
              label="Medical record number"
              value={state.patientInformation.medicalRecordNumber}
              onChange={(medicalRecordNumber) =>
                updatePatientInformation({ medicalRecordNumber })
              }
            />
            <Field
              id="form-patient-birth-date"
              label="Birth date"
              type="date"
              value={state.patientInformation.birthDate}
              onChange={(birthDate) => updatePatientInformation({ birthDate })}
            />
            <Field
              id="form-patient-sex"
              label="Sex / gender"
              value={state.patientInformation.sex}
              onChange={(sex) => updatePatientInformation({ sex })}
            />
            <div className="space-y-2">
              <Label>Status</Label>
              <OptionSelectField
                options={PERSON_STATUS_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={state.patientInformation.status}
                onChange={(status) =>
                  updatePatientInformation({
                    status: status === "inactive" ? "inactive" : "active",
                  })
                }
                placeholder="Select status"
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-patient-notes"
                label="Notes"
                value={state.patientInformation.notes}
                onChange={(notes) => updatePatientInformation({ notes })}
              />
            </div>
          </div>
        ) : null}

        {currentStep === "medicalInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="form-previous-conceptions"
              label="numero concepciones previas"
              type="number"
              min="0"
              step="1"
              value={state.medicalInformation.previousConceptionsCount}
              onChange={(previousConceptionsCount) =>
                updateMedicalInformation({ previousConceptionsCount })
              }
            />
            <Field
              id="form-previous-miscarriages"
              label="numero abortos previos"
              type="number"
              min="0"
              step="1"
              value={state.medicalInformation.previousMiscarriagesCount}
              onChange={(previousMiscarriagesCount) =>
                updateMedicalInformation({ previousMiscarriagesCount })
              }
            />
            <Field
              id="form-previous-births"
              label="numero nacimientos previos"
              type="number"
              min="0"
              step="1"
              value={state.medicalInformation.previousBirthsCount}
              onChange={(previousBirthsCount) =>
                updateMedicalInformation({ previousBirthsCount })
              }
            />
            <Field
              id="form-previous-cycles"
              label="numero ciclos previos"
              type="number"
              min="0"
              step="1"
              value={state.medicalInformation.previousCyclesCount}
              onChange={(previousCyclesCount) =>
                updateMedicalInformation({ previousCyclesCount })
              }
            />
            <YesNoField
              label="Factor masculino"
              value={state.medicalInformation.maleFactor}
              onChange={(maleFactor) => updateMedicalInformation({ maleFactor })}
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-other-background"
                label="otros antecedentes"
                value={state.medicalInformation.otherBackground}
                onChange={(otherBackground) =>
                  updateMedicalInformation({ otherBackground })
                }
              />
            </div>
          </div>
        ) : null}

        {currentStep === "previousGeneticTests" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <YesNoField
              label="PGT-A / PGT-SR"
              value={state.previousGeneticTests.pgtASr}
              onChange={(pgtASr) => updatePreviousGeneticTests({ pgtASr })}
            />
            <YesNoField
              label="CARIOTIPO"
              value={state.previousGeneticTests.karyotype}
              onChange={(karyotype) =>
                updatePreviousGeneticTests({ karyotype })
              }
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-pgt-result"
                label="RESULTADO PGT"
                value={state.previousGeneticTests.pgtResult}
                onChange={(pgtResult) =>
                  updatePreviousGeneticTests({ pgtResult })
                }
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-karyotype-result"
                label="RESULTADO CARIOTIPO"
                value={state.previousGeneticTests.karyotypeResult}
                onChange={(karyotypeResult) =>
                  updatePreviousGeneticTests({ karyotypeResult })
                }
              />
            </div>
          </div>
        ) : null}

        {currentStep === "requestedTest" ? (
          formType === "study_request" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <YesNoField
                label="PGT-A"
                value={state.requestedTest.pgtA}
                onChange={(pgtA) => updateRequestedTest({ pgtA })}
              />
              <YesNoField
                label="PGT-SR"
                value={state.requestedTest.pgtSr}
                onChange={(pgtSr) => updateRequestedTest({ pgtSr })}
              />
              <YesNoField
                label="INFORMA MOSAICISMOS"
                value={state.requestedTest.reportsMosaicism}
                onChange={(reportsMosaicism) =>
                  updateRequestedTest({ reportsMosaicism })
                }
              />
              <YesNoField
                label="INFORMA SEXO"
                value={state.requestedTest.reportsSex}
                onChange={(reportsSex) => updateRequestedTest({ reportsSex })}
              />
              <div className="md:col-span-2">
                <TextAreaField
                  id="form-request-reason"
                  label="MOTIVO DE SOLICITUD"
                  value={state.requestedTest.requestReason}
                  onChange={(requestReason) =>
                    updateRequestedTest({ requestReason })
                  }
                />
              </div>
              <Field
                id="form-request-date"
                label="FECHA"
                type="date"
                value={state.requestedTest.requestDate}
                onChange={(requestDate) => updateRequestedTest({ requestDate })}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <YesNoField
                label="PGT-A"
                value={state.requestedTest.pgtA}
                onChange={(pgtA) => updateRequestedTest({ pgtA })}
              />
              <YesNoField
                label="PGT-SR"
                value={state.requestedTest.pgtSr}
                onChange={(pgtSr) => updateRequestedTest({ pgtSr })}
              />
            </div>
          )
        ) : null}

        {currentStep === "institutionInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Pick existing institution</Label>
              <OptionSelectField
                options={institutionOptions}
                value={state.selectedInstitutionId}
                onChange={selectInstitution}
                placeholder="Select institution"
                emptyLabel="Manual institution information"
              />
            </div>
            <Field
              id="form-institution-code"
              label="Institution code"
              value={state.institutionInformation.code}
              onChange={(code) => updateInstitutionInformation({ code })}
            />
            <Field
              id="form-institution-name"
              label="Institution name"
              value={state.institutionInformation.name}
              onChange={(name) => updateInstitutionInformation({ name })}
            />
            <div className="md:col-span-2">
              <Field
                id="form-institution-legal"
                label="Legal name"
                value={state.institutionInformation.legalName}
                onChange={(legalName) => updateInstitutionInformation({ legalName })}
              />
            </div>
            <Field
              id="form-institution-email"
              label="Contact email"
              value={state.institutionInformation.contactEmail}
              onChange={(contactEmail) =>
                updateInstitutionInformation({ contactEmail })
              }
            />
            <Field
              id="form-institution-phone"
              label="Contact phone"
              value={state.institutionInformation.contactPhone}
              onChange={(contactPhone) =>
                updateInstitutionInformation({ contactPhone })
              }
            />
            <div className="md:col-span-2">
              <Field
                id="form-institution-address-1"
                label="Address line 1"
                value={state.institutionInformation.addressLine1}
                onChange={(addressLine1) =>
                  updateInstitutionInformation({ addressLine1 })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Field
                id="form-institution-address-2"
                label="Address line 2"
                value={state.institutionInformation.addressLine2}
                onChange={(addressLine2) =>
                  updateInstitutionInformation({ addressLine2 })
                }
              />
            </div>
            <Field
              id="form-institution-city"
              label="City"
              value={state.institutionInformation.city}
              onChange={(city) => updateInstitutionInformation({ city })}
            />
            <Field
              id="form-institution-state"
              label="State / region"
              value={state.institutionInformation.state}
              onChange={(stateValue) =>
                updateInstitutionInformation({ state: stateValue })
              }
            />
            <Field
              id="form-institution-country"
              label="Country"
              value={state.institutionInformation.country}
              onChange={(country) => updateInstitutionInformation({ country })}
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-institution-notes"
                label="Notes"
                value={state.institutionInformation.notes}
                onChange={(notes) => updateInstitutionInformation({ notes })}
              />
            </div>
          </div>
        ) : null}

        {currentStep === "sampleInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="form-fiv-center"
              label="CENTRO FIV"
              value={state.sampleInformation.fivCenter}
              onChange={(fivCenter) => updateSampleInformation({ fivCenter })}
            />
            <Field
              id="form-center-code"
              label="CODIGO CENTRO"
              value={state.sampleInformation.centerCode}
              onChange={(centerCode) => updateSampleInformation({ centerCode })}
            />
            <div className="space-y-2 md:col-span-2">
              <Label>Pick existing MEDICO SOLICITANTE</Label>
              <OptionSelectField
                options={requestingDoctorOptions}
                value={state.selectedRequestingDoctorId}
                onChange={selectRequestingDoctor}
                placeholder="Select requesting doctor"
                emptyLabel="Manual requesting doctor information"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-requesting-doctor-institution">
                MEDICO SOLICITANTE institution
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
              label="MEDICO SOLICITANTE full name"
              value={state.sampleInformation.requestingDoctorFullName}
              onChange={(requestingDoctorFullName) =>
                updateSampleInformation({ requestingDoctorFullName })
              }
            />
            <Field
              id="form-requesting-doctor-auth-email"
              label="MEDICO SOLICITANTE auth email"
              value={state.sampleInformation.requestingDoctorAuthEmail}
              onChange={(requestingDoctorAuthEmail) =>
                updateSampleInformation({ requestingDoctorAuthEmail })
              }
            />
            <Field
              id="form-requesting-doctor-auth-uid"
              label="MEDICO SOLICITANTE auth uid"
              value={state.sampleInformation.requestingDoctorAuthUid}
              onChange={(requestingDoctorAuthUid) =>
                updateSampleInformation({ requestingDoctorAuthUid })
              }
            />
            <div className="space-y-2">
              <Label>MEDICO SOLICITANTE status</Label>
              <OptionSelectField
                options={PERSON_STATUS_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={state.sampleInformation.requestingDoctorStatus}
                onChange={(requestingDoctorStatus) =>
                  updateSampleInformation({
                    requestingDoctorStatus:
                      requestingDoctorStatus === "inactive" ? "inactive" : "active",
                  })
                }
                placeholder="Select status"
              />
            </div>
            <Field
              id="form-requesting-doctor-specialty"
              label="MEDICO SOLICITANTE specialty"
              value={state.sampleInformation.requestingDoctorSpecialty}
              onChange={(requestingDoctorSpecialty) =>
                updateSampleInformation({ requestingDoctorSpecialty })
              }
            />
            <Field
              id="form-requesting-doctor-license"
              label="MEDICO SOLICITANTE license number"
              value={state.sampleInformation.requestingDoctorLicenseNumber}
              onChange={(requestingDoctorLicenseNumber) =>
                updateSampleInformation({ requestingDoctorLicenseNumber })
              }
            />
            <Field
              id="form-requesting-doctor-phone"
              label="MEDICO SOLICITANTE contact phone"
              value={state.sampleInformation.requestingDoctorContactPhone}
              onChange={(requestingDoctorContactPhone) =>
                updateSampleInformation({ requestingDoctorContactPhone })
              }
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-requesting-doctor-notes"
                label="MEDICO SOLICITANTE notes"
                value={state.sampleInformation.requestingDoctorNotes}
                onChange={(requestingDoctorNotes) =>
                  updateSampleInformation({ requestingDoctorNotes })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>TIPO DE MUESTRA</Label>
              <OptionSelectField
                options={SAMPLE_TYPE_OPTIONS}
                value={state.sampleInformation.sampleType}
                onChange={(sampleType) => updateSampleInformation({ sampleType })}
                placeholder="Seleccionar"
              />
            </div>
            <Field
              id="form-processed-by-first-name"
              label="PROCESADO POR nombre"
              value={state.sampleInformation.processedByFirstName}
              onChange={(processedByFirstName) =>
                updateSampleInformation({ processedByFirstName })
              }
            />
            <Field
              id="form-processed-by-last-name"
              label="PROCESADO POR apellido"
              value={state.sampleInformation.processedByLastName}
              onChange={(processedByLastName) =>
                updateSampleInformation({ processedByLastName })
              }
            />
            <Field
              id="form-process-date"
              label="FECHA PROCESO"
              type="date"
              value={state.sampleInformation.processDate}
              onChange={(processDate) => updateSampleInformation({ processDate })}
            />
            <BoxCodeField
              value={state.sampleInformation.boxCode}
              onChange={(boxCode) => updateSampleInformation({ boxCode })}
            />
          </div>
        ) : null}

        {currentStep === "caseInformation" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <BoxCodeLinkCard code={state.sampleInformation.boxCode} />
            <div className="space-y-2 md:col-span-2">
              <Label>Pick existing 2PQ Case</Label>
              <OptionSelectField
                options={caseOptions}
                value={state.selectedCaseId}
                onChange={selectCase}
                placeholder="Select 2PQ case"
                emptyLabel="Create a new 2PQ case from these fields"
              />
            </div>
            <Field
              id="form-case-label"
              label="Case label"
              value={state.caseInformation.caseLabel}
              onChange={(caseLabel) => updateCaseInformation({ caseLabel })}
            />
            <div className="space-y-2">
              <Label>Case status</Label>
              <OptionSelectField
                options={CASE_STATUS_OPTIONS}
                value={state.caseInformation.caseStatus}
                onChange={(caseStatus) => updateCaseInformation({ caseStatus })}
                placeholder="Select status"
              />
            </div>
            <Field
              id="form-case-type"
              label="Case type"
              value={state.caseInformation.caseType}
              onChange={(caseType) => updateCaseInformation({ caseType })}
            />
            <div className="space-y-2">
              <Label>Priority</Label>
              <OptionSelectField
                options={PRIORITY_OPTIONS}
                value={state.caseInformation.priority}
                onChange={(priority) => updateCaseInformation({ priority })}
                placeholder="Select priority"
              />
            </div>
            <Field
              id="form-case-tracking"
              label="Tracking number"
              value={state.caseInformation.trackingNumber}
              onChange={(trackingNumber) =>
                updateCaseInformation({ trackingNumber })
              }
            />
            <Field
              id="form-case-requested-at"
              label="Requested at"
              type="date"
              value={state.caseInformation.requestedAt}
              onChange={(requestedAt) => updateCaseInformation({ requestedAt })}
            />
            <Field
              id="form-case-due-at"
              label="Due at"
              type="date"
              value={state.caseInformation.dueAt}
              onChange={(dueAt) => updateCaseInformation({ dueAt })}
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-case-notes"
                label="Case notes"
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
                    <p className="section-eyebrow">2pq_sampling</p>
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      Sampling {index + 1}
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
                    Remove
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    id={`form-sampling-id-${index}`}
                    label="Sample ID"
                    value={sampling.sampleId}
                    onChange={(sampleId) =>
                      updateSamplingInformation(index, { sampleId })
                    }
                  />
                  <Field
                    id={`form-sampling-type-${index}`}
                    label="Sample type"
                    value={sampling.sampleType}
                    onChange={(sampleType) =>
                      updateSamplingInformation(index, { sampleType })
                    }
                  />
                  <div className="space-y-2">
                    <Label>Processing status</Label>
                    <OptionSelectField
                      options={PROCESSING_OPTIONS}
                      value={sampling.processingStatus}
                      onChange={(processingStatus) =>
                        updateSamplingInformation(index, { processingStatus })
                      }
                      placeholder="Select status"
                    />
                  </div>
                  <Field
                    id={`form-sampling-collection-${index}`}
                    label="Collection date"
                    type="date"
                    value={sampling.collectionDate}
                    onChange={(collectionDate) =>
                      updateSamplingInformation(index, { collectionDate })
                    }
                  />
                  <Field
                    id={`form-sampling-reception-${index}`}
                    label="Reception date"
                    type="date"
                    value={sampling.receptionDate}
                    onChange={(receptionDate) =>
                      updateSamplingInformation(index, { receptionDate })
                    }
                  />
                  <Field
                    id={`form-sampling-run-${index}`}
                    label="Run ID"
                    value={sampling.runId}
                    onChange={(runId) => updateSamplingInformation(index, { runId })}
                  />
                  <Field
                    id={`form-sampling-qc-${index}`}
                    label="QC status"
                    value={sampling.qcStatus}
                    onChange={(qcStatus) =>
                      updateSamplingInformation(index, { qcStatus })
                    }
                  />
                  <div className="md:col-span-2">
                    <TextAreaField
                      id={`form-sampling-notes-${index}`}
                      label="Sampling notes"
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
              Add sampling
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedInstitution?.name ?? state.institutionInformation.name
              ? `Institution: ${selectedInstitution?.name ?? state.institutionInformation.name}`
              : "No institution selected"}{" "}
            {selectedDoctor ? `· Doctor: ${selectedDoctor.fullName}` : ""}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => void selectStep(stepIndex - 1)}
              disabled={stepIndex === 0 || pending || draftPending}
            >
              <ArrowLeft className="size-4" />
              Previous
            </Button>
            {stepIndex === steps.length - 1 ? (
              <Button
                onClick={() => void submitForm()}
                disabled={pending || draftPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {pending ? <FileText className="size-4 animate-pulse" /> : <Save className="size-4" />}
                {pending ? "Storing..." : "Store form"}
              </Button>
            ) : (
              <Button
                onClick={() => void goNext()}
                disabled={pending || draftPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
