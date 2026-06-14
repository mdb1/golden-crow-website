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
import { Trash2, CornerUpLeft, SmilePlus } from "lucide-react";
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
  setTrainerMessageReaction,
} from "@/lib/gc-fitness/chat-server-actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ChatRow, MessageRow } from "@/lib/gc-fitness/chat-schema";
import { REACTION_EMOJI } from "@/lib/gc-fitness/chat-reactions";
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
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { ChatImageLightbox } from "./ChatImageLightbox";

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
  const messages = useMemo(() => {
    // useInfiniteQuery APPENDS each older page, so the flattened array is
    // [newest-page, older-page, …]. Sort ascending by createdAt so prepended
    // older messages render above the newer ones (oldest at top, newest at
    // bottom); pending sends (no createdAt) sort to the very bottom.
    const flat = (data?.pages ?? []).flatMap((page) => page);
    return [...flat].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }, [data]);
  const newestMessageId = messages.length ? messages[messages.length - 1].id : null;
  // "Visto" goes under the trainer's MOST RECENT own message, and only when the
  // client (chatId == client uid) has read it. Mirrors iMessage / the mobile
  // apps: the receipt never hops to an older message while newer ones are still
  // unread, so it doesn't float orphaned high up the thread.
  const seenReceiptId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === trainerUid) {
        return messages[i].readBy?.[chatId] ? messages[i].id : null;
      }
    }
    return null;
  }, [messages, trainerUid, chatId]);
  const queryClient = useQueryClient();

  const partnerEntry = useMemo(
    () => clientRoster.find((c) => c.uid === chatId) ?? null,
    [clientRoster, chatId],
  );
  const partnerName = partnerEntry?.displayName ?? chatId;
  const partnerPhotoURL = partnerEntry?.photoURL ?? null;

  // quick-260603-p1p — WhatsApp-style reply quote. The message the trainer
  // is replying to (staged via the per-bubble hover reply button), or null.
  // Reset when the active chat changes (see the chatId effect below).
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);

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
    // quick-260603-p1p — drop any staged reply when switching chats.
    setReplyingTo(null);
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

  // Scroll to the bottom on conversation switch, or when a genuinely NEW message
  // arrives at the tail while the user is near the bottom. Keyed on the newest
  // message id (NOT messages.length) so a "load older" prepend — which also grows
  // the length — does not yank the user back down (that bug made scroll-up paging
  // look broken: older messages loaded but the view snapped straight to bottom).
  const prevChatIdRef = useRef<string | null>(null);
  const prevNewestIdRef = useRef<string | null>(null);
  useEffect(() => {
    const chatChanged = prevChatIdRef.current !== chatId;
    const newestChanged = prevNewestIdRef.current !== newestMessageId;
    prevChatIdRef.current = chatId;
    prevNewestIdRef.current = newestMessageId;
    if (chatChanged || (newestChanged && nearBottomRef.current)) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [chatId, newestMessageId, scrollToBottom]);

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
      <div className="flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <ClientAvatar name={partnerName} photoURL={partnerPhotoURL} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground">
            {partnerName}
          </div>
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background/40 px-4 py-5"
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
                  showSeen={row.message.id === seenReceiptId}
                  timezone={timezone}
                  trainerUid={trainerUid}
                  partnerName={partnerName}
                  onReply={setReplyingTo}
                  onAttachmentLoaded={handleAttachmentLoaded}
                  onDeleted={() => {
                    void queryClient.invalidateQueries({
                      queryKey: [...CHATS_BASE_KEY, chatId, "messages", "infinite"],
                    });
                    void queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY });
                  }}
                  onReacted={() => {
                    void queryClient.invalidateQueries({
                      queryKey: [...CHATS_BASE_KEY, chatId, "messages", "infinite"],
                    });
                  }}
                />
              ),
            )}
          </>
        )}
      </div>
      <div className="shrink-0">
        <MessageInput
          chatId={chatId}
          disabled={isPendingClient}
          replyingTo={replyingTo}
          replyAuthorLabel={
            replyingTo
              ? replyingTo.senderId === trainerUid
                ? t("reply.you")
                : partnerName
              : ""
          }
          onCancelReply={() => setReplyingTo(null)}
        />
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
  /** True only for the trainer's most recent own message once the client has
   * read it — renders the "Seen"/"Visto" receipt (iMessage behavior). */
  showSeen: boolean;
  timezone: string;
  /** quick-260603-p1p — signed-in trainer uid (resolves "You" in quotes). */
  trainerUid: string;
  /** quick-260603-p1p — client display name (resolves the partner author). */
  partnerName: string;
  /** quick-260603-p1p — stage this message as a reply (hover button). */
  onReply?: (m: MessageRow) => void;
  onAttachmentLoaded?: () => void;
  onDeleted?: () => void;
  /** Refetch messages after a reaction write (mirrors onDeleted). */
  onReacted?: () => void;
}

function MessageBubble({
  chatId,
  message,
  isOwn,
  showSeen,
  timezone,
  trainerUid,
  partnerName,
  onReply,
  onAttachmentLoaded,
  onDeleted,
  onReacted,
}: MessageBubbleProps) {
  const t = useTranslations("chat.conversation");
  const align = isOwn ? "justify-end" : "justify-start";
  const tone = isOwn
    ? "bg-primary text-primary-foreground rounded-br-md"
    : "bg-muted text-foreground rounded-bl-md ring-1 ring-foreground/5";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
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

  // My current reaction on this message (the trainer's own uid slot), if any.
  const myReaction = message.reactions?.[trainerUid] ?? null;
  const reactionMutation = useMutation({
    mutationFn: async (emoji: string | null) =>
      setTrainerMessageReaction({ chatId, messageId: message.id, emoji }),
    onSuccess: () => {
      setReactOpen(false);
      onReacted?.();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("reactionFailed");
      toast.error(msg);
    },
  });
  // Toggle: tapping my current emoji clears it; tapping another sets it.
  const toggleReaction = (emoji: string) =>
    reactionMutation.mutate(myReaction === emoji ? null : emoji);

  const reactButton = (
    <Popover open={reactOpen} onOpenChange={setReactOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("reactionAdd")}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100 data-[state=open]:opacity-100 aria-expanded:opacity-100"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-auto rounded-full p-1.5"
        sideOffset={6}
      >
        <div className="flex items-center gap-0.5">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => toggleReaction(emoji)}
              disabled={reactionMutation.isPending}
              aria-pressed={myReaction === emoji}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-muted ${
                myReaction === emoji ? "bg-primary/15 ring-1 ring-primary/40" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

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
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
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

  // quick-260603-p1p — nested quoted block rendered INSIDE the bubble above
  // the body when this message is a reply. Author = "You" when the quoted
  // message's author is the trainer, else the client display name. Snippet =
  // text snippet (text kind) or the localized 📷/🎤 placeholder. A desktop
  // swipe-to-reply gesture is intentionally NOT implemented — the hover
  // reply button is the equivalent affordance on this surface.
  const reply = message.replyTo;
  const quotedBlock = reply ? (
    <div className="mb-1 flex gap-2 rounded-md border-l-2 border-primary/60 bg-background/60 px-2 py-1">
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-primary">
          {reply.senderId === trainerUid ? t("reply.you") : partnerName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {reply.kind === "text"
            ? reply.textSnippet
            : reply.kind === "image"
              ? t("imagePhoto")
              : t("voiceNote")}
        </div>
      </div>
    </div>
  ) : null;

  // quick-260603-p1p — hover reply button mirroring the delete affordance,
  // placed on the OPPOSITE side of the delete button.
  const replyButton = onReply ? (
    <button
      type="button"
      onClick={() => onReply(message)}
      aria-label={t("reply.replyButton")}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
    >
      <CornerUpLeft className="h-3.5 w-3.5" />
    </button>
  ) : null;

  return (
    <div className={`group/msg flex items-center gap-1 ${align}`}>
      {/* Delete + reply affordances — visible on hover, sit OUTSIDE the
          bubble. Delete is on the bubble's near side; reply on the far
          side (mirrored relative to alignment). */}
      {isOwn ? (
        <>
          {reactButton}
          {replyButton}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={t("deleteMessageAria")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${tone}`}>
        {quotedBlock}
        {body}
        {message.reactions && Object.keys(message.reactions).length > 0 ? (
          <ReactionRow
            reactions={message.reactions}
            myReaction={myReaction}
            onToggle={toggleReaction}
          />
        ) : null}
        <TimeStamp iso={message.createdAt} isOwn={isOwn} timezone={timezone} />
        {isOwn && showSeen ? (
          <p className="mt-0.5 text-right text-[11px] text-primary-foreground/70">
            {t("seen")}
          </p>
        ) : null}
      </div>
      {!isOwn ? (
        <>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={t("deleteMessageAria")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {replyButton}
          {reactButton}
        </>
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
  // Issue #252 — tap-to-enlarge. The bubble's <img> is capped at max-h-80 and
  // object-cover crops it; clicking opens the SAME signed URL full-size in a
  // lightbox overlay (no extra fetch — the browser reuses the cached bytes).
  const [expanded, setExpanded] = useState(false);
  if (url == null) {
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
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left"
        aria-label={caption ?? placeholder}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption ?? placeholder}
          loading="lazy"
          style={aspect ? { aspectRatio: aspect } : undefined}
          className="max-h-80 w-auto rounded-lg object-cover"
          onLoad={onLoaded}
        />
      </button>
      {caption ? <p className="text-sm">{caption}</p> : null}
      {expanded ? (
        <ChatImageLightbox
          url={url}
          alt={caption ?? placeholder}
          onClose={() => setExpanded(false)}
        />
      ) : null}
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

function ReactionRow({
  reactions,
  myReaction,
  onToggle,
}: {
  reactions: Record<string, string>;
  myReaction: string | null;
  onToggle: (emoji: string) => void;
}) {
  const grouped = Object.values(reactions).reduce<Record<string, number>>(
    (acc, emoji) => {
      acc[emoji] = (acc[emoji] ?? 0) + 1;
      return acc;
    },
    {},
  );
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(grouped).map(([emoji, count]) => {
        const mine = myReaction === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            aria-pressed={mine}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm transition-colors ${
              mine
                ? "bg-primary/15 text-foreground ring-1 ring-primary/45"
                : "bg-background/80 text-foreground hover:bg-background"
            }`}
          >
            <span>{emoji}</span>
            <span className="text-muted-foreground">{count}</span>
          </button>
        );
      })}
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
      className={`mt-1 text-[11px] ${
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
