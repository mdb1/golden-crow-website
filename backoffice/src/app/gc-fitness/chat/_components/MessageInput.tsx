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

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { X } from "lucide-react";

import {
  sendTrainerMessage,
  uploadTrainerChatAttachment,
} from "@/lib/gc-fitness/chat-server-actions";
import { CHATS_BASE_KEY } from "@/lib/gc-fitness/chat-listener";
import { buildReplyQuote } from "@/lib/gc-fitness/chat-reply";
import type { MessageRow } from "@/lib/gc-fitness/chat-schema";

import { QuickReplyDropdown } from "./QuickReplyDropdown";

export interface MessageInputProps {
  chatId: string;
  disabled?: boolean;
  /** 08-12 quick-reply templates — reserved API slot (dropdown self-fetches in V1). */
  trainerQuickReplies?: string[];
  /** quick-260603-p1p — the message being replied to, or null. */
  replyingTo?: MessageRow | null;
  /** quick-260603-p1p — resolved "You"/client label for the reply banner. */
  replyAuthorLabel?: string;
  /** quick-260603-p1p — cancel-reply hook (banner X). */
  onCancelReply?: () => void;
}

export function MessageInput({
  chatId,
  disabled = false,
  replyingTo = null,
  replyAuthorLabel = "",
  onCancelReply,
}: MessageInputProps) {
  const t = useTranslations("chat.composer");
  const tc = useTranslations("chat.conversation");
  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [supportsRecording, setSupportsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const fallbackAudioInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const canRecord =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined";
    setSupportsRecording(canRecord);
  }, []);

  const mutation = useMutation({
    mutationFn: async (textPayload: string) => {
      // quick-260603-p1p — thread the reply quote (if any) onto the text
      // message. buildReplyQuote returns null when no reply is staged or
      // the quoted message has no id; pass undefined in that case.
      const replyTo = replyingTo ? buildReplyQuote(replyingTo) ?? undefined : undefined;
      await sendTrainerMessage({ chatId, kind: "text", text: textPayload, replyTo });
    },
    onMutate: () => {
      setSubmitError(null);
    },
    onSuccess: () => {
      // Refresh the active thread + the inbox sort order.
      void queryClient.invalidateQueries({
        queryKey: [...CHATS_BASE_KEY, chatId, "messages", "infinite"],
      });
      void queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY });
      setText("");
      onCancelReply?.();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t("errorFallback");
      setSubmitError(message);
    },
  });

  const canSend =
    text.trim().length > 0 && !mutation.isPending && !uploading && !disabled;

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

  const fileToBase64 = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read-failed"));
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const getAudioDurationMs = useCallback((file: File) => {
    return new Promise<number>((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const ms = Math.max(0, Math.round((audio.duration || 0) * 1000));
        URL.revokeObjectURL(url);
        resolve(ms);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      audio.src = url;
    });
  }, []);

  const handleAttachment = useCallback(
    async (file: File, kind: "image" | "voice") => {
      try {
        if (kind === "voice") {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          const isAudioMime = file.type.startsWith("audio/");
          const knownAudioExt = ["m4a", "mp3", "wav", "aac", "mp4"];
          const isIOSFriendlyMime =
            file.type === "" ||
            file.type.includes("mp4") ||
            file.type.includes("mpeg") ||
            file.type.includes("wav") ||
            file.type.includes("aac");
          if (!isAudioMime && !knownAudioExt.includes(ext)) {
            setSubmitError(t("voiceUnsupported"));
            return;
          }
          if (!isIOSFriendlyMime && !knownAudioExt.includes(ext)) {
            setSubmitError(t("voiceUnsupportedIOS"));
            return;
          }
        }
        setSubmitError(null);
        setUploading(true);
        const base64Data = await fileToBase64(file);
        const uploaded = await uploadTrainerChatAttachment({
          chatId,
          kind,
          fileName: file.name,
          mimeType: file.type,
          base64Data,
        });
        if (kind === "image") {
          await sendTrainerMessage({
            chatId,
            kind: "image",
            imagePath: uploaded.storagePath,
          });
        } else {
          const duration = await getAudioDurationMs(file);
          await sendTrainerMessage({
            chatId,
            kind: "voice",
            voicePath: uploaded.storagePath,
            voiceDurationMs: duration,
          });
        }
        void queryClient.invalidateQueries({
          queryKey: [...CHATS_BASE_KEY, chatId, "messages", "infinite"],
        });
        void queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY });
        requestAnimationFrame(() => textareaRef.current?.focus());
      } catch (err) {
        const message = err instanceof Error ? err.message : t("errorFallback");
        setSubmitError(message);
      } finally {
        setUploading(false);
      }
    },
    [chatId, fileToBase64, getAudioDurationMs, queryClient, t],
  );

  const stopMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }, []);

  const stopRecordingAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setSubmitError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType =
        MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/m4a")
            ? "audio/m4a"
            : "";
      if (!mimeType) {
        setSubmitError(t("recordingFormatUnsupported"));
        stopMediaTracks();
        setIsRecording(false);
        fallbackAudioInputRef.current?.click();
        return;
      }
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const ext =
          blob.type.includes("mp4") || blob.type.includes("m4a")
            ? "m4a"
            : "m4a";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, {
          type: blob.type || "audio/mp4",
        });
        void handleAttachment(file, "voice");
        stopMediaTracks();
        setIsRecording(false);
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
      };
      recorder.onerror = () => {
        setSubmitError(t("recordingFailed"));
        stopMediaTracks();
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      setSubmitError(t("recordingPermissionDenied"));
      setIsRecording(false);
      stopMediaTracks();
    }
  }, [handleAttachment, stopMediaTracks, t]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopMediaTracks();
    };
  }, [stopMediaTracks]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-1 border-t bg-background p-3"
    >
      {replyingTo ? (
        <div className="mb-1 flex items-center gap-2 rounded-md border-l-2 border-primary/60 bg-muted/60 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-primary">
              {tc("reply.replyingTo", {
                name: replyAuthorLabel || tc("reply.you"),
              })}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {replyingTo.kind === "text"
                ? replyingTo.text ?? ""
                : replyingTo.kind === "image"
                  ? tc("imagePhoto")
                  : tc("voiceNote")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCancelReply?.()}
            aria-label={tc("reply.cancel")}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <label
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-input px-2 py-2 text-xs"
          title={t("photoCta")}
          aria-label={t("photoCta")}
        >
          <span aria-hidden>📷</span>
          <span className="hidden sm:inline">{t("photoLabel")}</span>
          <input
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.heic"
            className="hidden"
            disabled={uploading || disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              void handleAttachment(file, "image");
            }}
          />
        </label>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            title={isRecording ? t("voiceStopCta") : t("voiceRecordCta")}
            aria-label={isRecording ? t("voiceStopCta") : t("voiceRecordCta")}
            disabled={uploading || disabled}
            onClick={() => {
              if (isRecording) {
                stopRecordingAndSend();
                return;
              }
              if (!supportsRecording) {
                fallbackAudioInputRef.current?.click();
                return;
              }
              void startRecording();
            }}
          >
            <span aria-hidden>{isRecording ? "⏹️" : "🎤"}</span>
            <span className="hidden sm:inline">
              {isRecording ? t("voiceStopLabel") : t("voiceRecordLabel")}
            </span>
          </button>
          <input
            ref={fallbackAudioInputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.aac,.webm,.ogg,.mp4"
            className="hidden"
            disabled={uploading || disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              void handleAttachment(file, "voice");
            }}
          />
        </div>
        <QuickReplyDropdown
          onSelect={handleQuickReplySelect}
          disabled={uploading || disabled}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          onPaste={(e) => {
            // 260527-fwr — Cmd/Ctrl+V with an image in the clipboard
            // uploads + sends it as an image message, same path as the
            // file-picker affordance. Text-only paste falls through to
            // the native behaviour (no preventDefault).
            const items = e.clipboardData?.items;
            if (!items || items.length === 0) return;
            for (const item of items) {
              if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
              const file = item.getAsFile();
              if (!file) continue;
              e.preventDefault();
              // Give the pasted blob a sensible name + extension so the
              // Storage path generator produces a valid object key.
              const ext = file.type.split("/")[1]?.split("+")[0] ?? "png";
              const stamped = new File([file], `pasted-${Date.now()}.${ext}`, {
                type: file.type,
              });
              void handleAttachment(stamped, "image");
              return;
            }
          }}
          placeholder={t("placeholder")}
          rows={1}
          aria-label={t("messageAria")}
          disabled={uploading || disabled}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending || uploading ? t("sending") : t("send")}
        </button>
      </div>
      {disabled ? (
        <p className="text-xs text-amber-700" role="status">
          {t("pendingClientBlocked")}
        </p>
      ) : null}
      {submitError && (
        <p className="text-xs text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </form>
  );
}
