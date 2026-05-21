"use server";

import { gcFitnessFirestore, gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
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
