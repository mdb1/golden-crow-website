/**
 * GC Fitness sidebar nav configuration.
 *
 * Closes BO-06 (Phase 11-04) — the trainer-facing sidebar needs its own
 * section + nav metadata so `getProjectNav("gc-fitness", role)` returns
 * a sensible trainer-focused tree instead of falling back to the MyDNAMap
 * ADMIN_NAV (the current default when no project branch matches in
 * `moderation-config.ts`).
 *
 * Pattern: ported verbatim from `GYM_SECTIONS` + `GYM_NAV` in
 * `moderation-config.ts` (lines 862-938 — the closest analog). Same
 * SectionDescriptor + AdminNavItem shape; same `visibleRoles` filtering
 * convention.
 *
 * Role mapping note:
 *   - The trainer role custom claim is `"trainer"` (set in P02-11 +
 *     P03-05 via Firestore rules). `AdminRole` (the backoffice's local
 *     enum) does NOT yet include `"trainer"` — it has `"full_admin"`,
 *     `"institution_admin"`, `"institution_doctor"`, `"patient"`. The
 *     gc-fitness routes treat the trainer custom claim as the
 *     equivalent of `"institution_doctor"` (an AREA_ROLES member) for
 *     the purposes of sidebar visibility. A future polish phase (P12)
 *     may add `"trainer"` to the AdminRole enum + tighten visibility
 *     accordingly. For v1, every nav item below is visible to the
 *     reused AREA_ROLES set so the existing role gate is sufficient.
 *
 * Route paths use the existing flat `/gc-fitness/*` URLs. (Phase 11-03
 * deliberately kept the routes at the flat path rather than moving them
 * under `(dashboard)/` because trainer auth uses next-firebase-auth-edge
 * cookies, NOT the NextAuth session that `(dashboard)/layout.tsx`
 * enforces. See `11-03-SUMMARY.md` for the full Rule 4 deviation
 * rationale. URLs are URL-group-invisible in Next.js anyway, so the
 * sidebar nav HREFs are unaffected by route-group placement.)
 *
 * Nav-item composition (6 entries):
 *   1. Clients   — trainer roster (Plan 11-05 implements the page)
 *   2. Workouts  — workout-template authoring + assignments (P04)
 *   3. Habits    — habit CRUD + per-client assignment (P06)
 *   4. Exercises — exercise library + GIF management (P03)
 *   5. Chat      — trainer inbox + per-client message threads (P08-11)
 *   6. Settings  — quick-reply templates + trainer preferences (P08-12)
 *
 * Decision: the canonical 6 from CONTEXT.md listed "Push" as the 6th
 * item. P10-08 placed the manual-nudge button inside the chat
 * conversation header (where the trainer is already in-thread with the
 * client). A standalone "Push" sidebar nav item would duplicate the
 * chat surface. The 6th slot instead surfaces "Settings" (P08-12) which
 * is the trainer's natural sibling — quick-reply templates +
 * preferences. The nudge button remains discoverable from the chat
 * conversation header.
 */

import {
  Users, // Clients (the roster — 11-05)
  Activity, // Recent logs feed
  Dumbbell, // Workouts (templates from P04)
  ListChecks, // Habits (CRUD from P06)
  Library, // Exercises (library from P03)
  MessagesSquare, // Chat (inbox from P08)
  Settings as SettingsIcon, // Settings (quick replies — P08-12)
} from "lucide-react";

import type { AdminRole } from "../admin-areas";
import type { AdminNavItem, SectionDescriptor } from "../moderation-types";

/**
 * Role visibility set for trainer-side nav items.
 *
 * Until P12 polish adds an explicit "trainer" enum to AdminRole, we
 * reuse the existing AREA_ROLES tuple (full_admin / institution_admin /
 * institution_doctor) so the sidebar surfaces for the existing
 * institution-shaped role records that have gc-fitness in their
 * projectAccess list. full_admin sees everything by default.
 *
 * Note: AREA_ROLES is declared as a non-exported `const` inside
 * `moderation-config.ts`. We re-declare it here to avoid a public-API
 * extraction; the values must mirror that const exactly. If
 * AREA_ROLES is ever exported and broadened, update both call sites.
 */
const TRAINER_ROLES: AdminRole[] = [
  "full_admin",
  "institution_admin",
  "institution_doctor",
];

export const GC_FITNESS_SECTIONS: SectionDescriptor[] = [
  {
    key: "gc-fitness-roster",
    label: "Clients",
    description: "Trainer roster + per-client deep view.",
    visibleRoles: TRAINER_ROLES,
  },
  {
    key: "gc-fitness-content",
    label: "Content",
    description: "Workout templates, habits, exercise library.",
    visibleRoles: TRAINER_ROLES,
  },
  {
    key: "gc-fitness-engagement",
    label: "Engagement",
    description: "Chat inbox + trainer settings.",
    visibleRoles: TRAINER_ROLES,
  },
];

export const GC_FITNESS_NAV: AdminNavItem[] = [
  // Roster section
  {
    section: "gc-fitness-roster",
    label: "Clients",
    href: "/gc-fitness/clients",
    description: "Roster with last activity, compliance, unread chat (11-05).",
    icon: Users,
    visibleRoles: TRAINER_ROLES,
  },
  {
    section: "gc-fitness-roster",
    label: "Recent Logs",
    href: "/gc-fitness/recent-logs",
    description: "Cross-client recent habit/workout activity feed.",
    icon: Activity,
    visibleRoles: TRAINER_ROLES,
  },
  // Content section
  {
    section: "gc-fitness-content",
    label: "Workouts",
    href: "/gc-fitness/templates",
    description: "Workout-template authoring + assignments (P04).",
    icon: Dumbbell,
    visibleRoles: TRAINER_ROLES,
  },
  {
    section: "gc-fitness-content",
    label: "Habits",
    href: "/gc-fitness/habits",
    description: "Habit CRUD + per-client assignment (P06).",
    icon: ListChecks,
    visibleRoles: TRAINER_ROLES,
  },
  {
    section: "gc-fitness-content",
    label: "Exercises",
    href: "/gc-fitness/exercises",
    description: "Exercise library + GIF management (P03).",
    icon: Library,
    visibleRoles: TRAINER_ROLES,
  },
  // Engagement section
  {
    section: "gc-fitness-engagement",
    label: "Chat",
    href: "/gc-fitness/chat",
    description: "Trainer inbox + per-client message threads (P08-11).",
    icon: MessagesSquare,
    visibleRoles: TRAINER_ROLES,
  },
  {
    section: "gc-fitness-engagement",
    label: "Settings",
    href: "/gc-fitness/settings",
    description: "Quick-reply templates + trainer preferences (P08-12).",
    icon: SettingsIcon,
    visibleRoles: TRAINER_ROLES,
  },
];
