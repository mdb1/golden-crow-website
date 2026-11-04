import type { PublisherAppCustomizationCatalogPage } from "@/lib/publisher-app-config";

export async function fetchPublisherAppCustomizationCatalog<T>(
  kind: "colors" | "texts",
  params: URLSearchParams,
) {
  const response = await fetch(
    `/api/publisher-app/customization-catalog/${kind}?${params.toString()}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "No se pudo cargar el catálogo.");
  }
  return (await response.json()) as PublisherAppCustomizationCatalogPage<T>;
}
