// coachless-user-table.ts
//
// Pure (no firebase, no React) search + sort for the admin "Coach-less users"
// table (issue #606: "faltan sorts … y search"). Kept out of the client
// component so the ordering rules — which are the part that silently rots — are
// unit-testable.
//
// The dashboard scan returns the WHOLE coach-less segment (tens of rows), so
// filtering and sorting happen in memory on the already-loaded set: no extra
// query, no index, and the counts in the header stay stable while the operator
// types.

import { resolveDisplayTier } from "@/lib/gc-fitness/coachless-user-model";
import type { CoachlessUserRow } from "@/lib/gc-fitness/admin-coachless-actions";

export type CoachlessSortKey =
  | "user"
  | "subscription"
  | "routines"
  | "habits"
  | "photos"
  | "logs"
  | "created";

export type SortDirection = "asc" | "desc";

export interface CoachlessSort {
  key: CoachlessSortKey;
  direction: SortDirection;
}

/**
 * Newest signups first — the question an operator opens this page with. (The
 * previous fixed order was email A→Z, which buried every new account.)
 */
export const DEFAULT_COACHLESS_SORT: CoachlessSort = {
  key: "created",
  direction: "desc",
};

/** Numeric columns start on the biggest value; text columns start A→Z. */
const DEFAULT_DIRECTION: Record<CoachlessSortKey, SortDirection> = {
  user: "asc",
  subscription: "desc",
  routines: "desc",
  habits: "desc",
  photos: "desc",
  logs: "desc",
  created: "desc",
};

/** Clicking the active column flips it; clicking another one starts fresh. */
export function nextCoachlessSort(
  current: CoachlessSort,
  key: CoachlessSortKey,
): CoachlessSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: DEFAULT_DIRECTION[key] };
}

/** Name / email / uid "contains", case- and accent-insensitive. */
export function matchesCoachlessQuery(row: CoachlessUserRow, query: string): boolean {
  const q = normalize(query);
  if (q.length === 0) return true;
  return normalize(`${row.displayName} ${row.email} ${row.uid}`).includes(q);
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function sortValue(row: CoachlessUserRow, key: CoachlessSortKey): string | number {
  switch (key) {
    case "user":
      // Rows with no display name still sort by something a human recognizes.
      return normalize(row.displayName || row.email || row.uid);
    case "subscription":
      return resolveDisplayTier(row.entitlement) === "premium" ? 1 : 0;
    case "routines":
      return row.stats.routines;
    case "habits":
      return row.stats.habits;
    case "photos":
      return row.stats.progressPhotos;
    case "logs":
      return row.stats.workoutLogs;
    case "created":
      // ISO strings compare chronologically; missing dates sort oldest.
      return row.createdAtISO ?? "";
  }
}

/**
 * Filter + sort, in that order. The sort is STABLE and always breaks ties on
 * email so two rows with the same count never swap between renders.
 */
export function selectCoachlessRows(
  rows: CoachlessUserRow[],
  options: { query?: string; sort?: CoachlessSort } = {},
): CoachlessUserRow[] {
  const sort = options.sort ?? DEFAULT_COACHLESS_SORT;
  const filtered = options.query
    ? rows.filter((row) => matchesCoachlessQuery(row, options.query!))
    : [...rows];

  const factor = sort.direction === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    if (cmp !== 0) return cmp * factor;
    return a.email.localeCompare(b.email);
  });
}
