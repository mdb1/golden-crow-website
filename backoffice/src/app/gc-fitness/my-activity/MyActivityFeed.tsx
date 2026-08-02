"use client";

import { useMemo, useState, useTransition } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Camera,
  Dumbbell,
  ListChecks,
  MessageSquare,
  NotebookPen,
  PersonStanding,
  Scale,
  Timer,
  Trash2,
  UserPlus,
} from "lucide-react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  clientActivityCivilDateKey,
  formatClientActivityDate,
  formatClientActivityTime,
} from "@/lib/gc-fitness/client-activity-time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listMyCoachActivityPage,
  type CoachActivityKind,
  type MyActivityClientOption,
  type MyCoachActivityRow,
} from "@/lib/gc-fitness/coach-activity-actions";

const TYPE_OPTION_KEYS: string[] = [
  "all",
  "workout_assignment",
  // `workout_rest_edited` is a CLIENT action (they edit their own rests); it's
  // excluded from "Mi Actividad", so it's not offered as a filter here.
  "habit_assignment",
  "progress_photo_request",
  "weight_request",
  "workout_template",
  "exercise",
  "note",
  // #682 — the coach linking a client to their roster.
  "client_added",
  "chat",
];

const PAGE_SIZE = 50;

const KIND_ICON = {
  workout_template: Dumbbell,
  exercise: PersonStanding,
  workout_assignment: ClipboardList,
  workout_rest_edited: Timer,
  habit_assignment: ListChecks,
  progress_photo_request: Camera,
  weight_request: Scale,
  note: NotebookPen,
  client_added: UserPlus,
  chat: MessageSquare,
} satisfies Record<CoachActivityKind, ComponentType<{ className?: string }>>;

// Per-kind circular icon chip — token-based so both themes work. Uses the
// shared badge color tokens (success/brand/warning/violet/rose) as the chip
// background + foreground, mirroring the reference design's colored action
// icons (create=green, assign=blue, edit=amber, message=violet, delete=rose).
const KIND_CHIP: Record<CoachActivityKind, string> = {
  workout_template:
    "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)]",
  exercise:
    "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)]",
  workout_assignment:
    "border-[color:var(--badge-brand-border)] bg-[color:var(--badge-brand-bg)] text-[color:var(--badge-brand-fg)]",
  habit_assignment:
    "border-[color:var(--badge-brand-border)] bg-[color:var(--badge-brand-bg)] text-[color:var(--badge-brand-fg)]",
  workout_rest_edited:
    "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-fg)]",
  note:
    "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-fg)]",
  chat:
    "border-[color:var(--badge-violet-border)] bg-[color:var(--badge-violet-bg)] text-[color:var(--badge-violet-fg)]",
  progress_photo_request:
    "border-[color:var(--badge-violet-border)] bg-[color:var(--badge-violet-bg)] text-[color:var(--badge-violet-fg)]",
  weight_request:
    "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-fg)]",
  client_added:
    "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)]",
};

// Deletion rows (coach removed something) use the rose token so they stand out.
const DELETED_CHIP =
  "border-[color:var(--badge-rose-border)] bg-[color:var(--badge-rose-bg)] text-[color:var(--badge-rose-fg)]";

export function MyActivityFeed({
  initialRows,
  initialCursor,
  initialHasMore,
  clients,
  timezone,
}: {
  initialRows: MyCoachActivityRow[];
  initialCursor: string | null;
  initialHasMore: boolean;
  clients: MyActivityClientOption[];
  timezone: string;
}) {
  const t = useTranslations("myActivity");
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pending, startTransition] = useTransition();

  function applyFilters(nextClient: string, nextType: string) {
    setClientFilter(nextClient);
    setTypeFilter(nextType);
    startTransition(async () => {
      const res = await listMyCoachActivityPage(
        null,
        PAGE_SIZE,
        nextClient === "all" ? null : nextClient,
        nextType === "all" ? null : nextType,
      );
      setRows(res.rows);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    });
  }

  function loadMore() {
    if (!hasMore || pending) return;
    startTransition(async () => {
      const next = await listMyCoachActivityPage(
        cursor,
        PAGE_SIZE,
        clientFilter === "all" ? null : clientFilter,
        typeFilter === "all" ? null : typeFilter,
      );
      setRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        const fresh = next.rows.filter((row) => !seen.has(row.id));
        return fresh.length > 0 ? [...current, ...fresh] : current;
      });
      setCursor(next.nextCursor);
      setHasMore(next.hasMore);
    });
  }

  // Group the flat row list into day sections so the date isn't repeated on
  // every row — the day is shown once as a section heading and each row only
  // carries its time.
  const dayGroups = useMemo(
    () => groupRowsByDay(rows, timezone, t),
    [rows, timezone, t],
  );

  return (
    <div className="flex flex-col">
      <div className="grid gap-3 border-b px-4 py-3 sm:grid-cols-2 sm:max-w-xl">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {t("clientLabel")}
          </p>
          <Select
            value={clientFilter}
            onValueChange={(v) => applyFilters(v, typeFilter)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("allClients")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allClients")}</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {t("typeLabel")}
          </p>
          <Select
            value={typeFilter}
            onValueChange={(v) => applyFilters(clientFilter, v)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("allActivity")} />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTION_KEYS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`typeOptions.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {clientFilter !== "all" || typeFilter !== "all"
            ? t("emptyFiltered")
            : t("emptyAll")}
        </div>
      ) : (
        <div className="flex flex-col">
          {dayGroups.map((group) => (
            <section key={group.key}>
              <h3 className="sticky top-0 z-10 border-b bg-background/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                {group.label}
              </h3>
              <div className="divide-y">
                {group.rows.map((row) => (
                  <ActivityRow key={row.id} row={row} timezone={timezone} t={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ActivityRow({
  row,
  timezone,
  t,
}: {
  row: MyCoachActivityRow;
  timezone: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = row.deleted ? Trash2 : KIND_ICON[row.kind];
  const chip = row.deleted ? DELETED_CHIP : KIND_CHIP[row.kind];
  const label = row.deleted ? t("deleted") : t(`kindLabels.${row.kind}`);
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border [&>svg]:size-4 ${chip}`}
        aria-hidden
        title={label}
      >
        <Icon />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-0.5">
        <div className="min-w-0 flex-1 basis-[10rem]">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">
            {row.title}
          </p>
          {row.clientName || row.detail ? (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {row.clientName ? (
                <ClientNameLink
                  clientId={row.clientId}
                  clientName={row.clientName}
                  t={t}
                />
              ) : null}
              {row.clientName && row.detail ? " · " : null}
              {row.detail}
            </p>
          ) : null}
        </div>
        <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {formatTime(row.occurredAt, timezone, t)}
        </span>
      </div>
    </div>
  );
}

// Renders the "For {name}" detail prefix, with the client name as a link to the
// client's profile when a resolvable id exists. Reuses the existing localized
// "For {name}" / "Para {name}" key and splits it around the name so only the
// name becomes a link (the "For"/"Para" wrapper stays plain). Falls back to
// plain text when there's no id (no broken link).
function ClientNameLink({
  clientId,
  clientName,
  t,
}: {
  clientId: string | null;
  clientName: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const full = t("forClient", { name: clientName });
  if (!clientId) {
    return <>{full}</>;
  }
  const idx = full.indexOf(clientName);
  const link = (
    <Link
      href={`/gc-fitness/clients/${clientId}`}
      className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {clientName}
    </Link>
  );
  // If the name isn't found verbatim (defensive — shouldn't happen), link the
  // whole label rather than dropping the affordance.
  if (idx === -1) {
    return (
      <Link
        href={`/gc-fitness/clients/${clientId}`}
        className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {full}
      </Link>
    );
  }
  return (
    <>
      {full.slice(0, idx)}
      {link}
      {full.slice(idx + clientName.length)}
    </>
  );
}

function groupRowsByDay(
  rows: MyCoachActivityRow[],
  timezone: string,
  t: ReturnType<typeof useTranslations>,
): Array<{ key: string; label: string; rows: MyCoachActivityRow[] }> {
  const groups = new Map<
    string,
    { key: string; label: string; rows: MyCoachActivityRow[] }
  >();
  for (const row of rows) {
    const key = clientActivityCivilDateKey(row.occurredAt, timezone);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(key, {
      key,
      label: formatDayHeading(row.occurredAt, timezone, t),
      rows: [row],
    });
  }
  return Array.from(groups.values());
}

function formatDayHeading(
  iso: string | null,
  timezone: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!iso) return t("noDate");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = clientActivityCivilDateKey(iso, timezone);
  if (key === clientActivityCivilDateKey(today.toISOString(), timezone))
    return t("today");
  if (key === clientActivityCivilDateKey(yesterday.toISOString(), timezone))
    return t("yesterday");
  return formatClientActivityDate(iso, timezone);
}

function formatTime(
  iso: string | null,
  timezone: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!iso) return t("noDate");
  return formatClientActivityTime(iso, timezone);
}
