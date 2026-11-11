import Link from "next/link";
import { ClipboardList, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DoctorListItem } from "@/lib/admin-areas";
import { appText, type AppLanguage } from "@/lib/language";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import {
  requestedTestKeyFromRecord,
  requestedTestKeyLabel,
} from "@/lib/two-pq-requested-test";

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function formatStudyRequestSelectionDate(
  value: string | undefined,
  language: AppLanguage,
) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function StudyRequestSelectionTable({
  forms,
  doctors,
  selectedFormId,
  onSelect,
  language,
  error,
  emptyMessage,
}: {
  forms: TwoPQFormRecord[];
  doctors?: DoctorListItem[];
  selectedFormId: string;
  onSelect: (formId: string) => void;
  language: AppLanguage;
  error?: string;
  emptyMessage?: string;
}) {
  const t = (text: string) => appText(language, text);

  if (forms.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-dashed border-sky-300/90 bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-6 py-10 text-center shadow-[0_18px_55px_rgba(56,189,248,0.12)] dark:border-sky-300/25 dark:from-sky-950/34 dark:via-background dark:to-indigo-950/28 sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-sky-200/28 blur-3xl dark:bg-sky-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 size-48 rounded-full bg-indigo-200/25 blur-3xl dark:bg-indigo-500/10" />
        <div className="relative mx-auto flex max-w-xl flex-col items-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-sky-200 bg-white text-sky-700 shadow-[0_14px_34px_rgba(14,165,233,0.18)] dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200">
            <Inbox className="size-8" />
          </span>
          <Badge
            variant="outline"
            className="mt-5 border-sky-200 bg-white/80 text-sky-800 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100"
          >
            {t("0 available study requests")}
          </Badge>
          <h3 className="mt-4 font-heading text-xl font-semibold text-foreground sm:text-2xl">
            {t("No unlinked study requests")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
            {emptyMessage ??
              t(
                "There are no study request forms available for a new biopsy. Create one or unlink an existing study request before continuing.",
              )}
          </p>
          <Button variant="outline" className="mt-6 bg-background/86" asChild>
            <Link href="/2pq-dashboard/forms?formType=study_request">
              <ClipboardList className="size-4" />
              {t("Review study requests")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200/85 bg-background/74 shadow-[0_16px_42px_rgba(14,165,233,0.09)] dark:border-sky-300/20">
      <div className="flex flex-col gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-50/90 via-background to-indigo-50/70 px-5 py-4 dark:border-sky-300/16 dark:from-sky-950/28 dark:to-indigo-950/18 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-400/12 dark:text-sky-200">
            <ClipboardList className="size-5" />
          </span>
          <div>
            <h3 className="font-heading font-semibold text-foreground">
              {t("Available study requests")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Select one row to reuse its patient, institution, doctor, and requested test information.",
              )}
            </p>
          </div>
        </div>
        <Badge variant={selectedFormId ? "success" : "outline"}>
          {selectedFormId
            ? t("1 study request selected")
            : `${forms.length} ${t("available study requests")}`}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[880px] border-collapse text-left"
          aria-label={t("Available study requests")}
        >
          <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="w-14 px-4 py-3 text-center">
                <span className="sr-only">{t("Select")}</span>
              </th>
              <th className="px-4 py-3">{t("Patient")}</th>
              <th className="px-4 py-3">{t("Requested study")}</th>
              <th className="px-4 py-3">{t("Institution and doctor")}</th>
              <th className="px-4 py-3">{t("Created")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/65">
            {forms.map((form) => {
              const selected = form.id === selectedFormId;
              const doctorId =
                form.doctorId || stringField(form.patientInformation, "doctorId");
              const doctorName =
                doctors?.find((candidate) => candidate.id === doctorId)?.fullName ||
                stringField(form.patientInformation, "doctorName");
              const patientName =
                form.patientName ||
                stringField(form.patientInformation, "fullName") ||
                t("Not provided");
              const patientEmail =
                form.patientEmail ||
                stringField(form.patientInformation, "email");
              const patientDni = stringField(
                form.patientInformation,
                "medicalRecordNumber",
              );
              const requestedStudy =
                form.requestedTestName ||
                requestedTestKeyLabel(
                  requestedTestKeyFromRecord(form.requestedTest),
                ) ||
                t("Not provided");
              const createdAt = formatStudyRequestSelectionDate(
                form.createdAt,
                language,
              );

              return (
                <tr
                  key={form.id}
                  aria-selected={selected}
                  tabIndex={0}
                  className={[
                    "group cursor-pointer outline-none transition-colors focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:focus-visible:bg-sky-400/8",
                    selected
                      ? "bg-sky-50/90 dark:bg-sky-400/10"
                      : "hover:bg-muted/34",
                  ].join(" ")}
                  onClick={() => onSelect(form.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(form.id);
                    }
                  }}
                >
                  <td
                    className="px-4 py-4 text-center align-top"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) =>
                        onSelect(checked === true ? form.id : "")
                      }
                      aria-label={`${t("Select study request")} ${form.id}`}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="font-semibold text-foreground">
                      {patientName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {patientEmail || t("Email not provided")}
                    </p>
                    {patientDni ? (
                      <Badge variant="outline" className="mt-2 font-mono">
                        DNI {patientDni}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="font-semibold text-foreground">
                      {requestedStudy}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {form.id}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-foreground">
                      {form.institutionName ||
                        form.institutionId ||
                        t("Not provided")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doctorName || doctorId || t("Doctor not provided")}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-foreground">
                      {createdAt || t("Not provided")}
                    </p>
                    <Badge
                      variant={selected ? "success" : "outline"}
                      className="mt-2"
                    >
                      {selected ? t("Selected") : t("Available")}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border/65 px-5 py-3">
        {error ? (
          <p className="text-xs font-medium text-red-600 dark:text-red-300">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
