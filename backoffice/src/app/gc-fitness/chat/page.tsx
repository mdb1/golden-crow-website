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
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { ChatInboxClient } from "./client";
import { ChatQueryProvider } from "./providers";

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
  const clientRoster = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
    photoURL: c.photoURL,
    pendingProvisioning: c.pendingProvisioning,
  }));
  const t = await getTranslations("chat");

  return (
    <div className="gc-page flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ChatQueryProvider>
        <ChatInboxClient
          trainerUid={trainer.uid}
          clientRoster={clientRoster}
        />
      </ChatQueryProvider>
    </div>
  );
}
