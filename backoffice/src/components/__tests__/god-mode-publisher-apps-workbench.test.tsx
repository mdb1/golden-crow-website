/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
