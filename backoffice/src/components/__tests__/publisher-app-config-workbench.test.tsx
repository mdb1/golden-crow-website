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
    fireEvent.click(screen.getByRole("radio", { name: /Solo iOS/i }));
    fireEvent.click(screen.getByRole("button", { name: /Paso 2 Funciones/i }));
    expect(
      screen.getByRole("checkbox", {
        name: "Catálogo de productos y servicios",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Feed de novedades" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Connect/i }));
    advanceToColors();
    fireEvent.change(screen.getByLabelText("Color principal"), {
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
    expect(screen.getByLabelText("Color principal")).toHaveValue("#123ABC");
    advanceToIcon();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
    advanceToColors();
    fireEvent.change(screen.getByLabelText("Color terciario"), {
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

  it("blocks saving when a palette color is not a complete hex value", () => {
    renderWorkbench();
    advanceToColors();

    fireEvent.change(screen.getByLabelText("Color secundario"), {
      target: { value: "#12" },
    });

    expect(
      screen.getByText("Ingresá un color hexadecimal de 6 dígitos."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Paso 4 Icono/i })).toBeEnabled();
    advanceToIcon();
    expect(screen.getByRole("button", { name: "Crear mi app" })).toBeDisabled();
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
