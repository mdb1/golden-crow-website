"use client";

// upcoming-workout-alerts.tsx
//
// In-tab pre-workout alerts (#1 / D1). Polls the trainer's upcoming scheduled
// workouts (with a time) and shows countdown cards. Crossing the 30 / 10 / 1
// minute thresholds fires a browser Notification (deduped per assignment+
// threshold per day) while a backoffice tab is open. No backend push in v1 —
// server FCM is the documented next step.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Pause, Play, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  listUpcomingScheduledWorkouts,
  type UpcomingWorkout,
} from "@/lib/gc-fitness/live-workout-actions";
import { useActiveWorkoutSummaries } from "@/lib/gc-fitness/live-workout-listener";

const THRESHOLDS = [30, 10, 1] as const;
/** Show a card once the workout is within this many minutes. */
const VISIBLE_WITHIN_MIN = 35;

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function firedStorageKey(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `gcf-workout-alerts-fired-${today}`;
}

function loadFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(firedStorageKey());
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistFired(fired: Set<string>) {
  try {
    window.localStorage.setItem(firedStorageKey(), JSON.stringify([...fired]));
  } catch {
    /* storage unavailable — alerts still fire in-session via the ref */
  }
}

function countdownLabel(minutes: number): string {
  if (minutes <= 0) return "¡Ahora!";
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `en ${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `en ${h} h` : `en ${h} h ${m} min`;
}

export function UpcomingWorkoutAlerts() {
  const { data } = useQuery({
    queryKey: ["live-workout", "upcoming-alerts"],
    queryFn: () => listUpcomingScheduledWorkouts(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  const activeWorkoutsQuery = useActiveWorkoutSummaries(true);

  const [now, setNow] = useState(() => Date.now());
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    firedRef.current = loadFired();
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => data ?? [], [data]);

  // Fire browser notifications on threshold crossing.
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return;
    }
    let changed = false;
    for (const item of items) {
      const minutes = (item.scheduledEpochMs - now) / 60_000;
      for (const threshold of THRESHOLDS) {
        // Crossing window: just dipped below the threshold (15s tick → ~0.25 min).
        if (minutes <= threshold && minutes > threshold - 1.5) {
          const key = `${item.assignmentId}:${threshold}`;
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          changed = true;
          try {
            new Notification(`Entrenamiento en ${threshold} min`, {
              body: `${item.clientName} · ${item.workoutName} (${item.scheduledTime})`,
              tag: key,
            });
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (changed) persistFired(firedRef.current);
  }, [items, now]);

  const visible = items.filter(
    (i) => (i.scheduledEpochMs - now) / 60_000 <= VISIBLE_WITHIN_MIN,
  );
  const activeByAssignmentId = new Map(
    (activeWorkoutsQuery.data ?? []).map((item) => [item.assignmentId, item]),
  );

  if (visible.length === 0 && permission === "granted") return null;

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Próximos entrenamientos</h2>
        {permission !== "granted" ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={async () => {
              if (typeof Notification === "undefined") return;
              const p = await Notification.requestPermission();
              setPermission(p);
            }}
          >
            <Bell className="h-3.5 w-3.5" />
            Activar avisos
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay entrenamientos con horario en las próximas horas.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <UpcomingRow
              key={item.assignmentId}
              item={item}
              now={now}
              active={activeByAssignmentId.get(item.assignmentId) ?? null}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UpcomingRow({
  item,
  now,
  active,
}: {
  item: UpcomingWorkout;
  now: number;
  active: { assignmentId: string; clientId: string } | null;
}) {
  const minutes = (item.scheduledEpochMs - now) / 60_000;
  const imminent = minutes <= 10;
  const started = active !== null;
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        started
          ? "border-sky-500/40 bg-sky-500/5"
          : imminent
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-border/60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {item.clientName} · {item.workoutName}
          </p>
          {started ? (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              En curso
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.scheduledTime} ·{" "}
          {started
            ? "ya iniciado"
            : countdownLabel(minutes)}
        </p>
        {item.meetingNotes ? (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600">
            <Video className="h-3 w-3" />
            {isUrl(item.meetingNotes) ? (
              <a
                href={item.meetingNotes}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Link de reunión
              </a>
            ) : (
              <span className="truncate">{item.meetingNotes}</span>
            )}
          </span>
        ) : null}
      </div>
      <Button asChild size="sm" className="shrink-0 gap-1">
        <Link
          href={`/gc-fitness/clients/${item.clientId}/sessions/${item.assignmentId}/run`}
        >
          {started ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {started ? "Seguir" : "Iniciar"}
        </Link>
      </Button>
    </li>
  );
}
