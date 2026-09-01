/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { AdminContextRecord } from "@/lib/admin-areas";

let pathname = "/pgflex/logistics";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

const matchMedia = jest.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

const fullAdminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

function renderSidebar(context: AdminContextRecord = fullAdminContext) {
  window.matchMedia = matchMedia;

  return render(
    <AppLanguageProvider forcedLanguage="es">
      <SidebarProvider>
        <AppSidebar adminContext={context} />
      </SidebarProvider>
    </AppLanguageProvider>,
  );
}

describe("AppSidebar PGFlex section", () => {
  beforeEach(() => {
    pathname = "/pgflex/logistics";
    jest.clearAllMocks();
  });

  it("uses the PGFlex logo as the section title and keeps logistics as an Envios row", () => {
    renderSidebar();

    const logo = screen.getByRole("img", { name: "PGFlex" });
    expect(logo).toHaveAttribute("src", "/pgflex_icon.png");
    expect(screen.getByRole("link", { name: /Envios/ })).toHaveAttribute(
      "href",
      "/pgflex/logistics",
    );
    expect(
      screen.getByRole("link", { name: /Transportistas/ }),
    ).toHaveAttribute("href", "/areas/transport-dispatchers");
    expect(screen.queryByRole("link", { name: /^PGFlex$/ })).toBeNull();
  });

  it("shows PGFlex directly after the 2PQ section for full admins", () => {
    renderSidebar();

    const twoPQDashboard = screen.getByRole("link", { name: /Dashboard 2PQ/ });
    const pgflexLogo = screen.getByRole("img", { name: "PGFlex" });
    const accounts = document.querySelector('a[href="/users"]');

    expect(accounts).toBeTruthy();
    expect(
      twoPQDashboard.compareDocumentPosition(pgflexLogo) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pgflexLogo.compareDocumentPosition(accounts as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
