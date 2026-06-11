// /gc-fitness/chat/page.tsx — Trainer inbox shell (Server Component)
//
// Closes CHAT-10. First two-pane layout in the backoffice trainer surface:
//   - Left:  ChatThreadList  — sorted by unreadCount[trainer.uid] DESC, then
//                              lastMessageAt DESC (client-side tiebreaker per
//                              PATTERNS.md Note A; the server query orders by
//                              lastMessageAt DESC against the P08-01 index
//                              `coachId ASC, lastMessageAt DESC`).
//   - Right: ChatConversation — message thread + MessageInput + read-receipt
//                              writer.
//
// Auth gate runs on the server BEFORE the client component mounts. Mirrors
// `/gc-fitness/habits/page.tsx` (the closest twin per PATTERNS.md):
//   - missing/invalid cookie → redirect to `/gc-fitness/login`
//   - role != trainer / email not in allowlist → redirect to login (same
//     "Forbidden" surface as habits)
//   - server-misconfigured env → throws, surfaces Next.js 500
//
// We pull the trainer's client roster here (Server-side `listClients()` from
// P04-05) and pass it to the client component. The roster powers the thread
// list's clientId → displayName resolution (the chat doc holds only uids).
//
// **Trainer uid plumb-through (Note G / Note H from PLAN.md):** the trainer
// uid is resolved server-side via `await getCurrentTrainer()` and threaded
// to the client component as a prop, which then passes it to both panes.
// This is the single source of truth — no client-side `useSession` round-trip,
// no duplicated read from the cookie. Both panes need it:
//   - ChatThreadList computes per-thread unread count via
//     `chat.unreadCount[trainerUid]` (Firestore can't compositely index a
//     dot-path map with a variable key — see PATTERNS.md Note A).
//   - ChatConversation marks read-receipts only on messages whose sender is
//     NOT the trainer, and uses trainerUid to distinguish own vs partner
//     bubble alignment.

import { redirect } from "next/navigation";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { ChatInboxClient } from "./client";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <chat>" (issue #170).
export const generateMetadata = () => sectionMetadata("chat");

export const dynamic = "force-dynamic";

export default async function ChatPage() {
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

  const clients = await listClients();
  const timezone = await getTrainerTimezone();
  const clientRoster = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
    photoURL: c.photoURL,
    pendingProvisioning: c.pendingProvisioning,
  }));

  // NOTE: the chat surface intentionally does NOT mount its own
  // QueryClientProvider. It shares the shell-level client
  // (GCFitnessShellProviders) so the unread badge in the sidebar
  // (gc-fitness-shell.tsx -> useTrainerChats) and the chat surface read/write
  // the SAME `CHATS_BASE_KEY` cache. Otherwise ChatConversation's optimistic
  // mark-read (queryClient.setQueryData on open) lands in a per-route client
  // the sidebar badge can't see, and the badge only clears on the 120s poll /
  // window-focus refetch (felt slow). Both `useTrainerChats` and
  // `useChatMessages` pin their own refetchInterval on the hook, so no
  // per-route provider defaults are needed here.
  // NOTE: the chat surface intentionally does NOT use the `.gc-page` wrapper
  // (max-width + responsive padding). Chat is a full-bleed, edge-to-edge
  // surface that fills the entire content area under the shell. We pin the
  // height to the viewport minus the shell's mobile top bar (h-14 = 3.5rem)
  // so the conversation thread + composer fill the remaining space; on desktop
  // there is no top bar, so the slim header simply isn't rendered and the
  // surface uses the full viewport height. `min-h-0` lets the inner flex/grid
  // panes scroll instead of overflowing the page.
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col md:h-screen">
      <ChatInboxClient
        trainerUid={trainer.uid}
        clientRoster={clientRoster}
        timezone={timezone}
      />
    </div>
  );
}
