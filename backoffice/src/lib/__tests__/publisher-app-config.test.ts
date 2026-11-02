import {
  isCurrentPublisherAppIdentifier,
  publisherAppDefaultColors,
  publisherAppPaletteSuggestions,
} from "@/lib/publisher-app-config";

describe("publisher app identifiers", () => {
  it("accepts only readable identifiers for the matching publisher kind", () => {
    expect(
      isCurrentPublisherAppIdentifier(
        "app_org_pocket_genes_lab_48217",
        "organization",
      ),
    ).toBe(true);
    expect(
      isCurrentPublisherAppIdentifier(
        "app_ind_maria_jose_perez_10482",
        "individual",
      ),
    ).toBe(true);
    expect(
      isCurrentPublisherAppIdentifier(
        "app_org_pocket_genes_lab_48217",
        "individual",
      ),
    ).toBe(false);
    expect(
      isCurrentPublisherAppIdentifier(
        "organization_8thNEDU1xbFqwnQDUrPt",
        "organization",
      ),
    ).toBe(false);
  });
});

describe("publisher app color palettes", () => {
  it("intensifies a muted publisher tint into a vivid default palette", () => {
    expect(publisherAppDefaultColors("#526D49")).toEqual({
      primary: "#3B9E1A",
      secondary: "#35E34F",
      tertiary: "#E99E35",
    });
  });

  it("builds four distinct app palettes from the publisher hue", () => {
    const suggestions = publisherAppPaletteSuggestions("#526D49");

    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]).toEqual(publisherAppDefaultColors("#526D49"));
    expect(new Set(suggestions.map((palette) => JSON.stringify(palette))).size).toBe(4);

    for (const palette of suggestions) {
      expect(palette.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.secondary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.tertiary).toMatch(/^#[0-9A-F]{6}$/);
      expect(new Set(Object.values(palette)).size).toBe(3);
    }
  });
});
