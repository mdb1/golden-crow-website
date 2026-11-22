// activity-feed-paging.ts — #503: cursor paging for the admin activity feed.
//
// The feed merges six sources, each read as its own newest-first window with a
// cap (audit_log ×6 windows, coach_activity, admin_operations, …). A naive
// "page 2 = everything older than the last row shown" skips events: when the
// busy audit window (cap 400) only reaches back to 09:00 while coach_activity
// reaches back to last week, rows from 08:00 shown on page 1 move the cursor
// past the audit rows between 08:00 and 09:00 that were never read.
//
// So a page only shows events at or after the SAFE HORIZON — the newest
// "oldest row" among the windows that came back FULL (a full window may have
// more rows just behind it; a short one is complete). The cursor then carries
// the instant to resume from, and the next request re-reads every source from
// there. Pure, so the boundary rules have tests of their own.

/** Collects, per request, how far back the full windows reached. */
export interface WindowHorizon {
  /** Newest oldest-row instant among the windows that hit their cap, or null. */
  oldestFullMs: number | null;
}

export function newWindowHorizon(): WindowHorizon {
  return { oldestFullMs: null };
}

/** Record one window: only a FULL window limits how far back the page is complete. */
export function noteWindow(
  horizon: WindowHorizon | undefined,
  rowCount: number,
  limit: number,
  oldestRowMs: number | null,
): void {
  if (!horizon || rowCount < limit || oldestRowMs === null) return;
  horizon.oldestFullMs =
    horizon.oldestFullMs === null ? oldestRowMs : Math.max(horizon.oldestFullMs, oldestRowMs);
}

/** Opaque cursor: resume at `beforeMs` (inclusive) skipping the ids already shown at that ms. */
export interface FeedCursor {
  beforeMs: number;
  seenIds: string[];
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify([cursor.beforeMs, cursor.seenIds]), "utf8").toString("base64url");
}

export function decodeFeedCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [beforeMs, seenIds] = parsed as [unknown, unknown];
    if (typeof beforeMs !== "number" || !Number.isFinite(beforeMs)) return null;
    if (!Array.isArray(seenIds) || !seenIds.every((id) => typeof id === "string")) return null;
    return { beforeMs, seenIds: (seenIds as string[]).slice(0, 200) };
  } catch {
    return null;
  }
}

interface Pageable {
  id: string;
  occurredAtISO: string | null;
}

function eventMs(e: Pageable): number | null {
  if (!e.occurredAtISO) return null;
  const ms = Date.parse(e.occurredAtISO);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Cut one page out of the filtered, newest-first events.
 *
 * - Drops what the previous page already showed at the cursor's instant.
 * - Stops at the safe horizon (`oldestFullMs`): older rows are incomplete.
 * - Takes `limit` rows, and the next cursor resumes AT the last row's instant
 *   (inclusive) remembering the ids already shown there, so rows sharing a
 *   millisecond across the cut are neither lost nor repeated.
 * - `nextCursor` is null only when every window was complete and nothing is left.
 */
export function cutFeedPage<T extends Pageable>(
  events: T[],
  options: { limit: number; horizon: WindowHorizon; cursor: FeedCursor | null },
): { page: T[]; nextCursor: FeedCursor | null } {
  const seen = new Set(options.cursor ? options.cursor.seenIds : []);
  const horizonMs = options.horizon.oldestFullMs;
  const eligible: T[] = [];
  for (const e of events) {
    const ms = eventMs(e);
    if (options.cursor) {
      // The reader re-reads up to the END of the cursor's millisecond (sub-ms
      // Firestore precision), so a row from the next ms up can come back: shown.
      if (ms !== null && ms > options.cursor.beforeMs) continue;
      if (ms === options.cursor.beforeMs && seen.has(e.id)) continue;
    }
    if (horizonMs !== null && (ms === null || ms < horizonMs)) continue;
    eligible.push(e);
  }
  const page = eligible.slice(0, Math.max(1, options.limit));
  if (eligible.length > page.length) {
    const last = page[page.length - 1];
    const lastMs = eventMs(last);
    if (lastMs !== null) {
      const sameInstant = page.filter((e) => eventMs(e) === lastMs).map((e) => e.id);
      // Ids already skipped at this instant on the way in stay skipped.
      const carried =
        options.cursor && options.cursor.beforeMs === lastMs ? options.cursor.seenIds : [];
      return { page, nextCursor: { beforeMs: lastMs, seenIds: [...carried, ...sameInstant] } };
    }
  }
  if (horizonMs !== null) {
    // A window came back full: there may be more behind the horizon even when
    // nothing older passed the filters. Resume there —
    // unless this request already started at that very instant and found
    // nothing new (a burst of >cap rows in one ms would loop forever).
    const stuck = options.cursor?.beforeMs === horizonMs && page.length === 0;
    if (!stuck) {
      const atHorizon = page.filter((e) => eventMs(e) === horizonMs).map((e) => e.id);
      const carried =
        options.cursor && options.cursor.beforeMs === horizonMs ? options.cursor.seenIds : [];
      return { page, nextCursor: { beforeMs: horizonMs, seenIds: [...carried, ...atHorizon] } };
    }
  }
  return { page, nextCursor: null };
}
