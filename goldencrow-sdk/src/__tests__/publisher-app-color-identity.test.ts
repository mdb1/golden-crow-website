import { derivePublisherAppCounterpointColors, derivePublisherAppCounterpointPlan } from "../lib/publisher-app-color-identity.js";

// Fixed vectors are also the backoffice calculator's verified output. Keep the
// producer contract independent of sibling source files in SDK deployments.
const vectors = [
  ["#5A443C", ["#48475B", "#59424A", "#514456", "#544454"]],
  ["#D8C7C0", ["#CAC9D9", "#D8C6CB", "#D1C7D4", "#D3C6D2"]],
  ["#1D4ED8", ["#8425B9", "#006B82", "#A50086", "#006F6A"]],
  ["#66F246", ["#00EDDC", "#FFB9BD", "#62E2FF", "#FFB4DD"]],
  ["#FF5500", ["#8C83FF", "#F54CA1", "#C663F3", "#D55CE1"]],
  ["#808080", ["#808080", "#808080", "#808080", "#808080"]],
  ["#000000", ["#000000", "#000000", "#000000", "#000000"]],
  ["#FFFFFF", ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]],
] as const;

describe("publisher-app counterpoint producer parity", () => {
  it.each(vectors)("matches the backoffice perceptual-tone vector for %s", (primary, expected) => {
    expect(Object.values(derivePublisherAppCounterpointColors(primary))).toEqual(expected);
  });

  it.each([
    ["#66F246", [45, -125, 75, -155]],
    ["#FFFF00", [45, -85, 75, -115]],
    ["#FF5500", [-115, -45, -85, -75]],
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

function isOrange(value: string) {
  const [red, green, blue] = [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return false;
  const raw = maximum === red ? 60 * (((green - blue) / delta) % 6)
    : maximum === green ? 60 * ((blue - red) / delta + 2)
    : 60 * ((red - green) / delta + 4);
  const hue = (raw + 360) % 360;
  return hue >= 10 && hue <= 55;
}

describe("automatic counterpoint orange avoidance", () => {
  it.each([[95, 50], [75, 35], [30, 55], [35, 85]])(
    "avoids rendered orange across the hue wheel at saturation %s and lightness %s",
    (saturation, lightness) => {
      for (let hue = 0; hue < 360; hue += 5) {
        const primary = wheelColor(hue, saturation, lightness);
        const plan = derivePublisherAppCounterpointPlan(primary);
        expect(plan.colors).toEqual(derivePublisherAppCounterpointColors(primary));
        expect(new Set(Object.values(plan.offsets).map(degrees => ((degrees % 360) + 360) % 360)).size).toBe(4);
        for (const color of Object.values(plan.colors)) {
          expect({ primary, color, orange: isOrange(color!) }).toEqual({ primary, color, orange: false });
        }
      }
    },
  );
});
