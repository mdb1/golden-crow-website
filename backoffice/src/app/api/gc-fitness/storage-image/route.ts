import { NextResponse } from "next/server";

import { gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";

export const runtime = "nodejs";

// GET /api/gc-fitness/storage-image?path=<gs://bucket/object | object/path>
//
// Streams a reference image (habit photo / exercise thumbnail) same-origin via
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

const ALLOWED_PREFIXES = ["habits/", "exercises/"];

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

  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const candidates = [
    parsed.bucket,
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
    projectId ? `${projectId}.appspot.com` : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const bucketName of candidates) {
    try {
      const file = gcFitnessStorage().bucket(bucketName).file(parsed.object);
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
      // Try the next bucket candidate.
    }
  }

  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
