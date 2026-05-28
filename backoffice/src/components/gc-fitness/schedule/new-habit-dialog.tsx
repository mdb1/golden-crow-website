"use client";

// new-habit-dialog.tsx
//
// Embeds the existing HabitForm inside a Dialog so trainers can create
// a habit straight from the month calendar cell — no full-page
// navigation, no losing the calendar scroll position. The form gets
// `clientId` + `startsOn` pre-filled with the cell + selected client.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HabitForm } from "@/app/gc-fitness/habits/_components/HabitForm";
import { createHabit } from "@/lib/gc-fitness/habit-actions";
import type { HabitCreateInput } from "@/lib/gc-fitness/habit-schema";

interface NewHabitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  startsOn: string; // YYYY-MM-DD
  /** Fires after a successful create so the parent can invalidate caches. */
  onCreated: () => void;
}

export function NewHabitDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  startsOn,
  onCreated,
}: NewHabitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Nuevo hábito</DialogTitle>
          <DialogDescription>
            Cliente: <span className="font-medium">{clientName}</span> · Empieza
            el <span className="font-medium">{startsOn}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          <HabitForm
            mode="create"
            clientOptions={[{ uid: clientId, displayName: clientName }]}
            defaultValues={{
              clientId,
              startsOn,
            } as Partial<HabitCreateInput>}
            hideCancelButton
            onAfterSubmit={() => {
              onCreated();
              onOpenChange(false);
            }}
            onSubmit={async (input) => createHabit(input)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
