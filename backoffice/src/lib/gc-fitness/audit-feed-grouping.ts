// audit-feed-grouping.ts — web «Admin · Monitoreo más claro: una fila por recurrencia».
//
// Pure (no Firestore, no "use server"): the DISPLAY-side collapse of the admin
// Monitoring feed, run over the finished, merged, filtered events of one page.
//
// ── WHY ANOTHER COLLAPSE ─────────────────────────────────────────────────────
//
// `audit-grouping.ts` collapses the RAW writes one action produced (same series
// root + same minute). It cannot see what the owner reported on 2026-11-18:
//
//   «Ana Oller asignó un workout Día 3 / Juanma → Juanma Portas · Fecha: 2026-12-26»
//   … the same row again for 12-19, 12-12, 12-05, 11-28, 11-21 and 11-14.
//
// Prod shows those seven are SEVEN separate single assigns (no `seriesId`), made
// by hand 13–32 s apart — one per Saturday. Each one is a different minute and a
// different doc, so nothing below the event level can tell they are one intent.
// The same goes for «eliminó un workout asignado DIA 1 / DIA 2 / DIA 3 → Mercedes»:
// several series deleted in one sitting, each already a single row, but seven rows
// for one decision.
//
// So this pass works on EVENTS (both sources: `audit_log` and `coach_activity`), in
// two steps:
//
//  1. **Series.** Same actor + same client + same op on the same ROUTINE, either
//     sharing a `seriesId` or — with no id, the case above — written within
//     `SERIES_GAP_MS` of each other. One row: «asignó Día 3 → Juanma · semanal
//     (sábados) · 7 fechas · 14 nov → 26 dic 2026», expandable to the dates.
//  2. **Siblings.** What is left, same actor + same client + same op + same
//     category within `SIBLING_GAP_MS`: «eliminó 7 workouts → Mercedes», expandable
//     to the rows it holds (which can themselves be series).
//
// Nothing is dropped: every grouped event stays reachable as a child, and a
// different op, client, actor or routine never merges (tests pin each one).
// The CSV export does not go through here — it keeps one line per event.

import type { FeedAction, FeedCategory } from "./activity-feed-model";

/** Gap between consecutive writes of ONE hand-made series (prod: 13–75 s). */
export const SERIES_GAP_MS = 5 * 60 * 1000;
/** With a shared `seriesId` the intent is certain; only bound it loosely. */
export const SERIES_ID_GAP_MS = 30 * 60 * 1000;
/** Gap between sibling actions of one sitting. */
export const SIBLING_GAP_MS = 10 * 60 * 1000;

/** What the reader attaches to every workout-assignment event (both sources). */
export interface FeedSeriesHint {
  /** The occurrence docs' shared id; null for single assigns. */
  seriesId: string | null;
  /** The routine; null when the capture did not carry it (coach rows). */
  templateId: string | null;
  /** "YYYY-MM-DD" occurrence dates this event covers (may be partial). */
  dates: string[];
  /** How many occurrences this event covers (≥ dates.length). */
  dateCount: number;
  /** The `recurrence` map, when the doc had one. */
  recurrence: unknown;
  /** A cadence the source only gave as text («Recurrencia: semanal»). */
  cadenceText: string | null;
}

/** The subset of `ActivityFeedEvent` the grouping reads. */
export interface GroupableEvent {
  id: string;
  source: string;
  category: FeedCategory;
  action: FeedAction;
  occurredAtISO: string | null;
  subject: string | null;
  isDeletion: boolean;
  kind: string;
  clientUid: string | null;
  actor: { uid: string | null } | null;
  client: { uid: string | null } | null;
  series?: FeedSeriesHint | null;
}

export type FeedCadence =
  | { kind: "daily" }
  | { kind: "weekly"; weekdays: number[] /* JS getDay: 0 = Sun */ }
  | { kind: "everyN"; n: number }
  | { kind: "monthly"; day: number | null }
  | { kind: "text"; text: string };

export interface SeriesEntry<E extends GroupableEvent> {
  type: "series";
  id: string;
  head: E;
  /** Newest first, `head` included. */
  members: E[];
  /** Sorted, de-duplicated "YYYY-MM-DD". */
  dates: string[];
  dateCount: number;
  cadence: FeedCadence | null;
}

export interface EventEntry<E extends GroupableEvent> {
  type: "event";
  id: string;
  event: E;
}

export interface SiblingsEntry<E extends GroupableEvent> {
  type: "siblings";
  id: string;
  head: E;
  /** Newest first. */
  members: Array<EventEntry<E> | SeriesEntry<E>>;
  /** Total events inside (a series member counts its own events). */
  eventCount: number;
  /** How many items the row says it holds (a series counts as one workout). */
  itemCount: number;
}

export type FeedEntry<E extends GroupableEvent> = EventEntry<E> | SeriesEntry<E> | SiblingsEntry<E>;

// ─────────────────────────────────────────────────────────────────────────────
// Hints (called by the reader)
// ─────────────────────────────────────────────────────────────────────────────

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?![\d:T])/g;

/** "20261226" → "2026-12-26"; anything else → null. */
function ymdToIso(ymd: string | null | undefined): string | null {
  if (!ymd || !/^\d{8}$/.test(ymd)) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** Hint for an `audit_log` workout-assignment event (its head record + collapsed group). */
export function auditSeriesHint(args: {
  after: Record<string, unknown> | null | undefined;
  before: Record<string, unknown> | null | undefined;
  templateId: string | null;
  /** The collapsed group's YYYYMMDD dates (empty for a single write). */
  groupDates: string[];
  /** The id-derived YYYYMMDD date of the head doc, if any. */
  docDate: string | null;
  count: number;
}): FeedSeriesHint {
  const after = args.after ?? {};
  const before = args.before ?? {};
  const fromGroup = args.groupDates.map(ymdToIso).filter((d): d is string => !!d);
  const own = str(after.scheduledFor) ?? str(before.scheduledFor) ?? ymdToIso(args.docDate);
  const dates = fromGroup.length > 0 ? fromGroup : own ? [own] : [];
  return {
    seriesId: str(after.seriesId) ?? str(before.seriesId),
    templateId: args.templateId,
    dates,
    dateCount: Math.max(args.count, dates.length, 1),
    recurrence: after.recurrence ?? before.recurrence ?? null,
    cadenceText: null,
  };
}

/**
 * Hint for a `coach_activity` workout-assignment event. Its id is the bridge
 * (`asg:<seriesId>` for a series, `asg:asg-<client>-<date>-…` for a single), and the
 * dates only exist inside the stored detail: «Fecha: 2026-12-26» or
 * «Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14».
 */
export function coachSeriesHint(eventId: string, detail: string | null): FeedSeriesHint {
  const rest = eventId.startsWith("asg:") ? eventId.slice(4) : "";
  const seriesId = rest && !rest.startsWith("asg-") ? rest : null;
  const text = detail ?? "";
  const dates = [...text.matchAll(ISO_DATE)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
  const counted = /(\d+)\s+fechas/.exec(text);
  const cadence = /Recurrencia:\s*([^·]+)/.exec(text);
  // A series detail only names the two ends of its span; `dateCount` then exceeds
  // `dates.length`, which is what stops `inferCadence` from guessing off them.
  return {
    seriesId,
    templateId: null,
    dates,
    dateCount: Math.max(counted ? Number(counted[1]) : dates.length, 1),
    recurrence: null,
    cadenceText: cadence ? cadence[1].trim() : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cadence
// ─────────────────────────────────────────────────────────────────────────────

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Structured cadence of a `workout_assignments.recurrence` map. */
export function cadenceFromRecurrence(recurrence: unknown): FeedCadence | null {
  if (!recurrence || typeof recurrence !== "object") return null;
  const r = recurrence as Record<string, unknown>;
  switch (r.kind) {
    case "daily":
      return { kind: "daily" };
    case "weekly": {
      const d = num(r.weekday);
      return { kind: "weekly", weekdays: d === null ? [] : [((d % 7) + 7) % 7] };
    }
    case "weekly_days": {
      const days = Array.isArray(r.weekdays)
        ? r.weekdays.map(num).filter((d): d is number => d !== null).map((d) => ((d % 7) + 7) % 7)
        : [];
      return { kind: "weekly", weekdays: [...new Set(days)].sort((a, b) => a - b) };
    }
    case "every_n_days": {
      const n = num(r.everyN);
      return n === 1 ? { kind: "daily" } : n ? { kind: "everyN", n } : null;
    }
    case "monthly":
      return { kind: "monthly", day: num(r.dayOfMonth) };
    default:
      return null;
  }
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T12:00:00.000Z`) / 86_400_000);
}

/** JS weekday (0 = Sunday) of a civil "YYYY-MM-DD". */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getUTCDay();
}

/**
 * The cadence a hand-made series of dates follows, when it follows one: every 7
 * days → weekly on that weekday, every day → daily, every N → «cada N días».
 * Irregular dates (prod: Agos got 6, 9, 18, 27, 30 nov) → null: the row then just
 * says how many dates and the span, which is the truth.
 */
export function inferCadence(dates: string[]): FeedCadence | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 3) return null;
  const steps = new Set<number>();
  for (let i = 1; i < sorted.length; i += 1) steps.add(dayNumber(sorted[i]) - dayNumber(sorted[i - 1]));
  if (steps.size !== 1) return null;
  const step = [...steps][0];
  if (step === 1) return { kind: "daily" };
  if (step === 7) return { kind: "weekly", weekdays: [weekdayOf(sorted[0])] };
  return step > 1 ? { kind: "everyN", n: step } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouping
// ─────────────────────────────────────────────────────────────────────────────

function isAssignmentEvent(e: GroupableEvent): boolean {
  return e.kind.startsWith("workout_assignments.") || e.kind === "workout_assignment";
}

function ms(e: GroupableEvent): number {
  return Date.parse(e.occurredAtISO ?? "");
}

function normalizedSubject(e: GroupableEvent): string | null {
  const s = e.subject?.trim().toLocaleLowerCase("es");
  return s ? s : null;
}

function actorUid(e: GroupableEvent): string {
  return e.actor?.uid ?? "∅";
}

function clientUid(e: GroupableEvent): string {
  return e.clientUid ?? e.client?.uid ?? "∅";
}

/** Who · to whom · which op. Never merges across any of the three. */
function opKey(e: GroupableEvent): string {
  return `${actorUid(e)}|${clientUid(e)}|${e.action}|${e.isDeletion ? "del" : "keep"}`;
}

/** Same routine? An id on both sides decides; otherwise the shown name does. */
function sameRoutine(a: GroupableEvent, b: GroupableEvent): boolean {
  const sa = a.series?.seriesId;
  const sb = b.series?.seriesId;
  if (sa && sb) return sa === sb;
  const ta = a.series?.templateId;
  const tb = b.series?.templateId;
  if (ta && tb) return ta === tb;
  const na = normalizedSubject(a);
  const nb = normalizedSubject(b);
  return !!na && na === nb;
}

function seriesCandidate(e: GroupableEvent): boolean {
  // A move keeps its own before → after dates and is about ONE workout (#785);
  // it can still join a sibling group below, where each child keeps its line.
  return isAssignmentEvent(e) && e.action !== "move" && !Number.isNaN(ms(e));
}

function buildSeries<E extends GroupableEvent>(members: E[]): SeriesEntry<E> {
  const dates = [...new Set(members.flatMap((m) => m.series?.dates ?? []))].sort();
  const dateCount = Math.max(
    members.reduce((sum, m) => sum + Math.max(m.series?.dateCount ?? 1, 1), 0),
    dates.length,
  );
  const fromRule = members
    .map((m) => cadenceFromRecurrence(m.series?.recurrence))
    .find((c): c is FeedCadence => !!c);
  const fromText = members.map((m) => m.series?.cadenceText).find((t): t is string => !!t);
  const cadence =
    fromRule ??
    // Only when every date is known can the step be trusted.
    (dates.length === dateCount ? inferCadence(dates) : null) ??
    (fromText ? { kind: "text" as const, text: fromText } : null);
  return { type: "series", id: `series:${members[0].id}`, head: members[0], members, dates, dateCount, cadence };
}

/**
 * Step 1 — one row per series. Input newest-first; output keeps the position of
 * each group's NEWEST member.
 */
export function groupSeriesEvents<E extends GroupableEvent>(events: E[]): Array<EventEntry<E> | SeriesEntry<E>> {
  const slots: Array<{ members: E[]; oldestMs: number; series: boolean }> = [];
  const open = new Map<string, number[]>();

  for (const e of events) {
    if (!seriesCandidate(e)) {
      slots.push({ members: [e], oldestMs: NaN, series: false });
      continue;
    }
    const key = opKey(e);
    const at = ms(e);
    const candidates = open.get(key) ?? [];
    const hit = candidates.find((i) => {
      const slot = slots[i];
      const head = slot.members[0];
      if (!sameRoutine(head, e)) return false;
      const sharedId = !!head.series?.seriesId && head.series.seriesId === e.series?.seriesId;
      return slot.oldestMs - at <= (sharedId ? SERIES_ID_GAP_MS : SERIES_GAP_MS);
    });
    if (hit !== undefined) {
      slots[hit].members.push(e);
      slots[hit].oldestMs = at;
      continue;
    }
    open.set(key, [...candidates, slots.length]);
    slots.push({ members: [e], oldestMs: at, series: true });
  }

  return slots.map((slot) =>
    slot.series && slot.members.length > 1
      ? buildSeries(slot.members)
      : { type: "event" as const, id: slot.members[0].id, event: slot.members[0] },
  );
}

function entryHead<E extends GroupableEvent>(entry: EventEntry<E> | SeriesEntry<E>): E {
  return entry.type === "event" ? entry.event : entry.head;
}

/**
 * Step 2 — a sitting of the same small action. Needs a real actor (an
 * unattributed write has nobody whose sitting it was) and keeps the client in
 * the key, so «eliminó 7 workouts → Mercedes» never absorbs another client's row.
 */
export function groupSiblingEntries<E extends GroupableEvent>(
  entries: Array<EventEntry<E> | SeriesEntry<E>>,
): Array<FeedEntry<E>> {
  const slots: Array<{ members: Array<EventEntry<E> | SeriesEntry<E>>; oldestMs: number }> = [];
  const open = new Map<string, number>();

  for (const entry of entries) {
    const head = entryHead(entry);
    const at = ms(head);
    // The oldest write of a series is when its sitting started.
    const oldest = entry.type === "series" ? ms(entry.members[entry.members.length - 1]) : at;
    if (!head.actor?.uid || Number.isNaN(at)) {
      slots.push({ members: [entry], oldestMs: NaN });
      continue;
    }
    const key = `${opKey(head)}|${head.category}`;
    const index = open.get(key);
    if (index !== undefined && slots[index].oldestMs - at <= SIBLING_GAP_MS) {
      slots[index].members.push(entry);
      slots[index].oldestMs = Number.isNaN(oldest) ? at : oldest;
      continue;
    }
    open.set(key, slots.length);
    slots.push({ members: [entry], oldestMs: Number.isNaN(oldest) ? at : oldest });
  }

  return slots.map((slot) => {
    if (slot.members.length === 1) return slot.members[0];
    const head = entryHead(slot.members[0]);
    return {
      type: "siblings" as const,
      id: `siblings:${head.id}`,
      head,
      members: slot.members,
      eventCount: slot.members.reduce((n, m) => n + (m.type === "series" ? m.members.length : 1), 0),
      itemCount: slot.members.length,
    };
  });
}

/** Both steps. Input and output newest-first. */
export function groupFeedEntries<E extends GroupableEvent>(events: E[]): Array<FeedEntry<E>> {
  return groupSiblingEntries(groupSeriesEvents(events));
}

/** Events inside an entry (for per-day counts). */
export function entryEventCount<E extends GroupableEvent>(entry: FeedEntry<E>): number {
  if (entry.type === "event") return 1;
  if (entry.type === "series") return entry.members.length;
  return entry.eventCount;
}

/**
 * The i18n key (`admin.audit.groups.<key>`) of a sibling group's plural title, or
 * null when no plural sentence fits — the row then keeps the head's own title and
 * says «y N más».
 */
export function siblingTitleKey(category: FeedCategory, action: FeedAction, isDeletion: boolean): string | null {
  if (category === "schedule") {
    if (isDeletion || action === "delete") return "workoutsDeleted";
    if (action === "assign") return "workoutsAssigned";
    if (action === "move") return "workoutsMoved";
    if (action === "update") return "workoutsUpdated";
  }
  if (category === "habit") {
    if (isDeletion || action === "delete") return "habitsDeleted";
    if (action === "assign" || action === "create") return "habitsAssigned";
  }
  if (category === "exercise") {
    if (isDeletion || action === "delete") return "exercisesDeleted";
    if (action === "create") return "exercisesCreated";
  }
  if (category === "routine") {
    if (isDeletion || action === "delete") return "routinesDeleted";
    if (action === "create") return "routinesCreated";
  }
  return null;
}

/** «DIA 1, DIA 2, DIA 3 +2»: the distinct names a sibling group holds. */
export function siblingSubjects<E extends GroupableEvent>(entry: SiblingsEntry<E>, max = 3): {
  names: string[];
  more: number;
} {
  const names: string[] = [];
  for (const m of entry.members) {
    const s = entryHead(m).subject?.trim();
    if (s && !names.includes(s)) names.push(s);
  }
  return { names: names.slice(0, max), more: Math.max(names.length - max, 0) };
}
