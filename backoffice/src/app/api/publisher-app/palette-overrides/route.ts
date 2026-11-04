import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  normalizePublisherAppColor,
  publisherAppColorsWithCounterpoints,
} from "@/lib/publisher-app-config";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { createPublisherAppPaletteOverridePlan } from "@/lib/publisher-app-palette-overrides";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    colors?: { primary?: unknown; secondary?: unknown; tertiary?: unknown };
  } | null;
  const primary =
    typeof body?.colors?.primary === "string"
      ? normalizePublisherAppColor(body.colors.primary)
      : undefined;
  const secondary =
    typeof body?.colors?.secondary === "string"
      ? normalizePublisherAppColor(body.colors.secondary)
      : undefined;
  const tertiary =
    typeof body?.colors?.tertiary === "string"
      ? normalizePublisherAppColor(body.colors.tertiary)
      : undefined;
  if (!primary || !secondary || !tertiary) {
    return Response.json({ error: "Invalid palette colors." }, { status: 400 });
  }

  const catalog = getPublisherAppColorCatalog();
  const plan = createPublisherAppPaletteOverridePlan(
    publisherAppColorsWithCounterpoints({ primary, secondary, tertiary }),
    catalog.options,
    catalog.catalogVersion,
  );
  return Response.json(plan, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
