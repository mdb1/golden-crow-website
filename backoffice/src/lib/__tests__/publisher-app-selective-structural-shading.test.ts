import { publisherAppColorsWithCounterpoints, type PublisherAppColorCatalogOption, type PublisherAppColorOverride } from "@/lib/publisher-app-config";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { createPublisherAppPaletteOverridePlan, reconcilePublisherAppPaletteContrast } from "@/lib/publisher-app-palette-overrides";

function option(key: string): PublisherAppColorCatalogOption {
  return {
    key, title: key, usageDescription: key, group: "General interface",
    defaultLightColor: "#F61C72", defaultDarkColor: "#F61C72",
    platforms: ["ios", "android"],
  };
}

function automaticFills(fills: Record<string, PublisherAppColorOverride>) {
  const options = Object.keys(fills).map(option);
  return reconcilePublisherAppPaletteContrast({
    colorOverrides: fills,
    generatedColorOverrides: {},
    lockedOverrides: {},
    options,
  });
}

function whiteContrast(hex: string) {
  const linear = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return 1.05 / (luminance + 0.05);
}

describe("selective structural fill shading", () => {
  it.each(["#B38A00", "#9A7B00", "#776000", "#14532D", "#00656A", "#172554"])(
    "keeps an already ochre or dark automatic fill %s exact in both appearances", color => {
      const fills = { "brand.secondary": { light: color, dark: color } };
      const result = automaticFills(fills);
      expect(result.colorOverrides).toEqual(fills);
      expect(result.generatedColorOverrides).toEqual({});
    },
  );

  it.each(["#FFC3C6", "#F4A7D5", "#C4B5FD", "#777777", "#FFFFFF"])(
    "does not apply the yellow-green-cyan correction to unrelated automatic tone %s", color => {
      const fills = { "brand.accent": { light: color, dark: color } };
      const result = automaticFills(fills);
      expect(result.colorOverrides).toEqual(fills);
      expect(result.generatedColorOverrides).toEqual({});
    },
  );

  it("does not use translucent tab compositing as a reason to darken already ochre tokens", () => {
    const fills = {
      "tabs.learn.start": { light: "#9A7B00", dark: "#9A7B00" },
      "tabs.learn.end": { light: "#665300", dark: "#665300" },
    };
    const result = automaticFills(fills);
    expect(result.colorOverrides).toEqual(fills);
    expect(result.generatedColorOverrides).toEqual({});
  });

  it.each(["#FFFF00", "#40FF00", "#00FFFF"])(
    "still corrects a genuinely luminous automatic fill %s", color => {
      const fills = { "brand.secondary": { light: color, dark: color } };
      const result = automaticFills(fills);
      for (const mode of ["light", "dark"] as const) {
        const corrected = result.colorOverrides["brand.secondary"][mode]!;
        expect(corrected).not.toBe(color);
        expect(whiteContrast(corrected)).toBeGreaterThan(whiteContrast(color));
        expect(whiteContrast(corrected)).toBeGreaterThanOrEqual(2.5);
      }
      expect(fills).toEqual({ "brand.secondary": { light: color, dark: color } });
    },
  );

  it.each(["#8A7000", "#B38A00", "#C29E00"])("corrects a bright tab stop without darkening or crossing its already ochre neighbor %s", ochre => {
    const fills = {
      "tabs.learn.start": { light: "#FFFF00", dark: "#FFFF00" },
      "tabs.learn.end": { light: ochre, dark: ochre },
    };
    const result = automaticFills(fills);
    expect(result.colorOverrides["tabs.learn.end"]).toEqual(fills["tabs.learn.end"]);
    expect(result.generatedColorOverrides["tabs.learn.end"]).toBeUndefined();
    for (const mode of ["light", "dark"] as const) {
      const corrected = result.colorOverrides["tabs.learn.start"][mode]!;
      expect(corrected).not.toBe("#FFFF00");
      expect(whiteContrast(corrected)).toBeLessThan(whiteContrast(ochre));
    }
  });

  it("does not compound the correction when already generated ochre fills are checked again", () => {
    const fills = {
      "brand.secondary": { light: "#9A7B00", dark: "#776000" },
      "tabs.learn.start": { light: "#9A7B00", dark: "#776000" },
      "tabs.learn.end": { light: "#776000", dark: "#665300" },
    };
    const first = automaticFills(fills);
    const second = automaticFills(first.colorOverrides);
    expect(first.colorOverrides).toEqual(fills);
    expect(second.colorOverrides).toEqual(fills);
  });
});

describe("structural correction reconciliation", () => {
  const catalog = getPublisherAppColorCatalog();
  const colors = publisherAppColorsWithCounterpoints({ primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" });
  const plan = createPublisherAppPaletteOverridePlan(
    colors, catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );

  it("keeps the complete freshly generated composition exact through reconciliation", () => {
    const result = reconcilePublisherAppPaletteContrast({
      colorOverrides: plan.colorOverrides,
      generatedColorOverrides: plan.colorOverrides,
      lockedOverrides: {}, options: catalog.options,
      contrastPairs: catalog.contrastPairs,
    });
    expect(result.colorOverrides).toEqual(plan.colorOverrides);
    expect(result.generatedColorOverrides).toEqual(plan.colorOverrides);
  });

  it("does not recalculate structural backgrounds after an unrelated manual glow edit", () => {
    const current = {
      ...plan.colorOverrides,
      "learn.background.leadingGlow": { ...plan.colorOverrides["learn.background.leadingGlow"], light: "#11223380" },
    };
    const result = reconcilePublisherAppPaletteContrast({
      colorOverrides: current,
      generatedColorOverrides: plan.colorOverrides,
      lockedOverrides: { "learn.background.leadingGlow": { light: true } },
      options: catalog.options, contrastPairs: catalog.contrastPairs,
    });
    expect(result.colorOverrides).toEqual(current);
    expect(result.generatedColorOverrides).toEqual(plan.colorOverrides);
  });
});
