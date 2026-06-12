// /gc-fitness/exercises/[id]/view/page.tsx — read-only wger detail (Server Component)
//
// Any signed-in trainer can VIEW a wger doc. The form renders in `mode="view"`
// which disables every input and adds the read-only banner + Duplicate CTA.
// Write protection comes from the form's disabled state AND from the Server
// Action layer (which rejects wger writes anyway — defense in depth).

import Image from "next/image";
import { redirect } from "next/navigation";
import { Dumbbell } from "lucide-react";

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

function previewSrc(row: {
  gifUrl: string | null;
  imageUrl: string | null;
  thumbnailURL: string | null;
}): string | null {
  return (
    resolveExercisePreviewUrl(row.gifUrl) ??
    resolveExercisePreviewUrl(row.imageUrl) ??
    resolveExercisePreviewUrl(row.thumbnailURL)
  );
}

export default async function ViewExercisePage({ params }: PageParams) {
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
    // Straight to the Biblioteca tab (see edit/page.tsx — issue #171).
    redirect("/gc-fitness/library?tab=exercises");
  }
  const data = snap.data() as Record<string, unknown>;

  // The /view page is the READ-ONLY treatment for library (wger /
  // free-exercise-db) exercises. If the trainer OWNS this exercise it is
  // editable — send them to the edit form instead of the read-only "comes
  // from wger.de" banner (the "I created it, why can't I edit it?" bug).
  // Symmetric with the edit page, which redirects library sources here.
  if (data.source === "trainer" && data.ownerId === trainer.uid) {
    redirect(`/gc-fitness/exercises/${id}/edit`);
  }

  // 14-02 — Coerce the bilingual tips block from the raw Firestore
  // payload. Older documents have no `tips` key; pass through as a
  // populated `{ en: '', es: '' }` so RHF's controlled inputs render
  // cleanly even when nothing has been authored yet.
  const rawTips = (data.tips ?? null) as {
    en?: string | null;
    es?: string | null;
  } | null;
  const tipsDefault = {
    en: typeof rawTips?.en === "string" ? rawTips.en : "",
    es: typeof rawTips?.es === "string" ? rawTips.es : "",
  };

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
    tips: tipsDefault,
    source: (data.source as ExerciseInput["source"]) ?? "wger",
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    version: typeof data.version === "number" ? data.version : 1,
  };

  // 260522-orr — read-only preview + numbered EN instructions header
  // section. Defensive coding for the Firestore data read so trainer-
  // authored or legacy wger docs without the new fields render gracefully.
  const previewHref = previewSrc({
    gifUrl: typeof data.gifUrl === "string" ? data.gifUrl : null,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    thumbnailURL:
      typeof data.thumbnailURL === "string" ? data.thumbnailURL : null,
  });

  const rawInstructions =
    (data.instructions ?? null) as {
      en?: string[] | null;
      es?: string[] | null;
    } | null;
  const stepsEn = Array.isArray(rawInstructions?.en)
    ? rawInstructions!.en!.filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      )
    : [];

  // 14-02 — Pull the EN tips text for the read-only header section below.
  // The trainer surface is EN-only per 260522-orr; ES is iOS-only for v1.
  const tipsEn = tipsDefault.en.trim();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Exercise details
        </h1>
      </div>

      {/* Preview + EN instructions header (read-only). The trainer surface
          is EN-only for v1; Spanish carry-forward lives in V2. */}
      <div className="flex flex-col gap-6">
        <div
          aria-hidden="true"
          className="flex h-[108px] w-[192px] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 text-muted-foreground"
        >
          {previewHref ? (
            // `unoptimized={!!previewHref}` is INTENTIONAL: signed Storage
            // URLs (`storage.googleapis.com/...?GoogleAccessId=…`) would
            // 403 through the Next.js image optimizer.
            <Image
              src={previewHref}
              alt=""
              width={192}
              height={108}
              unoptimized={!!previewHref}
              className="h-[108px] w-[192px] rounded-md object-cover"
            />
          ) : (
            <Dumbbell className="h-8 w-8" />
          )}
        </div>

        {stepsEn.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Instructions
            </h2>
            <ol className="list-decimal space-y-2 pl-6 text-sm text-foreground">
              {stepsEn.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No instructions available.
          </p>
        )}

        {/* 14-02 — Coaching tips (EN only on the trainer surface). */}
        {tipsEn.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Coaching tips
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {tipsEn}
            </p>
          </div>
        )}
      </div>

      <ExerciseForm mode="view" exerciseId={id} defaultValues={defaults} />
    </div>
  );
}
