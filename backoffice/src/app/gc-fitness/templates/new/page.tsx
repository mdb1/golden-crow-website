// /gc-fitness/templates/new/page.tsx — create form (Server Component shell)
//
// Auth gate same as the list page. On forbid → /login. The form's onSubmit
// resolves with `{ id }` from `createWorkoutTemplate`; the form's internal
// router push handles the redirect to /gc-fitness/templates.
//
// The form mounts the ExercisePickerPopover, which calls useExercisesQuery
// — that hook needs a QueryClientProvider in scope. We reuse the templates
// route group's `TemplatesQueryProvider` here for symmetry with the list
// page.

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { ExerciseQueryProvider } from "../../exercises/providers";
import { TemplatesQueryProvider } from "../providers";
import { NewTemplateClient } from "./client";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          New workout template
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a tag, add exercises, prescribe sets / reps / rest, and save.
        </p>
      </div>
      <TemplatesQueryProvider>
        <ExerciseQueryProvider>
          <NewTemplateClient />
        </ExerciseQueryProvider>
      </TemplatesQueryProvider>
    </div>
  );
}
