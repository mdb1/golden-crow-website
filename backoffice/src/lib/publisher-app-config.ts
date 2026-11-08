export type PublisherAppPlatformOption = "ios" | "ios_android";
export type PublisherAppIconSource = "publisher" | "custom";
export type PublisherAppStatus =
  "pending_revision" | "active_for_testing" | "active" | "approved" | "changes_requested" | "rejected";

export function isPublisherAppRuntimeEnabled(status: PublisherAppStatus) {
  return status === "active" || status === "active_for_testing";
}

export function publisherAppStatusLabel(status: PublisherAppStatus) {
  switch (status) {
    case "active":
      return "Activa";
    case "active_for_testing":
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
  counterpointFarClockwise: string;
  counterpointFarAnticlockwise: string;
};

export type PublisherAppBaseColors = Pick<
  PublisherAppColors,
  "primary" | "secondary" | "tertiary"
>;

export type PublisherAppCounterpointColors = Pick<
  PublisherAppColors,
  | "counterpointClockwise"
  | "counterpointAnticlockwise"
  | "counterpointFarClockwise"
  | "counterpointFarAnticlockwise"
>;

export type PublisherAppAlternativeTonalFlow = {
  id: string;
  title: string;
  description: string;
  roleKeys: string[];
};

export type PublisherAppAlternativeTonalFlowCenter =
  | {
      kind: "counterpoint";
      key: keyof PublisherAppCounterpointColors;
    }
  | {
      kind: "fixed";
      color: string;
    };

export const PUBLISHER_APP_GENES_TONAL_CENTER = "#00A88A";

// Discovery metadata stays in the catalog; only the resulting exact role keys
// and light/dark values are persisted under branding.colorOverrides.
export const PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS = {
  rareCircles: {
    kind: "counterpoint",
    key: "counterpointAnticlockwise",
  },
  communityComposer: {
    kind: "counterpoint",
    key: "counterpointFarAnticlockwise",
  },
  communityGenes: {
    kind: "fixed",
    color: PUBLISHER_APP_GENES_TONAL_CENTER,
  },
  savedContent: {
    kind: "counterpoint",
    key: "counterpointClockwise",
  },
} as const satisfies Record<
  string,
  PublisherAppAlternativeTonalFlowCenter
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
  /** Last automatic result, used only by the editor to preserve manual changes. */
  generatedColorOverrides?: Record<string, PublisherAppColorOverride>;
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
  defaultLightOpacity?: number;
  defaultDarkOpacity?: number;
  defaultNotes?: string;
  platformDefaultColors?: Partial<
    Record<"ios" | "android", { light?: string; dark?: string }>
  >;
  group: string;
  platforms: Array<"ios" | "android">;
  introducedInCatalogVersion?: number;
};

export type PublisherAppColorContrastPair = {
  foregroundKey: string;
  backgroundKeys: string[];
  minimumRatio: number;
};

export type PublisherAppCustomizationCatalogPage<T> = {
  catalogVersion: number;
  items: T[];
  groups: string[];
  totalCount: number;
  nextCursor: string | null;
  alternativeTonalFlows?: PublisherAppAlternativeTonalFlow[];
  contrastPairs?: PublisherAppColorContrastPair[];
};

export type PublisherAppPaletteOverridePlan = {
  catalogVersion: number;
  sourceCount: number;
  selectedCount: number;
  colorOverrides: Record<string, PublisherAppColorOverride>;
  /** Pure automatic result before applying retained manual color edits. */
  generatedColorOverrides?: Record<string, PublisherAppColorOverride>;
};

export type PublisherAppConfigResponse = {
  config: PublisherAppConfig | null;
};

export type OrganizationPublisherAppCreationData = PublisherAppConfigResponse & {
  publisherKind: "organization";
  publisherId: string;
  publisherName: string;
  publisherTint?: string;
  publisherImageUrl?: string;
  publisherEmail: string;
  publisherUsername: string;
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
 * Counterpoints are accessory colors on either side of the primary hue. The
 * usual near/far offsets are 45/75 degrees. The resolved plan supplies the
 * actual offsets after accessory-hue adjustments. They remain
 * outside the three-color runtime palette: the backoffice uses them as centers
 * for coordinated colorOverrides and exceptional multi-accent layouts.
 */
export type PublisherAppCounterpointPlan = {
  colors: PublisherAppCounterpointColors;
  offsets: Record<keyof PublisherAppCounterpointColors, number>;
};

function calculatePublisherAppCounterpointPlan(
  primary: string,
  avoidOrange: boolean,
): PublisherAppCounterpointPlan {
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
    return rgbToHex(encoded[0], encoded[1], encoded[2]);
  };
  const offsets: PublisherAppCounterpointPlan["offsets"] = {
    counterpointClockwise: 45,
    counterpointAnticlockwise: -45,
    counterpointFarClockwise: 75,
    counterpointFarAnticlockwise: -75,
  };
  const colors: PublisherAppCounterpointColors = {
    counterpointClockwise: rotate(45),
    counterpointAnticlockwise: rotate(-45),
    counterpointFarClockwise: rotate(75),
    counterpointFarAnticlockwise: rotate(-75),
  };
  if (avoidOrange && chroma >= 0.000001) {
    const isOrange = (value: string) => {
      const rgb = hexToRgb(value);
      const maximum = Math.max(rgb.red, rgb.green, rgb.blue);
      const minimum = Math.min(rgb.red, rgb.green, rgb.blue);
      const delta = maximum - minimum;
      if (delta === 0) return false;
      const rawHue = maximum === rgb.red
        ? 60 * (((rgb.green - rgb.blue) / delta) % 6)
        : maximum === rgb.green
          ? 60 * ((rgb.blue - rgb.red) / delta + 2)
          : 60 * ((rgb.red - rgb.green) / delta + 4);
      const renderedHue = (rawHue + 360) % 360;
      return renderedHue >= 10 && renderedHue <= 55;
    };
    const sides = [
      ["counterpointClockwise", "counterpointFarClockwise"],
      ["counterpointAnticlockwise", "counterpointFarAnticlockwise"],
    ] as const;
    const affected = sides.map(keys => keys.some(key => isOrange(colors[key])));
    const normalizedAngle = (degrees: number) => ((degrees % 360) + 360) % 360;
    const used = new Set<number>();
    sides.forEach((keys, index) => {
      if (!affected[index]) keys.forEach(key => used.add(normalizedAngle(offsets[key])));
    });
    sides.forEach((keys, index) => {
      if (!affected[index]) return;
      const initial = keys.map(key => offsets[key]);
      // Move a side together in fixed steps toward reds/pinks. Test the final
      // rendered RGB, since gamut mapping can move a boundary shade into orange.
      for (let step = 1; step <= 9; step += 1) {
        const nextOffsets = initial.map(degrees => degrees - 40 * step);
        const nextColors = nextOffsets.map(rotate);
        if (nextColors.some(isOrange) || nextOffsets.some(degrees => used.has(normalizedAngle(degrees)))) continue;
        keys.forEach((key, slot) => {
          offsets[key] = nextOffsets[slot]!;
          colors[key] = nextColors[slot]!;
          used.add(normalizedAngle(offsets[key]));
        });
        return;
      }
      throw new Error("No pudimos calcular los contrapuntos de esta paleta.");
    });
  }
  return { colors, offsets };
}

export function publisherAppCounterpointPlan(primary: string): PublisherAppCounterpointPlan {
  return calculatePublisherAppCounterpointPlan(primary, true);
}

export function publisherAppCounterpointColors(primary: string): PublisherAppCounterpointColors {
  return publisherAppCounterpointPlan(primary).colors;
}

/** Historical automatic values are recognized without treating them as manual edits. */
export function publisherAppPreviousCounterpointColors(primary: string): PublisherAppCounterpointColors {
  return calculatePublisherAppCounterpointPlan(primary, false).colors;
}

export function publisherAppColorsWithCounterpoints(
  colors: PublisherAppBaseColors & Partial<PublisherAppCounterpointColors>,
): PublisherAppColors {
  const automatic = publisherAppCounterpointColors(colors.primary);
  return {
    ...colors,
    counterpointClockwise: colors.counterpointClockwise ?? automatic.counterpointClockwise,
    counterpointAnticlockwise: colors.counterpointAnticlockwise ?? automatic.counterpointAnticlockwise,
    counterpointFarClockwise: colors.counterpointFarClockwise ?? automatic.counterpointFarClockwise,
    counterpointFarAnticlockwise: colors.counterpointFarAnticlockwise ?? automatic.counterpointFarAnticlockwise,
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
