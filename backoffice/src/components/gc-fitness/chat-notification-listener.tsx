"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { toast } from "sonner";

import { useTrainerChats } from "@/lib/gc-fitness/chat-listener";

export function ChatNotificationListener({
  trainerUid,
}: {
  trainerUid: string | null;
}) {
  const enabled = Boolean(trainerUid);
  const { data } = useTrainerChats(enabled);
  const initialized = useRef(false);
  const previous = useRef(new Map<string, { unread: number; messageKey: string | null }>());
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!enabled || !trainerUid || !data) return;

    const next = new Map<string, { unread: number; messageKey: string | null }>();
    for (const chat of data) {
      const unread = Math.max(0, chat.unreadCount?.[trainerUid] ?? 0);
      const messageKey = chat.lastMessage
        ? `${chat.lastMessage.senderId}:${chat.lastMessage.createdAt}:${chat.lastMessage.text}`
        : null;
      next.set(chat.id, { unread, messageKey });

      const before = previous.current.get(chat.id);
      const isIncoming = chat.lastMessage?.senderId !== trainerUid;
      const becameUnread = before ? unread > before.unread : unread > 0;
      const isNewMessage = before ? messageKey !== before.messageKey : false;
      if (initialized.current && isIncoming && unread > 0 && becameUnread && isNewMessage) {
        toast.info(`Nuevo mensaje`, {
          description: previewText(chat.lastMessage),
          action: {
            label: "Abrir chat",
            onClick: () => {
              window.location.href = `/gc-fitness/chat?chatId=${chat.clientId}`;
            },
          },
        });
        playNotificationSound(audioContext);
      }
    }

    previous.current = next;
    initialized.current = true;
  }, [data, enabled, trainerUid]);

  return null;
}

function previewText(message: { kind?: string; text?: string } | null | undefined): string {
  if (!message) return "Tenés un nuevo mensaje.";
  if (message.kind === "image") return message.text || "Imagen recibida.";
  if (message.kind === "voice") return "Audio recibido.";
  return message.text || "Tenés un nuevo mensaje.";
}

function playNotificationSound(ref: MutableRefObject<AudioContext | null>) {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = ref.current ?? new AudioContextCtor();
    ref.current = ctx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
  } catch {
    // Browser autoplay policies can block programmatic audio until interaction.
  }
}
