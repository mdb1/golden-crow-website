import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import {
  publisherAppColorsWithCounterpoints,
  type PublisherAppColorCatalogOption,
} from "@/lib/publisher-app-config";
import { createPublisherAppPaletteOverridePlan } from "@/lib/publisher-app-palette-overrides";

function colorChannels(value: string) {
  return [1, 3, 5].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
}

function colorLightness(value: string) {
  const channels = colorChannels(value);
  return ((Math.max(...channels) + Math.min(...channels)) / 2) * 100;
}

function colorSaturation(value: string) {
  const channels = colorChannels(value);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  return delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100;
}

function colorHue(value: string) {
  const [red, green, blue] = colorChannels(value);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const hue =
    maximum === red
      ? 60 * (((green - blue) / delta) % 6)
      : maximum === green
        ? 60 * ((blue - red) / delta + 2)
        : 60 * ((red - green) / delta + 4);
  return hue < 0 ? hue + 360 : hue;
}

function hueDistance(left: number, right: number) {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
}

function perceptualLightness(value: string) {
  const [red, green, blue] = colorChannels(value).map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  return (
    0.2104542553 * Math.cbrt(l) +
    0.793617785 * Math.cbrt(m) -
    0.0040720468 * Math.cbrt(s)
  );
}

describe("publisher app automatic palette overrides", () => {
  const catalog = getPublisherAppColorCatalog();
  const optionByKey = new Map(
    catalog.options.map((option) => [option.key, option]),
  );
  const colors = publisherAppColorsWithCounterpoints({
    primary: "#FF5500",
    secondary: "#FFB21F",
    tertiary: "#F58220",
  });

  it("selects every branding-susceptible chromatic role without a quota", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );

    expect(catalog.catalogVersion).toBe(3);
    expect(catalog.options).toHaveLength(576);
    expect(plan.sourceCount).toBe(576);
    expect(plan.selectedCount).toBe(Object.keys(plan.colorOverrides).length);
    expect(plan.selectedCount).toBeGreaterThan(0);
    expect(plan.selectedCount).toBeLessThan(plan.sourceCount);
    const requiredKeys = [
      "app.accent",
      "app.learnBackground",
      "brand.primary",
      "tabs.learn.start",
      "tabs.discover.start",
      "discover.category.news.accent",
      "community.quickActions.friends.start",
      "learn.level.bacteria.accent",
      "learn.level.god.gradientEnd",
      "learn.background.stop1",
      "learn.background.leadingGlow",
      "learn.background.trailingGlow",
      "learn.background.leadingOrb",
      "learn.background.sheenEnd",
      "learn.chapter.accent",
      "learn.quiz.wordAvailableText",
      "discover.suggestion.pocketGuideInitialOverview.accent",
      "discover.suggestion.gene1.gradientEnd",
      "discover.suggestion.lesson.accent",
      "discover.feed.tint",
      "discover.requestLauncher.ribbonStart",
      "discover.variantFinder.metricVariants",
    ];
    expect(
      requiredKeys.filter((key) => plan.colorOverrides[key] === undefined),
    ).toEqual([]);
    for (const protectedKey of [
      "app.background",
      "app.surface",
      "app.groupedBackground",
      "app.cardFill",
      "app.frostedSurface",
      "app.tint",
      "app.primaryText",
      "app.success",
      "serviceStatus.failed",
      "learn.header.foreground",
      "learn.levelBox.shadow",
      "learn.background.topVeil",
      "learn.background.bottomVeil",
      "learn.background.sheenStart",
      "learn.background.stars",
      "discover.feed.fill",
    ]) {
      expect(plan.colorOverrides[protectedKey]).toBeUndefined();
    }
    expect(plan.colorOverrides["brand.primary"]).toEqual({
      light: colors.primary,
      dark: colors.primary,
    });
    expect(plan.colorOverrides["learn.level.bacteria.accent"]).toEqual({
      light: colors.primary,
      dark: colors.primary,
    });
    const bacteriaGradientEnd =
      plan.colorOverrides["learn.level.bacteria.gradientEnd"];
    expect(
      hueDistance(
        colorHue(bacteriaGradientEnd.light!),
        colorHue(colors.primary),
      ),
    ).toBeLessThanOrEqual(15);
    expect(colorSaturation(bacteriaGradientEnd.light!)).toBeGreaterThan(75);

    for (const [key, override] of Object.entries(plan.colorOverrides)) {
      const original = optionByKey.get(key)!;
      expect(
        override.light !== original.defaultLightColor ||
          override.dark !== original.defaultDarkColor,
      ).toBe(true);
    }
  });

  it("composes Learn from the secondary color with sparse clockwise effects and explicit tab roles", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );

    for (const key of ["tabs.learn.start", "tabs.learn.end"]) {
      expect(plan.colorOverrides[key]).toEqual({
        light: colors.primary,
        dark: colors.primary,
      });
    }
    for (const key of ["tabs.discover.start", "tabs.discover.end"]) {
      expect(plan.colorOverrides[key]).toEqual({
        light: colors.counterpointAnticlockwise,
        dark: colors.counterpointAnticlockwise,
      });
    }

    const secondaryHue = colorHue(colors.secondary);
    const fallback = plan.colorOverrides["app.learnBackground"];
    expect(fallback).toBeDefined();
    expect(colorLightness(fallback.light!)).toBeGreaterThan(90);
    expect(colorLightness(fallback.dark!)).toBeLessThan(20);

    const stopKeys = [1, 2, 3, 4].map(
      (stop) => `learn.background.stop${stop}`,
    );
    const lightStops = stopKeys.map(
      (key) => plan.colorOverrides[key].light!,
    );
    const darkStops = stopKeys.map((key) => plan.colorOverrides[key].dark!);
    expect(new Set(lightStops).size).toBe(4);
    expect(new Set(darkStops).size).toBe(4);
    for (const color of [...lightStops, ...darkStops]) {
      expect(hueDistance(colorHue(color), secondaryHue)).toBeLessThanOrEqual(
        15,
      );
    }

    for (const key of [
      "learn.background.leadingGlow",
      "learn.background.leadingGlowEdge",
      "learn.background.leadingOrb",
      "learn.background.sheenEnd",
    ]) {
      const source = optionByKey.get(key)!;
      expect(plan.colorOverrides[key]).toEqual({
        light: `${colors.counterpointClockwise}${source.defaultLightColor.slice(7)}`,
        dark: `${colors.counterpointClockwise}${source.defaultDarkColor.slice(7)}`,
      });
    }

    for (const key of [
      "learn.background.trailingGlow",
      "learn.background.trailingGlowEdge",
      "learn.background.trailingOrb",
    ]) {
      const override = plan.colorOverrides[key];
      expect(
        hueDistance(colorHue(override.light!), secondaryHue),
      ).toBeLessThanOrEqual(15);
      expect(
        hueDistance(colorHue(override.dark!), secondaryHue),
      ).toBeLessThanOrEqual(15);
    }

    for (const neutralKey of [
      "learn.background.topVeil",
      "learn.background.bottomVeil",
      "learn.background.sheenStart",
      "learn.background.stars",
    ]) {
      expect(plan.colorOverrides[neutralKey]).toBeUndefined();
    }
  });

  it("preserves neutral and semantic colors while adapting every tonal role", () => {
    const option = (
      key: string,
      color: string,
      title = key,
    ): PublisherAppColorCatalogOption => ({
      key,
      title,
      usageDescription: title,
      defaultLightColor: color,
      defaultDarkColor: color,
      group: "General interface",
      platforms: ["ios", "android"],
    });
    const tonalKeys = ["feature.blue", "feature.pink", "feature.teal"];
    const options = [
      option("neutral.white", "#FFFFFF"),
      option("neutral.black", "#000000"),
      option("neutral.gray", "#777777"),
      option("neutral.quiet", "#F3F1EF"),
      option("feedback.success", "#16A34A", "Success status"),
      option(tonalKeys[0], "#2563EB", "Feature blue accent"),
      option(tonalKeys[1], "#E3196A", "Feature pink accent"),
      option(tonalKeys[2], "#14B8A6", "Feature teal accent"),
    ];

    const plan = createPublisherAppPaletteOverridePlan(colors, options, 99);

    expect(plan.sourceCount).toBe(8);
    expect(plan.selectedCount).toBe(3);
    expect(Object.keys(plan.colorOverrides)).toEqual(tonalKeys);
  });

  it("lifts a dark or washed primary into a vivid level-one accent on the same hue", () => {
    for (const mutedPrimary of ["#5A443C", "#D8C7C0"]) {
      const plan = createPublisherAppPaletteOverridePlan(
        publisherAppColorsWithCounterpoints({
          primary: mutedPrimary,
          secondary: "#FFB21F",
          tertiary: "#F58220",
        }),
        catalog.options,
        catalog.catalogVersion,
      );
      const bacteria = plan.colorOverrides["learn.level.bacteria.accent"];
      const gradientEnd =
        plan.colorOverrides["learn.level.bacteria.gradientEnd"];

      expect(bacteria.light).toBe(bacteria.dark);
      expect(bacteria.light).not.toBe(mutedPrimary);
      expect(
        hueDistance(colorHue(bacteria.light!), colorHue(mutedPrimary)),
      ).toBeLessThan(12);
      expect(colorSaturation(bacteria.light!)).toBeGreaterThan(
        colorSaturation(mutedPrimary) + 25,
      );
      expect(colorLightness(bacteria.light!)).toBeGreaterThan(50);
      expect(
        hueDistance(colorHue(gradientEnd.light!), colorHue(bacteria.light!)),
      ).toBeLessThanOrEqual(15);
      expect(colorSaturation(gradientEnd.light!)).toBeGreaterThan(75);
      expect(perceptualLightness(gradientEnd.light!)).toBeLessThan(
        perceptualLightness(bacteria.light!),
      );
    }
  });

  it.each(["#FF5500", "#1D4ED8", "#16A34A", "#FFFF00"])(
    "keeps the Bacteria gradient end vivid and within fifteen degrees of brand %s",
    (primary) => {
      const palette = publisherAppColorsWithCounterpoints({
        primary,
        secondary: "#FFB21F",
        tertiary: "#F58220",
      });
      const plan = createPublisherAppPaletteOverridePlan(
        palette,
        catalog.options,
        catalog.catalogVersion,
      );
      const accent = plan.colorOverrides["learn.level.bacteria.accent"].light!;
      const gradientEnd =
        plan.colorOverrides["learn.level.bacteria.gradientEnd"].light!;

      expect(gradientEnd).not.toBe(accent);
      expect(
        hueDistance(colorHue(gradientEnd), colorHue(accent)),
      ).toBeLessThanOrEqual(15);
      expect(colorSaturation(gradientEnd)).toBeGreaterThan(75);
      expect(perceptualLightness(gradientEnd)).toBeLessThan(
        perceptualLightness(accent),
      );
      expect(
        hueDistance(
          colorHue(gradientEnd),
          colorHue(palette.counterpointClockwise),
        ),
      ).toBeGreaterThan(30);
      expect(
        hueDistance(
          colorHue(gradientEnd),
          colorHue(palette.counterpointAnticlockwise),
        ),
      ).toBeGreaterThan(30);
    },
  );

  it("uses counterpoints only for the two accessory tiles in the four-item community row", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );
    const clockwiseHue = colorHue(colors.counterpointClockwise);
    const anticlockwiseHue = colorHue(colors.counterpointAnticlockwise);

    for (const stop of ["start", "middle", "end", "bezel"]) {
      expect(
        hueDistance(
          colorHue(
            plan.colorOverrides[`community.quickActions.circles.${stop}`]
              .light!,
          ),
          clockwiseHue,
        ),
      ).toBeLessThan(18);
      expect(
        hueDistance(
          colorHue(
            plan.colorOverrides[`community.quickActions.search.${stop}`].light!,
          ),
          anticlockwiseHue,
        ),
      ).toBeLessThan(18);
    }

    expect(plan.colorOverrides["brand.primary"].light).toBe(colors.primary);
    expect(plan.colorOverrides["learn.level.bacteria.accent"].light).toBe(
      colors.primary,
    );
    expect(
      hueDistance(
        colorHue(
          plan.colorOverrides["community.quickActions.friends.start"].light!,
        ),
        clockwiseHue,
      ),
    ).toBeGreaterThan(18);
  });

  it("keeps extreme variants exact and retains every catalog alpha channel", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );

    for (const [key, override] of Object.entries(plan.colorOverrides)) {
      const original = optionByKey.get(key)!;
      for (const [appearance, source] of [
        ["light", original.defaultLightColor],
        ["dark", original.defaultDarkColor],
      ] as const) {
        const generated = override[appearance]!;
        const sourceRgb = source.slice(0, 7).toUpperCase();
        if (
          (sourceRgb === "#FFFFFF" || sourceRgb === "#000000") &&
          key !== "app.learnBackground" &&
          key !== "learn.background.sheenEnd"
        ) {
          expect(generated).toBe(source.toUpperCase());
        }
        expect(generated.slice(7)).toBe(source.slice(7).toUpperCase());
      }
    }

    const translucentAccent = plan.colorOverrides["app.accentSubtleBackground"];
    expect(translucentAccent.light).toMatch(/1A$/);
  });

  it("maps red, blue and green families to distinct related hues", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );
    const keys = [
      "discover.category.news.accent",
      "discover.category.researchUpdate.accent",
      "discover.category.supportService.accent",
    ];
    const generated = keys.map((key) => plan.colorOverrides[key].light!);

    expect(new Set(generated).size).toBe(3);
    for (let left = 0; left < generated.length; left += 1) {
      for (let right = left + 1; right < generated.length; right += 1) {
        expect(
          hueDistance(colorHue(generated[left]), colorHue(generated[right])),
        ).toBeGreaterThan(10);
      }
    }
    for (const [index, key] of keys.entries()) {
      expect(
        Math.abs(
          perceptualLightness(generated[index]) -
            perceptualLightness(optionByKey.get(key)!.defaultLightColor),
        ),
      ).toBeLessThan(0.012);
    }

    const chromaticOutputs = Object.entries(plan.colorOverrides)
      .filter(
        ([key]) =>
          !/^community\.quickActions\.(?:circles|search)\./.test(key) &&
          !/^tabs\.discover\./.test(key),
      )
      .flatMap(([, override]) => [override.light!, override.dark!])
      .filter(
        (color) =>
          colorSaturation(color) >= 30 &&
          colorLightness(color) > 8 &&
          colorLightness(color) < 92,
      );
    const hueBuckets = new Set(
      chromaticOutputs.map((color) => Math.round(colorHue(color) / 12)),
    );
    expect(hueBuckets.size).toBeGreaterThanOrEqual(5);
    for (const color of chromaticOutputs) {
      const hue = colorHue(color);
      expect(hue <= 95 || hue >= 340).toBe(true);
    }
  });

  it("returns the same coordinated catalog for the same palette", () => {
    const first = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );
    const second = createPublisherAppPaletteOverridePlan(
      colors,
      [...catalog.options].reverse(),
      catalog.catalogVersion,
    );

    expect(second).toEqual(first);
  });
});
