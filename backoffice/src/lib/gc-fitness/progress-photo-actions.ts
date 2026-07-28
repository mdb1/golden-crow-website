"use server";

import { gcFitnessFirestore, gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentAdmin, getCurrentTrainer } from "./auth-helpers";
import { adminCanViewClientUnderCoach } from "./coachless-user-model";
import { FirestoreCollections } from "./collections";

export interface ProgressPhotoRow {
  id: string;
  caption: string | null;
  storagePath: string;
  url: string | null;
  angle: "front" | "side" | "back" | null;
  checkInDate: string | null;
  setId: string | null;
  createdAt: string | null;
  takenAt: string | null;
}

async function assertOwnsClient(
  coachId: string,
  clientId: string,
): Promise<void> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachId) {
    throw new Error("Forbidden");
  }
}

function timestampToIso(value: unknown): string | null {
  return value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}

async function signedUrlForPath(storagePath: string): Promise<string | null> {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const candidates = [
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.appspot.com` : undefined,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const bucketName of candidates) {
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
      // Try next bucket candidate.
    }
  }

  // eslint-disable-next-line no-console
  console.warn("[gc-fitness/progress-photos] signed URL failed for all bucket candidates");
  return null;
}

/**
 * Project an ISO timestamp string to a canonical "YYYY-MM-DD" civil-date
 * string in the trainer's local timezone. We use `Intl.DateTimeFormat`
 * with the `'en-CA'` locale because the Canadian locale formats dates as
 * `YYYY-MM-DD` natively — sidesteps the `.toISOString().slice(0, 10)`
 * UTC-shift bug where a trainer in a negative-offset zone uploading at
 * 21:00 local would see the date roll forward a day.
 *
 * Mirrors the iOS surface's `CivilDate.format(_:in:)` semantics: same
 * wire shape, same TZ-current projection. Returns null when the input
 * is null or unparseable.
 */
function civilDateFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export async function listProgressPhotosForClient(
  clientId: string,
): Promise<ProgressPhotoRow[]> {
  const trainer = await getCurrentTrainer();
  await assertOwnsClient(trainer.uid, clientId);
  return loadProgressPhotos(clientId);
}

/**
 * Admin god-mode (read-only): a client's progress photos, verifying the client
 * belongs to `coachId` so the route can't read across coaches. Uses the WIDER
 * `adminCanViewClientUnderCoach` gate rather than the trainer-path
 * `assertOwnsClient`, so a coach-less user (their own trainer-of-record —
 * `coachId === clientId`) is admitted too. The trainer path above keeps the
 * strict `coachId` equality.
 */
export async function listProgressPhotosForClientAsAdmin(
  coachId: string,
  clientId: string,
): Promise<ProgressPhotoRow[]> {
  await getCurrentAdmin();
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  const allowed =
    snap.exists &&
    adminCanViewClientUnderCoach({
      coachUidInPath: coachId,
      clientId,
      clientCoachId: typeof snap.get("coachId") === "string" ? snap.get("coachId") : null,
      clientRole: typeof snap.get("role") === "string" ? snap.get("role") : null,
      clientDeleted: snap.get("deleted") === true,
    });
  if (!allowed) {
    throw new Error("Forbidden");
  }
  return loadProgressPhotos(clientId);
}

/**
 * Core photo loader — query + signed-URL map + check-in-date sort, WITHOUT any
 * authorization. Callers MUST gate first (trainer ownership or admin).
 */
async function loadProgressPhotos(
  clientId: string,
): Promise<ProgressPhotoRow[]> {
  // Sort dimension lives client-side, not server-side: we want photos
  // ordered by the client-picked check-in date, not by upload time. A
  // server-side `orderBy("checkInDate")` would silently drop legacy docs
  // whose `checkInDate` is null (Firestore orderBy excludes missing-field
  // documents). Sorting the bounded `limit(24)` slice in memory keeps
  // legacy photos visible via the `createdAt` civil-date fallback.
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.progressPhotos)
    .where("clientId", "==", clientId)
    .limit(24)
    .get();

  const rows = await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      const storagePath =
        typeof data.storagePath === "string" ? data.storagePath : "";
      return {
        id: doc.id,
        caption: typeof data.caption === "string" ? data.caption : null,
        storagePath,
        url: storagePath ? await signedUrlForPath(storagePath) : null,
        angle:
          data.angle === "front" || data.angle === "side" || data.angle === "back"
            ? data.angle
            : null,
        checkInDate:
          typeof data.checkInDate === "string" ? data.checkInDate : null,
        setId: typeof data.setId === "string" ? data.setId : null,
        createdAt: timestampToIso(data.createdAt),
        takenAt: timestampToIso(data.takenAt),
      };
    }),
  );

  // Sort by `(checkInDate ?? civilDateFromIso(createdAt) ?? "")` descending.
  // Both keys are `"YYYY-MM-DD"` strings, so localeCompare with reversed
  // arguments yields chronological-descending order. Rows missing both
  // fields sort to the end via the empty-string fallback.
  rows.sort((a, b) => {
    const aKey = a.checkInDate ?? civilDateFromIso(a.createdAt) ?? "";
    const bKey = b.checkInDate ?? civilDateFromIso(b.createdAt) ?? "";
    return bKey.localeCompare(aKey);
  });

  return rows;
}
