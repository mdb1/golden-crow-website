"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, Loader2, Save, WandSparkles } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { FileJsonWizard } from "@/components/file-storage/file-json-wizard";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
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
import {
  defaultStoredFileName,
  formatStoredFileType,
  MAX_INLINE_STORED_FILE_BYTES,
  normalizeStoredFileContent,
  storedFileContentByteLength,
  STORED_FILE_JSON_FORMAT_OPTIONS,
  validateStoredFileJson,
} from "@/lib/file-storage";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

type CreateState = {
  fileName: string;
  creatorEmail: string;
  fileType: string;
  fileContent: string;
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function FileStorageCreateWorkbench() {
  const router = useRouter();
  const [state, setState] = useState<CreateState>({
    fileName: "",
    creatorEmail: "",
    fileType: "",
    fileContent: "",
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const jsonValid = useMemo(
    () => validateStoredFileJson(state.fileContent),
    [state.fileContent],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.fileType) {
      setToast({ id: Date.now(), tone: "error", message: "Choose a file type." });
      return;
    }
    if (!state.fileName.trim()) {
      setToast({ id: Date.now(), tone: "error", message: "Enter a file name." });
      return;
    }
    if (state.creatorEmail.trim() && !validEmail(state.creatorEmail.trim())) {
      setToast({ id: Date.now(), tone: "error", message: "Enter a valid creator email." });
      return;
    }
    if (!state.fileContent.trim() || !jsonValid) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Stored file content must be valid JSON.",
      });
      return;
    }
    if (
      storedFileContentByteLength(state.fileContent) >
      MAX_INLINE_STORED_FILE_BYTES
    ) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Stored file content cannot exceed 900 KiB.",
      });
      return;
    }

    setPending(true);
    try {
      const validated = await sdkFetch<{
        valid: true;
        fileType: string;
        fileContent: string;
      }>("/file-storage/validate", {
        method: "POST",
        body: JSON.stringify({
          fileType: state.fileType,
          fileContent: state.fileContent,
        }),
      });
      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        "/file-storage",
        {
          method: "POST",
          body: JSON.stringify({
            data: {
              file_name: state.fileName.trim(),
              ...(state.creatorEmail.trim()
                ? { creator_email: state.creatorEmail.trim().toLowerCase() }
                : {}),
              file_type: validated.fileType,
              file_content: validated.fileContent,
            },
          }),
        },
      );
      router.push(`/collections/file_storage/${encodeURIComponent(response.document.id)}`);
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof SdkRequestError
            ? error.message
            : "Unable to create the stored file.",
        details: error instanceof SdkRequestError ? error.details : undefined,
        durationMs: 10000,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/collections/file_storage">
            <ArrowLeft className="h-4 w-4" />
            Back to file storage
          </Link>
        </Button>
      </div>

      <form onSubmit={submit} className="glass-panel flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
              <FilePlus2 className="h-5 w-5 text-violet-600" />
              Add new file
              <HeaderUnclutterButton />
            </h2>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? "Creating..." : "Create file"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="new-stored-file-type">File type</Label>
            <Select
              value={state.fileType || undefined}
              onValueChange={(fileType) =>
                setState((current) => ({
                  ...current,
                  fileType,
                  fileName:
                    !current.fileName ||
                    STORED_FILE_JSON_FORMAT_OPTIONS.some(
                      (option) => current.fileName === defaultStoredFileName(option),
                    )
                      ? defaultStoredFileName(fileType)
                      : current.fileName,
                  fileContent: current.fileType === fileType ? current.fileContent : "",
                }))
              }
            >
              <SelectTrigger id="new-stored-file-type" className="w-full">
                <SelectValue placeholder="Choose one of 23 JSON formats" />
              </SelectTrigger>
              <SelectContent>
                {STORED_FILE_JSON_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {formatStoredFileType(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-stored-file-name">File name</Label>
            <Input
              id="new-stored-file-name"
              value={state.fileName}
              onChange={(event) =>
                setState((current) => ({ ...current, fileName: event.target.value }))
              }
              placeholder="result.pgo.json"
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="new-stored-file-creator">Creator email (optional)</Label>
            <Input
              id="new-stored-file-creator"
              type="email"
              value={state.creatorEmail}
              onChange={(event) =>
                setState((current) => ({ ...current, creatorEmail: event.target.value }))
              }
              placeholder="Defaults to the signed-in admin"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label htmlFor="new-stored-file-json">Stored JSON content</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!state.fileType || pending}
              onClick={() => setWizardOpen(true)}
            >
              <WandSparkles className="h-4 w-4" />
              Open file wizard
            </Button>
          </div>
          <Textarea
            id="new-stored-file-json"
            value={state.fileContent}
            onChange={(event) =>
              setState((current) => ({ ...current, fileContent: event.target.value }))
            }
            className="min-h-[440px] font-mono text-xs leading-6"
            placeholder={state.fileType ? "Write JSON manually or open the file wizard." : "Choose a file type first."}
            disabled={!state.fileType || pending}
            aria-invalid={Boolean(state.fileContent && !jsonValid)}
            required
          />
          <p className="text-xs text-muted-foreground">
            {state.fileContent
              ? jsonValid
                ? "JSON syntax is valid. The current PGO or report contract is validated before creation."
                : "JSON syntax is invalid."
              : "The wizard fills this text field only; it does not persist a file."}
          </p>
        </div>
      </form>

      <FileJsonWizard
        open={wizardOpen}
        fileType={state.fileType}
        initialJson={state.fileContent}
        onOpenChange={setWizardOpen}
        onSave={(fileContent) =>
          setState((current) => ({
            ...current,
            fileContent: JSON.stringify(
              JSON.parse(normalizeStoredFileContent(fileContent)),
              null,
              2,
            ),
          }))
        }
      />
    </div>
  );
}
