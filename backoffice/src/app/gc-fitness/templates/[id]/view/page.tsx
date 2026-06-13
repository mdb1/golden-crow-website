// /gc-fitness/templates/[id]/view/page.tsx — read-only template VIEW (Server Component)
//
// A Standard (library) template (`isStandard:true`, trainerId "__standard__")
// opens here instead of routing straight to /edit, which would auto-FORK it
// into a trainer-owned copy and silently create duplicates. From here the
// trainer explicitly hits "Duplicate" to fork (via ViewTemplateActions).
//
// Auth/redirect preamble mirrors the edit page. The template payload comes
// from the existing `getWorkoutTemplateForAssignment` resolver (it authorizes
// owned OR standard and pre-resolves exerciseName / previewUrl / metric). The
// raw doc is fetched alongside (like the edit page) for the display-only
// `isStandard` / tags / description fields.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { getWorkoutTemplateForAssignment } from "@/lib/gc-fitness/workout-template-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExercisePreviewThumb } from "@/components/gc-fitness/exercise-preview-thumb";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import { ViewTemplateActions } from "./actions";

// Tab title: "GC Fitness - <workouts>" (issue #170).
export const generateMetadata = () => sectionMetadata("workouts");

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

// Difficulty-ish tag → semantic Badge variant, mirroring the list view.
function tagBadgeVariant(
  raw: string,
): "success" | "brand" | "violet" | "secondary" {
  const v = raw.toLowerCase();
  if (/(principiante|beginner|f[aá]cil|easy)/.test(v)) return "success";
  if (/(intermedio|intermediate|medio)/.test(v)) return "brand";
  if (/(avanzado|advanced|expert|dif[ií]cil|hard)/.test(v)) return "violet";
  return "secondary";
}

function readTags(data: Record<string, unknown>): string[] {
  const tags = data.tags;
  if (Array.isArray(tags)) {
    return tags.filter((t): t is string => typeof t === "string" && t.length > 0);
  }
  const tag = data.tag;
  return typeof tag === "string" && tag.length > 0 ? [tag] : [];
}

export default async function ViewTemplatePage({ params }: PageParams) {
  const t = await getTranslations("templates.viewPage");
  let _trainer: CurrentTrainer;
  try {
    _trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }
  void _trainer;

  const { id } = await params;

  // Resolve the template via the existing assignment resolver — it authorizes
  // (owned OR standard) and pre-resolves exerciseName / previewUrl / metric.
  // "Template not found." / "Not your template." → bounce to the list (these
  // are the deliberate auth/404 branches). Transient Firestore failures bubble
  // to the route error boundary, like the edit page.
  let template: Awaited<ReturnType<typeof getWorkoutTemplateForAssignment>>;
  try {
    template = await getWorkoutTemplateForAssignment(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Template not found." || message === "Not your template.") {
      redirect("/gc-fitness/templates");
    }
    throw err;
  }

  // Fetch the raw doc for display-only metadata (isStandard, tags, description).
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.workoutTemplates)
    .doc(id)
    .get();
  const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;

  const isStandard = data.isStandard === true;
  const tags = readTags(data);
  const description = data.description as
    | { en?: string; es?: string }
    | undefined;

  const nameEn = template.name.en?.trim() ?? "";
  const nameEs = template.name.es?.trim() ?? "";
  const primaryName = nameEn || nameEs || id;
  const secondaryName = nameEs && nameEs !== nameEn ? nameEs : null;

  const descriptionText =
    description?.en?.trim() || description?.es?.trim() || null;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {primaryName}
            </h1>
            {isStandard ? (
              <Badge variant="outline" className="capitalize">
                {t("standardBadge")}
              </Badge>
            ) : null}
          </div>
          {secondaryName ? (
            <p className="text-sm text-muted-foreground">{secondaryName}</p>
          ) : null}
          {descriptionText ? (
            <p className="text-sm text-muted-foreground">{descriptionText}</p>
          ) : null}
          {tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tags.map((raw) => (
                <Badge
                  key={raw}
                  variant={tagBadgeVariant(raw)}
                  className="capitalize"
                >
                  {raw}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <ViewTemplateActions templateId={id} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {t("exercisesHeading")}
        </h2>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {template.exercises.map((exercise) => {
              const effectiveMetric: "reps" | "time" =
                exercise.metric ?? exercise.sourceMetric ?? "reps";
              const prescription =
                effectiveMetric === "time"
                  ? t("setsTimeLabel", {
                      sets: exercise.sets,
                      seconds: exercise.durationSeconds ?? 0,
                    })
                  : t("setsRepsLabel", {
                      sets: exercise.sets,
                      reps: exercise.reps,
                    });
              const rest = t("restLabel", { seconds: exercise.rest_seconds });
              return (
                <div
                  key={`${exercise.index}-${exercise.exerciseId}`}
                  className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                >
                  <span className="w-5 shrink-0 text-sm font-medium text-muted-foreground">
                    {exercise.index + 1}
                  </span>
                  <ExercisePreviewThumb
                    src={exercise.previewUrl}
                    alt={exercise.exerciseName}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h3 className="truncate text-base font-medium text-foreground">
                      {exercise.exerciseName}
                    </h3>
                    {exercise.notes ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {exercise.notes}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {prescription}
                    </span>
                    <span className="ml-2">· {rest}</span>
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
