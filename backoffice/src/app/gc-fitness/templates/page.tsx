// /gc-fitness/templates — consolidated into Biblioteca (redesign 2026-06).
// The workouts LIST now lives under /gc-fitness/library?tab=workouts. The
// create/edit routes (templates/new, templates/[id]/edit) are unaffected.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TemplatesListRedirect() {
  redirect("/gc-fitness/library?tab=workouts");
}
