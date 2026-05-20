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

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export interface ChatHistoryWidgetProps {
  clientId: string;
  trainerUid: string;
}

interface MessagePreviewRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date | null;
  isTrainer: boolean;
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
}: ChatHistoryWidgetProps) {
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
        if (kind === "voice") body = "🎤 Voice message";
        else if (kind === "image") body = "📷 Image";
        else body = "—";
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

  return (
    <section className="flex flex-col rounded-md border bg-card p-4">
      <h2 className="mb-3 font-medium">Recent messages</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={
                row.isTrainer
                  ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
              }
            >
              <p className="whitespace-pre-wrap break-words">{row.body}</p>
              <p
                className={
                  row.isTrainer
                    ? "mt-1 text-[10px] text-primary-foreground/70"
                    : "mt-1 text-[10px] text-muted-foreground"
                }
              >
                {row.createdAt ? row.createdAt.toLocaleString() : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
      <Link
        href={`/gc-fitness/chat?clientId=${clientId}`}
        className="mt-3 self-end text-xs text-muted-foreground hover:text-foreground"
      >
        Open full conversation →
      </Link>
    </section>
  );
}
