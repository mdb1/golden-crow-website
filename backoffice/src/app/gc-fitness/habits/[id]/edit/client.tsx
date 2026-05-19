"use client";

// /gc-fitness/habits/[id]/edit/client.tsx
//
// Thin client wrapper around `HabitForm` for the edit route. Closes over
// the `id` so the Server Action signature matches `(input) => Promise<{
// id?; ok? }>`. Same pattern as `templates/[id]/edit/client.tsx`.

import {
  HabitForm,
  type HabitFormClientOption,
} from "../../_components/HabitForm";
import { updateHabit } from "@/lib/gc-fitness/habit-actions";
import type { HabitCreateInput } from "@/lib/gc-fitness/habit-schema";

export interface EditHabitClientProps {
  id: string;
  defaults: Partial<HabitCreateInput>;
  clientOptions: HabitFormClientOption[];
}

export function EditHabitClient({
  id,
  defaults,
  clientOptions,
}: EditHabitClientProps) {
  return (
    <HabitForm
      mode="edit"
      clientOptions={clientOptions}
      defaultValues={defaults}
      onSubmit={async (input: HabitCreateInput) => {
        await updateHabit(id, input);
        return { ok: true };
      }}
    />
  );
}
