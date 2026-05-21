import Image from "next/image";
import { Camera } from "lucide-react";

import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import { ProgressPhotoCompare } from "./ProgressPhotoCompare";

export function ProgressPhotosWidget({
  photos,
}: {
  photos: ProgressPhotoRow[];
}) {
  return (
    <section id="progress-photos" className="rounded-md border bg-card p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Camera className="size-4" />
          Progress photos
        </h2>
        <p className="text-sm text-muted-foreground">
          Client-uploaded check-in photos.
        </p>
      </div>

      {photos.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          No progress photos yet.
        </div>
      ) : (
        <div className="space-y-4">
          <ProgressPhotoCompare photos={photos} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {photos.map((photo) => (
              <figure key={photo.id} className="overflow-hidden rounded-md border">
                <div className="relative aspect-[3/4] bg-muted">
                  {photo.url ? (
                    <Image
                      src={photo.url}
                      alt={photo.caption || "Progress photo"}
                      fill
                      sizes="(min-width: 1024px) 260px, 45vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                      Image unavailable
                    </div>
                  )}
                </div>
                <figcaption className="space-y-1 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase text-primary">
                      {photo.angle ?? "photo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {photo.checkInDate ??
                        (photo.takenAt || photo.createdAt
                          ? new Date(photo.takenAt ?? photo.createdAt ?? "").toLocaleDateString()
                          : "No date")}
                    </p>
                  </div>
                  {photo.caption ? (
                    <p className="line-clamp-2 text-sm">{photo.caption}</p>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
