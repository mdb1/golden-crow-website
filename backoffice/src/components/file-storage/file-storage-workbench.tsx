"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  AdminReportRecord,
  ModerationDocumentRecord,
} from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";
import {
  compactStoredFileJson,
  formatStoredFileType,
  getStoredFileLinkedReportKey,
  isJsonBackedStoredFileType,
  isStoredFileOrphan,
  normalizeStoredFileContent,
  parseStoredFileRecord,
  STORED_FILE_JSON_FORMAT_OPTIONS,
  validateStoredFileJson,
} from "@/lib/file-storage";

type EditableStoredFileState = {
  fileName: string;
  creatorEmail: string;
  fileType: string;
  fileContent: string;
};

type StoredFileFieldKey = "fileName" | "creatorEmail" | "fileType" | "fileContent";

function toEditableState(document: ModerationDocumentRecord): EditableStoredFileState {
  const file = parseStoredFileRecord(document);

  return {
    fileName: file.fileName,
    creatorEmail: file.creatorEmail,
    fileType: file.fileType,
    fileContent: file.fileContent,
  };
}

function buildPayload(file: ModerationDocumentRecord, overrides: Record<string, unknown>) {
  return {
    ...file.data,
    ...overrides,
  };
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function FileStorageWorkbench({
  document,
}: {
  document: ModerationDocumentRecord;
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(document);
  const [state, setState] = useState<EditableStoredFileState>(() => toEditableState(document));
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<StoredFileFieldKey, string>>
  >({});
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const file = useMemo(() => parseStoredFileRecord(sourceDocument), [sourceDocument]);
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);
  const linkedReportKey = getStoredFileLinkedReportKey(file);
  const isLinked = Boolean(linkedReportKey);
  const isJsonValid = useMemo(
    () => validateStoredFileJson(state.fileContent),
    [state.fileContent]
  );
  const normalizedContent = useMemo(
    () => normalizeStoredFileContent(state.fileContent),
    [state.fileContent]
  );
  const compactedContent = useMemo(() => {
    if (!isJsonValid) {
      return null;
    }

    try {
      return compactStoredFileJson(state.fileContent);
    } catch {
      return null;
    }
  }, [isJsonValid, state.fileContent]);
  const showNormalizationHint = normalizedContent !== state.fileContent;
  const isJsonFormat = isJsonBackedStoredFileType(state.fileType);

  const { data: linkedReportResult, isLoading: isLinkedReportLoading } = useQuery({
    queryKey: ["reports", linkedReportKey],
    enabled: Boolean(linkedReportKey),
    queryFn: async () => {
      try {
        return await sdkFetch<{ report: AdminReportRecord }>(`/reports/${linkedReportKey}`);
      } catch {
        return null;
      }
    },
  });

  const linkedReport = linkedReportResult?.report ?? null;

  const changedFields = useMemo(() => {
    const changes: string[] = [];

    if (state.fileName.trim() !== sourceState.fileName.trim()) {
      changes.push("file_name");
    }

    if (state.creatorEmail.trim().toLowerCase() !== sourceState.creatorEmail.trim().toLowerCase()) {
      changes.push("creator_email");
    }

    if (state.fileType.trim().toLowerCase() !== sourceState.fileType.trim().toLowerCase()) {
      changes.push("file_type");
    }

    if (state.fileContent !== sourceState.fileContent) {
      changes.push("file_content");
    }

    return changes;
  }, [sourceState, state]);

  const validationMessage = useMemo(() => {
    if (!state.fileName.trim()) {
      return "Enter a file name before saving.";
    }

    if (!state.fileType.trim() && !isLinked) {
      return "Choose a stored file type before saving.";
    }

    if (state.creatorEmail.trim() && !isValidEmail(state.creatorEmail.trim())) {
      return "Enter a valid creator email before saving.";
    }

    if (!state.fileContent.trim()) {
      return "Stored file content cannot be empty.";
    }

    if (!isJsonValid) {
      return "Stored file content must be valid JSON.";
    }

    return null;
  }, [isJsonValid, isLinked, state]);

  async function handleSave() {
    if (validationMessage) {
      setFieldErrors({
        fileName: !state.fileName.trim() ? "Enter a file name." : undefined,
        creatorEmail:
          state.creatorEmail.trim() && !isValidEmail(state.creatorEmail.trim())
            ? "Enter a valid email."
            : undefined,
        fileType:
          !state.fileType.trim() && !isLinked ? "Choose a file type." : undefined,
        fileContent:
          !state.fileContent.trim()
            ? "Stored file content cannot be empty."
            : !isJsonValid
              ? "Stored file content must be valid JSON."
              : undefined,
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: validationMessage,
      });
      return;
    }

    setPending(true);
    setFieldErrors({});

    try {
      const response = await sdkFetch<{
        document: ModerationDocumentRecord;
        linkedReportVersionBumped: boolean;
      }>(`/file-storage/${file.id}`, {
        method: "PUT",
        body: JSON.stringify({
          data: buildPayload(sourceDocument, {
            file_name: state.fileName.trim(),
            creator_email: toNullableString(state.creatorEmail.toLowerCase()),
            file_type: state.fileType.trim().toLowerCase(),
            file_content: state.fileContent,
          }),
        }),
      });

      setSourceDocument(response.document);
      setState(toEditableState(response.document));
      setToast({
        id: Date.now(),
        tone: "success",
        message: response.linkedReportVersionBumped
          ? "Stored file saved and the linked uploaded report version was incremented."
          : "Stored file saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the stored file.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/collections/file_storage">Back to file storage</Link>
        </Button>
        {linkedReportKey ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/reports/${linkedReportKey}`}>Open linked report</Link>
          </Button>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">{file.id}</span>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Reports</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Stored file workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage the canonical stored-file record here with JSON validation,
              linked-report context, and creator metadata before dropping into raw JSON.
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
              {pending ? "Saving..." : "Save file"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ReportPill label={formatStoredFileType(file.fileType)} color="#4E8FBB" />
          <ReportPill
            label={isStoredFileOrphan(file) ? "Orphan" : "Linked"}
            color={isStoredFileOrphan(file) ? "#FF9E2C" : "#5FAE6A"}
          />
          <ReportPill
            label={isJsonValid ? "JSON valid" : "JSON invalid"}
            color={isJsonValid ? "#5FAE6A" : "#E0403D"}
          />
          {showNormalizationHint ? (
            <ReportPill label="Smart quotes normalized on save" color="#8E80B8" />
          ) : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stored-file-name">File name</Label>
                <Input
                  id="stored-file-name"
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
                <Label htmlFor="stored-file-creator-email">Creator email</Label>
                <Input
                  id="stored-file-creator-email"
                  type="email"
                  value={state.creatorEmail}
                  aria-invalid={Boolean(fieldErrors.creatorEmail)}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      creatorEmail: event.target.value,
                    }))
                  }
                />
                {fieldErrors.creatorEmail ? (
                  <p className="text-xs text-destructive">{fieldErrors.creatorEmail}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This backoffice manager is cross-user: it shows and edits every stored file in Firebase.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stored-file-type">File type</Label>
                {isLinked ? (
                  <>
                    <Input
                      id="stored-file-type"
                      value={formatStoredFileType(state.fileType)}
                      disabled
                    />
                    <p className="text-xs text-muted-foreground">
                      File type is frozen while the stored file is linked to a report.
                    </p>
                  </>
                ) : (
                  <>
                    <Select
                      value={state.fileType || undefined}
                      onValueChange={(value) =>
                        setState((current) => ({ ...current, fileType: value }))
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={Boolean(fieldErrors.fileType)}
                      >
                        <SelectValue placeholder="Choose a stored file type" />
                      </SelectTrigger>
                      <SelectContent>
                        {!isJsonBackedStoredFileType(state.fileType) && state.fileType ? (
                          <SelectItem value={state.fileType}>
                            {formatStoredFileType(state.fileType)}
                          </SelectItem>
                        ) : null}
                        {STORED_FILE_JSON_FORMAT_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.fileType ? (
                      <p className="text-xs text-destructive">{fieldErrors.fileType}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        The typed editor is JSON-first, so it favors the JSON-backed stored-file formats.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stored-file-link">Linked report</Label>
                <Input
                  id="stored-file-link"
                  value={linkedReportKey || "Orphan"}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Link fields stay read-only here. Use the raw editor only for recovery-level schema work.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stored-file-content">Stored JSON content</Label>
              <Textarea
                id="stored-file-content"
                value={state.fileContent}
                aria-invalid={Boolean(fieldErrors.fileContent)}
                onChange={(event) =>
                  setState((current) => ({ ...current, fileContent: event.target.value }))
                }
                className="min-h-[420px] font-mono text-xs leading-6"
              />
              {fieldErrors.fileContent ? (
                <p className="text-xs text-destructive">{fieldErrors.fileContent}</p>
              ) : compactedContent ? (
                <p className="text-xs text-muted-foreground">
                  Save will compact the JSON to {compactedContent.length.toLocaleString()} characters.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Stored file content must parse as JSON before it can be saved.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
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
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Record metadata
              </p>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Stored file id</dt>
                  <dd className="font-mono text-xs text-foreground">{file.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-right text-foreground">
                    {formatDateTime(file.creationDate) ?? "No timestamp"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Modified</dt>
                  <dd className="text-right text-foreground">
                    {formatDateTime(file.lastModifiedDate) ?? "No timestamp"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Characters</dt>
                  <dd className="text-right text-foreground">
                    {state.fileContent.length.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">JSON-backed type</dt>
                  <dd className="text-right text-foreground">
                    {isJsonFormat ? "Yes" : "Legacy / unsupported"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Linked report
              </p>
              {!linkedReportKey ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  This stored file is currently orphaned and not attached to any report code.
                </p>
              ) : isLinkedReportLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Loading linked report details...
                </p>
              ) : linkedReport ? (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="rounded-xl border border-border/70 bg-card/50 px-3 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {linkedReport.fileName ?? linkedReport.code}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {linkedReport.providerName || linkedReport.ownerName || linkedReport.ownerEmail || "Linked report"}
                    </p>
                  </div>
                  <Link
                    href={`/reports/${linkedReport.id}`}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">Open report detail</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review the linked report code and uploaded-report metadata.
                    </p>
                  </Link>
                  {linkedReport.uploadedReportId ? (
                    <Link
                      href={`/reports/uploads/${linkedReport.uploadedReportId}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">Open uploaded report</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Inspect the linked uploaded report that consumes this stored file.
                      </p>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-border/70 bg-card/50 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">{linkedReportKey}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The stored file is linked, but the report detail could not be resolved from the typed reports API.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <DeveloperRawEditor
        collectionKey="file_storage"
        document={sourceDocument}
        relatedLinks={
          linkedReportKey
            ? [
                {
                  label: "Linked report",
                  href: `/reports/${linkedReportKey}`,
                  description: "Open the typed report detail screen attached to this stored file.",
                },
              ]
            : []
        }
        backHref="/collections/file_storage"
        backLabel="Back to file storage"
        deleteHref={`/moderation/file_storage/${file.id}`}
        updateHref={`/moderation/file_storage/${file.id}`}
        title="Developer raw stored-file editor"
        description="Use this only for schema recovery, legacy link cleanup, or fields not represented in the typed stored-file manager."
      />
    </div>
  );
}
