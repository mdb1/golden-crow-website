// /gc-fitness/habits/new/page.tsx — create form (Server Component shell)
//
// Auth gate same as the list page. On forbid → /login. The form's onSubmit
// resolves with `{ id }` from `createHabit`; the form's internal router
// push handles the redirect to /gc-fitness/habits.
//
// Pulls the trainer's client roster on the server so the picker has
// stable, sorted entries on first render (no client-side roundtrip).

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { NewHabitClient } from "./client";

export const dynamic = "force-dynamic";

export default async function NewHabitPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const clients = await listClients();
  const clientOptions = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          New habit
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a client, pick a habit type, fill in the localized name, and
          save. The habit shows up on the client&apos;s phone within seconds.
        </p>
      </div>
      <NewHabitClient clientOptions={clientOptions} />
    </div>
  );
}
