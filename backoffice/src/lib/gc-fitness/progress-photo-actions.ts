"use server";

import { gcFitnessFirestore, gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

export interface ProgressPhotoRow {
  id: string;
  caption: string | null;
  storagePath: string;
  url: string | null;
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
  try {
    const [url] = await gcFitnessStorage()
      .bucket()
      .file(storagePath)
      .getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000,
      });
    return url;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[gc-fitness/progress-photos] signed URL failed:", err);
    return null;
  }
}

export async function listProgressPhotosForClient(
  clientId: string,
): Promise<ProgressPhotoRow[]> {
  const trainer = await getCurrentTrainer();
  await assertOwnsClient(trainer.uid, clientId);

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.progressPhotos)
    .where("clientId", "==", clientId)
    .orderBy("createdAt", "desc")
    .limit(24)
    .get();

  return Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      const storagePath =
        typeof data.storagePath === "string" ? data.storagePath : "";
      return {
        id: doc.id,
        caption: typeof data.caption === "string" ? data.caption : null,
        storagePath,
        url: storagePath ? await signedUrlForPath(storagePath) : null,
        createdAt: timestampToIso(data.createdAt),
        takenAt: timestampToIso(data.takenAt),
      };
    }),
  );
}
