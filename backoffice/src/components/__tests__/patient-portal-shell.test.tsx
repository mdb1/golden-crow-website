/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import PatientPortalHomePage from "@/app/patient-portal/(portal)/home/page";
import PGFlexHomePage from "@/app/(dashboard)/pgflex/home/page";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PatientPortalHeader } from "@/components/patient-portal-header";
import { PatientPortalSidebar } from "@/components/patient-portal-sidebar";
import { PGFlexPortalHeader } from "@/components/pgflex-portal-header";
import { PGFlexPortalSidebar } from "@/components/pgflex-portal-sidebar";
import { PublisherPortalHeader } from "@/components/publisher-portal-header";
import { PublisherPortalSidebar } from "@/components/publisher-portal-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeBootstrap } from "@/components/theme-bootstrap";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";
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

    const { container } = render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="es">
        <SidebarProvider>
          <PatientPortalSidebar />
          <PatientPortalHeader />
          <PatientPortalHomePage />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Portal de pacientes")).toBeTruthy();
    expect(container.querySelector("header")?.className).toContain(
      "bg-background/90",
    );
    expect(
      screen.getByText("Estás en el portal de pacientes").className,
    ).toContain("text-base");
    const patientHomeShell = screen.getByText(
      "Estás en el portal de pacientes",
    ).parentElement;
    expect(patientHomeShell?.className).toContain("bg-background");
    expect(patientHomeShell?.className).toContain("text-foreground");
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

describe("PGFlex portal Spanish shell", () => {
  beforeEach(() => {
    pathname = "/pgflex/home";
    window.localStorage.clear();
  });

  it("uses the patient-style shell with only Home, PGFlex, and account", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");

    const { container } = render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="es">
        <SidebarProvider>
          <PGFlexPortalSidebar />
          <PGFlexPortalHeader />
          <PGFlexHomePage />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Portal PGFlex")).toBeTruthy();
    expect(container.querySelector("header")?.className).toContain(
      "bg-background/90",
    );
    const pgflexHomeShell = screen.getByText(
      "Estás en el portal PGFlex",
    ).parentElement;
    expect(pgflexHomeShell?.className).toContain("bg-background");
    expect(pgflexHomeShell?.className).toContain("text-foreground");
    expect(screen.getAllByText("Inicio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PGFlex").length).toBeGreaterThan(0);
    expect(screen.getByText("Mi cuenta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    expect(screen.getByText("Estás en el portal PGFlex")).toBeTruthy();
    expect(screen.queryByText("Roles & Permissions")).toBeNull();
    expect(screen.queryByRole("group", { name: "Language" })).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });
});

describe("Publisher portal Spanish shell", () => {
  beforeEach(() => {
    pathname = "/publisher-portal/discover/feed-entries";
    window.localStorage.clear();
  });

  it("links organization publishers directly to their own organization", () => {
    render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="es">
        <SidebarProvider>
          <PublisherPortalSidebar
            role="organization_publisher"
            organizationId="org-1"
          />
          <PublisherPortalHeader />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Portal de publicadores")).toBeTruthy();
    expect(screen.getAllByText("Inicio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Organización").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Entradas del feed").length).toBeGreaterThan(0);
    expect(screen.getByText("Mi cuenta")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Organización/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/discover/organizations/org-1");
    expect(screen.queryByText("Perfil de publicador")).toBeNull();
  });

  it("links individual publishers directly to their own individual publisher record", () => {
    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <SidebarProvider>
          <PublisherPortalSidebar
            role="individual_publisher"
            individualId="ind-1"
          />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    expect(
      screen
        .getByRole("link", { name: /Editor/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/discover/individuals/ind-1");
  });
});

describe("theme bootstrap", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "";
    document.documentElement.style.colorScheme = "";
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("prioritizes the main backoffice appearance over the GC Fitness fallback", async () => {
    window.localStorage.setItem("gc-fitness-appearance", "light");
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");

    render(<ThemeBootstrap />);

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("dark"),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
