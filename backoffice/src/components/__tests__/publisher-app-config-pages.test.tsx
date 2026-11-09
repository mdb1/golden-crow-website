/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import EditPublisherAppPage from "@/app/publisher-portal/(portal)/app/edit/page";
import NewPublisherAppPage from "@/app/publisher-portal/(portal)/app/new/page";
import PublisherAppSignTermsPage from "@/app/publisher-portal/(portal)/app/sign-terms-and-conditions/page";
import GodModeAppSignTermsPage from "@/app/(dashboard)/god-mode/apps/[configId]/sign-terms-and-conditions/page";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_APP_NEW_ROUTE,
} from "@/lib/publisher-portal-routes";
import { redirect } from "next/navigation";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

jest.mock("@/lib/admin-context-server", () => ({ getAdminContextServer: jest.fn() }));
jest.mock("@/lib/sdk-server", () => ({ sdkFetchServer: jest.fn() }));

jest.mock("@/lib/publisher-app-config-server", () => ({
  loadPublisherAppPageData: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

jest.mock("@/components/publisher-app-publication-workbench", () => ({
  PublisherAppPublicationWorkbench: ({ config, apiPath, editHref }: { config: PublisherAppConfig; apiPath?: string; editHref?: string }) => (
    <div data-testid="publication-workbench" data-config={config.id} data-api-path={apiPath} data-edit-href={editHref} />
  ),
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
    counterpointClockwise: "#7D12E2",
    counterpointAnticlockwise: "#12DFE2",
    counterpointFarClockwise: "#E212DF",
    counterpointFarAnticlockwise: "#12E27D",
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

  it("renders only the publication review when the publisher app is active for testing", async () => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({ ...baseData, config: { ...config, status: "active_for_testing" } });
    render(await PublisherAppSignTermsPage());
    expect(screen.getByTestId("publication-workbench")).toHaveAttribute("data-config", config.id);
    expect(screen.queryByTestId("config-workbench")).toBeNull();
  });

  it("redirects the signature route to creation when there is no app", async () => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({ ...baseData, config: null });
    await expect(PublisherAppSignTermsPage()).rejects.toThrow(`NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_NEW_ROUTE}`);
  });

  it.each(["pending_revision", "active_waiting_for_payment", "active", "approved", "changes_requested", "rejected"] as const)("redirects a %s app away from signing", async status => {
    jest.mocked(loadPublisherAppPageData).mockResolvedValue({ ...baseData, config: { ...config, status } });
    await expect(PublisherAppSignTermsPage()).rejects.toThrow(`NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_EDIT_ROUTE}`);
  });

  it("keeps GOD MODE signing scoped to the selected app and its edit destination", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue({ isBootstrap: true } as Awaited<ReturnType<typeof getAdminContextServer>>);
    jest.mocked(sdkFetchServer).mockResolvedValue({ config: { ...config, status: "active_for_testing" } });
    render(await GodModeAppSignTermsPage({ params: Promise.resolve({ configId: config.id }) }));
    expect(sdkFetchServer).toHaveBeenCalledWith(`/admin/publisher-app-configs/${config.id}`);
    expect(screen.getByTestId("publication-workbench")).toHaveAttribute("data-api-path", `/admin/publisher-app-configs/${config.id}`);
    expect(screen.getByTestId("publication-workbench")).toHaveAttribute("data-edit-href", `/god-mode/apps/${config.id}`);
  });

  it("blocks GOD MODE signing before reading an app for an ordinary operator", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue({ isBootstrap: false } as Awaited<ReturnType<typeof getAdminContextServer>>);
    await expect(GodModeAppSignTermsPage({ params: Promise.resolve({ configId: config.id }) })).rejects.toThrow("NEXT_REDIRECT:/2pq-dashboard");
    expect(sdkFetchServer).not.toHaveBeenCalled();
  });

  it.each(["pending_revision", "active_waiting_for_payment", "active", "approved", "changes_requested", "rejected"] as const)("redirects GOD MODE signing for a %s app back to its selected edit page", async status => {
    jest.mocked(getAdminContextServer).mockResolvedValue({ isBootstrap: true } as Awaited<ReturnType<typeof getAdminContextServer>>);
    jest.mocked(sdkFetchServer).mockResolvedValue({ config: { ...config, status } });
    await expect(GodModeAppSignTermsPage({ params: Promise.resolve({ configId: config.id }) })).rejects.toThrow(`NEXT_REDIRECT:/god-mode/apps/${config.id}`);
  });

  it.each(["missing app", "inaccessible app"])("does not render a signature review for a GOD MODE %s", async failure => {
    jest.mocked(getAdminContextServer).mockResolvedValue({ isBootstrap: true } as Awaited<ReturnType<typeof getAdminContextServer>>);
    if (failure === "missing app") {
      jest.mocked(sdkFetchServer).mockResolvedValue({ config: null });
    } else {
      jest.mocked(sdkFetchServer).mockRejectedValue(new Error("App is not accessible"));
    }
    await expect(GodModeAppSignTermsPage({ params: Promise.resolve({ configId: config.id }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(screen.queryByTestId("publication-workbench")).toBeNull();
  });
});
