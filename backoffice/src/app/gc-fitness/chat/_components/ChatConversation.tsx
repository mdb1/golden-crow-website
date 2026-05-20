"use client";

// ChatConversation.tsx — right pane of the trainer inbox.
//
// Renders the active chat thread:
//   - Header (partner display name).
//   - Scrollable message list with day separators (client-side grouping by
//     civil date — `Date.toDateString()` bucket for v1; a Pitfall 7
//     same-source-of-truth TS port of the iOS `DaySeparatorGrouper` is a
//     V2 carry-forward).
//   - MessageInput at the bottom.
//
// Read-receipt write (V1 simplification — Note from PLAN.md):
//   On every messages payload change, we walk the partner messages (those
//   whose `senderId !== trainerUid`) and fire `setReadReceiptForTrainer`
//   for every message that doesn't yet have `readBy[trainerUid]`. This is
//   the v1 "mark all on render" — debouncing via intersection observer is
//   a V2 carry-forward.
//
//   The Server Action is idempotent at the rule layer (writing the same
//   `readBy[uid]` slot twice is allowed; the Cloud Function P08-06 also
//   clears `chats.unreadCount.{trainerUid}` so the inbox badge falls to 0
//   once any message in the thread is marked read).
//
// V1 attachment rendering (Note I from PLAN.md):
//   Image + voice messages render italic placeholder bubbles in V1.
//   Full rendering requires resolving the Storage download URL via Admin
//   SDK + a NukeUI-equivalent on the web (next/image or a signed-URL
//   fetch endpoint) — V2 carry-forward.
//
// Trainer uid (Note H) plumbed in from `client.tsx`.

import { useEffect, useMemo, useRef } from "react";

import { useChatMessages } from "@/lib/gc-fitness/chat-listener";
import { setReadReceiptForTrainer } from "@/lib/gc-fitness/chat-server-actions";
import type { MessageRow } from "@/lib/gc-fitness/chat-schema";

import type { ClientRosterEntry } from "../client";
import { MessageInput } from "./MessageInput";
import { NudgeButton } from "./NudgeButton";

export interface ChatConversationProps {
  chatId: string;
  trainerUid: string;
  clientRoster: ClientRosterEntry[];
}

export function ChatConversation({
  chatId,
  trainerUid,
  clientRoster,
}: ChatConversationProps) {
  const { data, isLoading, error } = useChatMessages(chatId);
  const messages = useMemo(() => data ?? [], [data]);

  const partnerName = useMemo(() => {
    const entry = clientRoster.find((c) => c.uid === chatId);
    return entry?.displayName ?? chatId;
  }, [clientRoster, chatId]);

  // Mark unread partner messages as read on every payload change.
  //
  // Race guard (`alreadyMarkedRef`) — React Query polls every 10s; without
  // this guard a re-fetch that returns the same messages would re-fire the
  // Server Action calls until the next fetch returned the updated `readBy`
  // map. The ref keys on message id so we never fire twice for the same id
  // in the same component lifetime.
  const alreadyMarkedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Reset the dedupe set when the active chat changes.
    alreadyMarkedRef.current = new Set();
  }, [chatId]);

  useEffect(() => {
    const toMark = messages.filter((m) => {
      if (m.senderId === trainerUid) return false;
      if (m.readBy?.[trainerUid]) return false;
      if (alreadyMarkedRef.current.has(m.id)) return false;
      return true;
    });
    if (toMark.length === 0) return;
    for (const m of toMark) {
      alreadyMarkedRef.current.add(m.id);
      // Fire-and-forget; failures are recoverable on the next poll.
      setReadReceiptForTrainer(chatId, m.id).catch((err) => {
        console.warn(
          `[chat] setReadReceiptForTrainer failed for ${chatId}/${m.id}`,
          err,
        );
        // Allow a retry on next render cycle if it failed.
        alreadyMarkedRef.current.delete(m.id);
      });
    }
  }, [messages, trainerUid, chatId]);

  // Day-separator grouping — civil-date bucket via toDateString(). The
  // iOS edge uses `DaySeparatorGrouper` (P08-02 — pure-function module);
  // a TS port for Pitfall 7 same-source-of-truth is a V2 carry-forward.
  const rows = useMemo(() => groupByCivilDate(messages), [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
        <div className="font-medium">{partnerName}</div>
        {/* P10-08 — trainer-initiated push button. Rendered next to the
            partner name so it sits in the natural attention zone of the
            chat header. The chatId IS the clientId per the P08-04
            deterministic doc-id contract (already documented in
            `chat-server-actions.ts`'s ownership precondition pattern). */}
        <NudgeButton clientId={chatId} clientName={partnerName} />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading messages…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            Couldn&apos;t load messages.
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Say hi to {partnerName}.
          </div>
        ) : (
          rows.map((row) =>
            row.kind === "separator" ? (
              <DaySeparator
                key={`sep-${row.civilDate}`}
                civilDate={row.civilDate}
              />
            ) : (
              <MessageBubble
                key={row.message.id}
                message={row.message}
                isOwn={row.message.senderId === trainerUid}
              />
            ),
          )
        )}
      </div>
      <MessageInput chatId={chatId} />
    </div>
  );
}

// ── Internal helpers (V2 may hoist to shared modules) ──────────────────

function DaySeparator({ civilDate }: { civilDate: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {civilDate}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

interface MessageBubbleProps {
  message: MessageRow;
  isOwn: boolean;
}

function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const align = isOwn ? "justify-end" : "justify-start";
  const tone = isOwn
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-foreground";

  // V1 attachment rendering (Note I — V2 carry-forward):
  //   image / voice variants surface as italic placeholders. Full media
  //   rendering requires a signed-URL fetch endpoint, which lives outside
  //   this plan's scope.
  let body: React.ReactNode;
  if (message.kind === "text") {
    body = (
      <p className="whitespace-pre-wrap break-words text-sm">
        {message.text ?? ""}
      </p>
    );
  } else if (message.kind === "image") {
    body = (
      <span className="text-sm italic">
        📷 Photo
        {message.text ? ` — ${message.text}` : ""}
      </span>
    );
  } else if (message.kind === "voice") {
    const seconds = Math.round((message.voiceDurationMs ?? 0) / 1000);
    body = (
      <span className="text-sm italic">
        🎤 Voice note{seconds > 0 ? ` (${seconds}s)` : ""}
      </span>
    );
  } else {
    // Defensive: future-variant safety. Cast to never-via-string for legibility.
    body = (
      <span className="text-sm italic">Unsupported message type.</span>
    );
  }

  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${tone}`}>
        {body}
        <TimeStamp iso={message.createdAt} isOwn={isOwn} />
      </div>
    </div>
  );
}

function TimeStamp({
  iso,
  isOwn,
}: {
  iso: string | null | undefined;
  isOwn: boolean;
}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <p
      className={`mt-1 text-[10px] ${
        isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
      }`}
    >
      {label}
    </p>
  );
}

// ── Day-separator grouping (pure helper) ────────────────────────────────
//
// Buckets messages by civil date — server timestamps are already ISO 8601;
// `new Date(iso).toDateString()` returns the browser-locale civil date.
// V2 carry-forward: a TS port of the iOS `DaySeparatorGrouper.swift` for
// Pitfall 7 same-source-of-truth (currently the iOS edge uses civil-date
// arithmetic via the P04-01 `CivilDate.format` helper; the web edge here
// is a one-bucket-per-locale-civil-date stub).

type GroupedRow =
  | { kind: "separator"; civilDate: string }
  | { kind: "message"; message: MessageRow };

function groupByCivilDate(messages: MessageRow[]): GroupedRow[] {
  const rows: GroupedRow[] = [];
  let lastBucket: string | null = null;
  for (const m of messages) {
    let bucket: string;
    if (m.createdAt) {
      const d = new Date(m.createdAt);
      bucket = Number.isNaN(d.getTime()) ? "(pending)" : d.toDateString();
    } else {
      bucket = "(pending)";
    }
    if (bucket !== lastBucket) {
      rows.push({ kind: "separator", civilDate: bucket });
      lastBucket = bucket;
    }
    rows.push({ kind: "message", message: m });
  }
  return rows;
}
