"use client";

// /gc-fitness/templates/[id]/edit/client.tsx
//
// Thin client wrapper around `TemplateForm` for the edit route. Same
// pattern as `new/client.tsx`. Closes over the `id` so the Server Action
// signature matches `(input) => Promise<{ id?; ok? }>`.

import { TemplateForm } from "@/components/gc-fitness/template-form";
import { updateWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

export interface EditTemplateClientProps {
  id: string;
  defaults: Partial<WorkoutTemplateInput>;
}

export function EditTemplateClient({ id, defaults }: EditTemplateClientProps) {
  return (
    <TemplateForm
      mode="edit"
      defaultValues={defaults}
      onSubmit={async (input: WorkoutTemplateInput) => {
        await updateWorkoutTemplate(id, input);
        return { ok: true };
      }}
    />
  );
}
