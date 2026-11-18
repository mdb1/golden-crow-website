// ActivityFeedList.tsx — the admin Monitoring & Observability feed (issue #671).
//
// A day-grouped, newest-first log of what is happening in the app, replacing the
// six-column table of raw Firestore writes. Every row answers WHO · WHAT · TO
// WHAT, and links to the detail: the workout log, the client's god-mode profile,
// the exercise. The actor and the client are their own links, so the row never
// nests one anchor inside another.
//
// Server Component (no interactivity beyond native <details>): rendering happens
// once per filter submit. Las horas y el agrupado por día se muestran en la zona
// del proyecto (#736), no en UTC.
//
// «Una fila por recurrencia» (2026-11-18): the events are folded by
// `audit-feed-grouping.ts` before rendering — a series (or a hand-made run of
// single assigns of one routine) is ONE row with its cadence, date count and
// span, and a sitting of sibling actions on one client is ONE row with a count.
// Both expand (<details>) to every event they hold, so nothing is hidden for
// good. ISO dates inside the meta lines render as «14 nov 2026».

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  Apple,
  BotMessageSquare,
  CalendarClock,
  Camera,
  ChevronRight,
  Dumbbell,
  HeartHandshake,
  Inbox,
  ListChecks,
  MessagesSquare,
  Repeat,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ActivityFeedEvent,
  FeedPerson,
} from "@/lib/gc-fitness/activity-feed-actions";
import type { FeedCategory } from "@/lib/gc-fitness/activity-feed-model";
import { feedTitleKey } from "@/lib/gc-fitness/activity-feed-titles";
import {
  daySeparatorLabel,
  humanDate,
  humanDateRange,
  humanizeDatesInText,
  relativeTime,
  weekdayPlural,
} from "@/lib/gc-fitness/audit-feed-format";
import {
  entryEventCount,
  groupFeedEntries,
  siblingSubjects,
  siblingTitleKey,
  type FeedCadence,
  type FeedEntry,
  type SeriesEntry,
  type SiblingsEntry,
} from "@/lib/gc-fitness/audit-feed-grouping";
import { cn } from "@/lib/utils";

export type FeedDensity = "comfortable" | "compact";

const CATEGORY_ICON: Record<FeedCategory, React.ComponentType<{ className?: string }>> = {
  workout: Dumbbell,
  schedule: CalendarClock,
  routine: Repeat,
  habit: ListChecks,
  nutrition: Apple,
  exercise: Sparkles,
  photo: Camera,
  account: UserRound,
  coach: Activity,
  admin: ShieldAlert,
  // #529
  billing: Wallet,
  progress: TrendingUp,
  chat: MessagesSquare,
  social: HeartHandshake,
  challenge: Trophy,
  corvo: BotMessageSquare,
  other: Activity,
};

/** Token-based tint per category — no raw hex, both themes work. */
const CATEGORY_TONE: Record<FeedCategory, string> = {
  workout: "bg-chart-3/15 text-chart-3",
  schedule: "bg-chart-1/15 text-chart-1",
  routine: "bg-chart-2/15 text-chart-2",
  habit: "bg-chart-4/15 text-chart-4",
  nutrition: "bg-chart-2/15 text-chart-2",
  exercise: "bg-chart-5/15 text-chart-5",
  photo: "bg-primary/15 text-primary",
  account: "bg-chart-1/15 text-chart-1",
  coach: "bg-muted text-foreground",
  admin: "bg-destructive/10 text-destructive",
  billing: "bg-chart-4/15 text-chart-4",
  progress: "bg-chart-3/15 text-chart-3",
  chat: "bg-chart-1/15 text-chart-1",
  social: "bg-chart-5/15 text-chart-5",
  challenge: "bg-chart-4/15 text-chart-4",
  corvo: "bg-primary/15 text-primary",
  other: "bg-muted text-muted-foreground",
};

/**
 * #736 — todo lo de abajo se formatea en la zona horaria del proyecto, no en UTC.
 *
 * ⚠️ **El bug no era sólo la hora.** Estas funciones cortaban el ISO como string
 * (`iso.slice(11, 16)`, `iso.slice(0, 10)`), así que el AGRUPADO POR DÍA y los rótulos
 * "Hoy/Ayer" también eran UTC: un evento de las 22:00 de Buenos Aires cae en el día
 * siguiente en UTC y aparecía bajo el encabezado equivocado.
 *
 * La zona va FIJA y no sale del browser: esto es un Server Component, así que
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` devolvería la del SERVIDOR (UTC en
 * Vercel), que es exactamente el bug que se está arreglando.
 */
/** "2026-07-31T20:37:02.331Z" → "17:37" en la zona pedida. */
function timeOfDay(iso: string | null, timeZone: string): string {
  if (!iso) return "--:--";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "--:--";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
}

/**
 * "2026-07-31T…" → el día CIVIL en el que cayó, que es la clave de agrupado.
 *
 * `en-CA` porque da "YYYY-MM-DD" — el mismo formato que `civilDateFormat`, así que la clave
 * que se calcula acá y el "hoy" que llega por prop son comparables sin normalizar nada.
 */
const NO_DATE = "no-date";

function dayKey(iso: string | null, timeZone: string): string {
  if (!iso) return NO_DATE;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return NO_DATE;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

/** Full instant for the time's tooltip: «sáb 14 nov 2026, 01:00». */
function fullInstant(iso: string | null, timeZone: string, locale: string): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return new Intl.DateTimeFormat(locale.startsWith("es") ? "es-AR" : "en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(ms);
}

function PersonLink({ person, muted }: { person: FeedPerson; muted?: boolean }) {
  const className = cn(
    "font-medium underline-offset-2 hover:underline",
    muted && "text-muted-foreground",
  );
  return person.href ? (
    <Link href={person.href} className={className} title={person.email ?? person.uid ?? ""}>
      {person.name}
    </Link>
  ) : (
    <span className={className} title={person.email ?? person.uid ?? ""}>
      {person.name}
    </span>
  );
}

/** "Terminó un workout" → "terminó un workout" (reads as one sentence after the
 *  actor name, without lowercasing acronyms further along the phrase). */
function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLocaleLowerCase("es") + text.slice(1) : text;
}

function useEventTitle(): (event: ActivityFeedEvent) => string {
  const tTitles = useTranslations("admin.audit.titles");
  // #513 — the title arrives as the model's Spanish sentence; known ones render
  // in the viewer's language, unknown ones (a newer writer) verbatim.
  return (event) => {
    const key = feedTitleKey(event.title);
    return key ? tTitles(key) : event.title;
  };
}

function useCadenceLabel(): (cadence: FeedCadence | null) => string | null {
  const t = useTranslations("admin.audit.cadence");
  const locale = useLocale();
  return (cadence) => {
    if (!cadence) return null;
    switch (cadence.kind) {
      case "daily":
        return t("daily");
      case "weekly":
        return cadence.weekdays.length > 0
          ? t("weekly", { days: cadence.weekdays.map((d) => weekdayPlural(d, locale)).join(", ") })
          : t("weeklyAny");
      case "everyN":
        return t("everyN", { n: cadence.n });
      case "monthly":
        return cadence.day === null ? t("monthlyAny") : t("monthly", { day: cadence.day });
      case "text":
        return cadence.text;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row pieces
// ─────────────────────────────────────────────────────────────────────────────

function CategoryIcon({
  category,
  isDeletion,
  compact,
}: {
  category: FeedCategory;
  isDeletion: boolean;
  compact: boolean;
}) {
  // A deletion reads as one at a glance: trash icon on the destructive tint,
  // whatever its category (AA: destructive text on its own 10% tint).
  const Icon = isDeletion ? Trash2 : (CATEGORY_ICON[category] ?? Activity);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        compact ? "mt-0 h-6 w-6" : "mt-0.5 h-8 w-8",
        isDeletion ? "bg-destructive/10 text-destructive" : CATEGORY_TONE[category],
      )}
      aria-hidden
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}

function TimeColumn({
  iso,
  timeZone,
  nowMs,
  badge,
  low,
}: {
  iso: string | null;
  timeZone: string;
  nowMs: number;
  badge?: string | null;
  low?: boolean;
}) {
  const locale = useLocale();
  const relative = relativeTime(iso, nowMs, locale);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <time
        dateTime={iso ?? undefined}
        title={fullInstant(iso, timeZone, locale)}
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        {timeOfDay(iso, timeZone)}
      </time>
      {relative ? (
        <span className="text-[11px] text-muted-foreground" data-testid="feed-row-relative">
          {relative}
        </span>
      ) : null}
      {badge ? (
        <Badge variant="secondary" className="font-normal">
          {badge}
        </Badge>
      ) : null}
      {low ? (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">raw</span>
      ) : null}
    </div>
  );
}

function MetaLine({ items, notes }: { items: string[]; notes?: string[] }) {
  const locale = useLocale();
  const shown = items.filter((m) => m && m.trim().length > 0);
  if (shown.length === 0 && !notes?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {shown.map((m, i) => (
        <span key={`m${i}`} className="[overflow-wrap:anywhere]">
          {i > 0 ? "· " : ""}
          {humanizeDatesInText(m, locale)}
        </span>
      ))}
      {(notes ?? []).map((n, i) => (
        <Badge key={`n${i}`} variant="secondary" className="font-normal">
          {n}
        </Badge>
      ))}
    </div>
  );
}

/** actor · verb · object → target (· coach X). */
function Sentence({
  event,
  title,
  subject,
}: {
  event: ActivityFeedEvent;
  title: string;
  /** Overrides the event's own subject (a sibling group names several). */
  subject?: React.ReactNode;
}) {
  const t = useTranslations("admin.audit");
  const ownSubject = event.subject?.trim();
  const subjectNode =
    subject !== undefined ? (
      subject
    ) : ownSubject ? (
      event.href ? (
        <Link
          href={event.href}
          className="font-semibold underline-offset-2 hover:underline [overflow-wrap:anywhere]"
        >
          {ownSubject}
        </Link>
      ) : (
        <span className="font-semibold [overflow-wrap:anywhere]">{ownSubject}</span>
      )
    ) : event.href ? (
      <Link href={event.href} className="text-xs underline underline-offset-2">
        {t("viewDetail")}
      </Link>
    ) : null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
      {event.actor ? <PersonLink person={event.actor} /> : null}
      <span className={event.isDeletion ? "text-foreground" : "text-muted-foreground"}>
        {event.actor ? lowerFirst(title) : title}
      </span>
      {subjectNode}
      {event.client ? (
        <span className="text-muted-foreground">
          {" → "}
          <PersonLink person={event.client} muted />
        </span>
      ) : null}
      {/* #529 — whose roster this happened in, when the coach is not already the actor. */}
      {event.coach && event.coach.uid !== event.actor?.uid ? (
        <span className="text-xs text-muted-foreground" data-testid="feed-row-coach">
          {"· "}
          {t("coachOf")} <PersonLink person={event.coach} muted />
        </span>
      ) : null}
    </div>
  );
}

function rowClass(isDeletion: boolean, compact: boolean): string {
  return cn(
    "flex gap-3 border-l-2 px-4 transition-colors hover:bg-muted/40",
    compact ? "py-1.5" : "py-3",
    // Kept visibly distinct (#671) but legible: a 5% tint + a solid left rule,
    // the text itself stays at foreground contrast.
    isDeletion ? "border-l-destructive bg-destructive/5" : "border-l-transparent",
  );
}

interface RowContext {
  timeZone: string;
  nowMs: number;
  compact: boolean;
}

function FeedRow({ event, ctx }: { event: ActivityFeedEvent; ctx: RowContext }) {
  const title = useEventTitle()(event);
  return (
    <li className={rowClass(event.isDeletion, ctx.compact)} data-testid="feed-row">
      <CategoryIcon category={event.category} isDeletion={event.isDeletion} compact={ctx.compact} />
      <div className="min-w-0 flex-1">
        <Sentence event={event} title={title} />
        <MetaLine items={event.meta} notes={event.notes} />
      </div>
      <TimeColumn
        iso={event.occurredAtISO}
        timeZone={ctx.timeZone}
        nowMs={ctx.nowMs}
        badge={event.occurrenceCount ? `×${event.occurrenceCount}` : null}
        low={event.significance === "low"}
      />
    </li>
  );
}

/** The <summary> affordance: a chevron that turns when the row is open. */
function ExpandHint({ label, rotateClassName }: { label: string; rotateClassName: string }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", rotateClassName)} aria-hidden />
      {label}
    </span>
  );
}

function SeriesRow({ entry, ctx }: { entry: SeriesEntry<ActivityFeedEvent>; ctx: RowContext }) {
  const t = useTranslations("admin.audit.groups");
  const locale = useLocale();
  const title = useEventTitle()(entry.head);
  const cadence = useCadenceLabel()(entry.cadence);
  const first = entry.dates[0];
  const last = entry.dates[entry.dates.length - 1];
  const meta = [
    cadence,
    t("dates", { count: entry.dateCount }),
    first && last ? humanDateRange(first, last, locale) : null,
  ].filter((m): m is string => !!m);
  const head = entry.head;

  return (
    <li data-testid="feed-series-row">
      <details className="group/series">
        <summary className={cn(rowClass(head.isDeletion, ctx.compact), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <CategoryIcon category={head.category} isDeletion={head.isDeletion} compact={ctx.compact} />
          <div className="min-w-0 flex-1">
            <Sentence event={head} title={title} />
            <MetaLine items={meta} />
            <ExpandHint label={t("showDates")} rotateClassName="group-open/series:rotate-90" />
          </div>
          <TimeColumn iso={head.occurredAtISO} timeZone={ctx.timeZone} nowMs={ctx.nowMs} />
        </summary>
        <ul className="ml-11 mb-2 mr-4 divide-y rounded-md border bg-muted/20 text-xs" data-testid="feed-series-dates">
          {entry.members.map((m) => {
            const dates = m.series?.dates ?? [];
            const label =
              dates.length === 0
                ? (m.meta[0] ? humanizeDatesInText(m.meta[0], locale) : "—")
                : dates.length === 1
                  ? humanDate(dates[0], locale)
                  : humanDateRange(dates[0], dates[dates.length - 1], locale);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                {m.href ? (
                  <Link href={m.href} className="font-medium underline-offset-2 hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span className="font-medium">{label}</span>
                )}
                <span className="text-muted-foreground">
                  {m.occurrenceCount ? `×${m.occurrenceCount} · ` : ""}
                  {t("writtenAt", { time: timeOfDay(m.occurredAtISO, ctx.timeZone) })}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

function SiblingsRow({ entry, ctx }: { entry: SiblingsEntry<ActivityFeedEvent>; ctx: RowContext }) {
  const t = useTranslations("admin.audit.groups");
  const head = entry.head;
  const eventTitle = useEventTitle()(head);
  const key = siblingTitleKey(head.category, head.action, head.isDeletion);
  const count = { count: entry.itemCount };
  // A switch over literals (not `t(key)`) so i18n-literal-keys pins every one in en + es.
  const plural = (() => {
    switch (key) {
      case "workoutsDeleted":
        return t("workoutsDeleted", count);
      case "workoutsAssigned":
        return t("workoutsAssigned", count);
      case "workoutsMoved":
        return t("workoutsMoved", count);
      case "workoutsUpdated":
        return t("workoutsUpdated", count);
      case "habitsDeleted":
        return t("habitsDeleted", count);
      case "habitsAssigned":
        return t("habitsAssigned", count);
      case "exercisesDeleted":
        return t("exercisesDeleted", count);
      case "exercisesCreated":
        return t("exercisesCreated", count);
      case "routinesDeleted":
        return t("routinesDeleted", count);
      case "routinesCreated":
        return t("routinesCreated", count);
      default:
        return null;
    }
  })();
  const title = plural ?? eventTitle;
  const { names, more } = siblingSubjects(entry);
  const subject =
    names.length > 0 ? (
      <span className="font-semibold [overflow-wrap:anywhere]">
        {names.join(", ")}
        {more > 0 ? ` ${t("moreNames", { count: more })}` : ""}
      </span>
    ) : null;
  const oldest = entry.members[entry.members.length - 1];
  const oldestHead = oldest.type === "event" ? oldest.event : oldest.head;
  const meta = [
    plural ? null : t("andMore", { count: entry.itemCount - 1 }),
    t("span", {
      from: timeOfDay(oldestHead.occurredAtISO, ctx.timeZone),
      to: timeOfDay(head.occurredAtISO, ctx.timeZone),
    }),
  ].filter((m): m is string => !!m);

  return (
    <li data-testid="feed-siblings-row">
      <details className="group/siblings">
        <summary className={cn(rowClass(head.isDeletion, ctx.compact), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <CategoryIcon category={head.category} isDeletion={head.isDeletion} compact={ctx.compact} />
          <div className="min-w-0 flex-1">
            <Sentence event={{ ...head, href: null }} title={title} subject={subject} />
            <MetaLine items={meta} />
            <ExpandHint label={t("showItems", { count: entry.itemCount })} rotateClassName="group-open/siblings:rotate-90" />
          </div>
          <TimeColumn
            iso={head.occurredAtISO}
            timeZone={ctx.timeZone}
            nowMs={ctx.nowMs}
            badge={`×${entry.itemCount}`}
          />
        </summary>
        <ul className="ml-8 mb-2 divide-y border-l" data-testid="feed-siblings-items">
          {entry.members.map((m) =>
            m.type === "event" ? (
              <FeedRow key={m.id} event={m.event} ctx={{ ...ctx, compact: true }} />
            ) : (
              <SeriesRow key={m.id} entry={m} ctx={{ ...ctx, compact: true }} />
            ),
          )}
        </ul>
      </details>
    </li>
  );
}

function EntryRow({ entry, ctx }: { entry: FeedEntry<ActivityFeedEvent>; ctx: RowContext }) {
  if (entry.type === "series") return <SeriesRow entry={entry} ctx={ctx} />;
  if (entry.type === "siblings") return <SiblingsRow entry={entry} ctx={ctx} />;
  return <FeedRow event={entry.event} ctx={ctx} />;
}

function entryHeadEvent(entry: FeedEntry<ActivityFeedEvent>): ActivityFeedEvent {
  return entry.type === "event" ? entry.event : entry.head;
}

// ─────────────────────────────────────────────────────────────────────────────
// The list
// ─────────────────────────────────────────────────────────────────────────────

export function ActivityFeedList({
  events,
  today,
  timeZone = "UTC",
  emptyLabel,
  clearHref,
  density = "comfortable",
  nowMs,
  grouped = true,
  stickyTopClassName = "top-0",
}: {
  events: ActivityFeedEvent[];
  /** "YYYY-MM-DD" en `timeZone`, para los rótulos Hoy/Ayer — entra por prop para que esto siga siendo puro. */
  today: string;
  /**
   * Zona del usuario (#736). Default "UTC" para igualar a `getTrainerTimezone()` cuando la
   * cookie no está: sin default, un caller que la omita rompería el formateo en vez de
   * degradar al comportamiento anterior.
   */
  timeZone?: string;
  emptyLabel?: string;
  /** Where «Limpiar filtros» goes from the empty state; omitted = no button. */
  clearHref?: string;
  density?: FeedDensity;
  /** «hace 5 min» is measured against this (ms). Default: now. */
  nowMs?: number;
  /** Fold series and sibling bursts into one row each (default on). */
  grouped?: boolean;
  /** Offset of the sticky day separators (below the page's sticky filter bar). */
  stickyTopClassName?: string;
}) {
  const t = useTranslations("admin.audit");
  const locale = useLocale();
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" data-testid="feed-empty">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{emptyLabel ?? t("emptyEvents")}</p>
        <p className="text-xs text-muted-foreground">{t("empty.hint")}</p>
        {clearHref ? (
          <Button asChild variant="outline" size="sm" className="mt-1 rounded-full">
            <Link href={clearHref}>{t("empty.clear")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  const ctx: RowContext = {
    timeZone,
    nowMs: nowMs ?? Date.now(),
    compact: density === "compact",
  };
  const entries: Array<FeedEntry<ActivityFeedEvent>> = grouped
    ? groupFeedEntries(events)
    : events.map((event) => ({ type: "event" as const, id: event.id, event }));

  const days: Array<{ day: string; items: Array<FeedEntry<ActivityFeedEvent>>; count: number }> = [];
  for (const entry of entries) {
    const key = dayKey(entryHeadEvent(entry).occurredAtISO, timeZone);
    const last = days[days.length - 1];
    if (last && last.day === key) {
      last.items.push(entry);
      last.count += entryEventCount(entry);
    } else {
      days.push({ day: key, items: [entry], count: entryEventCount(entry) });
    }
  }

  const words = { today: t("today"), yesterday: t("yesterday") };

  return (
    <div className="flex flex-col">
      {days.map((group) => (
        <section key={group.day}>
          <h3
            className={cn(
              "sticky z-10 border-y bg-muted/90 px-4 py-1.5 text-xs font-semibold tracking-wide text-foreground backdrop-blur",
              stickyTopClassName,
            )}
          >
            {group.day === NO_DATE ? t("noDate") : daySeparatorLabel(group.day, today, locale, words)}
            <span className="ml-2 font-normal text-muted-foreground">
              {t("eventCount", { count: group.count })}
            </span>
          </h3>
          <ul className="divide-y">
            {group.items.map((entry) => (
              <EntryRow key={entry.id} entry={entry} ctx={ctx} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
