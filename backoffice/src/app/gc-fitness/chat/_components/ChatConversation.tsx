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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";

import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  clientActivityCivilDateKey,
  formatClientActivityDate,
  formatClientActivityTime,
} from "@/lib/gc-fitness/client-activity-time";
import { CHATS_BASE_KEY, useChatMessages } from "@/lib/gc-fitness/chat-listener";
import {
  deleteTrainerChatMessage,
  getChatAttachmentUrl,
  markChatReadForTrainer,
  setReadReceiptForTrainer,
} from "@/lib/gc-fitness/chat-server-actions";
import type { ChatRow, MessageRow } from "@/lib/gc-fitness/chat-schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import type { ClientRosterEntry } from "../client";
import { MessageInput } from "./MessageInput";

export interface ChatConversationProps {
  chatId: string;
  trainerUid: string;
  timezone: string;
  clientRoster: ClientRosterEntry[];
  isPendingClient?: boolean;
}

export function ChatConversation({
  chatId,
  trainerUid,
  timezone,
  clientRoster,
  isPendingClient = false,
}: ChatConversationProps) {
  const t = useTranslations("chat.conversation");
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useChatMessages(chatId);
  const messages = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page),
    [data],
  );
  const queryClient = useQueryClient();

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
    // 260524 — FAST path: zero chats/{chatId}.unreadCount.{trainerUid}
    // on open so the inbox row badge clears in one round-trip instead of
    // waiting for the per-message readBy fan-in.
    //
    // Two-stage cache update for instant UI feedback (260524 follow-up):
    //   1. Optimistically rewrite the cached chats list right now so the
    //      ChatThreadList badge AND the sidebar badge
    //      (gc-fitness-shell.tsx -> useTrainerChats) drop to zero in the
    //      same render tick as the user's click. No server round-trip.
    //   2. After the Server Action resolves, invalidate so the canonical
    //      state replaces the optimistic write (and rebuilds the badge
    //      in case any concurrent message bumped it).
    queryClient.setQueryData<ChatRow[]>(CHATS_BASE_KEY, (prev) => {
      if (!prev) return prev;
      let changed = false;
      const next = prev.map((row) => {
        if (row.id !== chatId && row.clientId !== chatId) return row;
        const slot = row.unreadCount?.[trainerUid] ?? 0;
        if (slot === 0) return row;
        changed = true;
        return {
          ...row,
          unreadCount: { ...row.unreadCount, [trainerUid]: 0 },
        };
      });
      return changed ? next : prev;
    });

    let cancelled = false;
    markChatReadForTrainer(chatId)
      .then(() => {
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY });
      })
      .catch((err) => {
        console.warn(`[chat] markChatReadForTrainer failed for ${chatId}`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, queryClient, trainerUid]);

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
  const rows = useMemo(() => groupByCivilDate(messages, timezone), [messages, timezone]);

  // 260524 — auto-scroll the message pane to the most recent message
  // when:
  //   - the active chat changes (entering a thread should land you at
  //     the bottom, mirroring iOS / Slack / Messages behavior);
  //   - a new message arrives (sender or receiver);
  //   - an attachment (image / voice) finishes loading and grows the
  //     bubble height past the initial layout pass.
  //
  // We use a ref on the scrollable container and jump-set scrollTop
  // rather than `scrollIntoView` so the user's window scroll is not
  // affected. The effect only runs after the layout pass (next tick)
  // so the new content's `scrollHeight` is the post-render value.
  //
  // The attachment re-snap is gated on `nearBottomRef`: if the trainer
  // has scrolled up to read history, we DON'T yank them back when an
  // image lands. The threshold is generous (300px) because chat-image
  // bubbles can grow by ~400px when a photo resolves from its empty
  // <img> placeholder to its decoded dimensions.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousScrollHeightRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = scrollContainerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    nearBottomRef.current = true;
  }, []);

  // Initial enter / new-message scroll stays instant ("auto") — the user
  // expects the thread to LAND at the bottom, not glide into place.
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [chatId, messages.length, scrollToBottom]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const onScroll = () => {
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      nearBottomRef.current = distanceFromBottom < 300;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const onScrollTopFetchOlder = () => {
      if (node.scrollTop > 80) return;
      if (!hasNextPage || isFetchingNextPage) return;
      previousScrollHeightRef.current = node.scrollHeight;
      void fetchNextPage();
    };
    node.addEventListener("scroll", onScrollTopFetchOlder, { passive: true });
    return () => node.removeEventListener("scroll", onScrollTopFetchOlder);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!isFetchingNextPage) {
      const node = scrollContainerRef.current;
      if (!node) return;
      const previous = previousScrollHeightRef.current;
      if (previous <= 0) return;
      const diff = node.scrollHeight - previous;
      if (diff > 0) node.scrollTop += diff;
      previousScrollHeightRef.current = 0;
    }
  }, [isFetchingNextPage, messages.length]);

  // Attachment re-snap glides instead of jumping — the initial instant
  // scroll already landed the user at the bottom; when an image / audio
  // finally resolves and pushes content down, an animated catch-up reads
  // as polish rather than a jolt. Gated on `nearBottomRef` so a trainer
  // who scrolled up to read history isn't yanked back.
  const handleAttachmentLoaded = useCallback(() => {
    if (!nearBottomRef.current) return;
    requestAnimationFrame(() => scrollToBottom("smooth"));
  }, [scrollToBottom]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
        <div className="font-medium">{partnerName}</div>
      </div>
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("loadingMessages")}
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {t("loadError")}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("noMessagesYet", { name: partnerName })}
          </div>
        ) : (
          <>
            {isFetchingNextPage ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                {t("loadingMessages")}
              </div>
            ) : null}
            {rows.map((row) =>
              row.kind === "separator" ? (
                <DaySeparator
                  key={`sep-${row.civilDate}`}
                  label={row.label}
                />
              ) : (
                <MessageBubble
                  key={row.message.id}
                  chatId={chatId}
                  message={row.message}
                  isOwn={row.message.senderId === trainerUid}
                  timezone={timezone}
                  onAttachmentLoaded={handleAttachmentLoaded}
                  onDeleted={() => {
                    void queryClient.invalidateQueries({
                      queryKey: [...CHATS_BASE_KEY, chatId, "messages", "infinite"],
                    });
                    void queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY });
                  }}
                />
              ),
            )}
          </>
        )}
      </div>
      <div className="shrink-0 border-t bg-background">
        <MessageInput chatId={chatId} disabled={isPendingClient} />
      </div>
    </div>
  );
}

// ── Internal helpers (V2 may hoist to shared modules) ──────────────────

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

interface MessageBubbleProps {
  chatId: string;
  message: MessageRow;
  isOwn: boolean;
  timezone: string;
  onAttachmentLoaded?: () => void;
  onDeleted?: () => void;
}

function MessageBubble({
  chatId,
  message,
  isOwn,
  timezone,
  onAttachmentLoaded,
  onDeleted,
}: MessageBubbleProps) {
  const t = useTranslations("chat.conversation");
  const align = isOwn ? "justify-end" : "justify-start";
  const tone = isOwn
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-foreground";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: async () =>
      deleteTrainerChatMessage({ chatId, messageId: message.id }),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success(t("messageDeleted"));
      onDeleted?.();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("messageDeleteFailed");
      toast.error(msg);
    },
  });

  // 260524 — render real photos + voice notes via signed Storage URLs.
  // Previous V1 carry-forward shipped italic placeholders ("📷 Foto"
  // / "🎤 Voice note") because resolving the download URL required a
  // round-trip the inbox UI didn't have. The `getChatAttachmentUrl`
  // Server Action (chat-server-actions.ts) mints a v4 signed URL via
  // the Admin SDK after asserting the trainer owns the chat, so the
  // bubble can lazy-load the asset.
  let body: React.ReactNode;
  if (message.kind === "text") {
    body = (
      <p className="whitespace-pre-wrap break-words text-sm">
        {message.text ?? ""}
      </p>
    );
  } else if (message.kind === "image" && message.imagePath) {
    body = (
      <ChatImageBubble
        chatId={chatId}
        imagePath={message.imagePath}
        caption={message.text}
        width={message.imageWidth}
        height={message.imageHeight}
        placeholder={t("imagePhoto")}
        onLoaded={onAttachmentLoaded}
      />
    );
  } else if (message.kind === "voice" && message.voicePath) {
    body = (
      <ChatVoiceBubble
        chatId={chatId}
        voicePath={message.voicePath}
        durationMs={message.voiceDurationMs}
        placeholder={t("voiceNote")}
        onLoaded={onAttachmentLoaded}
      />
    );
  } else {
    // Defensive: future-variant safety. Cast to never-via-string for legibility.
    body = <span className="text-sm italic">{t("unsupportedMessage")}</span>;
  }

  return (
    <div className={`group/msg flex items-center gap-1 ${align}`}>
      {/* Delete affordance — visible on hover, sits OUTSIDE the bubble on
          the side that doesn't break the bubble's rounded corner. */}
      {isOwn ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label={t("deleteMessageAria")}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${tone}`}>
        {body}
        {message.reactions && Object.keys(message.reactions).length > 0 ? (
          <ReactionRow reactions={message.reactions} />
        ) : null}
        <TimeStamp iso={message.createdAt} isOwn={isOwn} timezone={timezone} />
      </div>
      {!isOwn ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label={t("deleteMessageAria")}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteMessageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteMessageBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("deleteMessageCancel")}
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  deleteMutation.mutate();
                }}
              >
                {deleteMutation.isPending
                  ? t("deleteMessageDeleting")
                  : t("deleteMessageConfirm")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ChatImageBubbleProps {
  chatId: string;
  imagePath: string;
  caption: string | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  placeholder: string;
  onLoaded?: () => void;
}

function ChatImageBubble({
  chatId,
  imagePath,
  caption,
  width,
  height,
  placeholder,
  onLoaded,
}: ChatImageBubbleProps) {
  const url = useSignedAttachmentUrl(chatId, imagePath);
  if (url === null) {
    return (
      <span className="text-sm italic">
        {placeholder}
        {caption ? ` — ${caption}` : ""}
      </span>
    );
  }
  const aspect = width && height ? `${width} / ${height}` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={caption ?? placeholder}
        loading="lazy"
        style={aspect ? { aspectRatio: aspect } : undefined}
        className="max-h-80 w-auto rounded-lg object-cover"
        onLoad={onLoaded}
      />
      {caption ? <p className="text-sm">{caption}</p> : null}
    </div>
  );
}

interface ChatVoiceBubbleProps {
  chatId: string;
  voicePath: string;
  durationMs: number | null | undefined;
  placeholder: string;
  onLoaded?: () => void;
}

function ChatVoiceBubble({
  chatId,
  voicePath,
  durationMs,
  placeholder,
  onLoaded,
}: ChatVoiceBubbleProps) {
  const url = useSignedAttachmentUrl(chatId, voicePath);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(Math.max(0, Math.round((durationMs ?? 0) / 1000)));

  const togglePlayPause = useCallback(async () => {
    const node = audioRef.current;
    if (!node) return;
    if (node.paused) {
      await node.play();
      setIsPlaying(true);
      return;
    }
    node.pause();
    setIsPlaying(false);
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  if (url === null) {
    return <span className="text-sm italic">{placeholder}</span>;
  }
  const max = Math.max(totalTime, 1);
  const progress = Math.min(Math.max(currentTime, 0), max);

  return (
    <div className="flex min-w-64 flex-col gap-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(event) => {
          const next = Number.isFinite(event.currentTarget.duration)
            ? Math.max(0, Math.round(event.currentTarget.duration))
            : Math.max(0, Math.round((durationMs ?? 0) / 1000));
          setTotalTime(next);
          onLoaded?.();
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      >
        <track kind="captions" />
      </audio>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void togglePlayPause()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/70 text-xs font-semibold text-foreground ring-1 ring-border transition hover:bg-background"
          aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={max}
          step={0.1}
          value={progress}
          onChange={(event) => {
            const node = audioRef.current;
            if (!node) return;
            const next = Number(event.currentTarget.value);
            node.currentTime = next;
            setCurrentTime(next);
          }}
          className="h-1.5 w-full cursor-pointer accent-foreground"
          aria-label="Voice note progress"
        />
        <span className="w-20 text-right text-[10px] opacity-70">
          {formatTime(currentTime)} / {formatTime(totalTime)}
        </span>
      </div>
    </div>
  );
}

/**
 * Lazy-load a signed Storage URL for a chat attachment. Returns:
 *   - `undefined` while the URL fetch is in flight;
 *   - `null` when the fetch failed (caller renders the placeholder);
 *   - the URL string on success.
 *
 * The signed URL expires in 60 minutes (see `getChatAttachmentUrl` in
 * chat-server-actions.ts). We don't refetch on a timer — the trainer's
 * inbox sessions are typically shorter than 60 minutes, and React Query's
 * 10s message-feed refetch would not re-render the bubble unless the
 * message id changes anyway.
 */
function useSignedAttachmentUrl(
  chatId: string,
  storagePath: string,
): string | null | undefined {
  const [state, setState] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setState(undefined);
    getChatAttachmentUrl(chatId, storagePath)
      .then((url) => {
        if (cancelled) return;
        setState(url);
      })
      .catch(() => {
        if (cancelled) return;
        setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, storagePath]);
  return state;
}

function ReactionRow({ reactions }: { reactions: Record<string, string> }) {
  const grouped = Object.values(reactions).reduce<Record<string, number>>(
    (acc, emoji) => {
      acc[emoji] = (acc[emoji] ?? 0) + 1;
      return acc;
    },
    {},
  );
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(grouped).map(([emoji, count]) => (
        <span
          key={emoji}
          className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm"
        >
          <span>{emoji}</span>
          <span className="text-muted-foreground">{count}</span>
        </span>
      ))}
    </div>
  );
}

function TimeStamp({
  iso,
  isOwn,
  timezone,
}: {
  iso: string | null | undefined;
  isOwn: boolean;
  timezone: string;
}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const label = formatClientActivityTime(iso, timezone);
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
  | { kind: "separator"; civilDate: string; label: string }
  | { kind: "message"; message: MessageRow };

function groupByCivilDate(messages: MessageRow[], timezone: string): GroupedRow[] {
  const rows: GroupedRow[] = [];
  let lastBucket: string | null = null;
  for (const m of messages) {
    let bucket: string;
    if (m.createdAt) {
      const d = new Date(m.createdAt);
      bucket = Number.isNaN(d.getTime())
        ? "(pending)"
        : clientActivityCivilDateKey(m.createdAt, timezone);
    } else {
      bucket = "(pending)";
    }
    if (bucket !== lastBucket) {
      rows.push({
        kind: "separator",
        civilDate: bucket,
        label: m.createdAt ? formatClientActivityDate(m.createdAt, timezone) : bucket,
      });
      lastBucket = bucket;
    }
    rows.push({ kind: "message", message: m });
  }
  return rows;
}
