import type {
  PublisherAppAlternativeTonalFlowCenter,
  PublisherAppAlternativeTonalFlow,
  PublisherAppColorCatalogOption,
  PublisherAppColorOverride,
  PublisherAppColors,
  PublisherAppCounterpointColors,
  PublisherAppPaletteOverridePlan,
} from "@/lib/publisher-app-config";
import {
  normalizePublisherAppColor,
  PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS,
} from "@/lib/publisher-app-config";

type RgbColor = {
  red: number;
  green: number;
  blue: number;
  alpha: string;
};

type OklchColor = {
  lightness: number;
  chroma: number;
  hue: number;
};

type PaletteRolePolicy =
  | "preserve"
  | "primary"
  | "vividPrimary"
  | "vividPrimaryGradientEnd"
  | "learnBackground"
  | "learnTabPrimary"
  | "centerTabWashedPrimary"
  | "secondary"
  | "tertiary"
  | "counterpointClockwise"
  | "counterpointAnticlockwise"
  | "alternativeTonalFlow"
  | "analogous";

type AlternativeTonalFlowPalette = {
  anchorKey: string;
  centerHex: string;
  centerHue: number;
  fixedTargetChroma?: number;
  sourceHue: number;
};

type ThemePalette = {
  seedHex: [string, string, string];
  vividPrimaryHex: string;
  centerHue: number;
  sourceBrandHue: number;
  baseChroma: number;
  counterpointClockwiseHex: string;
  counterpointAnticlockwiseHex: string;
  counterpointClockwiseHue: number;
  counterpointAnticlockwiseHue: number;
  alternativeTonalFlowByRoleKey: Map<string, AlternativeTonalFlowPalette>;
};

type PaletteCandidate = {
  option: PublisherAppColorCatalogOption;
  override: PublisherAppColorOverride;
};

type ColorAppearance = "light" | "dark";

type LearnBackgroundTone = {
  lightness: number;
  chroma: number;
};

/*
 * Automatic palette treaty
 * -------------------------
 * 1. Neutrals and semantic statuses are contracts, not branding opportunities.
 *    Black, white, gray and quiet near-neutral colors remain exactly as supplied
 *    by the base catalog.
 * 2. Each light/dark appearance is evaluated independently, so a neutral mode
 *    stays untouched even when the other appearance of the same role is themed.
 * 3. Deep dark-mode backgrounds, canvases and surfaces are environmental
 *    foundations, not brand accents. Their original navy, charcoal or other
 *    night hue is preserved exactly so layered content keeps depth and contrast.
 *    Glows, orbs and highlights above them remain eligible for theming.
 * 4. Brand seeds map to the three colors selected by the operator.
 *    Learn level 1 is anchored to the primary seed; a muted or dark primary is
 *    lifted along the same hue into a vivid, readable level accent. Bacteria's
 *    gradient end stays within 15 degrees of that accent and creates depth by
 *    darkening it, never by borrowing an accessory or counterpoint hue.
 * 5. The selected central Discover tab stays tied to the primary brand hue,
 *    but uses an intentionally very light, low-chroma gradient. Its start is
 *    the slightly stronger washed tint used by the glow; its end is quieter
 *    and closer to white. It never borrows a counterpoint hue.
 * 6. Counterpoints are accessory hues, not new defaults. They are used only
 *    where a compact multi-accent layout genuinely benefits from extra
 *    identities, such as the four-tile Connect quick-access row and selected
 *    Learn atmospheric effects. General navigation, surfaces, text and
 *    semantic states never inherit them.
 * 7. Alternative tonal flows retain internal hue, lightness and alpha
 *    differences around their local center. Rare Circles, Community Composer
 *    and Saved Content use sparse counterpoint centers. Genes is the deliberate
 *    exception: its center and chroma remain fixed in a saturated aqua-green
 *    circuit family, independent of every app palette. Neutral foregrounds,
 *    semantic states and deep dark-mode foundations remain untouched in every
 *    flow.
 * 8. Every other chromatic role keeps its perceptual lightness and its original
 *    hue relationship. The source hue wheel is compressed into a broad
 *    analogous family instead of being collapsed onto three near-identical
 *    anchors.
 * 9. There is no target count or quota. Every branding-susceptible chromatic
 *    role is transformed; every unchanged or protected role is omitted.
 */

const SEMANTIC_STATUS_PATTERN =
  /\b(error|success|warning|failure|failed|rejected|cancelled|canceled|destructive|danger|requested|received|validating|accepted|queued|running|awaiting|delivered|status|unsupported|unavailable|disabled)\b/i;

const DIRECT_ROLE_POLICY: Record<string, PaletteRolePolicy> = {
  "brand.primary": "primary",
  "learn.level.bacteria.accent": "vividPrimary",
  "learn.level.bacteria.gradientEnd": "vividPrimaryGradientEnd",
  "tabs.learn.start": "learnTabPrimary",
  "tabs.learn.end": "learnTabPrimary",
  "tabs.discover.start": "centerTabWashedPrimary",
  "tabs.discover.end": "centerTabWashedPrimary",
  "brand.secondary": "secondary",
  "brand.accent": "tertiary",
  "android.material.primary": "primary",
  "android.material.secondary": "secondary",
  "android.material.tertiary": "tertiary",
};

const ACCESSORY_COUNTERPOINT_POLICY: Array<{
  pattern: RegExp;
  policy: PaletteRolePolicy;
}> = [
  {
    pattern: /^community\.quickActions\.circles\.(?:start|middle|end|bezel)$/,
    policy: "counterpointClockwise",
  },
  {
    pattern: /^community\.quickActions\.search\.(?:start|middle|end|bezel)$/,
    policy: "counterpointAnticlockwise",
  },
];

// Seven related hues give an orange identity red-orange, orange, amber,
// yellow and lime-yellow expressions without drifting into pink or turning
// every role into the exact same orange.
const ANALOGOUS_HUE_OFFSETS = [-22, -12, 0, 14, 30, 48, 68] as const;
const SOURCE_HUE_COMPRESSION = 0.44;
const ACHROMATIC_CHROMA = 0.012;
const QUIET_NEUTRAL_CHROMA = 0.04;
const VIVID_PRIMARY_MIN_CHROMA = 0.19;
const VIVID_PRIMARY_READY_CHROMA = 0.12;
const VIVID_PRIMARY_MIN_LIGHTNESS = 0.72;
const VIVID_PRIMARY_MAX_LIGHTNESS = 0.86;
const VIVID_PRIMARY_READY_LIGHTNESS = 0.55;
const BACTERIA_GRADIENT_HUE_OFFSET = 6;
const BACTERIA_GRADIENT_LIGHTNESS_DELTA = 0.1;
const BACTERIA_GRADIENT_MIN_LIGHTNESS = 0.45;
const BACTERIA_GRADIENT_MAX_LIGHTNESS = 0.78;
const BACTERIA_GRADIENT_MIN_CHROMA = 0.18;
const CENTER_TAB_WASHED_PRIMARY_TONES: Record<
  "tabs.discover.start" | "tabs.discover.end",
  LearnBackgroundTone
> = {
  "tabs.discover.start": { lightness: 0.91, chroma: 0.075 },
  "tabs.discover.end": { lightness: 0.95, chroma: 0.045 },
};
const DEEP_DARK_STRUCTURE_MAX_LIGHTNESS = 0.4;

const DEEP_STRUCTURE_ROLE_PATTERN =
  /\b(background|surface|canvas|backdrop|scrim|veil|fill)\b/i;
const DEEP_ATMOSPHERIC_EFFECT_PATTERN =
  /\b(accent|glow|orb|halo|highlight|ribbon|particle|star|sheen|border|outline|text|ink|icon)\b/i;
const DEEP_BACKGROUND_GRADIENT_PATTERN =
  /\bgradient\s*(top|middle|bottom|fade|stop\s*\d*)\b/i;
const ALTERNATIVE_FLOW_HUE_COMPRESSION = 0.07;
const ALTERNATIVE_FLOW_MAX_HUE_DISTANCE = 6;

const ALTERNATIVE_TONAL_FLOW_ANCHOR_KEYS = {
  rareCircles: "scientific.rhizoPinkBase",
  communityComposer: "community.newPost.headerAccent",
  communityGenes: "community.genes.primary",
  savedContent: "savedContent.headerStart",
} as const;

const LEARN_BACKGROUND_SECONDARY_TONES: Record<
  string,
  Partial<Record<ColorAppearance, LearnBackgroundTone>>
> = {
  "app.learnBackground": {
    light: { lightness: 0.955, chroma: 0.04 },
  },
  "learn.background.stop1": {
    light: { lightness: 0.985, chroma: 0.012 },
  },
  "learn.background.stop2": {
    light: { lightness: 0.96, chroma: 0.035 },
  },
  "learn.background.stop3": {
    light: { lightness: 0.925, chroma: 0.06 },
  },
  "learn.background.stop4": {
    light: { lightness: 0.975, chroma: 0.02 },
  },
  "learn.background.trailingGlow": {
    light: { lightness: 0.84, chroma: 0.12 },
    dark: { lightness: 0.78, chroma: 0.17 },
  },
  "learn.background.trailingGlowEdge": {
    light: { lightness: 0.78, chroma: 0.14 },
    dark: { lightness: 0.68, chroma: 0.15 },
  },
  "learn.background.trailingOrb": {
    light: { lightness: 0.88, chroma: 0.1 },
    dark: { lightness: 0.76, chroma: 0.16 },
  },
};

const LEARN_BACKGROUND_CLOCKWISE_EFFECT_KEYS = new Set([
  "learn.background.leadingGlow",
  "learn.background.leadingGlowEdge",
  "learn.background.leadingOrb",
  "learn.background.sheenEnd",
]);

const LEARN_DARK_NIGHT_FOUNDATION_KEYS = new Set([
  "app.learnBackground",
  "learn.background.stop1",
  "learn.background.stop2",
  "learn.background.stop3",
  "learn.background.stop4",
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function signedHueDifference(hue: number, reference: number) {
  return ((hue - reference + 540) % 360) - 180;
}

function parseColor(value: string): RgbColor {
  const match = /^#([\dA-F]{6})([\dA-F]{2})?$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid catalog color: ${value}`);
  }
  return {
    red: Number.parseInt(match[1].slice(0, 2), 16) / 255,
    green: Number.parseInt(match[1].slice(2, 4), 16) / 255,
    blue: Number.parseInt(match[1].slice(4, 6), 16) / 255,
    alpha: match[2]?.toUpperCase() ?? "",
  };
}

function normalizedCatalogColor(value: string) {
  const parsed = parseColor(value);
  const channel = (channelValue: number) =>
    Math.round(channelValue * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(parsed.red)}${channel(parsed.green)}${channel(parsed.blue)}${parsed.alpha}`;
}

function srgbToLinear(value: number) {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number) {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function rgbToOklch(color: RgbColor): OklchColor {
  const red = srgbToLinear(color.red);
  const green = srgbToLinear(color.green);
  const blue = srgbToLinear(color.blue);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness =
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const axisA =
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const axisB =
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.sqrt(axisA * axisA + axisB * axisB);
  return {
    lightness,
    chroma,
    hue:
      chroma < 0.000001
        ? 0
        : normalizeHue((Math.atan2(axisB, axisA) * 180) / Math.PI),
  };
}

function rawOklchToRgb(color: OklchColor): Omit<RgbColor, "alpha"> {
  const hueRadians = (normalizeHue(color.hue) * Math.PI) / 180;
  const axisA = color.chroma * Math.cos(hueRadians);
  const axisB = color.chroma * Math.sin(hueRadians);
  const lRoot = color.lightness + 0.3963377774 * axisA + 0.2158037573 * axisB;
  const mRoot = color.lightness - 0.1055613458 * axisA - 0.0638541728 * axisB;
  const sRoot = color.lightness - 0.0894841775 * axisA - 1.291485548 * axisB;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;
  return {
    red: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: linearToSrgb(
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    ),
    blue: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function rgbIsInGamut(color: Omit<RgbColor, "alpha">) {
  return [color.red, color.green, color.blue].every(
    (channel) => channel >= 0 && channel <= 1,
  );
}

function gamutMappedRgb(color: OklchColor) {
  const direct = rawOklchToRgb(color);
  if (rgbIsInGamut(direct)) return direct;

  let minimumChroma = 0;
  let maximumChroma = Math.max(0, color.chroma);
  let best = rawOklchToRgb({ ...color, chroma: 0 });
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const chroma = (minimumChroma + maximumChroma) / 2;
    const candidate = rawOklchToRgb({ ...color, chroma });
    if (rgbIsInGamut(candidate)) {
      minimumChroma = chroma;
      best = candidate;
    } else {
      maximumChroma = chroma;
    }
  }
  return best;
}

function oklchToHex(color: OklchColor, alpha: string) {
  const rgb = gamutMappedRgb(color);
  const channel = (value: number) =>
    Math.round(clamp(value, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(rgb.red)}${channel(rgb.green)}${channel(rgb.blue)}${alpha}`;
}

function optionSearchText(option: PublisherAppColorCatalogOption) {
  return `${option.key} ${option.title} ${option.usageDescription} ${option.group}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._/-]+/g, " ");
}

function optionIdentityText(option: PublisherAppColorCatalogOption) {
  return `${option.key} ${option.title}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._/-]+/g, " ");
}

function optionColors(option: PublisherAppColorCatalogOption) {
  return [option.defaultLightColor, option.defaultDarkColor].map((value) =>
    rgbToOklch(parseColor(value)),
  );
}

function shouldPreserveOption(option: PublisherAppColorCatalogOption) {
  const text = optionSearchText(option);
  if (
    option.group === "General feedback" ||
    option.group === "Service request status" ||
    SEMANTIC_STATUS_PATTERN.test(text)
  ) {
    return true;
  }

  const colors = optionColors(option);
  return colors.every((color) => color.chroma <= QUIET_NEUTRAL_CHROMA);
}

function isDeepDarkStructure(
  option: PublisherAppColorCatalogOption,
  color: OklchColor,
  appearance: ColorAppearance,
) {
  if (
    appearance !== "dark" ||
    color.lightness > DEEP_DARK_STRUCTURE_MAX_LIGHTNESS
  ) {
    return false;
  }

  const identity = optionIdentityText(option);
  if (DEEP_ATMOSPHERIC_EFFECT_PATTERN.test(identity)) return false;
  if (DEEP_STRUCTURE_ROLE_PATTERN.test(identity)) return true;

  return (
    option.group === "Screen surfaces and atmosphere" &&
    DEEP_BACKGROUND_GRADIENT_PATTERN.test(identity) &&
    /\b(background|canvas|backdrop|atmosphere)\b/i.test(option.usageDescription)
  );
}

function alternativeTonalFlowCenter(
  id: string,
  counterpoints: PublisherAppCounterpointColors,
) {
  const definition = (
    PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS as Record<
      string,
      PublisherAppAlternativeTonalFlowCenter
    >
  )[id];
  if (!definition) return undefined;
  const centerHex = normalizePublisherAppColor(
    definition.kind === "fixed"
      ? definition.color
      : counterpoints[definition.key],
  );
  if (!centerHex) {
    throw new Error(`Alternative tonal flow ${id} has an invalid center.`);
  }
  return {
    centerHex,
    fixed: definition.kind === "fixed",
  };
}

function buildAlternativeTonalFlowRoleMap(
  flows: PublisherAppAlternativeTonalFlow[],
  options: PublisherAppColorCatalogOption[],
  counterpoints: PublisherAppCounterpointColors,
) {
  const optionByKey = new Map(options.map((option) => [option.key, option]));
  const roleMap = new Map<string, AlternativeTonalFlowPalette>();

  for (const flow of flows) {
    const center = alternativeTonalFlowCenter(flow.id, counterpoints);
    const anchorKey =
      ALTERNATIVE_TONAL_FLOW_ANCHOR_KEYS[
        flow.id as keyof typeof ALTERNATIVE_TONAL_FLOW_ANCHOR_KEYS
      ];
    if (!center || !anchorKey) continue;
    const anchor = optionByKey.get(anchorKey);
    if (!anchor || !flow.roleKeys.includes(anchorKey)) {
      throw new Error(
        `Alternative tonal flow ${flow.id} is missing its anchor ${anchorKey}.`,
      );
    }
    const sourceAnchor = rgbToOklch(parseColor(anchor.defaultLightColor));
    if (sourceAnchor.chroma <= ACHROMATIC_CHROMA) {
      throw new Error(
        `Alternative tonal flow ${flow.id} needs a chromatic anchor.`,
      );
    }
    const centerColor = rgbToOklch(parseColor(center.centerHex));
    const flowPalette: AlternativeTonalFlowPalette = {
      anchorKey,
      centerHex: center.centerHex,
      centerHue: centerColor.hue,
      fixedTargetChroma: center.fixed ? centerColor.chroma : undefined,
      sourceHue: sourceAnchor.hue,
    };

    for (const roleKey of flow.roleKeys) {
      if (!optionByKey.has(roleKey)) {
        throw new Error(
          `Alternative tonal flow ${flow.id} references unknown role ${roleKey}.`,
        );
      }
      if (roleMap.has(roleKey)) {
        throw new Error(
          `Alternative tonal flow role ${roleKey} belongs to multiple flows.`,
        );
      }
      roleMap.set(roleKey, flowPalette);
    }
  }

  return roleMap;
}

function rolePolicy(
  option: PublisherAppColorCatalogOption,
  palette: ThemePalette,
): PaletteRolePolicy {
  const directPolicy = DIRECT_ROLE_POLICY[option.key];
  if (directPolicy) return directPolicy;
  if (
    option.key === "app.learnBackground" ||
    option.group === "Learn background"
  ) {
    return "learnBackground";
  }
  if (shouldPreserveOption(option)) return "preserve";
  if (palette.alternativeTonalFlowByRoleKey.has(option.key)) {
    return "alternativeTonalFlow";
  }
  const accessoryPolicy = ACCESSORY_COUNTERPOINT_POLICY.find(({ pattern }) =>
    pattern.test(option.key),
  );
  if (accessoryPolicy) return accessoryPolicy.policy;
  return "analogous";
}

function normalizedPalette(colors: PublisherAppColors) {
  return ([colors.primary, colors.secondary, colors.tertiary] as const).map(
    (value) => {
      const normalized = normalizePublisherAppColor(value);
      if (!normalized) throw new Error(`Invalid palette color: ${value}`);
      return normalized;
    },
  ) as [string, string, string];
}

function vividPrimaryColor(
  primaryHex: string,
  primary: OklchColor,
  chromaticFallback: OklchColor,
) {
  if (
    primary.chroma >= VIVID_PRIMARY_READY_CHROMA &&
    primary.lightness >= VIVID_PRIMARY_READY_LIGHTNESS
  ) {
    return primaryHex;
  }

  const hueSource =
    primary.chroma > ACHROMATIC_CHROMA ? primary : chromaticFallback;
  return oklchToHex(
    {
      lightness: clamp(
        primary.lightness,
        VIVID_PRIMARY_MIN_LIGHTNESS,
        VIVID_PRIMARY_MAX_LIGHTNESS,
      ),
      chroma: clamp(
        Math.max(primary.chroma * 1.2, VIVID_PRIMARY_MIN_CHROMA),
        VIVID_PRIMARY_MIN_CHROMA,
        0.3,
      ),
      hue: hueSource.hue,
    },
    "",
  );
}

function vividPrimaryGradientEndColor(palette: ThemePalette, alpha: string) {
  const accent = rgbToOklch(parseColor(palette.vividPrimaryHex));
  return oklchToHex(
    {
      lightness: clamp(
        accent.lightness - BACTERIA_GRADIENT_LIGHTNESS_DELTA,
        BACTERIA_GRADIENT_MIN_LIGHTNESS,
        BACTERIA_GRADIENT_MAX_LIGHTNESS,
      ),
      chroma: clamp(
        Math.max(accent.chroma * 0.94, BACTERIA_GRADIENT_MIN_CHROMA),
        BACTERIA_GRADIENT_MIN_CHROMA,
        0.3,
      ),
      hue: normalizeHue(accent.hue + BACTERIA_GRADIENT_HUE_OFFSET),
    },
    alpha,
  );
}

function washedPrimaryCenterTabColor(
  palette: ThemePalette,
  option: PublisherAppColorCatalogOption,
  alpha: string,
) {
  const tone =
    CENTER_TAB_WASHED_PRIMARY_TONES[
      option.key as keyof typeof CENTER_TAB_WASHED_PRIMARY_TONES
    ];
  if (!tone) {
    throw new Error(`Missing washed central-tab tone for ${option.key}.`);
  }
  return oklchToHex(
    {
      lightness: tone.lightness,
      chroma: tone.chroma,
      hue: palette.centerHue,
    },
    alpha,
  );
}

function learnBackgroundColor(
  originalValue: string,
  palette: ThemePalette,
  option: PublisherAppColorCatalogOption,
  appearance: ColorAppearance,
) {
  const normalizedOriginal = normalizedCatalogColor(originalValue);
  const alpha = parseColor(normalizedOriginal).alpha;
  if (
    appearance === "dark" &&
    LEARN_DARK_NIGHT_FOUNDATION_KEYS.has(option.key)
  ) {
    return normalizedOriginal;
  }
  if (LEARN_BACKGROUND_CLOCKWISE_EFFECT_KEYS.has(option.key)) {
    return `${palette.counterpointClockwiseHex}${alpha}`;
  }

  const tone = LEARN_BACKGROUND_SECONDARY_TONES[option.key]?.[appearance];
  if (!tone) return normalizedOriginal;
  const secondary = rgbToOklch(parseColor(palette.seedHex[1]));
  return oklchToHex(
    {
      lightness: tone.lightness,
      chroma: tone.chroma,
      hue:
        secondary.chroma > ACHROMATIC_CHROMA
          ? secondary.hue
          : palette.centerHue,
    },
    alpha,
  );
}

function buildThemePalette(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[],
): ThemePalette {
  const seedHex = normalizedPalette(colors);
  const counterpointClockwise = normalizePublisherAppColor(
    colors.counterpointClockwise,
  );
  const counterpointAnticlockwise = normalizePublisherAppColor(
    colors.counterpointAnticlockwise,
  );
  const counterpointFarClockwise = normalizePublisherAppColor(
    colors.counterpointFarClockwise,
  );
  const counterpointFarAnticlockwise = normalizePublisherAppColor(
    colors.counterpointFarAnticlockwise,
  );
  if (
    !counterpointClockwise ||
    !counterpointAnticlockwise ||
    !counterpointFarClockwise ||
    !counterpointFarAnticlockwise
  ) {
    throw new Error("The selected palette has invalid counterpoint colors.");
  }
  const counterpoints: PublisherAppCounterpointColors = {
    counterpointClockwise,
    counterpointAnticlockwise,
    counterpointFarClockwise,
    counterpointFarAnticlockwise,
  };
  const seeds = seedHex.map((value) => rgbToOklch(parseColor(value))) as [
    OklchColor,
    OklchColor,
    OklchColor,
  ];
  const chromaticSeeds = seeds.filter(
    (color) => color.chroma > ACHROMATIC_CHROMA,
  );
  const primarySeed =
    seeds[0].chroma > ACHROMATIC_CHROMA ? seeds[0] : chromaticSeeds[0];
  if (!primarySeed) {
    throw new Error("The selected palette needs at least one chromatic color.");
  }
  const sourceBrandOption = options.find(
    (option) => option.key === "brand.primary",
  );
  const sourceBrandColor = sourceBrandOption
    ? rgbToOklch(parseColor(sourceBrandOption.defaultLightColor))
    : null;
  const averageChroma =
    chromaticSeeds.reduce((sum, color) => sum + color.chroma, 0) /
    chromaticSeeds.length;
  return {
    seedHex,
    vividPrimaryHex: vividPrimaryColor(seedHex[0], seeds[0], primarySeed),
    centerHue: primarySeed.hue,
    sourceBrandHue:
      sourceBrandColor && sourceBrandColor.chroma > ACHROMATIC_CHROMA
        ? sourceBrandColor.hue
        : 350,
    baseChroma: clamp(averageChroma, 0.16, 0.28),
    counterpointClockwiseHex: counterpointClockwise,
    counterpointAnticlockwiseHex: counterpointAnticlockwise,
    counterpointClockwiseHue: rgbToOklch(parseColor(counterpointClockwise)).hue,
    counterpointAnticlockwiseHue: rgbToOklch(
      parseColor(counterpointAnticlockwise),
    ).hue,
    alternativeTonalFlowByRoleKey: buildAlternativeTonalFlowRoleMap(
      alternativeTonalFlows,
      options,
      counterpoints,
    ),
  };
}

function nearestAnalogousOffset(offset: number) {
  return ANALOGOUS_HUE_OFFSETS.reduce((nearest, candidate) =>
    Math.abs(candidate - offset) < Math.abs(nearest - offset)
      ? candidate
      : nearest,
  );
}

function analogousHue(originalHue: number, palette: ThemePalette) {
  const sourceDifference = signedHueDifference(
    originalHue,
    palette.sourceBrandHue,
  );
  const compressedDifference = clamp(
    sourceDifference * SOURCE_HUE_COMPRESSION,
    ANALOGOUS_HUE_OFFSETS[0],
    ANALOGOUS_HUE_OFFSETS[ANALOGOUS_HUE_OFFSETS.length - 1],
  );
  return normalizeHue(
    palette.centerHue + nearestAnalogousOffset(compressedDifference),
  );
}

function alternativeTonalFlowColor(
  original: OklchColor,
  alpha: string,
  palette: ThemePalette,
  option: PublisherAppColorCatalogOption,
) {
  const flow = palette.alternativeTonalFlowByRoleKey.get(option.key);
  if (!flow) {
    throw new Error(`Missing alternative tonal flow for ${option.key}.`);
  }
  if (option.key === flow.anchorKey) {
    return `${flow.centerHex}${alpha}`;
  }

  const sourceDifference = signedHueDifference(original.hue, flow.sourceHue);
  const localDifference = clamp(
    sourceDifference * ALTERNATIVE_FLOW_HUE_COMPRESSION,
    -ALTERNATIVE_FLOW_MAX_HUE_DISTANCE,
    ALTERNATIVE_FLOW_MAX_HUE_DISTANCE,
  );
  const targetChroma = clamp(
    original.chroma +
      ((flow.fixedTargetChroma ?? palette.baseChroma) - original.chroma) * 0.72,
    Math.min(original.chroma, 0.08),
    0.3,
  );
  return oklchToHex(
    {
      lightness: original.lightness,
      chroma: targetChroma,
      hue: normalizeHue(flow.centerHue + localDifference),
    },
    alpha,
  );
}

function chromaStrength(option: PublisherAppColorCatalogOption) {
  if (option.group === "Screen surfaces and atmosphere") return 0.48;
  if (
    /\b(surface|background|shadow|border)\b/i.test(optionSearchText(option))
  ) {
    return 0.52;
  }
  if (/\b(text|ink)\b/i.test(optionSearchText(option))) return 0.58;
  if (
    option.group === "Discover categories" ||
    option.group === "Bottom navigation" ||
    option.group === "Scientific decorative palette"
  ) {
    return 0.76;
  }
  return 0.68;
}

function coordinatedColor(
  originalValue: string,
  palette: ThemePalette,
  option: PublisherAppColorCatalogOption,
  policy: PaletteRolePolicy,
  appearance: ColorAppearance,
) {
  const normalizedOriginal = normalizedCatalogColor(originalValue);
  if (policy === "preserve") return normalizedOriginal;

  const rgb = parseColor(normalizedOriginal);
  if (policy === "learnBackground") {
    return learnBackgroundColor(originalValue, palette, option, appearance);
  }
  if (policy === "learnTabPrimary") {
    return `${palette.vividPrimaryHex}${rgb.alpha}`;
  }
  if (policy === "centerTabWashedPrimary") {
    return washedPrimaryCenterTabColor(palette, option, rgb.alpha);
  }
  const original = rgbToOklch(rgb);
  if (isDeepDarkStructure(option, original, appearance)) {
    return normalizedOriginal;
  }
  if (
    original.chroma <= ACHROMATIC_CHROMA ||
    original.lightness <= 0.01 ||
    original.lightness >= 0.99
  ) {
    return normalizedOriginal;
  }

  if (policy === "alternativeTonalFlow") {
    return alternativeTonalFlowColor(original, rgb.alpha, palette, option);
  }

  if (policy === "vividPrimary") {
    return `${palette.vividPrimaryHex}${rgb.alpha}`;
  }
  if (policy === "vividPrimaryGradientEnd") {
    return vividPrimaryGradientEndColor(palette, rgb.alpha);
  }

  const directIndex =
    policy === "primary"
      ? 0
      : policy === "secondary"
        ? 1
        : policy === "tertiary"
          ? 2
          : null;
  if (directIndex !== null) {
    return `${palette.seedHex[directIndex]}${rgb.alpha}`;
  }

  const counterpointHue =
    policy === "counterpointClockwise"
      ? palette.counterpointClockwiseHue
      : policy === "counterpointAnticlockwise"
        ? palette.counterpointAnticlockwiseHue
        : null;

  const strength = chromaStrength(option);
  const targetChroma = clamp(
    original.chroma + (palette.baseChroma - original.chroma) * strength,
    Math.min(original.chroma, 0.08),
    0.3,
  );
  return oklchToHex(
    {
      lightness: original.lightness,
      chroma: targetChroma,
      hue: counterpointHue ?? analogousHue(original.hue, palette),
    },
    rgb.alpha,
  );
}

function candidateForOption(
  option: PublisherAppColorCatalogOption,
  palette: ThemePalette,
): PaletteCandidate | null {
  const policy = rolePolicy(option, palette);
  if (policy === "preserve") return null;
  const override = {
    light: coordinatedColor(
      option.defaultLightColor,
      palette,
      option,
      policy,
      "light",
    ),
    dark: coordinatedColor(
      option.defaultDarkColor,
      palette,
      option,
      policy,
      "dark",
    ),
  };
  if (
    override.light === normalizedCatalogColor(option.defaultLightColor) &&
    override.dark === normalizedCatalogColor(option.defaultDarkColor)
  ) {
    return null;
  }
  return { option, override };
}

export function createPublisherAppPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
): PublisherAppPaletteOverridePlan {
  if (options.length === 0) {
    throw new Error(
      "The color catalog is too small to build the palette plan.",
    );
  }
  const palette = buildThemePalette(colors, options, alternativeTonalFlows);
  const candidates = options
    .map((option) => candidateForOption(option, palette))
    .filter((candidate): candidate is PaletteCandidate => candidate !== null)
    .sort((left, right) => left.option.key.localeCompare(right.option.key));
  if (candidates.length === 0) {
    throw new Error(
      "The color catalog does not contain enough meaningful chromatic roles.",
    );
  }

  const colorOverrides = Object.fromEntries(
    candidates.map((candidate) => [candidate.option.key, candidate.override]),
  );
  return {
    catalogVersion,
    sourceCount: options.length,
    selectedCount: candidates.length,
    colorOverrides,
  };
}
