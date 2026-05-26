"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";

type Angle = "front" | "side" | "back";
type Transform = { scale: number; x: number; y: number };

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
  const [mode, setMode] = useState<"side-by-side" | "slider">("side-by-side");
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
          <div className="grid w-full max-w-sm grid-cols-2 gap-2 rounded-lg border p-1">
            <button
              className={`rounded-md px-3 py-1.5 text-sm ${mode === "side-by-side" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setMode("side-by-side")}
            >
              Lado a lado
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-sm ${mode === "slider" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setMode("slider")}
            >
              Deslizador
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
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <CompareStaticImage url={before.url} alt="before" />
              <CompareStaticImage url={after.url} alt="after" />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Seleccioná fotos para comparar.</p>
      )}
    </section>
  );
}

function CompareStaticImage({ url, alt }: { url: string; alt: string }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border bg-muted">
      <Image src={url} alt={alt} fill sizes="(min-width: 1024px) 48vw, 100vw" className="object-contain" />
    </div>
  );
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
