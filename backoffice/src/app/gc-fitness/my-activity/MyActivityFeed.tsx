"use client";

import { useMemo, useState, useTransition } from "react";
import type { ComponentType } from "react";
import {
  ClipboardList,
  Dumbbell,
  ListChecks,
  MessageSquare,
  NotebookPen,
  PersonStanding,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listMyCoachActivityPage,
  type CoachActivityKind,
  type MyCoachActivityRow,
} from "@/lib/gc-fitness/coach-activity-actions";

const PAGE_SIZE = 50;

const KIND_LABEL: Record<CoachActivityKind, string> = {
  workout_template: "Workout",
  exercise: "Ejercicio",
  workout_assignment: "Asignación",
  habit_assignment: "Hábito",
  note: "Nota",
  chat: "Chat",
};

const KIND_ICON = {
  workout_template: Dumbbell,
  exercise: PersonStanding,
  workout_assignment: ClipboardList,
  habit_assignment: ListChecks,
  note: NotebookPen,
  chat: MessageSquare,
} satisfies Record<CoachActivityKind, ComponentType<{ className?: string }>>;

// Subtle per-kind tint for the type pill — mirrors RecentLogsFeed's
// CATEGORY_TONE so the two activity surfaces read consistently. Only the
// type pill is colored; everything else stays neutral.
const KIND_TONE: Record<CoachActivityKind, string> = {
  workout_template:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  workout_assignment:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300",
  habit_assignment:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  exercise:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  note:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  chat:
    "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-300",
};

// Distinct tone for deletion rows (coach removed something) so they stand out
// from creates/assigns.
const DELETED_TONE =
  "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";

export function MyActivityFeed({
  initialRows,
  initialCursor,
  initialHasMore,
}: {
  initialRows: MyCoachActivityRow[];
  initialCursor: string | null;
  initialHasMore: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!hasMore || pending) return;
    startTransition(async () => {
      const next = await listMyCoachActivityPage(cursor, PAGE_SIZE);
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
  // carries its time. Rows arrive newest-first from the server, so insertion
  // order already yields the correct day ordering. Every loaded row is shown:
  // the coach must see everything they did, so we do NOT hide the trailing day.
  const dayGroups = useMemo(() => groupRowsByDay(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        Todavía no hay acciones recientes.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {dayGroups.map((group) => (
          <section key={group.key}>
            <h3 className="sticky top-0 z-10 border-b bg-background/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
              {group.label}
            </h3>
            <div className="divide-y">
              {group.rows.map((row) => (
                <ActivityRow key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {hasMore ? (
        <div className="flex justify-center border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? "Cargando..." : "Cargar más"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ActivityRow({ row }: { row: MyCoachActivityRow }) {
  const Icon = row.deleted ? Trash2 : KIND_ICON[row.kind];
  const tone = row.deleted ? DELETED_TONE : KIND_TONE[row.kind];
  const label = row.deleted ? "Eliminado" : KIND_LABEL[row.kind];
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`gap-1 px-1.5 py-0 text-[11px] font-normal ${tone}`}
          >
            {label}
          </Badge>
          <span className="min-w-0 break-words text-sm font-medium leading-snug">
            {row.title}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatTime(row.occurredAt)}
          {row.clientName ? ` · ${row.clientName}` : ""}
          {row.detail ? ` · ${row.detail}` : ""}
        </p>
      </div>
    </div>
  );
}

function groupRowsByDay(
  rows: MyCoachActivityRow[],
): Array<{ key: string; label: string; rows: MyCoachActivityRow[] }> {
  const groups = new Map<
    string,
    { key: string; label: string; rows: MyCoachActivityRow[] }
  >();
  for (const row of rows) {
    const key = dayKeyFromIso(row.occurredAt);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(key, { key, label: formatDayHeading(row.occurredAt), rows: [row] });
  }
  return Array.from(groups.values());
}

function dayKeyFromIso(iso: string | null): string {
  if (!iso) return "no-date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayHeading(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = dayKeyFromIso(iso);
  if (key === dayKeyFromIso(today.toISOString())) return "Hoy";
  if (key === dayKeyFromIso(yesterday.toISOString())) return "Ayer";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
