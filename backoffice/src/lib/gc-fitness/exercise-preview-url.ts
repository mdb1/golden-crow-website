export function resolveExercisePreviewUrl(value?: string | null): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  if (value.startsWith("https://")) return value;
  if (value.startsWith("gs://")) {
    return `/api/gc-fitness/storage-image?path=${encodeURIComponent(value)}`;
  }
  return null;
}
