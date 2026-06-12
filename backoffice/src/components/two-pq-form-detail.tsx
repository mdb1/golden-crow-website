"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppLanguage } from "@/components/app-language-provider";
import {
  TWO_PQ_FORM_LABELS,
  TWO_PQ_FORM_ROUTES,
  type TwoPQFormRecord,
} from "@/lib/two-pq-forms";
import { compactList } from "@/lib/moderation-utils";
import { appText, type AppLanguage } from "@/lib/language";

type FieldSpec = {
  key: string;
  label: string;
  type?:
    | "boolean"
    | "date"
    | "datetime"
    | "gameteSource"
    | "miscarriages"
    | "sampleType"
    | "caseStatus"
    | "priority"
    | "personStatus";
};

const PATIENT_FIELDS: FieldSpec[] = [
  { key: "patientId", label: "Scoped patient ID" },
  { key: "fullName", label: "Full name" },
  { key: "email", label: "Patient reference email" },
  { key: "institutionId", label: "Institution ID" },
  { key: "doctorId", label: "Doctor ID" },
  { key: "medicalRecordNumber", label: "DNI" },
  { key: "birthDate", label: "Birth date", type: "date" },
  { key: "notes", label: "Notes" },
  { key: "partnerFullName", label: "Pareja" },
  { key: "partnerMedicalRecordNumber", label: "DNI pareja" },
  { key: "partnerBirthDate", label: "Fecha de nacimiento pareja", type: "date" },
  { key: "partnerNotes", label: "Notas pareja" },
];

const INSTITUTION_FIELDS: FieldSpec[] = [
  { key: "name", label: "Institution name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "notes", label: "Notes" },
];

const STUDY_MEDICAL_FIELDS: FieldSpec[] = [
  { key: "spermGameteSource", label: "esperma", type: "gameteSource" },
  { key: "oocyteGameteSource", label: "ovocitos", type: "gameteSource" },
  { key: "maleFactor", label: "Factor masculino", type: "boolean" },
  {
    key: "previousMiscarriagesCount",
    label: "numero abortos previos",
    type: "miscarriages",
  },
  { key: "otherBackground", label: "Observaciones" },
];

const STUDY_PREVIOUS_TEST_FIELDS: FieldSpec[] = [
  { key: "karyotype", label: "Tiene informacion de cariotipo?", type: "boolean" },
  { key: "karyotypeFileName", label: "Archivo cariotipo" },
  { key: "karyotypeFileType", label: "Tipo archivo cariotipo" },
  { key: "karyotypeFileSize", label: "Tamaño archivo cariotipo" },
];

const STUDY_REQUESTED_TEST_FIELDS: FieldSpec[] = [
  { key: "pgtAFast", label: "PGT-A FAST", type: "boolean" },
  {
    key: "pgtAFastReportsMosaicism",
    label: "PGT-A FAST informa mosaicismo",
    type: "boolean",
  },
  {
    key: "pgtAFastReportsSex",
    label: "PGT-A FAST informa sexo",
    type: "boolean",
  },
  { key: "pgtAStandard", label: "PGT-A STANDARD", type: "boolean" },
  {
    key: "pgtAStandardReportsMosaicism",
    label: "PGT-A STANDARD informa mosaicismo",
    type: "boolean",
  },
  {
    key: "pgtAStandardReportsSex",
    label: "PGT-A STANDARD informa sexo",
    type: "boolean",
  },
  { key: "pgtSr", label: "PGT-SR", type: "boolean" },
  {
    key: "pgtSrReportsMosaicism",
    label: "PGT-SR informa mosaicismo",
    type: "boolean",
  },
  { key: "pgtSrReportsSex", label: "PGT-SR informa sexo", type: "boolean" },
];

const SAMPLE_LINKED_STUDY_REQUEST_FIELDS: FieldSpec[] = [
  { key: "linkedStudyRequestFormId", label: "Linked study request form" },
  { key: "createdAt", label: "Form creation date", type: "datetime" },
  { key: "updatedAt", label: "Last update", type: "datetime" },
];

const SAMPLE_REQUESTED_TEST_FIELDS: FieldSpec[] = [
  { key: "selectedRequestedTest", label: "Selected requested test" },
  { key: "reportsMosaicism", label: "Reports mosaicism", type: "boolean" },
  { key: "reportsSex", label: "Reports sex", type: "boolean" },
];

const SAMPLE_INFORMATION_FIELDS: FieldSpec[] = [
  { key: "boxCode", label: "Box code" },
  { key: "sampleType", label: "Sample type", type: "sampleType" },
  { key: "processDate", label: "Process date", type: "date" },
  { key: "processedByFirstName", label: "Processed by first name" },
  { key: "processedByLastName", label: "Processed by last name" },
  { key: "biopsyCount", label: "Number of biopsies" },
];

const REQUESTING_DOCTOR_FIELDS: FieldSpec[] = [
  { key: "requestingDoctorId", label: "Doctor ID" },
  { key: "requestingDoctorInstitutionId", label: "Institution ID" },
  { key: "requestingDoctorFullName", label: "Full name" },
  { key: "requestingDoctorAuthEmail", label: "Auth email" },
  { key: "requestingDoctorAuthUid", label: "Auth UID" },
  { key: "requestingDoctorSpecialty", label: "Specialty" },
  { key: "requestingDoctorLicenseNumber", label: "License number" },
  { key: "requestingDoctorContactPhone", label: "Contact phone" },
  { key: "requestingDoctorStatus", label: "Status", type: "personStatus" },
  { key: "requestingDoctorNotes", label: "Notes" },
];

const CASE_INFORMATION_FIELDS: FieldSpec[] = [
  { key: "caseLabel", label: "Case label" },
  { key: "caseStatus", label: "Case status", type: "caseStatus" },
  { key: "caseType", label: "Case type" },
  { key: "priority", label: "Priority", type: "priority" },
  { key: "requestedAt", label: "Requested at", type: "date" },
  { key: "notes", label: "Notes" },
];

const SAMPLING_INFORMATION_FIELDS: FieldSpec[] = [
  { key: "sampleId", label: "Sample ID" },
  { key: "internalCode", label: "Internal code" },
  { key: "embryoStageDay", label: "Stage day 5, 6 or 7" },
  { key: "morphology", label: "Morphology" },
  { key: "sentUl", label: "Sent uL" },
  { key: "biopsiedCells", label: "Biopsied cells" },
  { key: "cellsVisualized", label: "Cells visualized?", type: "boolean" },
  { key: "notes", label: "Comments" },
];

const REQUESTED_TEST_LABEL_BY_KEY: Record<string, string> = {
  pgtAFast: "PGT A fast",
  pgtAStandard: "PGT A standard",
  pgtA: "PGT-A",
  pgtSr: "PGT SR",
};

const SAMPLE_TYPE_LABEL_BY_VALUE: Record<string, string> = {
  "biopsia de trofoectodermo": "Trophectoderm biopsy",
  "rebiopsia de trofoectodermo": "Trophectoderm rebiopsy",
  otro: "Other",
};

const CASE_STATUS_LABEL_BY_VALUE: Record<string, string> = {
  intake: "Intake",
  active: "Active",
  blocked: "Blocked",
  reporting: "Reporting",
  delivered: "Delivered",
};

const PRIORITY_LABEL_BY_VALUE: Record<string, string> = {
  routine: "Routine",
  priority: "Priority",
  urgent: "Urgent",
};

const PERSON_STATUS_LABEL_BY_VALUE: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
};

function isYesAnswer(value: unknown) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["si", "sí", "yes", "true", "1"].includes(value.trim().toLowerCase());
}

function selectedRequestedTestKeyFromRecord(
  data: Record<string, unknown> | undefined
) {
  if (!data) return "";
  if (isYesAnswer(data.pgtAFast)) return "pgtAFast";
  if (isYesAnswer(data.pgtAStandard)) return "pgtAStandard";
  if (isYesAnswer(data.pgtSr)) return "pgtSr";
  if (isYesAnswer(data.pgtA)) return "pgtA";

  const testName = getTextValue(data, "testName")?.toUpperCase() ?? "";
  if (testName.includes("FAST")) return "pgtAFast";
  if (testName.includes("STANDARD")) return "pgtAStandard";
  if (testName.includes("PGT SR") || testName.includes("PGT-SR")) return "pgtSr";
  if (testName.includes("PGT A") || testName.includes("PGT-A")) return "pgtA";
  return "";
}

function requestedTestReportValue(
  data: Record<string, unknown> | undefined,
  selectedKey: string,
  report: "Mosaicism" | "Sex"
) {
  if (!data) return undefined;
  if (selectedKey === "pgtAFast") return data[`pgtAFastReports${report}`];
  if (selectedKey === "pgtAStandard") {
    return data[`pgtAStandardReports${report}`];
  }
  if (selectedKey === "pgtSr") return data[`pgtSrReports${report}`];
  return data[`reports${report}`];
}

function formatDate(value: string, language: AppLanguage, includeTime = false) {
  const dateSource =
    !includeTime && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? `${value.slice(0, 10)}T12:00:00`
      : value;
  const date = new Date(dateSource);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function formatValue(
  value: unknown,
  language: AppLanguage,
  t: (text: string) => string,
  type?: FieldSpec["type"]
) {
  if (value === null || typeof value === "undefined" || value === "") {
    return t("Not provided");
  }
  if (typeof value === "boolean") {
    return value ? "SI" : "NO";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    if (type === "boolean") {
      const normalized = value.trim().toLowerCase();
      if (["si", "sí", "yes", "true", "1"].includes(normalized)) {
        return "SI";
      }
      if (["no", "false", "0"].includes(normalized)) {
        return "NO";
      }
    }
    if (type === "date" || type === "datetime") {
      return formatDate(value, language, type === "datetime");
    }
    if (type === "gameteSource") {
      if (value === "propio") return "Propio";
      if (value === "donado") return "Donado";
    }
    if (type === "miscarriages") {
      if (value === "3_or_more" || value === "recurrent") {
        return "3 o más (recurrente)";
      }
    }
    if (type === "sampleType") {
      return t(SAMPLE_TYPE_LABEL_BY_VALUE[value] ?? value);
    }
    if (type === "caseStatus") {
      return t(CASE_STATUS_LABEL_BY_VALUE[value] ?? value);
    }
    if (type === "priority") {
      return t(PRIORITY_LABEL_BY_VALUE[value] ?? value);
    }
    if (type === "personStatus") {
      return t(PERSON_STATUS_LABEL_BY_VALUE[value] ?? value);
    }
    return value;
  }

  return JSON.stringify(value);
}

function DetailSection({
  title,
  fields,
  data,
}: {
  title: string;
  fields: FieldSpec[];
  data?: Record<string, unknown>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <section className="glass-panel flex flex-col gap-4 px-5 py-5">
      <div>
        <p className="section-eyebrow">2pq_forms</p>
        <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      </div>
      <dl className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.key}
            className="rounded-xl border border-border/70 bg-background/58 px-4 py-3"
          >
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              {t(field.label)}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {formatValue(data?.[field.key], language, t, field.type)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function getTextValue(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function displayCaseLabel(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const xxxMatch = /^([A-Za-z]{3})XXX$/i.exec(normalized);
  return xxxMatch ? xxxMatch[1].toUpperCase() : normalized;
}

function LinkedRecordsSection({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const samplingEntries = form.samplingInformation ?? [];

  if (!form.linkedCaseId && samplingEntries.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-emerald-300/60 bg-emerald-50/70 px-5 py-5 shadow-[0_16px_40px_rgba(16,185,129,0.12)] dark:border-emerald-300/24 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-1">
        <p className="section-eyebrow text-emerald-700 dark:text-emerald-200">
          {t("Linked entities")}
        </p>
        <h2 className="font-heading text-xl font-semibold text-emerald-950 dark:text-emerald-50">
          {t("2PQ Case and sampling records")}
        </h2>
      </div>
      <div className="mt-4 grid gap-3">
        {form.linkedCaseId ? (
          <div className="rounded-xl border border-emerald-200 bg-white/72 px-4 py-3 dark:border-emerald-300/20 dark:bg-emerald-950/24">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-200">
                <ClipboardList className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="section-eyebrow text-emerald-700 dark:text-emerald-200">
                  {t("Box code")}
                </p>
                <p className="font-heading text-3xl font-semibold text-emerald-950 dark:text-emerald-50">
                  {displayCaseLabel(getTextValue(form.caseInformation, "caseLabel")) ||
                    displayCaseLabel(getTextValue(form.caseInformation, "three_letter_code")) ||
                    form.linkedCaseId}
                </p>
                <p className="font-mono text-xs text-emerald-900/70 dark:text-emerald-100/70">
                  {form.linkedCaseId}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/2pq-dashboard/cases/${encodeURIComponent(form.linkedCaseId)}`}>
                  {t("Open")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
        {samplingEntries.map((sampling, index) => {
          const samplingId =
            getTextValue(sampling, "id") ?? form.linkedSamplingIds?.[index];
          if (!samplingId) {
            return null;
          }

          return (
            <div
              key={`${samplingId}-${index}`}
              className="rounded-xl border border-emerald-200 bg-white/72 px-4 py-3 dark:border-emerald-300/20 dark:bg-emerald-950/24"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-200">
                  <FlaskConical className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-emerald-950 dark:text-emerald-50">
                    {getTextValue(sampling, "sampleId") ?? samplingId}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    {SAMPLING_INFORMATION_FIELDS.filter(
                      (field) => field.key !== "sampleId"
                    ).map((field) => (
                      <div key={field.key}>
                        <dt className="text-xs font-semibold uppercase text-emerald-900/62 dark:text-emerald-100/62">
                          {t(field.label)}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-emerald-950 dark:text-emerald-50">
                          {formatValue(sampling[field.key], language, t, field.type)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/2pq-dashboard/sampling/${encodeURIComponent(samplingId)}`}>
                    {t("Open")}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PatientLinkSection({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const patientId = form.selectedPatientId ?? getTextValue(form.patientInformation, "patientId");

  return (
    <section className="rounded-2xl border border-sky-200/80 bg-sky-50/72 px-5 py-5 shadow-[0_16px_38px_rgba(14,165,233,0.12)] dark:border-sky-300/24 dark:bg-sky-950/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/78 text-sky-700 shadow-sm dark:bg-sky-400/12 dark:text-sky-200">
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="section-eyebrow text-sky-700 dark:text-sky-200">
              {t("Step 1 patient link")}
            </p>
            <h2 className="font-heading text-xl font-semibold text-sky-950 dark:text-sky-50">
              {form.patientName ?? getTextValue(form.patientInformation, "fullName") ?? t("Scoped patient")}
            </h2>
            <p className="mt-1 text-sm text-sky-950/72 dark:text-sky-50/74">
              {patientId
                ? t("This form is linked to the scoped patient record used for Step 1.")
                : t("This legacy form does not have a scoped patient link stored.")}
            </p>
            {patientId ? (
              <p className="mt-2 font-mono text-xs text-sky-900/74 dark:text-sky-100/74">
                {patientId}
              </p>
            ) : null}
          </div>
        </div>
        {patientId ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/areas/patients/${encodeURIComponent(patientId)}`}>
              {t("Open patient")}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function RequestingDoctorLinkSection({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  if (form.formType !== "sample") {
    return null;
  }

  const requestingDoctorId =
    form.selectedRequestingDoctorId ||
    getTextValue(form.sampleInformation, "requestingDoctorId") ||
    form.doctorId ||
    getTextValue(form.patientInformation, "doctorId");

  return (
    <section className="rounded-2xl border border-violet-200/80 bg-violet-50/72 px-5 py-5 shadow-[0_16px_38px_rgba(124,58,237,0.12)] dark:border-violet-300/24 dark:bg-violet-950/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/78 text-violet-700 shadow-sm dark:bg-violet-400/12 dark:text-violet-200">
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="section-eyebrow text-violet-700 dark:text-violet-200">
              {t("Requesting doctor link")}
            </p>
            <h2 className="font-heading text-xl font-semibold text-violet-950 dark:text-violet-50">
              {getTextValue(form.sampleInformation, "requestingDoctorFullName") ??
                t("Requesting doctor")}
            </h2>
            <p className="mt-1 text-sm text-violet-950/72 dark:text-violet-50/74">
              {requestingDoctorId
                ? t("This sample form is linked to the scoped requesting doctor record.")
                : t("This sample form is missing the requesting doctor link.")}
            </p>
            {requestingDoctorId ? (
              <p className="mt-2 font-mono text-xs text-violet-900/74 dark:text-violet-100/74">
                {requestingDoctorId}
              </p>
            ) : null}
          </div>
        </div>
        {requestingDoctorId ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/areas/doctors/${encodeURIComponent(requestingDoctorId)}`}>
              {t("Open doctor")}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function TwoPQFormDetail({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const authorEmail = form.authorEmail ?? form.createdByEmail;
  const selectedSampleRequestedTestKey = selectedRequestedTestKeyFromRecord(
    form.requestedTest
  );
  const sampleRequestedTestData: Record<string, unknown> = {
    selectedRequestedTest: selectedSampleRequestedTestKey
      ? t(REQUESTED_TEST_LABEL_BY_KEY[selectedSampleRequestedTestKey])
      : getTextValue(form.requestedTest, "testName"),
    reportsMosaicism: requestedTestReportValue(
      form.requestedTest,
      selectedSampleRequestedTestKey,
      "Mosaicism"
    ),
    reportsSex: requestedTestReportValue(
      form.requestedTest,
      selectedSampleRequestedTestKey,
      "Sex"
    ),
  };
  const sampleLinkedStudyRequestData: Record<string, unknown> = {
    linkedStudyRequestFormId: form.linkedStudyRequestFormId,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
  const sampleRequestingDoctorData: Record<string, unknown> = {
    ...(form.sampleInformation ?? {}),
    requestingDoctorId:
      form.selectedRequestingDoctorId ||
      getTextValue(form.sampleInformation, "requestingDoctorId") ||
      form.doctorId ||
      getTextValue(form.patientInformation, "doctorId"),
    requestingDoctorInstitutionId:
      getTextValue(form.sampleInformation, "requestingDoctorInstitutionId") ||
      form.institutionId ||
      getTextValue(form.patientInformation, "institutionId"),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">
            <ArrowLeft className="size-3.5" />
            {t("Back to forms")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={TWO_PQ_FORM_ROUTES[form.formType]}>{t("New similar form")}</Link>
        </Button>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-eyebrow">{form.id}</p>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              {form.patientName ?? t("Unnamed patient")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {compactList([
                TWO_PQ_FORM_LABELS[form.formType],
                form.requestedTestName,
                form.institutionName,
                form.patientEmail,
              ])}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">{t(TWO_PQ_FORM_LABELS[form.formType])}</Badge>
            <Badge variant="outline">
              <CalendarDays className="mr-1 size-3.5" />
              {formatDate(form.createdAt, language, true)}
            </Badge>
            {authorEmail ? (
              <Badge variant="outline">
                <UserRound className="mr-1 size-3.5" />
                {authorEmail}
              </Badge>
            ) : null}
            <Badge variant="outline">
              <FileText className="mr-1 size-3.5" />
              2pq_forms
            </Badge>
          </div>
        </div>
      </section>

      {form.formType === "sample" ? (
        <>
          <LinkedRecordsSection form={form} />
          <PatientLinkSection form={form} />
          <RequestingDoctorLinkSection form={form} />
          <DetailSection
            title={t("Linked study request form")}
            fields={SAMPLE_LINKED_STUDY_REQUEST_FIELDS}
            data={sampleLinkedStudyRequestData}
          />
          <DetailSection
            title={t("Patient information")}
            fields={PATIENT_FIELDS}
            data={form.patientInformation}
          />
          <DetailSection
            title={t("Requesting doctor")}
            fields={REQUESTING_DOCTOR_FIELDS}
            data={sampleRequestingDoctorData}
          />
          <DetailSection
            title={t("Requested test")}
            fields={SAMPLE_REQUESTED_TEST_FIELDS}
            data={sampleRequestedTestData}
          />
          <DetailSection
            title={t("Biopsy form information")}
            fields={SAMPLE_INFORMATION_FIELDS}
            data={form.sampleInformation}
          />
          {form.caseInformation ? (
            <DetailSection
              title={t("2PQ Case")}
              fields={CASE_INFORMATION_FIELDS}
              data={form.caseInformation}
            />
          ) : null}
          {(form.samplingInformation ?? []).map((sampling, index) => (
            <DetailSection
              key={`${getTextValue(sampling, "id") ?? index}`}
              title={`${t("2PQ Sampling")} ${index + 1}`}
              fields={SAMPLING_INFORMATION_FIELDS}
              data={sampling}
            />
          ))}
        </>
      ) : (
        <>
          <PatientLinkSection form={form} />
          <DetailSection
            title={t("Patient information")}
            fields={PATIENT_FIELDS}
            data={form.patientInformation}
          />
          <DetailSection
            title={t("Medical information")}
            fields={STUDY_MEDICAL_FIELDS}
            data={form.medicalInformation}
          />
          <DetailSection
            title={t("Previous genetic tests")}
            fields={STUDY_PREVIOUS_TEST_FIELDS}
            data={form.previousGeneticTests}
          />
          <DetailSection
            title={t("Requested test")}
            fields={STUDY_REQUESTED_TEST_FIELDS}
            data={form.requestedTest}
          />
          <DetailSection
            title={t("Institution information")}
            fields={INSTITUTION_FIELDS}
            data={form.institutionInformation}
          />
        </>
      )}
    </div>
  );
}
