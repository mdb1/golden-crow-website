import { getServerSession } from "next-auth";
import { POST } from "../route";
import { publisherAppColorsWithCounterpoints, publisherAppPreviousCounterpointColors, publisherAppSupersededCounterpointColors } from "@/lib/publisher-app-config";
import { getLegacyPublisherAppColorCatalog, getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import {
  createPublisherAppPaletteOverridePlan,
  createPublisherAppPreviousPaletteOverridePlan,
  createPublisherAppOverdarkenedPaletteOverridePlan,
  createPublisherAppPreGenesRestorePaletteOverridePlan,
  createPublisherAppPreQuickBackgroundPaletteOverridePlan,
  createPublisherAppPreLearnHeaderPaletteOverridePlan,
} from "@/lib/publisher-app-palette-overrides";
import { createLegacyPublisherAppPaletteOverridePlan, legacyPublisherAppCounterpointColors } from "@/lib/publisher-app-legacy-palette-overrides";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: { marker: "auth" } }));

function colorContrast(left: string, right: string) {
  const luminance = (value: string) => [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(left), b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("custom app palette override route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a signed-in backoffice session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null);
    const response = await POST(
      new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST",
        body: JSON.stringify({
          colors: {
            primary: "#FF5500",
            secondary: "#FFB21F",
            tertiary: "#F58220",
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects incomplete or malformed palettes", async () => {
    jest.mocked(getServerSession).mockResolvedValue({
      user: { email: "admin@example.org" },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const response = await POST(
      new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST",
        body: JSON.stringify({
          colors: {
            primary: "orange",
            secondary: "#FFB21F",
            tertiary: "#F58220",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns a private plan containing only branding-susceptible colors", async () => {
    jest.mocked(getServerSession).mockResolvedValue({
      user: { email: "admin@example.org" },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const response = await POST(
      new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST",
        body: JSON.stringify({
          colors: {
            primary: "#FF5500",
            secondary: "#FFB21F",
            tertiary: "#F58220",
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      catalogVersion: 8,
      sourceCount: 698,
    });
    expect(body.selectedCount).toBe(Object.keys(body.colorOverrides).length);
    expect(body.selectedCount).toBeGreaterThan(0);
    expect(body.selectedCount).toBeLessThan(body.sourceCount);
    expect(body.colorOverrides).toEqual(
      expect.objectContaining({
        "learn.level.bacteria.accent": expect.any(Object),
        "discover.suggestion.pocketGuideInitialOverview.accent":
          expect.any(Object),
        "discover.requestLauncher.ribbonStart": expect.any(Object),
        "discover.variantFinder.metricVariants": expect.any(Object),
        "community.newPost.headerAccent": expect.any(Object),
        "community.genes.primary": expect.any(Object),
        "savedContent.headerStart": expect.any(Object),
      }),
    );
  });

  it("uses the four manually selected counterpoints when planning tonal overrides", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({
      primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220",
      counterpointClockwise: "#123ABC", counterpointAnticlockwise: "#ABCDEF",
      counterpointFarClockwise: "#334455", counterpointFarAnticlockwise: "#445566",
    });
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", { method: "POST", body: JSON.stringify({ colors }) }));
    const catalog = getPublisherAppColorCatalog();
    expect(response.status).toBe(200);
    const plan = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    expect(await response.json()).toEqual({ ...plan, generatedColorOverrides: plan.colorOverrides });
  });

  it("upgrades legacy generated colors while preserving a manual appearance and alpha", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const previousColors = publisherAppColorsWithCounterpoints({ primary: "#123ABC", secondary: "#2233AA", tertiary: "#3344BB" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const old = getLegacyPublisherAppColorCatalog();
    const legacy = createLegacyPublisherAppPaletteOverridePlan(previousColors, old.options, old.catalogVersion, old.alternativeTonalFlows);
    const colorOverrides = structuredClone(legacy.colorOverrides);
    colorOverrides["learn.background.stop1"].light = "#11223380";
    colorOverrides["app.background"] = { dark: "#121314" };
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors, colorOverrides }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides["learn.background.stop1"].light).toBe("#11223380");
    expect(body.colorOverrides["app.background"]).toEqual({ dark: "#121314" });
    expect(body.colorOverrides["learn.background.stop2"]).toEqual(body.generatedColorOverrides["learn.background.stop2"]);
    expect(body.colorOverrides["learn.background.stop2"]).not.toEqual(legacy.colorOverrides["learn.background.stop2"]);
    expect(body.selectedCount).toBe(Object.keys(body.generatedColorOverrides).length);
  });

  it("preserves a saved manual return to native independently from the other appearance", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors: colors,
        colorOverrides: { "learn.background.stop1": { light: "#ABCDEF80" } },
        generatedColorOverrides: { "learn.background.stop1": { light: "#112233", dark: "#223344" } },
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.colorOverrides["learn.background.stop1"]).toEqual({ light: "#ABCDEF80" });
    const nativeDark = getPublisherAppColorCatalog().options.find(option => option.key === "learn.background.stop1")!.defaultDarkColor;
    expect(body.generatedColorOverrides["learn.background.stop1"]?.dark ?? nativeDark).toBe(nativeDark);
  });

  it("keeps unknown manual values when an old achromatic palette has no valid legacy automatic baseline", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const previousColors = publisherAppColorsWithCounterpoints({ primary: "#777777", secondary: "#888888", tertiary: "#999999" });
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors, colorOverrides: { "app.background": { light: "#12345680" } } }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).colorOverrides["app.background"]).toEqual({ light: "#12345680" });
  });

  it("recognizes historical HSL accessory defaults when the stored app omitted counterpoint seeds", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const previousColors = { primary: "#5A443C", secondary: "#D8C7C0", tertiary: "#9D948F" };
    const legacySeeds = { ...previousColors, ...legacyPublisherAppCounterpointColors(previousColors.primary) };
    expect(legacySeeds.counterpointClockwise).toBe("#DFE212");
    const old = getLegacyPublisherAppColorCatalog();
    const legacy = createLegacyPublisherAppPaletteOverridePlan(legacySeeds, old.options, old.catalogVersion, old.alternativeTonalFlows);
    const colorOverrides = { ...legacy.colorOverrides, "app.background": { dark: "#ABCDEF80" } };
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors, colorOverrides }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides["savedContent.headerStart"]).toEqual(body.generatedColorOverrides["savedContent.headerStart"]);
    expect(body.colorOverrides["savedContent.headerStart"]).not.toEqual(legacy.colorOverrides["savedContent.headerStart"]);
    expect(body.colorOverrides["app.background"]).toEqual({ dark: "#ABCDEF80" });
  });

  it.each([0, 1])("recognizes superseded OKLCH defaults variant %s when omitted counterpoint seeds now resolve to the restored palette", async (variant) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const previousColors = { primary: "#66F246", secondary: "#9AEF28", tertiary: "#ACF81E" };
    const oldColors = { ...previousColors, ...publisherAppSupersededCounterpointColors(previousColors.primary)[variant]! };
    const catalog = getPublisherAppColorCatalog();
    const oldPlan = createPublisherAppPaletteOverridePlan(oldColors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    const colors = publisherAppColorsWithCounterpoints(previousColors);
    expect(colors.counterpointFarAnticlockwise).not.toBe(oldColors.counterpointFarAnticlockwise);
    const current = { ...oldPlan.colorOverrides, "learn.background.leadingGlow": { light: "#11223380" } };
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors, colorOverrides: current }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides["community.newPost.headerAccent"]).toEqual(body.generatedColorOverrides["community.newPost.headerAccent"]);
    expect(body.colorOverrides["community.newPost.headerAccent"]).not.toEqual(oldPlan.colorOverrides["community.newPost.headerAccent"]);
    expect(body.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
  });

  it.each(["stored", "original HSL", "raw OKLCH", "paired OKLCH"] as const)(
    "upgrades bright generated control fills from the old solver with %s seeds while preserving manual RGBA",
    async (variant) => {
      jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
      const base = { primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" };
      const colors = publisherAppColorsWithCounterpoints(base);
      const previousColors = variant === "stored" ? colors : base;
      const oldSeeds = variant === "stored" ? colors
        : { ...base, ...(variant === "original HSL" ? publisherAppPreviousCounterpointColors(base.primary)
          : publisherAppSupersededCounterpointColors(base.primary)[variant === "raw OKLCH" ? 0 : 1]!) };
      const catalog = getPublisherAppColorCatalog();
      const oldPlan = createPublisherAppPreviousPaletteOverridePlan(oldSeeds, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
      const newPlan = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
      const background = "tabs.learn.start";
      expect(colorContrast("#FFFFFF", oldPlan.colorOverrides[background].light!)).toBeLessThan(2.5);
      expect(newPlan.colorOverrides[background]).not.toEqual(oldPlan.colorOverrides[background]);
      const current = { ...oldPlan.colorOverrides, "learn.background.leadingGlow": { light: "#11223380" } };
      const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST", body: JSON.stringify({ colors, previousColors, colorOverrides: current }),
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.colorOverrides[background]).toEqual(body.generatedColorOverrides[background]);
      expect(body.colorOverrides[background]).toEqual(newPlan.colorOverrides[background]);
      expect(colorContrast("#FFFFFF", body.colorOverrides[background].light)).toBeGreaterThanOrEqual(2.985);
      expect(body.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
    },
  );

  it.each([false, true])("restores overdarkened automatic ochre fills while retaining manual RGBA (saved baseline: %s)", async (savedBaseline) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#A08000", secondary: "#967A12", tertiary: "#836B13" });
    const catalog = getPublisherAppColorCatalog();
    const oldPlan = createPublisherAppOverdarkenedPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    const newPlan = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    expect(oldPlan.colorOverrides["brand.primary"].light).not.toBe(colors.primary);
    expect(newPlan.colorOverrides["brand.primary"].light).toBe(colors.primary);
    const current = { ...oldPlan.colorOverrides, "learn.background.leadingGlow": { light: "#11223380" } };
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({
        colors, previousColors: colors, colorOverrides: current,
        ...(savedBaseline ? { generatedColorOverrides: oldPlan.colorOverrides } : {}),
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides["brand.primary"].light).toBe(colors.primary);
    expect(body.generatedColorOverrides["brand.primary"].light).toBe(colors.primary);
    expect(body.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
    if (savedBaseline) expect(body.colorOverrides["learn.background.leadingGlow"].dark).toBeUndefined();
    expect(colors.primary).toBe("#A08000");
  });

  it.each([false, true])("restores fixed vivid Genes accents while retaining manual Genes RGBA (saved baseline: %s)", async (savedBaseline) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" });
    const catalog = getPublisherAppColorCatalog();
    const oldPlan = createPublisherAppPreGenesRestorePaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    const newPlan = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    expect(oldPlan.colorOverrides["community.genes.primary"].light).toBe("#00866E");
    expect(newPlan.colorOverrides["community.genes.primary"].light).toBe("#00A88A");
    const manualFocus = { light: "#147C6EF2", dark: "#2A9F8BCC" };
    const current = {
      ...oldPlan.colorOverrides,
      "community.genes.focus.research": manualFocus,
      "learn.background.leadingGlow": { light: "#11223380" },
    };
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({
        colors, previousColors: colors, colorOverrides: current,
        ...(savedBaseline ? { generatedColorOverrides: oldPlan.colorOverrides } : {}),
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides["community.genes.primary"].light).toBe("#00A88A");
    expect(body.generatedColorOverrides["community.genes.primary"].light).toBe("#00A88A");
    expect(body.colorOverrides["community.genes.focus.research"]).toEqual(manualFocus);
    expect(body.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
    expect(body.generatedColorOverrides["community.genes.focus.research"]).toEqual(newPlan.colorOverrides["community.genes.focus.research"]);
  });

  it.each([false, true])("replaces old generated quick-action backgrounds while retaining manual colors (saved baseline: %s)", async (savedBaseline) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820" });
    const catalog = getPublisherAppColorCatalog();
    const oldPlan = createPublisherAppPreQuickBackgroundPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    const newPlan = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    const automaticBackground = "community.quickActions.friends.middle";
    expect(oldPlan.colorOverrides[automaticBackground]).not.toEqual(newPlan.colorOverrides[automaticBackground]);
    const manualBackground = "community.quickActions.genes.start";
    const manualGenes = { light: "#147C6EF2", dark: "#2A9F8BCC" };
    const current: typeof oldPlan.colorOverrides = {
      ...oldPlan.colorOverrides,
      [manualBackground]: { ...oldPlan.colorOverrides[manualBackground], light: "#24574C80" },
      "community.genes.focus.research": manualGenes,
      "learn.background.leadingGlow": { light: "#11223380" },
    };
    // Older editor configurations omitted overrides that matched native white.
    delete current["community.quickActions.friends.foreground"];
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({
        colors, previousColors: colors, colorOverrides: current,
        ...(savedBaseline ? { generatedColorOverrides: oldPlan.colorOverrides } : {}),
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides[automaticBackground]).toEqual(newPlan.colorOverrides[automaticBackground]);
    expect(body.generatedColorOverrides[automaticBackground]).toEqual(newPlan.colorOverrides[automaticBackground]);
    expect(body.colorOverrides[manualBackground].light).toBe("#24574C80");
    expect(body.colorOverrides[manualBackground].dark).toBe(newPlan.colorOverrides[manualBackground].dark);
    expect(body.generatedColorOverrides[manualBackground]).toEqual(newPlan.colorOverrides[manualBackground]);
    expect(body.colorOverrides["community.genes.focus.research"]).toEqual(manualGenes);
    expect(body.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
    for (const action of ["friends", "genes", "circles", "search"]) {
      expect(body.colorOverrides[`community.quickActions.${action}.foreground`]).toEqual({ light: "#FFFFFF", dark: "#FFFFFF" });
    }
  });

  it.each([false, true])("replaces old automatic dull Learn colors while keeping manual header colors and lighting (saved baseline: %s)", async (savedBaseline) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#F78D15", tertiary: "#EFBA2A" });
    const catalog = getPublisherAppColorCatalog();
    const previous = createPublisherAppPreLearnHeaderPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs);
    const manualSheen = { light: "#FFFFFF66", dark: "#CCAAFF44" };
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({
        colors, previousColors: colors,
        colorOverrides: {
          ...previous.colorOverrides,
          "learn.level.bacteria.accent": { ...previous.colorOverrides["learn.level.bacteria.accent"], light: "#E95F00" },
          "learn.header.sheenStart": manualSheen,
          "learn.background.leadingGlow": { light: "#11223380" },
        },
        ...(savedBaseline ? { generatedColorOverrides: previous.colorOverrides } : {}),
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides["learn.level.bacteria.accent"]).toEqual({ light: "#E95F00", dark: "#FF5500" });
    expect(body.generatedColorOverrides["learn.level.bacteria.accent"]).toEqual({ light: "#FF5500", dark: "#FF5500" });
    expect(body.colorOverrides["learn.header.sheenStart"]).toEqual(manualSheen);
    expect(body.generatedColorOverrides["learn.header.sheenStart"]).toEqual({ light: "#FFFFFF1A", dark: "#FFFFFF1A" });
    expect(body.colorOverrides["learn.background.leadingGlow"].light).toBe("#11223380");
    expect(body.colorOverrides["tabs.learn.start"]).toEqual(previous.colorOverrides["tabs.learn.start"]);
  });

  it("reconciles automatic foreground contrast against a retained manual background and saves the corrected baseline", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const catalog = getPublisherAppColorCatalog();
    const generated = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs).colorOverrides;
    const foreground = "community.rareCircles.secondaryActionForeground";
    const background = "community.rareCircles.secondaryActionFill";
    const originalInk = generated[foreground]?.light ?? catalog.options.find(option => option.key === foreground)!.defaultLightColor;
    expect(colorContrast(originalInk, "#000000")).toBeLessThan(4.5);
    const request = (colorOverrides: typeof generated, generatedColorOverrides: typeof generated) => POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors: colors, colorOverrides, generatedColorOverrides }),
    }));
    const response = await request({ ...generated, [background]: { ...generated[background], light: "#000000" } }, generated);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides[background].light).toBe("#000000");
    expect(body.generatedColorOverrides[background]?.light).not.toBe("#000000");
    expect(colorContrast(body.colorOverrides[foreground].light, "#000000")).toBeGreaterThanOrEqual(4.5);
    expect(body.generatedColorOverrides[foreground].light).toBe(body.colorOverrides[foreground].light);
    expect(body.selectedCount).toBe(Object.keys(body.generatedColorOverrides).length);
    const repeated = await request(body.colorOverrides, body.generatedColorOverrides);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).colorOverrides[background].light).toBe("#000000");
  });

  it.each([
    { background: "#000000", foreground: "#FFFFFF80", status: 200 },
    { background: "#000000", foreground: "#000000", status: 400 },
  ])("keeps locked RGBA values or reports impossible manual contrast: $status", async ({ background, foreground, status }) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const colorOverrides = {
      "community.rareCircles.secondaryActionFill": { light: background },
      "community.rareCircles.secondaryActionForeground": { light: foreground },
    };
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors: colors, colorOverrides, generatedColorOverrides: {} }),
    }));
    expect(response.status).toBe(status);
    const body = await response.json();
    if (status === 200) expect(body.colorOverrides).toMatchObject(colorOverrides);
    else expect(body.error).toEqual(expect.any(String));
  });

  it("keeps manual ink exact and adjusts an unlocked gradient as a family when needed", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#123ABC", secondary: "#456DEF", tertiary: "#FEDCBA" });
    const catalog = getPublisherAppColorCatalog();
    const generated = createPublisherAppPaletteOverridePlan(colors, catalog.options, catalog.catalogVersion, catalog.alternativeTonalFlows, catalog.contrastPairs).colorOverrides;
    const foregroundKey = "community.rareCircles.headerForeground";
    const backgroundKeys = ["community.rareCircles.headerStart", "community.rareCircles.headerMiddle", "community.rareCircles.headerEnd"];
    expect(Math.min(...backgroundKeys.map(key => colorContrast("#FFFFFF", generated[key]?.light ?? catalog.options.find(option => option.key === key)!.defaultLightColor)))).toBeLessThan(4.5);
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors: colors,
        colorOverrides: { [foregroundKey]: { light: "#FFFFFF" } }, generatedColorOverrides: {},
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.colorOverrides[foregroundKey].light).toBe("#FFFFFF");
    for (const key of backgroundKeys) {
      const effective = body.colorOverrides[key]?.light ?? catalog.options.find(option => option.key === key)!.defaultLightColor;
      expect(colorContrast("#FFFFFF", effective)).toBeGreaterThanOrEqual(4.5);
      expect(body.generatedColorOverrides[key]?.light).toBe(body.colorOverrides[key]?.light);
    }
  });

  it.each([
    { colorOverrides: { "unknown.role": { light: "#123456" } } },
    { colorOverrides: { "app.background": { light: "invalid" } } },
    { colorOverrides: {}, generatedColorOverrides: { "unknown.role": { light: "#123456" } } },
  ])("rejects invalid provenance or manual color metadata: %j", async (metadata) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const colors = publisherAppColorsWithCounterpoints({ primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220" });
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", {
      method: "POST", body: JSON.stringify({ colors, previousColors: colors, ...metadata }),
    }));
    expect(response.status).toBe(400);
  });

  it.each(["counterpointClockwise", "counterpointAnticlockwise", "counterpointFarClockwise", "counterpointFarAnticlockwise"])("rejects an invalid manual %s", async (key) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { email: "admin@example.org" }, expires: "2099-01-01T00:00:00.000Z" });
    const response = await POST(new Request("https://example.test/api/publisher-app/palette-overrides", { method: "POST", body: JSON.stringify({ colors: { primary: "#FF5500", secondary: "#FFB21F", tertiary: "#F58220", [key]: "invalid" } }) }));
    expect(response.status).toBe(400);
  });
});
