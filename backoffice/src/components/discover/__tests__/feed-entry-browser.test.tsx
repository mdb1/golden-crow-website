/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverFeedEntryBrowser } from "@/components/discover/feed-entry-browser";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  DiscoverFeedItemRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";

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
  contactEmail: "hello@example.org",
  internalNotes: "",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const feedItem: DiscoverFeedItemRecord = {
  id: "feed-1",
  publisherOrganizationId: "org-1",
  publisherIndividualId: null,
  publisherSnapshot: {
    name: "Publisher One",
    imageUrl: null,
  },
  type: "news",
  status: "draft",
  publishedAt: null,
  language: "en",
  title: "Draft item",
  subtitle: "Summary",
  body: "Body",
  htmlBody: null,
  imageUrl: null,
  sourceUrl: null,
  sourceButtonText: null,
  news: {
    category: "",
    region: "",
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function renderBrowser() {
  render(
    <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
      <DiscoverFeedEntryBrowser
        initialFeedItems={[feedItem]}
        initialNextCursor={null}
        organizations={[organization]}
        individuals={[]}
        routeBase="/publisher-portal/discover/feed-entries"
      />
    </AppLanguageProvider>,
  );
}

describe("DiscoverFeedEntryBrowser route base", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
  });

  it("keeps create and detail links inside the publisher portal", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      feedItem: { ...feedItem, id: "feed-copy" },
    });
    renderBrowser();

    expect(
      screen.getByRole("link", { name: /New feed entry/i }).getAttribute("href"),
    ).toBe("/publisher-portal/discover/feed-entries/new");
    expect(screen.getByRole("link", { name: /Open/i }).getAttribute("href")).toBe(
      "/publisher-portal/discover/feed-entries/feed-1",
    );

    await user.click(screen.getByRole("button", { name: /Duplicate/i }));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(
        "/publisher-portal/discover/feed-entries/feed-copy",
      );
    });
  });
});
