import { publisherAppColorsWithCounterpoints, type PublisherAppColorOverride } from "@/lib/publisher-app-config";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreQuickTextPaletteOverridePlan,
  reconcilePublisherAppPaletteContrast,
} from "@/lib/publisher-app-palette-overrides";

const catalog = getPublisherAppColorCatalog();
const textRoles = ["friends", "genes", "circles", "search"].map(action => `community.quickActions.${action}.foreground`);
const fixedTextRoles = new Set(textRoles);
const redesignedBackgroundRoles = new Set(["friends", "genes", "circles", "search"].flatMap(action =>
  ["start", "middle", "end", "bezel"].map(stop => `community.quickActions.${action}.${stop}`),
));
const white = { light: "#FFFFFF", dark: "#FFFFFF" };

const palettes = [
  { name: "green", primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" },
  { name: "yellow", primary: "#FFFF00", secondary: "#FFFF00", tertiary: "#FFFF00" },
  { name: "ochre", primary: "#A08000", secondary: "#9A7B00", tertiary: "#776000" },
  { name: "blue", primary: "#1D4ED8", secondary: "#EC4899", tertiary: "#14B8A6" },
  { name: "pastel", primary: "#D8C7C0", secondary: "#D2DCE6", tertiary: "#CDDCCE" },
  { name: "black", primary: "#000000", secondary: "#000000", tertiary: "#000000" },
];

function withoutText(overrides: Record<string, PublisherAppColorOverride>) {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => !fixedTextRoles.has(key)));
}

function planFor(palette = palettes[0], previous = false) {
  const generate = previous ? createPublisherAppPreQuickTextPaletteOverridePlan : createPublisherAppPaletteOverridePlan;
  return generate(
    publisherAppColorsWithCounterpoints(palette), catalog.options, catalog.catalogVersion,
    catalog.alternativeTonalFlows, catalog.contrastPairs,
  );
}

describe.each(palettes)("fixed quick-action text with a $name palette", palette => {
  const plan = planFor(palette);

  it("emits all four text overrides as explicit opaque white in both appearances", () => {
    for (const key of textRoles) expect(plan.colorOverrides[key]).toEqual(white);
    expect(plan.selectedCount).toBe(Object.keys(plan.colorOverrides).length);
  });

  it("preserves Genes and unrelated roles outside the separately redesigned quick-action backgrounds", () => {
    // Genes primary-action white is a later, separately verified exception.
    const unrelated = (overrides: Record<string, PublisherAppColorOverride>) => Object.fromEntries(
      Object.entries(withoutText(overrides)).filter(([key]) => !redesignedBackgroundRoles.has(key) && key !== "community.genes.primaryActionForeground"),
    );
    expect(unrelated(plan.colorOverrides)).toEqual(unrelated(planFor(palette, true).colorOverrides));
  });
});

it.each(["#000000", "#777777", "#00FF0000", "#FFFFFF80"])(
  "replaces stale or manually selected text %s without recoloring anything else", color => {
    const plan = planFor();
    const current = {
      ...plan.colorOverrides,
      ...Object.fromEntries(textRoles.map(key => [key, { light: color, dark: color }])),
      "community.genes.primary": { light: "#005244", dark: "#00524480" },
      "learn.background.leadingGlow": { light: "#11223380" },
    };
    const before = structuredClone(current);
    const lockedOverrides = {
      ...Object.fromEntries(textRoles.map(key => [key, { light: true as const, dark: true as const }])),
      "community.genes.primary": { light: true as const, dark: true as const },
      "learn.background.leadingGlow": { light: true as const },
    };
    const result = reconcilePublisherAppPaletteContrast({
      colorOverrides: current, generatedColorOverrides: plan.colorOverrides,
      lockedOverrides, options: catalog.options, contrastPairs: catalog.contrastPairs,
    });
    for (const key of textRoles) {
      expect(result.colorOverrides[key]).toEqual(white);
      expect(result.generatedColorOverrides[key]).toEqual(white);
    }
    expect(withoutText(result.colorOverrides)).toEqual(withoutText(current));
    expect(withoutText(result.generatedColorOverrides)).toEqual(withoutText(plan.colorOverrides));
    expect(current).toEqual(before);
  },
);

it("fills missing text appearances and preserves the corrected composition on later checks", () => {
  const plan = planFor();
  const current = {
    ...plan.colorOverrides,
    [textRoles[0]]: { light: "#000000" },
    [textRoles[1]]: { dark: "#12345600" },
  };
  const first = reconcilePublisherAppPaletteContrast({
    colorOverrides: current, generatedColorOverrides: plan.colorOverrides,
    lockedOverrides: { [textRoles[0]]: { light: true }, [textRoles[1]]: { dark: true } },
    options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  const second = reconcilePublisherAppPaletteContrast({
    colorOverrides: first.colorOverrides, generatedColorOverrides: first.generatedColorOverrides,
    lockedOverrides: {}, options: catalog.options, contrastPairs: catalog.contrastPairs,
  });
  for (const key of textRoles) expect(first.colorOverrides[key]).toEqual(white);
  expect(withoutText(first.colorOverrides)).toEqual(withoutText(plan.colorOverrides));
  expect(second).toEqual(first);
});
