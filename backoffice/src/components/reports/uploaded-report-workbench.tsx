"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { DeveloperRawEditor } from "@/components/developer-raw-editor";
import { ReportPill } from "@/components/reports/report-pill";
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
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import {
  formatDateTime,
  formatReportFormat,
  formatReportStatus,
  getReportStatusColor,
} from "@/lib/moderation-utils";
import {
  isReportReadyToDownload,
  parseUploadedReportRecord,
  REPORT_PROVIDER_FORMAT_OPTIONS,
  resolveEditableReportOwnerId,
  TRACKING_PROGRESS_STATUS_OPTIONS,
  type ReportProviderFormat,
} from "@/lib/report-admin";

type EditableUploadedReportState = {
  fileName: string;
  providerName: string;
  trackingProgressStatus: string;
  downloadUrl: string;
  providerFormat: ReportProviderFormat | "";
  ownerName: string;
  ownerEmail: string;
  reportOwnerId: string;
  ownerCommunityUserId: string;
  ownerPublicProfileId: string;
};

type UploadedReportFieldKey =
  | "fileName"
  | "providerName"
  | "trackingProgressStatus"
  | "downloadUrl"
  | "providerFormat"
  | "ownerEmail";

function toEditableProviderFormat(value: string): ReportProviderFormat | "" {
  switch (value.trim().toLowerCase()) {
    case "ag":
      return "ag";
    case "mdm":
      return "mdm";
    case "pdf":
      return "pdf";
    case "vcf":
      return "vcf";
    default:
      return "";
  }
}

function toEditableState(document: ModerationDocumentRecord): EditableUploadedReportState {
  const report = parseUploadedReportRecord(document);

  return {
    fileName: report.fileName,
    providerName: report.providerName,
    trackingProgressStatus: report.trackingProgressStatus,
    downloadUrl: report.downloadUrl,
    providerFormat: toEditableProviderFormat(report.providerFormat),
    ownerName: report.ownerName,
    ownerEmail: report.ownerEmail,
    reportOwnerId: report.reportOwnerId,
    ownerCommunityUserId: report.ownerCommunityUserId,
    ownerPublicProfileId: report.ownerPublicProfileId,
  };
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getValidationErrors(
  state: EditableUploadedReportState,
  isProviderFormatLocked: boolean
) {
  const errors: Partial<Record<UploadedReportFieldKey, string>> = {};

  if (!state.fileName.trim()) {
    errors.fileName = "Enter a file name.";
  }

  if (!state.providerName.trim()) {
    errors.providerName = "Enter the patient name used in the app.";
  }

  if (!state.trackingProgressStatus.trim()) {
    errors.trackingProgressStatus = "Choose a tracking status.";
  }

  if (state.downloadUrl.trim() && !isValidHttpUrl(state.downloadUrl.trim())) {
    errors.downloadUrl = "Use a valid http or https URL.";
  }

  if (!isProviderFormatLocked && state.downloadUrl.trim() && !state.providerFormat) {
    errors.providerFormat = "Choose the provider format before publishing a download URL.";
  }

  if (state.ownerEmail.trim() && !isValidEmail(state.ownerEmail.trim())) {
    errors.ownerEmail = "Enter a valid owner email.";
  }

  return errors;
}

export function UploadedReportWorkbench({
  document,
  mode = "standalone",
}: {
  document: ModerationDocumentRecord;
  mode?: "standalone" | "embedded";
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(document);
  const [state, setState] = useState<EditableUploadedReportState>(() =>
    toEditableState(document)
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<UploadedReportFieldKey, string>>
  >({});
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const report = useMemo(() => parseUploadedReportRecord(sourceDocument), [sourceDocument]);
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);
  const statusLabel = formatReportStatus(state.trackingProgressStatus || report.trackingProgressStatus);
  const formattedProviderFormat = formatReportFormat(
    state.providerFormat || report.providerFormat
  );
  const rawFormatLabel =
    formattedProviderFormat ??
    state.providerFormat ??
    report.providerFormat ??
    "";
  const formatLabel = rawFormatLabel || "Format not set";
  const ownerId =
    state.reportOwnerId.trim() ||
    state.ownerCommunityUserId.trim() ||
    resolveEditableReportOwnerId(report);
  const isReady = isReportReadyToDownload(report);
  const isProviderFormatLocked = isReady && Boolean(report.providerFormat.trim());
  const nextUploadVersionCount = useMemo(() => {
    const trimmedDownloadUrl = state.downloadUrl.trim();
    const currentDownloadUrl = report.downloadUrl.trim();

    if (isReady && trimmedDownloadUrl && trimmedDownloadUrl !== currentDownloadUrl) {
      return (report.uploadVersionCount ?? 1) + 1;
    }

    return report.uploadVersionCount ?? 1;
  }, [isReady, report.downloadUrl, report.uploadVersionCount, state.downloadUrl]);

  const changedFields = useMemo(() => {
    const changes: string[] = [];

    if (state.fileName.trim() !== sourceState.fileName.trim()) {
      changes.push("file_name");
    }
    if (state.providerName.trim() !== sourceState.providerName.trim()) {
      changes.push("provider_name");
    }
    if (state.trackingProgressStatus.trim() !== sourceState.trackingProgressStatus.trim()) {
      changes.push("tracking_progress_status");
    }
    if (state.downloadUrl.trim() !== sourceState.downloadUrl.trim()) {
      changes.push("download_url");
    }
    if (state.providerFormat !== sourceState.providerFormat) {
      changes.push("provider_format");
    }
    if (state.ownerName.trim() !== sourceState.ownerName.trim()) {
      changes.push("owner_name");
    }
    if (state.ownerEmail.trim() !== sourceState.ownerEmail.trim()) {
      changes.push("owner_email");
    }
    if (state.reportOwnerId.trim() !== sourceState.reportOwnerId.trim()) {
      changes.push("report_owner_id");
    }
    if (
      state.ownerCommunityUserId.trim() !== sourceState.ownerCommunityUserId.trim()
    ) {
      changes.push("owner_community_user_id");
    }
    if (state.ownerPublicProfileId.trim() !== sourceState.ownerPublicProfileId.trim()) {
      changes.push("owner_public_profile_id");
    }
    if (nextUploadVersionCount !== (report.uploadVersionCount ?? 1)) {
      changes.push("upload_version_count");
    }

    return changes;
  }, [nextUploadVersionCount, report.uploadVersionCount, sourceState, state]);

  const validationErrors = useMemo(
    () => getValidationErrors(state, isProviderFormatLocked),
    [isProviderFormatLocked, state]
  );

  async function handleSave() {
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          validationErrors.fileName ??
          validationErrors.providerName ??
          validationErrors.trackingProgressStatus ??
          validationErrors.downloadUrl ??
          validationErrors.providerFormat ??
          validationErrors.ownerEmail ??
          "Review the highlighted fields before saving.",
      });
      return;
    }

    setPending(true);
    setFieldErrors({});

    try {
      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        `/moderation/uploaded_reports/${report.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            data: {
              ...report.sourceData,
              file_name: state.fileName.trim(),
              provider_name: state.providerName.trim(),
              tracking_progress_status: state.trackingProgressStatus.trim(),
              download_url: toNullableString(state.downloadUrl),
              provider_format: isProviderFormatLocked
                ? report.providerFormat || null
                : state.providerFormat || null,
              owner_name: toNullableString(state.ownerName),
              owner_email: toNullableString(state.ownerEmail),
              report_owner_id: toNullableString(state.reportOwnerId),
              owner_community_user_id: toNullableString(state.ownerCommunityUserId),
              owner_public_profile_id: toNullableString(state.ownerPublicProfileId),
              upload_version_count: nextUploadVersionCount,
              date_modified: new Date().toISOString(),
            },
          }),
        }
      );

      setSourceDocument(response.document);
      setState(toEditableState(response.document));
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          nextUploadVersionCount !== (report.uploadVersionCount ?? 1)
            ? `New report version published as v${nextUploadVersionCount}.`
            : "Uploaded report metadata saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the uploaded report.",
      });
    } finally {
      setPending(false);
    }
  }

  const trackingOptionValues = TRACKING_PROGRESS_STATUS_OPTIONS.map(
    (option) => option.value
  );
  const currentTrackingStatusIsCustom =
    Boolean(state.trackingProgressStatus) &&
    !trackingOptionValues.some((option) => option === state.trackingProgressStatus);
  const currentProviderFormatIsCustom =
    Boolean(state.providerFormat) &&
    !REPORT_PROVIDER_FORMAT_OPTIONS.some((option) => option === state.providerFormat);

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      {mode === "standalone" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={ownerId ? `/reports/users/${ownerId}` : "/collections/report_codes"}>
              Back
            </Link>
          </Button>
          {report.reportCode ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={
                  ownerId
                    ? `/reports/${report.reportCode}?userId=${ownerId}`
                    : `/reports/${report.reportCode}`
                }
              >
                Open report code
              </Link>
            </Button>
          ) : null}
          <span className="font-mono text-xs text-muted-foreground">{report.id}</span>
        </div>
      ) : null}

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Reports</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "embedded"
                ? "Linked uploaded report"
                : "Uploaded report workbench"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {mode === "embedded"
                ? "Manage the linked uploaded-report metadata without leaving the report detail route."
                : "Manage report metadata, tracking state, linked owner records, and download publishing from one screen modeled on the iOS report admin."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setState(sourceState);
                setFieldErrors({});
              }}
              disabled={changedFields.length === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={pending || changedFields.length === 0}
            >
              <Save className="h-3.5 w-3.5" />
              {pending ? "Saving..." : "Save report"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {report.reportCode ? <ReportPill label={report.reportCode} color="#7A59A8" /> : null}
          <ReportPill label={formatLabel} color="#4E8FBB" />
          {statusLabel ? (
            <ReportPill
              label={statusLabel}
              color={getReportStatusColor(state.trackingProgressStatus || report.trackingProgressStatus)}
            />
          ) : null}
          <ReportPill
            label={isReady ? "Download ready" : "Awaiting upload"}
            color={isReady ? "#5FAE6A" : "#FF9E2C"}
          />
          <ReportPill label={`v${nextUploadVersionCount}`} color="#8E80B8" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="report-code">Report code</Label>
              <Input id="report-code" value={report.reportCode || "—"} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file-name">File name</Label>
              <Input
                id="file-name"
                value={state.fileName}
                aria-invalid={Boolean(fieldErrors.fileName)}
                onChange={(event) =>
                  setState((current) => ({ ...current, fileName: event.target.value }))
                }
              />
              {fieldErrors.fileName ? (
                <p className="text-xs text-destructive">{fieldErrors.fileName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-name">Patient name</Label>
              <Input
                id="provider-name"
                value={state.providerName}
                aria-invalid={Boolean(fieldErrors.providerName)}
                onChange={(event) =>
                  setState((current) => ({ ...current, providerName: event.target.value }))
                }
              />
              {fieldErrors.providerName ? (
                <p className="text-xs text-destructive">{fieldErrors.providerName}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Tracking progress</Label>
              <Select
                value={state.trackingProgressStatus || undefined}
                onValueChange={(value) =>
                  setState((current) => ({
                    ...current,
                    trackingProgressStatus: value,
                  }))
                }
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(fieldErrors.trackingProgressStatus)}>
                  <SelectValue placeholder="Select a tracking status" />
                </SelectTrigger>
                <SelectContent>
                  {currentTrackingStatusIsCustom ? (
                    <SelectItem value={state.trackingProgressStatus}>
                      {state.trackingProgressStatus}
                    </SelectItem>
                  ) : null}
                  {TRACKING_PROGRESS_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.trackingProgressStatus ? (
                <p className="text-xs text-destructive">
                  {fieldErrors.trackingProgressStatus}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Provider format</Label>
              {isProviderFormatLocked ? (
                <Input value={formatLabel} disabled />
              ) : (
                <Select
                  value={state.providerFormat || undefined}
                  onValueChange={(value) =>
                    setState((current) => ({
                      ...current,
                      providerFormat: value as ReportProviderFormat,
                    }))
                  }
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(fieldErrors.providerFormat)}>
                    <SelectValue placeholder="Select a provider format" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentProviderFormatIsCustom ? (
                      <SelectItem value={state.providerFormat}>
                        {state.providerFormat.toUpperCase()}
                      </SelectItem>
                    ) : null}
                    {REPORT_PROVIDER_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {fieldErrors.providerFormat ? (
                <p className="text-xs text-destructive">{fieldErrors.providerFormat}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isProviderFormatLocked
                    ? "Provider format stays locked after the first upload, matching the iOS flow."
                    : "Choose the format before publishing a download URL."}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="download-url">Download URL</Label>
              <Input
                id="download-url"
                value={state.downloadUrl}
                aria-invalid={Boolean(fieldErrors.downloadUrl)}
                placeholder="https://..."
                onChange={(event) =>
                  setState((current) => ({ ...current, downloadUrl: event.target.value }))
                }
              />
              {fieldErrors.downloadUrl ? (
                <p className="text-xs text-destructive">{fieldErrors.downloadUrl}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Saving a new download URL on an existing uploaded report increments the version count.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner-name">Owner name</Label>
              <Input
                id="owner-name"
                value={state.ownerName}
                onChange={(event) =>
                  setState((current) => ({ ...current, ownerName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-email">Owner email</Label>
              <Input
                id="owner-email"
                type="email"
                value={state.ownerEmail}
                aria-invalid={Boolean(fieldErrors.ownerEmail)}
                onChange={(event) =>
                  setState((current) => ({ ...current, ownerEmail: event.target.value }))
                }
              />
              {fieldErrors.ownerEmail ? (
                <p className="text-xs text-destructive">{fieldErrors.ownerEmail}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-owner-id">Report owner id</Label>
              <Input
                id="report-owner-id"
                value={state.reportOwnerId}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    reportOwnerId: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-community-user-id">Owner community user id</Label>
              <Input
                id="owner-community-user-id"
                value={state.ownerCommunityUserId}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    ownerCommunityUserId: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="owner-public-profile-id">Owner public profile id</Label>
              <Input
                id="owner-public-profile-id"
                value={state.ownerPublicProfileId}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    ownerPublicProfileId: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Save scope
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
              <p className="mt-4 text-sm text-muted-foreground">
                Upload version will remain {report.uploadVersionCount ?? 1}
                {nextUploadVersionCount !== (report.uploadVersionCount ?? 1)
                  ? ` until save, then become ${nextUploadVersionCount}.`
                  : "."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Related actions
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {report.reportCode ? (
                  mode === "standalone" ? (
                  <Link
                    href={
                      ownerId
                        ? `/reports/${report.reportCode}?userId=${ownerId}`
                        : `/reports/${report.reportCode}`
                    }
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open report code</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Jump to the report-code detail and destructive actions.
                    </p>
                  </Link>
                  ) : null
                ) : null}
                {ownerId ? (
                  <>
                    <Link
                      href={`/reports/users/${ownerId}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">Open report user view</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Stay scoped to the linked user while reviewing related report records.
                      </p>
                    </Link>
                    <Link
                      href={`/users/${ownerId}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">Open account workbench</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Edit Firebase Auth and private profile state for the same account.
                      </p>
                    </Link>
                  </>
                ) : null}
                {report.reportOwnerId ? (
                  <Link
                    href={`/collections/report_owners/${report.reportOwnerId}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open owner profile</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Edit the linked report owner record without leaving the admin.
                    </p>
                  </Link>
                ) : null}
                {report.ownerPublicProfileId ? (
                  <Link
                    href={`/collections/public_profiles/${report.ownerPublicProfileId}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open public profile</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Inspect the patient-facing public profile tied to this report.
                    </p>
                  </Link>
                ) : null}
                {report.ownerCommunityUserId ? (
                  <Link
                    href={`/collections/community_users/${report.ownerCommunityUserId}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open community user</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Inspect the linked community user document.
                    </p>
                  </Link>
                ) : null}
                {report.downloadUrl ? (
                  <a
                    href={report.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open current download</p>
                    <p className="mt-1 break-all text-sm text-muted-foreground">
                      {report.downloadUrl}
                    </p>
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Record metadata
              </p>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Uploaded report id</dt>
                  <dd className="font-mono text-xs text-foreground">{report.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-right text-foreground">
                    {formatDateTime(report.dateCreated) ?? "No timestamp"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Modified</dt>
                  <dd className="text-right text-foreground">
                    {formatDateTime(report.dateModified) ?? "No timestamp"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {mode === "standalone" ? (
        <DeveloperRawEditor
          collectionKey="uploaded_reports"
          document={sourceDocument}
          relatedLinks={[
            ...(report.reportCode
              ? [
                  {
                    label: "Report code",
                    href: ownerId
                      ? `/reports/${report.reportCode}?userId=${ownerId}`
                      : `/reports/${report.reportCode}`,
                    description: "Open the linked report code detail screen.",
                  },
                ]
              : []),
            ...(ownerId
              ? [
                  {
                    label: "Report user view",
                    href: `/reports/users/${ownerId}`,
                    description: "Open the linked user-scoped reports screen.",
                  },
                ]
              : []),
          ]}
          backHref="/collections/uploaded_reports"
          backLabel="Back to uploaded reports"
          deleteHref={`/moderation/uploaded_reports/${report.id}`}
          updateHref={`/moderation/uploaded_reports/${report.id}`}
          title="Developer raw uploaded-report editor"
          description="Use this only when the typed uploaded report form cannot represent the field or recovery operation you need."
        />
      ) : null}
    </div>
  );
}
