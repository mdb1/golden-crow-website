export type PublisherAppPlatformOption = "ios" | "ios_android";
export type PublisherAppIconSource = "publisher" | "custom";
export type PublisherAppStatus =
  "pending_revision" | "approved" | "changes_requested" | "rejected";

export function publisherAppStatusLabel(status: PublisherAppStatus) {
  switch (status) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    case "rejected":
      return "Rejected";
    default:
      return "Pending revision";
  }
}

export type PublisherAppColors = {
  primary: string;
  secondary: string;
  tertiary: string;
};

export type PublisherAppConfigInput = {
  platformOption: PublisherAppPlatformOption;
  connectEnabled: boolean;
  profileEnabled: boolean;
  learnCustomizationEnabled: boolean;
  colors: PublisherAppColors;
  iconSource: PublisherAppIconSource;
  iconImageUrl: string | null;
  iconImageUploadDataUrl: string | null;
};

export type PublisherAppConfig = PublisherAppConfigInput & {
  id: string;
  publisherKind: "organization" | "individual";
  publisherId: string;
  publisherName: string;
  publisherEmail: string;
  publisherUsername: string;
  catalogEnabled: true;
  feedEnabled: true;
  status: PublisherAppStatus;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  updatedByUserId: string;
};

export type PublisherAppConfigResponse = {
  config: PublisherAppConfig | null;
};

export const DEFAULT_PUBLISHER_APP_COLOR = "#6D28D9";

export function normalizePublisherAppColor(value?: string) {
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

export function publisherAppPaletteSuggestions(
  tint?: string,
): PublisherAppColors[] {
  const source = normalizePublisherAppColor(tint) ?? DEFAULT_PUBLISHER_APP_COLOR;
  const { hue, saturation } = rgbToHsl(hexToRgb(source));
  const vividSaturation = Math.min(82, Math.max(72, saturation));

  return [
    {
      primary: hslToHex(hue, vividSaturation, 36),
      secondary: hslToHex(hue + 24, vividSaturation + 4, 55),
      tertiary: hslToHex(hue - 70, vividSaturation + 8, 56),
    },
    {
      primary: hslToHex(hue, vividSaturation, 40),
      secondary: hslToHex(hue + 155, vividSaturation + 2, 50),
      tertiary: hslToHex(hue + 190, vividSaturation + 8, 58),
    },
    {
      primary: hslToHex(hue + 8, vividSaturation - 7, 32),
      secondary: hslToHex(hue + 48, vividSaturation, 56),
      tertiary: hslToHex(hue - 38, vividSaturation + 6, 58),
    },
    {
      primary: hslToHex(hue, vividSaturation - 4, 22),
      secondary: hslToHex(hue + 20, vividSaturation + 2, 48),
      tertiary: hslToHex(hue + 170, vividSaturation + 6, 60),
    },
  ];
}

export function publisherAppDefaultColors(tint?: string): PublisherAppColors {
  return (
    publisherAppPaletteSuggestions(tint)[0] ?? {
      primary: "#4D1A9E",
      secondary: "#BF35E3",
      tertiary: "#35C0E9",
    }
  );
}
