/** @jest-environment jsdom */

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

  it("creates a configuration from the four-step flow without sending identity or status fields", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
    renderWorkbench();

    expect(
      screen.getByRole("heading", { name: "Configurá tu app" }),
    ).toBeTruthy();
    const iosRadio = screen.getByRole("radio", { name: /Solo iOS/i });
    expect(iosRadio.parentElement).toHaveClass("sr-only");
    expect(
      screen.getByRole("radio", { name: /iOS \+ Android/i }).parentElement,
    ).toHaveClass("sr-only");
    fireEvent.click(iosRadio);
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
      screen.getByTestId("publisher-app-feature-list").querySelectorAll("label"),
    ).toHaveLength(5);
    const featureDescriptions = [
      "Tus productos y servicios, siempre organizados, disponibles y listos para descubrir.",
      "Notas, eventos y publicaciones para mantener informada y activa tu comunidad.",
      "Customiza tus clases y contenidos según las necesidades de tus usuarios.",
      "Permite conversar, publicar preguntas y encontrar otros miembros de la comunidad.",
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
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Sección Comunidad" }),
    );
    advanceToColors();
    fireEvent.change(screen.getByLabelText("Elegir color principal"), {
      target: { value: "#112233" },
    });
    advanceToIcon();
    fireEvent.click(screen.getByRole("button", { name: "Crear mi app" }));

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
      profileEnabled: true,
      learnCustomizationEnabled: true,
      colors: { primary: "#112233" },
      iconSource: "publisher",
    });
    expect(payload).not.toHaveProperty("publisherId");
    expect(payload).not.toHaveProperty("publisherKind");
    expect(payload).not.toHaveProperty("publisherEmail");
    expect(payload).not.toHaveProperty("publisherUsername");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("catalogEnabled");
    expect(payload).not.toHaveProperty("feedEnabled");
    expect(await screen.findByText(/próximas 24 a 48 horas/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ver y editar mi app/i }),
    ).toHaveAttribute("href", PUBLISHER_PORTAL_APP_EDIT_ROUTE);
  });

  it("loads an existing configuration and saves only after it changes", async () => {
    const updatedConfig = {
      ...savedConfig,
      colors: { ...savedConfig.colors, tertiary: "#AABBCC" },
    };
    jest.mocked(sdkFetch).mockResolvedValue({ config: updatedConfig });
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    expect(
      screen.getByRole("radio", { name: /iOS \+ Android/i }),
    ).toHaveAttribute("data-state", "checked");
    advanceToColors();
    expect(screen.getByLabelText("Elegir color principal")).toHaveValue(
      "#123abc",
    );
    advanceToIcon();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
    advanceToColors();
    fireEvent.change(screen.getByLabelText("Elegir color terciario"), {
      target: { value: "#AABBCC" },
    });
    advanceToIcon();
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
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
    expect(screen.getAllByText("Pending revision").length).toBeGreaterThan(0);
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
    expect(screen.queryByRole("textbox", { name: /color principal/i })).toBeNull();
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

    fireEvent.click(
      screen.getByRole("button", { name: "Descargar configuración" }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(exportedBlob.type).toBe("application/json;charset=utf-8");
    expect(exportedBlob.size).toBeGreaterThan(100);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:publisher-app-config");

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
    expect(
      screen.getByRole("button", { name: "Eliminar mi app" }),
    ).toBeDisabled();
    expect(screen.getByText(/ya no está pendiente de revisión/i)).toBeTruthy();
  });
});
