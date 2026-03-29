"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch } from "@/lib/sdk-client";
import type { UploadedReportRecord } from "@/lib/report-admin";

function buildPayload(report: UploadedReportRecord, overrides: Record<string, unknown>) {
  return {
    ...report.sourceData,
    ...overrides,
  };
}

export function UploadedReportEditWorkbench({
  report,
}: {
  report: UploadedReportRecord;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState(report.fileName);
  const [providerName, setProviderName] = useState(report.providerName);
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (fileName.trim() !== report.fileName.trim()) {
      changes.push("file_name");
    }
    if (providerName.trim() !== report.providerName.trim()) {
      changes.push("provider_name");
    }
    return changes;
  }, [fileName, providerName, report.fileName, report.providerName]);

  async function handleSave() {
    setPending(true);
    setStatusMessage(null);

    try {
      await sdkFetch(`/moderation/uploaded_reports/${report.id}`, {
        method: "PUT",
        body: JSON.stringify({
          data: buildPayload(report, {
            file_name: fileName.trim(),
            provider_name: providerName.trim(),
            date_modified: new Date().toISOString(),
          }),
        }),
      });

      setStatusMessage({
        tone: "success",
        message: "Report metadata saved.",
      });
      router.push(`/reports/uploads/${report.id}`);
      router.refresh();
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Unable to save report metadata.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/reports/uploads/${report.id}`}>Back to uploaded report</Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{report.id}</span>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Reports</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Edit report metadata
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Mirror the iOS edit flow: change the report name and patient/provider
              label without touching the report code or provider format.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            disabled={pending || changedFields.length === 0}
          >
            <Save className="h-3.5 w-3.5" />
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Report code</Label>
              <Input value={report.reportCode || report.id} disabled />
            </div>
            <div className="space-y-2">
              <Label>File name</Label>
              <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Patient name</Label>
              <Input
                value={providerName}
                onChange={(event) => setProviderName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Download URL</Label>
              <Input value={report.downloadUrl || "—"} disabled />
            </div>
            <div className="space-y-2">
              <Label>Provider format</Label>
              <Input value={report.providerFormat || "—"} disabled />
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Changed fields
            </p>
            {changedFields.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                {changedFields.map((field) => (
                  <li key={field} className="font-mono text-xs">
                    {field}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No pending changes.</p>
            )}

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
