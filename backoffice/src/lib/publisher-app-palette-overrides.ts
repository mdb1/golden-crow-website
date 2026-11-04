import type {
  PublisherAppColorCatalogOption,
  PublisherAppColorOverride,
  PublisherAppColors,
  PublisherAppPaletteOverridePlan,
} from "@/lib/publisher-app-config";
import { normalizePublisherAppColor } from "@/lib/publisher-app-config";

export const PUBLISHER_APP_AUTOMATIC_OVERRIDE_COUNT = 167;

type HslColor = {
  hue: number;
  saturation: number;
  lightness: number;
};

type ParsedColor = HslColor & {
  alpha: string;
};

const GROUP_IMPACT: Record<string, number> = {
  Brand: 190,
  "General interface": 180,
  "Bottom navigation": 176,
  "Screen surfaces and atmosphere": 172,
  "Brand details": 168,
  "Brand and community gradient details": 166,
  "Discover categories": 164,
  "Discover publishers": 162,
  "Connect quick access": 160,
  Discover: 154,
  Community: 148,
  "Community reference cards": 144,
  "Discover articles": 142,
  "Discover event details": 140,
  "Report entry": 138,
  Services: 136,
  "Services and native controls": 134,
  "Service information": 132,
  "Scientific decorative palette": 126,
  "Study category picker": 122,
  "File creation wizard": 116,
  "Android Material controls": 112,
  "General feedback": 40,
  "Service request status": -300,
};

const HIGH_IMPACT_TERMS = [
  "background",
  "canvas",
  "surface",
  "navigation",
  "tab",
  "header",
  "button",
  "control",
  "action",
  "primary",
  "brand",
  "accent",
  "gradient",
  "card",
  "selected",
  "highlight",
  "category",
  "publisher",
  "quick access",
];

const SEMANTIC_STATUS_PATTERN =
  /\b(error|success|warning|failure|failed|rejected|cancelled|destructive|danger|requested|received|validating|accepted|queued|running|awaiting|delivered|status)\b/i;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseColor(value: string): ParsedColor {
  const match = /^#([\dA-F]{6})([\dA-F]{2})?$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid catalog color: ${value}`);
  }
  const rgb = [0, 2, 4].map(
    (offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255,
  );
  const maximum = Math.max(...rgb);
  const minimum = Math.min(...rgb);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta > 0) {
    if (maximum === rgb[0]) {
      hue = 60 * (((rgb[1] - rgb[2]) / delta) % 6);
    } else if (maximum === rgb[1]) {
      hue = 60 * ((rgb[2] - rgb[0]) / delta + 2);
    } else {
      hue = 60 * ((rgb[0] - rgb[1]) / delta + 4);
    }
  }
  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation:
      delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    lightness: lightness * 100,
    alpha: match[2]?.toUpperCase() ?? "",
  };
}

function hslToHex(color: HslColor, alpha = "") {
  const hue = ((color.hue % 360) + 360) % 360;
  const saturation = clamp(color.saturation, 0, 100) / 100;
  const lightness = clamp(color.lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const offset = lightness - chroma / 2;
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

  const channel = (value: number) =>
    Math.round((value + offset) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(red)}${channel(green)}${channel(blue)}${alpha}`;
}

function optionSearchText(option: PublisherAppColorCatalogOption) {
  return `${option.key} ${option.title} ${option.usageDescription} ${option.group}`;
}

function optionImpact(option: PublisherAppColorCatalogOption) {
  const text = optionSearchText(option);
  let score = GROUP_IMPACT[option.group] ?? 100;
  for (const term of HIGH_IMPACT_TERMS) {
    if (text.toLocaleLowerCase("en").includes(term)) score += 5;
  }
  if (/\b(main|shared|broadest|prominent|global|screen)\b/i.test(text)) {
    score += 10;
  }
  if (SEMANTIC_STATUS_PATTERN.test(text)) score -= 360;
  if (/\b(text|caption|metadata|helper|placeholder)\b/i.test(text)) score -= 6;
  return score;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function paletteAnchorIndex(option: PublisherAppColorCatalogOption) {
  const text = optionSearchText(option).toLocaleLowerCase("en");
  if (/\b(secondary|support|middle|midpoint)\b/.test(text)) return 1;
  if (
    /\b(tertiary|accent|end|highlight|call to action|prominent)\b/.test(text)
  ) {
    return 2;
  }
  if (/\b(primary|brand|start|navigation|tab|main)\b/.test(text)) return 0;
  return stableHash(option.key) % 3;
}

function tintStrength(
  option: PublisherAppColorCatalogOption,
  original: ParsedColor,
) {
  const text = optionSearchText(option);
  if (original.lightness >= 96 || original.lightness <= 4) return 0.035;
  if (
    /\b(canvas|background|surface|container|separator|border)\b/i.test(text)
  ) {
    return original.saturation < 12 ? 0.14 : 0.48;
  }
  if (/\b(text|caption|metadata|helper)\b/i.test(text)) {
    return original.saturation < 12 ? 0.08 : 0.5;
  }
  if (original.saturation < 8) return 0.22;
  if (original.saturation < 28) return 0.55;
  return 0.86;
}

function coordinatedColor(
  originalValue: string,
  anchor: ParsedColor,
  option: PublisherAppColorCatalogOption,
) {
  const original = parseColor(originalValue);
  const strength = tintStrength(option, original);
  let saturation =
    original.saturation + (anchor.saturation - original.saturation) * strength;

  // Keep true black/white and quiet neutrals structurally neutral. They still
  // receive the selected hue, so softened edges and translucent layers feel
  // related to the palette without losing their contrast job.
  if (original.lightness >= 96 || original.lightness <= 4) {
    saturation = Math.min(saturation, 8);
  } else if (original.saturation < 8) {
    saturation = Math.min(saturation, 24);
  }

  return hslToHex(
    {
      hue: anchor.hue,
      saturation,
      lightness: original.lightness,
    },
    original.alpha,
  );
}

function normalizedPalette(colors: PublisherAppColors) {
  return ([colors.primary, colors.secondary, colors.tertiary] as const).map(
    (value) => {
      const normalized = normalizePublisherAppColor(value);
      if (!normalized) throw new Error(`Invalid palette color: ${value}`);
      return parseColor(normalized);
    },
  );
}

export function createPublisherAppPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
): PublisherAppPaletteOverridePlan {
  if (options.length < PUBLISHER_APP_AUTOMATIC_OVERRIDE_COUNT) {
    throw new Error(
      "The color catalog is too small to build the palette plan.",
    );
  }
  const anchors = normalizedPalette(colors);
  const selected = [...options]
    .sort((left, right) => {
      const scoreDifference = optionImpact(right) - optionImpact(left);
      return scoreDifference || left.key.localeCompare(right.key);
    })
    .slice(0, PUBLISHER_APP_AUTOMATIC_OVERRIDE_COUNT);
  const colorOverrides: Record<string, PublisherAppColorOverride> = {};
  for (const option of selected) {
    const anchor = anchors[paletteAnchorIndex(option)];
    colorOverrides[option.key] = {
      light: coordinatedColor(option.defaultLightColor, anchor, option),
      dark: coordinatedColor(option.defaultDarkColor, anchor, option),
    };
  }
  return {
    catalogVersion,
    sourceCount: options.length,
    selectedCount: selected.length,
    colorOverrides,
  };
}
