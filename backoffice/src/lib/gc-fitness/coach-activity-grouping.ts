// coach-activity-grouping.ts
// Pure read-time collapse for "Mi Actividad" (#927).
//
// NO `"use server"` — synchronous exports only; the reader that uses this
// (`coach-activity-actions.ts`) is the server-action file. Same #785 discipline as the
// rest of the nutrition helpers.
//
// ── Why a collapse exists at all ────────────────────────────────────────────────────
//
// One coach action can be many events. A recurring WORKOUT series solves this at write
// time — `seriesAssignmentEvent` emits a single event keyed `asg:${seriesId}`, because
// every occurrence belongs to the same client, so one row can carry them all.
//
// A bulk nutrition assign (#927) cannot do that: its N events belong to N DIFFERENT
// clients. Collapsing at write would mean one event with `clientId: null`, and "Mi
// Actividad" filters by client server-side — so that single row would DISAPPEAR from
// every per-client view, which is the one question the feed is for. So the events stay
// per client, carry a shared `groupId`, and are folded back together here, only when the
// coach is looking at the unfiltered feed.
//
// ⚠️ A group can straddle a page boundary. The reader fetches a generous window and slices
// to the page afterwards, so a 40-client bulk landing across the cut renders as two rows
// ("×25" then "×15"). That is the same behaviour the admin audit timeline has always had
// for recurring series, and it is the honest failure mode: an over-count would hide rows.

export interface GroupableActivityRow {
  id: string;
  title: string;
  detail: string | null;
  clientId: string | null;
  clientName: string | null;
  groupId?: string | null;
}

/** How many client names a collapsed row spells out before it gives up and counts. */
export const GROUP_NAMES_SHOWN = 3;

/**
 * "Ana, Bruno y 12 más" — who a collapsed row covers.
 *
 * Names, not just a count: "15 clientes" tells a coach an action happened and nothing
 * about whether it hit the right people. Unnamed clients are dropped rather than rendered
 * as a raw uid, and the remainder keeps them in the count so the total never shrinks.
 */
export function describeGroupedClients(names: Array<string | null>): string | null {
  const named = names.filter((name): name is string => !!name && name.trim().length > 0);
  const total = names.length;
  if (total === 0) return null;
  if (named.length === 0) return `${total} clientes`;

  const shown = named.slice(0, GROUP_NAMES_SHOWN);
  const rest = total - shown.length;
  if (rest <= 0) {
    return shown.length === 1
      ? shown[0]!
      : `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}`;
  }
  return `${shown.join(", ")} y ${rest} más`;
}

/**
 * Folds rows sharing a `groupId` into one, preserving the input order (newest-first) and
 * keeping the FIRST row of each group as the head.
 *
 * The head's title is reused as-is: every member of a group is the same action on a
 * different client, so the titles are identical apart from nothing. Who the group covers
 * is APPENDED to the head's detail rather than replacing it — the validity window that
 * detail carries is shared by the whole bulk and stays true, while the names are the fact
 * the collapsed row can no longer show any other way.
 *
 * `clientId` is nulled on a collapsed row: it links to a client page, and a row covering
 * fifteen of them must not pick one. A group of ONE is returned untouched — that is what
 * a per-client filtered feed produces, and it must look exactly as it did before #927.
 */
export function collapseActivityGroups<T extends GroupableActivityRow>(
  rows: T[],
): Array<T & { groupCount: number }> {
  const out: Array<T & { groupCount: number }> = [];
  const indexByGroup = new Map<string, number>();
  const membersByGroup = new Map<string, Array<string | null>>();

  for (const row of rows) {
    const groupId = row.groupId;
    if (!groupId) {
      out.push({ ...row, groupCount: 1 });
      continue;
    }
    const at = indexByGroup.get(groupId);
    if (at === undefined) {
      indexByGroup.set(groupId, out.length);
      membersByGroup.set(groupId, [row.clientName ?? null]);
      out.push({ ...row, groupCount: 1 });
      continue;
    }
    const members = membersByGroup.get(groupId)!;
    members.push(row.clientName ?? null);
    out[at] = { ...out[at]!, groupCount: members.length };
  }

  for (const [groupId, at] of indexByGroup) {
    const members = membersByGroup.get(groupId)!;
    if (members.length < 2) continue;
    const head = out[at]!;
    out[at] = {
      ...head,
      clientId: null,
      clientName: null,
      detail:
        [head.detail, describeGroupedClients(members)]
          .filter((part): part is string => !!part && part.trim().length > 0)
          .join(" · ") || null,
    };
  }

  return out;
}
