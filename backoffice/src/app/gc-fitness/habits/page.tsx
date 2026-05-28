// /gc-fitness/habits/page.tsx
//
// Habits no longer have their own standalone surface — they live in the
// unified month calendar at /gc-fitness/schedule alongside workouts. Any
// inbound link or bookmark is redirected so trainers don't hit a dead end.
// The deeper habit-editor routes ([id], new, _components) are kept and
// still navigable directly when a habit is opened from inside the
// calendar surface.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function HabitsLegacyRedirect() {
  redirect("/gc-fitness/schedule");
}
