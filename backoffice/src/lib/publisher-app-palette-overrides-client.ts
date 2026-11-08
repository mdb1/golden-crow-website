import type {
  PublisherAppColors,
  PublisherAppAdvancedConfiguration,
  PublisherAppPaletteOverridePlan,
} from "@/lib/publisher-app-config";

export async function fetchPublisherAppPaletteOverrides(
  colors: PublisherAppColors,
  signal?: AbortSignal,
  previous?: Pick<PublisherAppAdvancedConfiguration, "colorOverrides" | "generatedColorOverrides"> & {
    previousColors: PublisherAppColors;
  },
) {
  const response = await fetch("/api/publisher-app/palette-overrides", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colors, ...previous }),
    signal,
  });

  const body = (await response.json().catch(() => null)) as
    | (PublisherAppPaletteOverridePlan & { error?: string })
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body?.error || "No se pudieron coordinar los colores de la app.",
    );
  }
  if (
    !body ||
    typeof (body as PublisherAppPaletteOverridePlan).sourceCount !== "number" ||
    typeof (body as PublisherAppPaletteOverridePlan).selectedCount !==
      "number" ||
    typeof (body as PublisherAppPaletteOverridePlan).colorOverrides !==
      "object"
  ) {
    throw new Error(
      "La coordinación de colores recibió una respuesta inválida. Intentá nuevamente.",
    );
  }
  return body as PublisherAppPaletteOverridePlan;
}
