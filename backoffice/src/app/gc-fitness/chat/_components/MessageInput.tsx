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

import { ChatImageLightbox } from "./ChatImageLightbox";
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
  /**
   * #926 — text to seed the composer with, exactly once per `chatId`.
   *
   * Arrives from a `?draft=` deep link (a nutrition note's "Responder"). It is a DRAFT and
   * nothing else: nothing is sent, the coach edits it and hits send like any other
   * message.
   */
  initialDraft?: string | null;
}

export function MessageInput({
  chatId,
  disabled = false,
  initialDraft = null,
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
  // Staged photo awaiting Send (WhatsApp-style). The upload is DEFERRED to
  // submit time so cancelling never leaves an orphaned Storage object. The
  // preview uses an object URL off the local File (instant, no signed-URL
  // round-trip). `text`, when present, rides along as the image caption.
  const [pendingImage, setPendingImage] = useState<{
    file: File;
    previewUrl: string;
    fileName: string;
  } | null>(null);
  const pendingImageRef = useRef(pendingImage);
  // Issue #258 — full-size preview of the STAGED attachment so the coach can
  // check the photo before hitting Send. Same lightbox the sent bubbles use.
  const [previewingPendingImage, setPreviewingPendingImage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [supportsRecording, setSupportsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const fallbackAudioInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  /**
   * Seed the composer from the deep link, ONCE per (chatId, draft) pair — and clear the
   * param as soon as it lands.
   *
   * Both halves matter. Without the once-guard, every re-render of a URL that still says
   * `?draft=` would overwrite whatever the coach has typed since. Without clearing the
   * param, a reload minutes later would resurrect a note they already answered, on top of
   * a half-written message.
   *
   * It never clobbers work in progress: a composer with text in it is left alone.
   */
  const seededDraftKey = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDraft) return;
    const key = `${chatId}:${initialDraft}`;
    if (seededDraftKey.current === key) return;
    seededDraftKey.current = key;
    setText((current) => (current.trim() === "" ? initialDraft : current));
    textareaRef.current?.focus();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("draft");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, [chatId, initialDraft]);

  useEffect(() => {
    const canRecord =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined";
    setSupportsRecording(canRecord);
  }, []);

  const clearPendingImage = useCallback(() => {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const stageImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setSubmitError(null);
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
      };
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // Keep a ref mirror so the unmount cleanup can revoke the last preview URL
  // without re-running on every staged image.
  useEffect(() => {
    pendingImageRef.current = pendingImage;
    // Issue #258 — close the full-size preview whenever the staged file
    // changes (sent / removed / replaced) so it never shows a stale image.
    setPreviewingPendingImage(false);
  }, [pendingImage]);
  useEffect(() => {
    return () => {
      if (pendingImageRef.current) {
        URL.revokeObjectURL(pendingImageRef.current.previewUrl);
      }
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (payload: { text: string; file?: File }) => {
      // quick-260603-p1p — thread the reply quote (if any) onto the
      // message. buildReplyQuote returns null when no reply is staged or
      // the quoted message has no id; pass undefined in that case.
      const replyTo = replyingTo ? buildReplyQuote(replyingTo) ?? undefined : undefined;
      if (payload.file) {
        // Photo path — upload now (deferred from staging time), then send a
        // single image message carrying the typed text as an optional caption.
        const base64Data = await fileToBase64(payload.file);
        const uploaded = await uploadTrainerChatAttachment({
          chatId,
          kind: "image",
          fileName: payload.file.name,
          mimeType: payload.file.type,
          base64Data,
        });
        await sendTrainerMessage({
          chatId,
          kind: "image",
          imagePath: uploaded.storagePath,
          text: payload.text.length > 0 ? payload.text : undefined,
          replyTo,
        });
        return;
      }
      await sendTrainerMessage({ chatId, kind: "text", text: payload.text, replyTo });
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
      clearPendingImage();
      onCancelReply?.();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t("errorFallback");
      setSubmitError(message);
    },
  });

  const canSend =
    (text.trim().length > 0 || pendingImage !== null) &&
    !mutation.isPending &&
    !uploading &&
    !disabled;

  const handleSubmit = useCallback(() => {
    if (mutation.isPending || uploading) return;
    const trimmed = text.trim();
    if (pendingImage) {
      mutation.mutate({ text: trimmed, file: pendingImage.file });
      return;
    }
    if (!trimmed) return;
    mutation.mutate({ text: trimmed });
  }, [text, pendingImage, mutation, uploading]);

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

  // Voice notes still send immediately on stop/select — that's the intended
  // record-and-send UX. Photos, by contrast, stage via stageImage() and only
  // send on the Send button (see mutation + handleSubmit).
  const handleVoiceAttachment = useCallback(
    async (file: File) => {
      try {
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
        setSubmitError(null);
        setUploading(true);
        const base64Data = await fileToBase64(file);
        const uploaded = await uploadTrainerChatAttachment({
          chatId,
          kind: "voice",
          fileName: file.name,
          mimeType: file.type,
          base64Data,
        });
        const duration = await getAudioDurationMs(file);
        await sendTrainerMessage({
          chatId,
          kind: "voice",
          voicePath: uploaded.storagePath,
          voiceDurationMs: duration,
        });
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
        void handleVoiceAttachment(file);
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
  }, [handleVoiceAttachment, stopMediaTracks, t]);

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
      className="flex flex-col gap-2 border-t border-border bg-card/80 p-3 backdrop-blur"
    >
      {replyingTo ? (
        <div className="flex items-center gap-2 rounded-xl border-l-2 border-primary/60 bg-muted/60 px-3 py-2">
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
      {pendingImage ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
          {/* Issue #258 — the staged thumbnail opens full-size so the coach
              can check the photo before sending it. */}
          <button
            type="button"
            onClick={() => setPreviewingPendingImage(true)}
            aria-label={t("previewAttachment")}
            title={t("previewAttachment")}
            className="shrink-0 cursor-zoom-in appearance-none border-0 bg-transparent p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not optimizable */}
            <img
              src={pendingImage.previewUrl}
              alt={pendingImage.fileName}
              className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
            />
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {pendingImage.fileName}
          </span>
          <button
            type="button"
            onClick={clearPendingImage}
            disabled={mutation.isPending}
            aria-label={t("removeAttachment")}
            title={t("removeAttachment")}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {pendingImage && previewingPendingImage ? (
        <ChatImageLightbox
          url={pendingImage.previewUrl}
          alt={pendingImage.fileName}
          onClose={() => setPreviewingPendingImage(false)}
        />
      ) : null}
      <div className="flex items-end gap-2 rounded-3xl border border-border bg-background p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
        <label
          className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t("photoCta")}
          aria-label={t("photoCta")}
        >
          <span aria-hidden>📷</span>
          <input
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.heic"
            className="hidden"
            disabled={uploading || disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              stageImage(file);
            }}
          />
        </label>
        <div className="inline-flex items-center">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
              void handleVoiceAttachment(file);
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
            // 260527-fwr — Cmd/Ctrl+V with an image in the clipboard STAGES
            // it as a pending attachment (preview + Send), same path as the
            // file-picker affordance. Text-only paste falls through to the
            // native behaviour (no preventDefault).
            const items = e.clipboardData?.items;
            if (!items || items.length === 0) return;
            for (const item of items) {
              if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
              const file = item.getAsFile();
              if (!file) continue;
              e.preventDefault();
              // Give the pasted blob a sensible name + extension so the
              // Storage path generator produces a valid object key at send time.
              const ext = file.type.split("/")[1]?.split("+")[0] ?? "png";
              const stamped = new File([file], `pasted-${Date.now()}.${ext}`, {
                type: file.type,
              });
              stageImage(stamped);
              return;
            }
          }}
          placeholder={t("placeholder")}
          rows={1}
          aria-label={t("messageAria")}
          disabled={uploading || disabled}
          className="max-h-40 flex-1 resize-none self-center border-0 bg-transparent px-2 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
