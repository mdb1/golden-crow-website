/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexLogisticsBrowser } from "@/components/pgflex-logistics-browser";
import type { AdminContextRecord } from "@/lib/admin-areas";
import type { PGFlexLogisticsListItem } from "@/lib/pgflex-logistics";
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

function logisticsItem(
  overrides: Partial<PGFlexLogisticsListItem> = {},
): PGFlexLogisticsListItem {
  return {
    id: "dispatch-1",
    identifier: "PGF-001",
    shipmentType: "2pq",
    origin: "Clinica Norte",
    destination: "Humboldt 2433",
    timeRequested: "2026-08-31T10:00:00.000Z",
    status: "awaiting_pick_up",
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
    canUpdate: true,
    canDelete: true,
    ...overrides,
  };
}

function renderBrowser(items: PGFlexLogisticsListItem[] = []) {
  return render(
    <AppLanguageProvider forcedLanguage="es">
      <AdminContextProvider value={fullAdminContext}>
        <PGFlexLogisticsBrowser
          initialPage={{ items, nextCursor: null, scope: "active" }}
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

  it("does not show the dispatcher email as a status pill", () => {
    renderBrowser([
      logisticsItem({
        dispatcherEmail: "driver@example.com",
        dispatcherFirebaseId: "driver-uid",
      }),
    ]);

    expect(screen.getByText("Esperando retiro")).toBeInTheDocument();
    expect(screen.getByText("31-08-2026-10:00AM")).toBeInTheDocument();
    expect(screen.queryByText("driver@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("driver-uid")).not.toBeInTheDocument();
  });
});
