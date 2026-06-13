// /gc-fitness/templates/generate/page.tsx — Workout Generator (Server shell)
//
// Auth gate mirrors /gc-fitness/templates/new. Loads the client roster so the
// success-screen assign modal can fan out to multiple clients. Mounts the
// templates + exercises QueryProviders so `useExercisesQuery` (the engine's
// pool) and `useWorkoutTemplates` resolve inside the wizard.

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { ExerciseQueryProvider } from "../../exercises/providers";
import { TemplatesQueryProvider } from "../providers";
import { WorkoutGeneratorClient } from "./client";

export const generateMetadata = () => sectionMetadata("workouts");

export const dynamic = "force-dynamic";

export default async function GenerateWorkoutPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  let clients: Awaited<ReturnType<typeof listClients>> = [];
  try {
    clients = await listClients();
  } catch {
    clients = [];
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <TemplatesQueryProvider>
        <ExerciseQueryProvider>
          <WorkoutGeneratorClient clients={clients} />
        </ExerciseQueryProvider>
      </TemplatesQueryProvider>
    </div>
  );
}
