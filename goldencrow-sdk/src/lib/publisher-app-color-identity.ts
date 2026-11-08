import type { PublisherAppConfigColors } from "../types/sdk.types.js";

const DEFAULT_PUBLISHER_APP_COLOR = "#6D28D9";

type CounterpointColors = Pick<
  PublisherAppConfigColors,
  | "counterpointClockwise"
  | "counterpointAnticlockwise"
  | "counterpointFarClockwise"
  | "counterpointFarAnticlockwise"
>;

function normalizePublisherAppColor(value?: string) {
  const trimmed = value?.trim() ?? "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash)
    ? withHash.toUpperCase()
    : undefined;
}

function hexToRgb(value: string) {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}


export function derivePublisherAppCounterpointColors(
  primary: string,
): CounterpointColors {
  const normalizedPrimary =
    normalizePublisherAppColor(primary) ?? DEFAULT_PUBLISHER_APP_COLOR;
  const source = hexToRgb(normalizedPrimary);
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const red = linear(source.red);
  const green = linear(source.green);
  const blue = linear(source.blue);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const axisA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const axisB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(axisA, axisB);
  const hue = Math.atan2(axisB, axisA);

  // A neutral identity has no accessory hue. Preserve it exactly rather than
  // inventing a bright fallback; chromatic identities keep their original tone.
  const rotate = (degrees: number) => {
    if (chroma < 0.000001) return normalizedPrimary;
    const angle = hue + degrees * Math.PI / 180;
    const toLinearRgb = (targetChroma: number) => {
      const a = targetChroma * Math.cos(angle);
      const b = targetChroma * Math.sin(angle);
      const lr = lightness + 0.3963377774 * a + 0.2158037573 * b;
      const mr = lightness - 0.1055613458 * a - 0.0638541728 * b;
      const sr = lightness - 0.0894841775 * a - 1.291485548 * b;
      const lc = lr ** 3;
      const mc = mr ** 3;
      const sc = sr ** 3;
      return [
        4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
        -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
        -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
      ];
    };
    const inGamut = (channels: number[]) =>
      channels.every((channel) => channel >= 0 && channel <= 1);
    let channels = toLinearRgb(chroma);
    if (!inGamut(channels)) {
      // Reduce only chroma at this hue; retaining perceptual lightness keeps
      // muted and dark brands muted and dark across all accessory colors.
      let minimum = 0;
      let maximum = chroma;
      channels = toLinearRgb(0);
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const candidateChroma = (minimum + maximum) / 2;
        const candidate = toLinearRgb(candidateChroma);
        if (inGamut(candidate)) {
          minimum = candidateChroma;
          channels = candidate;
        } else {
          maximum = candidateChroma;
        }
      }
    }
    const encoded = channels.map((channel) => 255 * (
      channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
    ));
    return rgbToHex(encoded[0]!, encoded[1]!, encoded[2]!);
  };
  return {
    counterpointClockwise: rotate(45),
    counterpointAnticlockwise: rotate(-45),
    counterpointFarClockwise: rotate(75),
    counterpointFarAnticlockwise: rotate(-75),
  };
}
