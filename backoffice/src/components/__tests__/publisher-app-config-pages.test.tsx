/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import EditPublisherAppPage from "@/app/publisher-portal/(portal)/app/edit/page";
import NewPublisherAppPage from "@/app/publisher-portal/(portal)/app/new/page";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_APP_NEW_ROUTE,
} from "@/lib/publisher-portal-routes";
import { redirect } from "next/navigation";

jest.mock("@/lib/publisher-app-config-server", () => ({
  loadPublisherAppPageData: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

jest.mock("@/components/publisher-app-config-workbench", () => ({
  PublisherAppConfigWorkbench: ({ mode }: { mode: string }) => (
    <div data-testid="config-workbench" data-mode={mode} />
  ),
}));

const config: PublisherAppConfig = {
  id: "organization_org-1",
  publisherKind: "organization",
  publisherId: "org-1",
  publisherName: "Pocket Genes Lab",
  publisherEmail: "publisher@example.org",
  publisherUsername: "pocketgenes",
  catalogEnabled: true,
  feedEnabled: true,
  status: "pending_revision",
  platformOption: "ios_android",
  connectEnabled: true,
  profileEnabled: true,
  learnCustomizationEnabled: true,
  colors: {
    primary: "#123ABC",
    secondary: "#456DEF",
    tertiary: "#FEDCBA",
  },
  iconSource: "publisher",
  iconImageUrl: null,
  iconImageUploadDataUrl: null,
  schemaVersion: 1,
  createdAt: "2026-10-30T12:00:00.000Z",
  updatedAt: "2026-10-30T12:00:00.000Z",
  createdByUserId: "publisher-1",
  updatedByUserId: "publisher-1",
};

const baseData = {
  publisherName: "Pocket Genes Lab",
  publisherTint: "#123ABC",
  publisherEmail: "publisher@example.org",
  publisherUsername: "pocketgenes",
};

describe("publisher app configuration pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders create mode when no configuration exists", async () => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({
      ...baseData,
      config: null,
    });

    render(await NewPublisherAppPage());

    expect(screen.getByTestId("config-workbench").dataset.mode).toBe("create");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects the new route to edit when a configuration exists", async () => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({
      ...baseData,
      config,
    });

    await expect(NewPublisherAppPage()).rejects.toThrow(
      `NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_EDIT_ROUTE}`,
    );
    expect(redirect).toHaveBeenCalledWith(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
  });

  it("renders edit mode when a configuration exists", async () => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({
      ...baseData,
      config,
    });

    render(await EditPublisherAppPage());

    expect(screen.getByTestId("config-workbench").dataset.mode).toBe("edit");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects the edit route to new when no configuration exists", async () => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({
      ...baseData,
      config: null,
    });

    await expect(EditPublisherAppPage()).rejects.toThrow(
      `NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_NEW_ROUTE}`,
    );
    expect(redirect).toHaveBeenCalledWith(PUBLISHER_PORTAL_APP_NEW_ROUTE);
  });
});
