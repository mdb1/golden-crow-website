"use client";

// use-rest-timer.ts
//
// Rest-timer state machine — backoffice twin of iOS RestTimerOverlay logic.
// Auto-starts on a completed working set, drains a countdown, supports
// pause/resume, ±15/30s adjust, skip, and minimize (keeps running). Fires a
// short WebAudio beep on expiry (desktop has no haptics).

import { useCallback, useEffect, useRef, useState } from "react";

export interface RestTimerApi {
  /** True while a rest is running or paused (pill/overlay eligible). */
  active: boolean;
  /** True when the overlay sheet is shown (vs minimized to a pill). */
  sheetOpen: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  /** 0..1 remaining fraction for the ring. */
  progress: number;
  start: (seconds: number) => void;
  skip: () => void;
  pause: () => void;
  resume: () => void;
  adjust: (delta: number) => void;
  minimize: () => void;
  expand: () => void;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio not available — visual cue only */
  }
}

export function useRestTimer(): RestTimerApi {
  const [active, setActive] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  // Tick while running (not paused).
  useEffect(() => {
    if (!active || endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active, endsAt]);

  const remainingSeconds =
    pausedRemaining !== null
      ? pausedRemaining
      : endsAt !== null
        ? Math.max(0, Math.ceil((endsAt - now) / 1000))
        : 0;

  // Expiry.
  useEffect(() => {
    if (!active || endsAt === null) return;
    if (remainingSeconds <= 0 && !firedRef.current) {
      firedRef.current = true;
      beep();
      setActive(false);
      setSheetOpen(false);
      setEndsAt(null);
    }
  }, [active, endsAt, remainingSeconds]);

  const start = useCallback((seconds: number) => {
    const s = Math.max(1, Math.round(seconds));
    firedRef.current = false;
    setTotalSeconds(s);
    setPausedRemaining(null);
    setEndsAt(Date.now() + s * 1000);
    setNow(Date.now());
    setActive(true);
    setSheetOpen(true);
  }, []);

  const skip = useCallback(() => {
    setActive(false);
    setSheetOpen(false);
    setEndsAt(null);
    setPausedRemaining(null);
  }, []);

  const pause = useCallback(() => {
    setPausedRemaining((prev) => {
      if (prev !== null) return prev;
      return endsAt !== null
        ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
        : 0;
    });
    setEndsAt(null);
  }, [endsAt]);

  const resume = useCallback(() => {
    setPausedRemaining((prev) => {
      if (prev === null) return null;
      setEndsAt(Date.now() + prev * 1000);
      setNow(Date.now());
      return null;
    });
  }, []);

  const adjust = useCallback(
    (delta: number) => {
      setTotalSeconds((t) => Math.max(5, t + delta));
      if (pausedRemaining !== null) {
        setPausedRemaining((r) => Math.max(0, (r ?? 0) + delta));
      } else if (endsAt !== null) {
        firedRef.current = false;
        setEndsAt((e) => (e === null ? null : Math.max(Date.now(), e + delta * 1000)));
      }
    },
    [pausedRemaining, endsAt],
  );

  const minimize = useCallback(() => setSheetOpen(false), []);
  const expand = useCallback(() => setSheetOpen(true), []);

  return {
    active,
    sheetOpen,
    isPaused: pausedRemaining !== null,
    remainingSeconds,
    totalSeconds,
    progress: totalSeconds > 0 ? remainingSeconds / totalSeconds : 0,
    start,
    skip,
    pause,
    resume,
    adjust,
    minimize,
    expand,
  };
}
