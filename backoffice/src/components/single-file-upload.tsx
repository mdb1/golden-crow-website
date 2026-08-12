"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SingleFileValue {
  name: string;
  type: string;
  size: number;
  content: string;
}

const DEFAULT_MAX_BYTES = 750_000;
const ACCEPTED_FILE_TYPES =
  ".bmp,.gif,.heic,.heif,.jpeg,.jpg,.png,.tif,.tiff,.webp,application/pdf";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read file."));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function isAcceptedFile(file: File) {
  return file.type === "application/pdf" ||
    (file.type.startsWith("image/") && file.type !== "image/svg+xml");
}

export function SingleFileUpload({
  id,
  label,
  value,
  onChange,
  onError,
  error,
  maxBytes = DEFAULT_MAX_BYTES,
  uploadLabel = "Upload file",
  removeLabel = "Remove file",
  emptyLabel = "No file selected",
  invalidTypeMessage = "Select a PDF or supported image file.",
  tooLargeMessage,
  readErrorMessage = "Unable to read the selected file.",
  helperText,
}: {
  id: string;
  label: string;
  value: SingleFileValue | null;
  onChange: (file: SingleFileValue | null) => void;
  onError?: (message: string) => void;
  error?: string;
  maxBytes?: number;
  uploadLabel?: string;
  removeLabel?: string;
  emptyLabel?: string;
  invalidTypeMessage?: string;
  tooLargeMessage?: string;
  readErrorMessage?: string;
  helperText?: string;
}) {
  const [localError, setLocalError] = useState("");
  const shownError = error || localError;

  function reportError(message: string) {
    setLocalError(message);
    onError?.(message);
  }

  async function attachFile(file: File) {
    if (!isAcceptedFile(file)) {
      reportError(invalidTypeMessage);
      return;
    }
    if (file.size > maxBytes) {
      reportError(
        tooLargeMessage ??
          `The selected file exceeds ${Math.round(maxBytes / 1000)} KB.`,
      );
      return;
    }

    try {
      const content = await fileToDataUrl(file);
      setLocalError("");
      onChange({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        content,
      });
    } catch {
      reportError(readErrorMessage);
    }
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Label htmlFor={id}>{label}</Label>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {value?.name || emptyLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <label htmlFor={id} className="cursor-pointer">
              <Upload className="size-4" />
              {uploadLabel}
            </label>
          </Button>
          {value ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLocalError("");
                onChange(null);
              }}
            >
              <X className="size-4" />
              {removeLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <Input
        id={id}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void attachFile(file);
          }
        }}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        {helperText ??
          `PDF or image, maximum ${Math.round(maxBytes / 1000)} KB.`}
      </p>
      {shownError ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
