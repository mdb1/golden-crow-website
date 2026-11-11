"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PARTNERS_API_ROUTE,
  PARTNERS_QUERY_KEY,
} from "@/lib/connected-partners";
import {
  PARTNER_CSV_COLUMNS,
  PARTNER_CSV_RULES,
  PARTNER_CSV_TEMPLATE,
  downloadPartnerCsvText,
  partnerCsvRulesText,
  readPartnerCsvFile,
  type PartnerCsvImportResult,
  type PartnerCsvPreview,
} from "@/lib/partner-csv-import";
import { appText } from "@/lib/language";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

function useText() {
  const { language } = useAppLanguage();
  return (text: string) => appText(language, text);
}

function TemplateButton() {
  const t = useText();
  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-xl"
      onClick={() =>
        downloadPartnerCsvText(
          `\uFEFF${PARTNER_CSV_TEMPLATE}`,
          "partners-template.csv",
          "text/csv;charset=utf-8",
        )
      }
    >
      <Download className="size-4" />
      {t("Download template")}
    </Button>
  );
}

export function PartnerCsvImportRulesDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const t = useText();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-sky-50 to-violet-50 p-5 pr-12 dark:from-sky-950/30 dark:to-violet-950/30 sm:p-6">
          <DialogTitle className="flex items-center gap-3 font-heading text-xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-600 text-white">
              <BookOpen className="size-5" />
            </span>
            {t("Import rules")}
          </DialogTitle>
          <DialogDescription>
            {t("Prepare your partner CSV using these exact columns and rules.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
          <section
            className="grid gap-3 sm:grid-cols-3"
            aria-label={t("How to import")}
          >
            {[
              {
                number: "1",
                title: "Prepare the file",
                text: "Download the template and add one partner per row.",
              },
              {
                number: "2",
                title: "Review the preview",
                text: "Upload the CSV, review skipped rows, and correct every error.",
              },
              {
                number: "3",
                title: "Confirm the import",
                text: "Choose Import partners. Your existing partners stay unchanged.",
              },
            ].map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-400/20 dark:bg-violet-500/5"
              >
                <span className="mb-3 inline-flex size-7 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">
                  {step.number}
                </span>
                <h3 className="font-semibold">{t(step.title)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(step.text)}
                </p>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="font-heading text-lg font-semibold">
              {t("Columns")}
            </h3>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-3">{t("Column")}</th>
                    <th className="p-3">{t("Required")}</th>
                    <th className="p-3">{t("Accepted value")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PARTNER_CSV_COLUMNS.map((column) => (
                    <tr key={column.key}>
                      <td className="p-3 align-top font-mono text-xs">
                        {column.key}
                      </td>
                      <td className="p-3 align-top">
                        {t(column.required ? "Yes" : "Optional")}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {t(column.rule)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="font-heading text-lg font-semibold">
              {t("File and import rules")}
            </h3>
            <ol className="space-y-3 pl-5 text-sm text-muted-foreground marker:font-semibold marker:text-foreground list-decimal">
              {PARTNER_CSV_RULES.map((rule) => (
                <li key={rule} className="pl-1">
                  {t(rule)}
                </li>
              ))}
            </ol>
          </section>
          <section className="space-y-3">
            <h3 className="font-heading text-lg font-semibold">
              {t("Example CSV")}
            </h3>
            <pre className="overflow-x-auto rounded-2xl border bg-muted/40 p-4 text-xs leading-relaxed">
              <code>{PARTNER_CSV_TEMPLATE}</code>
            </pre>
          </section>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background p-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl"
            onClick={() =>
              downloadPartnerCsvText(
                partnerCsvRulesText(t),
                "partners-import-rules.txt",
                "text/plain;charset=utf-8",
              )
            }
          >
            <Download className="size-4" />
            {t("Download rules")}
          </Button>
          <TemplateButton />
          <Button type="button" className="rounded-xl" onClick={onClose}>
            {t("Done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ImportFile = { name: string; csv: string; importId: string };

export function PartnerCsvImportDialog({ onClose }: { onClose: () => void }) {
  const t = useText();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<ImportFile | null>(null);
  const [preview, setPreview] = useState<PartnerCsvPreview | null>(null);
  const [result, setResult] = useState<PartnerCsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [needsValidation, setNeedsValidation] = useState(false);
  const [rules, setRules] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const generation = useRef(0);
  const importLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  function message(value: unknown, fallback: string) {
    return t(value instanceof Error ? value.message : fallback);
  }
  function close() {
    if (importLock.current) return;
    if (uncertain) setConfirmClose(true);
    else onClose();
  }
  async function validate(selected: ImportFile, token: number) {
    setValidating(true);
    setError(null);
    try {
      const response = await sdkFetch<PartnerCsvPreview>(
        `${PARTNERS_API_ROUTE}/import/preview`,
        { method: "POST", body: JSON.stringify({ csv: selected.csv }) },
      );
      if (token !== generation.current) return;
      setPreview(response);
      setNeedsValidation(false);
    } catch (failure) {
      if (token !== generation.current) return;
      setPreview(null);
      setError(message(failure, "Could not validate this CSV file."));
    } finally {
      if (token === generation.current) setValidating(false);
    }
  }
  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (importLock.current || uncertain) return;
    const selected = event.target.files?.[0];
    if (!selected) return;
    const token = ++generation.current;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setNeedsValidation(false);
    setUncertain(false);
    setValidating(true);
    try {
      const csv = await readPartnerCsvFile(selected);
      if (token !== generation.current) return;
      const next = { name: selected.name, csv, importId: crypto.randomUUID() };
      setFile(next);
      await validate(next, token);
    } catch (failure) {
      if (token !== generation.current) return;
      setError(message(failure, "Could not read this CSV file."));
      setValidating(false);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function importPartners() {
    if (
      !file ||
      !preview ||
      preview.summary.invalid ||
      !preview.summary.ready ||
      needsValidation ||
      importLock.current
    )
      return;
    importLock.current = true;
    setImporting(true);
    setError(null);
    const token = generation.current;
    try {
      const response = await sdkFetch<PartnerCsvImportResult>(
        `${PARTNERS_API_ROUTE}/import`,
        {
          method: "POST",
          body: JSON.stringify({ csv: file.csv, importId: file.importId }),
        },
      );
      if (token !== generation.current) return;
      setResult(response);
      setUncertain(false);
      // A failed list refresh does not undo a confirmed import.
      await queryClient
        .invalidateQueries({ queryKey: PARTNERS_QUERY_KEY })
        .catch(() => undefined);
    } catch (failure) {
      if (token !== generation.current) return;
      setError(message(failure, "Could not import partners."));
      const definitive =
        failure instanceof SdkRequestError &&
        failure.status >= 400 &&
        failure.status < 500;
      setUncertain(!definitive);
      setNeedsValidation(
        definitive &&
          failure instanceof SdkRequestError &&
          failure.status === 400,
      );
    } finally {
      importLock.current = false;
      if (token === generation.current) setImporting(false);
    }
  }
  function reset() {
    generation.current += 1;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setNeedsValidation(false);
    setUncertain(false);
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-3xl"
          showCloseButton={!importing}
        >
          <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-violet-50 via-fuchsia-50/50 to-sky-50 p-5 pr-12 dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-sky-950/30 sm:p-6">
            <DialogTitle className="flex items-center gap-3 font-heading text-xl">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
                <FileSpreadsheet className="size-5" />
              </span>
              {t("Import partners from CSV")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Choose a CSV file, review every row, and confirm before adding partners.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
            {result ? (
              <section className="space-y-4" aria-label={t("Import result")}>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-400/25 dark:bg-emerald-500/10">
                  <CheckCircle2 className="mb-3 size-8 text-emerald-600" />
                  <h3 className="font-heading text-xl font-semibold">
                    {t("Import complete")}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("Your partner list has been updated.")}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {t("Partners added")}
                      </dt>
                      <dd className="mt-1 text-3xl font-semibold">
                        {result.importedCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {t("Duplicates skipped")}
                      </dt>
                      <dd className="mt-1 text-3xl font-semibold">
                        {result.skippedCount}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>
            ) : (
              <>
                <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4 dark:border-violet-400/30 dark:bg-violet-500/5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <Label
                      htmlFor="partner-csv-file"
                      className="flex items-center gap-2"
                    >
                      <FileUp className="size-4 text-violet-600" />
                      {t("CSV file")}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {t("UTF-8 · 200 rows · 256 KiB maximum")}
                    </span>
                  </div>
                  <input
                    ref={fileInput}
                    id="partner-csv-file"
                    type="file"
                    tabIndex={-1}
                    accept=".csv,text/csv"
                    aria-describedby="partner-csv-file-help"
                    disabled={importing || uncertain}
                    onChange={selectFile}
                    className="sr-only"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl bg-background"
                    disabled={importing || uncertain}
                    onClick={() => fileInput.current?.click()}
                  >
                    <FileUp className="size-4" />
                    {t(file ? "Choose another CSV" : "Choose CSV")}
                  </Button>
                  <p
                    id="partner-csv-file-help"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    {file?.name ??
                      t(
                        "Start with the template or choose your prepared CSV file.",
                      )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TemplateButton />
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setRules(true)}
                    disabled={importing}
                  >
                    <BookOpen className="size-4" />
                    {t("Import rules")}
                  </Button>
                </div>
                {validating && (
                  <p
                    role="status"
                    className="flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-200"
                  >
                    <Loader2 className="size-4 animate-spin" />
                    {t("Validating CSV...")}
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                {uncertain && (
                  <p
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    {t(
                      "The import result is not confirmed. Retry this same import to safely retrieve its result. Keep this file selected until the result is confirmed.",
                    )}
                  </p>
                )}
                {needsValidation && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={validating || importing}
                    onClick={() => {
                      if (file) void validate(file, generation.current);
                    }}
                  >
                    <RefreshCw className="size-4" />
                    {t("Validate again")}
                  </Button>
                )}
                {preview && !validating && (
                  <section className="space-y-4" aria-label={t("CSV preview")}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        {
                          label: "Total rows",
                          value: preview.summary.total,
                          color: "border-border bg-muted/40",
                        },
                        {
                          label: "Ready to import",
                          value: preview.summary.ready,
                          color:
                            "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-500/10",
                        },
                        {
                          label: "Duplicates skipped",
                          value: preview.summary.duplicates,
                          color:
                            "border-sky-200 bg-sky-50/70 dark:border-sky-400/20 dark:bg-sky-500/10",
                        },
                        {
                          label: "Rows to fix",
                          value: preview.summary.invalid,
                          color:
                            "border-amber-200 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-500/10",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={cn("rounded-2xl border p-3", item.color)}
                        >
                          <p className="text-xs text-muted-foreground">
                            {t(item.label)}
                          </p>
                          <p className="mt-1 text-2xl font-semibold">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {preview.summary.invalid > 0 && (
                      <p
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
                      >
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        {t(
                          "Correct every invalid row and upload the file again. No partners have been added.",
                        )}
                      </p>
                    )}
                    {preview.summary.ready === 0 &&
                      preview.summary.invalid === 0 && (
                        <p className="rounded-xl border p-3 text-sm text-muted-foreground">
                          {t(
                            "No new partners to import. Existing partners will stay unchanged.",
                          )}
                        </p>
                      )}
                    <div className="space-y-2">
                      {preview.rows.map((row) => (
                        <article
                          key={row.rowNumber}
                          className={cn(
                            "rounded-2xl border p-4",
                            row.status === "invalid"
                              ? "border-amber-200 dark:border-amber-400/25"
                              : "border-border",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">
                                {t("Row")} {row.rowNumber}
                              </p>
                              <h4 className="mt-1 break-words font-semibold">
                                {row.input?.companyName || t("Invalid row")}
                              </h4>
                              {row.input && (
                                <p className="mt-1 break-words text-sm text-muted-foreground">
                                  {row.input.firstName} {row.input.lastName} ·{" "}
                                  {row.input.email}
                                </p>
                              )}
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-1 text-xs font-medium",
                                row.status === "ready"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                                  : row.status === "duplicate"
                                    ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
                              )}
                            >
                              {t(
                                row.status === "ready"
                                  ? "Ready"
                                  : row.status === "duplicate"
                                    ? "Skipped duplicate"
                                    : "Needs correction",
                              )}
                            </span>
                          </div>
                          {row.duplicateReason && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {t(row.duplicateReason)}
                            </p>
                          )}
                          {row.errors.length > 0 && (
                            <ul className="mt-2 space-y-1 text-sm text-destructive">
                              {row.errors.map((rowError, index) => (
                                <li key={`${index}-${rowError}`}>{rowError}</li>
                              ))}
                            </ul>
                          )}
                          {row.input && (
                            <details className="mt-3 rounded-xl bg-muted/30 p-3 text-sm">
                              <summary className="cursor-pointer font-medium">
                                {t("View contact details")}
                              </summary>
                              <dl className="mt-3 space-y-2 text-muted-foreground">
                                <div>
                                  <dt className="font-medium">
                                    {t("Phone number")}
                                  </dt>
                                  <dd className="break-words">
                                    {row.input.phoneNumber || t("Not provided")}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-medium">
                                    {t("Meeting date")}
                                  </dt>
                                  <dd>
                                    {row.input.meetingDate ||
                                      t("Not scheduled")}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-medium">{t("Notes")}</dt>
                                  <dd className="whitespace-pre-wrap break-words">
                                    {row.input.notes || "—"}
                                  </dd>
                                </div>
                              </dl>
                            </details>
                          )}
                          {row.input &&
                            (row.input.linkedOrganizationId ||
                              row.input.linkedIndividualPublisherId ||
                              row.input.linkedAppId) && (
                              <dl className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                                {row.input.linkedOrganizationId && (
                                  <div className="break-all">
                                    <dt className="inline font-medium">
                                      {t("Organization")}:{" "}
                                    </dt>
                                    <dd className="inline">
                                      {row.input.linkedOrganizationId}
                                    </dd>
                                  </div>
                                )}
                                {row.input.linkedIndividualPublisherId && (
                                  <div className="break-all">
                                    <dt className="inline font-medium">
                                      {t("Individual publisher")}:{" "}
                                    </dt>
                                    <dd className="inline">
                                      {row.input.linkedIndividualPublisherId}
                                    </dd>
                                  </div>
                                )}
                                {row.input.linkedAppId && (
                                  <div className="break-all">
                                    <dt className="inline font-medium">
                                      {t("App")}:{" "}
                                    </dt>
                                    <dd className="inline">
                                      {row.input.linkedAppId}
                                    </dd>
                                  </div>
                                )}
                              </dl>
                            )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background p-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              disabled={importing}
              onClick={close}
            >
              {t(result ? "Finish" : "Close")}
            </Button>
            {result ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={reset}
              >
                <FileUp className="size-4" />
                {t("Import another file")}
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                disabled={
                  validating ||
                  importing ||
                  !preview ||
                  preview.summary.invalid > 0 ||
                  preview.summary.ready === 0 ||
                  needsValidation
                }
                onClick={() => void importPartners()}
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : uncertain ? (
                  <RefreshCw className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
                {t(
                  importing
                    ? "Importing partners..."
                    : uncertain
                      ? "Retry import"
                      : "Import partners",
                )}
                {!importing && <ArrowRight className="size-4" />}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {rules && <PartnerCsvImportRulesDialog onClose={() => setRules(false)} />}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Close without a confirmed result?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Some partners may already have been imported. Retrying this same import is the safest way to confirm the result. Closing discards this local retry reference.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              {t("Keep checking")}
            </Button>
            <Button variant="destructive" onClick={onClose}>
              {t("Close import")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
