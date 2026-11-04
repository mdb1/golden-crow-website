import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import {
  createPublisherAppPaletteOverridePlan,
  PUBLISHER_APP_AUTOMATIC_OVERRIDE_COUNT,
} from "@/lib/publisher-app-palette-overrides";

function colorLightness(value: string) {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  return ((Math.max(...channels) + Math.min(...channels)) / 2) * 100;
}

function colorHue(value: string) {
  const [red, green, blue] = [1, 3, 5].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
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

describe("publisher app automatic palette overrides", () => {
  const catalog = getPublisherAppColorCatalog();
  const colors = {
    primary: "#FF5500",
    secondary: "#FFB21F",
    tertiary: "#F58220",
  };

  it("selects exactly the 167 highest-impact visual roles", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );

    expect(catalog.options).toHaveLength(334);
    expect(plan.sourceCount).toBe(334);
    expect(plan.selectedCount).toBe(PUBLISHER_APP_AUTOMATIC_OVERRIDE_COUNT);
    expect(Object.keys(plan.colorOverrides)).toHaveLength(167);
    expect(plan.colorOverrides).toEqual(
      expect.objectContaining({
        "app.background": expect.any(Object),
        "brand.primary": expect.any(Object),
        "tabs.discover.start": expect.any(Object),
        "discover.category.news.accent": expect.any(Object),
        "community.quickActions.friends.start": expect.any(Object),
      }),
    );
    expect(plan.colorOverrides["serviceStatus.failed"]).toBeUndefined();
  });

  it("preserves light, dark and transparent roles while moving color hue", () => {
    const plan = createPublisherAppPaletteOverridePlan(
      colors,
      catalog.options,
      catalog.catalogVersion,
    );
    const background = plan.colorOverrides["app.background"];
    const frostedSurface = plan.colorOverrides["app.frostedSurface"];
    const brandPrimary = plan.colorOverrides["brand.primary"];

    expect(colorLightness(background.light!)).toBeGreaterThan(96);
    expect(colorLightness(background.dark!)).toBeLessThan(12);
    expect(frostedSurface.light).toMatch(/80$/);
    expect(frostedSurface.dark).toMatch(/99$/);
    expect(
      [colors.primary, colors.secondary, colors.tertiary].some(
        (color) =>
          hueDistance(colorHue(brandPrimary.light!), colorHue(color)) < 3,
      ),
    ).toBe(true);
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
