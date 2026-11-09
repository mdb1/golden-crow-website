import { publisherAppColorsWithCounterpoints, type PublisherAppColorOverride } from "@/lib/publisher-app-config";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { getManualPublisherAppPaletteOverrideLocks, mergePublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-override-merge";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreLearnHeaderPaletteOverridePlan,
  reconcilePublisherAppPaletteContrast,
} from "@/lib/publisher-app-palette-overrides";

const catalog = getPublisherAppColorCatalog();
const byKey = new Map(catalog.options.map(option => [option.key, option]));
const modes = ["light", "dark"] as const;
const palettes = [
  { primary: "#FF5500", secondary: "#F78D15", tertiary: "#EFBA2A" },
  { primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" },
  { primary: "#1D4ED8", secondary: "#EC4899", tertiary: "#14B8A6" },
  { primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE" },
  { primary: "#000000", secondary: "#000000", tertiary: "#000000" },
  { primary: "#FFFFFF", secondary: "#FFFFFF", tertiary: "#FFFFFF" },
];
const changedRole = (key: string) => /^learn\.level\.[^.]+\.(accent|gradientEnd)$/.test(key) || /^learn\.header\.sheen(Start|End)$/.test(key);
const withoutHeader = (overrides: Record<string, PublisherAppColorOverride>) => Object.fromEntries(Object.entries(overrides).filter(([key]) => !changedRole(key)));
function planFor(palette = palettes[0], previous = false, unshaded = false) {
  return (previous ? createPublisherAppPreLearnHeaderPaletteOverridePlan : createPublisherAppPaletteOverridePlan)(
    publisherAppColorsWithCounterpoints(palette),
    unshaded ? catalog.options.filter(option => option.key !== "learn.header.foreground") : catalog.options,
    catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
}
function color(plan: ReturnType<typeof planFor>, key: string, mode: typeof modes[number]) {
  return plan.colorOverrides[key]?.[mode] ?? byKey.get(key)![mode === "light" ? "defaultLightColor" : "defaultDarkColor"];
}
function rgb(value: string) { return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255); }
function luminance(channels: number[]) {
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function whiteContrast(channels: number[]) { return 1.05 / (luminance(channels) + 0.05); }
function saturation(value: string) {
  const channels = rgb(value), maximum = Math.max(...channels), minimum = Math.min(...channels);
  return maximum === 0 ? 0 : (maximum - minimum) / maximum;
}

it("preserves the readable saturated orange instead of darkening it because of another level", () => {
  const plan = planFor();
  const previous = planFor(palettes[0], true);
  for (const mode of modes) {
    expect(color(previous, "learn.level.bacteria.accent", mode)).toBe("#C94100");
    expect(color(plan, "learn.level.bacteria.accent", mode)).toBe("#FF5500");
    expect(color(plan, "learn.level.bacteria.gradientEnd", mode)).toBe("#B43B00");
    expect(color(plan, "learn.header.foreground", mode)).toBe("#FFFFFF");
  }
});

it("gives formerly brown and gray levels vivid brand-family anchors", () => {
  const plan = planFor();
  for (const mode of modes) {
    for (const level of ["tree", "spider", "elephant"]) {
      const accent = color(plan, `learn.level.${level}.accent`, mode);
      expect(saturation(accent)).toBeGreaterThan(0.9);
      expect(luminance(rgb(accent))).toBeGreaterThan(0.2);
      expect(luminance(rgb(accent))).toBeLessThan(0.37);
    }
    expect(color(plan, "learn.level.elephant.accent", mode)).toBe("#FF5500");
  }
});

it.each(palettes)("corrects only the affected header roles for %j, leaving every other automatic color exact", palette => {
  const plan = planFor(palette);
  expect(withoutHeader(plan.colorOverrides)).toEqual(withoutHeader(planFor(palette, true).colorOverrides));
  expect(plan.colorOverrides["learn.header.sheenStart"]).toEqual({ light: "#FFFFFF1A", dark: "#FFFFFF1A" });
  expect(plan.colorOverrides["learn.header.sheenEnd"]).toEqual({ light: "#FFFFFF08", dark: "#FFFFFF08" });
  expect(plan.selectedCount).toBe(Object.keys(plan.colorOverrides).length);
});

it.each(palettes)("keeps white ink readable over each independent level gradient for %j", palette => {
  const plan = planFor(palette);
  const raw = planFor(palette, false, true);
  for (const mode of modes) for (const option of catalog.options.filter(option => /^learn\.level\.[^.]+\.accent$/.test(option.key))) {
    const endKey = option.key.replace(/\.accent$/, ".gradientEnd");
    const [start, end] = [option.key, endKey].map(key => rgb(color(plan, key, mode)));
    for (let step = 0; step <= 16; step++) {
      const sample = start.map((channel, index) => channel + (end[index] - channel) * step / 16);
      expect(whiteContrast(sample)).toBeGreaterThanOrEqual(2.5);
    }
    const rawColors = [option.key, endKey].map(key => color(raw, key, mode));
    if (rawColors.every(value => whiteContrast(rgb(value)) >= 2.5)) {
      for (const key of [option.key, endKey]) expect(color(plan, key, mode)).toBe(color(raw, key, mode));
    }
    for (const key of [option.key, endKey]) {
      expect(Math.abs(saturation(color(plan, key, mode)) - saturation(color(raw, key, mode)))).toBeLessThan(0.025);
    }
    expect(luminance(start)).toBeGreaterThanOrEqual(luminance(end));
  }
});

it("keeps manually chosen header colors and translucent lighting in both modes through merge and reconciliation", () => {
  const plan = planFor();
  const baseline = planFor(palettes[0], true).colorOverrides;
  const current: Record<string, PublisherAppColorOverride> = {
    ...baseline,
    "learn.level.bacteria.accent": { light: "#E95F00", dark: "#EA6200" },
    "learn.level.bacteria.gradientEnd": { light: "#A24300", dark: "#A54400" },
    "learn.header.sheenStart": { light: "#FFFFFF66", dark: "#CCAAFF44" },
    "learn.header.sheenEnd": { light: "#FFFFFF22", dark: "#FFFFFF11" },
  };
  const manual = getManualPublisherAppPaletteOverrideLocks({ current, savedBaseline: baseline });
  const merged = mergePublisherAppPaletteOverrides({ generated: plan.colorOverrides, current, savedBaseline: baseline });
  const reconciled = reconcilePublisherAppPaletteContrast({
    colorOverrides: merged, generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: manual, options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  for (const key of ["learn.level.bacteria.accent", "learn.level.bacteria.gradientEnd", "learn.header.sheenStart", "learn.header.sheenEnd"]) {
    expect(reconciled.colorOverrides[key]).toEqual(current[key]);
  }
  expect(reconciled.generatedColorOverrides["learn.header.sheenStart"]).toEqual(plan.colorOverrides["learn.header.sheenStart"]);
});
