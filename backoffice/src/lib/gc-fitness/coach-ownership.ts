// coach-ownership.ts — #1503 (P0 privacy): WHO is the coach of a client doc.
//
// A client who swaps coach (users/C.coachId OLD → NEW) keeps every doc OLD
// authored, with `trainerId == OLD` for good — that field is the AUTHORSHIP,
// and the "from your former coach" attribution reads it. Authorising a coach by
// it alone let OLD keep reading, moving, deleting and propagating onto the plan
// of a client who LEFT (and seeing the logs the client wrote afterwards, which
// copy their assignment's trainerId). Every coach-side action on CLIENT data
// therefore asks two things: did I author it, AND is its client still mine?
//
// Plain module (NOT "use server"): sync helpers + async helpers that take the
// Admin Firestore handle. Server Action files import from here — a "use server"
// file may only export async functions (#785), and moving these there would
// also rotate action IDs (#382).
//
// Self docs (`clientId === viewer`, the coach's own training) and pending docs
// (`clientId` null + `pendingEmail`, a pre-created client with no account yet —
// nobody can have left) stay the author's, with no read.

import { FirestoreCollections } from "./collections";

/** The refusal an action gives when the doc's client is no longer the caller's. */
export const NOT_YOUR_CLIENT = "Not your client.";

export interface CoachScopedDoc {
  trainerId?: unknown;
  clientId?: unknown;
}

function clientIdOf(doc: CoachScopedDoc): string | null {
  return typeof doc.clientId === "string" && doc.clientId.trim().length > 0
    ? doc.clientId.trim()
    : null;
}

/** The caller's CURRENT roster: uids whose `users/{uid}.coachId` is the caller. One query. */
export async function loadCurrentRoster(
  db: FirebaseFirestore.Firestore,
  coachUid: string,
): Promise<Set<string>> {
  const snap = await db
    .collection(FirestoreCollections.users)
    .where("coachId", "==", coachUid)
    .get();
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Sync: is the doc's client currently coached by `viewerUid`, given the roster
 * from `loadCurrentRoster`? Pending (no clientId) and self docs → true.
 */
export function clientIsInScope(
  doc: CoachScopedDoc,
  viewerUid: string,
  roster: ReadonlySet<string>,
): boolean {
  const clientId = clientIdOf(doc);
  if (clientId === null) return true;
  if (clientId === viewerUid) return true;
  return roster.has(clientId);
}

/** Sync twin of `ownsAndCoaches` over a preloaded roster — for loops. */
export function ownsAndCoachesIn(
  doc: CoachScopedDoc,
  viewerUid: string,
  roster: ReadonlySet<string>,
): boolean {
  return doc.trainerId === viewerUid && clientIsInScope(doc, viewerUid, roster);
}

/** One read: does `viewerUid` currently coach `clientId` (or is it themselves)? */
export async function coachesClientNow(
  db: FirebaseFirestore.Firestore,
  viewerUid: string,
  clientId: string,
): Promise<boolean> {
  if (clientId === viewerUid) return true;
  const snap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  if (!snap.exists) return false;
  const data = snap.data() as { coachId?: unknown } | undefined;
  return data?.coachId === viewerUid;
}

/**
 * `doc.trainerId === viewer` AND the doc's client is still the viewer's (or it is
 * a pending / self doc). At most one read.
 */
export async function ownsAndCoaches(
  doc: CoachScopedDoc,
  viewerUid: string,
  db: FirebaseFirestore.Firestore,
): Promise<boolean> {
  if (doc.trainerId !== viewerUid) return false;
  const clientId = clientIdOf(doc);
  if (clientId === null) return true;
  return coachesClientNow(db, viewerUid, clientId);
}

/** Batched: loads the roster ONCE and returns the per-doc predicate. */
export async function ownedAndCoachedPredicate(
  db: FirebaseFirestore.Firestore,
  viewerUid: string,
): Promise<(doc: CoachScopedDoc) => boolean> {
  const roster = await loadCurrentRoster(db, viewerUid);
  return (doc) => ownsAndCoachesIn(doc, viewerUid, roster);
}

/**
 * Throws the action's existing "not yours" error when the caller did not author
 * the doc, and `NOT_YOUR_CLIENT` when they did but the client has moved on.
 */
export async function assertOwnsAndCoaches(
  doc: CoachScopedDoc,
  viewerUid: string,
  db: FirebaseFirestore.Firestore,
  notAuthorMessage: string,
): Promise<void> {
  if (doc.trainerId !== viewerUid) throw new Error(notAuthorMessage);
  if (!(await ownsAndCoaches(doc, viewerUid, db))) throw new Error(NOT_YOUR_CLIENT);
}

/**
 * Batched, roster-only: loads the roster ONCE and returns "is this doc's client
 * still mine (or pending / self)?". For listings whose query already pins
 * `trainerId == me` — the authorship half is the query's job.
 */
export async function clientInScopePredicate(
  db: FirebaseFirestore.Firestore,
  viewerUid: string,
): Promise<(doc: CoachScopedDoc) => boolean> {
  const roster = await loadCurrentRoster(db, viewerUid);
  return (doc) => clientIsInScope(doc, viewerUid, roster);
}
