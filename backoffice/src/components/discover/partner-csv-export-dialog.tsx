"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PARTNERS_ROUTE } from "@/lib/connected-partners";
import {
  collectDiscoverPartnerCsvExport,
  type DiscoverPartnerExportPage,
  type DiscoverPartnerCsvExport,
  type PartnerExportPublisherKind,
} from "@/lib/discover-partner-csv-export";
import { appText } from "@/lib/language";
import { downloadPartnerCsvText } from "@/lib/partner-csv-import";
import { sdkFetch } from "@/lib/sdk-client";

function PartnerCsvExportDialog({
  kind,
  onClose,
}: {
  kind: PartnerExportPublisherKind;
  onClose: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [result, setResult] = useState<DiscoverPartnerCsvExport | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    setProgress(0);
    void collectDiscoverPartnerCsvExport({
      kind,
      signal: controller.signal,
      onProgress: setProgress,
      fetchPage: async (cursor, signal) => {
        const params = new URLSearchParams({ kind, limit: "20" });
        if (cursor) params.set("cursor", cursor);
        return sdkFetch<DiscoverPartnerExportPage>(
          `/discover/partner-csv-export?${params}`,
          { signal },
        );
      },
    })
      .then((exported) => {
        if (!controller.signal.aborted) setResult(exported);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          const message = reason instanceof Error ? reason.message : "";
          setError(
            [
              "A publisher exceeds the CSV file size limit. Shorten its internal notes and try again.",
              "The export could not read the next page. Try again.",
            ].includes(message)
              ? message
              : "Could not prepare the partners CSV. Try again.",
          );
        }
      });
    return () => controller.abort();
  }, [kind, attempt]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-emerald-50 to-violet-50 p-5 pr-12 dark:from-emerald-950/30 dark:to-violet-950/30 sm:p-6">
          <DialogTitle className="flex items-center gap-3 font-heading text-xl">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <FileSpreadsheet className="size-5" />
            </span>
            {t("Export as partners CSV")}
          </DialogTitle>
          <DialogDescription>
            {t(
              kind === "organization"
                ? "Export all existing organizations, across all pages and statuses. List filters do not apply."
                : "Export all existing individual publishers, across all pages and statuses. List filters do not apply.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
          {!result && !error ? (
            <div
              role="status"
              className="flex items-center gap-3 rounded-2xl bg-muted/50 p-5"
            >
              <Loader2 className="size-5 animate-spin text-emerald-600" />
              <div>
                <p className="font-semibold">
                  {t("Preparing partners CSV...")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("Publishers read")}: {progress}
                </p>
              </div>
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <p>{t(error)}</p>
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("Try again")}
              </Button>
            </div>
          ) : null}
          {result?.total === 0 ? (
            <p role="status">{t("There are no publishers to export.")}</p>
          ) : null}
          {result && result.total > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  [t("Publishers"), result.total],
                  [t("CSV files"), result.files.length],
                  [t("Rows to complete or correct"), result.reviewCount],
                ].map(([label, count]) => (
                  <div
                    key={label}
                    className="rounded-2xl border bg-muted/30 px-2 py-4"
                  >
                    <p className="font-heading text-2xl font-semibold">
                      {count}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {result.files.map((file, index) => (
                  <div
                    key={file.name}
                    className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("Rows")}: {file.rowCount} ·{" "}
                        {t("Rows to complete or correct")}: {file.reviewCount}
                      </p>
                    </div>
                    <Button
                      className="shrink-0 rounded-xl"
                      aria-label={`${t("Download CSV")} ${index + 1}`}
                      onClick={() =>
                        downloadPartnerCsvText(
                          file.csv,
                          file.name,
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      <Download className="size-4" />
                      {t("Download CSV")}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    "Publisher names, contact emails, internal notes, publisher links, and existing app IDs are included. App ID is blank only when the publisher has no linked app. Phone and meeting date remain blank.",
                  )}
                </p>
                <p>
                  {t(
                    kind === "organization"
                      ? "Contact first and last names are optional. Organizations export them blank and can be imported without completing them."
                      : "Individual display names are split at the first space into firstName and lastName. Review compound names before importing. Existing parent organization links are included.",
                  )}
                </p>
                <p>
                  {t(
                    "Each file stays within 200 rows and 256 KiB. Download every part and import them separately in Partners.",
                  )}
                </p>
              </div>
              {result.reviewCount > 0 ? (
                <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
                  <p className="flex items-start gap-2 font-semibold">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    {t(
                      "Complete or correct these fields before importing. All publishers remain in the CSV.",
                    )}
                  </p>
                  <ul className="space-y-2 text-sm">
                    {result.reviewSample.map((item) => (
                      <li key={item.publisherId} className="break-words">
                        <span className="font-medium">
                          {item.name || item.publisherId}
                        </span>
                        <span className="text-muted-foreground">
                          : {item.fields.join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {result.reviewCount > result.reviewSample.length ? (
                    <p className="text-xs text-muted-foreground">
                      {t("Showing the first 10 rows that need review.")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {result.duplicateEmails > 0 ? (
                <p className="rounded-2xl border p-4 text-sm">
                  {t("Repeated contact emails")}: {result.duplicateEmails}.{" "}
                  {t(
                    "The importer keeps only the first occurrence of an email and skips existing partners. Review shared emails before importing.",
                  )}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>
            {t(result || error ? "Close" : "Cancel")}
          </Button>
          {result && result.total > 0 ? (
            <Button asChild variant="ghost">
              <Link href={PARTNERS_ROUTE}>
                {t("Go to Partners")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DiscoverPartnerCsvExportButton({
  kind,
}: {
  kind: PartnerExportPublisherKind;
}) {
  const { language } = useAppLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="size-3.5" />
        {appText(language, "Export as partners CSV")}
      </Button>
      {open ? (
        <PartnerCsvExportDialog kind={kind} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
