import { publisherAppColorsWithCounterpoints, type PublisherAppColorOverride } from "@/lib/publisher-app-config";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreGenesForegroundPaletteOverridePlan,
  reconcilePublisherAppPaletteContrast,
} from "@/lib/publisher-app-palette-overrides";

const catalog = getPublisherAppColorCatalog();
const foregroundKey = "community.genes.primaryActionForeground";
const white = { light: "#FFFFFF", dark: "#FFFFFF" };
const palettes = [
  { primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" },
  { primary: "#FFFF00", secondary: "#FFFF00", tertiary: "#FFFF00" },
  { primary: "#A08000", secondary: "#9A7B00", tertiary: "#776000" },
  { primary: "#1D4ED8", secondary: "#EC4899", tertiary: "#14B8A6" },
  { primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE" },
  { primary: "#000000", secondary: "#000000", tertiary: "#000000" },
];

function planFor(palette = palettes[0], previous = false) {
  const generate = previous ? createPublisherAppPreGenesForegroundPaletteOverridePlan : createPublisherAppPaletteOverridePlan;
  return generate(
    publisherAppColorsWithCounterpoints(palette), catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
}

function withoutForeground(overrides: Record<string, PublisherAppColorOverride>) {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== foregroundKey && !/^learn\.level\.[^.]+\.(accent|gradientEnd)$/.test(key) && !/^learn\.header\.sheen(Start|End)$/.test(key)));
}

it.each(palettes)("emits an explicit white Genes action foreground in both modes without changing other automatic overrides: %j", palette => {
  const before = structuredClone(palette);
  const plan = planFor(palette);
  const previous = planFor(palette, true);
  expect(plan.colorOverrides[foregroundKey]).toEqual(white);
  expect(plan.selectedCount).toBe(Object.keys(plan.colorOverrides).length);
  expect(withoutForeground(plan.colorOverrides)).toEqual(withoutForeground(previous.colorOverrides));
  expect(palette).toEqual(before);
});

it.each([
  undefined,
  { light: "#000000" },
  { dark: "#042F2E" },
  { light: "#223344", dark: "#556677" },
  { light: "#FFFFFF80", dark: "#00000000" },
])("replaces missing, stale or manual Genes foreground %j while preserving manual fills and unrelated colors", stored => {
  const plan = planFor();
  const current: Record<string, PublisherAppColorOverride> = {
    ...plan.colorOverrides,
    "community.genes.primaryActionFill": { light: "#00A88A", dark: "#22887780" },
    "community.genes.primary": { light: "#005244", dark: "#00524480" },
    "illustration.primaryTone": { light: "#123456", dark: "#65432180" },
  };
  if (stored) current[foregroundKey] = stored;
  else delete current[foregroundKey];
  const before = structuredClone(current);
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: current,
    generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: Object.fromEntries(
      [foregroundKey, "community.genes.primaryActionFill", "community.genes.primary", "illustration.primaryTone"]
        .map(key => [key, { light: true as const, dark: true as const }]),
    ),
    options: catalog.options,
    contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides[foregroundKey]).toEqual(white);
  expect(result.generatedColorOverrides[foregroundKey]).toEqual(white);
  expect(withoutForeground(result.colorOverrides)).toEqual(withoutForeground(current));
  expect(withoutForeground(result.generatedColorOverrides)).toEqual(withoutForeground(plan.colorOverrides));
  expect(current).toEqual(before);
  expect(reconcilePublisherAppPaletteContrast({
    ...result, lockedOverrides: {}, options: catalog.options, contrastPairs: catalog.contrastPairs,
  })).toEqual(result);
});
