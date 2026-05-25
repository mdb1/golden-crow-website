import { Camera } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import { ProgressPhotoCompare } from "./ProgressPhotoCompare";
import { ProgressPhotosGridClient } from "./ProgressPhotosGridClient";

export async function ProgressPhotosWidget({
  photos,
}: {
  photos: ProgressPhotoRow[];
}) {
  const t = await getTranslations("clients.detail.photos");
  return (
    <section id="progress-photos" className="rounded-md border bg-card p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Camera className="size-4" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {photos.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-4">
          <ProgressPhotoCompare photos={photos} />
          <ProgressPhotosGridClient photos={photos} />
        </div>
      )}
    </section>
  );
}
