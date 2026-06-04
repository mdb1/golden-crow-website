// /gc-fitness/exercises/new/page.tsx — create form (Server Component shell)
//
// Auth gate same as the list page. On forbid → /login. On creation success
// the form itself redirects to `/[id]/edit`.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { ExerciseForm } from "../_components/ExerciseForm";

export const dynamic = "force-dynamic";

export default async function NewExercisePage() {
  const t = await getTranslations("exercises.form");
  const trainer = await getCurrentTrainer().catch((err) => {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("newPageHeading")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("newPageSubtitle")}
        </p>
      </div>
      <ExerciseForm mode="create" trainerUid={trainer.uid} />
    </div>
  );
}
