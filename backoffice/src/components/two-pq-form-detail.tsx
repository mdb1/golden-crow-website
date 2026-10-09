"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FileText,
  Link2,
  Loader2,
  Search,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppLanguage } from "@/components/app-language-provider";
import {
  TWO_PQ_FORM_LABELS,
  TWO_PQ_FORM_ROUTES,
  getTwoPQFormDisplayTitle,
  type TwoPQFormRecord,
} from "@/lib/two-pq-forms";
import { getTwoPQCaseStatusLabel } from "@/lib/two-pq-areas";
import { compactList } from "@/lib/moderation-utils";
import { appText, type AppLanguage } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

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
    | "processingStatus"
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
  {
    key: "partnerBirthDate",
    label: "Fecha de nacimiento pareja",
    type: "date",
  },
  { key: "partnerNotes", label: "Notas pareja" },
];

const INSTITUTION_FIELDS: FieldSpec[] = [
  { key: "code", label: "Institution code" },
  { key: "name", label: "Institution name" },
  { key: "legalName", label: "Legal name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / region" },
  { key: "country", label: "Country" },
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
  {
    key: "karyotype",
    label: "Tiene informacion de cariotipo?",
    type: "boolean",
  },
  { key: "karyotypeFileName", label: "Archivo cariotipo" },
  { key: "karyotypeFileType", label: "Tipo archivo cariotipo" },
  { key: "karyotypeFileSize", label: "Tamaño archivo cariotipo" },
];

const SAMPLE_LINKED_STUDY_REQUEST_FIELDS: FieldSpec[] = [
  { key: "studyRequestForm", label: "Linked study request form" },
  { key: "withdrawalRequest", label: "Linked withdrawal request" },
  { key: "createdAt", label: "Form creation date", type: "datetime" },
  { key: "updatedAt", label: "Last update", type: "datetime" },
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
  { key: "processingStatus", label: "Status", type: "processingStatus" },
  { key: "internalCode", label: "Internal code" },
  { key: "embryoStageDay", label: "Stage day 5, 6 or 7" },
  { key: "morphology", label: "Morphology" },
  { key: "sentUl", label: "Sent uL" },
  { key: "biopsiedCells", label: "Biopsied cells" },
  { key: "cellsVisualized", label: "Cells visualized?", type: "boolean" },
  { key: "notes", label: "Comments" },
];

const SAMPLE_TYPE_LABEL_BY_VALUE: Record<string, string> = {
  "biopsia de trofoectodermo": "Trophectoderm biopsy",
  "rebiopsia de trofoectodermo": "Trophectoderm rebiopsy",
  otro: "Other",
};

const PRIORITY_LABEL_BY_VALUE: Record<string, string> = {
  routine: "Routine",
  priority: "Priority",
  urgent: "Urgent",
};

const PROCESSING_STATUS_LABEL_BY_VALUE: Record<string, string> = {
  awaiting_reception: "Awaiting reception",
  discarded: "Discarded",
  received: "Received",
  processing: "Processing",
  qc_hold: "QC hold",
  ready_for_sequencing: "Ready for sequencing",
};

const PERSON_STATUS_LABEL_BY_VALUE: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
};

const REQUESTED_TEST_SEGMENTS = [
  {
    key: "pgtAFast",
    title: "PGT-A FAST",
    requestedKey: "pgtAFast",
    mosaicismKey: "pgtAFastReportsMosaicism",
    sexKey: "pgtAFastReportsSex",
  },
  {
    key: "pgtAStandard",
    title: "PGT-A STANDARD",
    requestedKey: "pgtAStandard",
    mosaicismKey: "pgtAStandardReportsMosaicism",
    sexKey: "pgtAStandardReportsSex",
  },
  {
    key: "pgtSr",
    title: "PGT-SR",
    requestedKey: "pgtSr",
    mosaicismKey: "pgtSrReportsMosaicism",
    sexKey: "pgtSrReportsSex",
  },
] as const;

function isYesAnswer(value: unknown) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["si", "sí", "yes", "true", "1"].includes(value.trim().toLowerCase());
}

function selectedRequestedTestKeyFromRecord(
  data: Record<string, unknown> | undefined,
) {
  if (!data) return "";
  if (isYesAnswer(data.pgtAFast)) return "pgtAFast";
  if (isYesAnswer(data.pgtAStandard)) return "pgtAStandard";
  if (isYesAnswer(data.pgtSr)) return "pgtSr";
  if (isYesAnswer(data.pgtA)) return "pgtA";

  const testName = getTextValue(data, "testName")?.toUpperCase() ?? "";
  if (testName.includes("FAST")) return "pgtAFast";
  if (testName.includes("STANDARD")) return "pgtAStandard";
  if (testName.includes("PGT SR") || testName.includes("PGT-SR"))
    return "pgtSr";
  if (testName.includes("PGT A") || testName.includes("PGT-A")) return "pgtA";
  return "";
}

function requestedTestSegmentRequestedValue(
  data: Record<string, unknown> | undefined,
  segment: (typeof REQUESTED_TEST_SEGMENTS)[number],
  selectedKey: string,
) {
  const directValue = data?.[segment.requestedKey];
  if (directValue !== null && typeof directValue !== "undefined") {
    return directValue;
  }
  return selectedKey ? segment.key === selectedKey : undefined;
}

function requestedTestSegmentReportValue(
  data: Record<string, unknown> | undefined,
  segment: (typeof REQUESTED_TEST_SEGMENTS)[number],
  selectedKey: string,
  report: "Mosaicism" | "Sex",
) {
  const fieldKey =
    report === "Mosaicism" ? segment.mosaicismKey : segment.sexKey;
  const directValue = data?.[fieldKey];
  if (directValue !== null && typeof directValue !== "undefined") {
    return directValue;
  }
  if (selectedKey === segment.key) {
    return data?.[`reports${report}`];
  }
  return undefined;
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
  type?: FieldSpec["type"],
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
      return t(getTwoPQCaseStatusLabel(value));
    }
    if (type === "priority") {
      return t(PRIORITY_LABEL_BY_VALUE[value] ?? value);
    }
    if (type === "processingStatus") {
      return t(PROCESSING_STATUS_LABEL_BY_VALUE[value] ?? value);
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
    <section className="rounded-sm bg-white px-6 py-6 text-black shadow-[0_18px_48px_rgba(15,23,42,0.12)] ring-1 ring-black/10 sm:px-8">
      <div className="border-b border-black/12 pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-black/45">
          2pq_forms
        </p>
        <h2 className="mt-1 font-heading text-lg font-semibold text-black">
          {title}
        </h2>
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {fields.map((field) => {
          const isWideField =
            field.key.toLowerCase().includes("notes") ||
            field.key === "otherBackground";

          return (
            <div
              key={field.key}
              className={isWideField ? "sm:col-span-2" : undefined}
            >
              <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-black/55">
                {t(field.label)}
              </dt>
              <dd className="mt-1 min-h-8 whitespace-pre-wrap break-words border-b border-black/12 pb-2 text-sm leading-6 text-black">
                {formatValue(
                  getDetailFieldValue(data, field),
                  language,
                  t,
                  field.type,
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function RequestedTestDetailSection({
  data,
}: {
  data?: Record<string, unknown>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const selectedKey = selectedRequestedTestKeyFromRecord(data);

  return (
    <section className="rounded-sm bg-white px-6 py-6 text-black shadow-[0_18px_48px_rgba(15,23,42,0.12)] ring-1 ring-black/10 sm:px-8">
      <div className="border-b border-black/12 pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-black/45">
          2pq_forms
        </p>
        <h2 className="mt-1 font-heading text-lg font-semibold text-black">
          {t("Requested test")}
        </h2>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        {REQUESTED_TEST_SEGMENTS.map((segment) => (
          <section
            key={segment.key}
            className="border-t border-black/12 pt-4 first:border-t-0 first:pt-0 lg:border-t-0 lg:border-l lg:pl-5 lg:first:border-l-0 lg:first:pl-0"
          >
            <h3 className="font-heading text-sm font-semibold text-black">
              {segment.title}
            </h3>
            <dl className="mt-4 grid gap-y-4">
              {[
                {
                  label: t("Requested"),
                  value: requestedTestSegmentRequestedValue(
                    data,
                    segment,
                    selectedKey,
                  ),
                },
                {
                  label: t("Reports mosaicism"),
                  value: requestedTestSegmentReportValue(
                    data,
                    segment,
                    selectedKey,
                    "Mosaicism",
                  ),
                },
                {
                  label: t("Reports sex"),
                  value: requestedTestSegmentReportValue(
                    data,
                    segment,
                    selectedKey,
                    "Sex",
                  ),
                },
              ].map((field) => (
                <div key={`${segment.key}-${field.label}`}>
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-black/55">
                    {field.label}
                  </dt>
                  <dd className="mt-1 min-h-8 whitespace-pre-wrap break-words border-b border-black/12 pb-2 text-sm leading-6 text-black">
                    {formatValue(field.value, language, t, "boolean")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}

function SamplingInformationTableSection({
  samplings,
}: {
  samplings?: Record<string, unknown>[];
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  if (!samplings?.length) {
    return null;
  }

  return (
    <section className="rounded-sm bg-white px-6 py-6 text-black shadow-[0_18px_48px_rgba(15,23,42,0.12)] ring-1 ring-black/10 sm:px-8">
      <div className="border-b border-black/12 pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-black/45">
          2pq_forms
        </p>
        <h2 className="mt-1 font-heading text-lg font-semibold text-black">
          {t("Biopsy rows")}
        </h2>
      </div>
      <div className="mt-5 overflow-x-auto border border-black/20">
        <table className="min-w-[84rem] border-collapse bg-white text-sm">
          <thead className="bg-black/[0.04] text-left text-[0.68rem] uppercase tracking-[0.08em] text-black/65">
            <tr>
              {SAMPLING_INFORMATION_FIELDS.map((field) => (
                <th
                  key={field.key}
                  className="border border-black/20 px-3 py-2 align-bottom font-semibold"
                >
                  {t(field.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {samplings.map((sampling, index) => {
              const rowKey =
                getTextValue(sampling, "id") ||
                getTextValue(sampling, "sampleId") ||
                String(index);

              return (
                <tr key={`${rowKey}-${index}`} className="odd:bg-black/[0.015]">
                  {SAMPLING_INFORMATION_FIELDS.map((field) => (
                    <td
                      key={`${rowKey}-${field.key}`}
                      className="min-w-36 whitespace-pre-wrap break-words border border-black/20 px-3 py-2 align-top text-black"
                    >
                      {formatValue(
                        sampling[field.key],
                        language,
                        t,
                        field.type,
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getTextValue(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getDetailFieldValue(
  data: Record<string, unknown> | undefined,
  field: FieldSpec,
) {
  if (field.key !== "address") {
    return data?.[field.key];
  }

  const address = getTextValue(data, "address");
  if (address) {
    return address;
  }

  return compactList([
    getTextValue(data, "addressLine1"),
    getTextValue(data, "addressLine2"),
  ]);
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
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-200">
                  {t("Box code")}
                </p>
                <p className="font-heading text-3xl font-semibold text-emerald-950 dark:text-emerald-50">
                  {displayCaseLabel(
                    getTextValue(form.caseInformation, "caseLabel"),
                  ) ||
                    displayCaseLabel(
                      getTextValue(form.caseInformation, "three_letter_code"),
                    ) ||
                    form.linkedCaseId}
                </p>
                <p className="font-mono text-xs text-emerald-900/70 dark:text-emerald-100/70">
                  {form.linkedCaseId}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/2pq-dashboard/cases/${encodeURIComponent(form.linkedCaseId)}`}
                >
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
                  <CircleDot className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-emerald-950 dark:text-emerald-50">
                    {getTextValue(sampling, "sampleId") ?? samplingId}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    {SAMPLING_INFORMATION_FIELDS.filter(
                      (field) => field.key !== "sampleId",
                    ).map((field) => (
                      <div key={field.key}>
                        <dt className="text-xs font-semibold uppercase text-emerald-900/62 dark:text-emerald-100/62">
                          {t(field.label)}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-emerald-950 dark:text-emerald-50">
                          {formatValue(
                            sampling[field.key],
                            language,
                            t,
                            field.type,
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/2pq-dashboard/sampling/${encodeURIComponent(samplingId)}`}
                  >
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

function WithdrawalCasesSection({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const cases = form.withdrawalCases ?? [];
  const linkedCaseIds = form.linkedCaseIds ?? [];

  if (cases.length === 0 && linkedCaseIds.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-emerald-300/60 bg-emerald-50/70 px-5 py-5 shadow-[0_16px_40px_rgba(16,185,129,0.12)] dark:border-emerald-300/24 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold text-emerald-950 dark:text-emerald-50">
          {t("2PQ cases awaiting pick up")}
        </h2>
      </div>
      <div className="mt-4 grid gap-3">
        {(cases.length > 0
          ? cases
          : linkedCaseIds.map((caseId) => ({ id: caseId }))
        ).map((caseRecord, index) => {
          const caseId = getTextValue(caseRecord, "id") ?? linkedCaseIds[index];
          const caseLabel =
            displayCaseLabel(getTextValue(caseRecord, "caseLabel")) ||
            getTextValue(caseRecord, "three_letter_code") ||
            caseId;
          const rawReportCode =
            getTextValue(caseRecord, "reportCode") ??
            getTextValue(caseRecord, "three_letter_code");
          const reportCode = rawReportCode
            ? rawReportCode.toUpperCase().endsWith("XXX")
              ? rawReportCode.toUpperCase()
              : `${rawReportCode.toUpperCase()}XXX`
            : caseLabel;
          const linkedStudyRequest = getTextValue(
            caseRecord,
            "linkedStudyRequest",
          );
          const linkedBiopsyForm = getTextValue(caseRecord, "linkedBiopsyForm");

          return (
            <div
              key={`${caseId}-${index}`}
              className="rounded-xl border border-emerald-200 bg-white/72 px-4 py-3 dark:border-emerald-300/20 dark:bg-emerald-950/24"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
                      {reportCode}
                    </p>
                    {caseLabel && caseLabel !== reportCode ? (
                      <Badge variant="outline">{caseLabel}</Badge>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    {[
                      {
                        label: t("Previous status"),
                        value: formatValue(
                          getTextValue(caseRecord, "previousCaseStatus"),
                          language,
                          t,
                          "caseStatus",
                        ),
                      },
                      {
                        label: t("New status"),
                        value: formatValue(
                          getTextValue(caseRecord, "caseStatus") ??
                            "awaiting_pick_up",
                          language,
                          t,
                          "caseStatus",
                        ),
                      },
                      {
                        label: t("Case ID"),
                        value: caseId ?? t("Not provided"),
                      },
                    ].map((field) => (
                      <div key={field.label}>
                        <dt className="text-xs font-semibold uppercase text-emerald-900/62 dark:text-emerald-100/62">
                          {field.label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-emerald-950 dark:text-emerald-50">
                          {field.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {[
                      {
                        label: t("Study request"),
                        value: linkedStudyRequest,
                        classes:
                          "border-sky-200 bg-sky-50/80 text-sky-950 dark:border-sky-300/20 dark:bg-sky-950/24 dark:text-sky-50",
                      },
                      {
                        label: t("Biopsy form"),
                        value: linkedBiopsyForm,
                        classes:
                          "border-cyan-200 bg-cyan-50/80 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-950/24 dark:text-cyan-50",
                      },
                    ].map((relationship) => (
                      <div
                        key={relationship.label}
                        className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-3 ${relationship.classes}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide opacity-65">
                            {relationship.label}
                          </p>
                          <p className="mt-1 truncate font-mono text-sm font-semibold">
                            {relationship.value ?? t("Not linked")}
                          </p>
                        </div>
                        {relationship.value ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/2pq-dashboard/forms/${encodeURIComponent(relationship.value)}`}
                            >
                              {t("Open")}
                              <ArrowRight className="size-3.5" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                {caseId ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/2pq-dashboard/cases/${encodeURIComponent(caseId)}`}
                    >
                      {t("Open")}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : null}
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
  const patientId =
    form.selectedPatientId ??
    getTextValue(form.patientInformation, "patientId");

  return (
    <section className="rounded-2xl border border-sky-200/80 bg-sky-50/72 px-5 py-5 shadow-[0_16px_38px_rgba(14,165,233,0.12)] dark:border-sky-300/24 dark:bg-sky-950/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/78 text-sky-700 shadow-sm dark:bg-sky-400/12 dark:text-sky-200">
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-sky-950 dark:text-sky-50">
              {form.patientName ??
                getTextValue(form.patientInformation, "fullName") ??
                t("Scoped patient")}
            </h2>
            {!patientId ? (
              <p className="mt-1 text-sm text-sky-950/72 dark:text-sky-50/74">
                {t(
                  "This legacy form does not have a scoped patient link stored.",
                )}
              </p>
            ) : null}
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

function LinkedBiopsyFormSection({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const router = useRouter();
  const t = (text: string) => appText(language, text);
  const [linkedBiopsyForm, setLinkedBiopsyForm] = useState(
    form.linkedBiopsyForm ?? null,
  );
  const [suggestedBiopsyForm, setSuggestedBiopsyForm] = useState(
    form.suggestedBiopsyForm ?? null,
  );
  const [biopsyLinkState, setBiopsyLinkState] = useState(
    form.biopsyLinkState ?? (form.linkedBiopsyForm ? "cohesive" : "none"),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<TwoPQFormRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  if (form.formType !== "study_request") {
    return null;
  }

  async function loadCandidates(searchValue = search) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        formType: "sample",
        limit: "20",
      });
      if (searchValue.trim()) {
        params.set("search", searchValue.trim());
      }
      const payload = await sdkFetch<{ forms: TwoPQFormRecord[] }>(
        `/2pq/forms?${params.toString()}`,
      );
      setCandidates(
        payload.forms.filter((candidate) =>
          [candidate.studyRequestForm, candidate.linkedStudyRequestFormId]
            .filter((formId): formId is string => Boolean(formId))
            .every((formId) => formId === form.id),
        ),
      );
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : t("Unable to load biopsy forms."),
      );
    } finally {
      setLoading(false);
    }
  }

  function openPicker() {
    setDialogOpen(true);
    void loadCandidates("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCandidates();
  }

  async function updateLink(nextBiopsyFormId: string | null) {
    const repairingMismatch =
      nextBiopsyFormId !== null &&
      (biopsyLinkState === "missing_study_property" ||
        biopsyLinkState === "missing_biopsy_backlink");
    setSavingId(nextBiopsyFormId ?? "remove");
    setError(null);
    try {
      const payload = await sdkFetch<{ form: TwoPQFormRecord }>(
        `/2pq/forms/${encodeURIComponent(form.id)}/linked-biopsy-form`,
        {
          method: "PATCH",
          body: JSON.stringify({ linkedBiopsyForm: nextBiopsyFormId }),
        },
      );
      setLinkedBiopsyForm(payload.form.linkedBiopsyForm ?? null);
      setSuggestedBiopsyForm(payload.form.suggestedBiopsyForm ?? null);
      setBiopsyLinkState(
        payload.form.biopsyLinkState ??
          (payload.form.linkedBiopsyForm ? "cohesive" : "none"),
      );
      setDialogOpen(false);
      setToast({
        id: Date.now(),
        tone: "success",
        message: repairingMismatch
          ? t("Bilateral biopsy link repaired.")
          : nextBiopsyFormId
            ? t("Biopsy form linked successfully.")
            : t("Biopsy form link removed."),
      });
      router.refresh();
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : t("Unable to update the biopsy form link.");
      setError(message);
      setToast({ id: Date.now(), tone: "error", message });
    } finally {
      setSavingId(null);
    }
  }

  const hasLinkMismatch =
    biopsyLinkState !== "none" && biopsyLinkState !== "cohesive";
  const repairableLinkMismatch =
    biopsyLinkState === "missing_study_property" ||
    biopsyLinkState === "missing_biopsy_backlink";
  const repairTarget = linkedBiopsyForm ?? suggestedBiopsyForm;

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <section className="overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-emerald-50/92 via-cyan-50/84 to-sky-50/92 shadow-[0_18px_46px_rgba(8,145,178,0.14)] dark:border-cyan-300/24 dark:from-emerald-950/28 dark:via-cyan-950/24 dark:to-sky-950/28">
        <div className="flex flex-col gap-4 border-b border-cyan-200/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-cyan-300/18">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/82 text-cyan-700 shadow-sm dark:bg-cyan-400/12 dark:text-cyan-200">
              <Link2 className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-semibold text-cyan-950 dark:text-cyan-50">
                {t("Linked biopsy form")}
              </h2>
              <p className="mt-1 text-sm text-cyan-950/68 dark:text-cyan-50/68">
                {t(
                  "A study request can be linked to one biopsy form at a time.",
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openPicker}
          >
            <Search className="size-3.5" />
            {linkedBiopsyForm
              ? t("Change biopsy form")
              : t("Choose biopsy form")}
          </Button>
        </div>

        <div className="px-5 py-5">
          {hasLinkMismatch ? (
            <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-300/28 dark:bg-amber-950/28 dark:text-amber-50">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/14 text-amber-700 dark:text-amber-200">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {t("Biopsy link mismatch")}
                  </p>
                  <p className="mt-1 text-sm text-amber-900/76 dark:text-amber-100/76">
                    {biopsyLinkState === "missing_study_property"
                      ? t(
                          "The biopsy points to this study request, but the study request does not store the biopsy link.",
                        )
                      : biopsyLinkState === "missing_biopsy_backlink"
                        ? t(
                            "The study request stores this biopsy, but the biopsy does not point back to the study request.",
                          )
                        : biopsyLinkState === "missing_biopsy"
                          ? t(
                              "The study request stores a biopsy form that no longer exists.",
                            )
                          : t(
                              "Multiple or conflicting biopsy links were found. Review them before choosing the correct form.",
                            )}
                  </p>
                </div>
              </div>
              {repairableLinkMismatch && repairTarget ? (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 bg-amber-700 text-white hover:bg-amber-800"
                  disabled={savingId !== null}
                  onClick={() => void updateLink(repairTarget)}
                >
                  {savingId === repairTarget ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                  {t("Repair bilateral link")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={openPicker}
                >
                  <Search className="size-3.5" />
                  {t("Review links")}
                </Button>
              )}
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-900/64 dark:text-cyan-100/64">
            {t("Actual linked biopsy form")}
          </p>
          {linkedBiopsyForm ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200/90 bg-white/78 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-emerald-300/20 dark:bg-emerald-950/24">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-200">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                    {t("Stored in the study request")}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-emerald-900/72 dark:text-emerald-100/72">
                    {linkedBiopsyForm}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/2pq-dashboard/forms/${encodeURIComponent(linkedBiopsyForm)}`}
                  >
                    {t("Open")}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={savingId !== null}
                  onClick={() => void updateLink(null)}
                >
                  {savingId === "remove" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {t("Remove link")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-cyan-300/80 bg-white/52 px-5 py-6 text-center dark:border-cyan-300/24 dark:bg-cyan-950/16">
              <p className="text-sm font-medium text-cyan-950 dark:text-cyan-50">
                {t("No biopsy form is stored in linkedBiopsyForm.")}
              </p>
            </div>
          )}

          {suggestedBiopsyForm && suggestedBiopsyForm !== linkedBiopsyForm ? (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800/72 dark:text-amber-100/72">
                {t("Suggested biopsy form")}
              </p>
              <div className="flex flex-col gap-4 rounded-2xl border border-amber-300/80 bg-amber-50/82 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-300/24 dark:bg-amber-950/22">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/14 text-amber-700 dark:text-amber-200">
                    <AlertTriangle className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
                      {t(
                        "This biopsy points back to this study request, but it is not the stored linked biopsy form.",
                      )}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-amber-900/72 dark:text-amber-100/72">
                      {suggestedBiopsyForm}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/2pq-dashboard/forms/${encodeURIComponent(suggestedBiopsyForm)}`}
                  >
                    {t("Open")}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!savingId) {
            setDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-cyan-100 bg-cyan-50/70 px-6 py-5 text-left dark:border-cyan-300/16 dark:bg-cyan-950/22">
            <DialogTitle className="font-heading text-2xl">
              {t("Choose a biopsy form")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Search by form ID, patient, test, doctor, or institution. Only unassigned biopsy forms can be linked.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
            <form className="flex gap-2" onSubmit={submitSearch}>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search biopsy forms...")}
                autoFocus
              />
              <Button type="submit" variant="outline" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {t("Search")}
              </Button>
            </form>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("Loading biopsy forms...")}
                </div>
              ) : candidates.length ? (
                candidates.map((candidate) => {
                  const selected = linkedBiopsyForm === candidate.id;
                  const suggested = suggestedBiopsyForm === candidate.id;
                  return (
                    <article
                      key={candidate.id}
                      className="grid gap-4 rounded-2xl border border-border/80 bg-background/82 p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={selected ? "brand" : "outline"}>
                            <span className="font-mono">{candidate.id}</span>
                          </Badge>
                          {selected ? (
                            <Badge variant="outline">
                              {t("Currently linked")}
                            </Badge>
                          ) : null}
                          {suggested ? (
                            <Badge variant="outline">{t("Suggested")}</Badge>
                          ) : null}
                        </div>
                        <h3 className="mt-3 font-heading text-lg font-semibold">
                          {candidate.patientName ||
                            getTextValue(
                              candidate.patientInformation,
                              "fullName",
                            ) ||
                            t("Patient not specified")}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {compactList([
                            candidate.requestedTestName,
                            candidate.institutionName,
                            candidate.createdAt
                              ? formatDate(candidate.createdAt, language, true)
                              : undefined,
                          ])}
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={selected || savingId !== null}
                        onClick={() => void updateLink(candidate.id)}
                      >
                        {savingId === candidate.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : selected ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Link2 className="size-4" />
                        )}
                        {selected ? t("Linked") : t("Link biopsy form")}
                      </Button>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                  {t("No available biopsy forms match this search.")}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={savingId !== null}
              onClick={() => setDialogOpen(false)}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinkedWithdrawalRequestSection({ form }: { form: TwoPQFormRecord }) {
  const { language } = useAppLanguage();
  const router = useRouter();
  const t = (text: string) => appText(language, text);
  const [linkedWithdrawalRequest, setLinkedWithdrawalRequest] = useState(
    form.linkedWithdrawalRequest ?? null,
  );
  const [suggestedWithdrawalRequest, setSuggestedWithdrawalRequest] = useState(
    form.suggestedWithdrawalRequest ?? null,
  );
  const [withdrawalLinkState, setWithdrawalLinkState] = useState(
    form.withdrawalLinkState ??
      (form.linkedWithdrawalRequest ? "cohesive" : "none"),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<TwoPQFormRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  if (form.formType !== "study_request") {
    return null;
  }

  async function loadCandidates(searchValue = search) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        formType: "withdrawal_request",
        limit: "20",
      });
      if (searchValue.trim()) {
        params.set("search", searchValue.trim());
      }
      const payload = await sdkFetch<{ forms: TwoPQFormRecord[] }>(
        `/2pq/forms?${params.toString()}`,
      );
      setCandidates(
        payload.forms.filter(
          (candidate) => candidate.institutionId === form.institutionId,
        ),
      );
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : t("Unable to load withdrawal request forms."),
      );
    } finally {
      setLoading(false);
    }
  }

  function openPicker() {
    setDialogOpen(true);
    void loadCandidates("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCandidates();
  }

  async function updateLink(nextWithdrawalRequestId: string | null) {
    const repairingMismatch =
      nextWithdrawalRequestId !== null &&
      withdrawalLinkState !== "none" &&
      withdrawalLinkState !== "cohesive" &&
      withdrawalLinkState !== "missing_withdrawal" &&
      withdrawalLinkState !== "conflict";
    setSavingId(nextWithdrawalRequestId ?? "remove");
    setError(null);
    try {
      const payload = await sdkFetch<{ form: TwoPQFormRecord }>(
        `/2pq/forms/${encodeURIComponent(form.id)}/linked-withdrawal-request`,
        {
          method: "PATCH",
          body: JSON.stringify({
            linkedWithdrawalRequest: nextWithdrawalRequestId,
          }),
        },
      );
      setLinkedWithdrawalRequest(payload.form.linkedWithdrawalRequest ?? null);
      setSuggestedWithdrawalRequest(
        payload.form.suggestedWithdrawalRequest ?? null,
      );
      setWithdrawalLinkState(
        payload.form.withdrawalLinkState ??
          (payload.form.linkedWithdrawalRequest ? "cohesive" : "none"),
      );
      setDialogOpen(false);
      setToast({
        id: Date.now(),
        tone: "success",
        message: repairingMismatch
          ? t("Withdrawal request links repaired.")
          : nextWithdrawalRequestId
            ? t("Withdrawal request linked successfully.")
            : t("Withdrawal request link removed."),
      });
      router.refresh();
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : t("Unable to update the withdrawal request link.");
      setError(message);
      setToast({ id: Date.now(), tone: "error", message });
    } finally {
      setSavingId(null);
    }
  }

  const hasLinkMismatch =
    withdrawalLinkState !== "none" && withdrawalLinkState !== "cohesive";
  const repairableLinkMismatch =
    withdrawalLinkState === "missing_study_property" ||
    withdrawalLinkState === "missing_withdrawal_backlink" ||
    withdrawalLinkState === "missing_biopsy_backlink";
  const repairTarget = linkedWithdrawalRequest ?? suggestedWithdrawalRequest;

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/92 via-fuchsia-50/78 to-rose-50/86 shadow-[0_18px_46px_rgba(124,58,237,0.12)] dark:border-violet-300/24 dark:from-violet-950/28 dark:via-fuchsia-950/22 dark:to-rose-950/24">
        <div className="flex flex-col gap-4 border-b border-violet-200/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-violet-300/18">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/82 text-violet-700 shadow-sm dark:bg-violet-400/12 dark:text-violet-200">
              <Truck className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-semibold text-violet-950 dark:text-violet-50">
                {t("Linked withdrawal request")}
              </h2>
              <p className="mt-1 text-sm text-violet-950/68 dark:text-violet-50/68">
                {t(
                  "The study request, its biopsy, and the matching withdrawal case remain synchronized.",
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openPicker}
          >
            <Search className="size-3.5" />
            {linkedWithdrawalRequest
              ? t("Change withdrawal request")
              : t("Choose withdrawal request")}
          </Button>
        </div>

        <div className="px-5 py-5">
          {hasLinkMismatch ? (
            <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-300/28 dark:bg-amber-950/28 dark:text-amber-50">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/14 text-amber-700 dark:text-amber-200">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {t("Withdrawal link mismatch")}
                  </p>
                  <p className="mt-1 text-sm text-amber-900/76 dark:text-amber-100/76">
                    {withdrawalLinkState === "missing_study_property"
                      ? t(
                          "The withdrawal request or biopsy points here, but the study request does not store the withdrawal link.",
                        )
                      : withdrawalLinkState === "missing_withdrawal_backlink"
                        ? t(
                            "The study request stores this withdrawal request, but its matching case does not point back here.",
                          )
                        : withdrawalLinkState === "missing_biopsy_backlink"
                          ? t(
                              "The study request and withdrawal case are linked, but the biopsy is missing its withdrawal link.",
                            )
                          : withdrawalLinkState === "missing_withdrawal"
                            ? t(
                                "The study request stores a withdrawal request that no longer exists.",
                              )
                            : t(
                                "Multiple or conflicting withdrawal links were found. Review them before choosing the correct request.",
                              )}
                  </p>
                </div>
              </div>
              {repairableLinkMismatch && repairTarget ? (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 bg-amber-700 text-white hover:bg-amber-800"
                  disabled={savingId !== null}
                  onClick={() => void updateLink(repairTarget)}
                >
                  {savingId === repairTarget ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                  {t("Repair withdrawal links")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={openPicker}
                >
                  <Search className="size-3.5" />
                  {t("Review links")}
                </Button>
              )}
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-900/64 dark:text-violet-100/64">
            {t("Actual linked withdrawal request")}
          </p>
          {linkedWithdrawalRequest ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200/90 bg-white/78 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-emerald-300/20 dark:bg-emerald-950/24">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-200">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                    {t("Stored in the study request")}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-emerald-900/72 dark:text-emerald-100/72">
                    {linkedWithdrawalRequest}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/2pq-dashboard/forms/${encodeURIComponent(linkedWithdrawalRequest)}`}
                  >
                    {t("Open")}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={savingId !== null}
                  onClick={() => void updateLink(null)}
                >
                  {savingId === "remove" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {t("Remove link")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-violet-300/80 bg-white/52 px-5 py-6 text-center dark:border-violet-300/24 dark:bg-violet-950/16">
              <p className="text-sm font-medium text-violet-950 dark:text-violet-50">
                {t(
                  "No withdrawal request is stored in linkedWithdrawalRequest.",
                )}
              </p>
            </div>
          )}

          {suggestedWithdrawalRequest &&
          suggestedWithdrawalRequest !== linkedWithdrawalRequest ? (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800/72 dark:text-amber-100/72">
                {t("Suggested withdrawal request")}
              </p>
              <div className="flex flex-col gap-4 rounded-2xl border border-amber-300/80 bg-amber-50/82 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-300/24 dark:bg-amber-950/22">
                <div className="flex min-w-0 items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-200" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
                      {t(
                        "This withdrawal request is referenced by the related records, but it is not the stored link on the study request.",
                      )}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-amber-900/72 dark:text-amber-100/72">
                      {suggestedWithdrawalRequest}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/2pq-dashboard/forms/${encodeURIComponent(suggestedWithdrawalRequest)}`}
                  >
                    {t("Open")}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!savingId) {
            setDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-violet-100 bg-violet-50/70 px-6 py-5 text-left dark:border-violet-300/16 dark:bg-violet-950/22">
            <DialogTitle className="font-heading text-2xl">
              {t("Choose a withdrawal request")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Choose a withdrawal request containing a case associated with this study request. Saving synchronizes the study, biopsy, and withdrawal case cell.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
            <form className="flex gap-2" onSubmit={submitSearch}>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search withdrawal requests...")}
                autoFocus
              />
              <Button type="submit" variant="outline" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {t("Search")}
              </Button>
            </form>
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("Loading withdrawal requests...")}
                </div>
              ) : candidates.length ? (
                candidates.map((candidate) => {
                  const selected = linkedWithdrawalRequest === candidate.id;
                  const suggested = suggestedWithdrawalRequest === candidate.id;
                  return (
                    <article
                      key={candidate.id}
                      className="grid gap-4 rounded-2xl border border-border/80 bg-background/82 p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={selected ? "brand" : "outline"}>
                            <span className="font-mono">{candidate.id}</span>
                          </Badge>
                          {selected ? (
                            <Badge variant="outline">
                              {t("Currently linked")}
                            </Badge>
                          ) : null}
                          {suggested ? (
                            <Badge variant="outline">{t("Suggested")}</Badge>
                          ) : null}
                        </div>
                        <h3 className="mt-3 font-heading text-lg font-semibold">
                          {candidate.institutionName ?? t("Withdrawal request")}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {compactList([
                            `${candidate.linkedCaseIds?.length ?? candidate.withdrawalCases?.length ?? 0} ${t("linked cases")}`,
                            candidate.createdAt
                              ? formatDate(candidate.createdAt, language, true)
                              : undefined,
                          ])}
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={selected || savingId !== null}
                        onClick={() => void updateLink(candidate.id)}
                      >
                        {savingId === candidate.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : selected ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Link2 className="size-4" />
                        )}
                        {selected ? t("Linked") : t("Link withdrawal request")}
                      </Button>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                  {t("No withdrawal requests match this search.")}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={savingId !== null}
              onClick={() => setDialogOpen(false)}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
            <h2 className="font-heading text-xl font-semibold text-violet-950 dark:text-violet-50">
              {getTextValue(
                form.sampleInformation,
                "requestingDoctorFullName",
              ) ?? t("Requesting doctor")}
            </h2>
            {!requestingDoctorId ? (
              <p className="mt-1 text-sm text-violet-950/72 dark:text-violet-50/74">
                {t("This sample form is missing the requesting doctor link.")}
              </p>
            ) : null}
            {requestingDoctorId ? (
              <p className="mt-2 font-mono text-xs text-violet-900/74 dark:text-violet-100/74">
                {requestingDoctorId}
              </p>
            ) : null}
          </div>
        </div>
        {requestingDoctorId ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/areas/doctors/${encodeURIComponent(requestingDoctorId)}`}
            >
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
  const sampleLinkedStudyRequestData: Record<string, unknown> = {
    studyRequestForm: form.studyRequestForm ?? form.linkedStudyRequestFormId,
    withdrawalRequest: form.withdrawalRequest,
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
  const formTitle = getTwoPQFormDisplayTitle(form, language);

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
          <Link href={TWO_PQ_FORM_ROUTES[form.formType]}>
            {t("New similar form")}
          </Link>
        </Button>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              {formTitle}
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
            <Badge variant="outline">
              <span className="font-mono">{form.id}</span>
            </Badge>
            <Badge variant="brand">
              {t(TWO_PQ_FORM_LABELS[form.formType])}
            </Badge>
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

      {form.formType === "withdrawal_request" ? (
        <>
          <WithdrawalCasesSection form={form} />
          <DetailSection
            title={t("Institution information")}
            fields={INSTITUTION_FIELDS}
            data={form.institutionInformation}
          />
          <DetailSection
            title={t("Withdrawal request")}
            fields={[
              { key: "createdAt", label: "Created at", type: "datetime" },
              { key: "updatedAt", label: "Last update", type: "datetime" },
              { key: "linkedCaseCount", label: "Linked case count" },
            ]}
            data={{
              createdAt: form.createdAt,
              updatedAt: form.updatedAt,
              linkedCaseCount: String(
                form.linkedCaseIds?.length ?? form.withdrawalCases?.length ?? 0,
              ),
            }}
          />
        </>
      ) : form.formType === "sample" ? (
        <>
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
          <RequestedTestDetailSection data={form.requestedTest} />
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
          <SamplingInformationTableSection
            samplings={form.samplingInformation}
          />
          <LinkedRecordsSection form={form} />
          <PatientLinkSection form={form} />
          <RequestingDoctorLinkSection form={form} />
        </>
      ) : (
        <>
          <LinkedBiopsyFormSection form={form} />
          <LinkedWithdrawalRequestSection form={form} />
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
          <RequestedTestDetailSection data={form.requestedTest} />
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
