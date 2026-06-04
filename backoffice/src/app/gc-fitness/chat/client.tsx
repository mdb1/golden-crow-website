"use client";

// chat/client.tsx
//
// Client orchestrator for `/gc-fitness/chat`. Two-pane Slack-style layout:
//
//   ┌──────────────┬──────────────────────────┐
//   │ ThreadList   │ ChatConversation         │
//   │ (4-col)      │ (8-col)                  │
//   │              │                          │
//   │ sorted by    │ messages + MessageInput  │
//   │ unread DESC, │ + read-receipt writer    │
//   │ lastMsgAt    │                          │
//   │ DESC         │ empty state when no      │
//   │              │ ?chatId is set           │
//   └──────────────┴──────────────────────────┘
//
// Active conversation is persisted in `?chatId=clientUid` so deep-links +
// browser back-button work. The thread list mutates the search param via
// `router.replace` (no new history entry per row click — matches Slack /
// Discord behavior; a single back press exits the inbox rather than walks
// row-by-row).
//
// **Trainer uid threading (Notes G / H from PLAN.md):** the page Server
// Component resolves `trainer.uid` and passes it as a prop. Both panes use
// it — the thread list to compute per-uid unread counts (Firestore can't
// compositely index a dot-path map with a variable key, per PATTERNS.md
// Note A), and the conversation pane to distinguish own vs partner bubbles
// + decide which messages to mark read.

import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { ChatThreadList } from "./_components/ChatThreadList";
import { ChatConversation } from "./_components/ChatConversation";
import { Button } from "@/components/ui/button";

export interface ClientRosterEntry {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  pendingProvisioning: boolean;
}

export interface ChatInboxClientProps {
  /** Trainer's Firebase Auth UID — resolved server-side via getCurrentTrainer(). */
  trainerUid: string;
  /** IANA timezone used to render chat timestamps in the trainer's local day. */
  timezone: string;
  /** Client roster from listClients() — uid → displayName lookup map source. */
  clientRoster: ClientRosterEntry[];
}

export function ChatInboxClient({
  trainerUid,
  timezone,
  clientRoster,
}: ChatInboxClientProps) {
  const t = useTranslations("chat.inbox");
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeChatId = searchParams.get("chatId") ?? null;
  const activeClient = clientRoster.find((c) => c.uid === activeChatId) ?? null;
  const activeClientIsPending = Boolean(activeClient?.pendingProvisioning);

  const setActiveChatId = useCallback(
    (chatId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (chatId) {
        next.set("chatId", chatId);
      } else {
        next.delete("chatId");
      }
      const qs = next.toString();
      router.replace(`/gc-fitness/chat${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams],
  );

  return (
    <div className="grid h-[calc(100vh-9rem)] min-h-0 grid-cols-1 gap-0 overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-sm ring-1 ring-foreground/5 md:grid-cols-[320px_1fr]">
      <div
        className={[
          "min-h-0 flex-col overflow-hidden border-border md:flex md:border-r",
          activeChatId ? "hidden md:flex" : "flex",
        ].join(" ")}
      >
        <ChatThreadList
          trainerUid={trainerUid}
          timezone={timezone}
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          clientRoster={clientRoster}
        />
      </div>
      <div
        className={[
          "min-h-0 flex-col md:flex",
          activeChatId ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        {activeChatId ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-10 rounded-full"
                onClick={() => setActiveChatId(null)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t("backToThreads")}
              </Button>
            </div>
            <ChatConversation
              chatId={activeChatId}
              trainerUid={trainerUid}
              timezone={timezone}
              clientRoster={clientRoster}
              isPendingClient={activeClientIsPending}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-base text-muted-foreground">
            {t("selectThread")}
          </div>
        )}
      </div>
    </div>
  );
}
