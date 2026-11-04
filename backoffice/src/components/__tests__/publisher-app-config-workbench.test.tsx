/** @jest-environment jsdom */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_HOME_ROUTE,
} from "@/lib/publisher-portal-routes";
import { fetchPublisherAppCustomizationCatalog } from "@/lib/publisher-app-customization-catalog-client";
import { fetchPublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-overrides-client";
import { sdkFetch } from "@/lib/sdk-client";

const mockRouterReplace = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
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

function renderWorkbench(
  props: Partial<React.ComponentProps<typeof PublisherAppConfigWorkbench>> = {},
) {
  return render(
    <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
      <PublisherAppConfigWorkbench
        mode="create"
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

describe("PublisherAppConfigWorkbench", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reviews and accepts the five-step request before creating the app", async () => {
    const activatedConfig: PublisherAppConfig = {
      ...savedConfig,
      status: "active",
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
    fireEvent.change(screen.getByLabelText("Elegir color principal"), {
      target: { value: "#112233" },
    });
    advanceToIcon();
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));

    expect(screen.getByTestId("publisher-app-review")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Revisión de configuración y condiciones",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Solo iOS")).toBeTruthy();
    expect(screen.getByText("#112233")).toBeTruthy();
    const subscriptionOffer = screen.getByTestId(
      "publisher-app-subscription-offer",
    );
    expect(subscriptionOffer).toHaveClass(
      "bg-white",
      "text-black",
      "dark:bg-[#0b0c0d]",
      "dark:text-white",
    );
    expect(subscriptionOffer).toHaveTextContent(
      "Monthly subscription per platform",
    );
    expect(subscriptionOffer).toHaveTextContent("$59.99");
    expect(subscriptionOffer).toHaveTextContent("USD / month");
    expect(subscriptionOffer).toHaveTextContent("for the first");
    expect(subscriptionOffer).toHaveTextContent("six months");
    expect(subscriptionOffer).toHaveTextContent("$99.99 USD");
    const promotionalPrice = screen.getByTestId(
      "publisher-app-promotional-price",
    );
    const promotionalAmount = screen.getByTestId(
      "publisher-app-promotional-amount",
    );
    const promotionalUnit = screen.getByTestId(
      "publisher-app-promotional-unit",
    );
    const promotionalDuration = screen.getByTestId(
      "publisher-app-promotional-duration",
    );
    const standardPrice = screen.getByTestId("publisher-app-standard-price");
    expect(promotionalPrice).toHaveClass("flex-col");
    expect(promotionalAmount).toHaveClass("block", "text-5xl");
    expect(promotionalUnit).toHaveClass("block");
    expect(promotionalDuration.children).toHaveLength(3);
    expect(promotionalDuration).toHaveTextContent("for the first");
    expect(promotionalDuration).toHaveTextContent("six months");
    expect(screen.getByText("six months")).toHaveClass("text-3xl");
    expect(subscriptionOffer.textContent?.indexOf("$59.99")).toBeLessThan(
      subscriptionOffer.textContent?.indexOf("$99.99 USD") ?? -1,
    );
    expect(standardPrice.querySelector("span")).toHaveClass("line-through");
    expect(subscriptionOffer).toHaveTextContent("Managed service");
    expect(subscriptionOffer).toHaveTextContent(
      "Included while the subscription is active",
    );
    [
      "Continued licensing of PocketGenesSDK.",
      "Ongoing SDK maintenance and improvements.",
      "Integration of SDK updates into your app.",
      "New app builds and store submissions included.",
      "Security and compatibility updates.",
      "Technical support for SDK functionality.",
    ].forEach((benefit) => {
      expect(screen.getByText(benefit)).toBeTruthy();
    });
    expect(screen.getByText("Resumen comercial")).toBeTruthy();
    expect(screen.getByText("Suscripción mensual")).toBeTruthy();
    expect(
      screen.getByText(
        /USD 59,99 por mes · precio bonificado por 6 meses \(luego USD 99,99\)/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/USD 139,99 · pago único/i)).toBeTruthy();
    expect(screen.queryByText("Usuario")).toBeNull();
    expect(screen.queryByText("Estado inicial")).toBeNull();
    expect(screen.queryByText("Revisión estimada")).toBeNull();
    expect(screen.queryByText("Pending revision")).toBeNull();
    expect(screen.queryByText("24 a 48 horas")).toBeNull();
    expect(screen.queryByTestId("publisher-app-terms-document")).toBeNull();
    expect(
      screen.queryByTitle("Términos y condiciones de PocketGenesSDK"),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /Abrir PDF/i })).toBeNull();

    const termsDisclosure = screen.getByRole("button", {
      name: "See full terms and conditions",
    });
    expect(termsDisclosure).toHaveAttribute("aria-expanded", "false");
    expect(termsDisclosure).toHaveAttribute(
      "aria-controls",
      "publisher-app-full-terms",
    );
    fireEvent.click(termsDisclosure);
    expect(sdkFetch).not.toHaveBeenCalled();

    const termsDocument = screen.getByTestId("publisher-app-terms-document");
    const termsFrame = screen.getByTitle(
      "Términos y condiciones de PocketGenesSDK",
    );
    expect(termsDocument).toContainElement(termsFrame);
    expect(termsDocument).toHaveAttribute("id", "publisher-app-full-terms");
    expect(
      screen.getByRole("button", {
        name: "Hide full terms and conditions",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(termsFrame).toHaveAttribute(
      "src",
      "/PocketGenesSDK_Terminos_y_Condiciones.pdf#page=1&view=FitH&toolbar=0&navpanes=0",
    );
    expect(termsFrame).toHaveAttribute("scrolling", "yes");
    expect(termsFrame.parentElement).toHaveClass(
      "h-[360px]",
      "overflow-hidden",
      "sm:h-[440px]",
    );
    expect(screen.getByRole("link", { name: /Abrir PDF/i })).toHaveAttribute(
      "href",
      "/PocketGenesSDK_Terminos_y_Condiciones.pdf",
    );
    expect(screen.queryByText(/El pedido de/i)).toBeNull();
    expect(screen.queryByText(/Anexo A · Rango razonable de uso/i)).toBeNull();
    const termsPdfPath = join(
      process.cwd(),
      "public",
      "PocketGenesSDK_Terminos_y_Condiciones.pdf",
    );
    expect(existsSync(termsPdfPath)).toBe(true);
    expect(readFileSync(termsPdfPath).subarray(0, 5).toString("ascii")).toBe(
      "%PDF-",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Hide full terms and conditions",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "See full terms and conditions",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("publisher-app-terms-document")).toBeNull();

    const acceptButton = screen.getByRole("button", {
      name: "Aceptar condiciones y continuar",
    });
    expect(acceptButton).toBeDisabled();
    expect(sdkFetch).not.toHaveBeenCalled();

    const termsAcceptance = screen.getByTestId(
      "publisher-app-terms-acceptance",
    );
    const termsCheckbox = screen.getByRole("checkbox", {
      name: /Leí y acepto los términos y condiciones/i,
    });
    expect(termsAcceptance).toHaveAttribute("data-selected", "false");
    expect(termsCheckbox).toHaveClass("size-8");
    expect(screen.getByText("Requerido")).toBeTruthy();

    fireEvent.click(termsCheckbox);
    expect(termsAcceptance).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Aceptado")).toBeTruthy();
    expect(acceptButton).toBeEnabled();
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledTimes(1);
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
      colors: { primary: "#112233" },
      iconSource: "publisher",
      termsAccepted: true,
    });
    expect(payload).not.toHaveProperty("publisherId");
    expect(payload).not.toHaveProperty("publisherKind");
    expect(payload).not.toHaveProperty("publisherEmail");
    expect(payload).not.toHaveProperty("publisherUsername");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("catalogEnabled");
    expect(payload).not.toHaveProperty("feedEnabled");
    expect(await screen.findByText(/próximas 24 a 48 horas/i)).toBeTruthy();
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

  it("doubles subscription and store setup prices for iOS and Android", () => {
    renderWorkbench();

    fireEvent.click(screen.getByRole("radio", { name: /iOS \+ Android/i }));
    advanceToIcon();
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));

    expect(screen.getByText("iOS + Android")).toBeTruthy();
    expect(
      screen.getByText(
        /USD 119,98 por mes · precio bonificado por 6 meses \(luego USD 199,98\)/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/USD 279,98 · pago único/i)).toBeTruthy();
  });

  it("uses the existing publisher icon when review is opened before step four", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
    renderWorkbench({
      publisherImageUrl: "https://example.org/existing-publisher-icon.png",
    });

    fireEvent.click(screen.getByRole("button", { name: /Paso 5 Revisión/i }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Leí y acepto los términos y condiciones/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Aceptar condiciones y continuar",
      }),
    );

    await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(payload).toMatchObject({
      iconSource: "publisher",
      iconImageUrl: "https://example.org/existing-publisher-icon.png",
      iconImageUploadDataUrl: null,
      termsAccepted: true,
    });
  });

  it("submits an uploaded publisher identity in the upload field", async () => {
    const publisherIconDataUrl = "data:image/png;base64,QUJDRA==";
    jest.mocked(sdkFetch).mockResolvedValue({
      config: {
        ...savedConfig,
        iconImageUrl: null,
        iconImageUploadDataUrl: publisherIconDataUrl,
      },
    });
    renderWorkbench({ publisherImageUrl: publisherIconDataUrl });

    fireEvent.click(screen.getByRole("button", { name: /Paso 5 Revisión/i }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Leí y acepto los términos y condiciones/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Aceptar condiciones y continuar",
      }),
    );

    await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(payload).toMatchObject({
      iconSource: "publisher",
      iconImageUrl: null,
      iconImageUploadDataUrl: publisherIconDataUrl,
      termsAccepted: true,
    });
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
    expect(screen.getByLabelText("Elegir color principal")).toHaveValue(
      "#123abc",
    );
    fireEvent.change(screen.getByLabelText("Elegir color terciario"), {
      target: { value: "#AABBCC" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
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
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
    jest
      .mocked(fetchPublisherAppCustomizationCatalog)
      .mockImplementation(async (kind) => {
        if (kind === "colors") {
          return {
            catalogVersion: 1,
            groups: ["Brand"],
            totalCount: 1,
            nextCursor: null,
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
    expect(
      screen.queryByText("Contenido y servicios vinculados"),
    ).toBeNull();
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
    fireEvent.change(screen.getByLabelText("Buscar opciones disponibles"), {
      target: { value: "brand primary" },
    });
    await waitFor(() =>
      expect(fetchPublisherAppCustomizationCatalog).toHaveBeenCalledWith(
        "colors",
        expect.any(URLSearchParams),
      ),
    );
    expect(
      jest
        .mocked(fetchPublisherAppCustomizationCatalog)
        .mock.calls.at(-1)?.[1]
        .toString(),
    ).toContain("q=brand+primary");
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
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
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

  it("supports a GOD MODE endpoint, status editing, and a safe admin layout", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      config: { ...savedConfig, status: "approved" },
    });
    renderWorkbench({
      mode: "edit",
      initialConfig: savedConfig,
      apiPath: "/admin/publisher-app-configs/organization_org-1",
      backHref: "/god-mode/apps",
      backLabel: "Volver a Apps",
      allowStatusEditing: true,
      showDangerZone: false,
    });

    expect(screen.getByRole("link", { name: "Volver a Apps" })).toHaveAttribute(
      "href",
      "/god-mode/apps",
    );
    expect(screen.getByTestId("publisher-app-edit-status")).toBeTruthy();
    expect(
      screen.getByTestId("publisher-app-danger-toggle").parentElement,
    ).toHaveClass("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Aprobada" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/publisher-app-configs/organization_org-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const payload = JSON.parse(
      String(jest.mocked(sdkFetch).mock.calls[0][1]?.body),
    );
    expect(payload.status).toBe("approved");
  });

  it("uses branded palette suggestions and full visual pickers without editable hex fields", () => {
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

    const primaryPicker = screen.getByLabelText(
      "Elegir color principal",
    ) as HTMLInputElement;
    expect(primaryPicker.type).toBe("color");
    expect(
      screen.queryByRole("textbox", { name: /color principal/i }),
    ).toBeNull();
    expect(screen.queryByText(/^#[0-9A-F]{6}$/)).toBeNull();

    fireEvent.change(primaryPicker, { target: { value: "#445566" } });
    expect(primaryPicker).toHaveValue("#445566");
  });

  it("calculates and stores 167 coordinated color overrides when a palette is selected", async () => {
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
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(screen.getByRole("button", { name: "Editar paleta" }));
    fireEvent.click(screen.getByRole("button", { name: /Destello vecino/i }));

    expect(fetchPublisherAppPaletteOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        primary: expect.stringMatching(/^#[0-9A-F]{6}$/),
        secondary: expect.stringMatching(/^#[0-9A-F]{6}$/),
        tertiary: expect.stringMatching(/^#[0-9A-F]{6}$/),
      }),
      expect.any(AbortSignal),
    );
    expect(
      await screen.findByText(/Ajustando 167 colores a Destello vecino/i),
    ).toBeTruthy();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Listo" })).toBeDisabled();

    const colorOverrides = Object.fromEntries(
      Array.from({ length: 167 }, (_, index) => [
        `role.${index}`,
        { light: "#FFF7F2", dark: "#160B05" },
      ]),
    );
    resolvePlan!({
      catalogVersion: 2,
      sourceCount: 334,
      selectedCount: 167,
      colorOverrides,
    });

    expect(
      await screen.findByText(/167 de 334 colores quedaron coordinados/i),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Listo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
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
    ).toHaveLength(167);
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

  it("downloads the published runtime v3 config instead of the administrative record", async () => {
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
        status: "active",
        appProviderIdentifier: "app_org_pocket_genes_lab_48217",
        runtimeRevision: 1,
      },
    });

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

  it("creates the app identifier and activates the config for testing", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      config: {
        ...savedConfig,
        status: "active",
        appProviderIdentifier: "app_org_pocket_genes_lab_48217",
        runtimeRevision: 1,
      },
    });
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    expect(
      screen.getByRole("button", { name: "Descargar configuración" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Create app identifier" }),
    );

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config/identifier",
        { method: "POST" },
      );
    });
    expect(
      await screen.findByText("app_org_pocket_genes_lab_48217"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Descargar configuración" }),
    ).toBeEnabled();
  });

  it("offers to replace a legacy active identifier before downloading", () => {
    renderWorkbench({
      mode: "edit",
      initialConfig: {
        ...savedConfig,
        status: "active",
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

  it("turns down an active identifier and returns the edit screen to review", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      config: {
        ...savedConfig,
        status: "pending_revision",
      },
    });
    renderWorkbench({
      mode: "edit",
      initialConfig: {
        ...savedConfig,
        status: "active",
        appProviderIdentifier: "app_org_pocket_genes_lab_48217",
        runtimeRevision: 1,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Desactivar identificador" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Desactivar para pruebas" }),
    );

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/publisher-app/config/identifier",
        { method: "DELETE" },
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Create app identifier" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Descargar configuración" }),
    ).toBeDisabled();
    expect(screen.getAllByText("En revisión")).toHaveLength(2);
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
