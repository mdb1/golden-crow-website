"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { GOLDENCROW_LOGO_DATA_URI } from "@/components/gc-fitness/goldencrow-logo-data";
import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import {
  formatClientActivityFullDate,
} from "@/lib/gc-fitness/client-activity-time";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";

type Angle = "front" | "side" | "back";
type Transform = { scale: number; x: number; y: number };
type CompareMode = "side-by-side" | "slider";

export function ProgressPhotoCompareEditor({
  photos,
  timezone,
  clientName,
}: {
  photos: ProgressPhotoRow[];
  timezone: string;
  clientName: string;
}) {
  const params = useSearchParams();
  const locale = useLocale();
  const initialAngle = (params.get("angle") as Angle) || "front";
  const [angle, setAngle] = useState<Angle>(initialAngle);
  const angled = useMemo(() => photos.filter((p) => (p.angle ?? "front") === angle && p.url), [photos, angle]);

  const defaultBefore = params.get("before") ?? angled[1]?.id ?? angled[angled.length - 1]?.id ?? "";
  const defaultAfter = params.get("after") ?? angled[0]?.id ?? "";
  const [beforeId, setBeforeId] = useState(defaultBefore);
  const [afterId, setAfterId] = useState(defaultAfter);
  const [split, setSplit] = useState(50);
  const [mode, setMode] = useState<CompareMode>("slider");
  const [beforeT, setBeforeT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [afterT, setAfterT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const dragging = useRef<null | "before" | "after">(null);
  const dragOrigin = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const sliderContainerRef = useRef<HTMLDivElement | null>(null);

  const before = angled.find((p) => p.id === beforeId);
  const after = angled.find((p) => p.id === afterId);
  const downloadFileName = before && after
    ? buildCompareDownloadName({
        clientName,
        angle,
        variant: mode === "slider" ? "slider" : "compare",
        before,
        after,
        timezone,
        locale,
      })
    : "compare.jpg";

  function defaultsForAngle(nextAngle: Angle): { before: string; after: string } {
    const next = photos.filter((p) => (p.angle ?? "front") === nextAngle && p.url);
    const afterDefault = next[0]?.id ?? "";
    const beforeDefault = next[1]?.id ?? next[0]?.id ?? "";
    return { before: beforeDefault, after: afterDefault };
  }

  function onDragStart(kind: "before" | "after", e: React.PointerEvent<HTMLDivElement>) {
    const t = kind === "before" ? beforeT : afterT;
    dragging.current = kind;
    dragOrigin.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const dx = e.clientX - dragOrigin.current.x;
    const dy = e.clientY - dragOrigin.current.y;
    if (dragging.current === "before") setBeforeT((t) => ({ ...t, x: dragOrigin.current.ox + dx, y: dragOrigin.current.oy + dy }));
    if (dragging.current === "after") setAfterT((t) => ({ ...t, x: dragOrigin.current.ox + dx, y: dragOrigin.current.oy + dy }));
  }
  function onDragEnd() {
    dragging.current = null;
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="h-10 rounded-md border px-2"
          value={angle}
          onChange={(e) => {
            const nextAngle = e.target.value as Angle;
            const defaults = defaultsForAngle(nextAngle);
            setAngle(nextAngle);
            setBeforeId(defaults.before);
            setAfterId(defaults.after);
          }}
        >
          <option value="front">Front</option><option value="side">Side</option><option value="back">Back</option>
        </select>
        <select className="h-10 rounded-md border px-2" value={beforeId} onChange={(e) => setBeforeId(e.target.value)}>
          <option value="">Before</option>{angled.map((p) => <option key={p.id} value={p.id}>{photoDisplayDate(p, timezone, locale)}</option>)}
        </select>
        <select className="h-10 rounded-md border px-2" value={afterId} onChange={(e) => setAfterId(e.target.value)}>
          <option value="">After</option>{angled.map((p) => <option key={p.id} value={p.id}>{photoDisplayDate(p, timezone, locale)}</option>)}
        </select>
      </div>
      {before?.url && after?.url ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid w-full max-w-sm grid-cols-2 gap-2 rounded-lg border p-1 sm:w-auto">
              <button
                className={`rounded-md px-3 py-1.5 text-sm ${mode === "slider" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setMode("slider")}
              >
                Deslizador
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-sm ${mode === "side-by-side" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setMode("side-by-side")}
              >
                Lado a lado
              </button>
            </div>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              onClick={async () => {
                try {
                  if (mode === "slider") {
                    const rect = sliderContainerRef.current?.getBoundingClientRect();
                    if (!rect) throw new Error("Slider container not mounted");
                    await exportSliderSnapshotJpg({
                      before,
                      after,
                      downloadFileName,
                      split,
                      beforeT,
                      afterT,
                      cssWidth: rect.width,
                      cssHeight: rect.height,
                      timezone,
                      locale,
                    });
                  } else {
                    await exportSideBySideJpg({
                      before,
                      after,
                      downloadFileName,
                      timezone,
                      locale,
                    });
                  }
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.error("[compare-photos] export failed:", err);
                  alert(
                    `No se pudo descargar el JPG: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  );
                }
              }}
            >
              Descargar JPG
            </button>
          </div>
          {mode === "slider" ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <AdjustCard title="Before" t={beforeT} onScale={(v) => setBeforeT((x) => ({ ...x, scale: v }))} onReset={() => setBeforeT({ scale: 1, x: 0, y: 0 })} />
                <AdjustCard title="After" t={afterT} onScale={(v) => setAfterT((x) => ({ ...x, scale: v }))} onReset={() => setAfterT({ scale: 1, x: 0, y: 0 })} />
              </div>
              <div ref={sliderContainerRef} className="relative mx-auto h-[calc(100vh-22rem)] min-h-[420px] w-full max-w-[1200px] overflow-hidden rounded-md border bg-muted">
                <MovableImage url={after.url} alt="after" t={afterT} onDragStart={(e) => onDragStart("after", e)} onDragMove={onDragMove} onDragEnd={onDragEnd} />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                  <MovableImage url={before.url} alt="before" t={beforeT} onDragStart={(e) => onDragStart("before", e)} onDragMove={onDragMove} onDragEnd={onDragEnd} />
                </div>
                <div className="absolute inset-y-0 w-1 bg-primary" style={{ left: `${split}%` }} />
              </div>
              <input type="range" min={1} max={99} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full" />
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <CompareStaticImage
                  url={before.url}
                  alt="before"
                  date={photoDisplayDate(before, timezone, locale)}
                />
                <CompareStaticImage
                  url={after.url}
                  alt="after"
                  date={photoDisplayDate(after, timezone, locale)}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Seleccioná fotos para comparar.</p>
      )}
    </section>
  );
}

function CompareStaticImage({ url, alt, date }: { url: string; alt: string; date: string }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-black bg-black">
      <Image src={url} alt={alt} fill sizes="(min-width: 1024px) 48vw, 100vw" className="object-contain" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/90 px-3 py-2 text-xs text-white">
        <span className="font-medium uppercase">{alt}</span>
        <span>{date}</span>
      </div>
    </div>
  );
}

function photoDisplayDate(photo: ProgressPhotoRow, timezone: string, locale: string): string {
  if (photo.checkInDate) {
    return formatCivilDateLabel(
      photo.checkInDate,
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      },
      locale,
    );
  }

  const source = photo.takenAt ?? photo.createdAt;
  return source ? formatClientActivityFullDate(source, timezone, locale) : photo.id;
}

function photoExportDate(photo: ProgressPhotoRow, timezone: string, locale: string): string {
  if (photo.checkInDate) {
    return formatFilenameFriendlyDate(photo.checkInDate, "UTC", locale);
  }

  const source = photo.takenAt ?? photo.createdAt;
  return source ? formatFilenameFriendlyDate(source, timezone, locale) : photo.id;
}

async function exportSideBySideJpg({
  before,
  after,
  downloadFileName,
  timezone,
  locale,
}: {
  before: ProgressPhotoRow;
  after: ProgressPhotoRow;
  downloadFileName: string;
  timezone: string;
  locale: string;
}) {
  if (!before.url || !after.url) return;

  const [beforeImg, afterImg] = await Promise.all([
    loadImageViaProxy(before.id),
    loadImageViaProxy(after.id),
  ]);
  const logoImg = await loadInlineImage(GOLDENCROW_LOGO_DATA_URI);

  const outerMargin = 8;
  const panelWidth = 1320;
  const panelHeight = 1700;
  const gap = 8;
  const footerHeight = 96;
  const cornerRadius = 40;
  const canvas = document.createElement("canvas");
  canvas.width = panelWidth * 2 + gap * 3 + outerMargin * 2;
  canvas.height = panelHeight + gap * 2 + outerMargin * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPanel({
    ctx,
    img: beforeImg,
    x: outerMargin + gap,
    y: outerMargin + gap,
    width: panelWidth,
    height: panelHeight,
    label: photoDisplayDate(before, timezone, locale),
    title: "Before",
    footerHeight,
    radius: cornerRadius,
    logoImg,
    showLogo: false,
  });

  drawPanel({
    ctx,
    img: afterImg,
    x: outerMargin + panelWidth + gap * 2,
    y: outerMargin + gap,
    width: panelWidth,
    height: panelHeight,
    label: photoDisplayDate(after, timezone, locale),
    title: "After",
    footerHeight,
    radius: cornerRadius,
    logoImg,
    showLogo: true,
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadFileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Exports the current slider snapshot: after image as the base, before image
// clipped to the left of the divider, vertical divider at `split%`, and the
// user's pan/zoom transforms preserved. `cssWidth`/`cssHeight` are the
// on-screen container dimensions (from getBoundingClientRect) so we can scale
// the CSS-pixel transforms (`beforeT.x` / `afterT.x`) into canvas pixels.
async function exportSliderSnapshotJpg({
  before,
  after,
  split,
  beforeT,
  afterT,
  downloadFileName,
  cssWidth,
  cssHeight,
  timezone,
  locale,
}: {
  before: ProgressPhotoRow;
  after: ProgressPhotoRow;
  split: number;
  beforeT: Transform;
  afterT: Transform;
  downloadFileName: string;
  cssWidth: number;
  cssHeight: number;
  timezone: string;
  locale: string;
}) {
  if (!before.url || !after.url) return;
  if (cssWidth <= 0 || cssHeight <= 0) throw new Error("Empty slider bounds");

  const [beforeImg, afterImg] = await Promise.all([
    loadImageViaProxy(before.id),
    loadImageViaProxy(after.id),
  ]);
  const logoImg = await loadInlineImage(GOLDENCROW_LOGO_DATA_URI);

  const outerMargin = 16;
  const labelHeight = 160;
  const cornerRadius = 40;
  const gap = 12;
  const targetPanelWidth = 1080;
  const targetPanelHeight = 1440;
  const dividerWidth = 4;
  const scaleRatio = targetPanelWidth / cssWidth;

  const canvas = document.createElement("canvas");
  canvas.width = targetPanelWidth + outerMargin * 2;
  canvas.height = targetPanelHeight + outerMargin * 2 + labelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelX = outerMargin;
  const panelY = outerMargin;
  const panelW = targetPanelWidth;
  const panelH = targetPanelHeight;

  ctx.save();
  roundedRectPath(ctx, panelX, panelY, panelW, panelH, cornerRadius);
  ctx.clip();
  ctx.fillStyle = "#1f1f1f";
  ctx.fillRect(panelX, panelY, panelW, panelH);

  // After image (base, full width).
  drawContainedWithTransform({
    ctx,
    img: afterImg,
    panelX,
    panelY,
    panelW,
    panelH,
    t: afterT,
    scaleRatio,
  });

  // Before image clipped to the left `split%` of the panel.
  const splitPx = (panelW * split) / 100;
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, panelY, splitPx, panelH);
  ctx.clip();
  drawContainedWithTransform({
    ctx,
    img: beforeImg,
    panelX,
    panelY,
    panelW,
    panelH,
    t: beforeT,
    scaleRatio,
  });
  ctx.restore();

  // Divider line.
  ctx.fillStyle = "#facc15";
  ctx.fillRect(panelX + splitPx - dividerWidth / 2, panelY, dividerWidth, panelH);

  ctx.restore();

  // Bottom labels sit in the black footer so they wrap to two lines and do
  // not clash with the photo crop.
  const beforeLabel = photoDisplayDate(before, timezone, locale);
  const afterLabel = photoDisplayDate(after, timezone, locale);
  const afterEdgeX = panelX + panelW - 20;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px system-ui, -apple-system, sans-serif";
  const labelY = panelY + panelH + 30;
  ctx.textAlign = "left";
  ctx.fillText("Before", panelX, labelY);
  ctx.font = "500 26px system-ui, -apple-system, sans-serif";
  ctx.fillText(beforeLabel, panelX, labelY + 32);
  ctx.textAlign = "right";
  ctx.font = "700 40px system-ui, -apple-system, sans-serif";
  ctx.fillText("After", afterEdgeX, labelY);
  ctx.font = "500 26px system-ui, -apple-system, sans-serif";
  ctx.fillText(afterLabel, afterEdgeX, labelY + 32);

  drawWatermarkLogo(ctx, logoImg, canvas.width, canvas.height, "center");

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadFileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Mirrors the CSS `object-contain` + `transform: translate(x,y) scale(s)` of
// MovableImage on the canvas. Translates are in on-screen CSS pixels and get
// multiplied by `scaleRatio` to land in canvas pixels.
function drawContainedWithTransform({
  ctx,
  img,
  panelX,
  panelY,
  panelW,
  panelH,
  t,
  scaleRatio,
}: {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
  t: Transform;
  scaleRatio: number;
}) {
  const baseScale = Math.min(panelW / img.naturalWidth, panelH / img.naturalHeight);
  const baseW = img.naturalWidth * baseScale;
  const baseH = img.naturalHeight * baseScale;
  const centerX = panelX + panelW / 2 + t.x * scaleRatio;
  const centerY = panelY + panelH / 2 + t.y * scaleRatio;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
  ctx.restore();
}

function drawPanel({
  ctx,
  img,
  logoImg,
  showLogo,
  x,
  y,
  width,
  height,
  label,
  title,
  footerHeight,
  radius,
}: {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  logoImg: HTMLImageElement;
  showLogo: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  title: string;
  footerHeight: number;
  radius: number;
}) {
  const framePadding = 20;
  const contentX = x + framePadding;
  const contentY = y + framePadding;
  const contentWidth = width - framePadding * 2;
  const contentHeight = height - framePadding * 2 - footerHeight;

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.clip();
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, width, height);

  const scale = Math.min(contentWidth / img.naturalWidth, contentHeight / img.naturalHeight);
  const drawWidth = img.naturalWidth * scale;
  const drawHeight = img.naturalHeight * scale;
  const drawX = contentX + (contentWidth - drawWidth) / 2;
  const drawY = contentY + (contentHeight - drawHeight) / 2;

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 60px system-ui, -apple-system, sans-serif";
  const footerTop = height - footerHeight + 42;
  ctx.fillText(title, x + framePadding, footerTop);
  ctx.font = "500 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(label, x + framePadding, footerTop + 34);

  if (showLogo) {
    const logoSize = 160;
    const logoMargin = 18;
    const logoX = x + width - framePadding - logoSize;
    const logoY = y + height - footerHeight + footerHeight - logoMargin - logoSize;
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  }
  ctx.restore();
}

function drawWatermarkLogo(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  placement: "corner" | "center" = "corner",
) {
  const size = placement === "corner" ? 170 : 154;
  const margin = placement === "corner" ? 24 : 32;

  ctx.save();
  ctx.globalAlpha = 0.92;
  if (placement === "center") {
    ctx.drawImage(
      logoImg,
      canvasWidth / 2 - size / 2,
      canvasHeight - margin - size,
      size,
      size,
    );
  } else {
    ctx.drawImage(logoImg, canvasWidth - margin - size, canvasHeight - margin - size, size, size);
  }
  ctx.restore();
}

async function loadInlineImage(src: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode inline image"));
    });
  }
  return img;
}

function buildCompareDownloadName({
  clientName,
  angle,
  variant,
  before,
  after,
  timezone,
  locale,
}: {
  clientName: string;
  angle: Angle;
  variant: "slider" | "compare";
  before: ProgressPhotoRow;
  after: ProgressPhotoRow;
  timezone: string;
  locale: string;
}): string {
  const clientSlug = slugifyFilePart(clientName, "alumno");
  const beforeLabel = photoExportDate(before, timezone, locale);
  const afterLabel = photoExportDate(after, timezone, locale);
  return `${variant}-${clientSlug}-${angle}-${beforeLabel}-vs${afterLabel}.jpg`;
}

function formatFilenameFriendlyDate(isoOrCivil: string, timezone: string, locale: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrCivil)) {
    const [yearText, monthText, dayText] = isoOrCivil.split("-");
    const year = Number.parseInt(yearText ?? "", 10);
    const month = Number.parseInt(monthText ?? "", 10);
    const day = Number.parseInt(dayText ?? "", 10);
    if (!year || !month || !day) return "sin-fecha";
    return formatFriendlyDateLabel(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)), "UTC", locale);
  }

  const date = new Date(isoOrCivil);
  if (Number.isNaN(date.getTime())) return "sin-fecha";
  return formatFriendlyDateLabel(date, timezone, locale);
}

function formatFriendlyDateLabel(date: Date, timezone: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, { day: "2-digit", timeZone: timezone }).format(date);
  const year = new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: timezone }).format(date);
  let month = new Intl.DateTimeFormat(locale, { month: "long", timeZone: timezone }).format(date);
  month = month.charAt(0).toLocaleUpperCase(locale) + month.slice(1);
  return `${day}-${month}-${year}`;
}

function slugifyFilePart(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

// Fetches a progress photo through the same-origin proxy endpoint so the
// canvas exporter avoids GCS-signed-URL CORS issues that taint the canvas
// and make `toBlob` return null.
async function loadImageViaProxy(photoId: string): Promise<HTMLImageElement> {
  const res = await fetch(
    `/api/gc-fitness/photo-proxy?photoId=${encodeURIComponent(photoId)}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) {
    throw new Error(`Photo proxy failed (${res.status}) for ${photoId}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to decode image: ${photoId}`));
      img.src = objectUrl;
    });
  } finally {
    // Defer revoke so the image can stay decoded long enough for the canvas
    // draw to read pixels. 60s is generous; the export typically finishes in <1s.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

function MovableImage({ url, alt, t, onDragStart, onDragMove, onDragEnd }: { url: string; alt: string; t: Transform; onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void; onDragMove: (e: React.PointerEvent<HTMLDivElement>) => void; onDragEnd: () => void; }) {
  return (
    <div className="absolute inset-0 cursor-move touch-none" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
      <Image src={url} alt={alt} fill sizes="100vw" className="object-contain select-none" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: "center center" }} draggable={false} />
    </div>
  );
}

function AdjustCard({ title, t, onScale, onReset }: { title: string; t: Transform; onScale: (v: number) => void; onReset: () => void; }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <p className="mb-2 font-medium">{title}</p>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Zoom ({t.scale.toFixed(2)}x)</label>
        <input type="range" min={0.8} max={2.5} step={0.01} value={t.scale} onChange={(e) => onScale(Number(e.target.value))} className="w-full" />
      </div>
      <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={onReset}>Reset</button>
    </div>
  );
}
