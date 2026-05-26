"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";

type Angle = "front" | "side" | "back";
type Transform = { scale: number; x: number; y: number };
type CompareMode = "side-by-side" | "slider";

export function ProgressPhotoCompareEditor({ photos }: { photos: ProgressPhotoRow[] }) {
  const params = useSearchParams();
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

  const before = angled.find((p) => p.id === beforeId);
  const after = angled.find((p) => p.id === afterId);

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
          <option value="">Before</option>{angled.map((p) => <option key={p.id} value={p.id}>{p.checkInDate ?? p.id}</option>)}
        </select>
        <select className="h-10 rounded-md border px-2" value={afterId} onChange={(e) => setAfterId(e.target.value)}>
          <option value="">After</option>{angled.map((p) => <option key={p.id} value={p.id}>{p.checkInDate ?? p.id}</option>)}
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
                  await exportSideBySideJpg({ before, after });
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
              <div className="relative mx-auto h-[calc(100vh-22rem)] min-h-[420px] w-full max-w-[1200px] overflow-hidden rounded-md border bg-muted">
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
                <CompareStaticImage url={before.url} alt="before" date={before.checkInDate ?? dateFromRow(before)} />
                <CompareStaticImage url={after.url} alt="after" date={after.checkInDate ?? dateFromRow(after)} />
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

function dateFromRow(photo: ProgressPhotoRow): string {
  const source = photo.takenAt ?? photo.createdAt;
  return source ? new Date(source).toLocaleDateString() : photo.id;
}

async function exportSideBySideJpg({
  before,
  after,
}: {
  before: ProgressPhotoRow;
  after: ProgressPhotoRow;
}) {
  if (!before.url || !after.url) return;

  const [beforeImg, afterImg] = await Promise.all([
    loadImageViaProxy(before.id),
    loadImageViaProxy(after.id),
  ]);

  const outerMargin = 96;
  const panelWidth = 1320;
  const panelHeight = 1760;
  const gap = 56;
  const labelHeight = 140;
  const cornerRadius = 42;
  const canvas = document.createElement("canvas");
  canvas.width = panelWidth * 2 + gap * 3 + outerMargin * 2;
  canvas.height = panelHeight + gap * 2 + outerMargin * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPanel({
    ctx,
    img: beforeImg,
    x: outerMargin + gap,
    y: outerMargin + gap,
    width: panelWidth,
    height: panelHeight,
    label: before.checkInDate ?? dateFromRow(before),
    title: "Before",
    labelHeight,
    radius: cornerRadius,
  });

  drawPanel({
    ctx,
    img: afterImg,
    x: outerMargin + panelWidth + gap * 2,
    y: outerMargin + gap,
    width: panelWidth,
    height: panelHeight,
    label: after.checkInDate ?? dateFromRow(after),
    title: "After",
    labelHeight,
    radius: cornerRadius,
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `compare-${before.checkInDate ?? before.id}-vs-${after.checkInDate ?? after.id}.jpg`;
  link.click();
  URL.revokeObjectURL(url);
}

function drawPanel({
  ctx,
  img,
  x,
  y,
  width,
  height,
  label,
  title,
  labelHeight,
  radius,
}: {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  title: string;
  labelHeight: number;
  radius: number;
}) {
  const framePadding = 38;
  const contentX = x + framePadding;
  const contentY = y + framePadding;
  const contentWidth = width - framePadding * 2;
  const contentHeight = height - framePadding * 2 - labelHeight;

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
  ctx.font = "700 58px system-ui, -apple-system, sans-serif";
  ctx.fillText(title, x + framePadding, height - labelHeight + 58);
  ctx.font = "500 42px system-ui, -apple-system, sans-serif";
  ctx.fillText(label, x + framePadding, height - labelHeight + 108);
  ctx.restore();
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
