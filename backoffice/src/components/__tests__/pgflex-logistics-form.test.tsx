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

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
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

  afterAll(() => {
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      return;
    }

    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
  });

  it("keeps generated create-only PGFlex fields and email copy out of the new dispatch form", async () => {
    const user = userEvent.setup();
    renderCreateForm();

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
});
