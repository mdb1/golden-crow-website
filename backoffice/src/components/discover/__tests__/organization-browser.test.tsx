/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  DiscoverIndividualBrowser,
  DiscoverOrganizationBrowser,
  visibleCountryPillCountForWidth,
} from "@/components/discover/organization-browser";
import type {
  DiscoverIndividualRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";

function organization(
  overrides: Partial<DiscoverOrganizationRecord>,
): DiscoverOrganizationRecord {
  return {
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
    contactEmail: "hello@example.org",
    internalNotes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function individual(
  overrides: Partial<DiscoverIndividualRecord>,
): DiscoverIndividualRecord {
  return {
    id: "individual-1",
    name: "Publisher Individual",
    imageUrl: null,
    status: "active",
    slug: "publisher-individual",
    websiteUrl: "https://individual.example.org",
    description: "Public individual description",
    descriptionEn: "Public individual description",
    social: {},
    countryCode: "US",
    individualType: "pro_clinical_geneticists",
    colorHex: "#123ABC",
    verified: true,
    contactEmail: "hello-individual@example.org",
    internalNotes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function renderBrowser(
  initialLanguage: "en" | "es" = "en",
  options: { routeBase?: string } = {},
) {
  render(
    <AppLanguageProvider
      initialLanguage={initialLanguage}
      forcedLanguage={initialLanguage}
    >
      <DiscoverOrganizationBrowser
        initialOrganizations={[
          organization({
            id: "argentina-lab",
            name: "Argentina Lab",
            countryCode: "AR",
          }),
          organization({
            id: "us-clinic",
            name: "United States Clinic",
            countryCode: "US",
          }),
          organization({
            id: "regional-network",
            name: "Regional Network",
            countryCode: "US,AR",
          }),
        ]}
        initialNextCursor={null}
        routeBase={options.routeBase}
      />
    </AppLanguageProvider>,
  );
}

describe("DiscoverOrganizationBrowser", () => {
  it("calculates the maximum country pills that fit in one line", () => {
    expect(
      visibleCountryPillCountForWidth({
        containerWidth: 260,
        pillWidths: [80, 70, 70],
        overflowWidth: 24,
        gapWidth: 6,
      }),
    ).toBe(3);
    expect(
      visibleCountryPillCountForWidth({
        containerWidth: 200,
        pillWidths: [80, 70, 70],
        overflowWidth: 24,
        gapWidth: 6,
      }),
    ).toBe(2);
    expect(
      visibleCountryPillCountForWidth({
        containerWidth: 120,
        pillWidths: [80, 70, 70],
        overflowWidth: 24,
        gapWidth: 6,
      }),
    ).toBe(1);
  });

  it("uses a country dropdown and filters organizations by country code", async () => {
    const user = userEvent.setup();
    renderBrowser();

    expect(screen.queryByPlaceholderText("Country")).toBeNull();

    const countrySelect = screen.getByRole("combobox", {
      name: "Country",
    }) as HTMLSelectElement;

    expect(countrySelect.tagName).toBe("SELECT");
    expect(
      Array.from(countrySelect.options).some(
        (option) => option.textContent === "All countries",
      ),
    ).toBe(true);
    expect(
      Array.from(countrySelect.options).some(
        (option) => option.value === "AR" && option.textContent === "Argentina (AR)",
      ),
    ).toBe(true);

    await user.selectOptions(countrySelect, "AR");

    expect(screen.getByText("Argentina Lab")).toBeTruthy();
    expect(screen.getByText("Regional Network")).toBeTruthy();
    expect(screen.queryByText("United States Clinic")).toBeNull();
  });

  it("uses the provided route base for detail links", () => {
    renderBrowser("en", {
      routeBase: "/publisher-portal/discover/organizations",
    });

    const openLinks = screen.getAllByRole("link", { name: /Open/i });
    expect(openLinks[0]?.getAttribute("href")).toBe(
      "/publisher-portal/discover/organizations/argentina-lab",
    );
  });

  it("renders country pills in a row below organization categories", () => {
    render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <DiscoverOrganizationBrowser
          initialOrganizations={[
            organization({
              id: "multi-country-lab",
              name: "Multi Country Lab",
              countryCode: "US,AR,MX",
              organizationType: "org_laboratories",
            }),
          ]}
          initialNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    const countryRow = screen.getByTestId(
      "publisher-country-row-multi-country-lab",
    );
    const metadataRow = screen.getByTestId(
      "publisher-metadata-row-multi-country-lab",
    );
    expect(metadataRow.className).toContain("sm:grid-cols-2");
    expect(countryRow.textContent).toContain("United States (US)");
    expect(countryRow.textContent).not.toContain("Laboratory");
  });

  it("renders country pills in a row below individual publisher categories", () => {
    render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <DiscoverIndividualBrowser
          initialIndividuals={[
            individual({
              id: "multi-country-individual",
              name: "Multi Country Individual",
              countryCode: "US,AR,MX",
              individualType: "pro_clinical_geneticists",
            }),
          ]}
          initialNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    const countryRow = screen.getByTestId(
      "publisher-country-row-multi-country-individual",
    );
    expect(countryRow.textContent).toContain("United States (US)");
    expect(countryRow.textContent).not.toContain("Clinical Geneticists");
  });
});
