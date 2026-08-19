/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverFeedEntryWorkbench } from "@/components/discover/feed-entry-workbench";
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
  description: "Descripción pública",
  description_en: "Public description",
  countryCode: "AR",
  organizationType: "patient_advocacy_group",
  color_hex: "#123ABC",
  verified: true,
  contactEmail: "hello@example.org",
  internalNotes: "",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

describe("DiscoverFeedEntryWorkbench region picker", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(sdkFetch).mockResolvedValue({
      feedItem: {
        id: "feed-1",
      } as DiscoverFeedItemRecord,
    });
  });

  it("stores selected news regions as comma-separated three-letter codes", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "org-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose countries/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Argentina (ARG)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Spain (ESP)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "England (ENG)" }));

    expect((screen.getByLabelText("Region") as HTMLInputElement).value).toBe(
      "ARG, ESP, ENG",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.news).toEqual({
      category: "",
      region: "ARG, ESP, ENG",
    });
  });

  it("dismisses publish validation errors with OK without leaving the page", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish to Discover" }));

    expect(await screen.findByText("Publish needs attention")).toBeTruthy();
    expect(
      screen.getByText(
        "Publishing stopped. Review the highlighted requirement and try again.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(screen.queryByText("Publish needs attention")).toBeNull();
    });
    expect(routerPush).not.toHaveBeenCalled();
  });
});
