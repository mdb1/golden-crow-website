"use client";

import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { getGCFitnessAuth } from "@/lib/firebase/gc-fitness-client";

// Two-step sign-out for the gc-fitness trainer surface:
//   1. signOut on the scoped Firebase Web SDK clears any in-memory auth state
//      + persists the sign-out to IndexedDB (so a reopened tab doesn't show
//      a stale signed-in UI before the cookie check runs).
//   2. POST /api/gc-fitness/logout calls removeAuthCookies on the server,
//      which emits a Set-Cookie header that invalidates GcFitnessAuthToken
//      in the browser.
// We swallow signOut errors (offline, network blip) — the cookie clear is the
// authoritative session terminator; client-side state is best-effort cleanup.
export function SignOutButton() {
  async function handleSignOut() {
    try {
      await signOut(getGCFitnessAuth());
    } catch {
      // best-effort — server-side cookie clear is the source of truth
    }
    try {
      await fetch("/api/gc-fitness/logout", { method: "POST" });
    } catch {
      // best-effort — proxy will redirect to /login on next request anyway
    }
    window.location.href = "/gc-fitness/login";
  }

  return (
    <Button onClick={handleSignOut} variant="outline" className="w-full">
      Sign out
    </Button>
  );
}
