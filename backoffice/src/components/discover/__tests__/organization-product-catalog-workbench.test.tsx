/** @jest-environment jsdom */

import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverOrganizationProductCatalogWorkbench } from "@/components/discover/organization-product-catalog-workbench";
import { sdkFetch } from "@/lib/sdk-client";
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

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

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
    jest.useRealTimers();
    routerPush.mockClear();
    routerRefresh.mockClear();
    sdkFetchMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it("stacks title, product URL, and button label on separate full-width rows", () => {
    renderWorkbench();

    const primaryFields = screen.getByTestId("product-catalog-primary-fields");

    expect(primaryFields.className).toContain("flex");
    expect(primaryFields.className).toContain("flex-col");
    expect(primaryFields.className).not.toContain("grid-cols-2");
    expect(within(primaryFields).getByLabelText("Product title")).toBeTruthy();
    expect(within(primaryFields).getByLabelText("Product URL")).toBeTruthy();
    expect(within(primaryFields).getByLabelText("Button label")).toBeTruthy();
  });

  it("shows the create toast before redirecting back to the catalog list", async () => {
    jest.useFakeTimers();
    sdkFetchMock.mockResolvedValueOnce({
      catalogItem: {
        id: "product-1",
        title: "Full genome report",
        description:
          "A practical full genome report for patients and clinicians.",
        imageUrl: null,
        productUrl: "https://example.org/products/full-genome",
        callToActionLabel: "View product",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    });
    renderWorkbench();

    fireEvent.change(screen.getByLabelText("Product title"), {
      target: { value: "Full genome report" },
    });
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: "example.org/products/full-genome" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe this product for people browsing Pocket Genes.",
      ),
      {
        target: {
          value:
            "A practical full genome report for patients and clinicians.",
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /Create product/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(sdkFetchMock).toHaveBeenCalledTimes(1);
    expect(sdkFetchMock).toHaveBeenCalledWith(
      "/discover/organizations/org-1/product-catalog",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("Product added.")).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1199);
    });
    expect(routerPush).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(routerPush).toHaveBeenCalledWith(
      "/publisher-portal/discover/organizations/org-1/product-catalog",
    );
  });
});
