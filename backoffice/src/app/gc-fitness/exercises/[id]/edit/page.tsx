// /gc-fitness/exercises/[id]/edit/page.tsx — edit form (Server Component shell)
//
// Pre-flight pulls the doc via the gc-fitness Admin SDK and redirects:
//   - missing doc → /gc-fitness/exercises (404 equivalent — list view is the
//     natural place to land if a doc disappeared between table render and
//     row click)
//   - source === 'wger' → /[id]/view (read-only treatment; defense in
//     depth alongside the Server Action's source check)
//   - ownerId !== trainer.uid → /gc-fitness/forbidden (cross-trainer edit
//     attempt — should be impossible from a well-behaved UI but the server
//     guard is the truth)
//
// The Admin SDK Firestore read here costs ONE doc fetch per page view.
// `ExerciseForm` is rendered with the full `defaultValues` so RHF can
// reset back to the saved state on cancel.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { ExerciseForm } from "../../_components/ExerciseForm";
import type { ExerciseInput } from "@/lib/gc-fitness/exercise-schema";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import { resolveExercisePreviewUrl } from "@/lib/gc-fitness/exercise-preview-url";

// Tab title: "GC Fitness - <exercises>" (issue #170).
export const generateMetadata = () => sectionMetadata("exercises");

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

function pickPreviewSrc(data: Record<string, unknown>): string | null {
  return (
    resolveExercisePreviewUrl(data.gifUrl as string | null) ??
    resolveExercisePreviewUrl(data.imageUrl as string | null) ??
    resolveExercisePreviewUrl(data.thumbnailURL as string | null) ??
    resolveExercisePreviewUrl(data.mediaURL as string | null)
  );
}

export default async function EditExercisePage({ params }: PageParams) {
  const t = await getTranslations("exercises.editPage");
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
  const snap = await db.collection("exercises").doc(id).get();
  if (!snap.exists) {
    // Straight to the Biblioteca tab — /gc-fitness/exercises is itself just a
    // redirect to this URL, and chaining two 307s through force-dynamic pages
    // was half of the issue-#171 error-flash window.
    redirect("/gc-fitness/library?tab=exercises");
  }
  const data = snap.data() as Record<string, unknown> & {
    source?: string;
    ownerId?: string | null;
  };

  // Library sources (wger + free-exercise-db) are read-only — there is no
  // editable owner, so send them to the read-only /view page instead of
  // /forbidden. (free-exercise-db rows used to fall through to the ownerId
  // check below and 404 into /forbidden — the reported bug.)
  if (data.source === "wger" || data.source === "free-exercise-db") {
    redirect(`/gc-fitness/exercises/${id}/view`);
  }
  if (data.ownerId !== trainer.uid) {
    redirect("/gc-fitness/forbidden");
  }

  // Strip Firestore-only fields (Timestamps, doc id) before handing to the
  // form — the schema doesn't model `createdAt` / `updatedAt` / `deleted`.
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
    youtubeURL: typeof data.youtubeURL === "string" ? data.youtubeURL : null,
    source: "trainer",
    ownerId: trainer.uid,
    version: typeof data.version === "number" ? data.version : 1,
  };

  const previewHref = pickPreviewSrc(data);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitlePrefix")}<strong>{t("subtitleCta")}</strong>
          {t("subtitleSuffix")}
        </p>
      </div>

      {previewHref && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-foreground">
            {t("currentPreviewLabel")}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewHref}
            alt=""
            width={320}
            height={180}
            className="h-[180px] w-[320px] rounded-md border border-border bg-muted/40 object-cover"
          />
          <span className="text-xs text-muted-foreground">
            {t("currentPreviewHint")}
          </span>
        </div>
      )}

      <ExerciseForm mode="edit" exerciseId={id} defaultValues={defaults} />
    </div>
  );
}
