"use client";

// /gc-fitness/habits/new/client.tsx
//
// Thin client wrapper around `HabitForm` for the create route. Same
// pattern as `templates/new/client.tsx` — the Server Component shell
// stays pure async / no `"use client"` directive.

import { HabitForm, type HabitFormClientOption } from "../_components/HabitForm";
import { createHabit } from "@/lib/gc-fitness/habit-actions";
import type { HabitCreateInput } from "@/lib/gc-fitness/habit-schema";

export interface NewHabitClientProps {
  clientOptions: HabitFormClientOption[];
}

export function NewHabitClient({ clientOptions }: NewHabitClientProps) {
  return (
    <HabitForm
      mode="create"
      clientOptions={clientOptions}
      onSubmit={async (input: HabitCreateInput) => {
        const result = await createHabit(input);
        return result;
      }}
    />
  );
}
