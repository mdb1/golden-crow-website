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
  caseId: null,
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
  it("centers a large upload action in the empty state", () => {
    render(
      <InformedConsentsWorkbench
        surface="patient-portal"
        initialPage={{ records: [] }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Consentimientos 2PQ" }),
    ).toBeTruthy();
    const emptyState = screen.getByTestId("patient-consent-empty-state");
    const uploadLinks = screen.getAllByRole("link", {
      name: "Subir consentimiento",
    });
    expect(uploadLinks).toHaveLength(1);
    expect(uploadLinks[0]).toHaveAttribute(
      "href",
      "/patient-portal/consents/new",
    );
    expect(uploadLinks[0]).toHaveClass("h-14", "px-8", "text-base");
    expect(emptyState).toHaveTextContent(
      "Todavía no subiste un consentimiento",
    );
    expect(screen.queryByText("Archivo de consentimiento")).toBeNull();
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
      screen.getByRole("link", { name: "Subir consentimiento" }),
    ).toHaveAttribute("href", "/patient-portal/consents/new");
    expect(screen.queryByTestId("patient-consent-empty-state")).toBeNull();
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
          />
        </AppLanguageProvider>
      </AdminContextProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete consent" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Subir consentimiento" }),
    ).toHaveAttribute("href", "/2pq-dashboard/consents/new");
  });
});
