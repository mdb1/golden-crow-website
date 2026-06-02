"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { toast } from "sonner";

import { useTrainerChats } from "@/lib/gc-fitness/chat-listener";

const NOTIFICATION_WAV =
  "data:audio/wav;base64,UklGRqQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYABAAD/AwYJDA8SFRgbHiEkJyopLC8yNTg7PkFCQ0ZJS01PUVNUVlZXWVlZWVlXVlRTUU9NSUlGQ0E+Ozg1Mi8sKiknJCEeGxgVFRIPDAkGA/8D/gD8//r/+P/2//T/8v/x/+//7f/s/+v/6v/p/+j/6P/o/+j/6f/q/+v/7P/t/+//8f/y//T/9v/4//r//P/+AAEABAYJDA8SFRgbHiEkJyopLC8yNTg7PkFCQ0ZJS01PUVNUVlZXWVlZWVlXVlRTUU9NSUlGQ0E+Ozg1Mi8sKiknJCEeGxgVFRIPDAkGA/8D/gD8//r/+P/2//T/8v/x/+//7f/s/+v/6v/p/+j/6P/o/+j/6f/q/+v/7P/t/+//8f/y//T/9v/4//r//P/+AAEABAYJDA8SFRgbHiEkJyopLC8yNTg7PkFCQ0ZJS01PUVNUVlZXWVlZWVlXVlRTUU9NSUlGQ0E+Ozg1Mi8sKiknJCEeGxgVFRIPDAkGA/8D/gD8//r/+P/2//T/8v/x/+//7f/s/+v/6v/p/+j/6P/o/+j/6f/q/+v/7P/t/+//8f/y//T/9v/4//r//P/+AAE=";

export function ChatNotificationListener({
  trainerUid,
}: {
  trainerUid: string | null;
}) {
  const enabled = Boolean(trainerUid);
  const { data } = useTrainerChats(enabled);
  const initialized = useRef(false);
  const previous = useRef(new Map<string, { unread: number; messageKey: string | null }>());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const armAudio = () => {
      const audio = audioRef.current ?? new Audio(NOTIFICATION_WAV);
      audio.volume = 0;
      audioRef.current = audio;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0.65;
      }).catch(() => {
        audio.volume = 0.65;
        // Browser did not unlock audio yet; next interaction will retry.
      });
    };
    window.addEventListener("pointerdown", armAudio, { once: true });
    window.addEventListener("keydown", armAudio, { once: true });
    window.addEventListener("touchstart", armAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", armAudio);
      window.removeEventListener("keydown", armAudio);
      window.removeEventListener("touchstart", armAudio);
    };
  }, [enabled]);

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
        playNotificationSound(audioRef);
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

function playNotificationSound(ref: MutableRefObject<HTMLAudioElement | null>) {
  const audio = ref.current ?? new Audio(NOTIFICATION_WAV);
  audio.volume = 0.65;
  ref.current = audio;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Browser autoplay policies can still block sound until user interaction.
  });
}
