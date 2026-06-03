"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import { formatClientActivityDate } from "@/lib/gc-fitness/client-activity-time";

const PAGE_GROUPS = 3;
const ANGLE_ORDER: Record<string, number> = { front: 0, side: 1, back: 2 };

export function ProgressPhotosGridClient({
  photos,
  timezone,
}: {
  photos: ProgressPhotoRow[];
  timezone: string;
}) {
  const t = useTranslations("clients.detail.photos");
  const tCommon = useTranslations("common");
  const [visibleGroups, setVisibleGroups] = useState(PAGE_GROUPS);

  const grouped = useMemo(() => {
    const map = new Map<string, ProgressPhotoRow[]>();
    for (const photo of photos) {
      const key = photo.checkInDate ?? dateKey(photo, timezone);
      const list = map.get(key) ?? [];
      list.push(photo);
      map.set(key, list);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([groupKey, rows]) => ({
        groupKey,
        rows: rows.sort((a, b) => {
          const angleA = (a.angle ?? "front").toLowerCase();
          const angleB = (b.angle ?? "front").toLowerCase();
          return (ANGLE_ORDER[angleA] ?? 99) - (ANGLE_ORDER[angleB] ?? 99);
        }),
      }));
  }, [photos, timezone]);

  const visible = grouped.slice(0, visibleGroups);
  const hasMore = visibleGroups < grouped.length;

  return (
    <div className="space-y-4">
      {visible.map((group) => (
        <div key={group.groupKey} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {group.rows.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-md border">
              <div className="relative aspect-[3/4] bg-muted">
                {photo.url ? (
                  <Image
                    src={photo.url}
                    alt={photo.caption || t("photoAlt")}
                    fill
                    sizes="(min-width: 1024px) 260px, 45vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                    {t("imageUnavailable")}
                  </div>
                )}
              </div>
              <figcaption className="space-y-1 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-primary">
                    {photo.angle ?? t("photoFallback")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {photo.checkInDate
                      ? photo.checkInDate
                      : photo.takenAt || photo.createdAt
                        ? formatClientActivityDate(photo.takenAt ?? photo.createdAt ?? null, timezone)
                        : tCommon("noDate")}
                  </p>
                </div>
                {photo.caption ? <p className="line-clamp-2 text-sm">{photo.caption}</p> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ))}

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setVisibleGroups((v) => v + PAGE_GROUPS)}>
            Cargar más
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function dateKey(photo: ProgressPhotoRow, timezone: string): string {
  const source = photo.takenAt ?? photo.createdAt;
  if (!source) return "0000-00-00";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "0000-00-00";
  return civilDateFormat(date, timezone);
}
