import {
  isCurrentPublisherAppIdentifier,
  isPublisherAppRuntimeEnabled,
  publisherAppStatusLabel,
  publisherAppCounterpointColors,
  publisherAppCounterpointPlan,
  publisherAppColorsWithCounterpoints,
  publisherAppDefaultColors,
  publisherAppPaletteSuggestions,
} from "@/lib/publisher-app-config";
import { legacyPublisherAppCounterpointColors } from "@/lib/publisher-app-legacy-palette-overrides";

const BASE_COLOR_KEYS = ["primary", "secondary", "tertiary"] as const;
const COUNTERPOINT_OFFSETS = {
  counterpointClockwise: 45,
  counterpointAnticlockwise: -45,
  counterpointFarClockwise: 75,
  counterpointFarAnticlockwise: -75,
} as const;

function wheelColor(hue: number, saturation: number, lightness: number) {
  const intensity = saturation / 100 * Math.min(lightness / 100, 1 - lightness / 100);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const value = lightness / 100 - intensity * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

function isOrange(value: string) {
  const color = hslFromHex(value);
  return color.saturation > 0 && color.hue >= 10 && color.hue <= 55;
}


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
      secondary: "#F4852A",
      tertiary: "#EFBA2A",
      ...publisherAppCounterpointColors("#FF5500"),
    });
  });

  it.each([
    ["#40FF00", ["#00FF7F", "#FFFF00", "#00FFFF", "#FF002B"]],
    ["#5A443C", ["#DFE212", "#E21277", "#77E212", "#E212DF"]],
    ["#D8C7C0", ["#E7EF39", "#EF398C", "#8CEF39", "#EF39E7"]],
    ["#1D4ED8", ["#7812E3", "#12E3E0", "#E012E3", "#12E378"]],
    ["#66F246", ["#37F1A0", "#E5F137", "#37E5F1", "#F1374A"]],
    ["#FF5500", ["#EAFF00", "#FF006A", "#6AFF00", "#FF00EA"]],
    ["#808080", ["#EC14CE", "#1462EC", "#EC1462", "#14CEEC"]],
    ["#000000", ["#E212C5", "#125DE2", "#E2125D", "#12C5E2"]],
    ["#FFFFFF", ["#EF39D5", "#397AEF", "#EF397A", "#39D5EF"]],
  ] as const)("restores the original vivid counterpoint style for %s", (primary, expected) => {
    expect(Object.values(publisherAppCounterpointColors(primary))).toEqual(expected);
  });

  it("keeps the usual angles when none of the counterpoints produces orange", () => {
    expect(publisherAppCounterpointPlan("#1D4ED8").offsets).toEqual(COUNTERPOINT_OFFSETS);
  });

  it("changes only the orange fourth color from the original screenshot", () => {
    const primary = "#40FF00";
    const original = legacyPublisherAppCounterpointColors(primary);
    expect(Object.values(original)).toEqual(["#00FF7F", "#FFFF00", "#00FFFF", "#FF7F00"]);
    const plan = publisherAppCounterpointPlan(primary);
    expect(plan.colors).toEqual({ ...original, counterpointFarAnticlockwise: "#FF002B" });
    expect(plan.offsets).toEqual({ ...COUNTERPOINT_OFFSETS, counterpointFarAnticlockwise: -115 });
  });

  it("does not move a non-orange far neighbor when the near counterpoint is orange", () => {
    const primary = "#FFFF00";
    const original = legacyPublisherAppCounterpointColors(primary);
    const plan = publisherAppCounterpointPlan(primary);
    expect(isOrange(original.counterpointAnticlockwise)).toBe(true);
    expect(plan.colors).toEqual({ ...original, counterpointAnticlockwise: "#FF006A" });
    expect(plan.offsets).toEqual({ ...COUNTERPOINT_OFFSETS, counterpointAnticlockwise: -85 });
  });

  it.each([
    [95, 50], [75, 35], [30, 55], [35, 85],
  ])("only shifts original orange counterpoints at saturation %s and lightness %s", (saturation, lightness) => {
    for (let hue = 0; hue < 360; hue += 5) {
      const primary = wheelColor(hue, saturation, lightness);
      const original = legacyPublisherAppCounterpointColors(primary);
      const plan = publisherAppCounterpointPlan(primary);
      expect(plan.colors).toEqual(publisherAppCounterpointColors(primary));
      for (const key of Object.keys(COUNTERPOINT_OFFSETS) as Array<keyof typeof COUNTERPOINT_OFFSETS>) {
        const color = plan.colors[key];
        const shift = plan.offsets[key] - COUNTERPOINT_OFFSETS[key];
        expect({ primary, key, color, orange: isOrange(color) }).toEqual({ primary, key, color, orange: false });
        if (!isOrange(original[key])) {
          expect({ primary, key, color }).toEqual({ primary, key, color: original[key] });
          expect(shift).toBe(0);
        } else {
          expect(shift).toBeLessThan(0);
          expect(shift).toBeGreaterThanOrEqual(-80);
          expect(Math.abs(shift) % 40).toBe(0);
          const originalTone = hslFromHex(original[key]);
          const adjustedTone = hslFromHex(color);
          expect(Math.abs(adjustedTone.saturation - originalTone.saturation)).toBeLessThan(0.5);
          expect(Math.abs(adjustedTone.lightness - originalTone.lightness)).toBeLessThan(0.5);
          expect(circularHueDistance(adjustedTone.hue, originalTone.hue + shift)).toBeLessThan(0.5);
        }
      }
    }
  });

  it("preserves explicitly selected orange counterpoints", () => {
    const colors = publisherAppColorsWithCounterpoints({
      primary: "#66F246", secondary: "#1D4ED8", tertiary: "#EC4899",
      counterpointClockwise: "#FF8800", counterpointFarAnticlockwise: "#FFA500",
    });
    expect(colors.counterpointClockwise).toBe("#FF8800");
    expect(colors.counterpointFarAnticlockwise).toBe("#FFA500");
  });

  it.each(["#000000", "#FFFFFF", "#808080", "#121212", "#F0F0F0"])(
    "restores the original vivid fallback palette for achromatic primary %s",
    (primary) => {
      expect(publisherAppCounterpointColors(primary)).toEqual(legacyPublisherAppCounterpointColors(primary));
      for (const value of Object.values(publisherAppCounterpointColors(primary))) {
        expect(hslFromHex(value).saturation).toBeGreaterThanOrEqual(84);
      }
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
