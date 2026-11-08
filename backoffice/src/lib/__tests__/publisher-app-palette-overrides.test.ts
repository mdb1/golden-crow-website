import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import {
  publisherAppColorsWithCounterpoints,
  type PublisherAppColorCatalogOption,
} from "@/lib/publisher-app-config";
import { createPublisherAppPaletteOverridePlan, reconcilePublisherAppPaletteContrast } from "@/lib/publisher-app-palette-overrides";

function channels(value: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function perceptualColor(value: string) {
  const [red, green, blue] = channels(value).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, b),
    hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  };
}

function hueDistance(left: string, right: string) {
  const distance = Math.abs(perceptualColor(left).hue - perceptualColor(right).hue) % 360;
  return Math.min(distance, 360 - distance);
}

const palettes = [
  { name: "orange", primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" },
  { name: "green", primary: "#66F246", secondary: "#9AEF28", tertiary: "#ACF81E" },
  { name: "blue", primary: "#1D4ED8", secondary: "#EC4899", tertiary: "#14B8A6" },
  { name: "muted", primary: "#5A443C", secondary: "#D8C7C0", tertiary: "#9D948F" },
  { name: "pastel", primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE" },
  { name: "dark", primary: "#0A1834", secondary: "#17313A", tertiary: "#253A35" },
  { name: "original vivid green", primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" },
];

const appearances = ["light", "dark"] as const;
type Appearance = (typeof appearances)[number];
const catalog = getPublisherAppColorCatalog();
const optionByKey = new Map(catalog.options.map((option) => [option.key, option]));
type PalettePlan = ReturnType<typeof createPublisherAppPaletteOverridePlan>;

function original(key: string, appearance: Appearance) {
  const option = optionByKey.get(key);
  if (!option) throw new Error(`Missing catalog role ${key}`);
  return appearance === "light" ? option.defaultLightColor : option.defaultDarkColor;
}

function effective(plan: PalettePlan, key: string, appearance: Appearance) {
  return plan.colorOverrides[key]?.[appearance] ?? original(key, appearance);
}

function createPlan(palette = palettes[0]) {
  return createPublisherAppPaletteOverridePlan(
    publisherAppColorsWithCounterpoints(palette),
    catalog.options,
    catalog.catalogVersion,
    catalog.alternativeTonalFlows,
    catalog.contrastPairs,
  );
}

function expectLightnessProgression(plan: PalettePlan, keys: string[], appearance: Appearance) {
  for (let index = 1; index < keys.length; index += 1) {
    const sourceDelta = perceptualColor(original(keys[index], appearance)).lightness -
      perceptualColor(original(keys[index - 1], appearance)).lightness;
    const targetDelta = perceptualColor(effective(plan, keys[index], appearance)).lightness -
      perceptualColor(effective(plan, keys[index - 1], appearance)).lightness;
    if (Math.abs(sourceDelta) < 0.004) continue;
    try {
      expect(Math.sign(targetDelta)).toBe(Math.sign(sourceDelta));
    } catch (error) {
      throw new Error(`${appearance} ${keys[index - 1]} → ${keys[index]}: ${effective(plan, keys[index - 1], appearance)} → ${effective(plan, keys[index], appearance)}`, { cause: error });
    }
  }
}

function luminance(value: number[]) {
  const linear = value.map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function composite(value: string, background: number[]) {
  const alpha = value.length === 9 ? Number.parseInt(value.slice(7), 16) / 255 : 1;
  return channels(value).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
}

function ratio(foreground: number[], background: number[]) {
  const first = luminance(foreground), second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("publisher app automatic palette fidelity", () => {
  it("uses the complete native catalog and emits only changed, known colors", () => {
    const plan = createPlan();
    expect(catalog.catalogVersion).toBe(8);
    expect(catalog.options).toHaveLength(698);
    expect(catalog.contrastPairs).toHaveLength(21);
    expect(plan.sourceCount).toBe(698);
    expect(plan.selectedCount).toBe(Object.keys(plan.colorOverrides).length);
    expect(plan.selectedCount).toBeGreaterThan(0);
    expect(plan.selectedCount).toBeLessThan(plan.sourceCount);
    for (const [key, override] of Object.entries(plan.colorOverrides)) {
      expect(optionByKey.has(key)).toBe(true);
      expect(appearances.some((appearance) =>
        override[appearance] !== undefined && override[appearance] !== original(key, appearance),
      )).toBe(true);
      for (const appearance of appearances) {
        if (override[appearance] !== undefined) {
          expect(override[appearance]).toMatch(/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/);
          expect(override[appearance]).not.toBe(original(key, appearance));
        }
      }
    }
    for (const prefix of ["community.rareCircles.", "community.newPost.", "community.genes.", "savedContent."]) {
      expect(Object.keys(plan.colorOverrides).some((key) => key.startsWith(prefix))).toBe(true);
    }
  });

  it("uses the chosen palette hues for readable filled controls without changing the selected colors", () => {
    const colors = publisherAppColorsWithCounterpoints(palettes[0]);
    const selected = { ...colors };
    const plan = createPublisherAppPaletteOverridePlan(
      colors, catalog.options, catalog.catalogVersion,
      catalog.alternativeTonalFlows, catalog.contrastPairs,
    );
    expect(colors).toEqual(selected);
    for (const appearance of appearances) {
      for (const [key, seed] of [["brand.primary", colors.primary], ["brand.secondary", colors.secondary], ["brand.accent", colors.tertiary]]) {
        const generated = effective(plan, key, appearance);
        expectWhiteGradientContrast([generated]);
        expect(hueDistance(generated, seed)).toBeLessThan(2);
        expect(perceptualColor(generated).lightness).toBeLessThanOrEqual(perceptualColor(seed).lightness);
      }
    }
  });

  it("lets native illustration targets inherit brand and counterpoints without a generic automatic override", () => {
    const plan = createPlan();
    for (const key of ["illustration.primaryTone", "illustration.purpleTone", "illustration.cyanTone"]) {
      expect(plan.colorOverrides[key]).toBeUndefined();
    }
  });

  it("never changes the native page foundations to rescue an incompatible manual accent", () => {
    const plan = createPlan();
    const current = { ...plan.colorOverrides, "app.accent": { ...plan.colorOverrides["app.accent"], light: "#FFFFFF" } };
    expect(() => reconcilePublisherAppPaletteContrast({
      colorOverrides: current,
      generatedColorOverrides: plan.colorOverrides,
      lockedOverrides: { "app.accent": { light: true } },
      options: catalog.options,
      contrastPairs: catalog.contrastPairs,
    })).toThrow(/contrast/);
    expect(current["app.accent"].light).toBe("#FFFFFF");
  });

  it("retains semantic status identities", () => {
    const plan = createPlan();
    for (const key of ["app.success", "serviceStatus.failed", "savedContent.errorAccent"]) {
      for (const appearance of appearances) {
        expect(effective(plan, key, appearance)).toBe(original(key, appearance));
      }
    }
  });

  it("evaluates a quiet appearance independently of a chromatic opposite appearance", () => {
    const options: PublisherAppColorCatalogOption[] = [{
      key: "surface.quiet",
      title: "Quiet panel",
      usageDescription: "Muted panel tint",
      group: "General interface",
      defaultLightColor: "#F3F1EF",
      defaultDarkColor: "#2563EB",
      platforms: ["ios", "android"],
    }];
    const plan = createPublisherAppPaletteOverridePlan(
      publisherAppColorsWithCounterpoints(palettes[1]), options, 99,
    );
    expect(plan.colorOverrides["surface.quiet"]?.light ?? options[0].defaultLightColor).toBe("#F3F1EF");
    expect(plan.colorOverrides["surface.quiet"]?.dark).not.toBe("#2563EB");
  });

  it("checks translucent backgrounds after compositing them over the appearance canvas", () => {
    const option = (key: string, light: string, dark: string): PublisherAppColorCatalogOption => ({
      key, title: key, usageDescription: key, group: "General interface",
      defaultLightColor: light, defaultDarkColor: dark, platforms: ["ios", "android"],
    });
    const options = [
      option("brand.primary", "#F61C72", "#F61C72"),
      option("app.background", "#FFFFFF", "#12141A"),
      option("panel.fill", "#F61C7280", "#F61C7280"),
      option("panel.foreground", "#000000", "#FFFFFF"),
    ];
    const plan = createPublisherAppPaletteOverridePlan(
      publisherAppColorsWithCounterpoints(palettes[2]), options, 99, [],
      [{ foregroundKey: "panel.foreground", backgroundKeys: ["panel.fill"], minimumRatio: 4.5 }],
    );
    const value = (key: string, appearance: Appearance) => plan.colorOverrides[key]?.[appearance] ??
      options.find((entry) => entry.key === key)![appearance === "light" ? "defaultLightColor" : "defaultDarkColor"];
    for (const appearance of appearances) {
      const background = composite(value("panel.fill", appearance), channels(value("app.background", appearance)));
      const foreground = composite(value("panel.foreground", appearance), background);
      expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.485);
      expect(value("panel.fill", appearance).slice(7)).toBe("80");
    }
  });

  it("retains foreground alpha when contrast needs a correction", () => {
    const option = (key: string, light: string, dark: string): PublisherAppColorCatalogOption => ({
      key, title: key, usageDescription: key, group: "General interface",
      defaultLightColor: light, defaultDarkColor: dark, platforms: ["ios", "android"],
    });
    const options = [
      option("brand.primary", "#FFB21F", "#FFB21F"),
      option("app.background", "#FFFFFF", "#12141A"),
      option("panel.fill", "#FFB21F", "#0A1834"),
      option("panel.foreground", "#000000CC", "#FFFFFFCC"),
    ];
    const plan = createPublisherAppPaletteOverridePlan(
      publisherAppColorsWithCounterpoints(palettes[5]), options, 99, [],
      [{ foregroundKey: "panel.foreground", backgroundKeys: ["panel.fill"], minimumRatio: 4.5 }],
    );
    for (const appearance of appearances) {
      const foreground = plan.colorOverrides["panel.foreground"]?.[appearance] ??
        options[3][appearance === "light" ? "defaultLightColor" : "defaultDarkColor"];
      const background = plan.colorOverrides["panel.fill"]?.[appearance] ??
        options[2][appearance === "light" ? "defaultLightColor" : "defaultDarkColor"];
      expect(foreground.slice(7)).toBe("CC");
      expect(ratio(composite(foreground, channels(background)), channels(background))).toBeGreaterThanOrEqual(4.485);
    }
  });

  it.each(["#000000", "#FFFFFF", "#777777"])("keeps a deliberately achromatic full palette %s neutral", (primary) => {
    const palette = {
      name: "neutral", primary, secondary: primary, tertiary: primary,
      counterpointClockwise: primary, counterpointAnticlockwise: primary,
      counterpointFarClockwise: primary, counterpointFarAnticlockwise: primary,
    };
    const colors = publisherAppColorsWithCounterpoints(palette);
    const plan = createPlan(palette);
    for (const key of ["counterpointClockwise", "counterpointAnticlockwise", "counterpointFarClockwise", "counterpointFarAnticlockwise"] as const) {
      expect(colors[key]).toBe(primary);
    }
    for (const appearance of appearances) {
      const primaryFill = effective(plan, "brand.primary", appearance);
      expect(perceptualColor(primaryFill).chroma).toBeLessThan(0.001);
      expectWhiteGradientContrast([primaryFill]);
      expect(palette.primary).toBe(primary);
      expect(perceptualColor(effective(plan, "discover.category.genomicDatabase.accent", appearance)).chroma).toBeLessThan(0.001);
      for (const keys of [
        ["learn.level.spider.accent", "learn.level.spider.gradientEnd"],
        ["savedContent.headerStart", "savedContent.headerEnd"],
        ["learn.background.stop1", "learn.background.stop2", "learn.background.stop3", "learn.background.stop4"],
      ]) {
        expectLightnessProgression(plan, keys, appearance);
      }
    }
    for (const override of Object.values(plan.colorOverrides)) {
      for (const value of Object.values(override)) expect(value).toMatch(/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/);
    }
  });

  it("is deterministic when the catalog order changes", () => {
    const first = createPlan();
    const second = createPublisherAppPaletteOverridePlan(
      publisherAppColorsWithCounterpoints(palettes[0]),
      [...catalog.options].reverse(),
      catalog.catalogVersion,
      catalog.alternativeTonalFlows,
      catalog.contrastPairs,
    );
    expect(second).toEqual(first);
  });

  it("keeps the fixed Genes identity invariant across brand palettes", () => {
    const keys = catalog.alternativeTonalFlows.find((flow) => flow.id === "communityGenes")!.roleKeys;
    const plans = palettes.map((palette) => createPlan(palette));
    for (const key of keys) {
      for (const appearance of appearances) {
        expect(new Set(plans.map((plan) => effective(plan, key, appearance))).size).toBe(1);
      }
    }
  });
});

describe.each(palettes)("$name brand palette", (palette) => {
  const plan = createPlan(palette);

  it("keeps functional UI accents tied to the brand and general tones in its analogous family", () => {
    for (const appearance of appearances) {
      for (const key of ["app.accent", "app.profileAccent", "app.funHeaderChevron"]) {
        const color = effective(plan, key, appearance);
        if (perceptualColor(color).chroma > 0.008) expect(hueDistance(color, palette.primary)).toBeLessThan(12);
      }
      for (const key of ["learn.chapter.accent", "discover.feed.tint"]) {
        const color = effective(plan, key, appearance);
        if (perceptualColor(color).chroma > 0.008) expect(hueDistance(color, palette.primary)).toBeLessThan(50);
      }
    }
  });

  it("keeps the near-identical teal endpoints together across the old hue-wheel cutoff", () => {
    for (const appearance of appearances) {
      for (const keys of [
        ["discover.category.genomicDatabase.accent", "discover.category.genomicDatabase.gradientEnd"],
        ["discover.category.geneSpotlight.accent", "discover.category.geneSpotlight.gradientEnd"],
        ["community.quickActions.genes.middle", "community.quickActions.genes.end"],
      ]) {
        const [left, right] = keys.map((key) => effective(plan, key, appearance));
        if (Math.min(perceptualColor(left).chroma, perceptualColor(right).chroma) > 0.008) {
          expect(hueDistance(left, right)).toBeLessThan(12);
        }
      }
    }
  });

  it("retains intentional multi-hue gradients rather than flattening every family to one hue", () => {
    for (const appearance of appearances) {
      for (const keys of [
        ["tabs.discover.start", "tabs.discover.end"],
        ["community.quickActions.genes.start", "community.quickActions.genes.middle"],
      ]) {
        const [start, end] = keys.map((key) => effective(plan, key, appearance));
        if (Math.min(perceptualColor(start).chroma, perceptualColor(end).chroma) <= 0.008) continue;
        const sourceDistance = hueDistance(original(keys[0], appearance), original(keys[1], appearance));
        try {
          expect(Math.abs(hueDistance(start, end) - sourceDistance)).toBeLessThan(10);
        } catch (error) {
          throw new Error(`${appearance} ${keys.join(" → ")}: ${start} → ${end}`, { cause: error });
        }
      }
    }
  });

  it("preserves the original Learn background progression and low color intensity", () => {
    const keys = [1, 2, 3, 4].map((stop) => `learn.background.stop${stop}`);
    expectLightnessProgression(plan, keys, "light");
    for (const key of keys) {
      const generated = perceptualColor(effective(plan, key, "light"));
      const source = perceptualColor(original(key, "light"));
      const sourceAnchor = perceptualColor(original("learn.level.bacteria.accent", "light"));
      const targetAnchor = perceptualColor(palette.secondary);
      expect(Math.abs(generated.lightness - source.lightness)).toBeLessThan(0.004);
      expect(generated.chroma).toBeLessThanOrEqual(source.chroma * targetAnchor.chroma / sourceAnchor.chroma + 0.004);
      expect(effective(plan, key, "dark")).toBe(original(key, "dark"));
    }
  });

  it("retains soft surface tints instead of creating accent-strength backgrounds", () => {
    const sourceAnchor = perceptualColor(original("brand.primary", "light"));
    const targetAnchor = perceptualColor(palette.primary);
    for (const key of [
      "discover.background.organizations3", "services.gradientMiddle", "services.gradientBottom",
      "serviceInfo.mintMedallion", "studyPicker.haloViolet",
    ]) {
      const source = perceptualColor(original(key, "light"));
      const generated = perceptualColor(effective(plan, key, "light"));
      expect(Math.abs(generated.lightness - source.lightness)).toBeLessThan(0.004);
      expect(generated.chroma).toBeLessThanOrEqual(source.chroma * Math.max(1, targetAnchor.chroma / sourceAnchor.chroma) + 0.004);
    }
  });

  it("retains relative Learn header shading, including formerly protected dark endpoints", () => {
    for (const appearance of appearances) {
      for (const level of ["bacteria", "spider", "tree", "dog"]) {
        const keys = [`learn.level.${level}.accent`, `learn.level.${level}.gradientEnd`];
        expectLightnessProgression(plan, keys, appearance);
        const [start, end] = keys.map((key) => effective(plan, key, appearance));
        if (Math.min(perceptualColor(start).chroma, perceptualColor(end).chroma) > 0.008) {
          expect(hueDistance(start, end)).toBeLessThan(15);
        }
      }
    }
  });

  it("preserves local gradient direction and originally shared colors", () => {
    for (const appearance of appearances) {
      expectLightnessProgression(plan, ["savedContent.headerStart", "savedContent.headerEnd"], appearance);
      expectLightnessProgression(plan, [
        "community.newPost.submitStart", "community.newPost.submitMiddle", "community.newPost.submitEnd",
      ], appearance);
      const shared = ["community.newPost.headerAccent", "community.newPost.submitStart"];
      if (original(shared[0], appearance) === original(shared[1], appearance)) {
        expect(effective(plan, shared[0], appearance)).toBe(effective(plan, shared[1], appearance));
      }
    }
  });

  it("keeps barely tinted glows and orbs soft while preserving their transparency", () => {
    const sourceAnchor = perceptualColor(original("learn.level.bacteria.accent", "light"));
    const targetAnchor = perceptualColor(palette.secondary);
    for (const key of [
      "learn.background.leadingGlow", "learn.background.leadingGlowEdge", "learn.background.leadingOrb",
      "learn.background.trailingGlow", "learn.background.trailingGlowEdge", "learn.background.trailingOrb",
      "learn.background.sheenEnd",
    ]) {
      const source = perceptualColor(original(key, "light"));
      const generated = perceptualColor(effective(plan, key, "light"));
      expect(generated.chroma).toBeLessThanOrEqual(source.chroma * targetAnchor.chroma / sourceAnchor.chroma + 0.004);
      for (const appearance of appearances) {
        expect(effective(plan, key, appearance).slice(7)).toBe(original(key, appearance).slice(7));
      }
    }
  });

  it("keeps deep dark canvases intact and retains every role's alpha", () => {
    for (const key of [
      "app.background", "app.surface", "app.groupedBackground", "discover.background.standard1",
      "discover.background.standard2", "discover.background.standard3", "discover.background.standard4",
      "services.gradientTop", "services.gradientMiddle", "services.gradientBottom", "services.gradientFade",
    ]) {
      expect(effective(plan, key, "dark")).toBe(original(key, "dark"));
    }
    for (const option of catalog.options) {
      for (const appearance of appearances) {
        expect(effective(plan, option.key, appearance).slice(7)).toBe(original(option.key, appearance).slice(7));
      }
    }
  });

  it("preserves readable branded text on the existing service surfaces in both appearances", () => {
    for (const appearance of appearances) {
      for (const [foregroundKey, backgroundKey] of [
        ["brand.serviceButtonInk", "serviceInfo.canvas"],
        ["serviceInfo.tealInk", "serviceInfo.mintSurface"],
        ["serviceInfo.violetInk", "serviceInfo.lavenderSurface"],
        ["brand.accentText", "brand.accentSurface"],
      ]) {
        const sourceRatio = ratio(channels(original(foregroundKey, appearance)), channels(original(backgroundKey, appearance)));
        const targetRatio = ratio(channels(effective(plan, foregroundKey, appearance)), channels(effective(plan, backgroundKey, appearance)));
        expect(targetRatio).toBeGreaterThanOrEqual(Math.min(4.5, sourceRatio) - 0.015);
      }
    }
  });

  it("keeps Learn header text readable over all level gradients", () => {
    for (const appearance of appearances) {
      for (const option of catalog.options.filter((entry) => /^learn\.level\..+\.(?:accent|gradientEnd)$/.test(entry.key))) {
        const sourceRatio = ratio(channels(original("learn.header.foreground", appearance)), channels(original(option.key, appearance)));
        const targetRatio = ratio(channels(effective(plan, "learn.header.foreground", appearance)), channels(effective(plan, option.key, appearance)));
        expect(targetRatio).toBeGreaterThanOrEqual(Math.min(2.5, sourceRatio) - 0.015);
      }
    }
  });

  it("satisfies every catalog foreground/background contrast relationship in both appearances", () => {
    for (const appearance of appearances) {
      for (const pair of catalog.contrastPairs) {
        const prefix = pair.foregroundKey.startsWith("savedContent.")
          ? "savedContent"
          : pair.foregroundKey.split(".").slice(0, 2).join(".");
        const canvasKey = optionByKey.has(`${prefix}.backgroundBase`) ? `${prefix}.backgroundBase` : "app.background";
        const canvas = channels(effective(plan, canvasKey, appearance));
        const backgrounds = pair.backgroundKeys.map((key) => composite(effective(plan, key, appearance), canvas));
        const samples = [...backgrounds];
        for (let index = 1; index < backgrounds.length; index += 1) {
          for (let step = 1; step < 32; step += 1) {
            samples.push(backgrounds[index - 1].map((channel, channelIndex) =>
              channel + (backgrounds[index][channelIndex] - channel) * step / 32,
            ));
          }
        }
        for (const background of samples) {
          const foreground = composite(effective(plan, pair.foregroundKey, appearance), background);
          expect(ratio(foreground, background)).toBeGreaterThanOrEqual(pair.minimumRatio - 0.015);
        }
      }
    }
  });
});

const brightStructuralPalettes = [
  { name: "yellow", color: "#FFFF00" },
  { name: "green", color: "#40FF00" },
  { name: "cyan", color: "#00FFFF" },
];

function brightStructuralColors(color: string) {
  return publisherAppColorsWithCounterpoints({
    primary: color, secondary: color, tertiary: color,
    counterpointClockwise: color, counterpointAnticlockwise: color,
    counterpointFarClockwise: color, counterpointFarAnticlockwise: color,
  });
}

function expectWhiteGradientContrast(values: string[], opacities: number[] = [], label = "gradient") {
  const backgrounds = values.map((value, index) => channels(value).map((channel) => {
    const opacity = opacities[index] ?? 1;
    return channel * opacity + 1 - opacity;
  }));
  const samples = [...backgrounds];
  for (let index = 1; index < backgrounds.length; index += 1) {
    for (let step = 1; step < 32; step += 1) {
      samples.push(backgrounds[index - 1].map((channel, component) =>
        channel + (backgrounds[index][component] - channel) * step / 32,
      ));
    }
  }
  for (const background of samples) {
    try {
      expect(ratio(channels("#FFFFFF"), background)).toBeGreaterThanOrEqual(4.485);
    } catch (error) {
      throw new Error(`${label}: white text over ${values.join(", ")} at opacity ${opacities.join(", ") || "1"}`, { cause: error });
    }
  }
}

describe.each(brightStructuralPalettes)("readable $name structural fills", ({ color }) => {
  const colors = brightStructuralColors(color);
  const input = JSON.parse(JSON.stringify(colors));
  const plan = createPublisherAppPaletteOverridePlan(
    colors, catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );

  it("keeps white text on filled actions and category pills instead of changing it to dark ink", () => {
    for (const foregroundKey of [
      "community.rareCircles.primaryActionForeground",
      "community.newPost.submitForeground",
      "community.newPost.selectedForeground",
    ]) {
      const pair = catalog.contrastPairs.find((entry) => entry.foregroundKey === foregroundKey)!;
      expect(effective(plan, foregroundKey, "light")).toBe("#FFFFFF");
      expectWhiteGradientContrast(pair.backgroundKeys.map((key) => effective(plan, key, "light")));
    }
  });

  it("uses readable darker tab ramps and discovery ribbons in both appearances", () => {
    for (const appearance of appearances) {
      for (const tab of ["reports", "learn", "discover", "community", "profile"]) {
        expectWhiteGradientContrast(
          ["start", "end"].map((stop) => effective(plan, `tabs.${tab}.${stop}`, appearance)),
          appearance === "light" ? [0.78, 0.68] : [0.72, 0.62],
          `${appearance} ${tab} tab`,
        );
      }
      expect(effective(plan, "discover.requestLauncher.foreground", appearance)).toBe("#FFFFFF");
      expectWhiteGradientContrast(["Start", "Middle", "End"].map((stop) =>
        effective(plan, `discover.requestLauncher.ribbon${stop}`, appearance),
      ));
    }
  });

  it("keeps the selected palette and foundations intact while shading shared white-pill backgrounds", () => {
    expect(colors).toEqual(input);
    for (const appearance of appearances) {
      for (const key of ["brand.primary", "brand.secondary", "brand.accent"]) {
        const generated = effective(plan, key, appearance);
        expectWhiteGradientContrast([generated]);
        expect(hueDistance(generated, color)).toBeLessThan(2);
        expect(perceptualColor(generated).lightness).toBeLessThan(perceptualColor(color).lightness);
      }
      expect(effective(plan, "app.background", appearance)).toBe(original("app.background", appearance));
    }
  });
});

it.each(brightStructuralPalettes)("keeps the $name hue, ramp shading and opacity when darkening a translucent filled control", ({ color }) => {
  const option = (key: string, value: string): PublisherAppColorCatalogOption => ({
    key, title: key, usageDescription: key, group: "Community composer",
    defaultLightColor: value, defaultDarkColor: value, platforms: ["ios", "android"],
  });
  const options = [
    option("brand.primary", "#F61C72"),
    option("app.background", "#FFFFFF"),
    option("community.newPost.submitStart", "#F61C72E6"),
    option("community.newPost.submitMiddle", "#D20B5AE6"),
    option("community.newPost.submitEnd", "#A20B45E6"),
    option("community.newPost.submitForeground", "#FFFFFF"),
  ];
  const backgroundKeys = ["Start", "Middle", "End"].map((stop) => `community.newPost.submit${stop}`);
  const plan = createPublisherAppPaletteOverridePlan(
    brightStructuralColors(color), options, 99, [],
    [{ foregroundKey: "community.newPost.submitForeground", backgroundKeys, minimumRatio: 4.5 }],
  );
  const value = (key: string, appearance: Appearance) => plan.colorOverrides[key]?.[appearance] ?? options.find((entry) => entry.key === key)!.defaultLightColor;
  for (const appearance of appearances) {
    expect(value("community.newPost.submitForeground", appearance)).toBe("#FFFFFF");
    const values = backgroundKeys.map((key) => value(key, appearance));
    const tones = values.map(perceptualColor);
    expect(hueDistance(values[0], color)).toBeLessThan(2);
    expect(tones[0].lightness).toBeLessThan(perceptualColor(color).lightness);
    expect(tones[0].lightness).toBeGreaterThan(tones[1].lightness);
    expect(tones[1].lightness).toBeGreaterThan(tones[2].lightness);
    expect(new Set(values).size).toBe(3);
    for (const generated of values) expect(generated.slice(7)).toBe("E6");
    const backgrounds = values.map((generated) => composite(generated, channels("#FFFFFF")));
    for (const background of backgrounds) expect(ratio(channels("#FFFFFF"), background)).toBeGreaterThanOrEqual(4.485);
  }
});

it("preserves manual structural fill and foreground choices while adjusting the remaining automatic shades", () => {
  const colors = brightStructuralColors("#FFFF00");
  const plan = createPublisherAppPaletteOverridePlan(
    colors, catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
  const backgroundKey = "community.newPost.submitStart";
  const foregroundKey = "community.newPost.submitForeground";
  const current = {
    ...plan.colorOverrides,
    [backgroundKey]: { ...plan.colorOverrides[backgroundKey], light: "#6B5C12" },
    [foregroundKey]: { ...plan.colorOverrides[foregroundKey], light: "#FFFFFFF2" },
  };
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: current,
    generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: { [backgroundKey]: { light: true }, [foregroundKey]: { light: true } },
    options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides[backgroundKey].light).toBe("#6B5C12");
  expect(result.colorOverrides[foregroundKey].light).toBe("#FFFFFFF2");
  expect(current[backgroundKey].light).toBe("#6B5C12");
  expect(current[foregroundKey].light).toBe("#FFFFFFF2");
});

it("leaves already readable independent palette fills unchanged when a bright secondary needs shading", () => {
  const colors = publisherAppColorsWithCounterpoints({ primary: "#172554", secondary: "#FFFF00", tertiary: "#14532D" });
  const selected = { ...colors };
  const plan = createPublisherAppPaletteOverridePlan(
    colors, catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
  expect(colors).toEqual(selected);
  for (const appearance of appearances) {
    expect(effective(plan, "brand.primary", appearance)).toBe("#172554");
    expect(effective(plan, "brand.accent", appearance)).toBe("#14532D");
    expectWhiteGradientContrast([effective(plan, "brand.secondary", appearance)]);
    expect(hueDistance(effective(plan, "brand.secondary", appearance), "#FFFF00")).toBeLessThan(2);
  }
});

it("keeps manually chosen bright shared-pill and tab fills exact in their edited appearance", () => {
  const plan = createPublisherAppPaletteOverridePlan(
    brightStructuralColors("#40FF00"), catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
  const current = {
    ...plan.colorOverrides,
    "brand.primary": { ...plan.colorOverrides["brand.primary"], light: "#FFFF00" },
    "tabs.learn.start": { ...plan.colorOverrides["tabs.learn.start"], light: "#00FFFF" },
  };
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: current,
    generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: { "brand.primary": { light: true }, "tabs.learn.start": { light: true } },
    options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides["brand.primary"]).toEqual(current["brand.primary"]);
  expect(result.colorOverrides["tabs.learn.start"]).toEqual(current["tabs.learn.start"]);
  expect(result.generatedColorOverrides["brand.primary"]).toEqual(plan.colorOverrides["brand.primary"]);
  expect(result.generatedColorOverrides["tabs.learn.start"]).toEqual(plan.colorOverrides["tabs.learn.start"]);
  expectWhiteGradientContrast(
    [result.colorOverrides["tabs.learn.end"]?.light ?? original("tabs.learn.end", "light")],
    [0.68], "automatic Learn tab end next to a manual start",
  );
  expect(current["brand.primary"].light).toBe("#FFFF00");
  expect(current["tabs.learn.start"].light).toBe("#00FFFF");
});
