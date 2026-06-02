import { redirect } from "next/navigation";
import type { ComponentType } from "react";
import {
  Dumbbell,
  ListChecks,
  MessageSquare,
  NotebookPen,
  PersonStanding,
  ClipboardList,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import {
  listMyCoachActivity,
  type CoachActivityKind,
} from "@/lib/gc-fitness/coach-activity-actions";

export const dynamic = "force-dynamic";

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

export default async function MyActivityPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const rows = await listMyCoachActivity();

  return (
    <div className="gc-page flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Mi actividad
        </h1>
        <p className="text-sm text-muted-foreground">
          Acciones recientes del coach: workouts, ejercicios, asignaciones, hábitos, notas y chats.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent logs míos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Todavía no hay acciones recientes.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row) => {
                const Icon = KIND_ICON[row.kind];
                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-3">
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
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
