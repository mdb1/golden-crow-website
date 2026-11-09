import { defaultPublisherAppAdvancedConfiguration } from "../lib/publisher-app-advanced-config.js";
import { buildPublisherAppRuntimeConfig } from "../lib/publisher-app-runtime-config.js";

const semanticColors = {
  primary: "#101010",
  primaryStrong: "#202020",
  primaryDeep: "#303030",
  primarySoft: "#404040",
  secondary: "#505050",
  accent: "#606060",
  accentTextLight: "#707070",
  accentTextDark: "#808080",
  accentSurfaceLight: "#F0F0F0",
};
const baseColors = { primary: "#F97316", secondary: "#123456", tertiary: "#FEDCBA" };
const derivedSemanticColors = {
  primary: "#F97316",
  primaryStrong: "#DB6513",
  primaryDeep: "#B85510",
  primarySoft: "#FCB686",
  secondary: "#123456",
  accent: "#FEDCBA",
  accentTextLight: "#B79E86",
  accentTextDark: "#FEE9D4",
  accentSurfaceLight: "#FFFCF8",
};

const fixedWhiteForegrounds = {
  "community.genes.primaryActionForeground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.friends.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.genes.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.circles.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.search.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
};

describe.each([
  ["active", false], ["active", true],
  ["active_for_testing", false], ["active_for_testing", true],
] as const)("runtime counterpoint transport (status: %s, stored semantic colors: %s)", (status, storedSemanticColors) => {
  const source: Parameters<typeof buildPublisherAppRuntimeConfig>[0] = {
    id: "organization_example",
    schemaVersion: 1,
    publisherKind: "organization",
    publisherId: "example",
    publisherName: "Example",
    publisherEmail: "publisher@example.org",
    publisherUsername: "example",
    catalogEnabled: true,
    feedEnabled: true,
    status,
    appProviderIdentifier: "app_org_example_12345",
    runtimeRevision: 3,
    platformOption: "ios_android",
    connectEnabled: true,
    profileEnabled: true,
    learnCustomizationEnabled: false,
    colors: baseColors,
    iconSource: "publisher",
    iconImageUrl: null,
    iconImageUploadDataUrl: null,
    createdAt: "2026-11-07T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
    createdByUserId: "operator",
    updatedByUserId: "operator",
    advancedConfiguration: {
      ...defaultPublisherAppAdvancedConfiguration({ kind: "organization", id: "example", name: "Example" }),
      semanticColors: storedSemanticColors ? semanticColors : null,
      colorOverrides: { "brand.primary": { light: "#112233", dark: "#445566" } },
    },
  };

  it.each(["absent", "partial", "dark or translucent"])("publishes opaque white fixed foregrounds with %s stored overrides without changing other colors", (caseName) => {
    const untouched = {
      "community.quickActions.friends.start": { light: "#A08000", dark: "#23456780" },
      "community.quickActions.genes.bezel": { light: "#004455", dark: "#004455" },
      "community.genes.primary": { light: "#00A88A", dark: "#00A88A" },
      "community.genes.primaryActionFill": { light: "#00A88A", dark: "#5EEAD4" },
      "community.genes.secondaryActionForeground": { light: "#123456", dark: "#65432180" },
      "illustration.primaryTone": { light: "#123456", dark: "#654321" },
    };
    const stored = caseName === "absent" ? {} : caseName === "partial"
      ? { "community.quickActions.friends.foreground": { light: "#000000" }, "community.genes.primaryActionForeground": { dark: "#042F2E" } }
      : Object.fromEntries(Object.keys(fixedWhiteForegrounds).map(key => [key, { light: "#00000040", dark: "#11223380" }]));
    const sourceWithOverrides = {
      ...source,
      advancedConfiguration: { ...source.advancedConfiguration, colorOverrides: { ...untouched, ...stored } },
    };
    const before = structuredClone(sourceWithOverrides);
    const runtime = buildPublisherAppRuntimeConfig(sourceWithOverrides);
    expect(runtime.branding.colorOverrides).toEqual({ ...untouched, ...fixedWhiteForegrounds });
    expect(sourceWithOverrides).toEqual(before);
    expect(runtime.branding.colors).toEqual(storedSemanticColors ? semanticColors : derivedSemanticColors);
  });

  it("includes all fixed foreground overrides even when the stored override map is empty", () => {
    const runtime = buildPublisherAppRuntimeConfig({
      ...source,
      advancedConfiguration: { ...source.advancedConfiguration, colorOverrides: {} },
    });
    expect(runtime.branding.colorOverrides).toEqual(fixedWhiteForegrounds);
  });

  it.each([
    {},
    { counterpointClockwise: "#012345" },
    { counterpointAnticlockwise: "#6789AB" },
    { counterpointClockwise: "#012345", counterpointAnticlockwise: "#6789AB" },
  ])("preserves the supplied counterpoints and omits absent values: %j", (counterpoints) => {
    const runtime = buildPublisherAppRuntimeConfig({ ...source, colors: { ...baseColors, ...counterpoints } });
    const expectedColors = { ...(storedSemanticColors ? semanticColors : derivedSemanticColors), ...counterpoints };
    expect(runtime.branding.colors).toEqual(expectedColors);
    expect(JSON.parse(JSON.stringify(runtime)).branding.colors).toEqual(expectedColors);
    for (const key of ["counterpointClockwise", "counterpointAnticlockwise"] as const) {
      expect(Object.hasOwn(runtime.branding.colors, key)).toBe(Object.hasOwn(counterpoints, key));
    }
    const baseline = buildPublisherAppRuntimeConfig(source);
    expect(runtime).toEqual({
      ...baseline,
      branding: { ...baseline.branding, colors: expectedColors },
    });
  });
});
