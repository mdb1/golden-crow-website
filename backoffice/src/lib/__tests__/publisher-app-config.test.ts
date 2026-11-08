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
      counterpointClockwise: "#EAFF00",
      counterpointAnticlockwise: "#FF006A",
      counterpointFarClockwise: "#6AFF00",
      counterpointFarAnticlockwise: "#FF00EA",
    });
  });

  it("derives vivid near and far counterpoints at forty-five and seventy-five degrees", () => {
    expect(publisherAppCounterpointColors("#FFFF00")).toEqual({
      counterpointClockwise: "#40FF00",
      counterpointAnticlockwise: "#FF4000",
      counterpointFarClockwise: "#00FF40",
      counterpointFarAnticlockwise: "#FF0040",
    });

    const primaryHue = hslFromHex("#FF5500").hue;
    const counterpoints = publisherAppCounterpointColors("#FF5500");
    expect(
      circularHueDistance(
        hslFromHex(counterpoints.counterpointClockwise).hue,
        primaryHue + 45,
      ),
    ).toBeLessThan(1);
    expect(
      circularHueDistance(
        hslFromHex(counterpoints.counterpointAnticlockwise).hue,
        primaryHue - 45,
      ),
    ).toBeLessThan(1);
    expect(
      circularHueDistance(
        hslFromHex(counterpoints.counterpointFarClockwise).hue,
        primaryHue + 75,
      ),
    ).toBeLessThan(1);
    expect(
      circularHueDistance(
        hslFromHex(counterpoints.counterpointFarAnticlockwise).hue,
        primaryHue - 75,
      ),
    ).toBeLessThan(1);
  });

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
