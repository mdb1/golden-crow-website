import {
  searchPublisherAppColorCatalog,
  searchPublisherAppTextCatalog,
} from "@/lib/publisher-app-customization-catalog-server";

describe("publisher app customization catalogs", () => {
  it("searches color roles in bounded pages", () => {
    const page = searchPublisherAppColorCatalog({
      query: "brand primary",
      cursor: 0,
      limit: 20,
    });

    expect(page.catalogVersion).toBe(1);
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "brand.primary", group: "Brand" }),
      ]),
    );
    expect(page.items.length).toBeLessThanOrEqual(20);
    expect(page.groups).toContain("General interface");
  });

  it("searches exact bilingual wording without returning the full catalog", () => {
    const page = searchPublisherAppTextCatalog({
      query: "Contact Pocket Genes",
      cursor: 0,
      limit: 20,
    });

    expect(page.catalogVersion).toBe(1);
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "Contact Pocket Genes",
          defaultSpanishText: "Contactá a Pocket Genes",
        }),
      ]),
    );
    expect(page.items.length).toBeLessThanOrEqual(20);
    expect(page.totalCount).toBeLessThan(26_592);
  });
});
