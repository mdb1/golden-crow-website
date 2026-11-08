import { derivePublisherAppCounterpointColors, derivePublisherAppCounterpointPlan } from "../lib/publisher-app-color-identity.js";

// Fixed vectors are also the backoffice calculator's verified output. Keep the
// producer contract independent of sibling source files in SDK deployments.
const vectors = [
  ["#40FF00", ["#00FF7F", "#FFFF00", "#00FFFF", "#FF002B"]],
  ["#5A443C", ["#DFE212", "#E21277", "#77E212", "#E212DF"]],
  ["#D8C7C0", ["#E7EF39", "#EF398C", "#8CEF39", "#EF39E7"]],
  ["#1D4ED8", ["#7812E3", "#12E3E0", "#E012E3", "#12E378"]],
  ["#66F246", ["#37F1A0", "#E5F137", "#37E5F1", "#F1374A"]],
  ["#FF5500", ["#EAFF00", "#FF006A", "#6AFF00", "#FF00EA"]],
  ["#808080", ["#EC14CE", "#1462EC", "#EC1462", "#14CEEC"]],
  ["#000000", ["#E212C5", "#125DE2", "#E2125D", "#12C5E2"]],
  ["#FFFFFF", ["#EF39D5", "#397AEF", "#EF397A", "#39D5EF"]],
] as const;

describe("publisher-app counterpoint producer parity", () => {
  it.each(vectors)("matches the backoffice original vivid palette vector for %s", (primary, expected) => {
    expect(Object.values(derivePublisherAppCounterpointColors(primary))).toEqual(expected);
  });

  it.each([
    ["#40FF00", [45, -45, 75, -115]],
    ["#66F246", [45, -45, 75, -115]],
    ["#FFFF00", [45, -85, 75, -75]],
    ["#FF5500", [45, -45, 75, -75]],
  ] as const)("reports actual producer rotations for %s", (primary, expected) => {
    expect(Object.values(derivePublisherAppCounterpointPlan(primary).offsets)).toEqual(expected);
  });

  it("normalizes the same supported primary spelling as the backoffice", () => {
    expect(derivePublisherAppCounterpointColors(" 5a443c ")).toEqual(derivePublisherAppCounterpointColors("#5A443C"));
    expect(derivePublisherAppCounterpointColors("invalid")).toEqual(derivePublisherAppCounterpointColors("#6D28D9"));
  });
});

function wheelColor(hue: number, saturation: number, lightness: number) {
  const intensity = saturation / 100 * Math.min(lightness / 100, 1 - lightness / 100);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const value = lightness / 100 - intensity * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

function hslFromHex(value: string) {
  const [red, green, blue] = [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const raw = delta === 0 ? 0 : maximum === red ? 60 * (((green - blue) / delta) % 6)
    : maximum === green ? 60 * ((blue - red) / delta + 2)
    : 60 * ((red - green) / delta + 4);
  return {
    hue: raw < 0 ? raw + 360 : raw,
    saturation: delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) * 100,
    lightness: lightness * 100,
  };
}

function isOrange(value: string) {
  const { hue, saturation } = hslFromHex(value);
  return saturation > 0 && hue >= 10 && hue <= 55;
}

const ORIGINAL_OFFSETS = {
  counterpointClockwise: 45,
  counterpointAnticlockwise: -45,
  counterpointFarClockwise: 75,
  counterpointFarAnticlockwise: -75,
} as const;

// Frozen pre-regression HSL behavior. The orange fix must leave every other
// original counterpoint untouched, including its vivid saturation and shading.
function originalCounterpoints(primary: string) {
  const source = hslFromHex(primary);
  const hue = source.saturation < 1 ? hslFromHex("#6D28D9").hue : source.hue;
  const saturation = Math.max(85, source.saturation) / 100;
  const lightness = Math.min(58, Math.max(48, source.lightness)) / 100;
  return Object.fromEntries(Object.entries(ORIGINAL_OFFSETS).map(([key, degrees]) => {
    const section = (((hue + degrees) % 360 + 360) % 360) / 60;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const secondary = chroma * (1 - Math.abs(section % 2 - 1));
    const offset = lightness - chroma / 2;
    const channels = section < 1 ? [chroma, secondary, 0]
      : section < 2 ? [secondary, chroma, 0]
      : section < 3 ? [0, chroma, secondary]
      : section < 4 ? [0, secondary, chroma]
      : section < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    const color = "#" + channels.map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    return [key, color];
  })) as Record<keyof typeof ORIGINAL_OFFSETS, string>;
}

describe("automatic counterpoint orange avoidance", () => {
  it.each([[95, 50], [75, 35], [30, 55], [35, 85]])(
    "changes only original orange colors across the hue wheel at saturation %s and lightness %s",
    (saturation, lightness) => {
      for (let hue = 0; hue < 360; hue += 5) {
        const primary = wheelColor(hue, saturation, lightness);
        const original = originalCounterpoints(primary);
        const plan = derivePublisherAppCounterpointPlan(primary);
        expect(plan.colors).toEqual(derivePublisherAppCounterpointColors(primary));
        for (const key of Object.keys(ORIGINAL_OFFSETS) as Array<keyof typeof ORIGINAL_OFFSETS>) {
          const color = plan.colors[key];
          expect({ primary, key, color, orange: isOrange(color) }).toEqual({ primary, key, color, orange: false });
          const shift = plan.offsets[key] - ORIGINAL_OFFSETS[key];
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
          }
        }
      }
    },
  );
});
