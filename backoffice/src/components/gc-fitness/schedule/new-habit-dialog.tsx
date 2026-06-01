"use client";

// new-habit-dialog.tsx
//
// Opened from a month-calendar cell. Two modes via a segmented toggle:
//
//   • "Asignar existente" (default, left) → a searchable picker over the
//     trainer's saved habit templates (global + own), mirroring the workout
//     template picker. Picking one pre-fills the create form with that habit's
//     values — INCLUDING the full schedule/recurrence editor — so the trainer
//     can tweak the cadence before assigning.
//   • "Crear nuevo" (right) → the same form, blank.
//
// Both paths submit through `createHabit`, so the assigned/created habit lands
// on the same client + day; "existente" just skips the re-typing when the
// trainer already has the habit defined.

import { useMemo, useState } from "react";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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
  createHabit,
  listHabitTemplates,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";
import type { HabitCreateInput } from "@/lib/gc-fitness/habit-schema";

interface NewHabitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * FIXED mode (calendar cell): a specific client + day. The form's client
   * field is pre-set; the cell's date seeds `startsOn`.
   */
  clientId?: string;
  clientName?: string;
  startsOn?: string; // YYYY-MM-DD
  /**
   * ROSTER mode (habits page): omit clientId/clientName and pass the full
   * roster instead. The shared HabitForm renders its own client dropdown from
   * these options, so the trainer picks the client + start date in the form.
   */
  clients?: Array<{ uid: string; displayName: string }>;
  /** Fires after a successful create/assign so the parent can invalidate caches. */
  onCreated: () => void;
}

function todayCivilDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Habits are binary-only (yes/no) now.
const HABIT_TYPE_LABEL = "Sí / no";

type Tab = "existing" | "new";

/**
 * Maps a saved habit template onto the create-form's value shape. The cell's
 * day overrides the template's own startsOn; everything else (type, name,
 * description, reminder + full schedule/recurrence) carries over so the form
 * opens pre-filled and editable.
 */
function templateToDefaults(
  tpl: HabitTemplateRow,
  clientId: string,
  startsOn: string,
): Partial<HabitCreateInput> {
  return {
    clientId,
    type: tpl.type,
    name: { en: tpl.name.en, es: tpl.name.es },
    description: tpl.description,
    reminderTime: tpl.reminderTime,
    reminderEnabled: tpl.reminderEnabled,
    reminderCadence: tpl.reminderCadence,
    reminderWeekdays: tpl.reminderWeekdays,
    reminderDayOfMonth: tpl.reminderDayOfMonth,
    reminderMonthDays: tpl.reminderMonthDays,
    scheduleType: tpl.scheduleType,
    startsOn,
    endsOn: tpl.endsOn,
    scheduleCadence: tpl.scheduleCadence,
    scheduleWeekdays: tpl.scheduleWeekdays,
    scheduleDayOfMonth: tpl.scheduleDayOfMonth,
    scheduleMonthDays: tpl.scheduleMonthDays,
  };
}

export function NewHabitDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  startsOn,
  clients,
  onCreated,
}: NewHabitDialogProps) {
  const [tab, setTab] = useState<Tab>("existing");
  const [selected, setSelected] = useState<HabitTemplateRow | null>(null);
  // Seeded by the "create it" shortcut in the existing-tab empty state so the
  // create form opens pre-filled with the searched name.
  const [prefillName, setPrefillName] = useState("");

  // ROSTER mode = no fixed client → the form's own client dropdown (fed the
  // whole roster) is the picker, and `startsOn` defaults to today (editable in
  // the form's date field). FIXED mode keeps the single-client behavior.
  const rosterMode = !clientId;
  const clientOptions = rosterMode
    ? (clients ?? []).map((c) => ({ uid: c.uid, displayName: c.displayName }))
    : [{ uid: clientId ?? "", displayName: clientName ?? "" }];
  const effStartsOn = startsOn ?? todayCivilDate();
  const effClientId = clientId ?? "";
  const afterSubmit = () => {
    onCreated();
    onOpenChange(false);
  };

  function startCreateNew(name: string) {
    setPrefillName(name);
    setSelected(null);
    setTab("new");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {tab === "existing" ? "Asignar hábito existente" : "Nuevo hábito"}
          </DialogTitle>
          <DialogDescription>
            {rosterMode ? (
              "Elegí el cliente y la fecha de inicio en el formulario."
            ) : (
              <>
                Cliente: <span className="font-medium">{clientName}</span> ·
                Empieza el <span className="font-medium">{startsOn}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Segmented toggle: assign-existing (left, default) vs create-new. */}
        <div className="inline-flex w-full rounded-lg border p-0.5 text-sm">
          {(
            [
              ["existing", "Asignar existente"],
              ["new", "Crear nuevo"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                setSelected(null);
                setPrefillName("");
              }}
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
              // Remount when the prefilled name changes so defaults re-seed.
              key={prefillName || "blank"}
              mode="create"
              clientOptions={clientOptions}
              defaultValues={
                {
                  clientId: effClientId,
                  startsOn: effStartsOn,
                  ...(prefillName
                    ? { name: { en: prefillName, es: prefillName } }
                    : {}),
                } as Partial<HabitCreateInput>
              }
              hideCancelButton
              onAfterSubmit={afterSubmit}
              onSubmit={async (input) => createHabit(input)}
            />
          ) : selected ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Elegir otro hábito
              </button>
              {/* key forces a remount so the form re-seeds from the new pick. */}
              <HabitForm
                key={selected.id}
                mode="create"
                clientOptions={clientOptions}
                defaultValues={templateToDefaults(
                  selected,
                  effClientId,
                  effStartsOn,
                )}
                hideCancelButton
                onAfterSubmit={afterSubmit}
                onSubmit={async (input) => createHabit(input)}
              />
            </div>
          ) : (
            <ExistingHabitPicker
              onPick={setSelected}
              onCreateNew={startCreateNew}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExistingHabitPicker({
  onPick,
  onCreateNew,
}: {
  onPick: (tpl: HabitTemplateRow) => void;
  /** Jump to the create tab pre-filled with the searched name. */
  onCreateNew: (name: string) => void;
}) {
  const [search, setSearch] = useState("");

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
          <li className="flex flex-col items-center gap-3 py-4 text-center text-sm text-muted-foreground">
            {search.trim() ? (
              <>
                <span>No hay coincidencias.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => onCreateNew(search.trim())}
                >
                  <Plus className="h-4 w-4" />
                  Crear “{search.trim()}”
                </Button>
              </>
            ) : (
              <span>Todavía no tenés hábitos guardados.</span>
            )}
          </li>
        ) : (
          filtered.map((tpl) => {
            const esName =
              tpl.name.es && tpl.name.es !== tpl.name.en ? tpl.name.es : null;
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => onPick(tpl)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-accent"
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
                    {HABIT_TYPE_LABEL}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
