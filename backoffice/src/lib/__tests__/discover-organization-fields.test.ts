import {
  DISCOVER_ORGANIZATION_COUNTRY_CODES,
  formatDiscoverOrganizationCountry,
  getDiscoverOrganizationCountryGroups,
  slugifyDiscoverOrganizationName,
} from "@/lib/discover-organization-fields";

describe("discover organization fields", () => {
  it("keeps recommended countries first and excludes them from the full list", () => {
    const groups = getDiscoverOrganizationCountryGroups("en");

    expect(groups[0]?.options.map((option) => option.code)).toEqual([
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

  it("generates slugs from organization names", () => {
    expect(slugifyDiscoverOrganizationName("Fundación Médica Ñandú")).toBe(
      "fundacion-medica-nandu",
    );
    expect(slugifyDiscoverOrganizationName("  ***  ")).toBe("organization");
  });
});
