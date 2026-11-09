/** @jest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import {
  publisherAppCounterpointColors,
  publisherAppSemanticColors,
  publisherAppStatusLabel,
  type PublisherAppConfig,
  type PublisherAppColors,
  type PublisherAppPaletteOverridePlan,
} from "@/lib/publisher-app-config";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_HOME_ROUTE,
} from "@/lib/publisher-portal-routes";
import { fetchPublisherAppCustomizationCatalog } from "@/lib/publisher-app-customization-catalog-client";
import { fetchPublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-overrides-client";
import { getPublisherAppColorCatalog } from "@/lib/publisher-app-customization-catalog-server";
import { createPublisherAppPaletteOverridePlan } from "@/lib/publisher-app-palette-overrides";
import { mergePublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-override-merge";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => {
  const actual = jest.requireActual("@/lib/sdk-client");
  return {
    ...actual,
    sdkFetch: jest.fn(),
  };
});

jest.mock("@/lib/publisher-app-customization-catalog-client", () => ({
  fetchPublisherAppCustomizationCatalog: jest.fn(),
}));

jest.mock("@/lib/publisher-app-palette-overrides-client", () => ({
  fetchPublisherAppPaletteOverrides: jest.fn(),
}));

const savedConfig: PublisherAppConfig = {
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
  iconImageUrl: "https://example.org/icon.png",
  iconImageUploadDataUrl: null,
  advancedConfiguration: {
    displayName: "Pocket Genes Lab",
    semanticColors: null,
    colorOverrides: {},
    catalogEnabled: true,
    feedEnabled: true,
    discoverScope: {
      mode: "organization",
      publisherOrganizationId: "org-1",
    },
    serviceScope: {
      mode: "provider",
      providerId: "org-1",
      providerKind: "organization",
    },
    localization: {
      defaultLanguage: "es",
      availableLanguages: ["en", "es"],
    },
    textOverrides: [
      {
        key: "Contact Pocket Genes",
        en: "Contact Pocket Genes Lab",
        es: "Contactá a Pocket Genes Lab",
      },
    ],
    learn: { mode: "base" },
    links: {
      joinUs: {
        en: "https://example.org/en/contact",
        es: "https://example.org/es/contact",
      },
      supportEmail: "support@example.org",
      privacyUrl: "https://example.org/privacy",
      termsUrl: "https://example.org/terms",
    },
  },
  schemaVersion: 1,
  createdAt: "2026-10-30T12:00:00.000Z",
  updatedAt: "2026-10-30T12:00:00.000Z",
  createdByUserId: "publisher-1",
  updatedByUserId: "publisher-1",
};

function mockConfigRequests(config: PublisherAppConfig = savedConfig) {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => ({
    config: path.endsWith("/identifier") ? {
      ...config,
      status: "active_for_testing",
      appProviderIdentifier: "app_org_pocket_genes_lab_48217",
    } : init?.method === "PUT" ? { ...config, ...JSON.parse(String(init.body)) } : config,
  }));
}

function renderWorkbench(
  props: Partial<React.ComponentProps<typeof PublisherAppConfigWorkbench>> = {},
) {
  return render(
    <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
      <PublisherAppConfigWorkbench
        mode="create"
        publisherKind="organization"
        publisherId="org-1"
        publisherName="Pocket Genes Lab"
        publisherTint="#123ABC"
        publisherEmail="publisher@example.org"
        publisherUsername="pocketgenes"
        {...props}
      />
    </AppLanguageProvider>,
  );
}

function advanceToColors() {
  fireEvent.click(screen.getByRole("button", { name: /Paso 3 Colores/i }));
}

function advanceToIcon() {
  fireEvent.click(screen.getByRole("button", { name: /Paso 4 Icono/i }));
}

function chooseColor(label: string, color: string) {
  fireEvent.click(screen.getByRole("button", { name: `Editar ${label}` }));
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(document.querySelectorAll('input[type="color"]')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText(`Elegir ${label}`), { target: { value: color } });
  fireEvent.click(screen.getByRole("button", { name: "Usar este color" }));
  expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);
}

function palettePlan(colors: PublisherAppColors) {
  const catalog = getPublisherAppColorCatalog();
  return createPublisherAppPaletteOverridePlan(
    colors,
    catalog.options,
    catalog.catalogVersion,
    catalog.alternativeTonalFlows,
    catalog.contrastPairs,
  );
}

function createTestingApp() {
  advanceToIcon();
  fireEvent.click(screen.getByRole("button", { name: "Crear app para pruebas" }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("PublisherAppConfigWorkbench", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchPublisherAppPaletteOverrides).mockImplementation(async (colors) => palettePlan(colors));
  });

  it("creates an app for testing after four steps without requiring a signature", async () => {
    const activatedConfig: PublisherAppConfig = {
      ...savedConfig,
      status: "active_for_testing",
      appProviderIdentifier: "app_org_pocket_genes_lab_48217",
      runtimeRevision: 1,
    };
    jest
      .mocked(sdkFetch)
      .mockImplementation(async (path) =>
        path === "/publisher-app/config/identifier"
          ? { config: activatedConfig }
          : { config: savedConfig },
      );
    renderWorkbench();

    expect(
      screen.getByRole("heading", { name: "Configurá tu app" }),
    ).toBeTruthy();
    const iosRadio = screen.getByRole("radio", { name: /Solo iOS/i });
    expect(iosRadio).toHaveAttribute("data-state", "checked");
    expect(iosRadio.parentElement).toHaveClass("sr-only");
    const iosAndroidRadio = screen.getByRole("radio", {
      name: /iOS \+ Android/i,
    });
    expect(iosAndroidRadio).toHaveAttribute("data-state", "unchecked");
    expect(iosAndroidRadio.parentElement).toHaveClass("sr-only");
    const iosPrice = screen.getByTestId("publisher-app-platform-price-ios");
    const bothPlatformsPrice = screen.getByTestId(
      "publisher-app-platform-price-ios_android",
    );
    expect(iosPrice).toHaveTextContent("USD 59.99 / mes");
    expect(bothPlatformsPrice).toHaveTextContent("USD 119.98 / mes");
    expect(iosPrice).toHaveClass("rounded-full", "text-[11px]");
    expect(bothPlatformsPrice).toHaveClass("rounded-full", "text-[11px]");
    fireEvent.click(screen.getByRole("button", { name: /Paso 2 Funciones/i }));
    const catalogCheckbox = screen.getByRole("checkbox", {
      name: "Catálogo de productos y servicios",
    });
    expect(catalogCheckbox).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Feed de novedades" }),
    ).toBeDisabled();
    expect(catalogCheckbox.parentElement).toHaveClass("sr-only");
    expect(screen.getAllByText("Incluida")).toHaveLength(2);
    expect(
      screen
        .getByTestId("publisher-app-feature-list")
        .querySelectorAll("label"),
    ).toHaveLength(5);
    const featureCheckboxes = screen.getAllByRole("checkbox");
    expect(
      featureCheckboxes.map((checkbox) => checkbox.getAttribute("aria-label")),
    ).toEqual([
      "Catálogo de productos y servicios",
      "Feed de novedades",
      "Sección Comunidad",
      "Contenidos educativos propios",
      "Gestión de turnos",
    ]);
    const communityCheckbox = screen.getByRole("checkbox", {
      name: "Sección Comunidad",
    });
    const learnCheckbox = screen.getByRole("checkbox", {
      name: "Contenidos educativos propios",
    });
    const appointmentsCheckbox = screen.getByRole("checkbox", {
      name: "Gestión de turnos",
    });
    expect(communityCheckbox).toBeChecked();
    expect(learnCheckbox).not.toBeChecked();
    expect(appointmentsCheckbox).not.toBeChecked();
    const featureDescriptions = [
      "Tus productos y servicios, siempre organizados, disponibles y listos para descubrir.",
      "Notas, eventos y publicaciones para mantener informada y activa tu comunidad.",
      "Permite conversar, publicar preguntas y encontrar otros miembros de la comunidad.",
      "Customiza tus clases y contenidos según las necesidades de tus usuarios.",
      "Tus usuarios pueden solicitar y reservar turnos directamente desde la aplicación.",
    ];
    featureDescriptions.forEach((description) => {
      const descriptionElement = screen.getByText(description);
      expect(descriptionElement).toBeTruthy();
      expect(descriptionElement.textContent?.trim().split(/\s+/)).toHaveLength(
        11,
      );
      expect(descriptionElement).toHaveClass("sm:min-h-12");
    });
    fireEvent.click(communityCheckbox);
    advanceToColors();
    chooseColor("color principal", "#112233");
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    advanceToIcon();

    expect(screen.queryByTestId("publisher-app-review")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Leí y acepto/i })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Paso \d/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Paso 5/i })).toBeNull();
    const createButton = screen.getByRole("button", { name: "Crear app para pruebas" });
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/publisher-app/config", expect.objectContaining({ method: "PUT" }));
    });
    const [path, init] = jest.mocked(sdkFetch).mock.calls[0];
    expect(path).toBe("/publisher-app/config");
    expect(init?.method).toBe("POST");
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      platformOption: "ios",
      connectEnabled: false,
      profileEnabled: false,
      learnCustomizationEnabled: false,
      colors: {
        primary: "#112233",
        ...publisherAppCounterpointColors("#112233"),
      },
      iconSource: "publisher",
    });
    expect(payload).not.toHaveProperty("publisherId");
    expect(payload).not.toHaveProperty("publisherKind");
    expect(payload).not.toHaveProperty("publisherEmail");
    expect(payload).not.toHaveProperty("publisherUsername");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("catalogEnabled");
    expect(payload).not.toHaveProperty("feedEnabled");
    await screen.findByTestId("publisher-app-success-overlay");
    expect(screen.queryByText(/próximas 24 a 48 horas/i)).toBeNull();
    expect(payload).not.toHaveProperty("termsAccepted");
    const successOverlay = screen.getByTestId("publisher-app-success-overlay");
    expect(successOverlay).toHaveClass(
      "fixed",
      "inset-0",
      "z-[2200]",
      "publisher-app-success-overlay",
    );
    const successCircle = screen.getByTestId("publisher-app-success-circle");
    expect(successCircle).toHaveClass(
      "publisher-app-success-circle",
      "bg-[#16a34a]",
    );
    expect(screen.getByTestId("publisher-app-success-content")).toHaveClass(
      "publisher-app-success-content",
    );
    expect(screen.getByTestId("publisher-app-success-mark")).toBeTruthy();
    expect(successOverlay.querySelector(".app-success-particle")).toBeNull();
    const successCss = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8",
    );
    expect(successCss).toContain(
      "animation: publisher-app-success-explode 980ms",
    );
    expect(successCss).toContain(
      "animation: publisher-app-success-content-in 720ms ease 640ms forwards",
    );
    expect(successCss).toContain("transform: translate(-50%, -50%) scale(120)");
    expect(
      screen.getByRole("link", { name: /Ver y editar mi app/i }),
    ).toHaveAttribute("href", PUBLISHER_PORTAL_APP_EDIT_ROUTE);

    fireEvent.animationEnd(successCircle);
    fireEvent.animationEnd(successCircle);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config/identifier",
        { method: "POST" },
      );
    });
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([requestPath]) => requestPath === "/publisher-app/config/identifier",
        ),
    ).toHaveLength(1);
    expect(
      await screen.findByText("app_org_pocket_genes_lab_48217"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("publisher-app-automatic-activation"),
    ).toHaveTextContent("La app está activa para pruebas");
  });

  it("creates and automatically activates a god-mode app while keeping every exit in god mode", async () => {
    const apiPath = "/admin/publisher-app-configs/organizations/org-1";
    const editHref = "/god-mode/apps/organization_org-1";
    jest.mocked(sdkFetch).mockImplementation(async (path) => ({
      config: path.endsWith("/identifier")
        ? { ...savedConfig, status: "active_for_testing", appProviderIdentifier: "app_org_pocket_genes_lab_48217" }
        : savedConfig,
    }));
    renderWorkbench({
      apiPath,
      editHref,
      backHref: "/god-mode/apps",
      backLabel: "Volver a Apps",
      publisherKind: "organization",
      publisherId: "org-1",
    });
    expect(screen.getByRole("link", { name: "Volver a Apps" })).toHaveAttribute("href", "/god-mode/apps");
    expect(screen.getAllByRole("button", { name: /Paso \d/ })).toHaveLength(4);
    createTestingApp();
    await screen.findByTestId("publisher-app-success-overlay");
    expect(sdkFetch).toHaveBeenCalledWith(apiPath, expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("link", { name: /Ver y editar mi app/i })).toHaveAttribute("href", editHref);
    expect(screen.getByRole("link", { name: "Volver a Apps" })).toHaveAttribute("href", "/god-mode/apps");
    fireEvent.animationEnd(screen.getByTestId("publisher-app-success-circle"));
    await screen.findByText("app_org_pocket_genes_lab_48217");
    expect(sdkFetch).toHaveBeenCalledWith(`${apiPath}/identifier`, { method: "POST" });
    expect(jest.mocked(sdkFetch).mock.calls.some(([path]) => path.startsWith("/publisher-app/"))).toBe(false);
  });

  it("shows concurrent creation errors without redirecting away from the process", async () => {
    const apiPath = "/admin/publisher-app-configs/organizations/org-1";
    jest.mocked(sdkFetch).mockRejectedValue(new SdkRequestError({
      status: 409,
      method: "POST",
      path: apiPath,
      message: "A publisher app config already exists.",
      details: "",
    }));
    renderWorkbench({
      apiPath,
      editHref: "/god-mode/apps/organization_org-1",
      backHref: "/god-mode/apps",
    });
    createTestingApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("A publisher app config already exists.");
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reintentar proceso" })).toBeEnabled();
  });

  it.each(["/publisher-app/config", "/admin/publisher-app-configs/organizations/org-1"])(
    "runs creation, calculation, color persistence, and publication sequentially with real progress (%s)",
    async (apiPath) => {
      const creation = deferred<{ config: PublisherAppConfig }>();
      const calculation = deferred<PublisherAppPaletteOverridePlan>();
      const colorSave = deferred<{ config: PublisherAppConfig }>();
      const publication = deferred<{ config: PublisherAppConfig }>();
      const operations: string[] = [];
      jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
        if (path.endsWith("/identifier")) { operations.push("publish"); return publication.promise; }
        if (init?.method === "PUT") { operations.push("save-colors"); return colorSave.promise; }
        operations.push("create");
        return creation.promise;
      });
      jest.mocked(fetchPublisherAppPaletteOverrides).mockImplementation(async () => {
        operations.push("calculate");
        return calculation.promise;
      });
      renderWorkbench({ apiPath });
      createTestingApp();
      expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
      expect(operations).toEqual(["create"]);
      const createPayload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls[0][1]?.body));
      expect(createPayload).not.toHaveProperty("termsAccepted");
      expect(createPayload).not.toHaveProperty("advancedConfiguration");
      expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeTruthy();

      creation.resolve({ config: savedConfig });
      await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25"));
      expect(operations).toEqual(["create", "calculate"]);
      const colors = jest.mocked(fetchPublisherAppPaletteOverrides).mock.calls[0][0];
      const plan = palettePlan(colors);
      calculation.resolve(plan);
      await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50"));
      expect(operations).toEqual(["create", "calculate", "save-colors"]);
      const colorPayload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls[1][1]?.body));
      expect(colorPayload.advancedConfiguration.colorOverrides).toEqual(plan.colorOverrides);
      expect(screen.queryByTestId("publisher-app-success-overlay")).toBeNull();

      colorSave.resolve({ config: { ...savedConfig, ...colorPayload } });
      await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75"));
      expect(operations).toEqual(["create", "calculate", "save-colors", "publish"]);
      expect(screen.queryByTestId("publisher-app-success-overlay")).toBeNull();
      publication.resolve({ config: { ...savedConfig, ...colorPayload, status: "active_for_testing", appProviderIdentifier: "app_org_pocket_genes_lab_48217" } });
      await screen.findByTestId("publisher-app-success-overlay");
      expect(screen.getByText("app_org_pocket_genes_lab_48217")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.animationEnd(screen.getByTestId("publisher-app-success-circle"));
      expect(operations).toHaveLength(4);
    },
  );

  it.each(["create", "calculate", "save-colors", "publish"])(
    "shows a %s error and resumes at that stage without repeating completed operations",
    async (failureStage) => {
      const apiPath = "/admin/publisher-app-configs/organizations/org-1";
      const operations: string[] = [];
      let failed = false;
      function operation(stage: string) {
        operations.push(stage);
        if (stage === failureStage && !failed) {
          failed = true;
          throw new SdkRequestError({ status: 500, method: "POST", path: apiPath, message: "Stage unavailable", details: "Backend request error log" });
        }
      }
      jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
        const stage = path.endsWith("/identifier") ? "publish" : init?.method === "PUT" ? "save-colors" : "create";
        operation(stage);
        return { config: stage === "publish" ? { ...savedConfig, status: "active_for_testing", appProviderIdentifier: "app_org_pocket_genes_lab_48217" } : savedConfig };
      });
      jest.mocked(fetchPublisherAppPaletteOverrides).mockImplementation(async (colors) => {
        operation("calculate");
        return palettePlan(colors);
      });
      renderWorkbench({ apiPath });
      createTestingApp();
      expect(await screen.findByRole("alert")).toHaveTextContent("Stage unavailable");
      expect(screen.getByText("Backend request error log")).toBeTruthy();
      const stageIndex = ["create", "calculate", "save-colors", "publish"].indexOf(failureStage);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(stageIndex * 25));
      expect(screen.queryByTestId("publisher-app-success-overlay")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Reintentar proceso" }));
      await screen.findByTestId("publisher-app-success-overlay");
      for (const stage of ["create", "calculate", "save-colors", "publish"]) {
        expect(operations.filter((entry) => entry === stage)).toHaveLength(stage === failureStage ? 2 : 1);
      }
      expect(mockRouterReplace).not.toHaveBeenCalled();
    },
  );

  it("uses the existing publisher icon when the final icon step is not customized", async () => {
    mockConfigRequests();
    renderWorkbench({
      publisherImageUrl: "https://example.org/existing-publisher-icon.png",
    });

    createTestingApp();

    await screen.findByTestId("publisher-app-success-overlay");
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(payload).toMatchObject({
      iconSource: "publisher",
      iconImageUrl: "https://example.org/existing-publisher-icon.png",
      iconImageUploadDataUrl: null,
    });
  });

  it("submits an uploaded publisher identity in the upload field", async () => {
    const publisherIconDataUrl = "data:image/png;base64,QUJDRA==";
    mockConfigRequests({
      ...savedConfig,
      iconImageUrl: null,
      iconImageUploadDataUrl: publisherIconDataUrl,
    });
    renderWorkbench({ publisherImageUrl: publisherIconDataUrl });

    createTestingApp();

    await screen.findByTestId("publisher-app-success-overlay");
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(payload).toMatchObject({
      iconSource: "publisher",
      iconImageUrl: null,
      iconImageUploadDataUrl: publisherIconDataUrl,
    });
  });

  it.each(["pending_revision", "active_waiting_for_payment", "active_waiting_for_upload", "active", "approved", "changes_requested", "rejected"] as const)("does not offer publication while the persisted status is %s", status => {
    renderWorkbench({ mode: "edit", initialConfig: { ...savedConfig, status } });
    expect(screen.queryByRole("button", { name: "Publicar mi app en el store" })).toBeNull();
  });

  it.each([
    { apiPath: "/publisher-app/config", href: "/publisher-portal/app/sign-terms-and-conditions" },
    { apiPath: "/admin/publisher-app-configs/organization_org-1", href: "/god-mode/apps/organization_org-1/sign-terms-and-conditions" },
  ])("opens the dedicated signature flow from testing without accepting terms in the edit view: $apiPath", ({ apiPath, href }) => {
    renderWorkbench({ mode: "edit", apiPath, initialConfig: {
      ...savedConfig, status: "active_for_testing", appProviderIdentifier: "app_org_pocket_genes_lab_48217",
    } });
    const saveBar = screen.getByTestId("publisher-app-edit-save-bar");
    expect(within(saveBar).getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    const publish = within(saveBar).getByRole("button", { name: "Publicar mi app en el store" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveClass("bg-emerald-600", "text-white");
    expect(screen.queryByTestId("publisher-app-terms-acceptance")).toBeNull();
    fireEvent.click(publish);
    expect(mockRouterPush).toHaveBeenCalledWith(href);
    expect(sdkFetch).not.toHaveBeenCalled();
  });

  it("requires saving pending edits before opening the signature's read-only review", async () => {
    mockConfigRequests({ ...savedConfig, status: "active_for_testing", appProviderIdentifier: "app_org_pocket_genes_lab_48217" });
    renderWorkbench({ mode: "edit", initialConfig: { ...savedConfig, status: "active_for_testing", appProviderIdentifier: "app_org_pocket_genes_lab_48217" } });
    const publish = screen.getByRole("button", { name: "Publicar mi app en el store" });
    fireEvent.click(screen.getByRole("button", { name: "Editar funciones" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sección Comunidad" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(publish).toBeDisabled();
    fireEvent.click(publish);
    expect(mockRouterPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(publish).toBeEnabled());
    fireEvent.click(publish);
    expect(mockRouterPush).toHaveBeenCalledWith("/publisher-portal/app/sign-terms-and-conditions");
  });

  it("loads an existing configuration and saves only after it changes", async () => {
    const updatedConfig = {
      ...savedConfig,
      colors: { ...savedConfig.colors, tertiary: "#AABBCC" },
    };
    jest.mocked(sdkFetch).mockResolvedValue({ config: updatedConfig });
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    expect(screen.getByTestId("publisher-app-edit-sheet")).toBeTruthy();
    expect(screen.queryByLabelText("Progreso de configuración")).toBeNull();
    expect(screen.queryByText(/Paso 1 de/i)).toBeNull();
    expect(screen.getByTestId("publisher-app-edit-platforms")).toBeTruthy();
    expect(screen.getByTestId("publisher-app-edit-features")).toBeTruthy();
    expect(screen.getByTestId("publisher-app-edit-colors")).toBeTruthy();
    expect(screen.getByTestId("publisher-app-edit-icon")).toBeTruthy();
    expect(screen.getByLabelText("Vista previa de la app")).toBeTruthy();

    const saveBar = screen.getByTestId("publisher-app-edit-save-bar");
    expect(saveBar).toHaveClass("fixed", "inset-x-0", "bottom-0", "z-40");
    expect(saveBar).not.toHaveClass("sticky");

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Editar plataformas" }));
    expect(
      screen.getByRole("radio", { name: /iOS \+ Android/i }),
    ).toHaveAttribute("data-state", "checked");
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));

    fireEvent.click(screen.getByRole("button", { name: "Editar funciones" }));
    expect(
      screen.getByRole("checkbox", { name: "Sección Comunidad" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Contenidos educativos propios" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Gestión de turnos" }),
    ).toBeChecked();
    expect(screen.getByTestId("publisher-app-edit-feature-list")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));

    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 2 Colores principales" }));
    expect(screen.getByRole("button", { name: "Editar color principal" })).toHaveTextContent("#123ABC");
    chooseColor("color terciario", "#AABBCC");
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(payload.colors.tertiary).toBe("#AABBCC");
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterRefresh).toHaveBeenCalled();
    expect(screen.getAllByText("En revisión").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pending revision")).toBeNull();
    expect(
      screen.queryByText(/Si eliminás esta solicitud, se borrarán los datos/i),
    ).toBeNull();
    expect(screen.getByTestId("publisher-app-danger-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("hides optional feature cells that are not selected in the edit summary", () => {
    renderWorkbench({
      mode: "edit",
      initialConfig: {
        ...savedConfig,
        connectEnabled: true,
        learnCustomizationEnabled: false,
        profileEnabled: false,
      },
    });

    const featureSummary = screen.getByTestId("publisher-app-edit-features");
    expect(featureSummary).toHaveTextContent("3 de 5 experiencias incluidas");
    expect(featureSummary).toHaveTextContent(
      "Catálogo de productos y servicios",
    );
    expect(featureSummary).toHaveTextContent("Feed de novedades");
    expect(featureSummary).toHaveTextContent("Sección Comunidad");
    expect(featureSummary).not.toHaveTextContent(
      "Contenidos educativos propios",
    );
    expect(featureSummary).not.toHaveTextContent("Gestión de turnos");
    expect(featureSummary).not.toHaveTextContent("No incluida");

    fireEvent.click(screen.getByRole("button", { name: "Editar funciones" }));
    expect(
      screen.getByRole("checkbox", { name: "Contenidos educativos propios" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Gestión de turnos" }),
    ).not.toBeChecked();
  });

  it("expands the advanced configuration blocks and persists fine-tuning", async () => {
    mockConfigRequests();
    jest
      .mocked(fetchPublisherAppCustomizationCatalog)
      .mockImplementation(async (kind) => {
        if (kind === "colors") {
          return {
            catalogVersion: 1,
            groups: ["Brand"],
            totalCount: 1,
            nextCursor: null,
            alternativeTonalFlows: [
              {
                id: "communityGenes",
                title: "Genes",
                description: "A fixed aqua circuit-green local palette.",
                roleKeys: ["community.genes.primary"],
              },
              {
                id: "savedContent",
                title: "Saved Content",
                description: "A coordinated local palette.",
                roleKeys: ["brand.primary"],
              },
            ],
            items: [
              {
                key: "brand.primary",
                title: "Primary",
                usageDescription: "Main brand color across the experience.",
                defaultLightColor: "#F61C72",
                defaultDarkColor: "#F61C72",
                group: "Brand",
                platforms: ["ios", "android"],
              },
            ],
          };
        }
        if (kind === "texts") {
          return {
            catalogVersion: 1,
            groups: ["General interface"],
            totalCount: 1,
            nextCursor: null,
            items: [
              {
                key: "Services",
                defaultEnglishText: "Services",
                defaultSpanishText: "Servicios",
                groups: ["General interface"],
                platforms: ["ios", "android"],
                formatArguments: [],
              },
            ],
          };
        }
        throw new Error("Unexpected catalog kind");
      });
    const medicGenConfig = {
      ...savedConfig,
      colors: { ...savedConfig.colors, primary: "#FF5500" },
    };
    renderWorkbench({ mode: "edit", initialConfig: medicGenConfig });

    const advancedToggle = screen.getByTestId("publisher-app-advanced-toggle");
    const advancedTheme = screen.getByTestId("publisher-app-advanced-theme");
    expect(advancedTheme.style.getPropertyValue("--primary")).toBe("#FF5500");
    expect(advancedTheme.style.getPropertyValue("--primary-foreground")).toBe(
      "#0F1728",
    );
    expect(advancedTheme.style.getPropertyValue("--ring")).toBe("#FF5500");
    expect(advancedToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Configuración avanzada")).toBeTruthy();
    expect(
      screen.getByText(
        "Configurá idiomas, textos, contenido educativo, colores y enlaces de la app.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("publisher-app-advanced-content")).toBeNull();

    fireEvent.click(advancedToggle);
    expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("publisher-app-advanced-content")).toBeTruthy();
    const editorTheme = screen.getByTestId(
      "publisher-app-advanced-editor-theme",
    );
    expect(editorTheme.style.getPropertyValue("--primary")).toBe("#FF5500");
    expect(editorTheme.style.getPropertyValue("--primary-foreground")).toBe(
      "#0F1728",
    );
    expect(screen.getByText("Nombre, funciones y colores")).toBeTruthy();
    expect(screen.queryByText("Contenido y servicios vinculados")).toBeNull();
    expect(screen.getByText("Idiomas y textos")).toBeTruthy();
    expect(screen.getByText("Contenido educativo")).toBeTruthy();
    expect(screen.getByText("Enlaces y contacto")).toBeTruthy();
    const identitySegment = screen.getByRole("button", {
      name: /Nombre, funciones y colores/i,
    });
    expect(identitySegment.querySelector(".bg-primary")).toBeTruthy();
    expect(identitySegment.querySelector(".bg-foreground")).toBeNull();

    fireEvent.click(identitySegment);
    const advancedModal = screen.getByTestId("publisher-app-advanced-modal");
    expect(advancedModal.style.getPropertyValue("--primary")).toBe("#FF5500");
    expect(advancedModal.style.getPropertyValue("--primary-foreground")).toBe(
      "#0F1728",
    );
    expect(advancedModal).toHaveClass("sm:max-w-[90rem]");
    expect(
      within(advancedModal).queryByTestId("publisher-app-section-index"),
    ).toBeNull();
    expect(
      within(advancedModal).queryByRole("button", { name: /Siguiente/i }),
    ).toBeNull();
    expect(
      within(advancedModal).queryByRole("button", {
        name: "Volver a secciones",
      }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Cambio descartado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Nombre, funciones y colores/i }),
    );
    expect(screen.getByLabelText("Nombre")).toHaveValue("Pocket Genes Lab");
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Pocket Genes Advanced" },
    });
    const catalogCheckbox = screen.getByRole("checkbox", {
      name: /Catálogo y solicitudes/i,
    });
    expect(catalogCheckbox).toHaveAttribute("aria-checked", "true");
    fireEvent.click(catalogCheckbox);
    expect(catalogCheckbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "Agregar color" }));
    expect(await screen.findByText("Flujos tonales alternativos")).toBeTruthy();
    expect(screen.getByText("Genes")).toBeTruthy();
    expect(screen.getByText("Verde aqua tecnológico")).toBeTruthy();
    expect(screen.getByText("#00A88A")).toBeTruthy();
    expect(screen.getByText("Saved Content")).toBeTruthy();
    expect(screen.getByText("Contrapunto horario")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar opciones disponibles"), {
      target: { value: "brand primary" },
    });
    await waitFor(() =>
      expect(fetchPublisherAppCustomizationCatalog).toHaveBeenCalledWith(
        "colors",
        expect.any(URLSearchParams),
      ),
    );
    expect(await screen.findByText("1 color disponible")).toBeTruthy();
    await waitFor(() =>
      expect(
        jest
          .mocked(fetchPublisherAppCustomizationCatalog)
          .mock.calls.some(([, params]) =>
            params.toString().includes("q=brand+primary"),
          ),
      ).toBe(true),
    );
    const colorOption = await screen.findByRole("button", {
      name: /Primary.*brand\.primary/i,
    });
    fireEvent.click(colorOption);
    expect(screen.getByText("brand.primary")).toBeTruthy();
    expect(screen.getAllByText("#F61C72").length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: /Color Claro/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar color" }));
    const colorDialog = screen.getByRole("dialog", { name: "Cambiar color" });
    expect(colorDialog.style.getPropertyValue("--primary")).toBe("#FF5500");
    expect(colorDialog.style.getPropertyValue("--primary-foreground")).toBe(
      "#0F1728",
    );
    fireEvent.change(
      within(colorDialog).getByLabelText("Elegir color para Modo claro"),
      { target: { value: "#112233" } },
    );
    fireEvent.change(
      within(colorDialog).getByLabelText("Opacidad para Modo claro"),
      { target: { value: "50" } },
    );
    fireEvent.click(
      within(colorDialog).getByRole("button", { name: "Usar este color" }),
    );
    expect(screen.getByText("#11223380")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar este color" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar configuración avanzada",
      }),
    );
    expect(screen.queryByTestId("publisher-app-advanced-modal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Idiomas y textos/i }));
    expect(screen.getByText("Contact Pocket Genes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agregar texto" }));
    expect(await screen.findByText("1 texto disponible")).toBeTruthy();
    const textOption = await screen.findByRole("button", {
      name: /Services.*Servicios/i,
    });
    fireEvent.click(textOption);
    fireEvent.change(screen.getByLabelText("Texto en inglés"), {
      target: { value: "Studies" },
    });
    fireEvent.change(screen.getByLabelText("Texto en español"), {
      target: { value: "Estudios" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar este texto" }));
    expect(screen.getByText(/Estudios/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar configuración avanzada",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const saveCall = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, init]) =>
          path === "/publisher-app/config" && init?.method === "PUT",
      );
    const payload = JSON.parse(String(saveCall?.[1]?.body));
    expect(payload.advancedConfiguration).toMatchObject({
      displayName: "Pocket Genes Advanced",
      catalogEnabled: false,
      colorOverrides: {
        "brand.primary": { light: "#11223380" },
      },
      textOverrides: expect.arrayContaining([
        { key: "Services", en: "Studies", es: "Estudios" },
      ]),
      discoverScope: {
        mode: "organization",
        publisherOrganizationId: "org-1",
      },
      learn: { mode: "base" },
    });
  });

  it("uses a light foreground for a dark advanced-configuration brand tone", () => {
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    const advancedTheme = screen.getByTestId("publisher-app-advanced-theme");
    expect(advancedTheme.style.getPropertyValue("--primary")).toBe("#123ABC");
    expect(advancedTheme.style.getPropertyValue("--primary-foreground")).toBe(
      "#FFFFFF",
    );
  });

  it("uses direct backoffice copy and explicit checkbox controls", () => {
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    fireEvent.click(screen.getByTestId("publisher-app-advanced-toggle"));
    const editor = screen.getByTestId("publisher-app-advanced-editor-theme");

    expect(
      within(editor).queryByText(/puertas|conversación|aventura/i),
    ).toBeNull();
    fireEvent.click(
      within(editor).getByRole("button", {
        name: /Nombre, funciones y colores/i,
      }),
    );
    const advancedModal = screen.getByTestId("publisher-app-advanced-modal");
    expect(
      within(advancedModal).queryByTestId("publisher-app-section-index"),
    ).toBeNull();
    expect(
      within(advancedModal).queryByRole("button", {
        name: "Volver a secciones",
      }),
    ).toBeNull();
    expect(
      within(advancedModal).getByRole("checkbox", {
        name: /Catálogo y solicitudes: activada/i,
      }),
    ).toBeTruthy();
    expect(
      within(advancedModal).getByRole("checkbox", {
        name: /Contenido Discover: activada/i,
      }),
    ).toBeTruthy();
    fireEvent.click(
      within(advancedModal).getByRole("button", { name: "Cancelar" }),
    );

    fireEvent.click(
      within(editor).getByRole("button", { name: /Idiomas y textos/i }),
    );
    expect(screen.getByText("Idiomas disponibles")).toBeTruthy();
    expect(screen.queryByText(/conversación|voces disponibles/i)).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: "Activar Español" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Activar English" }),
    ).toBeTruthy();
    fireEvent.click(
      within(screen.getByTestId("publisher-app-advanced-modal")).getByRole(
        "button",
        { name: "Cancelar" },
      ),
    );

    fireEvent.click(
      within(editor).getByRole("button", { name: /Enlaces y contacto/i }),
    );
    const linksModal = screen.getByTestId("publisher-app-advanced-modal");
    expect(within(linksModal).getByLabelText("Join Us · English")).toBeTruthy();
    expect(within(linksModal).getByLabelText("Join Us · Español")).toBeTruthy();
    expect(within(linksModal).getByLabelText("Email de soporte")).toBeTruthy();
    expect(
      within(linksModal).queryByRole("button", {
        name: "Volver a secciones",
      }),
    ).toBeNull();
  });

  it("builds a custom Learn curriculum through hierarchical detail screens", async () => {
    mockConfigRequests();
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    fireEvent.click(screen.getByTestId("publisher-app-advanced-toggle"));
    fireEvent.click(
      within(
        screen.getByTestId("publisher-app-advanced-editor-theme"),
      ).getByRole("button", { name: /Contenido educativo/i }),
    );

    const advancedModal = screen.getByTestId("publisher-app-advanced-modal");
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: /Currículo propio/i,
      }),
    );

    expect(
      within(advancedModal).getByTestId("learn-curriculum-home"),
    ).toBeTruthy();
    expect(
      within(advancedModal).queryByText(
        "Ingresá los IDs de temas separados por coma.",
      ),
    ).toBeNull();
    expect(
      within(advancedModal).getByText(/No limitan qué temas, capítulos/i),
    ).toBeTruthy();

    fireEvent.click(
      within(advancedModal).getByRole("button", { name: /Crear tema/i }),
    );
    expect(
      within(advancedModal).getByTestId("learn-subject-detail"),
    ).toBeTruthy();
    fireEvent.change(within(advancedModal).getByLabelText("ID del tema"), {
      target: { value: "CUSTOM" },
    });
    expect(
      within(advancedModal).getByText("Ese ID ya pertenece a otro tema."),
    ).toBeTruthy();
    fireEvent.change(within(advancedModal).getByLabelText("ID del tema"), {
      target: { value: "MEDICGEN_FOUNDATIONS" },
    });
    expect(
      within(advancedModal).queryByText("Ese ID ya pertenece a otro tema."),
    ).toBeNull();
    fireEvent.change(within(advancedModal).getByLabelText("Nombre del tema"), {
      target: { value: "Fundamentos MedicGen" },
    });
    let hierarchyBar = within(advancedModal).getByTestId("learn-hierarchy-bar");
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Tema: Fundamentos MedicGen",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Capítulo: Sin seleccionar",
      }),
    ).toBeDisabled();

    const createChapter = within(advancedModal).getByRole("button", {
      name: /Crear capítulo/i,
    });
    expect(createChapter).toHaveClass("border-dashed");
    fireEvent.click(createChapter);
    expect(
      within(advancedModal).getByTestId("learn-chapter-detail"),
    ).toBeTruthy();
    fireEvent.change(
      within(advancedModal).getByLabelText("Nombre del capítulo"),
      { target: { value: "El origen de tu ADN" } },
    );
    hierarchyBar = within(advancedModal).getByTestId("learn-hierarchy-bar");
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Capítulo: El origen de tu ADN",
      }),
    ).toHaveAttribute("aria-current", "page");

    const createLesson = within(advancedModal).getByRole("button", {
      name: /Crear lección/i,
    });
    expect(createLesson).toHaveClass("border-dashed");
    fireEvent.click(createLesson);
    expect(
      within(advancedModal).getByTestId("learn-lesson-detail"),
    ).toBeTruthy();
    fireEvent.change(within(advancedModal).getByLabelText("ID de la lección"), {
      target: { value: "SUBJECT_2.lesson_2" },
    });
    expect(
      within(advancedModal).getByText("Ese ID ya pertenece a otra lección."),
    ).toBeTruthy();
    fireEvent.change(within(advancedModal).getByLabelText("ID de la lección"), {
      target: { value: "MEDICGEN.start" },
    });
    expect(
      within(advancedModal).queryByText("Ese ID ya pertenece a otra lección."),
    ).toBeNull();
    fireEvent.change(
      within(advancedModal).getByLabelText("Nombre de la lección"),
      { target: { value: "Descubrí tu ADN" } },
    );
    hierarchyBar = within(advancedModal).getByTestId("learn-hierarchy-bar");
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Lección: Descubrí tu ADN",
      }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.change(
      within(advancedModal).getByLabelText("Imagen HTTPS (opcional)"),
      { target: { value: "https://example.org/medicgen-start.png" } },
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", { name: "Cambiar color" }),
    );
    const lessonColorDialog = screen.getByRole("dialog", {
      name: "Cambiar color",
    });
    expect(
      within(lessonColorDialog).queryByLabelText(
        "Opacidad de color de la lección",
      ),
    ).toBeNull();
    fireEvent.change(
      within(lessonColorDialog).getByLabelText("Elegir color de la lección"),
      { target: { value: "#f97316" } },
    );
    fireEvent.click(
      within(lessonColorDialog).getByRole("button", {
        name: "Usar este color",
      }),
    );

    const createParagraph = within(advancedModal).getByRole("button", {
      name: /Crear párrafo/i,
    });
    expect(createParagraph).toHaveClass("border-dashed");
    fireEvent.click(createParagraph);
    expect(
      within(advancedModal).getByTestId("learn-paragraph-detail"),
    ).toBeTruthy();
    fireEvent.change(
      within(advancedModal).getByLabelText("Título del párrafo"),
      { target: { value: "Tu primera coordenada" } },
    );
    fireEvent.change(within(advancedModal).getByLabelText("Símbolo nativo"), {
      target: { value: "sparkles" },
    });
    fireEvent.change(within(advancedModal).getByLabelText("Contenido"), {
      target: {
        value: "Una introducción personalizada al recorrido de MedicGen.",
      },
    });
    hierarchyBar = within(advancedModal).getByTestId("learn-hierarchy-bar");
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Tema: Fundamentos MedicGen",
      }),
    ).toBeEnabled();
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Capítulo: El origen de tu ADN",
      }),
    ).toBeEnabled();
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Lección: Descubrí tu ADN",
      }),
    ).toBeEnabled();
    expect(
      within(hierarchyBar).getByRole("button", {
        name: "Párrafo: Tu primera coordenada",
      }),
    ).toHaveAttribute("aria-current", "page");

    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Guardar párrafo",
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Guardar lección",
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Guardar capítulo",
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Guardar tema",
      }),
    );

    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: /Administrar categorías/i,
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Agregar categoría",
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Agregar categoría Medicina personalizada",
      }),
    );
    const subjectAssignment = within(advancedModal).getByRole("checkbox", {
      name: "Asignar tema Fundamentos MedicGen",
    });
    expect(subjectAssignment).not.toBeChecked();
    fireEvent.click(subjectAssignment);
    expect(subjectAssignment).toBeChecked();

    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Volver a categorías",
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Volver al currículo",
      }),
    );
    fireEvent.click(
      within(advancedModal).getByRole("button", {
        name: "Guardar configuración avanzada",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const saveCall = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, init]) =>
          path === "/publisher-app/config" && init?.method === "PUT",
      );
    const payload = JSON.parse(String(saveCall?.[1]?.body));
    const learn = payload.advancedConfiguration.learn;
    const medicGenSubject = learn.subjects.find(
      (subject: { subjectIdentifier: string }) =>
        subject.subjectIdentifier === "MEDICGEN_FOUNDATIONS",
    );
    const medicGenChapter = medicGenSubject.chapters.find(
      (chapter: { chapterTitle: string }) =>
        chapter.chapterTitle === "El origen de tu ADN",
    );
    const medicGenLesson = medicGenChapter.lessons.find(
      (lesson: { lessonIdentifier: string }) =>
        lesson.lessonIdentifier === "MEDICGEN.start",
    );

    expect(learn.mode).toBe("replace");
    expect(medicGenLesson).toMatchObject({
      lessonTitle: "Descubrí tu ADN",
      imageUrl: "https://example.org/medicgen-start.png",
      lessonColor: "#F97316",
      paragraphs: expect.arrayContaining([
        {
          paragraphTitle: "Tu primera coordenada",
          icon: "sparkles",
          contentText:
            "Una introducción personalizada al recorrido de MedicGen.",
        },
      ]),
    });
    expect(learn.topics).toEqual({
      personalized_medicine: ["MEDICGEN_FOUNDATIONS"],
    });
  });

  async function chooseStatus(value: string, label: string) {
    const picker = screen.getByRole("combobox", { name: "Estado" });
    if (picker instanceof HTMLSelectElement) {
      await userEvent.selectOptions(picker, value);
    } else {
      await userEvent.click(picker);
      await userEvent.click(await screen.findByRole("option", { name: label }));
    }
  }

  function renderGodModeStatusEditor(config: PublisherAppConfig = savedConfig) {
    return renderWorkbench({
      mode: "edit",
      initialConfig: config,
      apiPath: "/admin/publisher-app-configs/organization_org-1",
      backHref: "/god-mode/apps",
      backLabel: "Volver a Apps",
      allowStatusEditing: true,
      showDangerZone: false,
    });
  }

  it("shows a status label and GOD MODE picker only after Cambiar estado is pressed", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      config: { ...savedConfig, status: "active_waiting_for_upload" },
    });
    renderGodModeStatusEditor({ ...savedConfig, appProviderIdentifier: "app_org_pocket_genes_lab_48217" });

    expect(screen.getByRole("link", { name: "Volver a Apps" })).toHaveAttribute("href", "/god-mode/apps");
    expect(screen.getAllByText("En revisión").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox", { name: "Estado" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Activa para pruebas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Activa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprobada" })).toBeNull();
    expect(screen.getByTestId("publisher-app-danger-toggle").parentElement).toHaveClass("hidden");

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
    const picker = screen.getByRole("combobox", { name: "Estado" });
    expect(picker).toBeInTheDocument();
    await userEvent.click(picker);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(8);
    await userEvent.click(within(listbox).getByRole("option", { name: "Activa · Pendiente de subida" }));
    expect(sdkFetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Aplicar estado" }));
    expect(screen.queryByRole("combobox", { name: "Estado" })).toBeNull();
    expect(screen.getAllByText("Activa · Pendiente de subida").length).toBeGreaterThan(0);
    expect(sdkFetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/publisher-app-configs/organization_org-1", expect.objectContaining({ method: "PUT" }),
    ));
    const payload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls[0][1]?.body));
    expect(payload.status).toBe("active_waiting_for_upload");
    expect(payload.expectedStatus).toBe("pending_revision");
  });

  it("discards a cancelled GOD MODE status selection without changing the label or enabling save", async () => {
    renderGodModeStatusEditor();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
    await chooseStatus("approved", "Aprobada");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("combobox", { name: "Estado" })).toBeNull();
    expect(screen.getAllByText("En revisión").length).toBeGreaterThan(0);
    expect(screen.queryByText("Aprobada")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(sdkFetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
    const picker = screen.getByRole("combobox", { name: "Estado" });
    if (picker instanceof HTMLSelectElement) expect(picker).toHaveValue("pending_revision");
  });

  it.each(["pending_revision", "active_for_testing", "active_waiting_for_payment", "active_waiting_for_upload", "active", "approved", "changes_requested", "rejected"] as const)("keeps the publisher's %s status read-only", status => {
    renderWorkbench({ mode: "edit", initialConfig: { ...savedConfig, status } });
    expect(screen.getAllByText(publisherAppStatusLabel(status)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Estado" })).toBeNull();
    expect(screen.queryByTestId("publisher-app-edit-status")).toBeNull();
  });

  it("does not expose manual status editing on the publisher endpoint even if its prop is enabled", () => {
    renderWorkbench({ mode: "edit", initialConfig: savedConfig, allowStatusEditing: true });
    expect(screen.getAllByText("En revisión").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Estado" })).toBeNull();
  });

  it("shows only the three editable colors throughout creation", async () => {
    renderWorkbench();
    advanceToColors();

    expect(screen.getByText("Creadas desde tu identidad")).toBeTruthy();
    expect(
      screen.getByText("Paletas pensadas para la app de Pocket Genes Lab"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Tu marca, más viva/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Destello vecino/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Acento cercano/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Principal alternativo/i }),
    ).toBeTruthy();

    const primaryEdit = screen.getByRole("button", { name: "Editar color principal" });
    expect(primaryEdit).toHaveTextContent(/#[0-9A-F]{6}/);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /^Editar color/ })).toHaveLength(3);
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);
    expect(screen.queryByText(/contrapunto/i)).toBeNull();
    expect(screen.queryByText(/Derivado del principal ·/)).toBeNull();
    expect(
      screen.queryByLabelText("Elegir color de contrapunto horario"),
    ).toBeNull();
    expect(
      screen.queryByLabelText("Elegir color de contrapunto antihorario"),
    ).toBeNull();
    chooseColor("color principal", "#445566");
    expect(primaryEdit).toHaveTextContent("#445566");
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    advanceToIcon();
    expect(screen.queryByTestId("publisher-app-review")).toBeNull();
    expect(screen.queryByRole("button", { name: /Paso 5/i })).toBeNull();
  });

  it.each([
    { surface: "publisher portal", apiPath: "/publisher-app/config" },
    { surface: "god mode", apiPath: "/admin/publisher-app-configs/organizations/org-1" },
  ].flatMap((surface) => ["default", "preset", "custom"].map((choice) => ({ ...surface, choice }))))(
    "creates the complete override set in $surface with a $choice palette",
    async ({ apiPath, choice }) => {
      mockConfigRequests();
      renderWorkbench({ apiPath });
      if (choice !== "default") {
        advanceToColors();
        if (choice === "preset") {
          fireEvent.click(screen.getByRole("button", { name: /Acento cercano/i }));
        } else {
          chooseColor("color principal", "#445566");
        }
        await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
      }
      createTestingApp();
      await screen.findByTestId("publisher-app-success-overlay");

      expect(sdkFetch).toHaveBeenCalledWith(apiPath, expect.objectContaining({ method: "POST" }));
      expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledTimes(choice === "default" ? 1 : 2);
      const payload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body));
      const plan = palettePlan(payload.colors);
      expect(payload.advancedConfiguration.colorOverrides).toEqual(plan.colorOverrides);
      expect(payload.advancedConfiguration.generatedColorOverrides).toEqual(plan.colorOverrides);
      expect(Object.keys(payload.advancedConfiguration.colorOverrides)).toHaveLength(plan.selectedCount);
      expect(plan.selectedCount).toBeGreaterThan(0);
      expect(plan.sourceCount).toBe(698);
      expect(payload.advancedConfiguration.semanticColors).toEqual(publisherAppSemanticColors(payload.colors));
      expect(payload.advancedConfiguration.discoverScope).toEqual({
        mode: "organization",
        publisherOrganizationId: "org-1",
      });
      expect(payload.colors).toMatchObject(publisherAppCounterpointColors(payload.colors.primary));
    },
  );

  it("waits for palette calculation and persistence before completing the test app creation", async () => {
    let resolvePlan!: (plan: PublisherAppPaletteOverridePlan) => void;
    jest.mocked(fetchPublisherAppPaletteOverrides).mockReturnValueOnce(new Promise((resolve) => { resolvePlan = resolve; }));
    mockConfigRequests();
    renderWorkbench();
    createTestingApp();
    await waitFor(() => expect(screen.getByText("Calcular los colores").closest("li")).toHaveAttribute("aria-current", "step"));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    expect(jest.mocked(sdkFetch).mock.calls[0][1]?.method).toBe("POST");
    const colors = jest.mocked(fetchPublisherAppPaletteOverrides).mock.calls[0][0];
    resolvePlan(palettePlan(colors));
    await screen.findByTestId("publisher-app-success-overlay");
    const payload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body));
    expect(payload.advancedConfiguration.colorOverrides).toEqual(palettePlan(colors).colorOverrides);
  });

  it.each(["network failure", "incomplete plan"])(
    "stops before publishing on a palette %s and resumes without another app creation",
    async (failure) => {
      if (failure === "network failure") {
        jest.mocked(fetchPublisherAppPaletteOverrides).mockRejectedValueOnce(new Error("Palette service unavailable"));
      } else {
        jest.mocked(fetchPublisherAppPaletteOverrides).mockResolvedValueOnce({
          catalogVersion: 5,
          sourceCount: 620,
          selectedCount: 445,
          colorOverrides: {},
        });
      }
      mockConfigRequests();
      renderWorkbench();
      createTestingApp();
      await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar proceso" })).toBeEnabled());
      expect(screen.getByRole("alert")).toHaveTextContent(
        failure === "network failure" ? "Palette service unavailable" : "cobertura incompleta",
      );
      expect(sdkFetch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
      fireEvent.click(screen.getByRole("button", { name: "Reintentar proceso" }));
      await screen.findByTestId("publisher-app-success-overlay");
      expect(jest.mocked(sdkFetch).mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "PUT", "POST"]);
    },
  );

  it.each(["click", "keyboard"])("keeps footer navigation separate from Apply when activated by %s", async (activation) => {
    const user = userEvent.setup();
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    const activate = async (name: string) => {
      const button = screen.getByRole("button", { name });
      if (activation === "keyboard") {
        button.focus();
        await user.keyboard("{Enter}");
      } else {
        fireEvent.click(button);
      }
    };

    expect(screen.getByRole("heading", { name: "Elegí tu identidad" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull();
    await activate("Continuar a colores principales");
    expect(screen.getByRole("heading", { name: "Tus tres colores principales" })).toBeTruthy();
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull();

    await activate("Continuar a contrapuntos");
    expect(screen.getByRole("heading", { name: "Un toque de contraste" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sdkFetch).not.toHaveBeenCalled();
  });

  it("discards visual identity drafts without calculating or changing the app", () => {
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Elegí tu identidad" })).toBeTruthy();
    expect(dialog.queryByRole("heading", { name: "Tus tres colores principales" })).toBeNull();
    expect(dialog.queryByRole("heading", { name: "Un toque de contraste" })).toBeNull();
    expect(dialog.queryByRole("button", { name: "Aplicar" })).toBeNull();
    fireEvent.click(dialog.getByRole("button", { name: /Destello vecino/i }));
    expect(dialog.getByRole("heading", { name: "Tus tres colores principales" })).toBeTruthy();
    expect(dialog.queryByRole("heading", { name: "Elegí tu identidad" })).toBeNull();
    chooseColor("color principal", "#AA5533");
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    expect(saveButton).toBeDisabled();
    fireEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 2 Colores principales" }));
    expect(screen.getByRole("button", { name: "Editar color principal" })).toHaveTextContent(savedConfig.colors.primary);
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
  });

  it.each([
    { key: "primary", label: "Color principal", stage: "Paso 2 Colores principales" },
    { key: "counterpointClockwise", label: "Color de contrapunto horario", stage: "Paso 3 Contrapuntos" },
  ] as const)("opens only the tapped $label from the summary and cancels back to its stage", ({ key, label, stage }) => {
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    const summary = within(screen.getByTestId("publisher-app-edit-colors"));
    fireEvent.click(summary.getByRole("button", { name: `Editar ${label.toLowerCase()}` }));

    const pickerDialog = within(screen.getByRole("dialog", { name: label }));
    const picker = pickerDialog.getByLabelText(`Elegir ${label.toLowerCase()}`);
    expect(picker).toHaveValue(savedConfig.colors[key].toLowerCase());
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(1);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    fireEvent.change(picker, { target: { value: "#AABBCC" } });
    fireEvent.click(pickerDialog.getByRole("button", { name: "Cancelar" }));

    const editor = within(screen.getByRole("dialog", { name: "Editar identidad visual" }));
    expect(editor.getByRole("button", { name: stage })).toHaveAttribute("aria-current", "step");
    expect(editor.getByRole("button", { name: `Editar ${label.toLowerCase()}` })).toHaveTextContent(savedConfig.colors[key]);
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    fireEvent.click(editor.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saveButton).toBeDisabled();
  });

  it("keeps custom counterpoints while the primary changes, restores defaults and saves the applied choices", async () => {
    mockConfigRequests();
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: /Tu marca, más viva/i }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    const choices = [
      ["color de contrapunto horario", "counterpointClockwise", "#112233"],
      ["color de contrapunto antihorario", "counterpointAnticlockwise", "#223344"],
      ["color de contrapunto lejano horario", "counterpointFarClockwise", "#334455"],
      ["color de contrapunto lejano antihorario", "counterpointFarAnticlockwise", "#445566"],
    ] as const;
    for (const [label, , color] of choices) {
      chooseColor(label, color);
    }
    expect(screen.getAllByText("Personalizado")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Paso 2 Colores principales" }));
    chooseColor("color principal", "#AA5533");
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    for (const [label, , color] of choices) expect(screen.getByRole("button", { name: `Editar ${label}` })).toHaveTextContent(color);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar automático: color de contrapunto horario" }));
    expect(screen.getAllByText("Personalizado")).toHaveLength(3);
    expect(screen.queryByLabelText("Elegir color de contrapunto horario")).toBeNull();
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    const expectedColors = {
      primary: "#AA5533",
      counterpointClockwise: publisherAppCounterpointColors("#AA5533").counterpointClockwise,
      counterpointAnticlockwise: "#223344", counterpointFarClockwise: "#334455", counterpointFarAnticlockwise: "#445566",
    };
    expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledTimes(1);
    expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledWith(expect.objectContaining(expectedColors), expect.any(AbortSignal), expect.objectContaining({ previousColors: savedConfig.colors }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(sdkFetch).toHaveBeenCalled());
    const payload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls[0][1]?.body));
    expect(payload.colors).toMatchObject(expectedColors);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    expect(screen.getAllByText("Personalizado")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Editar color de contrapunto lejano antihorario" })).toHaveTextContent("#445566");
  });

  it("leaves the applied palette intact after a calculation failure and retries the draft", async () => {
    jest.mocked(fetchPublisherAppPaletteOverrides).mockRejectedValueOnce(new Error("No pudimos calcular los colores"));
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 2 Colores principales" }));
    chooseColor("color principal", "#AA5533");
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText("No pudimos calcular los colores");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("passes saved provenance into recalculation and persists manual colors separately from the generated baseline", async () => {
    const initialGenerated = palettePlan(savedConfig.colors).colorOverrides;
    const manual = { light: "#ABCDEF80" };
    const initial = {
      ...savedConfig,
      advancedConfiguration: {
        ...savedConfig.advancedConfiguration!,
        generatedColorOverrides: initialGenerated,
        colorOverrides: { ...initialGenerated, "app.background": manual },
      },
    };
    mockConfigRequests(initial);
    jest.mocked(fetchPublisherAppPaletteOverrides).mockImplementation(async (colors, _signal, previous) => {
      const generated = palettePlan(colors);
      return {
        ...generated,
        generatedColorOverrides: generated.colorOverrides,
        colorOverrides: mergePublisherAppPaletteOverrides({
          generated: generated.colorOverrides,
          current: previous!.colorOverrides,
          savedBaseline: previous!.generatedColorOverrides,
        }),
      };
    });
    renderWorkbench({ mode: "edit", initialConfig: initial });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: /Acento cercano/i }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText(/colores sensibles a la marca quedaron coordinados/i);
    expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledWith(
      expect.any(Object), expect.any(AbortSignal),
      { previousColors: savedConfig.colors, colorOverrides: initial.advancedConfiguration.colorOverrides, generatedColorOverrides: initialGenerated },
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(sdkFetch).toHaveBeenCalled());
    const payload = JSON.parse(String(jest.mocked(sdkFetch).mock.calls[0][1]?.body));
    expect(payload.advancedConfiguration.colorOverrides["app.background"]).toEqual(manual);
    expect(payload.advancedConfiguration.generatedColorOverrides).toEqual(palettePlan(payload.colors).colorOverrides);
    expect(payload.advancedConfiguration.generatedColorOverrides["app.background"]).toBeUndefined();
    expect(payload.advancedConfiguration.colorOverrides["learn.background.stop2"]).toEqual(payload.advancedConfiguration.generatedColorOverrides["learn.background.stop2"]);
  });

  it("stores only the branding-susceptible colors returned by palette analysis", async () => {
    let resolvePlan:
      | ((value: {
          catalogVersion: number;
          sourceCount: number;
          selectedCount: number;
          colorOverrides: Record<string, { light: string; dark: string }>;
        }) => void)
      | null = null;
    const planPromise = new Promise<{
      catalogVersion: number;
      sourceCount: number;
      selectedCount: number;
      colorOverrides: Record<string, { light: string; dark: string }>;
    }>((resolve) => {
      resolvePlan = resolve;
    });
    jest.mocked(fetchPublisherAppPaletteOverrides).mockReturnValue(planPromise);
    mockConfigRequests();
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: /Destello vecino/i }));
    expect(fetchPublisherAppPaletteOverrides).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Paso 3 Contrapuntos" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        primary: expect.stringMatching(/^#[0-9A-F]{6}$/),
        secondary: expect.stringMatching(/^#[0-9A-F]{6}$/),
        tertiary: expect.stringMatching(/^#[0-9A-F]{6}$/),
        counterpointFarClockwise: expect.stringMatching(/^#[0-9A-F]{6}$/),
        counterpointFarAnticlockwise: expect.stringMatching(/^#[0-9A-F]{6}$/),
      }),
      expect.any(AbortSignal),
      expect.objectContaining({ previousColors: savedConfig.colors, colorOverrides: savedConfig.advancedConfiguration!.colorOverrides }),
    );
    expect(
      await screen.findByText(
        /Analizando qué colores adaptar a Destello vecino/i,
      ),
    ).toBeTruthy();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aplicando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    const colorOverrides = Object.fromEntries(
      Array.from({ length: 3 }, (_, index) => [
        `role.${index}`,
        { light: "#FFF7F2", dark: "#160B05" },
      ]),
    );
    resolvePlan!({
      catalogVersion: 5,
      sourceCount: 620,
      selectedCount: 3,
      colorOverrides,
    });

    expect(
      await screen.findByText(
        /3 colores sensibles a la marca quedaron coordinados.*617 conservaron/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(
      Object.keys(payload.advancedConfiguration.colorOverrides),
    ).toHaveLength(3);
    expect(payload.advancedConfiguration.semanticColors.primary).toBe(
      payload.colors.primary,
    );
  });

  it("always renders the publisher identity icon on a white background", () => {
    renderWorkbench({
      publisherImageUrl: "https://example.org/publisher-identity.png",
    });
    advanceToIcon();

    const identityOption = screen.getByRole("button", {
      name: /Usar mi identidad actual/i,
    });
    const identityIcon = identityOption.querySelector("img")?.parentElement;

    expect(identityIcon).toHaveStyle({ background: "#FFFFFF" });
    expect(identityOption.querySelector("img")).toHaveClass("object-contain");

    const livePreview = screen.getByLabelText("Vista previa de la app");
    const previewIcon = livePreview.querySelector("img")?.parentElement;
    expect(previewIcon).toHaveStyle({ background: "#FFFFFF" });
  });

  it.each(["active", "active_for_testing", "active_waiting_for_payment", "active_waiting_for_upload"] as const)("downloads the published runtime v3 config for %s instead of the administrative record", async (status) => {
    const runtimeConfig = {
      schemaVersion: 3 as const,
      appProviderIdentifier: "app_org_pocket_genes_lab_48217",
      revision: 1,
      status: "published" as const,
      baseContentVersion: "pg-core-v1" as const,
      publisher: {
        kind: "organization",
        id: "org-1",
        name: "Pocket Genes Lab",
      },
    };
    jest.mocked(sdkFetch).mockResolvedValue(runtimeConfig);
    const createObjectURL = jest.fn(
      (_blob: Blob) => "blob:publisher-app-config",
    );
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderWorkbench({
      mode: "edit",
      initialConfig: {
        ...savedConfig,
        status,
        appProviderIdentifier: "app_org_pocket_genes_lab_48217",
        runtimeRevision: 1,
      },
    });

    expect(screen.getAllByText(publisherAppStatusLabel(status)).length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar configuración" }),
    );
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(sdkFetch).toHaveBeenCalledWith("/publisher-app/config/runtime");
    const exportedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(exportedBlob.type).toBe("application/json;charset=utf-8");
    expect(exportedBlob.size).toBeGreaterThan(100);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:publisher-app-config");

    clickSpy.mockRestore();
  });

  it("does not let a publisher manually activate a pending app", () => {
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });
    expect(screen.getByRole("button", { name: "Descargar configuración" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Create app identifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull();
    expect(sdkFetch).not.toHaveBeenCalled();
  });

  it.each(["active", "active_for_testing"] as const)("offers to replace a legacy %s identifier before downloading", (status) => {
    renderWorkbench({
      mode: "edit",
      initialConfig: {
        ...savedConfig,
        status,
        appProviderIdentifier: "organization_8thNEDU1xbFqwnQDUrPt",
        runtimeRevision: 1,
      },
    });

    expect(
      screen.getByRole("button", { name: "Create app identifier" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Descargar configuración" }),
    ).toBeDisabled();
  });

  it.each(["active", "active_for_testing", "active_waiting_for_payment", "active_waiting_for_upload"] as const)("does not let a publisher manually deactivate a %s app", status => {
    renderWorkbench({ mode: "edit", initialConfig: {
      ...savedConfig, status, appProviderIdentifier: "app_org_pocket_genes_lab_48217", runtimeRevision: 1,
    } });
    expect(screen.queryByRole("button", { name: "Desactivar identificador" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desactivar para pruebas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull();
    expect(screen.getAllByText(publisherAppStatusLabel(status)).length).toBeGreaterThan(0);
    expect(sdkFetch).not.toHaveBeenCalled();
  });

  it("deletes a pending app after expanding the danger zone", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      deleted: true,
      configId: savedConfig.id,
    });
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    const dangerToggle = screen.getByTestId("publisher-app-danger-toggle");
    expect(dangerToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(dangerToggle);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar mi app" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar definitivamente" }),
    );

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/publisher-app/config", {
        method: "DELETE",
      });
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(PUBLISHER_PORTAL_HOME_ROUTE);
  });

  it("blocks runtime download and deletion when the app is not active", () => {
    renderWorkbench({
      mode: "edit",
      initialConfig: { ...savedConfig, status: "approved" },
    });

    expect(
      screen.getByRole("button", { name: "Descargar configuración" }),
    ).toBeDisabled();

    const dangerToggle = screen.getByTestId("publisher-app-danger-toggle");
    expect(dangerToggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Eliminar mi app" }),
    ).toBeNull();
    fireEvent.click(dangerToggle);

    expect(
      screen.getByRole("button", { name: "Eliminar mi app" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Para cancelar esta solicitud, contactá al equipo/i),
    ).toBeTruthy();
  });
});
