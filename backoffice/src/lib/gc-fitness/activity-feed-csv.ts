// activity-feed-csv.ts — #503: the admin activity feed as CSV.
//
// Pure. The same cell escaping as the payments export (formula-injection guard,
// RFC 4180 quoting, BOM so Excel reads accents). Times go out twice: the exact
// UTC instant (sortable, unambiguous) and the wall clock in the zone the page
// shows (what the operator saw on screen).

import type { ActivityFeedEvent } from "./activity-feed-actions";
import { csvCell } from "./payments-model";

export const ACTIVITY_CSV_HEADERS = [
  "occurred_at_utc",
  "occurred_at_local",
  "category",
  "action",
  "title",
  "subject",
  "actor_name",
  "actor_email",
  "actor_uid",
  "client_name",
  "client_email",
  "client_uid",
  // #529 — whose roster the row belongs to.
  "coach_name",
  "coach_uid",
  "details",
  "source",
  "kind",
  "deletion",
] as const;

function localTime(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // sv-SE renders "YYYY-MM-DD HH:mm:ss" — sortable, locale-neutral.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function buildActivityFeedCsv(events: ActivityFeedEvent[], timeZone: string): string {
  const lines = [ACTIVITY_CSV_HEADERS.map(csvCell).join(",")];
  for (const e of events) {
    const details = [...e.meta, ...(e.notes ?? [])];
    if (e.occurrenceCount && e.occurrenceCount > 1) details.push(`×${e.occurrenceCount}`);
    lines.push(
      [
        e.occurredAtISO ?? "",
        localTime(e.occurredAtISO, timeZone),
        e.category,
        e.action,
        e.title,
        e.subject,
        e.actor?.name,
        e.actor?.email,
        e.actor?.uid,
        e.client?.name,
        e.client?.email,
        e.client?.uid ?? e.clientUid,
        e.coach?.name,
        e.coach?.uid,
        details.join(" · "),
        e.source,
        e.kind,
        e.isDeletion ? "yes" : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
