"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useTrainerChats } from "@/lib/gc-fitness/chat-listener";

const NOTIFICATION_WAV =
  "data:audio/wav;base64,UklGRqQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYABAAD/AwYJDA8SFRgbHiEkJyopLC8yNTg7PkFCQ0ZJS01PUVNUVlZXWVlZWVlXVlRTUU9NSUlGQ0E+Ozg1Mi8sKiknJCEeGxgVFRIPDAkGA/8D/gD8//r/+P/2//T/8v/x/+//7f/s/+v/6v/p/+j/6P/o/+j/6f/q/+v/7P/t/+//8f/y//T/9v/4//r//P/+AAEABAYJDA8SFRgbHiEkJyopLC8yNTg7PkFCQ0ZJS01PUVNUVlZXWVlZWVlXVlRTUU9NSUlGQ0E+Ozg1Mi8sKiknJCEeGxgVFRIPDAkGA/8D/gD8//r/+P/2//T/8v/x/+//7f/s/+v/6v/p/+j/6P/o/+j/6f/q/+v/7P/t/+//8f/y//T/9v/4//r//P/+AAEABAYJDA8SFRgbHiEkJyopLC8yNTg7PkFCQ0ZJS01PUVNUVlZXWVlZWVlXVlRTUU9NSUlGQ0E+Ozg1Mi8sKiknJCEeGxgVFRIPDAkGA/8D/gD8//r/+P/2//T/8v/x/+//7f/s/+v/6v/p/+j/6P/o/+j/6f/q/+v/7P/t/+//8f/y//T/9v/4//r//P/+AAE=";

export function ChatNotificationListener({
  trainerUid,
}: {
  trainerUid: string | null;
}) {
  const router = useRouter();
  const enabled = Boolean(trainerUid);
  const { data } = useTrainerChats(enabled);
  const initialized = useRef(false);
  const previous = useRef(new Map<string, { unread: number; messageKey: string | null }>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }
      try {
        const AudioContextCtor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          audioContextRef.current = audioContextRef.current ?? new AudioContextCtor();
          audioContextRef.current.resume().catch(() => undefined);
        }
      } catch {
        // WebAudio is a best-effort fallback for a longer message sound.
      }
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
              router.push(`/gc-fitness/chat?chatId=${chat.clientId}`);
            },
          },
        });
        if (document.hidden) {
          showSystemNotification(chat.clientId, previewText(chat.lastMessage), router.push);
        }
        playNotificationSound(audioRef, audioContextRef);
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

function showSystemNotification(
  chatId: string,
  body: string,
  navigate: (href: string) => void,
) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification("Nuevo mensaje", {
    body,
    tag: `gc-fitness-chat-${chatId}`,
    requireInteraction: false,
  });
  notification.onclick = () => {
    window.focus();
    navigate(`/gc-fitness/chat?chatId=${chatId}`);
  };
}

function playNotificationSound(
  audioRef: MutableRefObject<HTMLAudioElement | null>,
  audioContextRef: MutableRefObject<AudioContext | null>,
) {
  if (playMelody(audioContextRef)) return;
  playEmbeddedAudio(audioRef);
}

function playMelody(ref: MutableRefObject<AudioContext | null>): boolean {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return false;
    const ctx = ref.current ?? new AudioContextCtor();
    ref.current = ctx;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
    const notes = [
      { frequency: 740, start: 0, duration: 0.22 },
      { frequency: 988, start: 0.24, duration: 0.28 },
      { frequency: 830, start: 0.56, duration: 0.26 },
      { frequency: 1108, start: 0.86, duration: 0.32 },
    ];
    for (const note of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + note.start;
      const end = start + note.duration;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.03);
    }
    return true;
  } catch {
    return false;
  }
}

function playEmbeddedAudio(ref: MutableRefObject<HTMLAudioElement | null>) {
  const audio = ref.current ?? new Audio(NOTIFICATION_WAV);
  audio.volume = 0.65;
  ref.current = audio;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Browser autoplay policies can still block sound until user interaction.
  });
}
