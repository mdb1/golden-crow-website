/** @jest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverOrganizationProductCatalogWorkbench } from "@/components/discover/organization-product-catalog-workbench";
import type { DiscoverOrganizationRecord } from "@/lib/discover";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const organization: DiscoverOrganizationRecord = {
  id: "org-1",
  name: "Publisher One",
  imageUrl: null,
  status: "active",
  slug: "publisher-one",
  websiteUrl: "https://example.org",
  description: "Public description",
  descriptionEn: "Public description",
  social: {},
  countryCode: "US",
  organizationType: "org_laboratories",
  colorHex: "#123ABC",
  verified: true,
  isGeneticReportProvider: false,
  geneticReportCategory: null,
  isGrcHighlighted: false,
  contactEmail: "hello@example.org",
  internalNotes: "",
  productCatalog: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function renderWorkbench() {
  render(
    <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
      <DiscoverOrganizationProductCatalogWorkbench
        organization={organization}
        routeBase="/publisher-portal/discover/organizations/org-1/product-catalog"
        organizationHref="/publisher-portal/discover/organizations/org-1"
        mode="create"
      />
    </AppLanguageProvider>,
  );
}

describe("DiscoverOrganizationProductCatalogWorkbench", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
  });

  it("keeps both back links together in the navigation block", () => {
    renderWorkbench();

    const navigation = screen.getByTestId(
      "product-catalog-workbench-navigation",
    );
    const title = screen.getByTestId("product-catalog-workbench-title");

    expect(
      within(navigation)
        .getByRole("link", { name: /Back to product catalog/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/discover/organizations/org-1/product-catalog");
    expect(
      within(navigation)
        .getByRole("link", { name: /Back to organization/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/discover/organizations/org-1");
    expect(
      within(title).queryByRole("link", {
        name: /Back to product catalog|Back to organization/i,
      }),
    ).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /Back to product catalog/i }),
    ).toHaveLength(1);
  });
});
