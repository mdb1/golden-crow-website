// /gc-fitness/habits — consolidated into Biblioteca (redesign 2026-06).
// The habits LIST now lives under /gc-fitness/library?tab=habits. The
// create/edit/detail routes are unaffected.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function HabitsListRedirect() {
  redirect("/gc-fitness/library?tab=habits");
}
