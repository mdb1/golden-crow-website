import Link from "next/link";
import { ArrowLeft, CalendarDays, FileText, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TWO_PQ_FORM_LABELS,
  TWO_PQ_FORM_ROUTES,
  type TwoPQFormRecord,
} from "@/lib/two-pq-forms";
import { compactList } from "@/lib/moderation-utils";

type FieldSpec = {
  key: string;
  label: string;
  type?: "boolean" | "date" | "datetime";
};

const PATIENT_FIELDS: FieldSpec[] = [
  { key: "fullName", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "institutionId", label: "Institution ID" },
  { key: "doctorId", label: "Doctor ID" },
  { key: "medicalRecordNumber", label: "Medical record number" },
  { key: "birthDate", label: "Birth date", type: "date" },
  { key: "sex", label: "Sex / gender" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

const INSTITUTION_FIELDS: FieldSpec[] = [
  { key: "code", label: "Institution code" },
  { key: "name", label: "Institution name" },
  { key: "legalName", label: "Legal name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "addressLine1", label: "Address line 1" },
  { key: "addressLine2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State / region" },
  { key: "country", label: "Country" },
  { key: "notes", label: "Notes" },
];

const STUDY_MEDICAL_FIELDS: FieldSpec[] = [
  { key: "previousConceptionsCount", label: "numero concepciones previas" },
  { key: "previousMiscarriagesCount", label: "numero abortos previos" },
  { key: "previousBirthsCount", label: "numero nacimientos previos" },
  { key: "previousCyclesCount", label: "numero ciclos previos" },
  { key: "maleFactor", label: "Factor masculino", type: "boolean" },
  { key: "otherBackground", label: "otros antecedentes" },
];

const STUDY_PREVIOUS_TEST_FIELDS: FieldSpec[] = [
  { key: "pgtASr", label: "PGT-A / PGT-SR", type: "boolean" },
  { key: "karyotype", label: "CARIOTIPO", type: "boolean" },
  { key: "pgtResult", label: "RESULTADO PGT" },
  { key: "karyotypeResult", label: "RESULTADO CARIOTIPO" },
];

const STUDY_REQUESTED_TEST_FIELDS: FieldSpec[] = [
  { key: "pgtA", label: "PGT-A", type: "boolean" },
  { key: "pgtSr", label: "PGT-SR", type: "boolean" },
  { key: "reportsMosaicism", label: "INFORMA MOSAICISMOS", type: "boolean" },
  { key: "reportsSex", label: "INFORMA SEXO", type: "boolean" },
  { key: "requestReason", label: "MOTIVO DE SOLICITUD" },
  { key: "requestDate", label: "FECHA", type: "date" },
];

const SAMPLE_REQUESTED_TEST_FIELDS: FieldSpec[] = [
  { key: "pgtA", label: "PGT-A", type: "boolean" },
  { key: "pgtSr", label: "PGT-SR", type: "boolean" },
];

const SAMPLE_INFORMATION_FIELDS: FieldSpec[] = [
  { key: "fivCenter", label: "CENTRO FIV" },
  { key: "centerCode", label: "CODIGO CENTRO" },
  { key: "requestingDoctorFirstName", label: "MEDICO SOLICITANTE nombre" },
  { key: "requestingDoctorLastName", label: "MEDICO SOLICITANTE apellido" },
  { key: "sampleType", label: "TIPO DE MUESTRA" },
  { key: "processedByFirstName", label: "PROCESADO POR nombre" },
  { key: "processedByLastName", label: "PROCESADO POR apellido" },
  { key: "processDate", label: "FECHA PROCESO", type: "date" },
  { key: "boxCode", label: "CODIGO CAJA" },
];

function formatDate(value: string, includeTime = false) {
  const dateSource =
    !includeTime && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? `${value.slice(0, 10)}T12:00:00`
      : value;
  const date = new Date(dateSource);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function formatValue(value: unknown, type?: FieldSpec["type"]) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "Not provided";
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
      return formatDate(value, type === "datetime");
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
              {field.label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {formatValue(data?.[field.key], field.type)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TwoPQFormDetail({ form }: { form: TwoPQFormRecord }) {
  const requestedTestFields =
    form.formType === "study_request"
      ? STUDY_REQUESTED_TEST_FIELDS
      : SAMPLE_REQUESTED_TEST_FIELDS;
  const authorEmail = form.authorEmail ?? form.createdByEmail;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">
            <ArrowLeft className="size-3.5" />
            Back to forms
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={TWO_PQ_FORM_ROUTES[form.formType]}>New similar form</Link>
        </Button>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-eyebrow">{form.id}</p>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              {form.patientName ?? "Unnamed patient"}
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
            <Badge variant="brand">{TWO_PQ_FORM_LABELS[form.formType]}</Badge>
            <Badge variant="outline">
              <CalendarDays className="mr-1 size-3.5" />
              {formatDate(form.createdAt, true)}
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

      <DetailSection
        title="Patient information"
        fields={PATIENT_FIELDS}
        data={form.patientInformation}
      />

      {form.formType === "study_request" ? (
        <>
          <DetailSection
            title="Medical information"
            fields={STUDY_MEDICAL_FIELDS}
            data={form.medicalInformation}
          />
          <DetailSection
            title="Previous genetic tests"
            fields={STUDY_PREVIOUS_TEST_FIELDS}
            data={form.previousGeneticTests}
          />
        </>
      ) : null}

      <DetailSection
        title="Test solicitado"
        fields={requestedTestFields}
        data={form.requestedTest}
      />

      {form.formType === "study_request" ? (
        <DetailSection
          title="Institution information"
          fields={INSTITUTION_FIELDS}
          data={form.institutionInformation}
        />
      ) : (
        <DetailSection
          title="Sample information"
          fields={SAMPLE_INFORMATION_FIELDS}
          data={form.sampleInformation}
        />
      )}
    </div>
  );
}
