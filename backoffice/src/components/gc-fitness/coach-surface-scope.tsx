"use client";

// coach-surface-scope.tsx — golden-crow-website#535.
//
// Marks <body> with `data-coach-surface` while a COACH page (anything under
// /gc-fitness except /gc-fitness/admin) is showing. globals.css uses it to give
// the shared Button's small sizes (`sm` 28 px, `icon` 32 px…) a 40 px minimum
// on TOUCH screens only (`pointer: coarse`): coaches use the portal from a phone
// in the gym, and those sizes are below the 40 px tap-target rule of the design
// system. On <body> (not the page tree) so portaled dialogs and menus get it too.
// Desktop is unchanged everywhere, and the admin screens (#534) are unchanged on
// every device.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const COACH_SURFACE_ATTR = "data-coach-surface";

export function isCoachSurface(pathname: string | null): boolean {
  if (!pathname || !pathname.startsWith("/gc-fitness")) return false;
  return !(pathname === "/gc-fitness/admin" || pathname.startsWith("/gc-fitness/admin/"));
}

export function CoachSurfaceScope() {
  const pathname = usePathname();
  const coach = isCoachSurface(pathname);
  useEffect(() => {
    if (!coach) return;
    document.body.setAttribute(COACH_SURFACE_ATTR, "");
    return () => document.body.removeAttribute(COACH_SURFACE_ATTR);
  }, [coach]);
  return null;
}
