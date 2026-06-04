// client-request-fulfillment.ts — READ-ONLY helpers to decide whether a coach's
// "Pedidos al cliente" request (progress photos / body weight) has already been
// fulfilled, i.e. whether the client uploaded the requested item AFTER the
// request timestamp.
//
// Query budget: ONE bounded read per request type at most.
//   - Progress photos: NO new query — the client-detail page already loads the
//     client's recent progress photos; we derive the latest upload time from
//     that in-memory slice (see `latestProgressPhotoUploadAt`).
//   - Body weight: ONE bounded query (users/{uid}/body_weight_logs orderBy
//     recordedAt desc limit 1).
//
// All comparisons are in absolute time (UTC ms), so timezone never matters here.

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { FirestoreCollections } from "./collections";
import type { ProgressPhotoRow } from "./progress-photo-actions";

/** Outcome for a single request row, ready to render as a fulfilled/pending note. */
export interface RequestFulfillment {
  /** true when the client uploaded the requested item after the request. */
  fulfilled: boolean;
  /** absolute upload time of the satisfying record, ISO 8601, or null. */
  fulfilledAt: string | null;
}

const NOT_FULFILLED: RequestFulfillment = { fulfilled: false, fulfilledAt: null };

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "number") return value;
  return null;
}

/**
 * Latest absolute upload time across the already-loaded progress photos.
 * Uses `createdAt` (server upload time) with a `takenAt` fallback — both are
 * ISO strings on `ProgressPhotoRow`. `checkInDate` is deliberately ignored: it
 * is a client-picked civil date (no time, can be backdated) and would let a
 * stale older photo spoof fulfillment.
 */
function latestProgressPhotoUploadMillis(
  photos: readonly ProgressPhotoRow[],
): number | null {
  let latest: number | null = null;
  for (const photo of photos) {
    const ms = toMillis(photo.createdAt) ?? toMillis(photo.takenAt);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

/**
 * Decide progress-photo fulfillment from the in-memory photo slice the page
 * already loaded — NO extra Firestore read. Fulfilled iff the most recent
 * upload happened strictly after the request timestamp.
 */
export function progressPhotosFulfillment(
  requestedAt: unknown,
  photos: readonly ProgressPhotoRow[],
): RequestFulfillment {
  const requestedMs = toMillis(requestedAt);
  if (requestedMs === null) return NOT_FULFILLED;
  const latestMs = latestProgressPhotoUploadMillis(photos);
  if (latestMs === null || latestMs <= requestedMs) return NOT_FULFILLED;
  return { fulfilled: true, fulfilledAt: new Date(latestMs).toISOString() };
}

/**
 * Decide body-weight fulfillment with a single bounded read of the client's
 * most recent body-weight log. Fulfilled iff that log's `recordedAt` is
 * strictly after the request timestamp. Caller MUST have already gated
 * ownership (the client-detail page does, defense-in-depth + Firestore rules);
 * this is a read-only convenience over the same client subtree.
 *
 * Returns NOT_FULFILLED on any read error or when there is no request.
 */
export async function bodyWeightFulfillment(
  clientId: string,
  requestedAt: unknown,
): Promise<RequestFulfillment> {
  const requestedMs = toMillis(requestedAt);
  if (requestedMs === null) return NOT_FULFILLED;

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .collection("body_weight_logs")
    .orderBy("recordedAt", "desc")
    .limit(1)
    .get()
    .catch(() => null);

  const doc = snap?.docs[0];
  if (!doc) return NOT_FULFILLED;
  const recordedMs = toMillis((doc.data() as { recordedAt?: unknown }).recordedAt);
  if (recordedMs === null || recordedMs <= requestedMs) return NOT_FULFILLED;
  return { fulfilled: true, fulfilledAt: new Date(recordedMs).toISOString() };
}
