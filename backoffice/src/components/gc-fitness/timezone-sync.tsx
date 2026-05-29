"use client";

// timezone-sync.tsx — bridges the browser's real IANA timezone into a cookie
// the server can read (see trainer-timezone.ts). Mounted once near the top of
// the GC Fitness layout.
//
// LOOP GUARD: writing the cookie + calling router.refresh() re-renders Server
// Components, which re-mounts this client subtree and re-runs this effect. If
// we refreshed unconditionally we'd spin forever. So we only write + refresh
// when the cookie's current value DIFFERS from the browser zone — once they
// match, subsequent mounts are no-ops.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TRAINER_TZ_COOKIE = "gcfitness_tz";

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const entry = document.cookie
    .split("; ")
    .find((c) => c.startsWith(prefix));
  if (!entry) {
    return null;
  }
  return decodeURIComponent(entry.slice(prefix.length));
}

export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) {
      return;
    }

    const current = readCookie(TRAINER_TZ_COOKIE);
    if (current === tz) {
      // Already in sync — do nothing, breaking the refresh loop.
      return;
    }

    document.cookie = `${TRAINER_TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; SameSite=Lax; max-age=31536000`;
    router.refresh();
  }, [router]);

  return null;
}
