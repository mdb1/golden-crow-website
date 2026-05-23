"use client";

// MessageInput.tsx — text-message author bar for the active conversation.
//
// V1 ships text-only. The plus-icon menu for image attachments + voice
// notes is intentionally NOT wired here — those are the iOS-only authoring
// surfaces in P08-09. Trainer-side attachments may be revisited in V2 once
// a Storage signed-URL Server Action exists.
//
// Send flow:
//   1. User types in <textarea>; Enter (without shift) submits.
//   2. Mutation calls `sendTrainerMessage({ chatId, kind: "text", text })`.
//   3. On success, invalidate:
//        * the messages cache key → right pane refreshes via useChatMessages
//        * the chats base key     → left pane re-sorts (the Cloud Function
//                                    P08-06 denormed `lastMessage` /
//                                    `lastMessageAt` / cleared the trainer's
//                                    own `unreadCount` slot)
//
// The 08-12 quick-reply dropdown now mounts alongside the textarea as a
// sibling trigger button. The dropdown itself owns its own data
// (`useQuery` → `getCurrentTrainerProfile` Server Action), so MessageInput
// doesn't need to plumb a `trainerQuickReplies` prop — the optional prop
// remains in the surface for callers that want to inject test fixtures or
// pre-rendered data, but is intentionally not wired by V1.
//
// QuickReplyDropdown integration (P08-12):
//   - The dropdown's `onSelect(text)` callback appends the template into
//     the textarea (separated by a newline if the textarea already has
//     content) — it does NOT auto-send. The trainer can edit before
//     hitting Send. This matches the must_haves.truths constraint in
//     PLAN 08-12 ("tapping a quick-reply INSERTS its text into the
//     MessageInput textarea — does NOT auto-send").

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { sendTrainerMessage } from "@/lib/gc-fitness/chat-server-actions";
import { CHATS_BASE_KEY } from "@/lib/gc-fitness/chat-listener";

import { QuickReplyDropdown } from "./QuickReplyDropdown";

export interface MessageInputProps {
  chatId: string;
  /** 08-12 quick-reply templates — reserved API slot (dropdown self-fetches in V1). */
  trainerQuickReplies?: string[];
}

export function MessageInput({ chatId }: MessageInputProps) {
  const t = useTranslations("chat.composer");
  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (textPayload: string) => {
      await sendTrainerMessage({ chatId, kind: "text", text: textPayload });
    },
    onMutate: () => {
      setSubmitError(null);
    },
    onSuccess: () => {
      // Refresh the active thread + the inbox sort order.
      void queryClient.invalidateQueries({
        queryKey: [...CHATS_BASE_KEY, chatId, "messages"],
      });
      void queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY });
      setText("");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t("errorFallback");
      setSubmitError(message);
    },
  });

  const canSend = text.trim().length > 0 && !mutation.isPending;

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    mutation.mutate(trimmed);
  }, [text, mutation]);

  const handleQuickReplySelect = useCallback((reply: string) => {
    // Append the template into the textarea; insert a newline if the
    // trainer already started typing. Do NOT auto-send (per PLAN 08-12
    // must_haves.truths — trainer edits before submit).
    setText((prev) => (prev.trim().length === 0 ? reply : `${prev}\n${reply}`));
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-1 border-t bg-background p-3"
    >
      <div className="flex items-end gap-2">
        <QuickReplyDropdown
          onSelect={handleQuickReplySelect}
          disabled={mutation.isPending}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t("placeholder")}
          rows={1}
          aria-label={t("messageAria")}
          disabled={mutation.isPending}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? t("sending") : t("send")}
        </button>
      </div>
      {submitError && (
        <p className="text-xs text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </form>
  );
}
