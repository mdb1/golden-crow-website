"use client";

// rest-timer-overlay.tsx
//
// Bottom-sheet rest timer (circular ring + ±15/30s + pausa/reanudar +
// "Siguiente serie") and a minimized floating pill — backoffice twin of iOS
// RestTimerOverlay + RestTimerPill.

import { Pause, Play, Timer, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { RestTimerApi } from "./use-rest-timer";

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`;
}

export function RestTimerOverlay({ timer }: { timer: RestTimerApi }) {
  if (!timer.active) return null;

  // Minimized → floating pill.
  if (!timer.sheetOpen) {
    return (
      <button
        type="button"
        onClick={timer.expand}
        className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg"
      >
        <Timer className="h-4 w-4 text-amber-500" />
        <span className="font-mono text-sm tabular-nums">
          {mmss(timer.remainingSeconds)}
        </span>
      </button>
    );
  }

  const R = 80;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.max(0, Math.min(1, timer.progress)));

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Descanso
          </span>
          <Button variant="ghost" size="icon" aria-label="Minimizar" onClick={timer.minimize}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative mx-auto my-3 h-[184px] w-[184px]">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 184 184">
            <circle
              cx="92"
              cy="92"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-muted/30"
            />
            <circle
              cx="92"
              cy="92"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              className="text-amber-500 transition-[stroke-dashoffset] duration-250"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-5xl font-semibold tabular-nums">
              {mmss(timer.remainingSeconds)}
            </span>
            <span className="text-xs text-muted-foreground">segundos</span>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => timer.adjust(-15)}>
            −15s
          </Button>
          <Button variant="outline" size="sm" onClick={() => timer.adjust(15)}>
            +15s
          </Button>
          <Button variant="outline" size="sm" onClick={() => timer.adjust(30)}>
            +30s
          </Button>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-1"
            onClick={() => (timer.isPaused ? timer.resume() : timer.pause())}
          >
            {timer.isPaused ? (
              <>
                <Play className="h-4 w-4" /> Reanudar
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" /> Pausar
              </>
            )}
          </Button>
          <Button className="flex-1" onClick={timer.skip}>
            Siguiente serie
          </Button>
        </div>
      </div>
    </div>
  );
}
