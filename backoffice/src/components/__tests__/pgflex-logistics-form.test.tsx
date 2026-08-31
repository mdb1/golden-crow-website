/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexLogisticsForm } from "@/components/pgflex-logistics-form";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const fullAdminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

function renderCreateForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider forcedLanguage="en">
        <AdminContextProvider value={fullAdminContext}>
          <PGFlexLogisticsForm mode="create" />
        </AdminContextProvider>
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("PGFlexLogisticsForm", () => {
  const originalGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalPGFlexGoogleMapsApiKey =
    process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
  const googleMapsScriptId = "pgflex-google-maps-js-api";

  function resetGoogleMapsLoader() {
    delete (window as Window & { __pgflexGoogleMapsPromise?: Promise<void> })
      .__pgflexGoogleMapsPromise;
    document.getElementById(googleMapsScriptId)?.remove();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    resetGoogleMapsLoader();
    (sdkFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/roles/transport-dispatchers/options") {
        return Promise.resolve({ dispatchers: [] });
      }

      if (path === "/pgflex/logistics") {
        return Promise.resolve({ item: { id: "dispatch-1" } });
      }

      return Promise.reject(new Error(`Unexpected SDK path: ${path}`));
    });
  });

  afterEach(() => {
    resetGoogleMapsLoader();
  });

  afterAll(() => {
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }

    if (originalPGFlexGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY =
        originalPGFlexGoogleMapsApiKey;
    }
  });

  it("keeps generated create-only PGFlex fields and email copy out of the new dispatch form", async () => {
    const user = userEvent.setup();
    renderCreateForm();

    expect(screen.getByText("Linked codes")).toBeInTheDocument();
    expect(screen.queryByLabelText("Time requested")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "A notification email will be sent to this transport dispatcher when the dispatch is saved.",
      ),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Identifier"), "PGF-001");
    await user.type(screen.getByLabelText("Origin"), "Av. Corrientes 123");
    await user.type(screen.getByLabelText("Destination"), "Hospital Italiano");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-001",
          origin: "Av. Corrientes 123",
          destination: "Hospital Italiano",
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1");
  });

  it("adds optional linked codes and sends them as a comma-separated field", async () => {
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("abc");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));

    expect(promptSpy).toHaveBeenCalledWith("Enter a 3-letter code");
    expect(screen.getByText("ABC")).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Identifier"), "PGF-002");
    await user.type(screen.getByLabelText("Origin"), "Av. Santa Fe 1000");
    await user.type(screen.getByLabelText("Destination"), "Laboratorio Sur");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-002",
          linked_codes: "ABC",
          origin: "Av. Santa Fe 1000",
          destination: "Laboratorio Sur",
        }),
      }),
    );

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("rejects linked codes that are not exactly three letters", async () => {
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("AB1");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));

    expect(alertSpy).toHaveBeenCalledWith("Use exactly 3 letters, no numbers.");
    expect(screen.queryByText("AB1")).not.toBeInTheDocument();

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
