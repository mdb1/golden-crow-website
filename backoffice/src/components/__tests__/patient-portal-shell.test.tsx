/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import PatientPortalHomePage from "@/app/patient-portal/(portal)/home/page";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PatientPortalHeader } from "@/components/patient-portal-header";
import { PatientPortalSidebar } from "@/components/patient-portal-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LANGUAGE_STORAGE_KEY } from "@/lib/language";

let pathname = "/patient-portal/home";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

jest.mock("@/components/appearance-toggle", () => ({
  AppearanceToggle: () => <button type="button">Apariencia</button>,
}));

describe("patient portal Spanish shell", () => {
  beforeEach(() => {
    pathname = "/patient-portal/home";
    window.localStorage.clear();
  });

  it("forces Spanish without overwriting the backoffice language preference", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");

    render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="es">
        <SidebarProvider>
          <PatientPortalSidebar />
          <PatientPortalHeader />
          <PatientPortalHomePage />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Portal de pacientes")).toBeTruthy();
    expect(screen.getAllByText("Inicio").length).toBeGreaterThan(0);
    expect(screen.getByText("Mis datos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    expect(screen.getByText("Estás en el portal de pacientes")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Language" })).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("labels the patient account screen as personal data", () => {
    pathname = "/patient-portal/my-account";

    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <SidebarProvider>
          <PatientPortalSidebar />
          <PatientPortalHeader />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    expect(screen.getAllByText("Mis datos").length).toBeGreaterThan(0);
    expect(screen.queryByText("Mi cuenta")).toBeNull();
  });
});
