import { NextResponse } from "next/server";

import { gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import {
  isAllowedMediaBucket,
  projectMediaBuckets,
  safeImageHeaders,
} from "@/lib/gc-fitness/storage-image-safety";

export const runtime = "nodejs";

// GET /api/gc-fitness/storage-image?path=<gs://bucket/object | object/path>
//
// Streams a reference image (habit photo / exercise thumbnail / client profile photo)
// same-origin via
// the Admin SDK. Needed because trainers authenticate with next-firebase-auth-edge
// COOKIES, not the Firebase JS client SDK — so a browser-side `getDownloadURL`
// on a protected Storage object fails and the dropzone could only show the raw
// `gs://…` path. Routing the bytes through this trainer-authenticated endpoint
// resolves the preview without depending on client Storage auth or bucket CORS.
// Mirrors the `photo-proxy` route used for progress photos.
//
// Authz: requires a valid trainer cookie, and the object path is restricted to
// the trainer-content namespaces (`habits/` and `exercises/`) so the endpoint
// can't be used to read arbitrary bucket objects. The exercise library is
// already shared across trainers, so a per-doc ownership check is not required
// here (consistent with the existing read model).
//
// A `gs://<bucket>/…` path must name one of this project's own media buckets
// — otherwise the Admin service account would read the same prefixes from ANY
// bucket it can reach. Bytes are served with `safeImageHeaders` so a stored
// SVG/HTML object can never execute same-origin.

const ALLOWED_PREFIXES = ["habits/", "exercises/", "profile_photos/"];

function parseStoragePath(raw: string): { bucket: string | null; object: string } | null {
  if (raw.startsWith("gs://")) {
    const rest = raw.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return { bucket: rest.slice(0, slash), object: rest.slice(slash + 1) };
  }
  // Bare object path — use the default bucket.
  return { bucket: null, object: raw.replace(/^\/+/, "") };
}

export async function GET(request: Request) {
  try {
    await getCurrentTrainer();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const parsed = parseStoragePath(rawPath);
  if (!parsed || !parsed.object) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  // Guard against traversal + restrict to reference-image namespaces.
  if (parsed.object.includes("..") || !ALLOWED_PREFIXES.some((p) => parsed.object.startsWith(p))) {
    return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
  }
  if (parsed.bucket !== null && !isAllowedMediaBucket(parsed.bucket)) {
    return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
  }

  const candidates = [
    ...(parsed.bucket !== null ? [parsed.bucket] : []),
    ...projectMediaBuckets(),
  ];

  for (const bucketName of candidates) {
    try {
      const file = gcFitnessStorage().bucket(bucketName).file(parsed.object);
      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: safeImageHeaders(metadata.contentType),
      });
    } catch {
      // Try the next bucket candidate.
    }
  }

  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
