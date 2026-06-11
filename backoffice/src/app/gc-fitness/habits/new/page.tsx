// /gc-fitness/habits/new/page.tsx — template create form (Server Component shell)
//
// Auth gate same as the list page. On forbid → /login. This surface now
// creates a reusable habit template first, so the trainer can attach the
// photo/demo link immediately and assign the template later from the library.

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { NewHabitClient } from "./client";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <habits>" (issue #170).
export const generateMetadata = () => sectionMetadata("habits");

export const dynamic = "force-dynamic";

export default async function NewHabitPage() {
  const trainer = await getCurrentTrainer().catch((err) => {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          New habit
        </h1>
        <p className="text-sm text-muted-foreground">
          Create a reusable habit template, add its photo or demo link, and
          assign it to clients later from the library.
        </p>
      </div>
      <NewHabitClient trainerUid={trainer.uid} />
    </div>
  );
}
