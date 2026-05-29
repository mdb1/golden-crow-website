"use client";

import { useRef, useState } from "react";
import { Share2, Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { WorkoutLogDetail } from "@/lib/gc-fitness/recent-logs-actions";

// 260529-ltm — cross-surface "share workout image".
//
// Renders a HIDDEN, off-screen, fixed 1080x1350 px card matching the
// canonical SHARE-CARD-SPEC.md (the iOS ShareCardView is the twin), then
// rasterizes it to a PNG with `html-to-image` on click and offers download
// + navigator.share where supported.
//
// SUCCESS variant (logged actuals): one summary line per exercise built
// from the logged sets (warmups already excluded — the log only carries
// performed sets), joined as "{kg} kg x {reps}".

// SHARE-CARD-SPEC §2 palette — hardcoded hex, never inherit page theme.
const BG = "#000000";
const ACCENT = "#D9A441";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "rgba(255,255,255,0.60)";
const STROKE = "rgba(255,255,255,0.18)";

// SHARE-CARD-SPEC §3 — SF-Pro-first stack for tightest iOS parity.
const FONT_STACK =
  '-apple-system, "SF Pro Text", system-ui, "Public Sans", sans-serif';

const MAX_VISIBLE_ROWS = 8;

interface ShareRow {
  name: string;
  detail: string;
}

function formatWeight(kg: number): string {
  // Up to 1 fractional digit, trailing-zero trimmed (matches iOS).
  return (Math.round(kg * 10) / 10).toString();
}

/** Build one summary line per exercise from the logged sets (spec §5). */
function buildRows(detail: WorkoutLogDetail): ShareRow[] {
  const order: string[] = [];
  const byExercise = new Map<string, { name: string; sets: WorkoutLogDetail["sets"] }>();
  for (const set of detail.sets) {
    const key = set.exerciseId || set.exerciseName;
    let bucket = byExercise.get(key);
    if (!bucket) {
      bucket = { name: set.exerciseName, sets: [] };
      byExercise.set(key, bucket);
      order.push(key);
    }
    bucket.sets.push(set);
  }
  return order.map((key) => {
    const bucket = byExercise.get(key)!;
    const parts = bucket.sets
      .map((s) => {
        if (s.weight !== null && s.reps !== null) {
          return `${formatWeight(s.weight)} kg × ${s.reps}`;
        }
        if (s.durationSeconds !== null) return `${s.durationSeconds}s`;
        if (s.reps !== null) return `${s.reps}`;
        return null;
      })
      .filter((p): p is string => p !== null);
    return { name: bucket.name, detail: parts.join("  ·  ") };
  });
}

export function ShareWorkoutCard({ detail }: { detail: WorkoutLogDetail }) {
  const t = useTranslations("recentLogs.workoutDetail");
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const rows = buildRows(detail);
  const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS);
  const overflow = Math.max(0, rows.length - MAX_VISIBLE_ROWS);

  // Sub-line "Coach {coach} · {client}" — omit the coach segment AND the
  // separator when coachName is null/blank (never a raw UID).
  const coach = detail.coachName?.trim();
  const client = detail.clientName?.trim();
  const subLine =
    coach && client
      ? `${t("shareCoachPrefix", { name: coach })} · ${client}`
      : coach
        ? t("shareCoachPrefix", { name: coach })
        : client || null;

  const dateLine = formatShareDate(
    detail.completedAt ?? detail.startedAt,
    detail.clientTimezone,
  );

  const fileDate = (detail.completedAt ?? detail.startedAt ?? "").slice(0, 10) || "workout";

  async function handleShare() {
    const node = cardRef.current;
    if (!node || busy) return;
    setBusy(true);
    try {
      // Ensure the logo <img> is decoded before rasterizing.
      const img = node.querySelector("img");
      if (img && !img.complete) {
        await img.decode().catch(() => undefined);
      }
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 1,
        width: 1080,
        height: 1350,
        cacheBust: true,
      });

      // Try the native share sheet with a file where supported (mobile).
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `workout-${fileDate}.png`, { type: "image/png" });
      const navAny = navigator as Navigator & {
        canShare?: (data?: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string }) => Promise<void>;
      };
      if (navAny.canShare?.({ files: [file] }) && navAny.share) {
        try {
          await navAny.share({ files: [file], title: detail.workoutName });
          return;
        } catch {
          // User cancelled or share failed — fall through to download.
        }
      }

      // Desktop / unsupported → download.
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `workout-${fileDate}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={handleShare} disabled={busy} variant="outline" size="sm" className="gap-1">
        {busy ? (
          <Download className="h-4 w-4 animate-pulse" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {t("shareButton")}
      </Button>

      {/* Hidden off-screen card — laid out (NOT display:none) so html-to-image
          can rasterize it. SHARE-CARD-SPEC.md exact spec. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          pointerEvents: "none",
        }}
      >
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1350,
            background: BG,
            color: TEXT_PRIMARY,
            fontFamily: FONT_STACK,
            padding: "56px 64px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {/* Header band */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 28 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/goldencrow-logo.png"
              alt=""
              width={96}
              height={96}
              style={{ width: 96, height: 96, objectFit: "contain", flexShrink: 0 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  color: TEXT_PRIMARY,
                }}
              >
                {detail.workoutName}
              </div>
              {subLine ? (
                <div style={{ fontSize: 26, color: TEXT_SECONDARY }}>{subLine}</div>
              ) : null}
            </div>
          </div>

          {/* Hairline divider */}
          <div style={{ height: 1, background: STROKE, margin: "36px 0" }} />

          {/* Body — one summary line per exercise */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28, flex: 1 }}>
            {visibleRows.map((row, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 34, fontWeight: 600, color: TEXT_PRIMARY }}>
                  {row.name}
                </div>
                {row.detail ? (
                  <div style={{ fontSize: 26, color: TEXT_SECONDARY }}>{row.detail}</div>
                ) : null}
              </div>
            ))}
            {overflow > 0 ? (
              <div style={{ fontSize: 26, color: TEXT_SECONDARY }}>
                {t("shareMore", { count: overflow })}
              </div>
            ) : null}
          </div>

          {/* Footer band */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 2,
                color: ACCENT,
              }}
            >
              GC FITNESS
            </div>
            {dateLine ? (
              <div style={{ fontSize: 22, color: TEXT_SECONDARY }}>{dateLine}</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function formatShareDate(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}
