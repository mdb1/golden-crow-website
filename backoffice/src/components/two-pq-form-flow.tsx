"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Save } from "lucide-react";
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
import {
  TWO_PQ_FORM_LABELS,
  type InstitutionInformationFormState,
  type MedicalInformationFormState,
  type PatientInformationFormState,
  type PreviousGeneticTestsFormState,
  type RequestedTestFormState,
  type SampleInformationFormState,
  type TwoPQFormRecord,
  type TwoPQFormType,
} from "@/lib/two-pq-forms";

type StepKey =
  | "patientInformation"
  | "medicalInformation"
  | "previousGeneticTests"
  | "requestedTest"
  | "institutionInformation"
  | "sampleInformation";

type FlowState = {
  selectedPatientId: string;
  selectedInstitutionId: string;
  patientInformation: PatientInformationFormState;
  medicalInformation: MedicalInformationFormState;
  previousGeneticTests: PreviousGeneticTestsFormState;
  requestedTest: RequestedTestFormState;
  institutionInformation: InstitutionInformationFormState;
  sampleInformation: SampleInformationFormState;
};

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
];

const STEP_LABELS: Record<StepKey, string> = {
  patientInformation: "Patient information",
  medicalInformation: "Medical information",
  previousGeneticTests: "Previous genetic tests",
  requestedTest: "Test solicitado",
  institutionInformation: "Institution information",
  sampleInformation: "Sample information",
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function optionalValidEmail(value: string) {
  return !value.trim() || isValidEmail(value);
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : "";
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

function buildInitialState(
  institutionId: string,
  doctorId: string
): FlowState {
  return {
    selectedPatientId: "",
    selectedInstitutionId: "",
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
      clinicalIndication: "",
      suspectedDiagnosis: "",
      symptoms: "",
      familyHistory: "",
      requestingDoctor: "",
      notes: "",
    },
    previousGeneticTests: {
      hasPreviousTests: "",
      testDescription: "",
      labName: "",
      testDate: "",
      resultSummary: "",
      reportAvailable: "",
    },
    requestedTest: {
      testName: "",
      testCode: "",
      priority: "",
      reason: "",
      notes: "",
    },
    institutionInformation: emptyInstitution(),
    sampleInformation: {
      sampleType: "",
      sampleId: "",
      collectionDate: "",
      collectionSite: "",
      collectorName: "",
      storageCondition: "",
      notes: "",
    },
  };
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

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
}: {
  formType: TwoPQFormType;
  institutions: InstitutionListItem[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
}) {
  const adminContext = useAdminContext();
  const router = useRouter();
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

  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [state, setState] = useState<FlowState>(() =>
    buildInitialState(defaultInstitutionId, defaultDoctorId)
  );
  const steps = formType === "study_request" ? STUDY_REQUEST_STEPS : SAMPLE_STEPS;
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
  const patientOptions = patients.map((patient) => ({
    value: patient.id,
    label: `${patient.fullName} (${patient.id})`,
  }));

  const progressLabel = useMemo(
    () => `${stepIndex + 1} of ${steps.length}`,
    [stepIndex, steps.length]
  );

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

  function selectPatient(patientId: string) {
    const patient = patients.find((candidate) => candidate.id === patientId);
    const patientInstitution = patient
      ? institutions.find((institution) => institution.id === patient.institutionId)
      : null;
    setState((current) => ({
      ...current,
      selectedPatientId: patientId,
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

  function selectInstitution(institutionId: string) {
    const institution = institutions.find((candidate) => candidate.id === institutionId);
    setState((current) => ({
      ...current,
      selectedInstitutionId: institutionId,
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

    if (
      step === "medicalInformation" &&
      !state.medicalInformation.clinicalIndication.trim()
    ) {
      return "Clinical indication is required.";
    }

    if (
      step === "previousGeneticTests" &&
      !state.previousGeneticTests.hasPreviousTests.trim()
    ) {
      return "Select whether previous genetic tests exist.";
    }

    if (step === "requestedTest" && !state.requestedTest.testName.trim()) {
      return "Requested test is required.";
    }

    if (step === "institutionInformation") {
      if (!state.institutionInformation.name.trim()) {
        return "Institution name is required.";
      }
      if (!optionalValidEmail(state.institutionInformation.contactEmail)) {
        return "Enter a valid institution contact email.";
      }
    }

    if (step === "sampleInformation" && !state.sampleInformation.sampleType.trim()) {
      return "Sample type is required.";
    }

    return null;
  }

  function goNext() {
    const message = validationError(currentStep);
    if (message) {
      setToast({ id: Date.now(), tone: "error", message });
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submitForm() {
    const message = validationError(currentStep);
    if (message) {
      setToast({ id: Date.now(), tone: "error", message });
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
              patientInformation: state.patientInformation,
              requestedTest: state.requestedTest,
              sampleInformation: state.sampleInformation,
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
          <Link href="/2pq-dashboard">
            <ArrowLeft className="size-3.5" />
            Back to 2PQ dashboard
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">Forms</Link>
        </Button>
      </div>

      <section className="glass-panel flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">2PQ Forms</p>
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              {TWO_PQ_FORM_LABELS[formType]}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentStepLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{progressLabel}</Badge>
            <Badge variant="brand">2pq_forms</Badge>
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
                onClick={() => setStepIndex(index)}
                className={[
                  "flex min-h-14 items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-indigo-300 bg-indigo-500/12 text-indigo-950 dark:border-indigo-300/40 dark:text-indigo-100"
                    : "border-border/80 bg-background/54 text-muted-foreground hover:bg-background/80",
                ].join(" ")}
              >
                <span>{STEP_LABELS[step]}</span>
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
                  updatePatientInformation({
                    institutionId,
                    doctorId: nextDoctors.some(
                      (doctor) => doctor.id === state.patientInformation.doctorId
                    )
                      ? state.patientInformation.doctorId
                      : "",
                  });
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
                onChange={(doctorId) => updatePatientInformation({ doctorId })}
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
            <div className="md:col-span-2">
              <TextAreaField
                id="form-clinical-indication"
                label="Clinical indication"
                value={state.medicalInformation.clinicalIndication}
                onChange={(clinicalIndication) =>
                  updateMedicalInformation({ clinicalIndication })
                }
              />
            </div>
            <Field
              id="form-suspected-diagnosis"
              label="Suspected diagnosis"
              value={state.medicalInformation.suspectedDiagnosis}
              onChange={(suspectedDiagnosis) =>
                updateMedicalInformation({ suspectedDiagnosis })
              }
            />
            <Field
              id="form-requesting-doctor"
              label="Requesting doctor"
              value={state.medicalInformation.requestingDoctor}
              onChange={(requestingDoctor) =>
                updateMedicalInformation({ requestingDoctor })
              }
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-symptoms"
                label="Symptoms"
                value={state.medicalInformation.symptoms}
                onChange={(symptoms) => updateMedicalInformation({ symptoms })}
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-family-history"
                label="Family history"
                value={state.medicalInformation.familyHistory}
                onChange={(familyHistory) =>
                  updateMedicalInformation({ familyHistory })
                }
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-medical-notes"
                label="Notes"
                value={state.medicalInformation.notes}
                onChange={(notes) => updateMedicalInformation({ notes })}
              />
            </div>
          </div>
        ) : null}

        {currentStep === "previousGeneticTests" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Previous tests?</Label>
              <OptionSelectField
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "unknown", label: "Unknown" },
                ]}
                value={state.previousGeneticTests.hasPreviousTests}
                onChange={(hasPreviousTests) =>
                  updatePreviousGeneticTests({ hasPreviousTests })
                }
                placeholder="Select answer"
              />
            </div>
            <Field
              id="form-previous-test-date"
              label="Test date"
              type="date"
              value={state.previousGeneticTests.testDate}
              onChange={(testDate) => updatePreviousGeneticTests({ testDate })}
            />
            <Field
              id="form-previous-lab"
              label="Lab name"
              value={state.previousGeneticTests.labName}
              onChange={(labName) => updatePreviousGeneticTests({ labName })}
            />
            <Field
              id="form-report-available"
              label="Report available"
              value={state.previousGeneticTests.reportAvailable}
              onChange={(reportAvailable) =>
                updatePreviousGeneticTests({ reportAvailable })
              }
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-previous-description"
                label="Test description"
                value={state.previousGeneticTests.testDescription}
                onChange={(testDescription) =>
                  updatePreviousGeneticTests({ testDescription })
                }
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-previous-results"
                label="Result summary"
                value={state.previousGeneticTests.resultSummary}
                onChange={(resultSummary) =>
                  updatePreviousGeneticTests({ resultSummary })
                }
              />
            </div>
          </div>
        ) : null}

        {currentStep === "requestedTest" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="form-test-name"
              label="Requested test"
              value={state.requestedTest.testName}
              onChange={(testName) => updateRequestedTest({ testName })}
            />
            <Field
              id="form-test-code"
              label="Test code"
              value={state.requestedTest.testCode}
              onChange={(testCode) => updateRequestedTest({ testCode })}
            />
            <Field
              id="form-test-priority"
              label="Priority"
              value={state.requestedTest.priority}
              onChange={(priority) => updateRequestedTest({ priority })}
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-test-reason"
                label="Reason"
                value={state.requestedTest.reason}
                onChange={(reason) => updateRequestedTest({ reason })}
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                id="form-test-notes"
                label="Notes"
                value={state.requestedTest.notes}
                onChange={(notes) => updateRequestedTest({ notes })}
              />
            </div>
          </div>
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
              id="form-sample-type"
              label="Sample type"
              value={state.sampleInformation.sampleType}
              onChange={(sampleType) => updateSampleInformation({ sampleType })}
            />
            <Field
              id="form-sample-id"
              label="Sample id"
              value={state.sampleInformation.sampleId}
              onChange={(sampleId) => updateSampleInformation({ sampleId })}
            />
            <Field
              id="form-sample-collection-date"
              label="Collection date"
              type="date"
              value={state.sampleInformation.collectionDate}
              onChange={(collectionDate) =>
                updateSampleInformation({ collectionDate })
              }
            />
            <Field
              id="form-sample-site"
              label="Collection site"
              value={state.sampleInformation.collectionSite}
              onChange={(collectionSite) =>
                updateSampleInformation({ collectionSite })
              }
            />
            <Field
              id="form-sample-collector"
              label="Collector name"
              value={state.sampleInformation.collectorName}
              onChange={(collectorName) =>
                updateSampleInformation({ collectorName })
              }
            />
            <Field
              id="form-sample-storage"
              label="Storage condition"
              value={state.sampleInformation.storageCondition}
              onChange={(storageCondition) =>
                updateSampleInformation({ storageCondition })
              }
            />
            <div className="md:col-span-2">
              <TextAreaField
                id="form-sample-notes"
                label="Notes"
                value={state.sampleInformation.notes}
                onChange={(notes) => updateSampleInformation({ notes })}
              />
            </div>
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
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
              disabled={stepIndex === 0 || pending}
            >
              <ArrowLeft className="size-4" />
              Previous
            </Button>
            {stepIndex === steps.length - 1 ? (
              <Button
                onClick={() => void submitForm()}
                disabled={pending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {pending ? <FileText className="size-4 animate-pulse" /> : <Save className="size-4" />}
                {pending ? "Storing..." : "Store form"}
              </Button>
            ) : (
              <Button
                onClick={goNext}
                disabled={pending}
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
