import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  normalizePublisherAppColor,
  publisherAppColorsWithCounterpoints,
  publisherAppPreviousCounterpointColors,
  publisherAppSupersededCounterpointColors,
  type PublisherAppColors,
  type PublisherAppColorOverride,
} from "@/lib/publisher-app-config";
import {
  getLegacyPublisherAppColorCatalog,
  getPublisherAppColorCatalog,
} from "@/lib/publisher-app-customization-catalog-server";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreviousPaletteOverridePlan,
  createPublisherAppOverdarkenedPaletteOverridePlan,
  createPublisherAppPreGenesRestorePaletteOverridePlan,
  createPublisherAppPreQuickBackgroundPaletteOverridePlan,
  createPublisherAppPreLearnHeaderPaletteOverridePlan,
  createPublisherAppPreFixedCirclesPaletteOverridePlan,
  reconcilePublisherAppPaletteContrast,
} from "@/lib/publisher-app-palette-overrides";
import {
  createLegacyPublisherAppPaletteOverridePlan,
  legacyPublisherAppCounterpointColors,
} from "@/lib/publisher-app-legacy-palette-overrides";
import { getManualPublisherAppPaletteOverrideLocks, mergePublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-override-merge";

export const dynamic = "force-dynamic";

function paletteColors(value: unknown): PublisherAppColors | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const seeds = ["primary", "secondary", "tertiary"] as const;
  const normalized = seeds.map((key) => typeof input[key] === "string"
    ? normalizePublisherAppColor(input[key] as string) : undefined);
  if (normalized.some((color) => !color)) return null;
  const colors = publisherAppColorsWithCounterpoints({
    primary: normalized[0]!, secondary: normalized[1]!, tertiary: normalized[2]!,
  });
  for (const key of ["counterpointClockwise", "counterpointAnticlockwise", "counterpointFarClockwise", "counterpointFarAnticlockwise"] as const) {
    if (input[key] === undefined) continue;
    const color = typeof input[key] === "string" ? normalizePublisherAppColor(input[key] as string) : undefined;
    if (!color) return null;
    colors[key] = color;
  }
  return colors;
}

function overrideMap(value: unknown, validKeys: Set<string>): Record<string, PublisherAppColorOverride> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, PublisherAppColorOverride> = {};
  for (const [key, modes] of Object.entries(value)) {
    if (!validKeys.has(key) || !modes || typeof modes !== "object" || Array.isArray(modes)) return null;
    const entries = Object.entries(modes);
    if (!entries.length) return null;
    const normalized: PublisherAppColorOverride = {};
    for (const [mode, color] of entries) {
      if ((mode !== "light" && mode !== "dark") || typeof color !== "string" || !/^#[\dA-F]{6}([\dA-F]{2})?$/i.test(color)) return null;
      normalized[mode] = color.toUpperCase();
    }
    result[key] = normalized;
  }
  return result;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as {
    colors?: unknown;
    previousColors?: unknown;
    colorOverrides?: unknown;
    generatedColorOverrides?: unknown;
  } | null;
  const colors = paletteColors(body?.colors);
  if (!colors) {
    return Response.json({ error: "Invalid palette colors or counterpoint colors." }, { status: 400 });
  }
  const catalog = getPublisherAppColorCatalog();
  const plan = createPublisherAppPaletteOverridePlan(
    colors, catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
  if (body?.colorOverrides === undefined) {
    return Response.json({ ...plan, generatedColorOverrides: plan.colorOverrides }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const validKeys = new Set(catalog.options.map((option) => option.key));
  const current = overrideMap(body.colorOverrides, validKeys);
  const baseline = body.generatedColorOverrides === undefined
    ? undefined : overrideMap(body.generatedColorOverrides, validKeys);
  const previous = paletteColors(body.previousColors);
  if (!current || baseline === null || !previous) {
    return Response.json({ error: "Invalid previous palette or color overrides." }, { status: 400 });
  }
  const inferredBaselines: Array<Record<string, PublisherAppColorOverride>> = [];
  if (baseline === undefined && Object.keys(current).length) {
    const legacyCatalog = getLegacyPublisherAppColorCatalog();
    const infer = (generate: () => typeof plan) => {
      try {
        inferredBaselines.push(generate().colorOverrides);
      } catch (error) {
        // Older automatic generation rejected achromatic palettes. Such an app
        // may still have been configured through the SDK; keep unknown values.
        if (!(error instanceof Error) || !error.message.includes("needs at least one chromatic color")) throw error;
      }
    };
    infer(() => createLegacyPublisherAppPaletteOverridePlan(
      previous, legacyCatalog.options, legacyCatalog.catalogVersion,
      legacyCatalog.alternativeTonalFlows,
    ));
    // Older stored configs may omit all four accessory seeds. The UI expands
    // those using today's defaults, so also recognize the exact original ones.
    infer(() => createLegacyPublisherAppPaletteOverridePlan(
      { ...previous, ...legacyPublisherAppCounterpointColors(previous.primary) },
      legacyCatalog.options, legacyCatalog.catalogVersion,
      legacyCatalog.alternativeTonalFlows,
    ));
    const previousPalettes = [
      previous,
      { ...previous, ...publisherAppPreviousCounterpointColors(previous.primary) },
      ...publisherAppSupersededCounterpointColors(previous.primary).map(counterpoints => ({ ...previous, ...counterpoints })),
    ];
    for (const palette of previousPalettes) {
      for (const generate of [createPublisherAppPaletteOverridePlan, createPublisherAppPreviousPaletteOverridePlan, createPublisherAppOverdarkenedPaletteOverridePlan, createPublisherAppPreGenesRestorePaletteOverridePlan, createPublisherAppPreQuickBackgroundPaletteOverridePlan, createPublisherAppPreLearnHeaderPaletteOverridePlan, createPublisherAppPreFixedCirclesPaletteOverridePlan]) {
        infer(() => generate(
          palette, catalog.options, catalog.catalogVersion,
          catalog.alternativeTonalFlows, catalog.contrastPairs,
        ));
      }
    }
  }
  const colorOverrides = mergePublisherAppPaletteOverrides({
    generated: plan.colorOverrides,
    current,
    savedBaseline: baseline,
    inferredBaselines,
  });
  try {
    const reconciled = reconcilePublisherAppPaletteContrast({
      colorOverrides,
      generatedColorOverrides: plan.colorOverrides,
      lockedOverrides: getManualPublisherAppPaletteOverrideLocks({ current, savedBaseline: baseline, inferredBaselines }),
      options: catalog.options,
      contrastPairs: catalog.contrastPairs,
    });
    return Response.json({
      ...plan,
      selectedCount: Object.keys(reconciled.generatedColorOverrides).length,
      ...reconciled,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos conservar el contraste con los colores personalizados." }, { status: 400 });
  }
}
