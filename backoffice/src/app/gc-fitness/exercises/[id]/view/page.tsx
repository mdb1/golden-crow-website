// /gc-fitness/exercises/[id]/view/page.tsx — read-only wger detail (Server Component)
//
// Any signed-in trainer can VIEW a wger doc. The form renders in `mode="view"`
// which disables every input and adds the read-only banner + Duplicate CTA.
// Write protection comes from the form's disabled state AND from the Server
// Action layer (which rejects wger writes anyway — defense in depth).

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { ExerciseForm } from "../../_components/ExerciseForm";
import type { ExerciseInput } from "@/lib/gc-fitness/exercise-schema";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function ViewExercisePage({ params }: PageParams) {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { id } = await params;
  const db = gcFitnessFirestore();
  const snap = await db.collection("exercises").doc(id).get();
  if (!snap.exists) {
    redirect("/gc-fitness/exercises");
  }
  const data = snap.data() as Record<string, unknown>;

  const defaults: Partial<ExerciseInput> = {
    name: (data.name as ExerciseInput["name"]) ?? { en: "", es: "" },
    description: (data.description as ExerciseInput["description"]) ?? {
      en: "",
      es: "",
    },
    muscleGroups: Array.isArray(data.muscleGroups)
      ? (data.muscleGroups as string[])
      : [],
    equipment: Array.isArray(data.equipment) ? (data.equipment as string[]) : [],
    mediaURL: typeof data.mediaURL === "string" ? data.mediaURL : null,
    thumbnailURL:
      typeof data.thumbnailURL === "string" ? data.thumbnailURL : null,
    source: (data.source as ExerciseInput["source"]) ?? "wger",
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    version: typeof data.version === "number" ? data.version : 1,
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Exercise details
        </h1>
      </div>
      <ExerciseForm mode="view" exerciseId={id} defaultValues={defaults} />
    </div>
  );
}
