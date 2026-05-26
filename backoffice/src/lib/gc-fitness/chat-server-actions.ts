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

import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";

import {
  sendMessageInputSchema,
  type ChatRow,
  type MessageRow,
} from "./chat-schema";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const CHATS = FirestoreCollections.chats;
const MESSAGES = FirestoreCollections.messages;

export async function uploadTrainerChatAttachment(input: {
  chatId: string;
  kind: "image" | "voice";
  fileName: string;
  mimeType: string;
  base64Data: string;
}): Promise<{ storagePath: string }> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  await assertChatOwnership(db, input.chatId, session.uid, {
    missingMessage: "Chat not found",
  });

  const ext =
    (input.fileName.split(".").pop() ?? "").toLowerCase() ||
    (input.kind === "image" ? "jpg" : "m4a");
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || (input.kind === "image" ? "jpg" : "m4a");
  const messageId = db.collection(CHATS).doc(input.chatId).collection(MESSAGES).doc().id;
  const prefix = input.kind === "image" ? "images" : "voices";
  const storagePath = `${prefix}/${input.chatId}/${messageId}.${safeExt}`;

  const bytes = Buffer.from(input.base64Data, "base64");
  if (bytes.length === 0) {
    throw new Error("Empty upload");
  }
  const maxBytes = input.kind === "image" ? 10 * 1024 * 1024 : 15 * 1024 * 1024;
  if (bytes.length > maxBytes) {
    throw new Error("Attachment too large");
  }

  const bucket = gcFitnessStorage().bucket();
  await bucket.file(storagePath).save(bytes, {
    resumable: false,
    metadata: {
      contentType: input.mimeType || undefined,
      cacheControl: "public,max-age=31536000,immutable",
    },
  });

  return { storagePath };
}

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

/**
 * 260524 — Merge the canonical nested `unreadCount` map with any legacy
 * flat top-level fields named literally `"unreadCount.X"` (see iOS
 * `ChatRepository.decodeUnreadCountMerged` for the full background). The
 * Cloud Function `onMessageCreated` before this PR used
 * `tx.set(chatRef, payload, { merge: true })` with dotted-string keys —
 * Firestore's set() treats those as literal field names instead of
 * nested paths, so docs created before the fix carry `unreadCount.X`
 * top-level fields and an empty/missing `unreadCount` map. New writes
 * use the proper nested form; this helper bridges both so existing data
 * shows the right badges without a backfill.
 */
function readUnreadCountFromRaw(
  data: Record<string, unknown>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  // Pass 1 — legacy flat dotted-key fields.
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith("unreadCount.")) continue;
    const uid = key.slice("unreadCount.".length);
    if (!uid) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      merged[uid] = value;
    }
  }
  // Pass 2 — canonical nested map; overwrites legacy entries on conflict.
  const nested = data.unreadCount;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [uid, value] of Object.entries(nested as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        merged[uid] = value;
      }
    }
  }
  return merged;
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
  if (data.role !== "client") {
    throw new Error("Client not found");
  }
  if (data.deleted === true) {
    throw new Error("Client not found");
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
      unreadCount: readUnreadCountFromRaw(data),
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
  beforeCreatedAt?: string | null,
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

  let query = db
    .collection(CHATS)
    .doc(chatId)
    .collection(MESSAGES)
    .orderBy("createdAt", "desc");

  if (beforeCreatedAt) {
    const beforeDate = new Date(beforeCreatedAt);
    if (!Number.isNaN(beforeDate.getTime())) {
      query = query.where("createdAt", "<", beforeDate);
    }
  }

  const snap = await query.limit(clampedLimit).get();

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
  }).reverse();
}

// ── setReadReceiptForTrainer (writer — readBy[trainerUid] = ts) ────────
//
// Trainer marks a message as read on their side. Writes EXACTLY one
// field — `readBy.{session.uid}` — via dotted-key narrowness, matching
// the iOS `ChatRepository.markRead` shape (P08-03) and the rule layer's
// affectedKeys whitelist (`readBy.{auth.uid}` only; P08-01).
//
// The Cloud Function `onMessageCreated` (P08-06) also cross-writes
// `chats.unreadCount.{trainerUid} = 0` in a separate trigger (see
// P08-06 contract for the exact transaction shape).
//
// Mitigates T-08-04-01 (cross-trainer read-receipt forgery).
export async function setReadReceiptForTrainer(
  chatId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  await assertChatOwnership(db, chatId, session.uid);

  await db
    .collection(CHATS)
    .doc(chatId)
    .collection(MESSAGES)
    .doc(messageId)
    .update(
      new FieldPath("readBy", session.uid),
      FieldValue.serverTimestamp(),
    );

  return { ok: true };
}

// ── getChatAttachmentUrl (reader — signed URL for image/voice attachments) ──
//
// 260524 — chat messages of kind `image` / `voice` carry a Storage `imagePath`
// / `voicePath` (`images/{chatId}/{messageId}.jpg`, `voices/{chatId}/{...}.m4a`)
// per Message.swift (P08-02). The trainer surface previously rendered these
// as italic placeholders ("📷 Foto" / "🎤 Voice note") because resolving the
// download URL needed a separate fetch endpoint — V1 carry-forward in
// 08-04. This action closes that gap by minting a v4 signed URL via the
// Admin SDK (mirrors `signedUrlForPath` in `progress-photo-actions.ts`)
// after asserting the trainer owns the chat doc.
//
// The URL expires in 60 minutes. The client (MessageBubble) caches the URL
// in React Query keyed by `(chatId, storagePath)`; the cache TTL inside
// React Query is shorter than the URL TTL so the client refetches before
// the URL expires.
//
// Ownership precondition (Pitfall 22 + T-08-04-01 defense-in-depth):
//   The trainer can only fetch URLs for chats they own. The Storage rule
//   layer ALSO enforces this via `isChatParticipant(chatId)` on the
//   /images/{chatId}/* and /voices/{chatId}/* paths (storage.rules) — but
//   Admin SDK signed URLs bypass Storage rules, so the trainer-ownership
//   gate at the Server Action layer is the SOLE gate at this surface.
export async function getChatAttachmentUrl(
  chatId: string,
  storagePath: string,
): Promise<string | null> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  // T-08-04-01 — ownership precondition. The chat doc MUST exist (an
  // attachment message can only land via /chats/{chatId}/messages writes
  // which require the parent chat doc to be born). If the doc is missing,
  // refuse.
  await assertChatOwnership(db, chatId, session.uid);

  // Path-shape guard — only allow signing for the documented chat paths so
  // the trainer cannot probe arbitrary Storage paths via this surface.
  // Mirrors the storage.rules narrowness (`/images/{chatId}/*` and
  // `/voices/{chatId}/*`).
  const allowedPrefixes = [`images/${chatId}/`, `voices/${chatId}/`];
  if (!allowedPrefixes.some((prefix) => storagePath.startsWith(prefix))) {
    throw new Error("Forbidden");
  }

  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const bucketCandidates = [
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.appspot.com` : undefined,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const bucketName of bucketCandidates) {
    try {
      const [url] = await gcFitnessStorage()
        .bucket(bucketName)
        .file(storagePath)
        .getSignedUrl({
          action: "read",
          expires: Date.now() + 60 * 60 * 1000,
        });
      return url;
    } catch {
      // Try next bucket candidate (mirrors `signedUrlForPath` in
      // progress-photo-actions.ts).
    }
  }

  console.warn(
    `[chat] getChatAttachmentUrl: signed URL failed for all bucket candidates (${storagePath})`,
  );
  return null;
}

// ── markChatReadForTrainer (writer — fast-path unreadCount zero) ───────
//
// Trainer opens a thread → instantly zero `chats/{chatId}.unreadCount.{trainerUid}`
// so the inbox row badge clears in one round-trip instead of waiting for
// every partner message's per-doc `readBy.{trainerUid}` write to fan in
// through the `onMessageUpdated` Cloud Function (which the trainer never
// triggered before this branch existed — the per-message readBy path
// applied only to messages the trainer's UI actually rendered).
//
// 260524: the iOS `ChatRepository.markChatRead` (P15-02) is the same
// shape. Both surfaces converge on the rule layer's narrow `allow update`
// branch (P15-01): exactly `{unreadCount.{auth.uid}: 0, updatedAt}` with
// the value clamp `== 0`. Defense in depth — the Cloud Function still
// runs and is harmless on an already-zero slot.
export async function markChatReadForTrainer(
  chatId: string,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  await assertChatOwnership(db, chatId, session.uid);

  await db
    .collection(CHATS)
    .doc(chatId)
    .update(
      new FieldPath("unreadCount", session.uid),
      0,
      "updatedAt",
      FieldValue.serverTimestamp(),
    );

  return { ok: true };
}
