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
