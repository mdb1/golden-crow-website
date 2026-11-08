import {
  isCurrentPublisherAppIdentifier,
  isPublisherAppRuntimeEnabled,
  publisherAppStatusLabel,
  publisherAppCounterpointColors,
  publisherAppColorsWithCounterpoints,
  publisherAppDefaultColors,
  publisherAppPaletteSuggestions,
} from "@/lib/publisher-app-config";

const BASE_COLOR_KEYS = ["primary", "secondary", "tertiary"] as const;

describe("publisher app statuses", () => {
  it.each([
    ["active_for_testing", "Activa para pruebas", true],
    ["active", "Activa", true],
    ["pending_revision", "En revisión", false],
    ["approved", "Aprobada", false],
    ["changes_requested", "Requiere ajustes", false],
    ["rejected", "No aprobada", false],
  ] as const)("labels %s distinctly and preserves runtime availability", (status, label, enabled) => {
    expect(publisherAppStatusLabel(status)).toBe(label);
    expect(isPublisherAppRuntimeEnabled(status)).toBe(enabled);
  });
});

function hslFromHex(value: string) {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels as [number, number, number];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation:
      delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    lightness: lightness * 100,
  };
}

function perceptualColor(value: string) {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, b),
    hue: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360,
  };
}

function circularHueDistance(left: number, right: number) {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

describe("publisher app identifiers", () => {
  it("accepts only readable identifiers for the matching publisher kind", () => {
    expect(
      isCurrentPublisherAppIdentifier(
        "app_org_pocket_genes_lab_48217",
        "organization",
      ),
    ).toBe(true);
    expect(
      isCurrentPublisherAppIdentifier(
        "app_ind_maria_jose_perez_10482",
        "individual",
      ),
    ).toBe(true);
    expect(
      isCurrentPublisherAppIdentifier(
        "app_org_pocket_genes_lab_48217",
        "individual",
      ),
    ).toBe(false);
    expect(
      isCurrentPublisherAppIdentifier(
        "organization_8thNEDU1xbFqwnQDUrPt",
        "organization",
      ),
    ).toBe(false);
  });
});

describe("publisher app color palettes", () => {
  it("preserves chosen counterpoints and calculates only missing colors", () => {
    const colors = publisherAppColorsWithCounterpoints({
      primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220",
      counterpointClockwise: "#123456", counterpointFarAnticlockwise: "#ABCDEF",
    });
    expect(colors).toEqual({
      primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220",
      ...publisherAppCounterpointColors("#FF5500"),
      counterpointClockwise: "#123456", counterpointFarAnticlockwise: "#ABCDEF",
    });
  });
  it("matches the bright closely related Medicgen orange palette", () => {
    expect(publisherAppDefaultColors("#FF5500")).toEqual({
      primary: "#FF5500",
      secondary: "#EFBA2A",
      tertiary: "#F4852A",
      ...publisherAppCounterpointColors("#FF5500"),
    });
  });

  it.each(["#FF5500", "#FFFF00", "#1D4ED8", "#5A443C", "#D8C7C0"])(
    "rotates accessory hue around %s while preserving perceptual lightness and limiting chroma",
    (primary) => {
      const source = perceptualColor(primary);
      const counterpoints = publisherAppCounterpointColors(primary);
      for (const [key, degrees] of [
        ["counterpointClockwise", 45],
        ["counterpointAnticlockwise", -45],
        ["counterpointFarClockwise", 75],
        ["counterpointFarAnticlockwise", -75],
      ] as const) {
        const color = perceptualColor(counterpoints[key]);
        expect(circularHueDistance(color.hue, source.hue + degrees)).toBeLessThan(2);
        expect(Math.abs(color.lightness - source.lightness)).toBeLessThan(0.002);
        expect(color.chroma).toBeLessThanOrEqual(source.chroma + 0.002);
      }
    },
  );

  it.each(["#5A443C", "#D8C7C0", "#9D948F", "#17212C"])(
    "keeps a muted or dark identity %s equally restrained in its counterpoints",
    (primary) => {
      const source = perceptualColor(primary);
      for (const value of Object.values(publisherAppCounterpointColors(primary))) {
        const accessory = perceptualColor(value);
        expect(accessory.chroma).toBeLessThan(0.06);
        expect(Math.abs(accessory.lightness - source.lightness)).toBeLessThan(0.002);
      }
    },
  );

  it.each(["#000000", "#FFFFFF", "#808080", "#121212", "#F0F0F0"])(
    "keeps achromatic primary %s achromatic without a fallback hue",
    (primary) => {
      expect(Object.values(publisherAppCounterpointColors(primary))).toEqual([
        primary, primary, primary, primary,
      ]);
    },
  );

  it.each(["#795548", "#F3E7DF", "#526D49"])(
    "turns dark, brownish, or washed tint %s into saturated neighboring hues",
    (source) => {
      const sourceHue = hslFromHex(source).hue;
      const suggestions = publisherAppPaletteSuggestions(source);

      for (const color of suggestions.flatMap((palette) =>
        BASE_COLOR_KEYS.map((key) => palette[key]),
      )) {
        const generated = hslFromHex(color);
        expect(generated.saturation).toBeGreaterThanOrEqual(84);
        expect(generated.lightness).toBeGreaterThanOrEqual(49);
        expect(generated.lightness).toBeLessThanOrEqual(57);
        expect(
          circularHueDistance(generated.hue, sourceHue),
        ).toBeLessThanOrEqual(35);
      }
    },
  );

  it("changes exactly one color in each alternative palette", () => {
    const suggestions = publisherAppPaletteSuggestions("#526D49");
    const [base, ...alternatives] = suggestions;

    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]).toEqual(publisherAppDefaultColors("#526D49"));
    expect(
      new Set(suggestions.map((palette) => JSON.stringify(palette))).size,
    ).toBe(4);

    for (const palette of alternatives) {
      expect(
        BASE_COLOR_KEYS.filter((key) => base![key] !== palette[key]),
      ).toHaveLength(1);
      expect(palette.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.secondary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.tertiary).toMatch(/^#[0-9A-F]{6}$/);
      expect(new Set(BASE_COLOR_KEYS.map((key) => palette[key])).size).toBe(3);
      expect(palette).toMatchObject(
        publisherAppCounterpointColors(palette.primary),
      );
    }
  });
});
