// /gc-fitness/settings/page.tsx — Trainer Settings shell (Server Component).
//
// Closes CHAT-11 (the trainer-side surface for chatQuickReplies templates).
//
// First section: Quick replies — the editor for `users.chatQuickReplies`
// (writer shipped in P08-05; this is the UI half). V1 only ships the
// quick-replies editor; future sections (notifications, profile, etc.) hang
// off this same route as additional <section> blocks.
//
// Auth gate mirrors `/gc-fitness/chat/page.tsx` (P08-11) + the rest of the
// gc-fitness route tree:
//   - missing/invalid cookie     → redirect to `/gc-fitness/login`
//   - role != trainer / removed  → redirect to login (same "Forbidden" surface)
//   - misconfigured env          → throws, surfaces Next.js 500
//
// PRE-FETCH (T-08-12-01 mitigation, denorm note from PLAN.md):
//   The trainer profile (chatQuickReplies + displayName) is resolved
//   server-side via `getCurrentTrainerProfile()` and threaded to the client
//   form as a prop. This avoids:
//     a) a client-side round-trip flash showing an empty form for one tick
//        before React Query hydrates,
//     b) exposing the full /users/{uid} payload to the client bundle.
//
// `dynamic = "force-dynamic"` — Settings is per-trainer, never cacheable.

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { getCurrentTrainerProfile } from "@/lib/gc-fitness/user-actions";

import { QuickRepliesForm } from "./quick-replies-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const profile = await getCurrentTrainerProfile();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your trainer preferences. Changes apply only to your account.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-6 shadow-xs">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-lg font-medium">Quick replies</h2>
          <p className="text-sm text-muted-foreground">
            Save common responses you send to clients. They appear in a
            one-tap dropdown next to the chat input. Up to 20 templates,
            240 characters each.
          </p>
        </div>
        <QuickRepliesForm initialReplies={profile.chatQuickReplies} />
      </section>
    </div>
  );
}
