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
  Timer,
  Trash2,
} from "lucide-react";

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
  ["workout_rest_edited", "Descansos editados"],
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
  workout_rest_edited: "Descanso",
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
  workout_rest_edited: Timer,
  habit_assignment: ListChecks,
  progress_photo_request: Camera,
  weight_request: Scale,
  note: NotebookPen,
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
  const chip = row.deleted ? DELETED_CHIP : KIND_CHIP[row.kind];
  const label = row.deleted ? "Eliminado" : KIND_LABEL[row.kind];
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border [&>svg]:size-4 ${chip}`}
        aria-hidden
        title={label}
      >
        <Icon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-snug text-foreground">
          {row.title}
        </p>
        {row.clientName || row.detail ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              row.clientName ? `Para ${row.clientName}` : null,
              row.detail,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
        {formatTime(row.occurredAt, timezone)}
      </span>
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
