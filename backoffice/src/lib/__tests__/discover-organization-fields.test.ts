import {
  DISCOVER_ORGANIZATION_COUNTRY_CODES,
  formatDiscoverOrganizationCountries,
  formatDiscoverOrganizationCountry,
  formatDiscoverRegionCodes,
  getDiscoverOrganizationCountryGroups,
  getDiscoverRegionCountryGroups,
  normalizeDiscoverOrganizationCountryCode,
  parseDiscoverOrganizationCountryCodes,
  parseDiscoverRegionCodes,
  serializeDiscoverOrganizationCountryCodes,
  slugifyDiscoverOrganizationName,
} from "@/lib/discover-organization-fields";

describe("discover organization fields", () => {
  it("keeps language-specific recommended countries first and excludes them from the full list", () => {
    const englishGroups = getDiscoverOrganizationCountryGroups("en");
    const spanishGroups = getDiscoverOrganizationCountryGroups("es");

    expect(englishGroups[0]?.options.map((option) => option.code)).toEqual([
      "GLOBAL",
      "US",
      "GB",
      "CA",
      "AU",
      "NZ",
    ]);
    expect(spanishGroups[0]?.options.map((option) => option.code)).toEqual([
      "GLOBAL",
      "AR",
      "ES",
      "MX",
      "CO",
      "CL",
      "PE",
      "UY",
    ]);
    expect(spanishGroups[0]?.options.map((option) => option.code)).not.toEqual(
      englishGroups[0]?.options.map((option) => option.code),
    );
    expect(englishGroups[1]?.options.map((option) => option.code)).not.toEqual(
      expect.arrayContaining(["US", "GB", "CA", "AU", "NZ"]),
    );
    expect(spanishGroups[1]?.options.map((option) => option.code)).not.toEqual(
      expect.arrayContaining(["AR", "ES", "MX", "CO", "CL", "PE", "UY"]),
    );
    expect(DISCOVER_ORGANIZATION_COUNTRY_CODES.length).toBeGreaterThan(240);
  });

  it("formats country codes with readable names", () => {
    expect(formatDiscoverOrganizationCountry("us", "en")).toBe(
      "United States (US)",
    );
  });

  it("normalizes country names, labels, and alpha-3 values to alpha-2 codes", () => {
    expect(normalizeDiscoverOrganizationCountryCode("Argentina")).toBe("AR");
    expect(normalizeDiscoverOrganizationCountryCode("ARG")).toBe("AR");
    expect(normalizeDiscoverOrganizationCountryCode("United States (US)")).toBe(
      "US",
    );
    expect(normalizeDiscoverOrganizationCountryCode("Estados Unidos")).toBe(
      "US",
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

  it("keeps region recommendations language-specific", () => {
    const englishGroups = getDiscoverRegionCountryGroups("en");
    const spanishGroups = getDiscoverRegionCountryGroups("es");
    const englishRecommendedCodes = englishGroups[0]?.options.map(
      (option) => option.regionCode,
    );
    const spanishRecommendedCodes = spanishGroups[0]?.options.map(
      (option) => option.regionCode,
    );
    const englishAllCodes = englishGroups.flatMap((group) =>
      group.options.map((option) => option.regionCode),
    );
    const spanishAllCodes = spanishGroups.flatMap((group) =>
      group.options.map((option) => option.regionCode),
    );

    expect(englishRecommendedCodes).toEqual([
      "USA",
      "ENG",
      "GBR",
      "CAN",
      "AUS",
      "NZL",
    ]);
    expect(spanishRecommendedCodes).toEqual([
      "ARG",
      "ESP",
      "MEX",
      "COL",
      "CHL",
      "PER",
      "URY",
    ]);
    expect(spanishRecommendedCodes).not.toEqual(englishRecommendedCodes);
    expect(englishAllCodes).toHaveLength(DISCOVER_ORGANIZATION_COUNTRY_CODES.length + 1);
    expect(spanishAllCodes).toHaveLength(DISCOVER_ORGANIZATION_COUNTRY_CODES.length);
  });
});
