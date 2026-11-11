/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { GodModePublisherAppsBrowser } from "@/components/god-mode/publisher-apps-workbench";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
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
      counterpointClockwise: "#EC15CE",
      counterpointAnticlockwise: "#1562EC",
      counterpointFarClockwise: "#EC1562",
      counterpointFarAnticlockwise: "#15CEEC",
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
    jest.resetAllMocks();
  });

  it("places individual deletion beside the purple arrow and requires confirmation", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({ apps: [app("organization_alpha", "Alpha Lab")], nextCursor: null });
    renderBrowser();
    const trash = await screen.findByRole("button", { name: "Eliminar app de Alpha Lab" });
    expect(screen.getByRole("link", { name: "Abrir app de Alpha Lab" }).parentElement).toContainElement(trash);
    fireEvent.click(trash);
    const dialog = screen.getByRole("alertdialog", { name: "¿Eliminar esta app?" });
    expect(within(dialog).getByText("Alpha Lab")).toBeVisible();
    expect(within(dialog).getByText(/Esta acción no se puede deshacer/)).toBeVisible();
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sdkFetch).toHaveBeenCalledTimes(1);
  });

  it("selects only visible loaded apps and makes hidden selections explicit", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({ apps: [app("organization_alpha", "Alpha Lab"), app("organization_beta", "Beta Lab")], nextCursor: "next-page" });
    renderBrowser();
    const selectAlpha = await screen.findByRole("checkbox", { name: "Seleccionar app de Alpha Lab" });
    fireEvent.click(selectAlpha);
    expect(screen.getByRole("checkbox", { name: "Seleccionar apps visibles" })).toBePartiallyChecked();
    fireEvent.change(screen.getByPlaceholderText("Buscar por cliente, email o ID"), { target: { value: "beta" } });
    expect(screen.getByText("1 seleccionadas · 1 fuera del filtro")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar apps visibles" }));
    expect(screen.getByRole("button", { name: "Eliminar seleccionadas (2)" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Seleccionar apps visibles" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar apps visibles" }));
    expect(screen.getByRole("button", { name: "Eliminar seleccionadas (1)" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));
    expect(screen.queryByRole("button", { name: /Eliminar seleccionadas/ })).toBeNull();
    expect(sdkFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves selection across pages, deletes sequentially once, and reloads from the first page", async () => {
    const alpha = app("organization_alpha", "Alpha Lab");
    const beta = app("individual_beta", "Beta Doctor", { publisherKind: "individual" });
    let resolveFirst!: (result: unknown) => void;
    const firstDeletion = new Promise((resolve) => { resolveFirst = resolve; });
    let deleted = false;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") {
        if (path.endsWith(alpha.id)) return firstDeletion;
        deleted = true;
        return { deleted: true, configId: beta.id };
      }
      if (deleted) return { apps: [], nextCursor: null };
      return path.includes("cursor=") ? { apps: [beta], nextCursor: null } : { apps: [alpha], nextCursor: alpha.id };
    });
    renderBrowser();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar app de Alpha Lab" }));
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar app de Beta Doctor" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar seleccionadas (2)" }));
    const confirm = screen.getByRole("button", { name: "Eliminar 2 apps" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(jest.mocked(sdkFetch).mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Listo" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await act(async () => resolveFirst({ deleted: true, configId: alpha.id }));
    await waitFor(() => expect(screen.getByText("2 eliminadas · 0 con errores.")).toBeVisible());
    const deletions = jest.mocked(sdkFetch).mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deletions).toEqual([
      [`/admin/publisher-app-configs/${alpha.id}`, { method: "DELETE", body: JSON.stringify({ expectedUpdatedAt: alpha.updatedAt }) }],
      [`/admin/publisher-app-configs/${beta.id}`, { method: "DELETE", body: JSON.stringify({ expectedUpdatedAt: beta.updatedAt }) }],
    ]);
    await waitFor(() => expect(sdkFetch).toHaveBeenLastCalledWith("/admin/publisher-app-configs?limit=20"));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(await screen.findByText("Todavía no hay apps configuradas.")).toBeVisible();
  });

  it("reports partial failures without losing confirmed deletions or skipping later selected apps", async () => {
    const remaining = new Map([
      ["organization_alpha", app("organization_alpha", "Alpha Lab")],
      ["organization_beta", app("organization_beta", "Beta Lab")],
      ["organization_gamma", app("organization_gamma", "Gamma Lab")],
    ]);
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method !== "DELETE") return { apps: [...remaining.values()], nextCursor: null };
      const id = path.split("/").at(-1)!;
      if (id === "organization_beta") throw new SdkRequestError({ status: 409, method: "DELETE", path, message: "The app changed.", details: "" });
      remaining.delete(id);
      return { deleted: true, configId: id };
    });
    renderBrowser();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar apps visibles" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar seleccionadas (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar 3 apps" }));
    expect(await screen.findByText("2 eliminadas · 1 con errores.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("La app cambió.");
    expect(screen.getAllByText("Eliminada")).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("button", { name: "Listo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(await screen.findByRole("link", { name: "Editar app de Beta Lab" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Editar app de Alpha Lab" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Editar app de Gamma Lab" })).toBeNull();
    expect(jest.mocked(sdkFetch).mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(3);
  });

  it("treats an unconfirmed response as uncertain and refreshes the server state", async () => {
    let deleted = false;
    jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
      if (init?.method === "DELETE") { deleted = true; throw new Error("Connection lost after committing deletion"); }
      return { apps: deleted ? [] : [app("organization_alpha", "Alpha Lab")], nextCursor: null };
    });
    renderBrowser();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar app de Alpha Lab" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos confirmar la eliminación.");
    expect(screen.queryByText("Eliminada")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Listo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(await screen.findByText("Todavía no hay apps configuradas.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Eliminar seleccionadas/ })).toBeNull();
  });

  it("refuses an acknowledgement for a different app", async () => {
    jest.mocked(sdkFetch).mockImplementation(async (_path, init) => init?.method === "DELETE"
      ? { deleted: true, configId: "different-app" }
      : { apps: [app("organization_alpha", "Alpha Lab")], nextCursor: null });
    renderBrowser();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar app de Alpha Lab" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos confirmar la eliminación.");
    expect(screen.queryByText("Eliminada")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Listo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(await screen.findByRole("link", { name: "Editar app de Alpha Lab" })).toBeVisible();
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

    expect(screen.getByRole("link", { name: "Nueva app" })).toHaveAttribute(
      "href", "/god-mode/apps/new",
    );

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

  it("distinguishes active, testing, payment, and upload states with read-only labels", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      apps: [
        app("organization_active", "Active Lab", { status: "active" }),
        app("organization_testing", "Testing Lab", { status: "active_for_testing" }),
        app("organization_payment", "Payment Lab", { status: "active_waiting_for_payment" }),
        app("organization_upload", "Upload Lab", { status: "active_waiting_for_upload" }),
      ],
      nextCursor: null,
    });
    renderBrowser();
    await screen.findByText("Testing Lab");
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Activa para pruebas")).toBeInTheDocument();
    expect(screen.getByText("Publicación solicitada · Pendiente de pago")).toBeInTheDocument();
    expect(screen.getByText("Activa · Pendiente de subida")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activa · Pendiente de subida" })).toBeNull();
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
        { status: "active_for_testing" as const, count: 1 },
        { status: "active_waiting_for_payment" as const, count: 0 },
        { status: "active_waiting_for_upload" as const, count: 0 },
        { status: "active" as const, count: 0 },
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
          status: "active_for_testing" as const,
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
    expect(within(file).getByText("Activa para pruebas")).toBeInTheDocument();
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
