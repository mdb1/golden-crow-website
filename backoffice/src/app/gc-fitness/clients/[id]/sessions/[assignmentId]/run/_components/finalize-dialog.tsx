"use client";

// finalize-dialog.tsx
//
// Finalize confirmation. When the assignment belongs to a recurring series,
// the coach chooses whether to also propagate the just-performed structure to
// FUTURE occurrences (#5 / D2). Those future assignments stay `scheduled` —
// only this session's log is completed.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { getFutureRecurrenceInfo } from "@/lib/gc-fitness/live-workout-actions";

export type FinalizeMode = "session" | "session_and_future";

export interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  hasSeries: boolean;
  finishing: boolean;
  onConfirm: (mode: FinalizeMode, notes: string | null) => void;
}

export function FinalizeDialog({
  open,
  onOpenChange,
  assignmentId,
  hasSeries,
  finishing,
  onConfirm,
}: FinalizeDialogProps) {
  const [mode, setMode] = useState<FinalizeMode>("session");
  const [notes, setNotes] = useState("");

  const futureQuery = useQuery({
    queryKey: ["live-workout", "future-info", assignmentId],
    queryFn: () => getFutureRecurrenceInfo(assignmentId),
    enabled: open && hasSeries,
    staleTime: 30_000,
  });
  const futureCount = futureQuery.data?.count ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar entrenamiento</DialogTitle>
          <DialogDescription>
            Se guardará esta sesión como completada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasSeries ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">¿Guardar los cambios para…?</p>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as FinalizeMode)}
                className="gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 p-3">
                  <RadioGroupItem value="session" id="mode-session" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Solo esta sesión</span>
                    <span className="block text-xs text-muted-foreground">
                      No cambia las recurrencias futuras.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 p-3">
                  <RadioGroupItem
                    value="session_and_future"
                    id="mode-future"
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      También la recurrencia futura
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {futureQuery.isLoading
                        ? "Calculando entrenamientos futuros…"
                        : futureCount > 0
                          ? `Actualiza ${futureCount} entrenamiento${
                              futureCount === 1 ? "" : "s"
                            } futuro${futureCount === 1 ? "" : "s"} para que coincidan con el de hoy. Siguen programados (no completados).`
                          : "No hay entrenamientos futuros en esta serie."}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="finalize-notes">Notas de la sesión (opcional)</Label>
            <Textarea
              id="finalize-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cómo fue la sesión, observaciones…"
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)} disabled={finishing}>
            Cancelar
          </Button>
          <Button
            className="rounded-full"
            onClick={() =>
              onConfirm(
                hasSeries ? mode : "session",
                notes.trim().length > 0 ? notes.trim() : null,
              )
            }
            disabled={finishing}
          >
            {finishing ? "Finalizando…" : "Finalizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
