"use client";

// StorageImagePreview.tsx
//
// Renders an <img> preview for a stored reference image whose value may be
// EITHER an already-resolvable `https://` URL or a `gs://` Cloud Storage path
// (the shape the upload dropzones persist — see HabitPhotoDropzone /
// ThumbnailUploadDropzone).
//
// `gs://` paths CANNOT be resolved with the Firebase JS client SDK here:
// trainers authenticate with next-firebase-auth-edge cookies, not the client
// Auth SDK, so `getDownloadURL` on a protected object fails and we'd be stuck
// showing the raw `gs://…` string (the reported bug). Instead we stream the
// bytes through the trainer-authenticated `/api/gc-fitness/storage-image`
// route, which resolves the object server-side via the Admin SDK.
//
// On error we fall back to the raw path text so the trainer still sees
// something actionable.

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StorageImagePreviewProps {
  /** `https://…` URL or `gs://…` Storage path. */
  value: string;
  /** Accessible alt text. Defaults to empty (decorative). */
  alt?: string;
  className?: string;
}

function previewSrc(value: string): string {
  if (value.startsWith("https://")) return value;
  // gs:// path (or a bare object path) → resolve server-side.
  return `/api/gc-fitness/storage-image?path=${encodeURIComponent(value)}`;
}

export function StorageImagePreview({
  value,
  alt = "",
  className,
}: StorageImagePreviewProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-1 text-muted-foreground">
        <ImageIcon className="h-5 w-5" />
        <span className="text-xs break-all">{value}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={previewSrc(value)}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn(
        "max-h-40 w-auto rounded-xl border border-border bg-muted/40 object-contain",
        className,
      )}
    />
  );
}
