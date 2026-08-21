import {
  DISCOVER_ORGANIZATION_COUNTRY_CODES,
  formatDiscoverOrganizationCountries,
  formatDiscoverOrganizationCountry,
  formatDiscoverRegionCodes,
  getDiscoverOrganizationCountryGroups,
  getDiscoverRegionCountryGroups,
  parseDiscoverOrganizationCountryCodes,
  parseDiscoverRegionCodes,
  serializeDiscoverOrganizationCountryCodes,
  slugifyDiscoverOrganizationName,
} from "@/lib/discover-organization-fields";

describe("discover organization fields", () => {
  it("keeps recommended countries first and excludes them from the full list", () => {
    const groups = getDiscoverOrganizationCountryGroups("en");

    expect(groups[0]?.options.map((option) => option.code)).toEqual([
      "GLOBAL",
      "AR",
      "US",
      "AU",
      "NZ",
    ]);
    expect(groups[1]?.options.map((option) => option.code)).not.toEqual(
      expect.arrayContaining(["AR", "US", "AU", "NZ"]),
    );
    expect(DISCOVER_ORGANIZATION_COUNTRY_CODES.length).toBeGreaterThan(240);
  });

  it("formats country codes with readable names", () => {
    expect(formatDiscoverOrganizationCountry("us", "en")).toBe(
      "United States (US)",
    );
  });

  it("serializes organization country coverage as canonical comma-separated codes", () => {
    expect(parseDiscoverOrganizationCountryCodes("ar, us, AR")).toEqual([
      "AR",
      "US",
    ]);
    expect(serializeDiscoverOrganizationCountryCodes(["ar", "us", "AR"])).toBe(
      "AR,US",
    );
    expect(
      serializeDiscoverOrganizationCountryCodes(["AR", "GLOBAL", "US"]),
    ).toBe("GLOBAL");
    expect(formatDiscoverOrganizationCountries("ar,us", "en")).toBe(
      "Argentina (AR), United States (US)",
    );
  });

  it("generates slugs from organization names", () => {
    expect(slugifyDiscoverOrganizationName("Fundación Médica Ñandú")).toBe(
      "fundacion-medica-nandu",
    );
    expect(slugifyDiscoverOrganizationName("  ***  ")).toBe("organization");
  });

  it("normalizes Discover regions to three-letter country codes", () => {
    expect(parseDiscoverRegionCodes("ar, ESP, eng, us, ARG")).toEqual([
      "ARG",
      "ESP",
      "ENG",
      "USA",
    ]);
    expect(formatDiscoverRegionCodes(["ar", "ESP", "eng"])).toBe(
      "ARG, ESP, ENG",
    );
  });

  it("offers all country regions plus England as a product region", () => {
    const groups = getDiscoverRegionCountryGroups("en");
    const recommendedCodes = groups[0]?.options.map(
      (option) => option.regionCode,
    );
    const allCodes = groups.flatMap((group) =>
      group.options.map((option) => option.regionCode),
    );

    expect(recommendedCodes).toEqual(["ARG", "ESP", "ENG", "USA", "AUS", "NZL"]);
    expect(allCodes).toContain("GBR");
    expect(allCodes).toHaveLength(DISCOVER_ORGANIZATION_COUNTRY_CODES.length + 1);
  });
});
