"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sdkFetch } from "@/lib/sdk-client";
import type { ReportProviderFormat, UploadedReportRecord } from "@/lib/report-admin";
import { isReportReadyToDownload, normalizeProviderFormat } from "@/lib/report-admin";

const PROVIDER_FORMAT_OPTIONS: ReportProviderFormat[] = ["mdm", "ag", "vcf", "pdf", "2pq"];

function buildPayload(report: UploadedReportRecord, overrides: Record<string, unknown>) {
  return {
    ...report.sourceData,
    ...overrides,
  };
}

export function UploadedReportUploadWorkbench({
  report,
}: {
  report: UploadedReportRecord;
}) {
  const router = useRouter();
  const isReady = isReportReadyToDownload(report);
  const [downloadUrl, setDownloadUrl] = useState(report.downloadUrl);
  const [providerFormat, setProviderFormat] = useState<ReportProviderFormat>(
    normalizeProviderFormat(report.providerFormat)
  );
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (downloadUrl.trim() !== report.downloadUrl.trim()) {
      changes.push("download_url");
    }
    if (!isReady && providerFormat !== normalizeProviderFormat(report.providerFormat)) {
      changes.push("provider_format");
    }
    if (isReady) {
      changes.push("upload_version_count");
    }
    return [...new Set(changes)];
  }, [downloadUrl, isReady, providerFormat, report.downloadUrl, report.providerFormat]);

  async function handleSave() {
    const trimmedURL = downloadUrl.trim();
    if (!trimmedURL) {
      setStatusMessage({
        tone: "error",
        message: "Enter a download URL before saving.",
      });
      return;
    }

    setPending(true);
    setStatusMessage(null);

    const hadPreviousDownloadUrl = isReportReadyToDownload(report);
    const resolvedUploadVersionCount = hadPreviousDownloadUrl
      ? (report.uploadVersionCount ?? 1) + 1
      : 1;
    const finalProviderFormat = hadPreviousDownloadUrl
      ? normalizeProviderFormat(report.providerFormat)
      : providerFormat;

    try {
      await sdkFetch(`/moderation/uploaded_reports/${report.id}`, {
        method: "PUT",
        body: JSON.stringify({
          data: buildPayload(report, {
            download_url: trimmedURL,
            provider_format: finalProviderFormat,
            upload_version_count: resolvedUploadVersionCount,
            date_modified: new Date().toISOString(),
          }),
        }),
      });

      setStatusMessage({
        tone: "success",
        message: hadPreviousDownloadUrl
          ? "New report version saved."
          : "Report upload metadata saved.",
      });
      router.push(`/reports/uploads/${report.id}`);
      router.refresh();
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Unable to save upload details.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/reports/uploads/${report.id}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to uploaded report
          </Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{report.id}</span>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Reports</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {isReady ? "Upload new version" : "Upload report"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Match the iOS upload flow: set the download URL, keep the type locked
              for new versions, and advance the upload version count when a report
              is replaced.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={pending}>
            <Save className="h-3.5 w-3.5" />
            {pending ? "Saving..." : "Save upload"}
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Download URL</Label>
              <Input
                value={downloadUrl}
                onChange={(event) => setDownloadUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label>Provider format</Label>
              {isReady ? (
                <Input value={normalizeProviderFormat(report.providerFormat).toUpperCase()} disabled />
              ) : (
                <Select
                  value={providerFormat}
                  onValueChange={(value) => setProviderFormat(value as ReportProviderFormat)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a provider format" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Save scope
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
              {changedFields.map((field) => (
                <li key={field} className="font-mono text-xs">
                  {field}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Upload version will become {isReady ? (report.uploadVersionCount ?? 1) + 1 : 1}.
            </p>
            {statusMessage ? (
              <p
                className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                  statusMessage.tone === "success"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                    : "border-destructive/25 bg-destructive/10 text-destructive"
                }`}
              >
                {statusMessage.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
