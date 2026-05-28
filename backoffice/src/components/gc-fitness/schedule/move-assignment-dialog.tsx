"use client";

// move-assignment-dialog.tsx
//
// Shown when the trainer drags a workout chip that belongs to a recurring
// series onto a new day. Asks "how much do you want to move?" and emits a
// scope to the parent: just this occurrence, this + every future
// occurrence, or the whole series.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";

interface MoveAssignmentDialogProps {
  open: boolean;
  chip: MonthWorkoutChip;
  newDate: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: "one" | "future" | "all") => void;
}

export function MoveAssignmentDialog({
  open,
  chip,
  newDate,
  onOpenChange,
  onConfirm,
}: MoveAssignmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {chip.templateName}</DialogTitle>
          <DialogDescription>
            Este workout es parte de una serie. ¿Qué querés mover al{" "}
            <span className="font-medium">{newDate}</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="default"
            className="justify-start"
            onClick={() => onConfirm("one")}
          >
            Solo esta ocurrencia ({chip.scheduledFor})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => onConfirm("future")}
          >
            Esta y todas las futuras
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => onConfirm("all")}
          >
            Toda la serie (mismo desplazamiento de días)
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
