import type {
  PublisherAppAlternativeTonalFlowCenter,
  PublisherAppAlternativeTonalFlow,
  PublisherAppColorCatalogOption,
  PublisherAppColorContrastPair,
  PublisherAppColorOverride,
  PublisherAppColors,
  PublisherAppPaletteOverridePlan,
} from "@/lib/publisher-app-config";
import { normalizePublisherAppColor, PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS } from "@/lib/publisher-app-config";

type RgbColor = { red: number; green: number; blue: number; alpha: string };
type OklchColor = { lightness: number; chroma: number; hue: number };

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

// A family is transformed as one continuous coordinate system. Anchors move to
// the selected color; their shades retain ordering, hue spacing and relative
// chroma. There are no hue buckets or minimum saturation targets.
type Appearance = "light" | "dark";
type Family = { source: OklchColor; target: OklchColor };
type ContrastPair = Omit<PublisherAppColorContrastPair, "foregroundKey"> & {
  foregroundKey?: string;
  foregroundColor?: string;
  preserveOriginal?: boolean;
  backgroundOpacities?: Partial<Record<Appearance, number[]>>;
  canvasColor?: string;
  modes?: Appearance[];
  brightOnly?: boolean;
};
type OverrideLocks = Record<string, Partial<Record<Appearance, true>>>;
const MODES: Appearance[] = ["light", "dark"];
const QUIET_CHROMA = 0.04;
const ACHROMATIC_CHROMA = 0.0001;
const SEMANTIC_STATUS = /\b(error|success|warning|failure|failed|rejected|cancelled|canceled|destructive|danger|requested|received|validating|accepted|queued|running|awaiting|delivered|status|unsupported|unavailable)\b/i;
const FLOW_ANCHORS: Record<string, string> = {
  rareCircles: "community.rareCircles.accent",
  communityComposer: "community.newPost.headerAccent",
  communityGenes: "community.genes.primary",
  savedContent: "savedContent.headerStart",
};

// This one fixed tonal flow keeps its original vivid cyan/green identity.
// The first ten values are the exact colors emitted by the historical v5
// palette. New header/action roles reuse that same ramp; surfaces and ink do
// not inherit this exception, nor do the four community quick-action tiles.
const RESTORED_GENES_ACCENTS: Record<string, string> = {
  "community.genes.primary": "#00A88A",
  "community.genes.secondary": "#008372",
  "community.genes.highlight": "#009280",
  "community.genes.progressStart": "#2CB899",
  "community.genes.progressEnd": "#00B399",
  "community.genes.focus.diagnosed": "#2CB899",
  "community.genes.focus.candidate": "#00907E",
  "community.genes.focus.carrier": "#09BB8F",
  "community.genes.focus.family": "#00A894",
  "community.genes.focus.research": "#00B399",
  "community.genes.headerStart": "#00A88A",
  "community.genes.headerMiddle": "#2CB899",
  "community.genes.headerEnd": "#00B399",
  "community.genes.primaryActionFill": "#00A88A",
  "community.genes.secondaryActionFill": "#008372",
  "community.genes.visibilityAccent": "#009280",
};

function restoresGenesAccent(key: string) {
  return Object.hasOwn(RESTORED_GENES_ACCENTS, key);
}

// These roles color only the quick-action title and Open labels. The original
// illustration artwork and every background role keep their existing behavior.
const FIXED_QUICK_ACTION_TEXT_KEYS = [
  "community.quickActions.friends.foreground",
  "community.quickActions.genes.foreground",
  "community.quickActions.circles.foreground",
  "community.quickActions.search.foreground",
] as const;
const fixedQuickActionTextKeys = new Set<string>(FIXED_QUICK_ACTION_TEXT_KEYS);
const GENES_PRIMARY_ACTION_FOREGROUND_KEY = "community.genes.primaryActionForeground";
const FIXED_FOREGROUND_KEYS = [...FIXED_QUICK_ACTION_TEXT_KEYS, GENES_PRIMARY_ACTION_FOREGROUND_KEY];

function isFixedQuickActionText(key: string) {
  return fixedQuickActionTextKeys.has(key);
}

function isFixedForeground(key: string) {
  return isFixedQuickActionText(key) || key === GENES_PRIMARY_ACTION_FOREGROUND_KEY;
}

const QUICK_ACTION_BACKGROUND_SOURCES = [
  ["friends", "primary"],
  ["genes", "secondary"],
  ["circles", "tertiary"],
  ["search", "counterpointClockwise"],
] as const;
const QUICK_ACTION_BACKGROUND_STOPS = { start: 0.02, middle: 0, end: -0.03, bezel: -0.05 } as const;

function quickActionCenter(seed: string, primary: string, toneToBrand: boolean) {
  const source = rgbToOklch(parseColor(normalizedSeed(seed)));
  const brand = rgbToOklch(parseColor(normalizedSeed(primary)));
  let center = source;
  if (toneToBrand && source.chroma > ACHROMATIC_CHROMA && brand.chroma > ACHROMATIC_CHROMA) {
    const axes = (tone: OklchColor) => ({
      a: tone.chroma * Math.cos(tone.hue * Math.PI / 180),
      b: tone.chroma * Math.sin(tone.hue * Math.PI / 180),
    });
    const seedAxes = axes(source), brandAxes = axes(brand);
    const a = seedAxes.a * 0.88 + brandAxes.a * 0.12;
    const b = seedAxes.b * 0.88 + brandAxes.b * 0.12;
    const mixedHue = normalizeHue(Math.atan2(b, a) * 180 / Math.PI);
    center = {
      lightness: source.lightness,
      chroma: clamp(Math.hypot(a, b), source.chroma * 0.9, source.chroma),
      hue: normalizeHue(source.hue + clamp(signedHueDifference(mixedHue, source.hue), -6, 6)),
    };
  }
  const hex = oklchToHex(center, "");
  if (contrast("#FFFFFF", hex) >= 2.5) return center;
  // Only an actually luminous card center gets a readable display shade.
  // This component has fixed white text, including when the chosen seed is a
  // near-white neutral. Already-ochre/dark colors never enter this correction.
  const targetLuminance = 1.05 / 3.03 - 0.05;
  const shaded = shadedControlColor(hex, clamp(targetLuminance / luminance(hex), 0, 1));
  return rgbToOklch(parseColor(shaded));
}

function applyQuickActionBackgrounds(values: Map<string, PublisherAppColorOverride>, byKey: Map<string, PublisherAppColorCatalogOption>, colors: PublisherAppColors) {
  for (const [action, source] of QUICK_ACTION_BACKGROUND_SOURCES) {
    const center = quickActionCenter(colors[source], colors.primary, action !== "friends");
    for (const [stop, offset] of Object.entries(QUICK_ACTION_BACKGROUND_STOPS)) {
      const key = `community.quickActions.${action}.${stop}`;
      const option = byKey.get(key);
      if (!option) continue;
      const tone = { ...center, lightness: clamp(center.lightness + offset, 0, 1) };
      values.set(key, Object.fromEntries(MODES.map(mode => [mode, oklchToHex(tone, parseColor(originalValue(option, mode)).alpha)])));
    }
  }
}



function originalValue(option: PublisherAppColorCatalogOption, mode: Appearance) {
  return normalizedCatalogColor(mode === "light" ? option.defaultLightColor : option.defaultDarkColor);
}
function originalColor(option: PublisherAppColorCatalogOption, mode: Appearance) {
  return rgbToOklch(parseColor(originalValue(option, mode)));
}
function identity(option: PublisherAppColorCatalogOption) {
  return `${option.key} ${option.title}`.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._/-]+/g, " ");
}
function semantic(option: PublisherAppColorCatalogOption) {
  return option.group === "General feedback" || option.group === "Service request status" || SEMANTIC_STATUS.test(identity(option));
}
function deepStructure(option: PublisherAppColorCatalogOption, source: OklchColor, mode: Appearance) {
  if (mode !== "dark" || source.lightness > 0.4) return false;
  const name = identity(option);
  if (/\b(glow|orb|halo|highlight|particle|star|sheen|border|outline|text|ink|icon)\b/i.test(name)) return false;
  return /\b(background|surface|canvas|backdrop|scrim|veil|fill)\b/i.test(name) ||
    (option.group === "Screen surfaces and atmosphere" && /\bgradient\b/i.test(name)) ||
    /^learn\.background\.stop\d+$/.test(option.key);
}
function transferLightness(value: number, sourceAnchor: number, targetAnchor: number) {
  // A monotone map through black, the anchor and white preserves a shade ramp
  // even when the selected anchor is much lighter or darker than the original.
  if (value >= sourceAnchor) {
    return targetAnchor + (value - sourceAnchor) * (1 - targetAnchor) / Math.max(1e-6, 1 - sourceAnchor);
  }
  return value * targetAnchor / Math.max(1e-6, sourceAnchor);
}
function transform(original: OklchColor, alpha: string, family: Family, environmental: boolean) {
  const chromaScale = family.source.chroma > ACHROMATIC_CHROMA ? family.target.chroma / family.source.chroma : 1;
  return oklchToHex({
    // Canvases and translucent lighting must retain their original brightness;
    // a dark brand must not turn a daylight wash into a mid-tone background.
    lightness: environmental ? original.lightness : clamp(transferLightness(original.lightness, family.source.lightness, family.target.lightness), 0, 1),
    chroma: original.chroma * chromaScale,
    hue: normalizeHue(original.hue + signedHueDifference(family.target.hue, family.source.hue)),
  }, alpha);
}
function normalizedSeed(value: string) {
  const normalized = normalizePublisherAppColor(value);
  if (!normalized) throw new Error(`Invalid palette color: ${value}`);
  return normalized;
}

function analogousFamilyForHue(sourceHue: number, primary: Family): Family {
  // A smooth periodic projection keeps general UI tones near the brand, with
  // no antipodal seam. Registered gradients rotate together around ONE center
  // so their original internal hue distances are retained exactly.
  const difference = signedHueDifference(sourceHue, primary.source.hue);
  const offset = 45 * Math.sin(difference * Math.PI / 180);
  return {
    ...primary,
    target: { ...primary.target, hue: normalizeHue(primary.target.hue + offset - difference) },
  };
}

function buildFamilies(colors: PublisherAppColors, options: PublisherAppColorCatalogOption[], flows: PublisherAppAlternativeTonalFlow[], mode: Appearance) {
  const byKey = new Map(options.map(option => [option.key, option]));
  const sourceFor = (key: string, fallback = "#F61C72") => {
    const option = byKey.get(key);
    return option ? originalColor(option, mode) : rgbToOklch(parseColor(fallback));
  };
  const family = (sourceKey: string, target: string, fallback?: string): Family => {
    const source = sourceFor(sourceKey, fallback);
    const tone = rgbToOklch(parseColor(normalizedSeed(target)));
    return {
      source,
      // Reserve space for shades on BOTH sides, even for a black/white brand.
      // Explicit base roles start from the chosen RGB; filled-control contrast
      // is applied afterwards without changing those palette inputs.
      // A fully neutral identity removes hue, not the original tonal structure.
      target: { ...tone, lightness: tone.chroma <= ACHROMATIC_CHROMA ? source.lightness : clamp(tone.lightness, 0.25, 0.9) },
    };
  };
  const primary = family("brand.primary", colors.primary);
  const secondary = family("brand.secondary", colors.secondary);
  const tertiary = family("brand.accent", colors.tertiary);
  const learn = family("learn.level.bacteria.accent", colors.secondary, "#00A88A");
  const firstLevel = family("learn.level.bacteria.accent", colors.primary, "#00A88A");
  const interfaceFamily: Family = {
    source: { ...primary.source, hue: sourceFor("app.accent", "#007AFF").hue },
    target: primary.target,
  };
  const roleFamilies = new Map<string, Family>();
  for (const flow of flows) {
    const definition = (PUBLISHER_APP_ALTERNATIVE_TONAL_FLOW_CENTERS as Record<string, PublisherAppAlternativeTonalFlowCenter>)[flow.id];
    if (!definition) continue;
    // Older/synthetic catalogs may not contain the new Rare Circles anchor.
    const anchorKey = byKey.has(FLOW_ANCHORS[flow.id]) ? FLOW_ANCHORS[flow.id] : flow.roleKeys.find(key => byKey.has(key));
    if (!anchorKey) throw new Error(`Alternative tonal flow ${flow.id} has no color anchor.`);
    const target = definition.kind === "fixed" ? definition.color : colors[definition.key];
    const flowFamily = family(anchorKey, target);
    for (const key of flow.roleKeys) {
      if (!byKey.has(key)) throw new Error(`Alternative tonal flow ${flow.id} references unknown role ${key}.`);
      if (roleFamilies.has(key)) throw new Error(`Alternative tonal flow role ${key} belongs to multiple flows.`);
      roleFamilies.set(key, flowFamily);
    }
  }
  // Keep the former coordinates for historical-palette recognition. Current
  // tile backgrounds are assigned explicitly by applyQuickActionBackgrounds.
  for (const [name, target] of [["circles", colors.counterpointClockwise], ["search", colors.counterpointAnticlockwise]] as const) {
    const anchor = `community.quickActions.${name}.middle`;
    if (!byKey.has(anchor)) continue;
    const local = family(anchor, target);
    for (const option of options) if (option.key.startsWith(`community.quickActions.${name}.`)) roleFamilies.set(option.key, local);
  }
  const gradientMembers = new Set<string>();
  const gradientFamilies = new Map<string, Family>();
  const groups = new Map<string, PublisherAppColorCatalogOption[]>();
  for (const option of options) {
    // Registered naming families: an accent + gradientEnd, or start/middle/end
    // (+ bezel/shadow). A weakly chromatic shade remains in its local family.
    const match = /^(.*?)(?:\.accent|\.gradientEnd|\.(?:start|middle|end|bezel)|(?:Gradient)?(?:Start|Middle|End)|\.(?:gradientTop|gradientMiddle|gradientBottom|gradientFade)|\.(?:standard|organizations)\d+)$/.exec(option.key);
    if (!match) continue;
    const group = groups.get(match[1]) ?? [];
    group.push(option); groups.set(match[1], group);
  }
  for (const group of groups.values()) {
    const chromatic = group.filter(option => originalColor(option, mode).chroma > ACHROMATIC_CHROMA);
    if (group.length > 1 && chromatic.length > 0) {
      const rank = (key: string) => /\.accent$/.test(key) ? 0 : /(?:\.start|Start)$/.test(key) ? 1 : 2;
      const anchor = chromatic.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))[0];
      const local = analogousFamilyForHue(originalColor(anchor, mode).hue, primary);
      for (const option of group) {
        gradientMembers.add(option.key);
        gradientFamilies.set(option.key, local);
      }
    }
  }
  return { primary, secondary, tertiary, learn, firstLevel, interfaceFamily, roleFamilies, gradientMembers, gradientFamilies };
}

function rgba(hex: string) {
  const value = parseColor(hex);
  return { ...value, opacity: value.alpha ? Number.parseInt(value.alpha, 16) / 255 : 1 };
}
function composite(foreground: string, background: string) {
  const fg = rgba(foreground), bg = rgba(background);
  return rgbToHex({ red: fg.red * fg.opacity + bg.red * (1 - fg.opacity), green: fg.green * fg.opacity + bg.green * (1 - fg.opacity), blue: fg.blue * fg.opacity + bg.blue * (1 - fg.opacity) });
}
function rgbToHex(rgb: Omit<RgbColor, "alpha">) {
  const channel = (value: number) => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(rgb.red)}${channel(rgb.green)}${channel(rgb.blue)}`;
}
function mixRgb(left: string, right: string, weight: number) {
  const a = parseColor(left), b = parseColor(right);
  return rgbToHex({ red: a.red + (b.red - a.red) * weight, green: a.green + (b.green - a.green) * weight, blue: a.blue + (b.blue - a.blue) * weight });
}
function luminance(hex: string) {
  const rgb = parseColor(hex);
  return 0.2126 * srgbToLinear(rgb.red) + 0.7152 * srgbToLinear(rgb.green) + 0.0722 * srgbToLinear(rgb.blue);
}
function contrast(a: string, b: string) {
  const left = luminance(a), right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function shadedControlColor(value: string, factor: number, preserveMutedHue = true) {
  const rgb = parseColor(value);
  const source = rgbToOklch(rgb);
  const ideal = {
    red: linearToSrgb(srgbToLinear(rgb.red) * factor),
    green: linearToSrgb(srgbToLinear(rgb.green) * factor),
    blue: linearToSrgb(srgbToLinear(rgb.blue) * factor),
  };
  const rounded = rgbToHex(ideal);
  const roundedTone = rgbToOklch(parseColor(rounded));
  if (!preserveMutedHue || source.chroma < ACHROMATIC_CHROMA || source.chroma >= QUIET_CHROMA || factor === 0 || Math.abs(signedHueDifference(roundedTone.hue, source.hue)) <= 2) return `${rounded}${rgb.alpha}`;
  // The nearest byte can noticeably rotate a muted shade. Choose between the
  // adjacent channel bytes, retaining hue without moving more than one byte.
  const neighbors = (channel: number) => [...new Set([Math.floor(channel * 255), Math.ceil(channel * 255)])].map(byte => clamp(byte, 0, 255) / 255);
  let best = rounded, score = Number.POSITIVE_INFINITY;
  for (const red of neighbors(ideal.red)) for (const green of neighbors(ideal.green)) for (const blue of neighbors(ideal.blue)) {
    const candidate = { red, green, blue };
    const tone = rgbToOklch({ ...candidate, alpha: "" });
    const hueError = Math.abs(signedHueDifference(tone.hue, source.hue));
    const distance = Math.abs(red - ideal.red) + Math.abs(green - ideal.green) + Math.abs(blue - ideal.blue);
    const error = hueError + distance;
    if (error < score) { score = error; best = rgbToHex(candidate); }
  }
  return `${best}${rgb.alpha}`;
}

function whiteInk(value: string) {
  const rgb = parseColor(value);
  return Math.min(rgb.red, rgb.green, rgb.blue) >= 0.98;
}

function needsStructuralShade(value: string) {
  const rgb = parseColor(value);
  const maximum = Math.max(rgb.red, rgb.green, rgb.blue);
  const minimum = Math.min(rgb.red, rgb.green, rgb.blue);
  const delta = maximum - minimum;
  if (maximum === 0 || delta / maximum < 0.1) return false;
  const hue = normalizeHue(maximum === rgb.red
    ? 60 * (((rgb.green - rgb.blue) / delta) % 6)
    : maximum === rgb.green ? 60 * ((rgb.blue - rgb.red) / delta + 2)
      : 60 * ((rgb.red - rgb.green) / delta + 4));
  return hue >= 45 && hue <= 195 && contrast("#FFFFFF", value) < 2.5;
}

function applySelectiveStructuralShades(values: Map<string, PublisherAppColorOverride>, byKey: Map<string, PublisherAppColorCatalogOption>, pairs: ContrastPair[], locked: OverrideLocks) {
  const effective = (key: string, mode: Appearance) => values.get(key)?.[mode] ?? originalValue(byKey.get(key)!, mode);
  const isLocked = (key: string, mode: Appearance) => !!locked[key]?.[mode] ||
    ["app.background", "app.surface", "app.groupedBackground", "app.profileBackground"].includes(key) ||
    deepStructure(byKey.get(key)!, originalColor(byKey.get(key)!, mode), mode);
  const active = new Map(pairs.map(pair => [pair, new Set(MODES.filter(mode =>
    (!pair.modes || pair.modes.includes(mode)) &&
    whiteInk(pair.foregroundKey ? effective(pair.foregroundKey, mode) : pair.foregroundColor!) &&
    pair.backgroundKeys.some(key => !isLocked(key, mode) && needsStructuralShade(effective(key, mode))),
  ))]));
  // Preserve the pre-existing contrast behavior outside this narrowly opted-in
  // treatment. A dark ochre must not acquire a new white-label constraint.
  const ordinary = pairs.flatMap(pair => pair.foregroundKey && !pair.brightOnly
    ? MODES.filter(mode => (!pair.modes || pair.modes.includes(mode)) && !active.get(pair)?.has(mode)).map(mode => ({ ...pair, modes: [mode] }))
    : []);
  applyContrastPairs(values, byKey, ordinary, locked, false, false);

  for (const mode of MODES) for (const pair of pairs) {
    if (!active.get(pair)?.has(mode)) continue;
    const originals = pair.backgroundKeys.map(key => effective(key, mode));
    const tones = originals.map(value => rgbToOklch(parseColor(value)));
    const eligible = originals.map((value, index) => !isLocked(pair.backgroundKeys[index], mode) && needsStructuralShade(value));
    // Unchanged darker stops are anchors. Compress only the bright interval
    // above each anchor, rather than multiplying the entire gradient.
    const anchors = tones.filter((_, index) => !eligible[index]).map(tone => tone.lightness).sort((a, b) => a - b);
    const intervals = new Map<number, number[]>();
    tones.forEach((tone, index) => {
      if (!eligible[index]) return;
      const lower = anchors.filter(anchor => anchor < tone.lightness).at(-1) ?? 0;
      intervals.set(lower, [...(intervals.get(lower) ?? []), index]);
    });
    for (const [lower, indices] of intervals) {
      const paint = (scale: number) => indices.map(index => {
        const lightness = lower + (tones[index].lightness - lower) * scale;
        return shadedControlColor(originals[index], Math.pow(lightness / tones[index].lightness, 3));
      });
      // Three is the native moderate target. If an untouched stop prevents
      // reaching it without reversing the ramp, keep the corrected stop above
      // that anchor with a small amount of the original spacing.
      const minimumScale = lower === 0 ? 0 : 0.02;
      const sufficient = (colors: string[]) => colors.every(color => contrast("#FFFFFF", color) >= 3.015);
      let low = minimumScale, high = 1;
      if (sufficient(paint(low))) {
        for (let iteration = 0; iteration < 24; iteration += 1) {
          const middle = (low + high) / 2;
          if (sufficient(paint(middle))) low = middle; else high = middle;
        }
      }
      let shades = paint(low);
      // Avoid a byte-rounding tie or reversal against a preserved dark stop.
      if (lower > 0 && shades.some(color => rgbToOklch(parseColor(color)).lightness <= lower)) {
        shades = paint(Math.max(low, 0.15));
      }
      shades.forEach((value, position) => {
        const key = pair.backgroundKeys[indices[position]];
        values.set(key, { ...values.get(key), [mode]: value });
      });
    }
    // An unrelated pale anchor can still prevent white ink from working.
    // Adapt unlocked ink as before, never sacrifice a preserved background.
    if (pair.foregroundKey && !locked[pair.foregroundKey]?.[mode] &&
      pair.backgroundKeys.some(key => contrast("#FFFFFF", effective(key, mode)) < Math.min(2.5, pair.minimumRatio))) {
      const inkLocks: OverrideLocks = { ...locked };
      for (const key of pair.backgroundKeys) inkLocks[key] = { ...inkLocks[key], [mode]: true };
      for (const minimumRatio of [pair.minimumRatio, Math.min(2.5, pair.minimumRatio)]) {
        try {
          applyContrastPairs(values, byKey, [{ ...pair, minimumRatio, modes: [mode] }], inkLocks, false, false);
          break;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("preserve contrast")) throw error;
        }
      }
    }
  }
}

function applyContrastPairs(values: Map<string, PublisherAppColorOverride>, byKey: Map<string, PublisherAppColorCatalogOption>, inputPairs: ContrastPair[], locked: OverrideLocks = {}, protectBrightSurfaces = true, selective = true) {
  if (protectBrightSurfaces && selective) {
    applySelectiveStructuralShades(values, byKey, inputPairs, locked);
    return;
  }
  let valueRevision = 0;
  const foundations = new Set<string>();
  for (const option of byKey.values()) for (const mode of MODES) {
    if (["app.background", "app.surface", "app.groupedBackground", "app.profileBackground"].includes(option.key) || deepStructure(option, originalColor(option, mode), mode)) foundations.add(`${option.key}:${mode}`);
  }
  const isLocked = (key: string, mode: Appearance) => locked[key]?.[mode] || foundations.has(`${key}:${mode}`);
  const effective = (key: string, mode: Appearance) => values.get(key)?.[mode] ?? (byKey.has(key) ? originalValue(byKey.get(key)!, mode) : mode === "light" ? "#FFFFFF" : "#12141A");
  const set = (key: string, mode: Appearance, value: string) => {
    values.set(key, { ...values.get(key), [mode]: value });
    valueRevision += 1;
  };
  const foreground = (pair: ContrastPair, mode: Appearance) => pair.foregroundKey ? effective(pair.foregroundKey, mode) : pair.foregroundColor!;
  const foregroundLocked = (pair: ContrastPair, mode: Appearance) => !pair.foregroundKey || isLocked(pair.foregroundKey, mode);
  const pairs = inputPairs.filter(pair => pair.foregroundKey || MODES.some(mode => pair.backgroundKeys.some(key => !isLocked(key, mode))));
  const protectedPairs = new Map(pairs.map(pair => [pair, new Set(MODES.filter(mode =>
    protectBrightSurfaces && (!pair.modes || pair.modes.includes(mode)) &&
    whiteInk(foreground(pair, mode)) && pair.backgroundKeys.some(key => !isLocked(key, mode)),
  ))]));
  const applies = (pair: ContrastPair, mode: Appearance) => (!pair.modes || pair.modes.includes(mode)) && (!!pair.foregroundKey || !!protectedPairs.get(pair)?.has(mode));
  const inspect = (pair: ContrastPair, mode: Appearance) => {
    if ((pair.foregroundKey ? !byKey.has(pair.foregroundKey) : !pair.foregroundColor) || pair.backgroundKeys.some(key => !byKey.has(key))) throw new Error(`Invalid contrast relationship: ${pair.foregroundKey ?? pair.backgroundKeys.join(",")}`);
    const contextKey = pair.foregroundKey ?? pair.backgroundKeys[0];
    const prefix = contextKey.slice(0, contextKey.lastIndexOf("."));
    const canvasKey = byKey.has(`${prefix}.backgroundBase`) ? `${prefix}.backgroundBase` : "app.background";
    const canvas = pair.canvasColor ?? composite(effective(canvasKey, mode), mode === "light" ? "#FFFFFF" : "#12141A");
    const originalCanvas = composite(byKey.has(canvasKey) ? originalValue(byKey.get(canvasKey)!, mode) : mode === "light" ? "#FFFFFF" : "#12141A", mode === "light" ? "#FFFFFF" : "#12141A");
    const minimumRatio = pair.preserveOriginal && !protectedPairs.get(pair)?.has(mode) ? Math.min(pair.minimumRatio, ...pair.backgroundKeys.map(key => {
      const bg = key === canvasKey ? originalCanvas : composite(originalValue(byKey.get(key)!, mode), originalCanvas);
      return contrast(composite(pair.foregroundKey ? originalValue(byKey.get(pair.foregroundKey)!, mode) : pair.foregroundColor!, bg), bg);
    })) : pair.minimumRatio;
    let sampledRevision = -1;
    let cachedSamples: Array<{ hex: string; luminance: number }> = [];
    const backgrounds = () => {
      if (sampledRevision === valueRevision) return cachedSamples;
      // The canvas is already composited over the window. Drawing it over
      // itself again would double a manual background's opacity.
      const stops = pair.backgroundKeys.flatMap((key, index) => {
        if (!pair.foregroundKey && isLocked(key, mode)) return [];
        if (key === canvasKey && !pair.canvasColor) return [canvas];
        const value = effective(key, mode);
        const opacity = pair.backgroundOpacities?.[mode]?.[index] ?? 1;
        const rgb = rgba(value);
        const rendered = opacity === 1 ? value : `${value.slice(0, 7)}${Math.round(rgb.opacity * opacity * 255).toString(16).padStart(2, "0")}`;
        return [composite(rendered, canvas)];
      });
      // Check intermediate gradient pixels too; endpoint checks alone can miss
      // the darkest interpolated color of a multi-hue gradient.
      const samples = [...stops];
      for (let i = 1; i < stops.length; i += 1) for (let step = 1; step < 16; step += 1) samples.push(mixRgb(stops[i - 1], stops[i], step / 16));
      cachedSamples = samples.map(hex => ({ hex, luminance: luminance(hex) }));
      sampledRevision = valueRevision;
      return cachedSamples;
    };
    const minimum = (foreground: string) => {
      const samples = backgrounds();
      const foregroundLuminance = rgba(foreground).opacity === 1 ? luminance(foreground) : undefined;
      return Math.min(...samples.map(bg => {
        const ink = foregroundLuminance ?? luminance(composite(foreground, bg.hex));
        return (Math.max(ink, bg.luminance) + 0.05) / (Math.min(ink, bg.luminance) + 0.05);
      }));
    };
    return { minimumRatio, minimum };
  };
  for (const mode of MODES) for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const pair of pairs) {
      if (!applies(pair, mode)) continue;
      const { minimumRatio, minimum } = inspect(pair, mode);
      const current = foreground(pair, mode);
      const foregroundAlpha = parseColor(current).alpha;
      const mixForeground = (ink: string, weight: number) => `${mixRgb(current, ink, weight)}${foregroundAlpha}`;
      if (minimum(current) >= minimumRatio) continue;
      if (protectedPairs.get(pair)?.has(mode)) {
        const originals = pair.backgroundKeys.map(key => effective(key, mode));
        const originalLightness = originals.map(value => rgbToOklch(parseColor(value)).lightness);
        const paint = (amount: number) => {
          // A common linear-light factor keeps perceptual hue, relative
          // chroma/lightness and alpha across every stop of the ramp.
          let shades = originals.map(value => shadedControlColor(value, 1 - amount));
          const lightness = shades.map(value => rgbToOklch(parseColor(value)).lightness);
          for (let index = 1; index < shades.length; index += 1) {
            if ((originalLightness[index] - originalLightness[index - 1]) * (lightness[index] - lightness[index - 1]) < 0) {
              // Byte-level hue refinement must never reverse a shade ramp.
              shades = originals.map(value => shadedControlColor(value, 1 - amount, false));
              break;
            }
          }
          shades.forEach((value, index) => { if (!isLocked(pair.backgroundKeys[index], mode)) set(pair.backgroundKeys[index], mode, value); });
        };
        paint(1);
        if (minimum(current) >= minimumRatio + 0.03) {
          let low = 0, high = 1;
          for (let i = 0; i < 24; i += 1) {
            const middle = (low + high) / 2;
            paint(middle);
            if (minimum(current) >= minimumRatio + 0.03) high = middle; else low = middle;
          }
          paint(high); changed = true; continue;
        }
        originals.forEach((value, index) => { if (!isLocked(pair.backgroundKeys[index], mode)) set(pair.backgroundKeys[index], mode, value); });
      }
      const candidates = foregroundLocked(pair, mode) ? [] : ["#000000", "#FFFFFF"].filter(ink => minimum(`${ink}${foregroundAlpha}`) >= minimumRatio + 0.03);
      if (candidates.length > 0) {
        let best = candidates[0], smallest = 2;
        for (const ink of candidates) {
          let low = 0, high = 1;
          for (let i = 0; i < 24; i += 1) {
            const middle = (low + high) / 2;
            if (minimum(mixForeground(ink, middle)) >= minimumRatio + 0.03) high = middle; else low = middle;
          }
          if (high < smallest) { smallest = high; best = mixForeground(ink, high); }
        }
        set(pair.foregroundKey!, mode, best); changed = true; continue;
      }
      // A single foreground cannot contrast with a gradient spanning both very
      // dark and very light stops. Move the ENTIRE ramp toward the same pole,
      // preserving order and relative shading instead of clipping each stop.
      const inkLocked = foregroundLocked(pair, mode);
      const preferWhite = luminance(current) > 0.5;
      const preferredInk = inkLocked ? current : `${preferWhite ? "#FFFFFF" : "#000000"}${foregroundAlpha}`;
      const pole = inkLocked
        ? contrast(composite(current, "#000000"), "#000000") > contrast(composite(current, "#FFFFFF"), "#FFFFFF") ? 0 : 1
        : preferWhite ? 0 : 1;
      const originals = pair.backgroundKeys.map(key => effective(key, mode));
      const paint = (amount: number) => originals.forEach((value, index) => {
        if (isLocked(pair.backgroundKeys[index], mode)) return;
        const rgb = parseColor(value), tone = rgbToOklch(rgb);
        set(pair.backgroundKeys[index], mode, oklchToHex({ ...tone, lightness: tone.lightness + (pole - tone.lightness) * amount, chroma: tone.chroma * (1 - amount) }, rgb.alpha));
      });
      let low = 0, high = 1;
      paint(1);
      if (minimum(preferredInk) < minimumRatio + 0.03) throw new Error(`Could not preserve contrast for ${pair.foregroundKey ?? pair.backgroundKeys.join(",")}.`);
      for (let i = 0; i < 24; i += 1) { const mid = (low + high) / 2; paint(mid); if (minimum(preferredInk) >= minimumRatio + 0.03) high = mid; else low = mid; }
      paint(high); if (pair.foregroundKey) set(pair.foregroundKey, mode, preferredInk); changed = true;
    }
    if (!changed) break;
  }
  // Shared roles can make constraints interact. Never return a partially
  // converged composition merely because the bounded correction loop ended.
  for (const mode of MODES) for (const pair of pairs) {
    if (!applies(pair, mode)) continue;
    const { minimumRatio, minimum } = inspect(pair, mode);
    if (minimum(foreground(pair, mode)) + 1e-6 < minimumRatio) {
      throw new Error(`Could not preserve contrast for ${pair.foregroundKey ?? pair.backgroundKeys.join(",")}.`);
    }
  }
}

/** Recheck the final composition after manual edits, without changing any of
 * those edits. Automatic corrections become part of the next saved baseline. */
export function reconcilePublisherAppPaletteContrast({
  colorOverrides,
  generatedColorOverrides,
  lockedOverrides,
  options,
  contrastPairs = [],
}: {
  colorOverrides: Record<string, PublisherAppColorOverride>;
  generatedColorOverrides: Record<string, PublisherAppColorOverride>;
  lockedOverrides: OverrideLocks;
  options: PublisherAppColorCatalogOption[];
  contrastPairs?: PublisherAppColorContrastPair[];
}) {
  const byKey = new Map(options.map(option => [option.key, option]));
  const values = new Map(options.map(option => [option.key, { ...colorOverrides[option.key] }]));
  const changed = new Map(MODES.map(mode => [mode, new Set(options.filter(option =>
    lockedOverrides[option.key]?.[mode] ||
    (colorOverrides[option.key]?.[mode] ?? originalValue(option, mode)) !==
      (generatedColorOverrides[option.key]?.[mode] ?? originalValue(option, mode)),
  ).map(option => option.key))]));
  const relationships: ContrastPair[] = [...functionalContrastPairs(byKey), ...contrastPairs].filter(pair =>
    !pair.backgroundKeys.some(restoresGenesAccent) &&
    !(pair.foregroundKey && isFixedForeground(pair.foregroundKey)),
  );
  const affectedPairs = relationships.flatMap(pair =>
    MODES.filter(mode => {
      if (pair.modes && !pair.modes.includes(mode)) return false;
      const translucent = pair.backgroundKeys.some(key =>
        rgba(colorOverrides[key]?.[mode] ?? originalValue(byKey.get(key)!, mode)).opacity < 1 ||
        rgba(generatedColorOverrides[key]?.[mode] ?? originalValue(byKey.get(key)!, mode)).opacity < 1,
      );
      const dependencies = [pair.foregroundKey, ...pair.backgroundKeys];
      if (translucent) dependencies.push("app.background", `${(pair.foregroundKey ?? pair.backgroundKeys[0]).split(".").slice(0, -1).join(".")}.backgroundBase`);
      return dependencies.some(key => key && changed.get(mode)?.has(key));
    }).map(mode => ({ ...pair, modes: [mode] })),
  );
  applyContrastPairs(values, byKey, affectedPairs, lockedOverrides);
  const result = Object.fromEntries(Object.entries(colorOverrides).map(([key, value]) => [key, { ...value }]));
  const baseline = Object.fromEntries(Object.entries(generatedColorOverrides).map(([key, value]) => [key, { ...value }]));
  for (const [key, modes] of values) for (const mode of MODES) {
    const before = colorOverrides[key]?.[mode] ?? originalValue(byKey.get(key)!, mode);
    const after = modes[mode] ?? originalValue(byKey.get(key)!, mode);
    if (lockedOverrides[key]?.[mode] || before === after) continue;
    if (after === originalValue(byKey.get(key)!, mode)) {
      if (result[key]) delete result[key][mode];
      if (baseline[key]) delete baseline[key][mode];
    } else {
      result[key] = { ...result[key], [mode]: after };
      baseline[key] = { ...baseline[key], [mode]: after };
    }
  }
  // Fixed text wins even over an old manual dark/transparent text override.
  // This final assignment never reruns background or gradient corrections.
  for (const key of FIXED_FOREGROUND_KEYS) {
    if (!byKey.has(key)) continue;
    result[key] = { light: "#FFFFFF", dark: "#FFFFFF" };
    baseline[key] = { light: "#FFFFFF", dark: "#FFFFFF" };
  }
  const nonempty = (map: Record<string, PublisherAppColorOverride>) => Object.fromEntries(Object.entries(map).filter(([, modes]) => modes.light || modes.dark));
  return { colorOverrides: nonempty(result), generatedColorOverrides: nonempty(baseline) };
}

function functionalContrastPairs(byKey: Map<string, PublisherAppColorCatalogOption>, protectBrightSurfaces = true): ContrastPair[] {
  const pairs: ContrastPair[] = [
    { foregroundKey: "app.accent", backgroundKeys: ["app.background", "app.surface"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "app.profileAccent", backgroundKeys: ["app.profileBackground"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "app.profileIcon", backgroundKeys: ["app.profileBackground"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "app.funHeaderChevron", backgroundKeys: ["app.background"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "brand.serviceButtonInk", backgroundKeys: ["serviceInfo.canvas"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "serviceInfo.tealInk", backgroundKeys: ["serviceInfo.mintSurface"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "serviceInfo.violetInk", backgroundKeys: ["serviceInfo.lavenderSurface"], minimumRatio: 4.5, preserveOriginal: true },
    { foregroundKey: "brand.accentText", backgroundKeys: ["brand.accentSurface"], minimumRatio: 4.5, preserveOriginal: true },
    ...["Primary", "Secondary", "Background", "Surface", "SurfaceVariant"].map(name => ({ foregroundKey: `android.material.on${name}`, backgroundKeys: [`android.material.${name[0].toLowerCase()}${name.slice(1)}`], minimumRatio: 4.5, preserveOriginal: true })),
    ...["friends", "genes", "circles", "search"].map(name => ({ foregroundKey: `community.quickActions.${name}.foreground`, backgroundKeys: ["start", "middle", "end"].map(stop => `community.quickActions.${name}.${stop}`), minimumRatio: 4.5, preserveOriginal: true })),
  ];
  const levelKeys = [...byKey.keys()].filter(key => /^learn\.level\.[^.]+\.(accent|gradientEnd)$/.test(key));
  if (levelKeys.length) {
    // Learn's native colored-header contrast policy targets 2.5. Include
    // neutral custom brands too, for which a hue-based native check cannot help.
    pairs.push({ foregroundKey: "learn.header.foreground", backgroundKeys: levelKeys, minimumRatio: 2.5 });
  }
  if (protectBrightSurfaces) {
    pairs.push({ foregroundKey: "discover.requestLauncher.foreground", backgroundKeys: ["Start", "Middle", "End"].map(stop => `discover.requestLauncher.ribbon${stop}`), minimumRatio: 4.5, brightOnly: true });
    const whiteFill = (backgroundKeys: string[]): ContrastPair => ({ foregroundColor: "#FFFFFF", backgroundKeys, minimumRatio: 4.5 });
    pairs.push(
      whiteFill(["brand.primary", "brand.primaryStrong", "brand.primaryDeep"]),
      ...["brand.secondary", "brand.accent", "brand.editorialAccent"].map(key => whiteFill([key])),
      whiteFill(["brand.welcomeGradientStart", "brand.welcomeGradientEnd"]),
      ...["brand.reportCardArrow", "brand.highEnergyAccent", "brand.serviceFeatureSurface"].map(key => whiteFill([key])),
      { ...whiteFill(["app.profileAccent", "app.accentGradientEnd"]), modes: ["light"], canvasColor: "#FFFFFF", backgroundOpacities: { light: [1, 0.85] } },
      { ...whiteFill(["app.profileAccent"]), modes: ["dark"] },
      ...["reports", "learn", "discover", "community", "profile"].map(tab => ({
        ...whiteFill([`tabs.${tab}.start`, `tabs.${tab}.end`]),
        // Native capsules draw these stops over material at different opacities.
        // White is the conservative material backing for a contained white label.
        canvasColor: "#FFFFFF",
        backgroundOpacities: { light: [0.78, 0.68], dark: [0.72, 0.62] },
      })),
    );
  }
  return pairs.flatMap(pair => {
    if (pair.foregroundKey && !byKey.has(pair.foregroundKey)) return [];
    const backgroundKeys = pair.backgroundKeys.filter(key => byKey.has(key));
    if (!backgroundKeys.length || (pair.foregroundKey && backgroundKeys.length !== pair.backgroundKeys.length)) return [];
    const backgroundOpacities = pair.backgroundOpacities && Object.fromEntries(MODES.map(mode => [mode, backgroundKeys.map(key => pair.backgroundOpacities?.[mode]?.[pair.backgroundKeys.indexOf(key)] ?? 1)]));
    return [{ ...pair, backgroundKeys, backgroundOpacities }];
  });
}

function createPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[],
  contrastPairs: PublisherAppColorContrastPair[],
  protectBrightSurfaces: boolean,
  selective = true,
  restoreGenes = false,
  fixQuickActionText = false,
  anchorQuickActionBackgrounds = false,
  fixGenesPrimaryActionForeground = false,
): PublisherAppPaletteOverridePlan {
  if (options.length === 0) throw new Error("The color catalog is too small to build the palette plan.");
  const values = new Map<string, PublisherAppColorOverride>();
  const byKey = new Map(options.map(option => [option.key, option]));
  const seeds = { primary: normalizedSeed(colors.primary), secondary: normalizedSeed(colors.secondary), tertiary: normalizedSeed(colors.tertiary) };
  for (const mode of MODES) {
    const families = buildFamilies(colors, options, alternativeTonalFlows, mode);
    for (const option of options) {
      const original = originalValue(option, mode), rgb = parseColor(original), tone = rgbToOklch(rgb);
      const local = families.roleFamilies.get(option.key);
      let family = local ?? families.gradientFamilies.get(option.key) ?? analogousFamilyForHue(tone.hue, families.primary);
      const baseDirect = option.key === "brand.primary" || option.key === "android.material.primary" ? "primary" : option.key === "brand.secondary" || option.key === "android.material.secondary" ? "secondary" : option.key === "brand.accent" || option.key === "android.material.tertiary" ? "tertiary" : null;
      let result = original;
      if (baseDirect) result = `${seeds[baseDirect]}${rgb.alpha}`;
      // Illustration destinations already resolve the exact brand/counterpoint
      // candidates natively. A generic automatic override would mask that
      // resolver; explicit manual illustration overrides are merged afterwards.
      else if (option.group !== "Illustrations" && !semantic(option) && !deepStructure(option, tone, mode) && tone.chroma > ACHROMATIC_CHROMA) {
        const learnBackground = option.group === "Learn background";
        const levelOne = /^learn\.level\.bacteria\./.test(option.key) || /^tabs\.learn\./.test(option.key);
        const interfaceTone = /^app\.(?:accent(?:[A-Z].*)?|profileAccent(?:Background)?|profileIcon|profileRippleFill|funHeaderChevron)$/.test(option.key);
        if (learnBackground) family = families.learn;
        else if (levelOne) family = families.firstLevel;
        else if (interfaceTone) family = families.interfaceFamily;
        else if (/^brand\.accent(?:Surface|Text)$/.test(option.key)) family = families.tertiary;
        const environmental = interfaceTone || learnBackground || option.group === "Screen surfaces and atmosphere" || /\b(background|surface|canvas|shadow|glow|orb|halo|veil|text|ink|foreground)\b/i.test(identity(option)) || /^services\.gradient/.test(option.key);
        if (local || interfaceTone || learnBackground || levelOne || families.gradientMembers.has(option.key) || tone.chroma > QUIET_CHROMA) result = transform(tone, rgb.alpha, family, environmental);
      }
      values.set(option.key, { ...values.get(option.key), [mode]: result });
    }
  }
  applyContrastPairs(values, byKey, [...functionalContrastPairs(byKey, protectBrightSurfaces), ...contrastPairs], {}, protectBrightSurfaces, selective);
  if (restoreGenes) {
    const genesRoles = new Set(alternativeTonalFlows.find(flow => flow.id === "communityGenes")?.roleKeys ?? []);
    for (const [key, color] of Object.entries(RESTORED_GENES_ACCENTS)) {
      if (!genesRoles.has(key) || !byKey.has(key)) continue;
      const option = byKey.get(key)!;
      values.set(key, Object.fromEntries(MODES.map(mode => [mode, `${color}${parseColor(originalValue(option, mode)).alpha}`])));
    }
  }
  if (anchorQuickActionBackgrounds) applyQuickActionBackgrounds(values, byKey, colors);
  if (fixQuickActionText) {
    for (const key of FIXED_QUICK_ACTION_TEXT_KEYS) {
      if (byKey.has(key)) values.set(key, { light: "#FFFFFF", dark: "#FFFFFF" });
    }
  }
  if (fixGenesPrimaryActionForeground && byKey.has(GENES_PRIMARY_ACTION_FOREGROUND_KEY)) {
    values.set(GENES_PRIMARY_ACTION_FOREGROUND_KEY, { light: "#FFFFFF", dark: "#FFFFFF" });
  }
  const colorOverrides = Object.fromEntries([...values.entries()].map(([key, value]) => [key, Object.fromEntries(MODES.filter(mode => (fixQuickActionText && isFixedQuickActionText(key)) || (fixGenesPrimaryActionForeground && key === GENES_PRIMARY_ACTION_FOREGROUND_KEY) || value[mode] !== originalValue(byKey.get(key)!, mode)).map(mode => [mode, value[mode]]))] as const).filter(([, value]) => Object.keys(value).length > 0).sort(([a], [b]) => a.localeCompare(b)));
  return { catalogVersion, sourceCount: options.length, selectedCount: Object.keys(colorOverrides).length, colorOverrides };
}

export function createPublisherAppPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, true, true, true, true, true, true);
}

/** Frozen 3.637 results identify prior automatic values without changing manual edits. */
export function createPublisherAppPreGenesForegroundPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, true, true, true, true, true);
}

/** Recognize old automatic values when there is no saved generated baseline. */
export function createPublisherAppPreviousPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, false);
}

/** Frozen 3.631 contrast policy, used only to recognize its generated values. */
export function createPublisherAppOverdarkenedPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, true, false);
}

/** Frozen 3.632 results identify old automatic values without changing manual edits. */
export function createPublisherAppPreGenesRestorePaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, true);
}

/** Frozen 3.633 generated values, including the original fixed Genes accents. */
export function createPublisherAppPreQuickTextPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, true, true, true);
}

/** Frozen 3.634 background results identify previous automatic tile colors. */
export function createPublisherAppPreQuickBackgroundPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
): PublisherAppPaletteOverridePlan {
  return createPaletteOverridePlan(colors, options, catalogVersion, alternativeTonalFlows, contrastPairs, true, true, true, true);
}
