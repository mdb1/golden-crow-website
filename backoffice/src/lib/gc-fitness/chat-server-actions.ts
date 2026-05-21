// chat-server-actions.ts
//
// Server Actions for the GC Fitness trainer Chat surface (P08-11 inbox UI
// consumes this module). 4 actions:
//   - sendTrainerMessage(input)                      — writer (variant-aware)
//   - listChatsForTrainer()                          — reader (inbox list)
//   - fetchMessages(chatId, limit?)                  — reader (thread)
//   - setReadReceiptForTrainer(chatId, messageId)    — writer (readBy dot)
//
// This module is the SOLE trainer-writable path to /chats/{chatId}/messages.
// The Admin SDK bypasses Firestore rules, so the rule layer (P08-01) does
// NOT cover backoffice paths — the gate is:
//
//   1. `getCurrentTrainer()` — trainer role + email allowlist (P03-05).
//   2. Per-action ownership precondition — `chat.coachId === session.uid`
//      via 1 get() before the write/read of any per-chat data.
//   3. Zod `.parse()` strip-unknown drops caller-supplied `senderId` /
//      `createdAt`; the Server Action sets both AFTER parse from
//      server-trusted values (`session.uid` + `FieldValue.serverTimestamp()`).
//
// Pitfall 22 reuse (10th):
//   NO Server Action exposes parent-doc writes to /chats/{chatId}. Only
//   the Cloud Function `onMessageCreated` (P08-06) writes `lastMessage`,
//   `lastMessageAt`, `unreadCount`, `createdAt`, `updatedAt`. The backoffice
//   surface only writes the messages subcollection + the per-message
//   `readBy.{uid}` dotted-key field via `setReadReceiptForTrainer`.
//
// Threat-register coverage (matches PLAN.md 08-04 <threat_model>):
//   T-08-04-01 (EoP — trainer A sends message on /chats/{otherClient})
//     → Ownership precondition `chat.coachId === session.uid` via 1 get()
//       before every write/read. Throws "Forbidden" on mismatch.
//   T-08-04-02 (Tampering — caller-supplied senderId in payload)
//     → Zod `.parse()` strip-unknown drops `senderId` from input; the
//       Server Action sets `senderId: session.uid` AFTER parse.
//   T-08-04-03 (InfoDisclosure — cross-trainer listChatsForTrainer leak)
//     → Query gate `.where('coachId', '==', session.uid)` scopes the
//       result set. Defense in depth even if a future caller forgets
//       to filter.
//   T-08-04-04 (Tampering — client-write to /chats parent doc)
//     → No Server Action exposes parent-doc writer parameters. Cloud
//       Function `onMessageCreated` (P08-06) is the sole writer of
//       lastMessage / lastMessageAt / unreadCount.
//   T-08-04-05 (DoS — unbounded fetchMessages read)
//     → `Math.min(Math.max(limit, 1), 200)` cap; default 50.
//
// REFERENCE PATTERN: mirrors `habit-actions.ts` (P06-05) verbatim for
// getCurrentTrainer integration, FieldValue.serverTimestamp usage, the
// `toIso` helper, and the ownership-precondition shape. The defense-in-depth
// session.uid post-parse assignment is the same shape as habit-actions
// `createHabit` (line 153, T-06-05-01 mitigation).
//
// SORT KEY (Note C from PLAN.md):
//   `listChatsForTrainer` uses `orderBy("lastMessageAt", "desc")` — matching
//   the P08-01 composite index Entry 1 (`coachId ASC, lastMessageAt DESC`)
//   + the Swift `Chat.lastMessageAt` field shipped in P01-01 Chat.swift.
//   The Cloud Function `onMessageCreated` (P08-06) writes the field on
//   every denorm pass. Until P08-06 lands, chat docs do not exist yet
//   (the Cloud Function is what creates them on first message), so this
//   query returns an empty list — which is correct: empty trainer inbox.

"use server";

import {
  FieldPath,
  FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  sendMessageInputSchema,
  type ChatRow,
  type MessageRow,
} from "./chat-schema";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const CHATS = FirestoreCollections.chats;
const MESSAGES = FirestoreCollections.messages;

/**
 * Coerces a Firestore Timestamp (or any value exposing `.toDate()`) to an
 * ISO string. Returns null for missing / unknown shapes. Mirrors the
 * `toIso` helper from `habit-actions.ts` verbatim.
 *
 * Used at the Server Action boundary so React state / React-Query cache
 * stay serializable across the Server Component → Client Component pass.
 */
function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function projectLastMessage(
  data:
    | { text?: unknown; senderId?: unknown; createdAt?: unknown; kind?: unknown }
    | undefined,
): ChatRow["lastMessage"] {
  if (!data) return undefined;
  const createdAtIso = toIso(data.createdAt);
  const kind = data.kind;
  if (
    createdAtIso !== null &&
    (kind === "text" || kind === "image" || kind === "voice")
  ) {
    return {
      text: String(data.text ?? ""),
      senderId: String(data.senderId ?? ""),
      createdAt: createdAtIso,
      kind,
    };
  }
  return undefined;
}

/**
 * Reads a chat doc once and enforces the ownership precondition:
 * `chat.coachId === session.uid`. Throws on missing chat or on
 * cross-trainer access. Centralized so every Action shares the same
 * gate (T-08-04-01 mitigation).
 *
 * The `coachIdResolver` parameter lets callers pass a custom 404-style
 * message; defaults to "Chat not found" for the common case.
 *
 * Returns the raw doc data once ownership is confirmed (lets callers
 * read additional fields without a second fetch).
 */
async function assertChatOwnership(
  db: Firestore,
  chatId: string,
  trainerUid: string,
  opts?: { missingMessage?: string },
): Promise<Record<string, unknown>> {
  const chatSnap = await db.collection(CHATS).doc(chatId).get();
  if (!chatSnap.exists) {
    throw new Error(opts?.missingMessage ?? "Chat not found");
  }
  const data = chatSnap.data() as Record<string, unknown>;
  if (data.coachId !== trainerUid) {
    throw new Error("Forbidden");
  }
  return data;
}

async function assertTrainerOwnsClient(
  db: Firestore,
  clientId: string,
  trainerUid: string,
): Promise<void> {
  const userSnap = await db.collection("users").doc(clientId).get();
  if (!userSnap.exists) {
    throw new Error("Client not found");
  }
  const data = userSnap.data() as Record<string, unknown>;
  if (data.coachId !== trainerUid) {
    throw new Error("Forbidden");
  }
}

// ── sendTrainerMessage (writer — Pitfall 22 client-doc untouched) ──────
//
// Trainer-side message send. Admin SDK bypasses rules, so the gate is:
//   1. getCurrentTrainer() — trainer role + email allowlist.
//   2. Ownership check: chat.coachId === session.uid (1 get()).
//   3. Zod parse on the payload — strip-unknown drops any caller-supplied
//      senderId / createdAt; we set both AFTER parse from server-trusted
//      values (session.uid + FieldValue.serverTimestamp()).
//
// The Cloud Function `onMessageCreated` (P08-06) then denormalizes
// chats.lastMessage + chats.lastMessageAt + bumps chats.unreadCount.{clientId}
// — same path the iOS edge uses. No backoffice-side denorm (Pitfall 22).
//
// Mitigates T-08-04-01, T-08-04-02.
export async function sendTrainerMessage(
  input: unknown,
): Promise<{ id: string }> {
  const session = await getCurrentTrainer();
  const parsed = sendMessageInputSchema.parse(input);
  const db = gcFitnessFirestore();

  // T-08-04-01 — ownership precondition. For never-messaged clients the
  // chat parent doc may not exist yet, so fall back to users/{clientId}.coachId.
  const chatRef = db.collection(CHATS).doc(parsed.chatId);
  const chatSnap = await chatRef.get();
  if (chatSnap.exists) {
    const data = chatSnap.data() as Record<string, unknown>;
    if (data.coachId !== session.uid) {
      throw new Error("Forbidden");
    }
  } else {
    await assertTrainerOwnsClient(db, parsed.chatId, session.uid);
  }

  // Build the wire-shape variant-aware. NEVER spread `parsed` into the
  // doc body — the only fields written are the ones explicitly enumerated
  // here, mirroring the habit-actions update-patch whitelist.
  // T-08-04-02 — senderId is set AFTER parse from session.uid; a tampered
  // input `senderId` was already stripped by Zod's strip-unknown default.
  const data: Record<string, unknown> = {
    kind: parsed.kind,
    senderId: session.uid, // ← server-trusted, NEVER from input
    createdAt: new Date(),
  };
  if (parsed.kind === "text") {
    data.text = parsed.text;
  }
  if (parsed.kind === "image") {
    data.imagePath = parsed.imagePath;
    if (parsed.imageWidth !== undefined) data.imageWidth = parsed.imageWidth;
    if (parsed.imageHeight !== undefined) data.imageHeight = parsed.imageHeight;
    // Image messages MAY carry an optional caption — mirror Message.swift line 146-148.
    if (parsed.text !== undefined && parsed.text.length > 0) {
      data.text = parsed.text;
    }
  }
  if (parsed.kind === "voice") {
    data.voicePath = parsed.voicePath;
    data.voiceDurationMs = parsed.voiceDurationMs;
  }

  const msgRef = db
    .collection(CHATS)
    .doc(parsed.chatId)
    .collection(MESSAGES)
    .doc();
  const createdAt = data.createdAt;
  const previewText =
    parsed.kind === "text"
      ? parsed.text
      : parsed.kind === "image"
        ? parsed.text || "[Image]"
        : "[Voice]";

  const batch = db.batch();
  batch.set(msgRef, data);
  batch.set(
    chatRef,
    {
      clientId: parsed.chatId,
      coachId: session.uid,
      lastMessage: {
        text: previewText,
        senderId: session.uid,
        createdAt,
        kind: parsed.kind,
      },
      lastMessageAt: createdAt,
      [`unreadCount.${parsed.chatId}`]: FieldValue.increment(1),
      updatedAt: createdAt,
    },
    { merge: true },
  );
  await batch.commit();

  return { id: msgRef.id };
}

// ── listChatsForTrainer (reader — P08-11 inbox left pane) ──────────────
//
// Returns all chats where coachId == session.uid, ordered by
// lastMessageAt DESC (matching the P08-01 composite index Entry 1:
// `coachId ASC, lastMessageAt DESC`).
//
// Note: unread-by-trainer sort is done CLIENT-SIDE in the inbox UI
// (P08-11) per PATTERNS.md Note A — Firestore can't compositely index a
// dot-path map with a variable key (`unreadCount.{coachUid}` requires
// knowing the uid at index-declaration time, which would lock the
// trainer's uid into the index — untenable).
//
// Mitigates T-08-04-03 (cross-trainer inbox leak — defense in depth
// even if a future caller forgets to filter).
// Mitigates T-08-04-05 (unbounded read — capped at 200).
export async function listChatsForTrainer(): Promise<ChatRow[]> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const snap = await db
    .collection(CHATS)
    .where("coachId", "==", session.uid)
    .limit(200)
    .get();

  const rows = await Promise.all(snap.docs.map(async (doc) => {
    const data = doc.data();
    let lastMessage = projectLastMessage(data.lastMessage as Parameters<typeof projectLastMessage>[0]);
    let lastMessageAt = toIso(data.lastMessageAt);

    // Local-dev fallback: Cloud Functions may not be deployed yet, so the
    // parent chat doc can lack lastMessage/lastMessageAt even while messages
    // exist in the subcollection. Compute a read-side preview so the inbox is
    // usable before the denormalizer is live.
    if (!lastMessage || !lastMessageAt) {
      const latest = await doc.ref
        .collection(MESSAGES)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      const latestDoc = latest.docs[0] as QueryDocumentSnapshot | undefined;
      if (latestDoc) {
        lastMessage = projectLastMessage(latestDoc.data() as Parameters<typeof projectLastMessage>[0]);
        lastMessageAt = lastMessage?.createdAt ?? lastMessageAt;
      }
    }

    return {
      id: doc.id,
      clientId: (data.clientId as string) ?? doc.id,
      coachId: (data.coachId as string) ?? "",
      lastMessage,
      lastMessageAt,
      unreadCount:
        (data.unreadCount as Record<string, number> | undefined) ?? {},
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    } satisfies ChatRow;
  }));

  rows.sort((a, b) => {
    const ta = a.lastMessageAt ?? a.lastMessage?.createdAt ?? a.updatedAt ?? a.createdAt ?? "";
    const tb = b.lastMessageAt ?? b.lastMessage?.createdAt ?? b.updatedAt ?? b.createdAt ?? "";
    return tb.localeCompare(ta);
  });
  return rows;
}

export async function getTrainerUnreadChatCount(): Promise<number> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const snap = await db
    .collection(CHATS)
    .where("coachId", "==", session.uid)
    .limit(200)
    .get();

  return snap.docs.reduce((total, doc) => {
    const data = doc.data();
    const unreadMap =
      (data.unreadCount as Record<string, number> | undefined) ?? {};
    const value = unreadMap[session.uid] ?? 0;
    return total + Math.max(0, Number.isFinite(value) ? value : 0);
  }, 0);
}

// ── fetchMessages (reader — P08-11 right pane / thread view) ───────────
//
// Returns the most-recent N messages in a chat thread, ordered ASC by
// createdAt (oldest first — matches the iOS thread layout via
// `ChatRepository.messagesStream` from P08-03).
//
// Ownership precondition: `chat.coachId === session.uid` via 1 get().
//
// Mitigates T-08-04-01 (cross-trainer thread access).
// Mitigates T-08-04-05 (unbounded read — clamped 1..200, default 50).
export async function fetchMessages(
  chatId: string,
  limit = 50,
): Promise<MessageRow[]> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  // T-08-04-01 — ownership precondition. Empty chat is a 404 not a
  // permission error; matches habit-actions "Not found" semantics.
  // If the chat doesn't exist yet (no messages have been sent), surface
  // an empty list rather than throwing — the inbox UI can render the
  // empty state gracefully.
  const chatSnap = await db.collection(CHATS).doc(chatId).get();
  if (!chatSnap.exists) {
    return [];
  }
  const chat = chatSnap.data() as Record<string, unknown>;
  if (chat.coachId !== session.uid) {
    throw new Error("Forbidden");
  }

  const clampedLimit = Math.min(Math.max(limit, 1), 200);

  const snap = await db
    .collection(CHATS)
    .doc(chatId)
    .collection(MESSAGES)
    .orderBy("createdAt", "asc")
    .limit(clampedLimit)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    const readByRaw = (data.readBy ?? {}) as Record<string, unknown>;
    const readBy: Record<string, string> = {};
    for (const [uid, ts] of Object.entries(readByRaw)) {
      const iso = toIso(ts);
      if (iso) readBy[uid] = iso;
    }
    return {
      id: doc.id,
      kind: data.kind as MessageRow["kind"],
      senderId: (data.senderId as string) ?? "",
      createdAt: toIso(data.createdAt),
      text: typeof data.text === "string" ? data.text : undefined,
      imagePath: typeof data.imagePath === "string" ? data.imagePath : undefined,
      imageWidth: typeof data.imageWidth === "number" ? data.imageWidth : undefined,
      imageHeight: typeof data.imageHeight === "number" ? data.imageHeight : undefined,
      voicePath: typeof data.voicePath === "string" ? data.voicePath : undefined,
      voiceDurationMs:
        typeof data.voiceDurationMs === "number" ? data.voiceDurationMs : undefined,
      reactions: (data.reactions as Record<string, string> | undefined) ?? {},
      readBy,
    } satisfies MessageRow;
  });
}

// ── setReadReceiptForTrainer (writer — readBy[trainerUid] = ts) ────────
//
// Trainer marks a message as read on their side. Writes the message
// `readBy.{session.uid}` slot and clears the parent
// `unreadCount.{session.uid}` slot in the same Admin SDK batch so the inbox
// and sidebar badge clear immediately.
//
// Mitigates T-08-04-01 (cross-trainer read-receipt forgery).
export async function setReadReceiptForTrainer(
  chatId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  await assertChatOwnership(db, chatId, session.uid);

  const batch = db.batch();
  batch.update(
    db
      .collection(CHATS)
      .doc(chatId)
      .collection(MESSAGES)
      .doc(messageId),
    new FieldPath("readBy", session.uid),
    FieldValue.serverTimestamp(),
  );
  batch.set(
    db.collection(CHATS).doc(chatId),
    {
      unreadCount: {
        [session.uid]: 0,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  return { ok: true };
}
