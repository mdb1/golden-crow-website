export type PublisherAppPlatformOption = "ios" | "ios_android";
export type PublisherAppIconSource = "publisher" | "custom";
export type PublisherAppStatus =
  "pending_revision" | "active" | "approved" | "changes_requested" | "rejected";

export function publisherAppStatusLabel(status: PublisherAppStatus) {
  switch (status) {
    case "active":
      return "Activa para pruebas";
    case "approved":
      return "Aprobada";
    case "changes_requested":
      return "Requiere ajustes";
    case "rejected":
      return "No aprobada";
    default:
      return "En revisión";
  }
}

export type PublisherAppColors = {
  primary: string;
  secondary: string;
  tertiary: string;
  counterpointClockwise: string;
  counterpointAnticlockwise: string;
};

export type PublisherAppBaseColors = Pick<
  PublisherAppColors,
  "primary" | "secondary" | "tertiary"
>;

export type PublisherAppCounterpointColors = Pick<
  PublisherAppColors,
  "counterpointClockwise" | "counterpointAnticlockwise"
>;

export type PublisherAppSemanticColors = {
  primary: string;
  primaryStrong: string;
  primaryDeep: string;
  primarySoft: string;
  secondary: string;
  accent: string;
  accentTextLight: string;
  accentTextDark: string;
  accentSurfaceLight: string;
};

export type PublisherAppColorOverride = {
  light?: string;
  dark?: string;
};

export type PublisherAppTextOverride = {
  key: string;
  en: string;
  es: string;
};

export type PublisherAppLearnLesson = {
  lessonIdentifier: string;
  lessonTitle: string;
  imageUrl: string | null;
  lessonColor: string;
  paragraphs: Array<{
    paragraphTitle: string;
    icon: string;
    contentText: string;
  }>;
  usefulLinks: string[];
  relatedLessons: string[];
};

export type PublisherAppLearnSubject = {
  subjectIdentifier: string;
  subjectTitle: string;
  chapters: Array<{
    chapterTitle: string;
    lessons: PublisherAppLearnLesson[];
  }>;
};

export type PublisherAppLearnConfiguration =
  | { mode: "base" }
  | {
      mode: "replace";
      curriculumId: string;
      curriculumRevision: number;
      defaultLanguage: string;
      subjects: PublisherAppLearnSubject[];
      topics: Record<string, string[]>;
    };

export type PublisherAppAdvancedConfiguration = {
  displayName: string;
  semanticColors: PublisherAppSemanticColors | null;
  colorOverrides: Record<string, PublisherAppColorOverride>;
  catalogEnabled: boolean;
  feedEnabled: boolean;
  discoverScope:
    { mode: "all" } | { mode: "organization"; publisherOrganizationId: string };
  serviceScope:
    | { mode: "all" }
    | {
        mode: "provider";
        providerId: string;
        providerKind: "organization" | "individual";
      };
  localization: {
    defaultLanguage: "en" | "es";
    availableLanguages: Array<"en" | "es">;
  };
  textOverrides: PublisherAppTextOverride[];
  learn: PublisherAppLearnConfiguration;
  links: {
    joinUs: { en: string; es: string };
    supportEmail: string;
    privacyUrl: string;
    termsUrl: string;
  };
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
  advancedConfiguration?: PublisherAppAdvancedConfiguration;
};

export type PublisherAppConfig = PublisherAppConfigInput & {
  id: string;
  publisherKind: "organization" | "individual";
  publisherId: string;
  publisherName: string;
  publisherEmail: string;
  publisherUsername: string;
  catalogEnabled: boolean;
  feedEnabled: boolean;
  status: PublisherAppStatus;
  appProviderIdentifier?: string;
  runtimeRevision?: number;
  activatedAt?: string;
  activatedByUserId?: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  updatedByUserId: string;
  termsVersion?: string;
  termsAcceptedAt?: string;
  termsAcceptedByUserId?: string;
};

export type PublisherAppRuntimeConfig = {
  schemaVersion: 3;
  appProviderIdentifier: string;
  revision: number;
  status: "published";
  baseContentVersion: "pg-core-v1";
  [key: string]: unknown;
};

export type PublisherAppTextCatalogOption = {
  key: string;
  defaultEnglishText: string;
  defaultSpanishText: string;
  groups: string[];
  platforms: Array<"ios" | "android">;
  formatArguments: string[];
};

export type PublisherAppColorCatalogOption = {
  key: string;
  title: string;
  usageDescription: string;
  defaultLightColor: string;
  defaultDarkColor: string;
  group: string;
  platforms: Array<"ios" | "android">;
  introducedInCatalogVersion?: number;
};

export type PublisherAppCustomizationCatalogPage<T> = {
  catalogVersion: number;
  items: T[];
  groups: string[];
  totalCount: number;
  nextCursor: string | null;
};

export type PublisherAppPaletteOverridePlan = {
  catalogVersion: number;
  sourceCount: number;
  selectedCount: number;
  colorOverrides: Record<string, PublisherAppColorOverride>;
};

export type PublisherAppConfigResponse = {
  config: PublisherAppConfig | null;
};

export type PublisherAppConfigsPage = {
  apps: PublisherAppConfig[];
  nextCursor: string | null;
};

export type PublisherAppCatalogSnapshotItem = {
  id: string;
  appProviderIdentifier: string | null;
  name: string;
  image: string | null;
  description: string;
  status: PublisherAppStatus;
  isActive: boolean;
  publisherKind: "organization" | "individual";
  publisherId: string;
};

export type PublisherAppCatalogSnapshot = {
  id: "simple";
  schemaVersion: 1;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  statusCounts: Array<{
    status: PublisherAppStatus;
    count: number;
  }>;
  apps: PublisherAppCatalogSnapshotItem[];
  sourceReadCount: number;
  updatedAt: string;
  updatedByUserId: string;
};

export type PublisherAppCatalogSnapshotResponse = {
  snapshot: PublisherAppCatalogSnapshot | null;
};

export function isCurrentPublisherAppIdentifier(
  value: string | undefined,
  publisherKind: "organization" | "individual",
) {
  const kind = publisherKind === "organization" ? "org" : "ind";
  return new RegExp(`^app_${kind}_[a-z0-9]+(?:_[a-z0-9]+){0,2}_[0-9]{5}$`).test(
    value ?? "",
  );
}

export const DEFAULT_PUBLISHER_APP_COLOR = "#6D28D9";

export function normalizePublisherAppColor(value?: string) {
  const trimmed = value?.trim() ?? "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash)
    ? withHash.toUpperCase()
    : undefined;
}

function mixPublisherAppHex(left: string, right: string, rightWeight: number) {
  const weight = Math.min(1, Math.max(0, rightWeight));
  const channel = (offset: number) => {
    const from = Number.parseInt(left.slice(offset, offset + 2), 16);
    const to = Number.parseInt(right.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * weight)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

export function publisherAppSemanticColors(
  colors: PublisherAppColors,
): PublisherAppSemanticColors {
  const primary = normalizePublisherAppColor(colors.primary) ?? "#6D28D9";
  const secondary = normalizePublisherAppColor(colors.secondary) ?? primary;
  const accent = normalizePublisherAppColor(colors.tertiary) ?? primary;
  return {
    primary,
    primaryStrong: mixPublisherAppHex(primary, "#000000", 0.12),
    primaryDeep: mixPublisherAppHex(primary, "#000000", 0.26),
    primarySoft: mixPublisherAppHex(primary, "#FFFFFF", 0.48),
    secondary,
    accent,
    accentTextLight: mixPublisherAppHex(accent, "#000000", 0.28),
    accentTextDark: mixPublisherAppHex(accent, "#FFFFFF", 0.38),
    accentSurfaceLight: mixPublisherAppHex(accent, "#FFFFFF", 0.9),
  };
}

export function publisherAppDefaultAdvancedConfiguration(identity: {
  name: string;
  kind: "organization" | "individual";
  id: string;
}): PublisherAppAdvancedConfiguration {
  return {
    displayName: identity.name,
    semanticColors: null,
    colorOverrides: {},
    catalogEnabled: true,
    feedEnabled: true,
    discoverScope:
      identity.kind === "organization"
        ? {
            mode: "organization",
            publisherOrganizationId: identity.id,
          }
        : { mode: "all" },
    serviceScope: {
      mode: "provider",
      providerId: identity.id,
      providerKind: identity.kind,
    },
    localization: {
      defaultLanguage: "es",
      availableLanguages: ["en", "es"],
    },
    textOverrides: [
      {
        key: "Only on Pocket Genes",
        en: `Only on ${identity.name}`,
        es: `Solo en ${identity.name}`,
      },
      {
        key: "Contact Pocket Genes",
        en: `Contact ${identity.name}`,
        es: `Contactá a ${identity.name}`,
      },
    ],
    learn: { mode: "base" },
    links: {
      joinUs: {
        en: "https://goldencrowvs.com/en/pocket-genes/join-us/",
        es: "https://goldencrowvs.com/pocket-genes/join-us/",
      },
      supportEmail: "support@goldencrowvs.com",
      privacyUrl: "https://goldencrowvs.com/privacy/",
      termsUrl: "https://goldencrowvs.com/terms/",
    },
  };
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

/**
 * Counterpoints are accessory colors on either side of the primary hue. They
 * deliberately stay out of the three-color core palette and are reserved for
 * exceptional multi-accent layouts that need more separation.
 */
export function publisherAppCounterpointColors(
  primary: string,
): PublisherAppCounterpointColors {
  const normalizedPrimary =
    normalizePublisherAppColor(primary) ?? DEFAULT_PUBLISHER_APP_COLOR;
  const source = rgbToHsl(hexToRgb(normalizedPrimary));
  const fallback = rgbToHsl(hexToRgb(DEFAULT_PUBLISHER_APP_COLOR));
  const hue = source.saturation < 1 ? fallback.hue : source.hue;
  const saturation = Math.max(85, source.saturation);
  const lightness = Math.min(58, Math.max(48, source.lightness));
  return {
    counterpointClockwise: hslToHex(hue + 60, saturation, lightness),
    counterpointAnticlockwise: hslToHex(hue - 60, saturation, lightness),
  };
}

export function publisherAppColorsWithCounterpoints(
  colors: PublisherAppBaseColors,
): PublisherAppColors {
  return {
    ...colors,
    ...publisherAppCounterpointColors(colors.primary),
  };
}

export function publisherAppPaletteSuggestions(
  tint?: string,
): PublisherAppColors[] {
  const source =
    normalizePublisherAppColor(tint) ?? DEFAULT_PUBLISHER_APP_COLOR;
  const sourceHsl = rgbToHsl(hexToRgb(source));
  const fallbackHue = rgbToHsl(hexToRgb(DEFAULT_PUBLISHER_APP_COLOR)).hue;
  // A nearly neutral color has no useful brand hue. Any perceptible tint,
  // including washed or brownish colors, keeps its hue but is rebuilt as a
  // bright saturated color instead of being reused as-is.
  const hue = sourceHsl.saturation < 1 ? fallbackHue : sourceHsl.hue;
  const basePalette = publisherAppColorsWithCounterpoints({
    primary: hslToHex(hue, 100, 50),
    secondary: hslToHex(hue + 24, 86, 55),
    tertiary: hslToHex(hue + 7, 90, 56),
  });

  return [
    basePalette,
    publisherAppColorsWithCounterpoints({
      primary: basePalette.primary,
      secondary: hslToHex(hue + 34, 92, 54),
      tertiary: basePalette.tertiary,
    }),
    publisherAppColorsWithCounterpoints({
      primary: basePalette.primary,
      secondary: basePalette.secondary,
      tertiary: hslToHex(hue - 12, 94, 55),
    }),
    publisherAppColorsWithCounterpoints({
      primary: hslToHex(hue + 10, 100, 50),
      secondary: basePalette.secondary,
      tertiary: basePalette.tertiary,
    }),
  ];
}

export function publisherAppDefaultColors(tint?: string): PublisherAppColors {
  return (
    publisherAppPaletteSuggestions(tint)[0] ??
    publisherAppColorsWithCounterpoints({
      primary: "#4D1A9E",
      secondary: "#BF35E3",
      tertiary: "#35C0E9",
    })
  );
}
