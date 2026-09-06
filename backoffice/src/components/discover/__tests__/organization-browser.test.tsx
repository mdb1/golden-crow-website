/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverOrganizationBrowser } from "@/components/discover/organization-browser";
import type { DiscoverOrganizationRecord } from "@/lib/discover";

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

function renderBrowser(initialLanguage: "en" | "es" = "en") {
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
      />
    </AppLanguageProvider>,
  );
}

describe("DiscoverOrganizationBrowser", () => {
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
});
