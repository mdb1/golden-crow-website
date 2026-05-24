"use client";

// firebase-telemetry-init.tsx — boots Analytics + Performance for the
// GC Fitness web client. Mounted once near the top of the layout so the
// page-load span captures the real initial paint. Both SDKs are
// safe-noop on SSR via the lazy getters in gc-fitness-client.ts.

import { useEffect } from "react";

import {
  getGCFitnessAnalytics,
  getGCFitnessPerformance,
} from "@/lib/firebase/gc-fitness-client";

export function FirebaseTelemetryInit() {
  useEffect(() => {
    // Fire-and-forget. The promises resolve on whatever the next tick
    // affords; we don't block render or surface errors — telemetry must
    // not impact the user-felt critical path.
    void getGCFitnessAnalytics();
    getGCFitnessPerformance();
  }, []);
  return null;
}
