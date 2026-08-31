/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexLogisticsBrowser } from "@/components/pgflex-logistics-browser";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

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

function renderBrowser() {
  return render(
    <AppLanguageProvider forcedLanguage="es">
      <AdminContextProvider value={fullAdminContext}>
        <PGFlexLogisticsBrowser
          initialPage={{ items: [], nextCursor: null, scope: "active" }}
        />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("PGFlexLogisticsBrowser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sdkFetch as jest.Mock).mockResolvedValue({
      items: [],
      nextCursor: null,
      scope: "finished",
    });
  });

  it("uses the PGFlex icon in place of the visible logistics title", () => {
    renderBrowser();

    const heading = screen.getByRole("heading", { name: "Logística PGFlex" });
    expect(heading).not.toHaveTextContent("Logística PGFlex");
    expect(heading.querySelector("img")).toHaveAttribute(
      "src",
      "/pgflex_icon.png",
    );
  });

  it("loads the selected status segment from the SDK", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole("tab", { name: "Finalizado" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/pgflex/logistics?limit=20&scope=finished",
      );
    });
  });
});
