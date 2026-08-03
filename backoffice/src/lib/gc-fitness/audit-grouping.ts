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
  /** Capped snapshots of the changed fields (the activity feed reads them). */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AuditLogGroup<T extends RawAuditLogEntry = RawAuditLogEntry> {
  /** Newest member (auditRaw is newest-first; preserved here). */
  head: T;
  members: T[];
  /** Series root when this is a collapsed recurring group (count > 1), else null. */
  root: string | null;
  count: number;
  /** Sorted YYYYMMDD occurrence dates, for collapsed groups. */
  dates: string[];
}

// Match is deliberately strict (full trailing UUID after an 8-digit date) so
// unrelated ids never collapse together.
//
// The optional `self-` segment covers CLIENT-created assignments, whose ids are
// `asg-<uid>-<YYYYMMDD>-self-<UUID>` (#392). Without it every self-assigned
// occurrence stayed its own row — that is the literal `asg-…-20260821-self-… ·
// templateSnapshot, updatedAt` repetition reported in #671.
const RECURRING_ASSIGNMENT_ID =
  /^(.*)-(\d{8})-(?:self-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recurringSeries(
  docId: string,
): { root: string; date: string } | null {
  const m = RECURRING_ASSIGNMENT_ID.exec(docId);
  return m ? { root: m[1], date: m[2] } : null;
}

/**
 * #697 — which ROUTINE an assignment write is about.
 *
 * ⚠️ **The id's "series root" does not identify a series.** Both id shapes are
 * `asg-<clientUid>-<YYYYMMDD>-…` (coach-assigned) and
 * `asg-<clientUid>-<YYYYMMDD>-self-…` (client-created, #392), so the root
 * captured above is `asg-<clientUid>` — the **person**, shared by every routine
 * they own. Grouping on it alone merged writes to DIFFERENT routines whenever
 * they landed in the same minute under the same actor and op, and only the
 * newest member's name survived: that is the literal missing-entries report in
 * #697, where moving one routine off Friday and another onto it showed as a
 * single row naming one of them.
 *
 * `templateId` is the discriminator, and it is reliably present exactly where it
 * matters: `onAuditableWrite` snapshots ALL keys on a create and on a delete
 * (`changedFields` = every key of after/before), which is the shape a recurrence
 * edit produces. On an update it is only there if it changed — so an unknown
 * template falls back to the old client-wide behavior rather than splitting
 * every occurrence of one edit into its own row.
 */
export function assignmentTemplateId(entry: RawAuditLogEntry): string | null {
  for (const snapshot of [entry.after, entry.before]) {
    const value = snapshot?.templateId;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
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
export function groupRecurringAuditEntries<T extends RawAuditLogEntry>(
  raw: T[],
): Array<AuditLogGroup<T>> {
  const groups: Array<{ members: T[]; root: string | null }> = [];
  const indexByKey = new Map<string, number>();

  for (const r of raw) {
    const series =
      r.collection === "workout_assignments" ? recurringSeries(r.docId) : null;
    const key = series
      ? `rec|${r.collection}|${r.op}|${r.actorUid ?? ""}|${r.trainerId ?? ""}|${
          r.clientId ?? ""
        }|${series.root}|${assignmentTemplateId(r) ?? ""}|${
          (r.occurredAtISO ?? "").slice(0, 16)
        }`
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

/**
 * How far apart the delete batch and the re-expansion of one recurrence edit may
 * land and still be recognised as the same action. `editAssignmentRecurrence`
 * issues them back to back, but they are separate batches whose `occurredAt`
 * stamps can straddle a minute boundary — which is also why this cannot key on
 * the minute bucket the grouping above uses.
 */
const RECURRENCE_EDIT_WINDOW_MS = 2 * 60 * 1000;

export interface RecurrenceEditLink {
  /** Index of the create group that re-expanded the series. */
  createIndex: number;
  /** Index of the delete group it replaced — folded away by the caller. */
  deleteIndex: number;
}

/**
 * #697 — pair "deleted the future occurrences" with "wrote the new ones".
 *
 * Changing a recurring routine's weekday is `editAssignmentRecurrence`:
 * delete-future, then re-expand. The feed showed the halves as two unrelated
 * rows, and — worse — the re-expansion tripped `isAutoExtendedOccurrence`,
 * because that heuristic reads a `scheduleStartCivil` anchor older than the
 * write as "the app topped the horizon up by itself". A recurrence edit
 * deliberately CARRIES the original anchor (it preserves the series window), so
 * every edit looked automatic and rendered with no actor at all. That is the
 * "solo aparece que se extendió" half of the report.
 *
 * The tell an anchor cannot give: an automatic top-up only ever ADDS. A delete
 * batch for the same series, same routine and same client, moments before the
 * creates, means a person changed something. Pairing them here also lets the two
 * rows render as the single action they were.
 */
export function findRecurrenceEdits<T extends RawAuditLogEntry>(
  groups: Array<AuditLogGroup<T>>,
): RecurrenceEditLink[] {
  const links: RecurrenceEditLink[] = [];
  const claimedDeletes = new Set<number>();

  groups.forEach((createGroup, createIndex) => {
    const head = createGroup.head;
    if (head.collection !== "workout_assignments" || head.op !== "create") return;
    const series = recurringSeries(head.docId);
    if (!series) return;
    const at = Date.parse(head.occurredAtISO ?? "");
    if (Number.isNaN(at)) return;
    const templateId = assignmentTemplateId(head);

    const deleteIndex = groups.findIndex((candidate, i) => {
      if (i === createIndex || claimedDeletes.has(i)) return false;
      const d = candidate.head;
      if (d.collection !== "workout_assignments" || d.op !== "delete") return false;
      if ((d.clientId ?? null) !== (head.clientId ?? null)) return false;
      if (recurringSeries(d.docId)?.root !== series.root) return false;
      // Same routine. Both sides are full snapshots (create and delete capture
      // every key), so an unknown template here means the pairing genuinely
      // cannot be established — not that it should be assumed.
      const otherTemplate = assignmentTemplateId(d);
      if (!templateId || !otherTemplate || otherTemplate !== templateId) return false;
      const dAt = Date.parse(d.occurredAtISO ?? "");
      if (Number.isNaN(dAt)) return false;
      return Math.abs(at - dAt) <= RECURRENCE_EDIT_WINDOW_MS;
    });

    if (deleteIndex >= 0) {
      claimedDeletes.add(deleteIndex);
      links.push({ createIndex, deleteIndex });
    }
  });

  return links;
}
