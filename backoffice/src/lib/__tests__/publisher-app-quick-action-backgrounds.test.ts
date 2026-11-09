import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { publisherAppColorsWithCounterpoints, type PublisherAppColorOverride } from "@/lib/publisher-app-config";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreQuickBackgroundPaletteOverridePlan,
  reconcilePublisherAppPaletteContrast,
} from "@/lib/publisher-app-palette-overrides";

const catalog = getPublisherAppColorCatalog();
const optionsByKey = new Map(catalog.options.map(option => [option.key, option]));
const actions = ["friends", "genes", "circles", "search"] as const;
const stops = ["start", "middle", "end", "bezel"] as const;
const modes = ["light", "dark"] as const;
const backgrounds = new Set(actions.flatMap(action => stops.map(stop => `community.quickActions.${action}.${stop}`)));
// The conceptual hue tint is capped at 6°. Allow up to 1° more after encoding
// the perceptual color into the native catalog's 8-bit RGB channels.
const MAX_ENCODED_BRAND_HUE_DRIFT = 7;
type Colors = ReturnType<typeof publisherAppColorsWithCounterpoints>;
type Plan = ReturnType<typeof createPublisherAppPaletteOverridePlan>;

function rgb(value: string) {
  return [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function perceptual(value: string) {
  const [red, green, blue] = rgb(value).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, b),
    hue: ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360,
  };
}

function hueDistance(left: string, right: string) {
  const distance = Math.abs(perceptual(left).hue - perceptual(right).hue) % 360;
  return Math.min(distance, 360 - distance);
}

function whiteContrast(value: string) {
  const [r, g, b] = rgb(value).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

function effective(plan: Plan, key: string, mode: typeof modes[number]) {
  const option = optionsByKey.get(key)!;
  return plan.colorOverrides[key]?.[mode] ?? (mode === "light" ? option.defaultLightColor : option.defaultDarkColor);
}

function planFor(colors: Colors, previous = false) {
  return (previous ? createPublisherAppPreQuickBackgroundPaletteOverridePlan : createPublisherAppPaletteOverridePlan)(
    colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
}

function withoutBackgrounds(overrides: Record<string, PublisherAppColorOverride>) {
  // The later fixed Genes foreground has its own exact other-role regression.
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => !backgrounds.has(key) && key !== "community.genes.primaryActionForeground" && !/^learn\.level\.[^.]+\.(accent|gradientEnd)$/.test(key) && !/^learn\.header\.sheen(Start|End)$/.test(key) && !key.startsWith("community.rareCircles.") && key !== "community.newPost.circleHeaderAccent"));
}

const distinct = publisherAppColorsWithCounterpoints({
  primary: "#6A254E", secondary: "#225A68", tertiary: "#6B6221",
  counterpointClockwise: "#43336C", counterpointAnticlockwise: "#9A4C23",
});
const assignedSeeds = (colors: Colors) => [colors.primary, colors.secondary, colors.tertiary, colors.counterpointClockwise];

it("assigns principal, secondary, tertiary and clockwise to the four tiles in row order", () => {
  const input = structuredClone(distinct);
  const plan = planFor(distinct);
  for (const mode of modes) {
    const middle = actions.map(action => effective(plan, `community.quickActions.${action}.middle`, mode));
    expect(middle[0]).toBe(distinct.primary);
    assignedSeeds(distinct).forEach((seed, index) => {
      expect(hueDistance(middle[index], seed)).toBeLessThan(MAX_ENCODED_BRAND_HUE_DRIFT);
      expect(Math.abs(perceptual(middle[index]).lightness - perceptual(seed).lightness)).toBeLessThan(0.004);
      expect(perceptual(middle[index]).chroma).toBeGreaterThanOrEqual(perceptual(seed).chroma * 0.9 - 0.003);
      expect(perceptual(middle[index]).chroma).toBeLessThanOrEqual(perceptual(seed).chroma + 0.003);
    });
    expect(hueDistance(middle[3], distinct.counterpointAnticlockwise)).toBeGreaterThan(30);
  }
  expect(distinct).toEqual(input);
});

it("adds only a slight principal tint while keeping each secondary color recognizable", () => {
  const plan = planFor(distinct);
  for (const mode of modes) {
    assignedSeeds(distinct).slice(1).forEach((seed, index) => {
      const mixed = effective(plan, `community.quickActions.${actions[index + 1]}.middle`, mode);
      expect(hueDistance(mixed, seed)).toBeGreaterThan(0.1);
      expect(hueDistance(mixed, seed)).toBeLessThan(MAX_ENCODED_BRAND_HUE_DRIFT);
      expect(hueDistance(mixed, distinct.primary)).toBeLessThan(hueDistance(seed, distinct.primary) + 0.5);
    });
  }
});

it("uses the same short, continuous shading profile instead of the old purple/cyan hue swings", () => {
  const plan = planFor(distinct);
  for (const action of actions) for (const mode of modes) {
    const values = stops.map(stop => effective(plan, `community.quickActions.${action}.${stop}`, mode));
    const tones = values.map(perceptual);
    expect(new Set(values).size).toBe(4);
    expect(tones[0].lightness - tones[1].lightness).toBeCloseTo(0.02, 2);
    expect(tones[1].lightness - tones[2].lightness).toBeCloseTo(0.03, 2);
    expect(tones[1].lightness - tones[3].lightness).toBeCloseTo(0.05, 2);
    for (const value of values) expect(hueDistance(value, values[1])).toBeLessThan(2);
  }
});

it.each([
  { primary: "#A08000", secondary: "#9A7B00", tertiary: "#776000", counterpointClockwise: "#4B6F24" },
  { primary: "#172554", secondary: "#173A34", tertiary: "#583249", counterpointClockwise: "#134C63" },
])("does not apply another blanket darkening pass to already ochre or dark selected colors: %j", palette => {
  const colors = publisherAppColorsWithCounterpoints(palette);
  const plan = planFor(colors);
  for (const mode of modes) assignedSeeds(colors).forEach((seed, index) => {
    const middle = effective(plan, `community.quickActions.${actions[index]}.middle`, mode);
    expect(Math.abs(perceptual(middle).lightness - perceptual(seed).lightness)).toBeLessThan(0.004);
  });
});

it.each(["#FFFF00", "#40FF00", "#00FFFF"])("tones genuinely bright %s fills without collapsing their gradients", color => {
  const colors = publisherAppColorsWithCounterpoints({ primary: color, secondary: color, tertiary: color, counterpointClockwise: color });
  const plan = planFor(colors);
  for (const action of actions) for (const mode of modes) {
    const values = stops.map(stop => effective(plan, `community.quickActions.${action}.${stop}`, mode));
    const tones = values.map(perceptual);
    expect(whiteContrast(values[1])).toBeGreaterThanOrEqual(2.985);
    expect(whiteContrast(values[0])).toBeGreaterThanOrEqual(2.485);
    expect(hueDistance(values[1], color)).toBeLessThan(2);
    expect(tones[0].lightness).toBeGreaterThan(tones[1].lightness);
    expect(tones[1].lightness).toBeGreaterThan(tones[2].lightness);
    expect(tones[2].lightness).toBeGreaterThan(tones[3].lightness);
    expect(new Set(values).size).toBe(4);
  }
});

it("does not invent colorful template hues for achromatic selected colors", () => {
  const colors = publisherAppColorsWithCounterpoints({ primary: "#FFFFFF", secondary: "#777777", tertiary: "#000000", counterpointClockwise: "#BBBBBB" });
  const plan = planFor(colors);
  for (const mode of modes) assignedSeeds(colors).forEach((seed, index) => {
    const middle = effective(plan, `community.quickActions.${actions[index]}.middle`, mode);
    if (whiteContrast(seed) < 2.5) expect(whiteContrast(middle)).toBeGreaterThanOrEqual(2.985);
    else expect(middle).toBe(seed);
    for (const stop of stops) {
      const value = effective(plan, `community.quickActions.${actions[index]}.${stop}`, mode);
      const [r, g, b] = rgb(value);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });
});

it("does not desaturate opposed hues into a muddy substitute", () => {
  const colors = publisherAppColorsWithCounterpoints({ primary: "#EC4899", secondary: "#137B53", tertiary: "#2244AA", counterpointClockwise: "#78441B" });
  const plan = planFor(colors);
  for (const mode of modes) assignedSeeds(colors).slice(1).forEach((seed, index) => {
    const middle = effective(plan, `community.quickActions.${actions[index + 1]}.middle`, mode);
    expect(hueDistance(middle, seed)).toBeLessThan(MAX_ENCODED_BRAND_HUE_DRIFT);
    expect(perceptual(middle).chroma).toBeGreaterThanOrEqual(perceptual(seed).chroma * 0.9 - 0.003);
    expect(Math.abs(perceptual(middle).lightness - perceptual(seed).lightness)).toBeLessThan(0.004);
  });
});

it.each([
  distinct,
  publisherAppColorsWithCounterpoints({ primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" }),
  publisherAppColorsWithCounterpoints({ primary: "#A08000", secondary: "#9A7B00", tertiary: "#776000" }),
  publisherAppColorsWithCounterpoints({ primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE" }),
])("changes only the sixteen quick-action background roles for %j", colors => {
  const plan = planFor(colors);
  const previous = planFor(colors, true);
  expect(withoutBackgrounds(plan.colorOverrides)).toEqual(withoutBackgrounds(previous.colorOverrides));
  for (const action of actions) expect(plan.colorOverrides[`community.quickActions.${action}.foreground`]).toEqual({ light: "#FFFFFF", dark: "#FFFFFF" });
});

it("retains manual backgrounds, fixed white text, unrelated illustration colors and Genes overrides", () => {
  const plan = planFor(distinct);
  const current = {
    ...plan.colorOverrides,
    "community.quickActions.friends.middle": { ...plan.colorOverrides["community.quickActions.friends.middle"], light: "#33445580" },
    "community.quickActions.genes.start": { ...plan.colorOverrides["community.quickActions.genes.start"], dark: "#112233" },
    "community.genes.primary": { light: "#007766", dark: "#12887980" },
    "illustration.primaryTone": { light: "#657483", dark: "#44332280" },
  };
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: current, generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: {
      "community.quickActions.friends.middle": { light: true },
      "community.quickActions.genes.start": { dark: true },
      "community.genes.primary": { light: true, dark: true },
      "illustration.primaryTone": { light: true, dark: true },
    },
    options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides).toEqual(current);
  expect(result.generatedColorOverrides).toEqual(plan.colorOverrides);
  const repeated = reconcilePublisherAppPaletteContrast({
    ...result, lockedOverrides: {}, options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(repeated).toEqual(result);
});
