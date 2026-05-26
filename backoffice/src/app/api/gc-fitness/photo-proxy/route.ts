import { NextResponse } from "next/server";

import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

// GET /api/gc-fitness/photo-proxy?photoId=<id>
//
// Streams a progress-photo binary same-origin so the side-by-side JPG
// exporter in photo-compare-editor.tsx can draw it onto a canvas without
// running into CORS / canvas-tainting. GCS signed URLs don't return
// Access-Control-Allow-Origin headers, which makes the browser-side
// `crossOrigin = "anonymous"` Image load fail silently. Routing the bytes
// through this same-origin endpoint sidesteps that entirely.
//
// Auth: trainer cookie + per-client ownership check via the `clientId`
// stored on the photo doc. Mirrors `assertOwnsClient` in
// `progress-photo-actions.ts`.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const photoId = url.searchParams.get("photoId");
  if (!photoId) {
    return NextResponse.json({ error: "Missing photoId" }, { status: 400 });
  }

  let trainerUid: string;
  try {
    const trainer = await getCurrentTrainer();
    trainerUid = trainer.uid;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = gcFitnessFirestore();
  const photoSnap = await db
    .collection(FirestoreCollections.progressPhotos)
    .doc(photoId)
    .get();
  if (!photoSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clientId = photoSnap.get("clientId");
  const storagePath = photoSnap.get("storagePath");
  if (typeof clientId !== "string" || typeof storagePath !== "string" || !storagePath) {
    return NextResponse.json({ error: "Photo malformed" }, { status: 422 });
  }

  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!clientSnap.exists || clientSnap.get("coachId") !== trainerUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const candidates = [
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
    projectId ? `${projectId}.appspot.com` : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const bucketName of candidates) {
    try {
      const file = gcFitnessStorage().bucket(bucketName).file(storagePath);
      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();
      const contentType =
        typeof metadata.contentType === "string" && metadata.contentType
          ? metadata.contentType
          : "application/octet-stream";
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch {
      // Try next bucket candidate.
    }
  }

  return NextResponse.json({ error: "Storage download failed" }, { status: 502 });
}
