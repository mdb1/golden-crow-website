/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverOrganizationProductCatalogBrowser } from "@/components/discover/organization-product-catalog-browser";
import type { DiscoverOrganizationRecord } from "@/lib/discover";

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

function renderCatalog(
  productCatalog: DiscoverOrganizationRecord["productCatalog"],
) {
  render(
    <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
      <DiscoverOrganizationProductCatalogBrowser
        organization={{ ...organization, productCatalog }}
        routeBase="/publisher-portal/discover/organizations/org-1/product-catalog"
      />
    </AppLanguageProvider>,
  );
}

describe("DiscoverOrganizationProductCatalogBrowser", () => {
  it("shows only the empty-state add button when the catalog has no products", () => {
    renderCatalog([]);

    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(screen.getByText("No products in the catalog yet")).toBeTruthy();
    expect(
      screen.getByText("Create your first product in under 5 minutes."),
    ).toBeTruthy();
    expect(
      screen.getByTestId("publisher-portal-empty-state-icon").className,
    ).toContain("shadow-inner");
    expect(
      screen.queryByRole("link", { name: /Back to organization/i }),
    ).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /Add product to catalog/i }),
    ).toHaveLength(1);
    expect(
      within(emptyState)
        .getByRole("link", { name: /Add product to catalog/i })
        .getAttribute("href"),
    ).toBe(
      "/publisher-portal/discover/organizations/org-1/product-catalog/new",
    );
  });

  it("shows the top add button when the catalog already has products", () => {
    renderCatalog([
      {
        id: "product-1",
        title: "Genome report",
        description: "A useful genetic report for patients and clinicians.",
        imageUrl: null,
        productUrl: "https://example.org/report",
        callToActionLabel: "View product",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ]);

    expect(screen.queryByText("No products in the catalog yet")).toBeNull();
    expect(
      screen.getByRole("link", { name: /Add product to catalog/i }),
    ).toHaveProperty(
      "href",
      "http://localhost/publisher-portal/discover/organizations/org-1/product-catalog/new",
    );
  });

  it("uses search-specific empty copy without duplicating the add action", () => {
    renderCatalog([
      {
        id: "product-1",
        title: "Genome report",
        description: "A useful genetic report for patients and clinicians.",
        imageUrl: null,
        productUrl: "https://example.org/report",
        callToActionLabel: "View product",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ]);

    fireEvent.change(
      screen.getByPlaceholderText("Search product title, description, or URL"),
      { target: { value: "not present" } },
    );

    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(screen.getByText("No products match the loaded rows.")).toBeTruthy();
    expect(
      screen.getByText("Try a different search or refresh the catalog."),
    ).toBeTruthy();
    expect(within(emptyState).queryByRole("link")).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /Add product to catalog/i }),
    ).toHaveLength(1);
  });
});
