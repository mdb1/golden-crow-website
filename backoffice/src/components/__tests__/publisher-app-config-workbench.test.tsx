/** @jest-environment jsdom */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_HOME_ROUTE,
} from "@/lib/publisher-portal-routes";
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
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
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
    expect(screen.getByTestId("publisher-app-success-circle")).toHaveClass(
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
      screen.getByRole("button", { name: /Comunidad vibrante/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Lectura y contenido/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Profundidad premium/i }),
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

  it("downloads the complete persisted config and deletes a pending app after confirmation", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      deleted: true,
      configId: savedConfig.id,
    });
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

    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    const dangerToggle = screen.getByTestId("publisher-app-danger-toggle");
    expect(dangerToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("publisher-app-danger-content")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Eliminar mi app" }),
    ).toBeNull();
    expect(
      screen.queryByText(/Si eliminás esta solicitud, se borrarán los datos/i),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Descargar configuración" }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(exportedBlob.type).toBe("application/json;charset=utf-8");
    expect(exportedBlob.size).toBeGreaterThan(100);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:publisher-app-config");

    fireEvent.click(dangerToggle);
    expect(dangerToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("publisher-app-danger-content")).toBeTruthy();
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
    expect(mockRouterRefresh).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("keeps download available but blocks deletion after pending revision", () => {
    renderWorkbench({
      mode: "edit",
      initialConfig: { ...savedConfig, status: "approved" },
    });

    expect(
      screen.getByRole("button", { name: "Descargar configuración" }),
    ).toBeEnabled();

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
