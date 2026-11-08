import {
  getPublisherAppColorCatalog,
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

    expect(page.catalogVersion).toBe(8);
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "brand.primary", group: "Brand" }),
      ]),
    );
    expect(page.items.length).toBeLessThanOrEqual(20);
    expect(page.groups).toContain("General interface");
  });

  it("includes the version 2 Discover and Connect color roles", () => {
    const discoverPage = searchPublisherAppColorCatalog({
      query: "Discover News accent",
      cursor: 0,
      limit: 20,
    });
    const connectPage = searchPublisherAppColorCatalog({
      query: "Connect friends gradient start",
      cursor: 0,
      limit: 20,
    });

    expect(discoverPage.catalogVersion).toBe(8);
    expect(discoverPage.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "discover.category.news.accent",
          group: "Discover categories",
        }),
      ]),
    );
    expect(connectPage.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "community.quickActions.friends.start",
          group: "Connect quick access",
        }),
      ]),
    );
  });

  it("exposes every version 3 Learn and Discover component color", () => {
    const page = searchPublisherAppColorCatalog({
      cursor: 0,
      limit: 20,
    });
    const learnLevel = searchPublisherAppColorCatalog({
      query: "learn level bacteria accent",
      cursor: 0,
      limit: 20,
    });
    const requestLauncher = searchPublisherAppColorCatalog({
      query: "request launcher ribbon start",
      cursor: 0,
      limit: 20,
    });
    const variantFinder = searchPublisherAppColorCatalog({
      query: "variant finder metric variants",
      cursor: 0,
      limit: 20,
    });

    expect(page.catalogVersion).toBe(8);
    expect(page.totalCount).toBe(698);
    expect(page.groups).toEqual(
      expect.arrayContaining([
        "Learn levels",
        "Learn background",
        "Discover suggestions",
        "Discover feed cards",
        "Discover request launcher",
        "Variant finder",
      ]),
    );
    expect(learnLevel.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "learn.level.bacteria.accent" }),
      ]),
    );
    expect(requestLauncher.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "discover.requestLauncher.ribbonStart",
        }),
      ]),
    );
    expect(variantFinder.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "discover.variantFinder.metricVariants",
        }),
      ]),
    );

    const versionThreeOptions = searchPublisherAppColorCatalog({
      cursor: 0,
      limit: 1_000,
    }).items.filter((option) => option.introducedInCatalogVersion === 3);
    expect(versionThreeOptions).toHaveLength(242);
  });

  it("exposes alternative tonal-flow documentation and every referenced role", () => {
    const page = searchPublisherAppColorCatalog({
      cursor: 0,
      limit: 20,
    });
    const allRoles = new Set(
      searchPublisherAppColorCatalog({ cursor: 0, limit: 1_000 }).items.map(
        (option) => option.key,
      ),
    );

    expect(page.alternativeTonalFlows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "rareCircles" }),
        expect.objectContaining({ id: "communityComposer" }),
        expect.objectContaining({ id: "communityGenes" }),
        expect.objectContaining({ id: "savedContent" }),
      ]),
    );
    expect(page.alternativeTonalFlows).toHaveLength(4);
    for (const flow of page.alternativeTonalFlows) {
      expect(flow.title).toBeTruthy();
      expect(flow.description).toBeTruthy();
      expect(flow.roleKeys.length).toBeGreaterThan(0);
      expect(flow.roleKeys.every((key) => allRoles.has(key))).toBe(true);
    }
  });

  it("includes complete flow surfaces, illustration tones and contrast relationships", () => {
    const catalog = getPublisherAppColorCatalog();
    const page = searchPublisherAppColorCatalog({ cursor: 0, limit: 20 });
    const options = new Map(catalog.options.map((option) => [option.key, option]));

    expect(options.size).toBe(698);
    for (const key of [
      "community.rareCircles.backgroundBase",
      "community.rareCircles.surfaceStart",
      "community.rareCircles.headerMiddle",
      "community.newPost.backgroundBase",
      "community.newPost.tagAccentQuinary",
      "community.genes.primaryActionFill",
      "savedContent.elevatedSurface",
      "savedContent.countPillForeground",
      "illustration.purpleTone",
      "illustration.cyanTone",
    ]) {
      expect(options.has(key)).toBe(true);
    }
    expect(page.contrastPairs).toEqual(catalog.contrastPairs);
    expect(catalog.contrastPairs).toHaveLength(21);
    for (const pair of catalog.contrastPairs) {
      expect(options.has(pair.foregroundKey)).toBe(true);
      expect(pair.backgroundKeys.length).toBeGreaterThan(0);
      expect(pair.backgroundKeys.every((key) => options.has(key))).toBe(true);
      expect(pair.minimumRatio).toBe(4.5);
    }
    expect(options.get("learn.background.leadingGlow")).toEqual(
      expect.objectContaining({
        defaultLightColor: "#F2F8F729",
        defaultLightOpacity: 0.16,
      }),
    );
    expect(options.get("brand.languageAction")?.platformDefaultColors).toEqual({
      android: { light: "#D90B58", dark: "#FF6FA6" },
    });
  });

  it("searches exact bilingual wording without returning the full catalog", () => {
    const page = searchPublisherAppTextCatalog({
      query: "Contact Pocket Genes",
      cursor: 0,
      limit: 20,
    });

    expect(page.catalogVersion).toBe(3);
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "Contact Pocket Genes",
          defaultSpanishText: "Contactá a Pocket Genes",
        }),
      ]),
    );
    expect(page.items.length).toBeLessThanOrEqual(20);
    expect(page.totalCount).toBeLessThan(7_363);
  });

  it("exposes only the current non-curriculum text catalog", () => {
    const page = searchPublisherAppTextCatalog({
      cursor: 0,
      limit: 20,
    });
    const curriculumSearch = searchPublisherAppTextCatalog({
      query: "SLURM_ARRAY_TASK_ID",
      cursor: 0,
      limit: 20,
    });
    const studentSearch = searchPublisherAppTextCatalog({
      query: "For students",
      cursor: 0,
      limit: 20,
    });

    expect(page.catalogVersion).toBe(3);
    expect(page.totalCount).toBe(7_363);
    expect(page.groups).not.toContain("Learn content");
    expect(curriculumSearch.totalCount).toBe(0);
    expect(studentSearch.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "For students",
          defaultSpanishText: "Para estudiantes",
        }),
      ]),
    );
  });
});
