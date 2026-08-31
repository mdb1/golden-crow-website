/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexLogisticsBrowser } from "@/components/pgflex-logistics-browser";
import type { AdminContextRecord } from "@/lib/admin-areas";

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
        <PGFlexLogisticsBrowser initialPage={{ items: [], nextCursor: null }} />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("PGFlexLogisticsBrowser", () => {
  it("uses the PGFlex icon in place of the visible logistics title", () => {
    renderBrowser();

    const heading = screen.getByRole("heading", { name: "Logística PGFlex" });
    expect(heading).not.toHaveTextContent("Logística PGFlex");
    expect(heading.querySelector("img")).toHaveAttribute(
      "src",
      "/pgflex_icon.png",
    );
  });
});
