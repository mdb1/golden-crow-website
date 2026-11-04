/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { GodModePublisherAppsBrowser } from "@/components/god-mode/publisher-apps-workbench";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => <button type="button">Info</button>,
}));

function app(
  id: string,
  publisherName: string,
  overrides: Partial<PublisherAppConfig> = {},
): PublisherAppConfig {
  return {
    id,
    schemaVersion: 1,
    publisherKind: "organization",
    publisherId: id.replace("organization_", ""),
    publisherName,
    publisherEmail: `${id}@example.org`,
    publisherUsername: id,
    catalogEnabled: true,
    feedEnabled: true,
    status: "pending_revision",
    platformOption: "ios",
    connectEnabled: true,
    profileEnabled: false,
    learnCustomizationEnabled: false,
    colors: {
      primary: "#6D28D9",
      secondary: "#8B5CF6",
      tertiary: "#F97316",
      counterpointClockwise: "#EC1598",
      counterpointAnticlockwise: "#1598EC",
    },
    iconSource: "publisher",
    iconImageUrl: null,
    iconImageUploadDataUrl: null,
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    createdByUserId: "publisher-user",
    updatedByUserId: "publisher-user",
    ...overrides,
  };
}

function renderBrowser() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GodModePublisherAppsBrowser />
    </QueryClientProvider>,
  );
}

describe("GodModePublisherAppsBrowser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists unscoped apps, opens each editor, and paginates by cursor", async () => {
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({
        apps: [app("organization_alpha", "Alpha Lab")],
        nextCursor: "organization_alpha",
      })
      .mockResolvedValueOnce({
        apps: [
          app("individual_beta", "Beta Doctor", {
            publisherKind: "individual",
            status: "approved",
            platformOption: "ios_android",
          }),
        ],
        nextCursor: null,
      });

    renderBrowser();

    expect(
      await screen.findByRole("link", { name: "Editar app de Alpha Lab" }),
    ).toHaveAttribute("href", "/god-mode/apps/organization_alpha");
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/publisher-app-configs?limit=20",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(
      await screen.findByRole("link", { name: "Editar app de Beta Doctor" }),
    ).toHaveAttribute("href", "/god-mode/apps/individual_beta");
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenLastCalledWith(
        "/admin/publisher-app-configs?limit=20&cursor=organization_alpha",
      ),
    );
    expect(screen.getByText("Aprobada")).toBeInTheDocument();
    expect(screen.getByText("iOS + Android")).toBeInTheDocument();
  });

  it("filters the loaded collection without changing the global endpoint", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      apps: [
        app("organization_alpha", "Alpha Lab"),
        app("organization_gamma", "Gamma Genetics"),
      ],
      nextCursor: null,
    });
    renderBrowser();
    await screen.findByText("Alpha Lab");

    fireEvent.change(
      screen.getByPlaceholderText("Buscar por cliente, email o ID"),
      {
        target: { value: "gamma" },
      },
    );

    expect(screen.queryByText("Alpha Lab")).toBeNull();
    expect(screen.getByText("Gamma Genetics")).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledTimes(1);
  });

  it("shows and fully refreshes the single lightweight app snapshot", async () => {
    const betaDataImage = "data:image/png;base64,iVBORw0KGgo=";
    const currentSnapshot = {
      id: "simple" as const,
      schemaVersion: 1 as const,
      totalCount: 1,
      activeCount: 1,
      inactiveCount: 0,
      sourceReadCount: 2,
      updatedAt: "2026-11-03T12:00:00.000Z",
      updatedByUserId: "god-user",
      statusCounts: [
        { status: "pending_revision" as const, count: 0 },
        { status: "active" as const, count: 1 },
        { status: "approved" as const, count: 0 },
        { status: "changes_requested" as const, count: 0 },
        { status: "rejected" as const, count: 0 },
      ],
      apps: [
        {
          id: "organization_alpha",
          appProviderIdentifier: "app_org_alpha_12345",
          name: "Alpha Catalog",
          image: "https://example.org/alpha.png",
          description: "Alpha snapshot description.",
          status: "active" as const,
          isActive: true,
          publisherKind: "organization" as const,
          publisherId: "alpha",
        },
      ],
    };
    const refreshedSnapshot = {
      ...currentSnapshot,
      totalCount: 2,
      activeCount: 1,
      inactiveCount: 1,
      sourceReadCount: 4,
      apps: [
        ...currentSnapshot.apps,
        {
          id: "individual_beta",
          appProviderIdentifier: null,
          name: "Beta Catalog",
          image: betaDataImage,
          description: "Beta snapshot description.",
          status: "approved" as const,
          isActive: false,
          publisherKind: "individual" as const,
          publisherId: "beta",
        },
      ],
      statusCounts: currentSnapshot.statusCounts.map((entry) =>
        entry.status === "approved" ? { ...entry, count: 1 } : entry,
      ),
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (path === "/admin/publisher-app-configs/snapshot") {
        return init?.method === "PUT"
          ? { snapshot: refreshedSnapshot }
          : { snapshot: currentSnapshot };
      }
      return {
        apps: [app("organization_alpha", "Alpha Lab")],
        nextCursor: null,
      };
    });

    renderBrowser();
    await screen.findByText("Alpha Lab");
    fireEvent.click(
      screen.getByRole("button", { name: "Show snapshot stats" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "custom_apps_snapshot/simple",
    });
    const file = await within(dialog).findByTestId(
      "publisher-apps-snapshot-file",
    );
    expect(within(file).getByText("Alpha Catalog")).toBeInTheDocument();
    expect(
      within(file).getByText("app_org_alpha_12345"),
    ).toBeInTheDocument();
    expect(
      within(file).getByRole("img", { name: "Alpha Catalog thumbnail" }),
    ).toHaveAttribute("src", "https://example.org/alpha.png");
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/publisher-app-configs/snapshot",
      { cache: "no-store" },
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Update snapshot" }),
    );

    expect(await within(dialog).findByText("Beta Catalog")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "Beta Catalog thumbnail" }),
    ).toHaveAttribute("src", betaDataImage);
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/publisher-app-configs/snapshot",
      { method: "PUT" },
    );
  });
});
