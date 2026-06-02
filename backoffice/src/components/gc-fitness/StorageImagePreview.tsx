"use client";

// StorageImagePreview.tsx
//
// Renders an <img> preview for a stored reference image whose value may be
// EITHER an already-resolvable `https://` URL or a `gs://` Cloud Storage path
// (the shape the upload dropzones persist — see HabitPhotoDropzone /
// ThumbnailUploadDropzone). `gs://` paths are resolved to a download URL via
// the Firebase Storage Web SDK (`getDownloadURL`) once, on the client.
//
// Why resolve here (and not in the table columns / picker rows): those render
// MANY rows, so per-row `getDownloadURL` round-trips are too costly — they
// intentionally preview only already-https URLs. An editor dropzone shows a
// SINGLE image, so the one-shot resolve is cheap and gives the trainer the
// preview they expect instead of a raw `gs://…` string.
//
// While a `gs://` path resolves we show a spinner; on failure we fall back to
// the raw path text so the trainer still sees *something* actionable.

import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { ImageIcon, Loader2 } from "lucide-react";

import { getGCFitnessStorage } from "@/lib/firebase/gc-fitness-client";
import { cn } from "@/lib/utils";

export interface StorageImagePreviewProps {
  /** `https://…` URL or `gs://…` Storage path. */
  value: string;
  /** Accessible alt text. Defaults to empty (decorative). */
  alt?: string;
  className?: string;
}

export function StorageImagePreview({
  value,
  alt = "",
  className,
}: StorageImagePreviewProps) {
  const [resolved, setResolved] = useState<string | null>(
    value.startsWith("https://") ? value : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    if (value.startsWith("https://")) {
      setResolved(value);
      return;
    }
    if (value.startsWith("gs://")) {
      setResolved(null);
      getDownloadURL(ref(getGCFitnessStorage(), value))
        .then((url) => {
          if (active) setResolved(url);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else {
      // Unknown shape — show nothing resolvable, fall back to raw text.
      setResolved(null);
      setFailed(true);
    }

    return () => {
      active = false;
    };
  }, [value]);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-1 text-muted-foreground">
        <ImageIcon className="h-5 w-5" />
        <span className="text-xs break-all">{value}</span>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      className={cn(
        "max-h-40 w-auto rounded-md border border-border bg-muted/40 object-contain",
        className,
      )}
    />
  );
}
