export const ENV = {
  PORT: Number(process.env.PORT ?? "3000"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  FIREBASE_WEB_API_KEY:
    process.env.FIREBASE_WEB_API_KEY ??
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "",
  BACKOFFICE_ORIGIN: process.env.BACKOFFICE_ORIGIN ?? "http://localhost:3001",
  EMAIL_VERIFICATION_CONTINUE_URL:
    process.env.EMAIL_VERIFICATION_CONTINUE_URL ??
    `${process.env.BACKOFFICE_ORIGIN ?? "http://localhost:3001"}/login`,
};

import type { ProjectKey } from "../types/sdk.types.js";

// Comma-separated emails: TEAM_ALLOWLIST=alice@example.com,bob@example.com
export const TEAM_ALLOWLIST = new Set<string>(
  (process.env.TEAM_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

// Per-project access lists. Fall back to TEAM_ALLOWLIST for backwards compat.
export const TEAM_ALLOWLIST_MYDNAMAP = new Set<string>(
  (process.env.TEAM_ALLOWLIST_MYDNAMAP ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

export const TEAM_ALLOWLIST_POCKETGYMS = new Set<string>(
  (process.env.TEAM_ALLOWLIST_POCKETGYMS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

// GC Fitness — Phase 11 trainer-facing surface. The allowlist names the
// trainer emails permitted to sign into the gc-fitness backoffice routes.
// Vercel env var: `TEAM_ALLOWLIST_GC_FITNESS=alice@studio.com,bob@studio.com`.
export const TEAM_ALLOWLIST_GC_FITNESS = new Set<string>(
  (process.env.TEAM_ALLOWLIST_GC_FITNESS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

/**
 * Returns which projects an email can access.
 * An email in the legacy TEAM_ALLOWLIST can access all projects.
 */
export function resolveProjectAccess(email: string): ProjectKey[] {
  const projects: ProjectKey[] = [];
  if (TEAM_ALLOWLIST.has(email) || TEAM_ALLOWLIST_MYDNAMAP.has(email)) {
    projects.push("mydnamap");
  }
  if (TEAM_ALLOWLIST.has(email) || TEAM_ALLOWLIST_POCKETGYMS.has(email)) {
    projects.push("pocket-gyms");
  }
  if (TEAM_ALLOWLIST.has(email) || TEAM_ALLOWLIST_GC_FITNESS.has(email)) {
    projects.push("gc-fitness");
  }
  return projects;
}
