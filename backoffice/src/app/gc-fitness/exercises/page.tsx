// /gc-fitness/exercises — consolidated into Biblioteca (redesign 2026-06).
// The exercises LIST now lives under /gc-fitness/library?tab=exercises. The
// create/edit/view routes are unaffected.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ExercisesListRedirect() {
  redirect("/gc-fitness/library?tab=exercises");
}
