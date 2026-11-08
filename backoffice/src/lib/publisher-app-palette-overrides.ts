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
type ContrastPair = PublisherAppColorContrastPair & { preserveOriginal?: boolean };
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
      // The six explicit base roles below still receive the exact chosen RGB.
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

function applyContrastPairs(values: Map<string, PublisherAppColorOverride>, byKey: Map<string, PublisherAppColorCatalogOption>, pairs: ContrastPair[], locked: OverrideLocks = {}) {
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
  const inspect = (pair: ContrastPair, mode: Appearance) => {
    if (!byKey.has(pair.foregroundKey) || pair.backgroundKeys.some(key => !byKey.has(key))) throw new Error(`Invalid contrast relationship: ${pair.foregroundKey}`);
    const prefix = pair.foregroundKey.slice(0, pair.foregroundKey.lastIndexOf("."));
    const canvasKey = byKey.has(`${prefix}.backgroundBase`) ? `${prefix}.backgroundBase` : "app.background";
    const canvas = composite(effective(canvasKey, mode), mode === "light" ? "#FFFFFF" : "#12141A");
    const originalCanvas = composite(byKey.has(canvasKey) ? originalValue(byKey.get(canvasKey)!, mode) : mode === "light" ? "#FFFFFF" : "#12141A", mode === "light" ? "#FFFFFF" : "#12141A");
    const minimumRatio = pair.preserveOriginal ? Math.min(pair.minimumRatio, ...pair.backgroundKeys.map(key => {
      const bg = key === canvasKey ? originalCanvas : composite(originalValue(byKey.get(key)!, mode), originalCanvas);
      return contrast(composite(originalValue(byKey.get(pair.foregroundKey)!, mode), bg), bg);
    })) : pair.minimumRatio;
    let sampledRevision = -1;
    let cachedSamples: Array<{ hex: string; luminance: number }> = [];
    const backgrounds = () => {
      if (sampledRevision === valueRevision) return cachedSamples;
      // The canvas is already composited over the window. Drawing it over
      // itself again would double a manual background's opacity.
      const stops = pair.backgroundKeys.map(key => key === canvasKey ? canvas : composite(effective(key, mode), canvas));
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
      const { minimumRatio, minimum } = inspect(pair, mode);
      const current = effective(pair.foregroundKey, mode);
      const foregroundAlpha = parseColor(current).alpha;
      const mixForeground = (ink: string, weight: number) => `${mixRgb(current, ink, weight)}${foregroundAlpha}`;
      if (minimum(current) >= minimumRatio) continue;
      const candidates = isLocked(pair.foregroundKey, mode) ? [] : ["#000000", "#FFFFFF"].filter(ink => minimum(`${ink}${foregroundAlpha}`) >= minimumRatio + 0.03);
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
        set(pair.foregroundKey, mode, best); changed = true; continue;
      }
      // A single foreground cannot contrast with a gradient spanning both very
      // dark and very light stops. Move the ENTIRE ramp toward the same pole,
      // preserving order and relative shading instead of clipping each stop.
      const foregroundLocked = isLocked(pair.foregroundKey, mode);
      const preferWhite = luminance(current) > 0.5;
      const preferredInk = foregroundLocked ? current : `${preferWhite ? "#FFFFFF" : "#000000"}${foregroundAlpha}`;
      const pole = foregroundLocked
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
      if (minimum(preferredInk) < minimumRatio + 0.03) throw new Error(`Could not preserve contrast for ${pair.foregroundKey}.`);
      for (let i = 0; i < 24; i += 1) { const mid = (low + high) / 2; paint(mid); if (minimum(preferredInk) >= minimumRatio + 0.03) high = mid; else low = mid; }
      paint(high); set(pair.foregroundKey, mode, preferredInk); changed = true;
    }
    if (!changed) break;
  }
  // Shared roles can make constraints interact. Never return a partially
  // converged composition merely because the bounded correction loop ended.
  for (const mode of MODES) for (const pair of pairs) {
    const { minimumRatio, minimum } = inspect(pair, mode);
    if (minimum(effective(pair.foregroundKey, mode)) + 1e-6 < minimumRatio) {
      throw new Error(`Could not preserve contrast for ${pair.foregroundKey}.`);
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
  applyContrastPairs(values, byKey, [...functionalContrastPairs(byKey), ...contrastPairs], lockedOverrides);
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
  const nonempty = (map: Record<string, PublisherAppColorOverride>) => Object.fromEntries(Object.entries(map).filter(([, modes]) => modes.light || modes.dark));
  return { colorOverrides: nonempty(result), generatedColorOverrides: nonempty(baseline) };
}

function functionalContrastPairs(byKey: Map<string, PublisherAppColorCatalogOption>): ContrastPair[] {
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
  return pairs.filter(pair => byKey.has(pair.foregroundKey) && pair.backgroundKeys.every(key => byKey.has(key)));
}

export function createPublisherAppPaletteOverridePlan(
  colors: PublisherAppColors,
  options: PublisherAppColorCatalogOption[],
  catalogVersion: number,
  alternativeTonalFlows: PublisherAppAlternativeTonalFlow[] = [],
  contrastPairs: PublisherAppColorContrastPair[] = [],
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
  applyContrastPairs(values, byKey, [...functionalContrastPairs(byKey), ...contrastPairs]);
  const colorOverrides = Object.fromEntries([...values.entries()].map(([key, value]) => [key, Object.fromEntries(MODES.filter(mode => value[mode] !== originalValue(byKey.get(key)!, mode)).map(mode => [mode, value[mode]]))] as const).filter(([, value]) => Object.keys(value).length > 0).sort(([a], [b]) => a.localeCompare(b)));
  return { catalogVersion, sourceCount: options.length, selectedCount: Object.keys(colorOverrides).length, colorOverrides };
}
