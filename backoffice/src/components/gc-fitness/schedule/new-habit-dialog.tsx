"use client";

// new-habit-dialog.tsx
//
// Opened from a month-calendar cell. Two modes via a segmented toggle:
//
//   • "Crear nuevo"     → embeds the existing HabitForm (clientId + startsOn
//                         pre-filled with the cell + selected client).
//   • "Asignar existente" → a searchable picker over the trainer's saved habit
//                         templates (global + own), mirroring the exercise
//                         picker used when building a workout. Picking one and
//                         confirming assigns a copy to this client, starting on
//                         the cell's day.
//
// Both paths land a habit on the same client + day; "existente" just skips the
// re-typing when the trainer already has the habit defined.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HabitForm } from "@/app/gc-fitness/habits/_components/HabitForm";
import {
  assignHabitTemplate,
  createHabit,
  listHabitTemplates,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";
import type { HabitCreateInput } from "@/lib/gc-fitness/habit-schema";

interface NewHabitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  startsOn: string; // YYYY-MM-DD
  /** Fires after a successful create/assign so the parent can invalidate caches. */
  onCreated: () => void;
}

const HABIT_TYPE_LABEL: Record<string, string> = {
  binary: "Sí / no",
  numeric: "Numérico",
  weight: "Peso",
  "multi-choice": "Opción múltiple",
};

type Tab = "new" | "existing";

export function NewHabitDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  startsOn,
  onCreated,
}: NewHabitDialogProps) {
  const [tab, setTab] = useState<Tab>("new");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {tab === "new" ? "Nuevo hábito" : "Asignar hábito existente"}
          </DialogTitle>
          <DialogDescription>
            Cliente: <span className="font-medium">{clientName}</span> · Empieza
            el <span className="font-medium">{startsOn}</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Segmented toggle: create-new vs assign-existing. */}
        <div className="inline-flex w-full rounded-lg border p-0.5 text-sm">
          {(
            [
              ["new", "Crear nuevo"],
              ["existing", "Asignar existente"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium transition",
                tab === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          {tab === "new" ? (
            <HabitForm
              mode="create"
              clientOptions={[{ uid: clientId, displayName: clientName }]}
              defaultValues={
                {
                  clientId,
                  startsOn,
                } as Partial<HabitCreateInput>
              }
              hideCancelButton
              onAfterSubmit={() => {
                onCreated();
                onOpenChange(false);
              }}
              onSubmit={async (input) => createHabit(input)}
            />
          ) : (
            <ExistingHabitPicker
              clientId={clientId}
              startsOn={startsOn}
              onAssigned={() => {
                onCreated();
                onOpenChange(false);
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExistingHabitPicker({
  clientId,
  startsOn,
  onAssigned,
}: {
  clientId: string;
  startsOn: string;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["habit-templates", "calendar-picker"],
    queryFn: () => listHabitTemplates(),
  });

  const filtered = useMemo(() => {
    const list = templates as HabitTemplateRow[];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((t) =>
      `${t.name.en} ${t.name.es}`.toLowerCase().includes(needle),
    );
  }, [templates, search]);

  async function assign() {
    if (!selectedId) return;
    setAssigning(true);
    try {
      await assignHabitTemplate({
        templateId: selectedId,
        clientIds: [clientId],
        startsOn,
      });
      toast.success("Hábito asignado");
      onAssigned();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo asignar el hábito",
      );
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border px-3">
        <Search className="h-4 w-4 shrink-0 opacity-50" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar hábito…"
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <ul className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto rounded-md border p-2">
        {isLoading ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            Cargando hábitos…
          </li>
        ) : filtered.length === 0 ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            {search.trim()
              ? "No hay coincidencias."
              : "Todavía no tenés hábitos guardados."}
          </li>
        ) : (
          filtered.map((tpl) => {
            const selected = selectedId === tpl.id;
            const esName =
              tpl.name.es && tpl.name.es !== tpl.name.en ? tpl.name.es : null;
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(tpl.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition",
                    selected
                      ? "bg-primary/10 ring-1 ring-primary"
                      : "hover:bg-accent",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {tpl.name.en || tpl.name.es}
                    </span>
                    {esName ? (
                      <span className="truncate text-xs italic text-muted-foreground">
                        {esName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {HABIT_TYPE_LABEL[tpl.type] ?? tpl.type}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex items-center justify-end">
        <Button
          type="button"
          onClick={assign}
          disabled={!selectedId || assigning}
        >
          {assigning ? "Asignando…" : "Asignar hábito"}
        </Button>
      </div>
    </div>
  );
}
