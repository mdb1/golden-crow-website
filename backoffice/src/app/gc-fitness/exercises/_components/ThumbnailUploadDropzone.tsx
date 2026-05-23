"use client";

// ThumbnailUploadDropzone.tsx
//
// Single-file image dropzone for exercise thumbnails. Modeled on
// MediaUploadDropzone (video), but tuned for static images:
//   1. Extension allowlist: .jpg / .jpeg / .png / .webp / .gif (case-insensitive).
//   2. MIME allowlist: image/jpeg | image/png | image/webp | image/gif.
//   3. Size: `file.size <= 5 * 1024 * 1024` (mirrors the server-side cap
//      enforced by `mintExerciseThumbnailUploadUrl`).
//
// Unlike the video dropzone, GIFs are VALID here — thumbnails commonly
// come from animated preview sources (giphy, etc.), so we accept them
// without rejection or conversion affordance.
//
// On a valid image, the dropzone calls `mintExerciseThumbnailUploadUrl`
// with the exercise's id + content length + content type, then
// `fetch(url, { method: 'PUT', ... })` to upload directly to Cloud
// Storage with a matching `Content-Type` header (the signed URL is
// pinned to that exact content type — drift fails the PUT). The
// returned gs:// path lands in the form's `thumbnailURL` field via the
// `onUploaded` callback.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Image as ImageIcon, X, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { mintExerciseThumbnailUploadUrl } from "@/lib/gc-fitness/exercise-server-actions";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface ThumbnailUploadDropzoneProps {
  /** The id under which the thumbnail is stored at
   *  `exercises/{id}-thumb.{ext}`. Required in edit mode (the doc already
   *  has an id). In create mode the caller defers the dropzone until
   *  after the first save returns an id. */
  exerciseId?: string;
  /** Current `thumbnailURL` value (gs://... or https://... or null). */
  value: string | null | undefined;
  /** Called after the PUT to Cloud Storage succeeds. Receives the gs:// path. */
  onUploaded: (gsPath: string) => void;
  /** Called when the trainer clicks "Remove" — clears `thumbnailURL`. */
  onRemoved: () => void;
  /** Disabled in view mode (read-only wger doc) + during create before id exists. */
  disabled?: boolean;
  /** Optional hint shown when disabled because no `exerciseId` is set yet. */
  disabledHint?: string;
}

export function ThumbnailUploadDropzone({
  exerciseId,
  value,
  onUploaded,
  onRemoved,
  disabled,
  disabledHint,
}: ThumbnailUploadDropzoneProps) {
  const t = useTranslations("exercises.thumbnailUpload");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0];

    const lower = file.name.toLowerCase();
    const extMatch = lower.match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : "";
    const hasAllowedExt = (ALLOWED_EXTENSIONS as readonly string[]).includes(
      ext,
    );

    if (!hasAllowedExt) {
      const msg = t("rejectFormat");
      toast.error(msg);
      setError(msg);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
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

    if (!exerciseId) {
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
      const { url, gsPath } = await mintExerciseThumbnailUploadUrl({
        exerciseId: exerciseId!,
        contentLength: file.size,
        contentType: file.type,
      });

      // See MediaUploadDropzone for the rationale on fetch(PUT) instead of
      // XHR-based progress: indeterminate progress for v1, real progress
      // bar deferred to a polish phase.
      const resp = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!resp.ok) {
        throw new Error(`Upload failed with status ${resp.status}`);
      }
      setProgress(100);
      onUploaded(gsPath);
      toast.success(t("successToast"));
    } catch (err) {
      console.error("[thumbnail-upload] failed", err);
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
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-label={t("inputAria")}
          data-testid="thumbnail-upload-input"
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
            <span className="text-xs text-muted-foreground">{t("dropSubHint")}</span>
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
