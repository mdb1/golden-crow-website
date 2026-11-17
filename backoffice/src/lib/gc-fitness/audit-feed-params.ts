// audit-feed-params.ts — #503: the /gc-fitness/admin/audit URL ⇄ feed filters,
// shared by the page and its CSV export so both read exactly the same feed.

import type { ActivityFeedFilters, FeedSource } from "./activity-feed-actions";
import type { FeedCategory } from "./activity-feed-model";

/**
 * #762 — the quick-filter checkboxes, in the order they render. `other` is
 * deliberately absent: it is the classifier's fallback for a collection this
 * reader does not know yet, so there is nothing an operator would go looking
 * for under that name. It is unfilterable-by-checkbox and therefore always
 * shown, which is the safe direction (a new event kind stays visible).
 */
export const AUDIT_CATEGORY_OPTIONS: FeedCategory[] = [
  "workout",
  "schedule",
  "routine",
  "habit",
  // #949 — `nutrition` was missing from this list while nutrition events were
  // already being classified under it, so checking ANY box hid every nutrition
  // row (an unlisted category can never be in the surviving set).
  "nutrition",
  "exercise",
  "photo",
  "account",
  "coach",
  // #529 — the collections captured since 2.3.0.
  "billing",
  "progress",
  "chat",
  "social",
  "challenge",
  "corvo",
  "admin",
];

export const AUDIT_SOURCE_OPTIONS: Array<"all" | FeedSource> = [
  "all",
  "audit_log",
  "coach_activity",
  "admin_operations",
  "progress_photos",
  "habit_logs",
  "nutrition_logs",
];

type Params = Record<string, string | string[] | undefined>;

function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Repeated `?cat=` params — one per checked box. */
function strList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

export interface AuditFeedParams {
  tab: "timeline" | "deletions";
  source: "all" | FeedSource;
  selectedCategories: FeedCategory[];
  allCategoriesSelected: boolean;
  actorQuery: string;
  clientQuery: string;
  /** #529 — «por coach». */
  coachQuery: string;
  fromISO: string;
  toISO: string;
  includeLowSignal: boolean;
  /** #503 — opaque cursor of the page being shown (`?before=`), "" = newest. */
  before: string;
}

export function parseAuditFeedParams(sp: Params): AuditFeedParams {
  const source = (() => {
    const v = str(sp.source);
    return AUDIT_SOURCE_OPTIONS.some((o) => o === v) ? (v as "all" | FeedSource) : "all";
  })();
  // Checked boxes. An empty set = "todos" (an untouched form and an
  // everything-unchecked form are indistinguishable over the wire — HTML omits
  // unchecked boxes — so both mean no filter).
  const selectedCategories = strList(sp.cat).filter((v): v is FeedCategory =>
    (AUDIT_CATEGORY_OPTIONS as string[]).includes(v),
  );
  return {
    tab: str(sp.tab) === "deletions" ? "deletions" : "timeline",
    source,
    selectedCategories,
    allCategoriesSelected:
      selectedCategories.length === 0 ||
      selectedCategories.length === AUDIT_CATEGORY_OPTIONS.length,
    actorQuery: str(sp.actor).trim(),
    clientQuery: str(sp.client).trim(),
    coachQuery: str(sp.coach).trim(),
    fromISO: str(sp.from).trim(),
    toISO: str(sp.to).trim(),
    includeLowSignal: str(sp.raw) === "1",
    before: str(sp.before).trim(),
  };
}

/** The reader's filters for these params (paging fields left to the caller). */
export function auditFeedFilters(p: AuditFeedParams, timeZone: string): ActivityFeedFilters {
  return {
    source: p.source,
    // All boxes checked ⇒ no filter at all, so `other` (which has no box —
    // see AUDIT_CATEGORY_OPTIONS) keeps showing instead of being filtered out
    // by an all-checked form submit.
    categories: p.allCategoriesSelected ? [] : p.selectedCategories,
    actorQuery: p.actorQuery,
    clientQuery: p.clientQuery,
    coachQuery: p.coachQuery,
    fromISO: p.fromISO,
    toISO: p.toISO,
    includeLowSignal: p.includeLowSignal,
    deletionsOnly: p.tab === "deletions",
    timeZone,
  };
}

/** The query string for these params (without `before` unless given). */
export function auditFeedQuery(
  p: AuditFeedParams,
  overrides: { tab?: "timeline" | "deletions"; before?: string | null } = {},
): string {
  const params = new URLSearchParams();
  params.set("tab", overrides.tab ?? p.tab);
  if (p.source !== "all") params.set("source", p.source);
  if (!p.allCategoriesSelected) {
    for (const c of p.selectedCategories) params.append("cat", c);
  }
  if (p.actorQuery) params.set("actor", p.actorQuery);
  if (p.clientQuery) params.set("client", p.clientQuery);
  if (p.coachQuery) params.set("coach", p.coachQuery);
  if (p.fromISO) params.set("from", p.fromISO);
  if (p.toISO) params.set("to", p.toISO);
  if (p.includeLowSignal) params.set("raw", "1");
  if (overrides.before) params.set("before", overrides.before);
  return params.toString();
}
