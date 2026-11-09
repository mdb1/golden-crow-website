import { PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS, publisherAppColorsWithCounterpoints, type PublisherAppColorOverride } from "@/lib/publisher-app-config";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { getManualPublisherAppPaletteOverrideLocks, mergePublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-override-merge";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreFixedCirclesPaletteOverridePlan,
  reconcilePublisherAppPaletteContrast,
} from "@/lib/publisher-app-palette-overrides";

const catalog = getPublisherAppColorCatalog();
const flow = catalog.alternativeTonalFlows.find(item => item.id === "rareCircles")!;
const roles = new Set(flow.roleKeys);
const byKey = new Map(catalog.options.map(option => [option.key, option]));
const palettes = [
  { primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" },
  { primary: "#FF5500", secondary: "#F78D15", tertiary: "#EFBA2A" },
  { primary: "#1D4ED8", secondary: "#EC4899", tertiary: "#14B8A6" },
  { primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE" },
  { primary: "#000000", secondary: "#000000", tertiary: "#000000" },
  { primary: "#FFFFFF", secondary: "#FFFFFF", tertiary: "#FFFFFF" },
];
function planFor(palette = palettes[0], previous = false, customCounterpoints = false) {
  const colors = {
    ...publisherAppColorsWithCounterpoints(palette),
    ...(customCounterpoints ? {
      counterpointClockwise: "#123456", counterpointAnticlockwise: "#00EE77",
      counterpointFarClockwise: "#9933EE", counterpointFarAnticlockwise: "#22CCFF",
    } : {}),
  };
  return (previous ? createPublisherAppPreFixedCirclesPaletteOverridePlan : createPublisherAppPaletteOverridePlan)(
    colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
}
const withoutCircles = (overrides: Record<string, PublisherAppColorOverride>) =>
  Object.fromEntries(Object.entries(overrides).filter(([key]) => !roles.has(key)));

it("declares Rare Circles as a fixed original identity", () => {
  expect(PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS.rareCircles).toEqual({ kind: "fixed", color: "#DB2777" });
  expect(flow.roleKeys).toHaveLength(27);
  expect(roles.has("community.newPost.circleHeaderAccent")).toBe(true);
  expect(roles.has("community.quickActions.circles.middle")).toBe(false);
});

it.each(palettes)("publishes every original light/dark Circles color independently of palette or counterpoints: %j", palette => {
  const plan = planFor(palette);
  const custom = planFor(palette, false, true);
  for (const key of flow.roleKeys) {
    const original = byKey.get(key)!;
    const expected = { light: original.defaultLightColor, dark: original.defaultDarkColor };
    expect(plan.colorOverrides[key]).toEqual(expected);
    expect(custom.colorOverrides[key]).toEqual(expected);
  }
  expect(plan.selectedCount).toBe(Object.keys(plan.colorOverrides).length);
  expect(withoutCircles(plan.colorOverrides)).toEqual(withoutCircles(planFor(palette, true).colorOverrides));
  expect(withoutCircles(custom.colorOverrides)).toEqual(withoutCircles(planFor(palette, true, true).colorOverrides));
});

it("keeps the fixed original flow unchanged through final reconciliation", () => {
  const plan = planFor();
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: plan.colorOverrides, generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: {}, options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides).toEqual(plan.colorOverrides);
  expect(result.generatedColorOverrides).toEqual(plan.colorOverrides);
});

it.each([false, true])("replaces old automatic contrapoints while preserving manual light/dark colors and native fallbacks (saved baseline: %s)", savedBaseline => {
  const previous = planFor(palettes[0], true).colorOverrides;
  const plan = planFor();
  const current: Record<string, PublisherAppColorOverride> = {
    ...previous,
    "community.rareCircles.accent": { ...previous["community.rareCircles.accent"], light: "#AF1234" },
    "community.rareCircles.headerGlow": { light: "#CC336644", dark: "#DD447755" },
    "learn.background.leadingGlow": { light: "#11223380" },
  };
  const fallbackKey = "community.rareCircles.secondaryActionBorder";
  if (savedBaseline) delete current[fallbackKey];
  const options = { current, ...(savedBaseline ? { savedBaseline: previous } : { inferredBaselines: [previous] }) };
  const merged = mergePublisherAppPaletteOverrides({ generated: plan.colorOverrides, ...options });
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: merged, generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: getManualPublisherAppPaletteOverrideLocks(options), options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides["community.rareCircles.accent"]).toEqual({ light: "#AF1234", dark: byKey.get("community.rareCircles.accent")!.defaultDarkColor });
  expect(result.colorOverrides["community.rareCircles.headerGlow"]).toEqual(current["community.rareCircles.headerGlow"]);
  expect(result.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
  for (const key of flow.roleKeys.filter(key => !["community.rareCircles.accent", "community.rareCircles.headerGlow", fallbackKey].includes(key))) {
    expect(result.colorOverrides[key]).toEqual(plan.colorOverrides[key]);
  }
  if (savedBaseline) expect(result.colorOverrides[fallbackKey]).toBeUndefined();
  expect(result.generatedColorOverrides).toEqual(plan.colorOverrides);
});
