// client-chart-preferences.ts — which charts a coach wants on a client profile.
//
// WHY A COOKIE AND NOT localStorage
// ---------------------------------
// The sibling preference module (muscle-group-preferences.ts) uses localStorage,
// because there the hidden thing is already on the page — hiding a line costs
// nothing extra to have fetched. Here the unit is a whole chart, and each one is
// a Firestore query: the muscle-group + exercise-progress pair alone is a
// 500-log scan. A preference the SERVER cannot read would mean paying for every
// chart on every profile load and then throwing the hidden ones away in the
// browser, which is the opposite of what "no lo quiero ver" should cost.
//
// A cookie is readable in the Server Component, so a hidden chart is never
// queried at all. It also renders right the first time — no flash of a chart
// that a mount effect then removes.
//
// The preference is per COACH (their browser session), not per client: "I don't
// look at daily steps" is a fact about the coach, and re-hiding it once per
// client on a 40-person roster is not a preference, it is a chore.
//
// STORED AS THE HIDDEN SET, NOT THE VISIBLE ONE. Default is everything visible,
// so an absent cookie must mean "show all" — and it does, because an empty
// hidden set hides nothing. Storing the visible set would make a new chart
// invisible to every coach who ever touched this popover, since their cookie
// predates its id.

/**
 * Every chart the section can render, in display order.
 *
 * Adding an id here makes it visible to everyone by default (see the
 * hidden-set note above), so a new chart ships switched on.
 */
export const CLIENT_CHART_IDS = [
  "bodyWeight",
  "muscleGroups",
  "volume",
  "habits",
  "exerciseProgress",
  "dailySteps",
  "personalRecords",
] as const;

export type ClientChartId = (typeof CLIENT_CHART_IDS)[number];

/** Cookie name. Read server-side in the profile page, written by the popover. */
export const CLIENT_CHARTS_COOKIE = "gc-fitness.client-charts-hidden";

/** One year — a chart preference is not a session-scoped thing. */
export const CLIENT_CHARTS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const KNOWN = new Set<string>(CLIENT_CHART_IDS);

/**
 * Parse the stored hidden set.
 *
 * Unknown ids are dropped rather than kept: a chart that was removed from the
 * codebase must not keep occupying the cookie, and a typo'd value must not be
 * able to hide something by accident. Anything unparseable degrades to "nothing
 * hidden" — the default, and the state a coach can most easily correct from.
 */
export function parseHiddenCharts(raw: string | null | undefined): ClientChartId[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const stored = new Set(parsed.filter((v): v is string => typeof v === "string"));
  return CLIENT_CHART_IDS.filter((id) => stored.has(id));
}

/** Serialize a hidden set into the cookie value (canonical order, deduped). */
export function serializeHiddenCharts(ids: Iterable<string>): string {
  const set = new Set(ids);
  return encodeURIComponent(
    JSON.stringify(CLIENT_CHART_IDS.filter((id) => set.has(id))),
  );
}

/** True when `id` should be rendered given the stored hidden set. */
export function isChartVisible(
  id: string,
  hidden: readonly string[],
): id is ClientChartId {
  return KNOWN.has(id) && !hidden.includes(id);
}

/**
 * Flip one chart's visibility, returning the NEW hidden set.
 *
 * Pure so the popover's state transition is testable without a DOM: the
 * component only has to persist whatever comes back.
 */
export function toggleChartVisibility(
  hidden: readonly string[],
  id: ClientChartId,
  visible: boolean,
): ClientChartId[] {
  const next = new Set(hidden.filter((v): v is ClientChartId => KNOWN.has(v)));
  if (visible) next.delete(id);
  else next.add(id);
  return CLIENT_CHART_IDS.filter((chartId) => next.has(chartId));
}
