"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { formatClientActivityDate } from "@/lib/gc-fitness/client-activity-time";
import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";

export function ProgressPhotoCompare({
  photos,
  timezone,
}: {
  photos: ProgressPhotoRow[];
  timezone: string;
}) {
  const t = useTranslations("clients.detail.photoCompare");
  const tPhotos = useTranslations("clients.detail.photos");
  const [angle, setAngle] = useState<"front" | "side" | "back">("front");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [split, setSplit] = useState(50);

  const angled = useMemo(
    () => photos.filter((photo) => (photo.angle ?? "front") === angle && photo.url),
    [angle, photos],
  );
  const before = angled.find((photo) => photo.id === beforeId);
  const after = angled.find((photo) => photo.id === afterId);
  const safeSplit = Math.min(99, Math.max(1, split));

  if (photos.length < 2) return null;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={angle}
          onChange={(event) => setAngle(event.target.value as typeof angle)}
        >
          <option value="front">{t("front")}</option>
          <option value="side">{t("side")}</option>
          <option value="back">{t("back")}</option>
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={beforeId}
          onChange={(event) => setBeforeId(event.target.value)}
        >
          <option value="">{t("before")}</option>
          {angled.map((photo) => (
            <option key={photo.id} value={photo.id}>
              {photo.checkInDate ?? dateLabel(photo, timezone)}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={afterId}
          onChange={(event) => setAfterId(event.target.value)}
        >
          <option value="">{t("after")}</option>
          {angled.map((photo) => (
            <option key={photo.id} value={photo.id}>
              {photo.checkInDate ?? dateLabel(photo, timezone)}
            </option>
          ))}
        </select>
      </div>

      {before?.url && after?.url ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <CompareImage photo={before} alt={tPhotos("photoAlt")} />
            <CompareImage photo={after} alt={tPhotos("photoAlt")} />
          </div>
          <div className="relative mx-auto aspect-[3/4] max-h-[520px] overflow-hidden rounded-md border bg-muted">
            <Image src={after.url} alt={t("afterAlt")} fill sizes="(min-width: 1024px) 420px, 90vw" className="object-cover" />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - safeSplit}% 0 0)` }}
            >
              <Image src={before.url} alt={t("beforeAlt")} fill sizes="(min-width: 1024px) 420px, 90vw" className="object-cover" />
            </div>
            <div
              className="absolute inset-y-0 w-0.5 bg-primary shadow-sm"
              style={{ left: `${safeSplit}%`, transform: "translateX(-50%)" }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(event) => setSplit(Number(event.target.value))}
            className="w-full"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("selectTwo", { angle: t(angle) })}
        </p>
      )}
    </div>
  );
}

function CompareImage({ photo, alt }: { photo: ProgressPhotoRow; alt: string }) {
  if (!photo.url) return null;
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
      <Image src={photo.url} alt={photo.caption ?? alt} fill sizes="(min-width: 1024px) 260px, 45vw" className="object-cover" />
    </div>
  );
}

function dateLabel(photo: ProgressPhotoRow, timezone: string): string {
  const value = photo.takenAt ?? photo.createdAt;
  return value ? formatClientActivityDate(value, timezone) : photo.id;
}
