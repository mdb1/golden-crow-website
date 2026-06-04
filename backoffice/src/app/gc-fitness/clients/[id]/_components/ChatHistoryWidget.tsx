// ChatHistoryWidget.tsx — Per-client deep view: last 5 chat messages,
// read-only preview. Async React Server Component.
//
// Reads `chats/{clientId}/messages` directly via Admin SDK (the parent
// page's ownership gate guarantees this trainer owns this client; the
// chat doc-id IS the clientId per the P08-04 deterministic doc-id
// contract).
//
// Query budget: 1 read (`orderBy createdAt desc limit 5`). Reversed
// client-side for chronological render (oldest at top, newest at
// bottom — matches the iOS thread layout from P08-03).
//
// Sender alignment: messages from `senderId === trainerUid` render
// right-aligned with `bg-primary` (the trainer's own bubble), client
// messages render left-aligned with `bg-muted`. Read-only — no message
// input; CTA at the bottom links to the full conversation surface at
// `/gc-fitness/chat?clientId=<id>`.
//
// Empty state: "No messages yet." — same neutral phrasing as the chat
// inbox empty state from P08-11.

import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  clientActivityGroupKey,
  formatClientActivityDayHeader,
  formatClientActivityTime,
} from "@/lib/gc-fitness/client-activity-time";

export interface ChatHistoryWidgetProps {
  clientId: string;
  trainerUid: string;
  timezone: string;
}

interface MessagePreviewRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date | null;
  isTrainer: boolean;
}

interface MessageGroup {
  key: string;
  label: string;
  rows: MessagePreviewRow[];
}

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function ChatHistoryWidget({
  clientId,
  trainerUid,
  timezone,
}: ChatHistoryWidgetProps) {
  const t = await getTranslations("clients.detail.chatHistory");
  const tCommon = await getTranslations("common");
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.chats)
    .doc(clientId)
    .collection(FirestoreCollections.messages)
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  const rows: MessagePreviewRow[] = snap.docs
    .map((d) => {
      const data = d.data() as {
        senderId?: string;
        text?: string;
        kind?: string;
        createdAt?: unknown;
      };
      // The chat schema (P08-04) is variant-aware: text messages carry
      // `text`, image messages carry `text` as an optional caption,
      // voice messages have no text payload. For this 5-message preview
      // we surface `text` for text+image and fall back to a placeholder
      // for voice / unknown kinds so the row still anchors a timestamp.
      const kind = data.kind ?? "text";
      let body = typeof data.text === "string" ? data.text : "";
      if (!body) {
        if (kind === "voice") body = t("voiceMessage");
        else if (kind === "image") body = t("imageMessage");
        else body = tCommon("emDash");
      }
      return {
        id: d.id,
        senderId: data.senderId ?? "",
        body,
        createdAt: toDate(data.createdAt),
        isTrainer: data.senderId === trainerUid,
      };
    })
    .reverse(); // newest fetched first; reverse so oldest renders at top

  const groups: MessageGroup[] = [];
  for (const row of rows) {
    const key = clientActivityGroupKey(row.createdAt?.toISOString() ?? null, timezone);
    const label = row.createdAt
      ? formatClientActivityDayHeader(row.createdAt.toISOString(), timezone)
      : tCommon("emDash");
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, label, rows: [row] });
    }
  }

  return (
    <section className="flex flex-col rounded-[1.25rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-2.5 font-medium">{t("title")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex max-h-[340px] flex-col gap-2.5 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <p className="text-center text-[11px] text-muted-foreground">{group.label}</p>
              {group.rows.map((row, index) => (
                <div
                  key={row.id}
                  className={
                    row.isTrainer
                      ? "ml-auto max-w-[88%] sm:max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                      : "mr-auto max-w-[88%] sm:max-w-[80%] rounded-2xl rounded-bl-sm bg-emerald-50 px-3 py-1.5 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50"
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{row.body}</p>
                  {index === group.rows.length - 1 ? (
                    <p
                      className={
                        row.isTrainer
                      ? "mt-1 text-[10px] text-primary-foreground/70"
                          : "mt-1 text-[10px] text-emerald-900/70 dark:text-emerald-50/70"
                      }
                    >
                      {formatClientActivityTime(
                        row.createdAt ? row.createdAt.toISOString() : null,
                        timezone,
                      )}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <Link
        href={`/gc-fitness/chat?clientId=${clientId}`}
        className="mt-3 self-end text-xs text-muted-foreground hover:text-foreground"
      >
        {t("openFull")}
      </Link>
    </section>
  );
}
