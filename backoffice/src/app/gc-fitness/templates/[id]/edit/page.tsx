// /gc-fitness/templates/[id]/edit/page.tsx — edit form (Server Component shell)
//
// Pre-flight pulls the doc via the gc-fitness Admin SDK (same pattern as
// the exercises edit route) and redirects:
//   - missing doc / soft-deleted → /gc-fitness/templates (404 equivalent)
//   - trainerId !== caller       → /gc-fitness/forbidden
//
// Strips Firestore-only fields (Timestamps, version, deleted, id) and
// hands a `Partial<WorkoutTemplateInput>` to `TemplateForm` for the
// `defaultValues` seed. RHF resets back to these defaults on cancel.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";
import { forkStandardWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";
import { ExerciseQueryProvider } from "../../../exercises/providers";
import { TemplatesQueryProvider } from "../../providers";
import { EditTemplateClient } from "./client";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: PageParams) {
  const t = await getTranslations("templates.editPage");
  let trainer: CurrentTrainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { id } = await params;
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.workoutTemplates)
    .doc(id)
    .get();
  if (!snap.exists) {
    redirect("/gc-fitness/templates");
  }
  const data = snap.data() as Record<string, unknown> & {
    trainerId?: string;
    deleted?: boolean;
  };

  if (data.isStandard === true && data.trainerId !== trainer.uid) {
    const fork = await forkStandardWorkoutTemplate(id);
    redirect(`/gc-fitness/templates/${fork.id}/edit`);
  }
  if (data.trainerId !== trainer.uid) {
    redirect("/gc-fitness/forbidden");
  }
  if (data.deleted === true) {
    redirect("/gc-fitness/templates");
  }

  // Strip Firestore-only fields. The schema doesn't model `createdAt` /
  // `updatedAt` / `deleted` / `version` / `id` — those are server-side.
  const defaults: Partial<WorkoutTemplateInput> = {
    name: (data.name as WorkoutTemplateInput["name"]) ?? { en: "", es: "" },
    description: data.description as WorkoutTemplateInput["description"],
    tag: (data.tag as WorkoutTemplateInput["tag"]) ?? "custom",
    exercises: Array.isArray(data.exercises)
      ? (data.exercises as WorkoutTemplateInput["exercises"])
      : [],
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitlePrefix")}<strong>{t("subtitleCta")}</strong>
          {t("subtitleSuffix")}
        </p>
      </div>
      <TemplatesQueryProvider>
        <ExerciseQueryProvider>
          <EditTemplateClient id={id} defaults={defaults} />
        </ExerciseQueryProvider>
      </TemplatesQueryProvider>
    </div>
  );
}
