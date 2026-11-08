import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  defaultPublisherAppAdvancedConfiguration,
  normalizePublisherAppAdvancedConfiguration,
} from "../lib/publisher-app-advanced-config.js";
import { getPublisherAppColorCatalogOption } from "../lib/publisher-app-customization-catalog.js";

const validationCatalog = JSON.parse(
  gunzipSync(readFileSync(new URL("../../catalogs/custom-app-color-validation.json.gz", import.meta.url))).toString("utf8"),
) as { catalogVersion: number; keys: string[] };

describe("shared publisher-app color catalog", () => {
  it("keeps the SDK allowlist aligned with every backoffice role", () => {
    expect(validationCatalog.catalogVersion).toBe(8);
    expect(validationCatalog.keys).toHaveLength(698);
    expect(new Set(validationCatalog.keys).size).toBe(698);
    expect(validationCatalog.keys).toEqual([...validationCatalog.keys].sort());
    for (const key of validationCatalog.keys) {
      expect(getPublisherAppColorCatalogOption(key)).toEqual({ key });
    }
    expect(validationCatalog.keys).toEqual(expect.arrayContaining([
      "community.rareCircles.backgroundBase",
      "community.rareCircles.headerMiddle",
      "community.newPost.tagAccentQuinary",
      "community.genes.primaryActionFill",
      "savedContent.countPillForeground",
      "illustration.purpleTone",
      "illustration.cyanTone",
    ]));
    expect(getPublisherAppColorCatalogOption("community.rareCircles.unknown")).toBeUndefined();
    expect(getPublisherAppColorCatalogOption("illustration.PurpleTone")).toBeUndefined();
  });

  it("accepts all shared light/dark roles without changing their exact values", () => {
    const identity = { name: "Color contract", kind: "organization" as const, id: "color-contract" };
    const advanced = defaultPublisherAppAdvancedConfiguration(identity);
    advanced.colorOverrides = Object.fromEntries(validationCatalog.keys.map((key) => [
      key,
      { light: "#F2F8F729", dark: "#2A0B17" },
    ]));

    const normalized = normalizePublisherAppAdvancedConfiguration(advanced, identity);
    expect(normalized.colorOverrides).toEqual(advanced.colorOverrides);
    expect(Object.keys(normalized.colorOverrides)).toHaveLength(698);
  });
});
