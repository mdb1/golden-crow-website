/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";

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
});
