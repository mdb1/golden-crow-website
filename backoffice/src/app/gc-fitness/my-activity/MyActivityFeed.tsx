"use client";

import { useState, useTransition } from "react";
import type { ComponentType } from "react";
import {
  ClipboardList,
  Dumbbell,
  ListChecks,
  MessageSquare,
  NotebookPen,
  PersonStanding,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listMyCoachActivityPage,
  type CoachActivityKind,
  type MyCoachActivityRow,
} from "@/lib/gc-fitness/coach-activity-actions";

const PAGE_SIZE = 20;

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

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        Todavía no hay acciones recientes.
      </div>
    );
  }

  return (
    <>
      <div className="divide-y">
        {rows.map((row) => (
          <ActivityRow key={row.id} row={row} />
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
  const Icon = KIND_ICON[row.kind];
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[11px] font-normal">
            {KIND_LABEL[row.kind]}
          </Badge>
          <span className="min-w-0 break-words text-sm font-medium leading-snug">
            {row.title}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatWhen(row.occurredAt)}
          {row.clientName ? ` · ${row.clientName}` : ""}
          {row.detail ? ` · ${row.detail}` : ""}
        </p>
      </div>
    </div>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
