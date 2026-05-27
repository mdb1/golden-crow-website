"use client";

// ChatThreadList.tsx — left pane of the trainer inbox.
//
// Renders ONE row per active chat thread, sorted by:
//   1. unreadCount[trainerUid] DESC   (newest unread at top)
//   2. lastMessageAt          DESC    (tiebreaker — most recent thread wins)
//
// The server query (`listChatsForTrainer` from P08-04) already orders by
// `lastMessageAt DESC` against the P08-01 composite index
// (`coachId ASC, lastMessageAt DESC`). The unread-by-trainer sort happens
// here client-side because Firestore can't compositely index a dot-path map
// with a variable key (the trainer's uid would have to be baked into the
// index at deploy time — untenable per PATTERNS.md Note A).
//
// Trainer uid (Note G from PLAN.md) is plumbed in as a prop from `client.tsx`
// — the single server-side source of truth (`await getCurrentTrainer()` in
// `page.tsx`). Per-row unread counts read `chat.unreadCount[trainerUid]`.
//
// Per-row chrome: Avatar (initials) + display name + last-message preview +
// relative-time hint + unread badge. Mirrors Slack / iMessage compact list
// row layout. Active row is highlighted via `bg-muted`.

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { useTrainerChats } from "@/lib/gc-fitness/chat-listener";
import type { ChatRow } from "@/lib/gc-fitness/chat-schema";

import type { ClientRosterEntry } from "../client";

interface Props {
  /** Trainer's Firebase Auth UID — used to read per-uid unread count. */
  trainerUid: string;
  /** Currently selected chatId (from `?chatId=...`). */
  activeChatId: string | null;
  /** Row click → set the `?chatId=` search param. */
  onSelect: (chatId: string) => void;
  /** uid → displayName lookup source from listClients(). */
  clientRoster: ClientRosterEntry[];
}

export function ChatThreadList({
  trainerUid,
  activeChatId,
  onSelect,
  clientRoster,
}: Props) {
  const t = useTranslations("chat.threadList");
  const { data, isLoading, error } = useTrainerChats();

  // uid → displayName lookup — bounded to the trainer's client roster.
  const nameByUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientRoster) m.set(c.uid, c.displayName);
    return m;
  }, [clientRoster]);
  const photoByUid = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const c of clientRoster) m.set(c.uid, c.photoURL);
    return m;
  }, [clientRoster]);

  // Client-side sort: unread DESC, then lastMessageAt DESC.
  // Falls back to chat.updatedAt then chat.createdAt when lastMessageAt is
  // missing (denorm race: the chat doc exists but the Cloud Function hasn't
  // written `lastMessageAt` yet — extremely brief window).
  const sorted = useMemo(() => {
    const rowsByClientId = new Map<string, ChatRow>();
    for (const row of data ?? []) {
      rowsByClientId.set(row.clientId, row);
    }

    // Ensure the inbox always includes every assigned client, even if the
    // chat parent doc doesn't exist yet (never-messaged client).
    for (const rosterClient of clientRoster) {
      if (!rowsByClientId.has(rosterClient.uid)) {
        rowsByClientId.set(rosterClient.uid, {
          id: rosterClient.uid,
          clientId: rosterClient.uid,
          coachId: trainerUid,
          lastMessage: undefined,
          lastMessageAt: null,
          unreadCount: {},
          createdAt: null,
          updatedAt: null,
        });
      }
    }

    const rows = Array.from(rowsByClientId.values());
    rows.sort((a, b) => {
      const ua = a.unreadCount?.[trainerUid] ?? 0;
      const ub = b.unreadCount?.[trainerUid] ?? 0;
      if (ua !== ub) return ub - ua;
      const ta =
        a.lastMessageAt ?? a.lastMessage?.createdAt ?? a.updatedAt ?? a.createdAt ?? "";
      const tb =
        b.lastMessageAt ?? b.lastMessage?.createdAt ?? b.updatedAt ?? b.createdAt ?? "";
      // ISO 8601 strings sort reverse-lexicographically = newest first.
      return tb.localeCompare(ta);
    });
    return rows;
  }, [clientRoster, data, trainerUid]);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{t("loading")}</div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">{t("loadError")}</div>
    );
  }
  if (sorted.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t("noConversations")}
        <br />
        <span className="mt-2 block">{t("firstMessagesHere")}</span>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {sorted.map((chat) => (
        <ChatThreadRow
          key={chat.id}
          chat={chat}
          trainerUid={trainerUid}
          displayName={nameByUid.get(chat.clientId) ?? chat.clientId}
          photoURL={photoByUid.get(chat.clientId) ?? null}
          isActive={chat.id === activeChatId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

// ── Row component ──────────────────────────────────────────────────────

interface ChatThreadRowProps {
  chat: ChatRow;
  trainerUid: string;
  displayName: string;
  photoURL: string | null;
  isActive: boolean;
  onSelect: (chatId: string) => void;
}

function ChatThreadRow({
  chat,
  trainerUid,
  displayName,
  photoURL,
  isActive,
  onSelect,
}: ChatThreadRowProps) {
  const t = useTranslations("chat.threadList");
  const unread = chat.unreadCount?.[trainerUid] ?? 0;
  const previewIso =
    chat.lastMessage?.createdAt ?? chat.lastMessageAt ?? chat.updatedAt ?? null;
  const previewText = previewKindLabel(chat.lastMessage, t);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(chat.id)}
        className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent ${
          isActive ? "bg-accent" : ""
        }`}
      >
        <Avatar name={displayName} photoURL={photoURL} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate font-medium">{displayName}</div>
            <RelativeTime iso={previewIso} />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {previewText}
            </p>
            {unread > 0 && <UnreadBadge count={unread} />}
          </div>
        </div>
      </button>
    </li>
  );
}

// ── Inline helpers (kept local; V2 may hoist to a shared module) ───────

function Avatar({ name, photoURL }: { name: string; photoURL?: string | null }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // If photoURL is set but fails to load (404, expired Storage signature,
  // CORS, etc.), fall back to initials instead of leaving a broken-image
  // icon. Tracked per render via local state.
  const [failed, setFailed] = useState(false);
  const showImage = !!photoURL && !failed;
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary"
    >
      {showImage ? (
        <Image
          src={photoURL!}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-full object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        initials || "·"
      )}
    </div>
  );
}

function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const t = useTranslations("chat.threadList");
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  let label: string;
  if (diffSec < 60) label = t("justNow");
  else if (diffSec < 3600)
    label = t("minutesShort", { count: Math.floor(diffSec / 60) });
  else if (diffSec < 86400)
    label = t("hoursShort", { count: Math.floor(diffSec / 3600) });
  else if (diffSec < 86400 * 7)
    label = t("daysShort", { count: Math.floor(diffSec / 86400) });
  else label = date.toLocaleDateString();
  return (
    <span className="flex-shrink-0 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="flex-shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
      {count}
    </span>
  );
}

function previewKindLabel(
  lastMessage: ChatRow["lastMessage"] | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!lastMessage) return t("previewStart");
  switch (lastMessage.kind) {
    case "text":
      return lastMessage.text || t("previewEmpty");
    case "image":
      return lastMessage.text
        ? t("previewImageWithText", { text: lastMessage.text })
        : t("previewImage");
    case "voice":
      return t("previewVoice");
    default:
      // exhaustive switch; future variants fall through to a safe label
      return lastMessage.text || t("previewNewMessage");
  }
}
