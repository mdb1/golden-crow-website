// audit-grouping.ts
//
// Pure (no Firestore, no "use server") helpers for the admin audit timeline.
// Extracted from audit-actions.ts so the recurring-collapse logic — the riskiest
// part (id regex + minute bucketing) — can be unit-tested in isolation.
//
// Why this exists: a recurring workout assignment is stored as one doc PER
// occurrence date (`asg-<seriesRoot>-<YYYYMMDD>-<uuid>`). A single coach edit to
// the series re-writes every future occurrence, and the DB-layer capture
// (`onAuditableWrite` Cloud Function) emits one `audit_log` doc per write — so the
// dashboard showed dozens of near-identical "Updated workout assignment" rows for
// one action. We collapse them back into a single row, mirroring how My Activity
// shows a recurrence as one action.

export interface RawAuditLogEntry {
  id: string;
  collection: string;
  docId: string;
  op: string;
  changedFields: string[];
  changedFieldCount: number;
  actorUid: string | null;
  trainerId: string | null;
  coachId: string | null;
  clientId: string | null;
  occurredAtISO: string | null;
}

export interface AuditLogGroup {
  /** Newest member (auditRaw is newest-first; preserved here). */
  head: RawAuditLogEntry;
  members: RawAuditLogEntry[];
  /** Series root when this is a collapsed recurring group (count > 1), else null. */
  root: string | null;
  count: number;
  /** Sorted YYYYMMDD occurrence dates, for collapsed groups. */
  dates: string[];
}

// Match is deliberately strict (full trailing UUID after an 8-digit date) so
// unrelated ids never collapse together.
const RECURRING_ASSIGNMENT_ID =
  /^(.*)-(\d{8})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recurringSeries(
  docId: string,
): { root: string; date: string } | null {
  const m = RECURRING_ASSIGNMENT_ID.exec(docId);
  return m ? { root: m[1], date: m[2] } : null;
}

/** "20270503" → "2027-05-03". */
export function fmtYmd(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Min→max occurrence-date range label, or null if none parse. */
export function dateRangeLabel(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return sorted.length === 1
    ? fmtYmd(sorted[0])
    : `${fmtYmd(sorted[0])} → ${fmtYmd(sorted[sorted.length - 1])}`;
}

/**
 * Collapse recurring-series writes. Entries sharing the SAME series root, op,
 * actor (uid/trainer), client and minute merge into one group; everything else
 * stays a standalone group of one. Input order (newest-first) is preserved, and
 * `head` is the newest member of each group.
 *
 * Only `workout_assignments` docs whose id matches the recurring pattern are
 * eligible — any other collection or a non-matching id is always its own row.
 */
export function groupRecurringAuditEntries(
  raw: RawAuditLogEntry[],
): AuditLogGroup[] {
  const groups: Array<{ members: RawAuditLogEntry[]; root: string | null }> = [];
  const indexByKey = new Map<string, number>();

  for (const r of raw) {
    const series =
      r.collection === "workout_assignments" ? recurringSeries(r.docId) : null;
    const key = series
      ? `rec|${r.collection}|${r.op}|${r.actorUid ?? ""}|${r.trainerId ?? ""}|${
          r.clientId ?? ""
        }|${series.root}|${(r.occurredAtISO ?? "").slice(0, 16)}`
      : `solo|${r.id}`;
    const at = indexByKey.get(key);
    if (at === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ members: [r], root: series?.root ?? null });
    } else {
      groups[at].members.push(r);
    }
  }

  return groups.map((g) => {
    const collapsed = g.members.length > 1;
    return {
      head: g.members[0],
      members: g.members,
      root: collapsed ? g.root : null,
      count: g.members.length,
      dates: collapsed
        ? g.members
            .map((m) => recurringSeries(m.docId)?.date)
            .filter((d): d is string => typeof d === "string")
        : [],
    };
  });
}
