import { Camera } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import { ProgressPhotosGridClient } from "./ProgressPhotosGridClient";
import { Button } from "@/components/ui/button";

export async function ProgressPhotosWidget({
  photos,
  clientId,
}: {
  photos: ProgressPhotoRow[];
  clientId: string;
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
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`/gc-fitness/clients/${clientId}/compare-photos${buildDefaultCompareQuery(photos)}`}>
                Abrir comparador
              </Link>
            </Button>
          </div>
          <ProgressPhotosGridClient photos={photos} />
        </div>
      )}
    </section>
  );
}

function buildDefaultCompareQuery(photos: ProgressPhotoRow[]): string {
  const front = photos.filter((p) => (p.angle ?? "front") === "front" && p.url);
  if (front.length === 0) return "?angle=front";
  const after = front[0];
  const before = front[1] ?? front[0];
  return `?angle=front&before=${encodeURIComponent(before.id)}&after=${encodeURIComponent(after.id)}`;
}
