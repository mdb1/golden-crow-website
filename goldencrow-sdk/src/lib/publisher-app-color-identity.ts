import type { PublisherAppConfigColors } from "../types/sdk.types.js";

const DEFAULT_PUBLISHER_APP_COLOR = "#6D28D9";

type CounterpointColors = Required<Pick<
  PublisherAppConfigColors,
  | "counterpointClockwise"
  | "counterpointAnticlockwise"
  | "counterpointFarClockwise"
  | "counterpointFarAnticlockwise"
>>;

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

function rgbToHsl({ red, green, blue }: ReturnType<typeof hexToRgb>) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  let hue = 0;
  if (delta > 0) {
    if (maximum === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maximum === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation:
      delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    lightness: lightness * 100,
  };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = Math.min(100, Math.max(0, saturation)) / 100;
  const normalizedLightness = Math.min(100, Math.max(0, lightness)) / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const hueSection = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const offset = normalizedLightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  return rgbToHex(
    (red + offset) * 255,
    (green + offset) * 255,
    (blue + offset) * 255,
  );
}

export type PublisherAppCounterpointPlan = {
  colors: CounterpointColors;
  offsets: Record<keyof CounterpointColors, number>;
};

function calculatePublisherAppCounterpointPlan(
  primary: string,
  avoidOrange: boolean,
): PublisherAppCounterpointPlan {
  const normalizedPrimary =
    normalizePublisherAppColor(primary) ?? DEFAULT_PUBLISHER_APP_COLOR;
  const source = rgbToHsl(hexToRgb(normalizedPrimary));
  const fallback = rgbToHsl(hexToRgb(DEFAULT_PUBLISHER_APP_COLOR));
  const hue = source.saturation < 1 ? fallback.hue : source.hue;
  const saturation = Math.max(85, source.saturation);
  const lightness = Math.min(58, Math.max(48, source.lightness));
  const rotate = (degrees: number) => hslToHex(hue + degrees, saturation, lightness);
  const offsets: PublisherAppCounterpointPlan["offsets"] = {
    counterpointClockwise: 45,
    counterpointAnticlockwise: -45,
    counterpointFarClockwise: 75,
    counterpointFarAnticlockwise: -75,
  };
  const colors: CounterpointColors = {
    counterpointClockwise: rotate(45),
    counterpointAnticlockwise: rotate(-45),
    counterpointFarClockwise: rotate(75),
    counterpointFarAnticlockwise: rotate(-75),
  };
  if (avoidOrange) {
    for (const key of Object.keys(colors) as (keyof CounterpointColors)[]) {
      // Only the orange swatch moves; every other original color stays exact.
      for (let step = 0; step < 9; step += 1) {
        const renderedHue = rgbToHsl(hexToRgb(colors[key])).hue;
        if (renderedHue < 10 || renderedHue > 55) break;
        offsets[key] -= 40;
        colors[key] = rotate(offsets[key]);
      }
    }
  }
  return { colors, offsets };
}

export function derivePublisherAppCounterpointPlan(primary: string): PublisherAppCounterpointPlan {
  return calculatePublisherAppCounterpointPlan(primary, true);
}

export function derivePublisherAppCounterpointColors(primary: string): CounterpointColors {
  return derivePublisherAppCounterpointPlan(primary).colors;
}
