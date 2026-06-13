"use client";

// /gc-fitness/templates/generate/client.tsx
//
// Thin client wrapper: renders the localized page header + the generator
// wizard. Kept separate from page.tsx so the Server Component shell stays
// `async` / provider-only.

import { WorkoutGeneratorWizard } from "@/components/gc-fitness/generator/workout-generator-wizard";
import { useGeneratorStrings } from "@/components/gc-fitness/generator/strings";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

export function WorkoutGeneratorClient({
  clients,
  trainerTimezone,
}: {
  clients: ClientRosterEntry[];
  trainerTimezone?: string;
}) {
  const s = useGeneratorStrings();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{s.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{s.pageSubtitle}</p>
      </div>
      <WorkoutGeneratorWizard clients={clients} trainerTimezone={trainerTimezone} />
    </div>
  );
}
