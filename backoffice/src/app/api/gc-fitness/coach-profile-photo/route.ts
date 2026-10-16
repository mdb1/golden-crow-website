import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import {
  baseMediaType,
  projectMediaBuckets,
  UPLOADABLE_IMAGE_TYPES,
} from "@/lib/gc-fitness/storage-image-safety";

export const runtime = "nodejs";

// POST /api/gc-fitness/coach-profile-photo — body: image bytes (JPEG).
//
// Issue #166 (round 2). The coach-profile form used the Firebase JS client
// SDK (`uploadBytes`) to write `profile_photos/{uid}/avatar.jpg`, but the
// backoffice authenticates with next-firebase-auth-edge COOKIES — the
// browser-side Firebase Auth session is a separate, unreliable context (it
// can be absent or signed into a different Google account than the cookie),
// and when it doesn't match, Storage rules correctly reject the write with
// `storage/unauthorized`. That's exactly why `storage-image/route.ts` exists
// for READS; this route is its WRITE twin: the trainer cookie is the
// authorization boundary and the Admin SDK performs the upload.
//
// The path is fixed to the caller's own uid — a trainer can only ever write
// their own avatar, mirroring the Storage rule (`request.auth.uid == userId`)
// this replaces.
//
// Returns `{ photoURL }` as a tokened https download URL (the same shape the
// old client-side `getDownloadURL` produced), so every existing consumer of
// the denormalized `coachPhotoURL` — iOS, Android (including builds that
// predate the bare-path resolver), backoffice — keeps working unchanged.

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  let trainerUid: string;
  try {
    trainerUid = (await getCurrentTrainer()).uid;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Raster types only: an `image/svg+xml` avatar would be served back
  // same-origin by storage-image (profile_photos/ is a readable prefix) and
  // from the public tokened URL — stored XSS. The form always sends JPEG.
  const contentType = baseMediaType(request.headers.get("content-type"));
  if (!UPLOADABLE_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Expected an image body" }, { status: 415 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const objectPath = `profile_photos/${trainerUid}/avatar.jpg`;
  const downloadToken = randomUUID();

  for (const bucketName of projectMediaBuckets()) {
    try {
      const file = gcFitnessStorage().bucket(bucketName).file(objectPath);
      await file.save(bytes, {
        contentType,
        metadata: {
          cacheControl: "public, max-age=300",
          // Standard Firebase download-token convention — makes the returned
          // URL identical in shape to a client-side getDownloadURL() result.
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });
      const photoURL =
        `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
        `${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
      return NextResponse.json({ photoURL });
    } catch {
      // Try the next bucket candidate (same fallback chain as storage-image).
    }
  }

  return NextResponse.json({ error: "Upload failed" }, { status: 502 });
}
