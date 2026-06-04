"use client";

// NewExerciseDialog.tsx (B4)
//
// Hosts the CREATE-mode <ExerciseForm> inside a shadcn <Dialog> layered over
// the Biblioteca → Ejercicios tab, replacing the route push to
// `/gc-fitness/exercises/new` for the in-library "+ Nuevo" button.
//
// The `/gc-fitness/exercises/new` ROUTE is kept untouched as a deep-link /
// fallback — only the in-library button now opens this modal.
//
// Media step (B4 choice): we keep the dialog open for the full create flow
// and DON'T route to `/[id]/edit` afterwards. The thumbnail/GIF dropzone is
// already unlocked in create mode via the form's deterministic
// `draftExerciseId`, so the demonstration media is uploaded BEFORE the first
// save, inside this modal — no route round-trip, no data loss. On a
// successful create the form fires `onCreated`; we invalidate the exercises
// feed (so the new row appears) and close the dialog.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EXERCISES_QUERY_KEY } from "@/lib/gc-fitness/exercises-query-key";

import { ExerciseForm } from "./ExerciseForm";

interface NewExerciseDialogProps {
  trainerUid: string;
}

export function NewExerciseDialog({ trainerUid }: NewExerciseDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handleCreated = async () => {
    // The form already invalidated, but invalidate again defensively so the
    // freshly-created row is guaranteed present when the table re-renders
    // under the closing dialog. Matches the base key (per-trainer sub-keys).
    await queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* TODO i18n — reuse exercises.list.newExerciseCta wording; the create
          form copy is English-only debt tracked in backlog D1. */}
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-2 rounded-full"
      >
        <Plus className="h-4 w-4" />
        Nuevo ejercicio
      </Button>

      <DialogContent
        // Large on desktop, full-screen-ish on mobile. The base primitive
        // already gives `max-h-[calc(100vh-2rem)] overflow-y-auto` + the
        // `max-w-[calc(100%-2rem)]` mobile width; we widen the desktop cap
        // (the form is a two-column layout) and keep the scroll behavior.
        className="sm:max-w-2xl lg:max-w-3xl"
      >
        <DialogHeader>
          {/* TODO i18n — Spanish-first inline; create-form copy is D1 debt. */}
          <DialogTitle>Nuevo ejercicio</DialogTitle>
          <DialogDescription>
            Guardá lo básico primero — podés agregar un video de demostración
            antes de guardar.
          </DialogDescription>
        </DialogHeader>

        <ExerciseForm
          mode="create"
          trainerUid={trainerUid}
          onCreated={handleCreated}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
