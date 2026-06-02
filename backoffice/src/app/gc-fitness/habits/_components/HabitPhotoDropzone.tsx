"use client";

// HabitPhotoDropzone.tsx
//
// Image-only dropzone for a habit's optional reference photo. Adapted from the
// exercises MediaUploadDropzone (MP4 → image). Three layers of client-side
// validation gate the Server Action call:
//   1. Extension: filename ends with `.jpg`/`.jpeg`/`.png`/`.webp`.
//   2. MIME: `file.type` is one of image/jpeg | image/png | image/webp.
//   3. Size: `file.size <= 10 * 1024 * 1024` (matches the server-side cap).
//
// On a valid image, the dropzone POSTs the file to the GC Fitness upload
// route. The route owns authorization, canonical path construction, and the
// actual Cloud Storage write, so the browser no longer depends on bucket
// CORS or Storage client SDK auth state.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, ImageIcon, X, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — matches server cap.

// Allowed MIME → extension. The MIME is what we send to the server (which
// pins the signed URL to it) and as the PUT Content-Type header.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface HabitPhotoDropzoneProps {
  /** Habit doc id — `hab-${trainerUid}-${uuid}`. Required to mint the upload
   *  URL. In create mode the doc has no id yet, so the dropzone is disabled
   *  until after the first save. */
  habitId?: string;
  /** Current `photoUrl` value (gs://… , https://… , or null). */
  value: string | null | undefined;
  /** Called after the upload to Cloud Storage succeeds. Receives the gs:// path. */
  onUploaded: (gsPath: string) => void;
  /** Called when the trainer clicks "Remove" — clears `photoUrl`. */
  onRemoved: () => void;
  /** Disabled during create before an id exists. */
  disabled?: boolean;
  /** Optional hint shown when disabled because no `habitId` is set yet. */
  disabledHint?: string;
}

export function HabitPhotoDropzone({
  habitId,
  value,
  onUploaded,
  onRemoved,
  disabled,
  disabledHint,
}: HabitPhotoDropzoneProps) {
  const t = useTranslations("habits.form.photo");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0];

    const ext = ALLOWED_TYPES[file.type];
    const lower = file.name.toLowerCase();
    const extOk =
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp");
    if (!ext || !extOk) {
      const msg = t("rejectFormat");
      toast.error(msg);
      setError(msg);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      const msg = t("rejectSize");
      toast.error(msg);
      setError(msg);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (!habitId) {
      const msg = t("rejectNoId");
      toast.error(msg);
      setError(msg);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    void doUpload(file);
  }

  async function doUpload(file: File) {
    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.set("habitId", habitId!);
      formData.set("file", file);

      const response = await fetch("/api/gc-fitness/habits/photo", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }

      const payload = (await response.json()) as { gsPath?: string };
      if (!payload.gsPath) {
        throw new Error("Upload failed: missing storage path.");
      }
      setProgress(100);
      onUploaded(payload.gsPath);
      toast.success(t("successToast"));
    } catch (err) {
      console.error("[habit-photo-upload] failed", err);
      const msg = t("failToast");
      toast.error(msg);
      setError(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (disabled || uploading) return;
          inputRef.current?.click();
        }}
        className={cn(
          "flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/40 bg-muted/20 p-4 text-center transition-colors",
          !disabled && !uploading && "hover:bg-muted/40",
          (disabled || uploading) && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={t("inputAria")}
          data-testid="habit-photo-input"
          disabled={disabled || uploading}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploading ? (
          <>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">{t("uploadingLabel")}</span>
            <Progress value={progress} className="w-full max-w-xs" />
          </>
        ) : value ? (
          <>
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm break-all">{value}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onRemoved();
              }}
              className="gap-1"
            >
              <X className="h-3 w-3" />
              {t("removeCta")}
            </Button>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">{t("dropHint")}</span>
            <span className="text-xs text-muted-foreground">
              {t("dropSubHint")}
            </span>
          </>
        )}
      </div>

      {disabled && disabledHint && (
        <p className="mt-2 text-xs text-muted-foreground">{disabledHint}</p>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
