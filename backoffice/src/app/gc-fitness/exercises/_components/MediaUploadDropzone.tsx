"use client";

// MediaUploadDropzone.tsx
//
// Single-file MP4 dropzone wrapping a styled <input type="file">. Three
// layers of client-side validation gate the Server Action call:
//   1. Extension: filename ends with `.mp4` (case-insensitive).
//   2. MIME: `file.type === 'video/mp4'`.
//   3. Size: `file.size <= 25 * 1024 * 1024` (UI-SPEC dropzone cap, stricter
//      than the 50 MB server-side cap — defense-in-depth + better UX).
//
// GIF rejection has a dedicated branch: extension `.gif` OR MIME `image/gif`
// triggers a toast + opens the GifConversionModal so the trainer sees the
// ffmpeg recipe immediately. UI-SPEC verbatim toast copy:
// "GIFs aren't supported. Please convert to MP4 first."
//
// On a valid MP4, the dropzone calls `mintExerciseMediaUploadUrl` with the
// exercise's id + content length, then `fetch(url, { method: 'PUT', ...})`
// to upload directly to Cloud Storage. The returned gs:// path lands in the
// form's `mediaURL` field via the `onUploaded` callback.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileVideo, X, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { mintExerciseMediaUploadUrl } from "@/lib/gc-fitness/exercise-server-actions";
import { GifConversionModal } from "./GifConversionModal";

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface MediaUploadDropzoneProps {
  /** The id under which the MP4 is stored at `exercises/{id}.mp4`. Required
   *  in edit mode (the doc already has an id). In create mode the caller
   *  defers the dropzone until after the first save returns an id. */
  exerciseId?: string;
  /** Current `mediaURL` value (gs://... or null). */
  value: string | null | undefined;
  /** Called after the PUT to Cloud Storage succeeds. Receives the gs:// path. */
  onUploaded: (gsPath: string) => void;
  /** Called when the trainer clicks "Remove" — clears `mediaURL`. */
  onRemoved: () => void;
  /** Disabled in view mode (read-only wger doc) + during create before id exists. */
  disabled?: boolean;
  /** Optional hint shown when disabled because no `exerciseId` is set yet. */
  disabledHint?: string;
}

export function MediaUploadDropzone({
  exerciseId,
  value,
  onUploaded,
  onRemoved,
  disabled,
  disabledHint,
}: MediaUploadDropzoneProps) {
  const t = useTranslations("exercises.mediaUpload");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gifModalOpen, setGifModalOpen] = useState(false);
  // Tracks the LAST rejected file so the "How to convert" affordance stays
  // visible (and discoverable) until the trainer either clicks it OR uploads
  // a valid MP4. Without this, T4 would race the React re-render against
  // userEvent — sometimes the affordance disappears before the test sees it.
  const [showHowToConvert, setShowHowToConvert] = useState(false);

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0];

    const lower = file.name.toLowerCase();
    const isGif = lower.endsWith(".gif") || file.type === "image/gif";
    if (isGif) {
      const msg = t("rejectGif");
      toast.error(msg);
      setError(msg);
      setShowHowToConvert(true);
      // Reset the input so re-selecting the same file fires onChange.
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (!lower.endsWith(".mp4")) {
      const msg = t("rejectFormat");
      toast.error(msg);
      setError(msg);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.type !== "video/mp4") {
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
    setShowHowToConvert(false);
    try {
      const { url, gsPath } = await mintExerciseMediaUploadUrl({
        exerciseId: exerciseId!,
        contentLength: file.size,
      });

      // We use `fetch(PUT)` instead of XHR — fetch in modern browsers doesn't
      // expose upload progress events for the request body (the
      // `ReadableStream` upload-progress proposal is still draft as of May
      // 2026). For v1 we surface an indeterminate `<Progress>` then jump to
      // 100% on success; XHR-based progress is deferred to a polish phase.
      const resp = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: file,
      });

      if (!resp.ok) {
        throw new Error(`Upload failed with status ${resp.status}`);
      }
      setProgress(100);
      onUploaded(gsPath);
      toast.success(t("successToast"));
    } catch (err) {
      console.error("[media-upload] failed", err);
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
        // Drag-and-drop wiring on the outer div. Click anywhere in the box
        // triggers the hidden <input type="file">; we mount the input inside
        // the same labeled region so RTL's `getByLabelText` finds it (T1
        // expects the dropzone to be reachable by the "Demonstration video"
        // form label).
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
          accept="video/mp4"
          aria-label={t("inputAria")}
          data-testid="media-upload-input"
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
            <FileVideo className="h-5 w-5 text-muted-foreground" />
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

      {showHowToConvert && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setGifModalOpen(true);
          }}
          className="mt-1 h-auto px-0 text-xs"
        >
          {t("howToConvert")}
        </Button>
      )}

      <GifConversionModal
        open={gifModalOpen}
        onOpenChange={setGifModalOpen}
      />
    </div>
  );
}
