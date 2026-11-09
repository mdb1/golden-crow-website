import { createHash } from "node:crypto";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { publisherAppColorsWithCounterpoints } from "@/lib/publisher-app-config";
import { createPublisherAppPaletteOverridePlan, createPublisherAppPreQuickTextPaletteOverridePlan, reconcilePublisherAppPaletteContrast } from "@/lib/publisher-app-palette-overrides";

const catalog = getPublisherAppColorCatalog();
const optionsByKey = new Map(catalog.options.map(option => [option.key, option]));
const appearances = ["light", "dark"] as const;
type Appearance = typeof appearances[number];
type Plan = ReturnType<typeof createPublisherAppPaletteOverridePlan>;

// Exact chromatic overrides emitted by the frozen v5 fixed Genes flow,
// extended onto the corresponding newer header and action accent roles.
const historicalGenes = {
  "community.genes.primary": { light: "#00A88A", dark: "#00A88A" },
  "community.genes.secondary": { light: "#008372", dark: "#008372" },
  "community.genes.highlight": { light: "#009280", dark: "#009280" },
  "community.genes.progressStart": { light: "#2CB899", dark: "#2CB899" },
  "community.genes.progressEnd": { light: "#00B399", dark: "#00B399" },
  "community.genes.focus.diagnosed": { light: "#2CB899", dark: "#2CB899" },
  "community.genes.focus.candidate": { light: "#00907E", dark: "#00907E" },
  "community.genes.focus.carrier": { light: "#09BB8F", dark: "#09BB8F" },
  "community.genes.focus.family": { light: "#00A894", dark: "#00A894" },
  "community.genes.focus.research": { light: "#00B399", dark: "#00B399" },
  "community.genes.headerStart": { light: "#00A88A", dark: "#00A88A" },
  "community.genes.headerMiddle": { light: "#2CB899", dark: "#2CB899" },
  "community.genes.headerEnd": { light: "#00B399", dark: "#00B399" },
  "community.genes.primaryActionFill": { light: "#00A88A", dark: "#00A88A" },
  "community.genes.secondaryActionFill": { light: "#008372", dark: "#008372" },
  "community.genes.visibilityAccent": { light: "#009280", dark: "#009280" },
} as const;
const restoredKeys = new Set(Object.keys(historicalGenes));
const laterQuickActionRoles = ["friends", "genes", "circles", "search"].flatMap(action =>
  ["foreground", "start", "middle", "end", "bezel"].map(part => `community.quickActions.${action}.${part}`),
);

// Canonical non-restored projections from committed b91fa88c protect every
// other role (including Genes text/foundations and quick actions) without
// 600 fixture rows.
const palettes = [
  { name: "bright green", primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820", hash: "f05356479fdbe8b79df2e3149c53f40f736e33a2d5f0dbc80eda057c991d5651" },
  { name: "yellow", primary: "#FFFF00", secondary: "#FFFF00", tertiary: "#FFFF00", hash: "a2c596b6a4ebe797e472f3fa11c4a697004c2863e009fca1391f7393168ccba5" },
  { name: "orange", primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220", hash: "ba4039313f2a62b8169d25168b10767e4964b73f2b0192437c5433f8ef3b71dc" },
  { name: "blue", primary: "#1D4ED8", secondary: "#EC4899", tertiary: "#14B8A6", hash: "581161512bab8e97f90ac075829e9c6769d1b128543006a61c8fe984ec61cb55" },
  { name: "pastel", primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE", hash: "73feb45b369548a7cc41fccae09dae0dfea589d7aeee90994dad86c87fefc216" },
  { name: "black", primary: "#000000", secondary: "#000000", tertiary: "#000000", hash: "53bc17da0832c129d9c8d11d5387ef6839117018f0ab3baa4e18beded9b0a868" },
];

function effective(plan: Plan, key: string, mode: Appearance) {
  const option = optionsByKey.get(key)!;
  return plan.colorOverrides[key]?.[mode] ?? (mode === "light" ? option.defaultLightColor : option.defaultDarkColor);
}

function unaffectedHash(plan: Plan, previous: Plan) {
  // Normalize only the subsequently fixed text and redesigned quick-action
  // backgrounds and the subsequently fixed Genes action foreground before
  // checking the original b91 fixture. Every other role remains protected.
  const overrides = { ...plan.colorOverrides };
  for (const key of [...laterQuickActionRoles, "community.genes.primaryActionForeground"]) {
    if (previous.colorOverrides[key]) overrides[key] = previous.colorOverrides[key];
    else delete overrides[key];
  }
  const projection = Object.fromEntries(Object.entries(overrides)
    .filter(([key]) => !restoredKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, modes]) => [key, Object.fromEntries(Object.entries(modes).sort(([a], [b]) => a.localeCompare(b)))]));
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

function createPlan(palette = palettes[0]) {
  return createPublisherAppPaletteOverridePlan(
    publisherAppColorsWithCounterpoints(palette), catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
}

describe.each(palettes)("fixed Genes cyan/green flow with a $name app", palette => {
  const plan = createPlan(palette);
  const previous = createPublisherAppPreQuickTextPaletteOverridePlan(
    publisherAppColorsWithCounterpoints(palette), catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );

  it("restores the historical saturated Genes colors independently of the app palette", () => {
    for (const [key, colors] of Object.entries(historicalGenes)) {
      for (const mode of appearances) {
        expect({ key, mode, value: effective(plan, key, mode) }).toEqual({ key, mode, value: colors[mode] });
      }
    }
  });

  it("leaves every other role unchanged apart from the separately scoped quick-action row", () => {
    expect(unaffectedHash(plan, previous)).toBe(palette.hash);
  });

  it("retains the restored automatic colors through final reconciliation", () => {
    const result = reconcilePublisherAppPaletteContrast({
      colorOverrides: plan.colorOverrides, generatedColorOverrides: plan.colorOverrides,
      lockedOverrides: {}, options: catalog.options, contrastPairs: catalog.contrastPairs,
    });
    expect(result.colorOverrides).toEqual(plan.colorOverrides);
    expect(result.generatedColorOverrides).toEqual(plan.colorOverrides);
  });
});

it("preserves manual light/dark Genes overrides when the fixed automatic flow is reapplied", () => {
  const plan = createPlan();
  const current = {
    ...plan.colorOverrides,
    "community.genes.primary": { light: "#005244", dark: "#00524480" },
    "community.genes.cardBorder": { ...plan.colorOverrides["community.genes.cardBorder"], light: "#22445588" },
    "community.genes.focus.family": { ...plan.colorOverrides["community.genes.focus.family"], dark: "#006F5C" },
  };
  const result = reconcilePublisherAppPaletteContrast({
    colorOverrides: current, generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: {
      "community.genes.primary": { light: true, dark: true },
      "community.genes.cardBorder": { light: true },
      "community.genes.focus.family": { dark: true },
    },
    options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  expect(result.colorOverrides["community.genes.primary"]).toEqual(current["community.genes.primary"]);
  expect(result.colorOverrides["community.genes.cardBorder"]).toEqual(current["community.genes.cardBorder"]);
  expect(result.colorOverrides["community.genes.focus.family"]).toEqual(current["community.genes.focus.family"]);
  expect(result.generatedColorOverrides["community.genes.primary"]).toEqual(plan.colorOverrides["community.genes.primary"]);
  expect(result.generatedColorOverrides["community.genes.cardBorder"]).toEqual(plan.colorOverrides["community.genes.cardBorder"]);
  expect(result.generatedColorOverrides["community.genes.focus.family"]).toEqual(plan.colorOverrides["community.genes.focus.family"]);
});
