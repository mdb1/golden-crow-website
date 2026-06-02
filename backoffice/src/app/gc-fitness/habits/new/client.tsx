"use client";

// /gc-fitness/habits/new/client.tsx
//
// Thin client wrapper around the reusable-habit template form. Same
// pattern as `templates/new/client.tsx` — the Server Component shell
// stays pure async / no `"use client"` directive.

import { useId, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HabitTemplateForm } from "../_components/HabitTemplateForm";
import { createHabitTemplate } from "@/lib/gc-fitness/habit-actions";
import type { HabitTemplateCreateInput } from "@/lib/gc-fitness/habit-schema";

export interface NewHabitClientProps {
  trainerUid: string;
}

export function NewHabitClient({ trainerUid }: NewHabitClientProps) {
  const router = useRouter();
  const reactId = useId();
  const draftSuffix = useMemo(
    () => reactId.replace(/[^a-zA-Z0-9_-]/g, "") || "draft",
    [reactId],
  );
  const templateId = useMemo(
    () => `habit-template-${trainerUid}-${draftSuffix}`,
    [draftSuffix, trainerUid],
  );
  return (
    <HabitTemplateForm
      templateId={templateId}
      onSubmit={async (input: HabitTemplateCreateInput & { id: string }) => {
        const result = await createHabitTemplate(input);
        return result;
      }}
      onAfterSubmit={() => {
        router.push("/gc-fitness/habits");
      }}
    />
  );
}
