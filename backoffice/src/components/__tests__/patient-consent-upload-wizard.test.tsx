/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

describe("PatientConsentUploadWizard", () => {
  it("shows the four-step signing flow and the downloadable 2PQ PDF", () => {
    render(<PatientConsentUploadWizard />);

    expect(
      screen.getByRole("heading", { name: "Subir consentimiento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Descargar")).toBeInTheDocument();
    expect(screen.getByText("Firmar")).toBeInTheDocument();
    expect(screen.getByText("Aplicar firma")).toBeInTheDocument();
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Descargar consentimiento-informado-2pq.pdf",
      }),
    ).toHaveAttribute(
      "href",
      "/patient-portal/documents/consentimiento-informado-2pq.pdf",
    );
  });

  it("offers a direct upload path for an already signed file", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard />);

    await user.click(
      screen.getByRole("button", { name: "Cargar archivo firmado" }),
    );

    expect(screen.getByText("Consentimiento firmado")).toBeInTheDocument();
    expect(screen.getByText("Sin archivo seleccionado")).toBeInTheDocument();
    expect(
      screen.getByText("PDF o imagen, máximo 750 KB."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    ).toBeDisabled();
  });
});
