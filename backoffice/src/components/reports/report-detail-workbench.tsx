"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { DeveloperRawEditor } from "@/components/developer-raw-editor";
import { ReportPill } from "@/components/reports/report-pill";
import { UploadedReportWorkbench } from "@/components/reports/uploaded-report-workbench";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  AdminReportRecord,
  ModerationDocumentRecord,
  RelatedRecordLink,
} from "@/lib/moderation-types";
import {
  formatDateTime,
  formatReportFormat,
  formatReportStatus,
  getReportSourceMeta,
  getReportStatusColor,
} from "@/lib/moderation-utils";
import { parseReportCodeRecord } from "@/lib/report-admin";

type EditableReportCodeState = {
  ownerId: string;
  uploadedReportId: string;
};

const SOURCE_DESCRIPTIONS: Record<AdminReportRecord["source"], string> = {
  myDNAMap: "Report uploaded via the PocketGenes mobile app.",
  ActyonGenomics: "Report from ActyonGenomics laboratory partner.",
  vcf: "Variant Call Format file - raw genomic variant data.",
};

function toEditableState(document: ModerationDocumentRecord): EditableReportCodeState {
  const reportCode = parseReportCodeRecord(document);

  return {
    ownerId: reportCode.ownerId,
    uploadedReportId: reportCode.uploadedReportId,
  };
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ReportDetailWorkbench({
  report,
  reportCodeDocument,
  uploadedReportDocument,
  backHref,
}: {
  report: AdminReportRecord;
  reportCodeDocument: ModerationDocumentRecord;
  uploadedReportDocument: ModerationDocumentRecord | null;
  backHref: string;
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(reportCodeDocument);
  const [state, setState] = useState<EditableReportCodeState>(() =>
    toEditableState(reportCodeDocument)
  );
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const reportCode = useMemo(() => parseReportCodeRecord(sourceDocument), [sourceDocument]);
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);
  const sourceMeta = getReportSourceMeta(report.source);
  const statusLabel = formatReportStatus(report.trackingStatus);
  const formatLabel = formatReportFormat(report.providerFormat);
  const effectiveOwnerId = state.ownerId.trim() || report.userId || "";
  const effectiveUploadedReportId =
    state.uploadedReportId.trim() || report.uploadedReportId || "";

  const changedFields = useMemo(() => {
    const changes: string[] = [];

    if (state.ownerId.trim() !== sourceState.ownerId.trim()) {
      changes.push("owner_id");
    }

    if (state.uploadedReportId.trim() !== sourceState.uploadedReportId.trim()) {
      changes.push("uploaded_report_id");
    }

    return changes;
  }, [sourceState, state]);

  const relatedLinks = useMemo<RelatedRecordLink[]>(() => {
    const links: RelatedRecordLink[] = [];

    if (effectiveOwnerId) {
      links.push({
        label: "Report user view",
        href: `/reports/users/${effectiveOwnerId}`,
        description: "Stay inside the selected-user report flow.",
      });
      links.push({
        label: "Account workbench",
        href: `/users/${effectiveOwnerId}`,
        description: "Edit Firebase Auth and private profile state for this user.",
      });
      links.push({
        label: "Community user",
        href: `/collections/community_users/${effectiveOwnerId}`,
        description: "Inspect the linked community user document.",
      });
    }

    if (effectiveUploadedReportId) {
      links.push({
        label: "Uploaded report",
        href: `/reports/uploads/${effectiveUploadedReportId}`,
        description: "Open the linked uploaded-report management screen.",
      });
    }

    if (report.linkedFileId) {
      links.push({
        label: "Stored file",
        href: `/collections/file_storage/${report.linkedFileId}`,
        description: "Inspect the linked file_storage document behind this report.",
      });
    }

    if (report.ownerPublicProfileId) {
      links.push({
        label: "Public profile",
        href: `/collections/public_profiles/${report.ownerPublicProfileId}`,
        description: "Inspect the patient-facing profile tied to this report.",
      });
    }

    return links;
  }, [
    effectiveOwnerId,
    effectiveUploadedReportId,
    report.linkedFileId,
    report.ownerPublicProfileId,
  ]);

  async function handleSave() {
    setPending(true);

    try {
      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        `/moderation/report_codes/${report.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            data: {
              ...reportCode.sourceData,
              owner_id: toNullableString(state.ownerId),
              uploaded_report_id: toNullableString(state.uploadedReportId),
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
          "Report links saved. The detail screen will refresh to reflect any uploaded-report changes.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the report links.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Reports</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Report detail workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Edit the report-code link record here first, then manage the
              linked uploaded-report metadata below on the same screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
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
              {pending ? "Saving..." : "Save report links"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ReportPill label={report.code} color="#7A59A8" />
          <ReportPill label={sourceMeta.label} color={sourceMeta.color} />
          {formatLabel ? <ReportPill label={formatLabel} color="#4E8FBB" /> : null}
          {statusLabel ? (
            <ReportPill
              label={statusLabel}
              color={getReportStatusColor(report.trackingStatus)}
            />
          ) : null}
          <ReportPill
            label={effectiveUploadedReportId ? "Linked upload" : "No upload"}
            color={effectiveUploadedReportId ? "#5FAE6A" : "#FF9E2C"}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-code">Report code</Label>
              <Input id="report-code" value={report.code} disabled />
              <p className="text-xs text-muted-foreground">
                The report code is the document id for the raw link record.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-owner-id">Linked owner user id</Label>
              <Input
                id="report-owner-id"
                value={state.ownerId}
                placeholder="Firebase UID"
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    ownerId: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                This decides which user-scoped reports screen and community user
                this report resolves to.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="uploaded-report-id">Linked uploaded report id</Label>
              <Input
                id="uploaded-report-id"
                value={state.uploadedReportId}
                placeholder="uploaded_reports document id"
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    uploadedReportId: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Point the report code to its uploaded-report document. The typed
                metadata editor below follows this link.
              </p>
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
                <p className="mt-3 text-sm text-muted-foreground">No pending link changes.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Resolved report snapshot
              </p>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">File name</dt>
                  <dd className="text-right text-foreground">
                    {report.fileName ?? "No file name"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Patient name</dt>
                  <dd className="text-right text-foreground">
                    {report.providerName ?? "No patient name"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="text-right text-foreground">
                    {report.ownerName ?? report.ownerEmail ?? "No owner metadata"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Upload version</dt>
                  <dd className="text-right text-foreground">
                    {report.uploadVersionCount ?? 1}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="text-right text-foreground">
                    {formatDateTime(report.createdAt) ?? "No timestamp"}
                  </dd>
                </div>
              </dl>
              {report.downloadUrl ? (
                <a
                  href={report.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block break-all text-xs text-primary underline-offset-4 hover:underline"
                >
                  {report.downloadUrl}
                </a>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">No download URL published.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Related actions
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {effectiveOwnerId ? (
                  <Link
                    href={`/reports/users/${effectiveOwnerId}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open owner flow</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review this report inside the selected-user reports view.
                    </p>
                  </Link>
                ) : null}
                {effectiveUploadedReportId ? (
                  <Link
                    href={`/reports/uploads/${effectiveUploadedReportId}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">
                      Open focused uploaded-report screen
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use the dedicated route for a narrower uploaded-report workflow.
                    </p>
                  </Link>
                ) : null}
                {report.linkedFileId ? (
                  <Link
                    href={`/collections/file_storage/${report.linkedFileId}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open stored file</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Inspect the canonical stored file attached to this report.
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
                      Inspect the patient-facing public profile linked to this report.
                    </p>
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {uploadedReportDocument ? (
        <UploadedReportWorkbench document={uploadedReportDocument} mode="embedded" />
      ) : (
        <section className="glass-panel flex flex-col gap-3 px-5 py-4">
          <p className="section-eyebrow">Reports</p>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Linked uploaded report
          </h2>
          <p className="text-sm text-muted-foreground">
            {effectiveUploadedReportId
              ? "This report code points to an uploaded-report id, but that document could not be loaded. Check the link above, save, then refresh."
              : "This report code does not point to an uploaded-report document yet. Add the uploaded-report id above to unlock the typed metadata editor."}
          </p>
        </section>
      )}

      <DeveloperRawEditor
        collectionKey="report_codes"
        document={sourceDocument}
        relatedLinks={relatedLinks}
        backHref={backHref}
        backLabel="Back to reports"
        deleteHref={`/moderation/report_codes/${report.id}`}
        updateHref={`/moderation/report_codes/${report.id}`}
        title="Developer raw report-code editor"
        description={`Use this only when the typed report form cannot represent the link repair or schema recovery you need. ${SOURCE_DESCRIPTIONS[report.source]}`}
      />
    </div>
  );
}
