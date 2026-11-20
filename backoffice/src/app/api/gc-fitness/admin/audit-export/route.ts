// GET /api/gc-fitness/admin/audit-export?<same params as /gc-fitness/admin/audit>
//
// #503 — the activity feed as CSV, for the filters on screen. Walks the cursor
// pages (newest first) up to EXPORT_MAX_EVENTS so an open-ended export can't
// turn into an unbounded read; the filename says when it was cut.

import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  listActivityFeedPage,
  type ActivityFeedEvent,
} from "@/lib/gc-fitness/activity-feed-actions";
import { buildActivityFeedCsv } from "@/lib/gc-fitness/activity-feed-csv";
import { auditFeedFilters, parseAuditFeedParams } from "@/lib/gc-fitness/audit-feed-params";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 400;
const EXPORT_MAX_EVENTS = 4000;
const EXPORT_MAX_PAGES = 15;

export async function GET(request: Request) {
  try {
    await getCurrentAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const sp: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    sp[key] = all.length > 1 ? all : all[0]!;
  }
  const params = parseAuditFeedParams(sp);
  const timeZone = await getTrainerTimezone();
  const filters = auditFeedFilters(params, timeZone);

  const events: ActivityFeedEvent[] = [];
  let cursor: string | null = null;
  let truncated = false;
  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const result = await listActivityFeedPage({ ...filters, limit: PAGE_SIZE, cursor });
    events.push(...result.events);
    cursor = result.nextCursor;
    if (!cursor) break;
    if (events.length >= EXPORT_MAX_EVENTS) break;
  }
  if (cursor) truncated = true;

  const today = civilDateFormat(new Date(), timeZone);
  const name = `activity-${params.tab}-${today}${truncated ? "-partial" : ""}.csv`;
  return new NextResponse(buildActivityFeedCsv(events.slice(0, EXPORT_MAX_EVENTS), timeZone), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
