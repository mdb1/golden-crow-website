"use client";

import { useMemo, useState, useTransition } from "react";
import type { ComponentType } from "react";
import {
  ClipboardList,
  Camera,
  Dumbbell,
  ListChecks,
  MessageSquare,
  NotebookPen,
  PersonStanding,
  Scale,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

const TYPE_OPTIONS: Array<[string, string]> = [
  ["all", "Toda la actividad"],
  ["workout_assignment", "Asignaciones"],
  ["habit_assignment", "Hábitos"],
  ["progress_photo_request", "Fotos pedidas"],
  ["weight_request", "Peso pedido"],
  ["workout_template", "Workouts"],
  ["exercise", "Ejercicios"],
  ["note", "Notas"],
  ["chat", "Chat"],
];

const PAGE_SIZE = 50;

const KIND_LABEL: Record<CoachActivityKind, string> = {
  workout_template: "Workout",
  exercise: "Ejercicio",
  workout_assignment: "Asignación",
  habit_assignment: "Hábito",
  progress_photo_request: "Fotos",
  weight_request: "Peso",
  note: "Nota",
  chat: "Chat",
};

const KIND_ICON = {
  workout_template: Dumbbell,
  exercise: PersonStanding,
  workout_assignment: ClipboardList,
  habit_assignment: ListChecks,
  progress_photo_request: Camera,
  weight_request: Scale,
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
  progress_photo_request:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  weight_request:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
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
  clients,
  timezone,
}: {
  initialRows: MyCoachActivityRow[];
  initialCursor: string | null;
  initialHasMore: boolean;
  clients: MyActivityClientOption[];
  timezone: string;
}) {
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
  const dayGroups = useMemo(() => groupRowsByDay(rows, timezone), [rows, timezone]);

  return (
    <div className="flex flex-col">
      <div className="grid gap-3 border-b px-4 py-3 sm:grid-cols-2 sm:max-w-xl">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Cliente</p>
          <Select
            value={clientFilter}
            onValueChange={(v) => applyFilters(v, typeFilter)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Tipo</p>
          <Select
            value={typeFilter}
            onValueChange={(v) => applyFilters(clientFilter, v)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Toda la actividad" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {clientFilter !== "all" || typeFilter !== "all"
            ? "No hay actividad para este filtro."
            : "Todavía no hay acciones recientes."}
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
                  <ActivityRow key={row.id} row={row} timezone={timezone} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? "Cargando..." : "Cargar más"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ActivityRow({
  row,
  timezone,
}: {
  row: MyCoachActivityRow;
  timezone: string;
}) {
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
          {formatTime(row.occurredAt, timezone)}
          {row.clientName ? ` · ${row.clientName}` : ""}
          {row.detail ? ` · ${row.detail}` : ""}
        </p>
      </div>
    </div>
  );
}

function groupRowsByDay(
  rows: MyCoachActivityRow[],
  timezone: string,
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
    groups.set(key, { key, label: formatDayHeading(row.occurredAt, timezone), rows: [row] });
  }
  return Array.from(groups.values());
}

function formatDayHeading(iso: string | null, timezone: string): string {
  if (!iso) return "Sin fecha";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = clientActivityCivilDateKey(iso, timezone);
  if (key === clientActivityCivilDateKey(today.toISOString(), timezone)) return "Hoy";
  if (key === clientActivityCivilDateKey(yesterday.toISOString(), timezone)) return "Ayer";
  return formatClientActivityDate(iso, timezone);
}

function formatTime(iso: string | null, timezone: string): string {
  if (!iso) return "Sin fecha";
  return formatClientActivityTime(iso, timezone);
}
