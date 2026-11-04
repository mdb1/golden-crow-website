import type {
  PublisherAppColors,
  PublisherAppPaletteOverridePlan,
} from "@/lib/publisher-app-config";

export async function fetchPublisherAppPaletteOverrides(
  colors: PublisherAppColors,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/publisher-app/palette-overrides", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colors }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || "No se pudieron coordinar los colores de la app.",
    );
  }
  return (await response.json()) as PublisherAppPaletteOverridePlan;
}
