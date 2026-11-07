/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import GodModeNewAppPage from "@/app/(dashboard)/god-mode/apps/new/page";
import { GodModeNewPublisherApp } from "@/components/god-mode/new-publisher-app";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { getChromeMetadata } from "@/lib/moderation-config";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
jest.mock("@/lib/admin-context-server", () => ({ getAdminContextServer: jest.fn() }));
jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));
jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => <button type="button">Info</button>,
  HeaderUnclutterScope: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/publisher-app-promo-banner", () => ({
  PublisherAppPromoBanner: (props: Record<string, string>) => (
    <div data-testid="promo-banner">{JSON.stringify(props)}</div>
  ),
}));
jest.mock("@/components/publisher-app-config-workbench", () => ({
  PublisherAppConfigWorkbench: (props: Record<string, unknown>) => (
    <div data-testid="config-workbench">{JSON.stringify(props)}</div>
  ),
}));

const alpha = { id: "alpha", name: "Alpha Lab", contactEmail: "alpha@example.org" };
const beta = { id: "beta", name: "Beta Lab", contactEmail: "beta@example.org" };
const publisher = {
  config: null,
  publisherKind: "organization",
  publisherId: "alpha",
  publisherName: "Alpha Lab",
  publisherTint: "#123ABC",
  publisherImageUrl: "https://example.org/alpha.png",
  publisherEmail: "operator@example.org",
  publisherUsername: "operator",
};

function renderCreator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><GodModeNewPublisherApp /></QueryClientProvider>);
}

describe("god-mode organization app creation", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("selects an organization, shows its portal banner, and starts the shared wizard only when tapped", async () => {
    jest.mocked(sdkFetch).mockImplementation(async (path) =>
      path.startsWith("/discover/") ? { organizations: [alpha], nextCursor: null } : publisher,
    );
    renderCreator();
    fireEvent.click(await screen.findByRole("button", { name: /Alpha Lab/ }));
    expect(JSON.parse((await screen.findByTestId("promo-banner")).textContent!)).toMatchObject({
      organizationName: "Alpha Lab",
      organizationTint: "#123ABC",
      organizationImageUrl: "https://example.org/alpha.png",
    });
    expect(screen.queryByTestId("config-workbench")).toBeNull();
    expect(sdkFetch).toHaveBeenCalledWith("/admin/publisher-app-configs/organizations/alpha");
    expect(jest.mocked(sdkFetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Crear app para Alpha Lab" }));
    expect(JSON.parse(screen.getByTestId("config-workbench").textContent!)).toMatchObject({
      publisherId: "alpha",
      publisherName: "Alpha Lab",
      publisherTint: "#123ABC",
      publisherImageUrl: "https://example.org/alpha.png",
      publisherEmail: "operator@example.org",
      publisherUsername: "operator",
      mode: "create",
      apiPath: "/admin/publisher-app-configs/organizations/alpha",
      editHref: "/god-mode/apps/organization_alpha",
      backHref: "/god-mode/apps",
      backLabel: "Volver a Apps",
    });
    expect(screen.queryByRole("group", { name: "Organizaciones" })).toBeNull();
  });

  it("loads organizations in pages and filters the loaded choices", async () => {
    jest.mocked(sdkFetch)
      .mockResolvedValueOnce({ organizations: [alpha], nextCursor: "alpha" })
      .mockResolvedValueOnce({ organizations: [beta], nextCursor: null });
    renderCreator();
    await screen.findByRole("button", { name: /Alpha Lab/ });
    expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations?limit=20");
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    await screen.findByRole("button", { name: /Beta Lab/ });
    expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations?limit=20&cursor=alpha");
    fireEvent.change(screen.getByLabelText("Organización"), { target: { value: "beta@example.org" } });
    expect(screen.queryByRole("button", { name: /Alpha Lab/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Beta Lab/ })).toBeTruthy();
  });

  it("opens the existing god-mode app instead of offering a duplicate", async () => {
    jest.mocked(sdkFetch).mockImplementation(async (path) =>
      path.startsWith("/discover/")
        ? { organizations: [alpha], nextCursor: null }
        : { ...publisher, config: { id: "organization_alpha" } },
    );
    renderCreator();
    fireEvent.click(await screen.findByRole("button", { name: /Alpha Lab/ }));
    expect(await screen.findByRole("link", { name: "Editar app de Alpha Lab" })).toHaveAttribute("href", "/god-mode/apps/organization_alpha");
    expect(screen.queryByRole("button", { name: /Crear app para/ })).toBeNull();
    expect(JSON.parse(screen.getByTestId("promo-banner").textContent!)).toMatchObject({ ctaLabel: "Editar mi app" });
  });

  it("clears the previous banner when another organization cannot be loaded and allows retry", async () => {
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path.startsWith("/discover/")) return { organizations: [alpha, beta], nextCursor: null };
      if (path.endsWith("/beta")) throw new Error("Organization no longer exists");
      return publisher;
    });
    renderCreator();
    fireEvent.click(await screen.findByRole("button", { name: /Alpha Lab/ }));
    await screen.findByRole("button", { name: "Crear app para Alpha Lab" });
    fireEvent.click(screen.getByRole("button", { name: /Beta Lab/ }));
    await screen.findByRole("alert");
    expect(screen.queryByTestId("promo-banner")).toBeNull();
    jest.mocked(sdkFetch).mockResolvedValue({ ...publisher, publisherId: "beta", publisherName: "Beta Lab" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("button", { name: "Crear app para Beta Lab" });
  });

  it("gates the new route and gives it a creation title", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue({ isBootstrap: false } as Awaited<ReturnType<typeof getAdminContextServer>>);
    await expect(GodModeNewAppPage()).rejects.toThrow("NEXT_REDIRECT:/2pq-dashboard");
    expect(redirect).toHaveBeenCalledWith("/2pq-dashboard");
    expect(sdkFetch).not.toHaveBeenCalled();
    jest.mocked(getAdminContextServer).mockResolvedValue({ isBootstrap: true } as Awaited<ReturnType<typeof getAdminContextServer>>);
    await expect(GodModeNewAppPage()).resolves.toBeTruthy();
    expect(getChromeMetadata("/god-mode/apps/new").title).toBe("Nueva app");
  });
});
