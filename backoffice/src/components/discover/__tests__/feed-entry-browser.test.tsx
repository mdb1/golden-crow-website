/** @jest-environment jsdom */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverFeedEntryBrowser } from "@/components/discover/feed-entry-browser";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  DiscoverFeedItemRecord,
  DiscoverFeedStatus,
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
  isGrcHighlighted: false,
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

const publishedFeedItem: DiscoverFeedItemRecord = {
  ...feedItem,
  id: "feed-published",
  status: "published",
  publishedAt: "2026-08-03T00:00:00.000Z",
  title: "Published item",
};

function renderBrowser({
  initialFeedItems = [feedItem],
  initialNextCursor = null,
  initialStatus,
  initialLoadError,
}: {
  initialFeedItems?: DiscoverFeedItemRecord[];
  initialNextCursor?: string | null;
  initialStatus?: "all" | DiscoverFeedStatus;
  initialLoadError?: string | null;
} = {}) {
  render(
    <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
      <DiscoverFeedEntryBrowser
        initialFeedItems={initialFeedItems}
        initialNextCursor={initialNextCursor}
        organizations={[organization]}
        individuals={[]}
        initialLoadError={initialLoadError}
        initialStatus={initialStatus}
        routeBase="/publisher-portal/discover/feed-entries"
        publisherPresentation
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

  it("starts on the draft filter when a draft shortcut opens it", () => {
    renderBrowser({
      initialFeedItems: [feedItem, publishedFeedItem],
      initialStatus: "draft",
    });

    expect(screen.getByText("Draft item")).toBeTruthy();
    expect(screen.queryByText("Published item")).toBeNull();
    expect(
      (screen.getAllByRole("combobox")[1] as HTMLSelectElement).value,
    ).toBe("draft");
  });

  it("keeps loading more rows from the draft feed when opened from drafts", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      feedItems: [],
      nextCursor: null,
    });
    renderBrowser({
      initialNextCursor: "next-draft",
      initialStatus: "draft",
    });

    await user.click(screen.getByRole("button", { name: /Load more/i }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/discover/feed-items?cursor=next-draft&status=draft",
      );
    });
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

  it("shows the catalog-style first-entry action only inside the true empty state", () => {
    renderBrowser({ initialFeedItems: [] });

    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(screen.getByText("No feed entries yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Create your first publication and share news, resources, events, or updates with your community.",
      ),
    ).toBeTruthy();
    expect(
      within(emptyState)
        .getByRole("link", { name: /Create your first feed entry/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/discover/feed-entries/new");
    expect(
      screen.getAllByRole("link", { name: /Create your first feed entry/i }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: /^New feed entry$/i }),
    ).toBeNull();
  });

  it("uses filter-specific empty copy and keeps creation in the header", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.type(
      screen.getByPlaceholderText("Search title, publisher, body, or URL"),
      "not present",
    );

    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(screen.getByText("No feed entries match your filters")).toBeTruthy();
    expect(
      screen.getByText("Try changing or clearing your search and filters."),
    ).toBeTruthy();
    expect(within(emptyState).queryByRole("link")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /^New feed entry$/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/discover/feed-entries/new");
  });

  it("does not present a load failure as an aspirational empty state", () => {
    renderBrowser({
      initialFeedItems: [],
      initialLoadError: "Unable to load Discover data.",
    });

    expect(screen.getAllByText("Unable to load Discover data.")).toHaveLength(2);
    expect(
      screen.queryByTestId("publisher-portal-empty-state"),
    ).toBeNull();
    expect(screen.queryByText("No feed entries yet")).toBeNull();
  });
});
