// /gc-fitness/templates — consolidated into Biblioteca (redesign 2026-06).
// The workouts LIST now lives under /gc-fitness/library?tab=workouts. The
// create/edit routes (templates/new, templates/[id]/edit) are unaffected.
import { redirect } from "next/navigation";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <workouts>" (issue #170).
export const generateMetadata = () => sectionMetadata("workouts");

export const dynamic = "force-dynamic";

export default function TemplatesListRedirect() {
  redirect("/gc-fitness/library?tab=workouts");
}
