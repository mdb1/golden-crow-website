"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listRecentLogsForTrainerPage } from "./recent-logs-actions";

const ACTIVATIONS_QUERY_KEY = ["gc-fitness", "new-client-activations"] as const;
const STORAGE_PREFIX = "gc-fitness:new-client-activations-seen";

type SeenState = {
  notifications: number | null;
  clients: number | null;
};

function storageKey(trainerUid: string, surface: keyof SeenState): string {
  return `${STORAGE_PREFIX}:${trainerUid}:${surface}`;
}

function readSeenMs(trainerUid: string, surface: keyof SeenState, fallbackMs: number): number {
  const key = storageKey(trainerUid, surface);
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  window.localStorage.setItem(key, String(fallbackMs));
  return fallbackMs;
}

function writeSeenMs(trainerUid: string, surface: keyof SeenState, value: number) {
  window.localStorage.setItem(storageKey(trainerUid, surface), String(value));
}

function isoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function useNewClientActivationBadges({
  enabled,
  pathname,
  trainerUid,
}: {
  enabled: boolean;
  pathname: string;
  trainerUid: string | null;
}) {
  const query = useQuery({
    queryKey: ACTIVATIONS_QUERY_KEY,
    queryFn: () => listRecentLogsForTrainerPage(null, 20, null, "signup"),
    enabled,
    staleTime: 10_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const activations = query.data?.logs ?? [];
  const activationTimes = useMemo(
    () => activations.map((item) => isoMs(item.eventAt)).filter((ms) => ms > 0),
    [activations],
  );
  const latestMs = activationTimes.length > 0 ? Math.max(...activationTimes) : 0;
  const [seen, setSeen] = useState<SeenState>({
    notifications: null,
    clients: null,
  });

  useEffect(() => {
    if (!enabled || !trainerUid || latestMs <= 0) return;
    setSeen({
      notifications: readSeenMs(trainerUid, "notifications", latestMs),
      clients: readSeenMs(trainerUid, "clients", latestMs),
    });
  }, [enabled, latestMs, trainerUid]);

  useEffect(() => {
    if (!enabled || !trainerUid || latestMs <= 0) return;
    if (pathname === "/gc-fitness/notifications" || pathname.startsWith("/gc-fitness/notifications/")) {
      writeSeenMs(trainerUid, "notifications", latestMs);
      setSeen((prev) => ({ ...prev, notifications: latestMs }));
    }
    if (pathname === "/gc-fitness/clients" || pathname.startsWith("/gc-fitness/clients/")) {
      writeSeenMs(trainerUid, "clients", latestMs);
      setSeen((prev) => ({ ...prev, clients: latestMs }));
    }
  }, [enabled, latestMs, pathname, trainerUid]);

  const notificationsSeen = seen.notifications ?? latestMs;
  const clientsSeen = seen.clients ?? latestMs;

  return {
    notifications: activationTimes.filter((ms) => ms > notificationsSeen).length,
    clients: activationTimes.filter((ms) => ms > clientsSeen).length,
  };
}
