/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import type { PublisherAppConfig } from "@/lib/publisher-app-config";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE } from "@/lib/publisher-portal-routes";
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
  platformOption: "ios_android",
  connectEnabled: true,
  profileEnabled: true,
  learnCustomizationEnabled: true,
  colors: {
    primary: "#123ABC",
    secondary: "#456DEF",
    tertiary: "#FEDCBA",
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
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
}

describe("PublisherAppConfigWorkbench", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a configuration from the three-step flow without sending identity fields", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({ config: savedConfig });
    renderWorkbench();

    expect(
      screen.getByRole("heading", { name: "Configurá tu app" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Solo iOS/i }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Connect/i }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText("Color principal"), {
      target: { value: "#112233" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar configuración" }),
    );

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
    });
    expect(payload).not.toHaveProperty("publisherId");
    expect(payload).not.toHaveProperty("publisherKind");
    expect(payload).not.toHaveProperty("publisherEmail");
    expect(payload).not.toHaveProperty("publisherUsername");
    expect(mockRouterReplace).toHaveBeenCalledWith(
      PUBLISHER_PORTAL_APP_EDIT_ROUTE,
    );
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("loads an existing configuration and saves only after it changes", async () => {
    const updatedConfig = {
      ...savedConfig,
      colors: { ...savedConfig.colors, tertiary: "#AABBCC" },
    };
    jest.mocked(sdkFetch).mockResolvedValue({ config: updatedConfig });
    renderWorkbench({ mode: "edit", initialConfig: savedConfig });

    expect(screen.getByRole("radio", { name: /iOS \+ Android/i })).toHaveAttribute(
      "data-state",
      "checked",
    );
    advanceToColors();

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();
    expect(screen.getByLabelText("Color principal")).toHaveValue("#123ABC");
    fireEvent.change(screen.getByLabelText("Color terciario"), {
      target: { value: "#AABBCC" },
    });
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
    expect(
      screen.getByRole("button", { name: "Guardar configuración" }),
    ).toBeDisabled();
  });
});
