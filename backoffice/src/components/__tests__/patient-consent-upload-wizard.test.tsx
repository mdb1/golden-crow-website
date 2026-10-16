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
  it("shows the five-step signing flow and the downloadable 2PQ PDF", () => {
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    expect(
      screen.getByRole("heading", { name: "Subir consentimiento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Descargar")).toBeInTheDocument();
    expect(screen.getByText("Datos")).toBeInTheDocument();
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

  it("prefills the patient name and reveals the partner name only when selected", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await user.click(
      screen.getByRole("button", { name: "Continuar con los datos" }),
    );

    expect(
      screen.getByRole("textbox", {
        name: "Nombre y apellido del paciente",
      }),
    ).toHaveValue("Ada Paciente");
    expect(
      screen.queryByRole("textbox", {
        name: "Nombre y apellido de la pareja",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: "El consentimiento también será firmado por la pareja",
      }),
    );

    const partnerName = screen.getByRole("textbox", {
      name: "Nombre y apellido de la pareja",
    });
    expect(partnerName).toBeRequired();

    await user.type(partnerName, "Alex Pareja");
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );

    expect(
      screen.getByLabelText("Área para dibujar la firma del paciente"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Área para dibujar la firma de la pareja"),
    ).toBeInTheDocument();
  });

  it("requires the patient name before opening the signature step", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard />);

    await user.click(
      screen.getByRole("button", { name: "Continuar con los datos" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );

    expect(
      screen.getByText("Ingrese el nombre y apellido del paciente."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Datos de quienes firman" }),
    ).toBeInTheDocument();
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
