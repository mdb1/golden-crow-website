"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { formatClientActivityDate } from "@/lib/gc-fitness/client-activity-time";
import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import { FormSelect } from "@/components/gc-fitness/form-select";

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
        <FormSelect
          className="w-auto data-[size=default]:h-9"
          value={angle}
          onValueChange={(v) => setAngle(v as typeof angle)}
          options={[
            { value: "front", label: t("front") },
            { value: "side", label: t("side") },
            { value: "back", label: t("back") },
          ]}
        />
        <FormSelect
          className="w-auto data-[size=default]:h-9"
          aria-label={t("before")}
          value={beforeId}
          onValueChange={setBeforeId}
          placeholder={t("before")}
          options={[
            { value: "", label: t("before") },
            ...angled.map((photo) => ({
              value: photo.id,
              label: photo.checkInDate ?? dateLabel(photo, timezone),
            })),
          ]}
        />
        <FormSelect
          className="w-auto data-[size=default]:h-9"
          aria-label={t("after")}
          value={afterId}
          onValueChange={setAfterId}
          placeholder={t("after")}
          options={[
            { value: "", label: t("after") },
            ...angled.map((photo) => ({
              value: photo.id,
              label: photo.checkInDate ?? dateLabel(photo, timezone),
            })),
          ]}
        />
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
