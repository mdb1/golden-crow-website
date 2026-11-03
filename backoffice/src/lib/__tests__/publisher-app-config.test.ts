import {
  isCurrentPublisherAppIdentifier,
  publisherAppDefaultColors,
  publisherAppPaletteSuggestions,
} from "@/lib/publisher-app-config";

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
      delta === 0
        ? 0
        : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
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
  it("matches the bright closely related Medicgen orange palette", () => {
    expect(publisherAppDefaultColors("#FF5500")).toEqual({
      primary: "#FF5500",
      secondary: "#EFBA2A",
      tertiary: "#F4852A",
    });
  });

  it.each(["#795548", "#F3E7DF", "#526D49"])(
    "turns dark, brownish, or washed tint %s into saturated neighboring hues",
    (source) => {
      const sourceHue = hslFromHex(source).hue;
      const suggestions = publisherAppPaletteSuggestions(source);

      for (const color of suggestions.flatMap((palette) =>
        Object.values(palette),
      )) {
        const generated = hslFromHex(color);
        expect(generated.saturation).toBeGreaterThanOrEqual(84);
        expect(generated.lightness).toBeGreaterThanOrEqual(49);
        expect(generated.lightness).toBeLessThanOrEqual(57);
        expect(circularHueDistance(generated.hue, sourceHue)).toBeLessThanOrEqual(
          35,
        );
      }
    },
  );

  it("changes exactly one color in each alternative palette", () => {
    const suggestions = publisherAppPaletteSuggestions("#526D49");
    const [base, ...alternatives] = suggestions;

    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]).toEqual(publisherAppDefaultColors("#526D49"));
    expect(new Set(suggestions.map((palette) => JSON.stringify(palette))).size).toBe(4);

    for (const palette of alternatives) {
      expect(
        (Object.keys(base!) as Array<keyof typeof base>).filter(
          (key) => base![key] !== palette[key],
        ),
      ).toHaveLength(1);
      expect(palette.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.secondary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.tertiary).toMatch(/^#[0-9A-F]{6}$/);
      expect(new Set(Object.values(palette)).size).toBe(3);
    }
  });
});
