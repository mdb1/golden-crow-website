"use client";

// /gc-fitness/templates/new/client.tsx
//
// Thin client component that wires the create Server Action into the
// shared TemplateForm. Kept as a separate file (instead of inlined into
// page.tsx) so the Server Component shell can stay pure async / no
// `"use client"` directive.

import { TemplateForm } from "@/components/gc-fitness/template-form";
import { createWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

export function NewTemplateClient() {
  return (
    <TemplateForm
      mode="create"
      onSubmit={async (input: WorkoutTemplateInput) => {
        const result = await createWorkoutTemplate(input);
        return result;
      }}
    />
  );
}
