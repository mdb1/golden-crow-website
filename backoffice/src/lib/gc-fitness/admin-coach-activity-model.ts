// admin-coach-activity-model.ts — #541: the admin «actividad de coaches» page reads the REAL
// `coach_activity` log (one durable event per coach action, written by the backoffice and
// by `editAssignmentRests`), not only the events reconstructed from four raw collections.
// Pure: decode + bulk-collapse. The reader is `admin-coach-activity-reader.ts`.

import { collapseActivityGroups } from "./coach-activity-grouping";
import type { CoachActivityLogKind } from "./coach-activity-log";

export const COACH_ACTIVITY_LOG_KINDS: readonly CoachActivityLogKind[] = [
  "workout_template",
  "exercise",
  "workout_assignment",
  "workout_rest_edited",
  "habit_assignment",
  "note",
  "progress_photo_request",
  "weight_request",
  "client_added",
  "nutrition_plan",
  "nutrition_library",
];

export interface AdminCoachActivityLogRow {
  id: string;
  trainerId: string;
  coachName: string | null;
  kind: CoachActivityLogKind | null;
  rawKind: string;
  title: string;
  detail: string | null;
  clientId: string | null;
  clientName: string | null;
  pendingEmail: string | null;
  deleted: boolean;
  occurredAtISO: string | null;
  groupId: string | null;
  groupCount: number;
}

function iso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") return (v as { toDate: () => Date }).toDate().toISOString();
  if (typeof v === "string") return v;
  return null;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function decodeCoachActivityLog(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
  names: ReadonlyMap<string, string>,
): AdminCoachActivityLogRow[] {
  const rows = docs.map(({ id, data }) => {
    const rawKind = str(data.kind) ?? "unknown";
    const trainerId = str(data.trainerId) ?? "";
    const clientId = str(data.clientId);
    return {
      id,
      trainerId,
      coachName: names.get(trainerId) ?? null,
      kind: (COACH_ACTIVITY_LOG_KINDS as readonly string[]).includes(rawKind) ? (rawKind as CoachActivityLogKind) : null,
      rawKind,
      title: str(data.title) ?? "—",
      detail: str(data.detail),
      clientId,
      clientName: clientId ? (names.get(clientId) ?? null) : null,
      pendingEmail: str(data.pendingEmail),
      deleted: data.deleted === true,
      occurredAtISO: iso(data.occurredAt),
      groupId: str(data.groupId),
    };
  });
  rows.sort((a, b) => (b.occurredAtISO ?? "").localeCompare(a.occurredAtISO ?? "") || a.id.localeCompare(b.id));
  // A bulk action writes one event per client with a shared groupId: one row, «Ana, Bruno y 12 más».
  return collapseActivityGroups(rows);
}
