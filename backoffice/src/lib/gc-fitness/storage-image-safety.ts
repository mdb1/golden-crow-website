// storage-image-safety.ts
//
// Shared guards for the Admin-SDK Storage byte proxies / uploads under
// /api/gc-fitness (storage-image, photo-proxy, coach-profile-photo). The Admin
// SDK bypasses storage.rules, so these routes are the only boundary.
//
//  - The proxies stream bytes SAME-ORIGIN with the content type stored in the
//    object's metadata. A stored `image/svg+xml` (or HTML) object would then
//    execute script on the backoffice origin when the URL is opened directly.
//    `safeImageHeaders` serves only raster image types as themselves, forces
//    everything else to `application/octet-stream`, and adds `nosniff` + a
//    sandboxing CSP so the response can never run as a document.
//  - `isAllowedMediaBucket` keeps a caller-supplied `gs://<bucket>/…` from
//    pointing the service account at a bucket outside this project.

/** Raster image types the proxies may serve as themselves. */
const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

/** The media type without parameters, lower-cased (`"Image/PNG; x=1"` → `"image/png"`). */
export function baseMediaType(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Response headers for streaming a Storage object same-origin. */
export function safeImageHeaders(storedContentType: unknown): Record<string, string> {
  const base = typeof storedContentType === "string" ? baseMediaType(storedContentType) : "";
  return {
    "Content-Type": SAFE_IMAGE_TYPES.has(base) ? base : "application/octet-stream",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}

/** Upload types accepted for avatars / reference images (no SVG, no GIF). */
export const UPLOADABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Fallback media bucket used by habits/photo when the env bucket is unset. */
export const DEFAULT_MEDIA_BUCKET = "gcfitness-3476b.firebasestorage.app";

/** The project's own Storage buckets, in lookup order. */
export function projectMediaBuckets(): string[] {
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  return [
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
    projectId ? `${projectId}.appspot.com` : undefined,
  ].filter((value): value is string => Boolean(value));
}

/** True when `bucket` is one of this project's media buckets. */
export function isAllowedMediaBucket(bucket: string): boolean {
  return bucket === DEFAULT_MEDIA_BUCKET || projectMediaBuckets().includes(bucket);
}
