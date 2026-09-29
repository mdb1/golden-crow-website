/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";

const consentRecord = {
  id: "CONS-00001",
  collectionKey: "2pq-informed-consent" as const,
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  patientId: "PAT-00001",
  patientName: "Patient One",
  file: {
    name: "consent.pdf",
    type: "application/pdf",
    size: 1200,
  },
  createdAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T12:00:00.000Z",
  createdByEmail: "patient@example.com",
};

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
}));

jest.mock("@/lib/sdk-client", () => ({
  SdkRequestError: class SdkRequestError extends Error {},
  sdkFetch: jest.fn(),
}));

describe("patient portal consents", () => {
  it("renders the patient consent workflow in Spanish", () => {
    render(
      <InformedConsentsWorkbench
        surface="patient-portal"
        initialPage={{ records: [] }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Subir consentimiento" }),
    ).toBeTruthy();
    expect(screen.getByText("Archivo de consentimiento")).toBeTruthy();
    expect(screen.getByText("Sin archivo seleccionado")).toBeTruthy();
    expect(screen.getByText("Cargar archivo")).toBeTruthy();
    expect(screen.getByText("PDF o imagen, máximo 750 KB.")).toBeTruthy();
    expect(
      screen.getByText("No se subieron archivos de consentimiento."),
    ).toBeTruthy();
  });

  it("never exposes the administrative delete action in the patient portal", () => {
    render(
      <InformedConsentsWorkbench
        surface="patient-portal"
        initialPage={{
          records: [consentRecord],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Abrir archivo" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Eliminar consentimiento" }),
    ).toBeNull();
  });

  it("shows the delete action to a global admin in the backoffice", () => {
    render(
      <AdminContextProvider
        value={{
          email: "admin@example.com",
          uid: "admin-uid",
          role: "2pq_admin",
          isBootstrap: false,
          canAccessBackoffice: true,
          canAccessPatientPortal: false,
          canAccessPGFlex: false,
          canAccessPublisherPortal: false,
          project: "mydnamap",
          projectAccess: ["mydnamap"],
        }}
      >
        <AppLanguageProvider initialLanguage="en">
          <InformedConsentsWorkbench
            surface="backoffice"
            initialPage={{ records: [consentRecord] }}
            initialPatientPage={{ patients: [] }}
          />
        </AppLanguageProvider>
      </AdminContextProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete consent" })).toBeTruthy();
  });
});
