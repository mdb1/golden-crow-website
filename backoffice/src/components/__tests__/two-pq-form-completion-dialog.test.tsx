/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQFormCompletionDialog } from "@/components/two-pq-form-completion-dialog";
import type { TwoPQFormType } from "@/lib/two-pq-forms";

const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

function renderDialog(createdType: TwoPQFormType) {
  render(
    <AppLanguageProvider forcedLanguage="es">
      <TwoPQFormCompletionDialog
        createdId="FORM-123"
        createdType={createdType}
      />
    </AppLanguageProvider>,
  );
}

describe("TwoPQFormCompletionDialog", () => {
  it("confirms that the study request was saved and links to its consent actions", () => {
    renderDialog("study_request");

    expect(
      screen.getByRole("heading", {
        name: "La solicitud de estudio se guardó",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Abrí la solicitud para consultar el estado del consentimiento o reenviar la invitación al paciente.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Abrir formulario completado" }),
    ).toHaveAttribute("href", "/2pq-dashboard/forms/FORM-123#informed-consent");
    expect(screen.queryByText("2pq_forms")).toBeNull();
  });

  it("keeps the stored-form confirmation for biopsy forms", () => {
    renderDialog("sample");

    expect(
      screen.getByRole("heading", {
        name: "El formulario de biopsias está listo y guardado",
      }),
    ).toBeTruthy();
    expect(screen.getByText("2pq_forms")).toBeTruthy();
    expect(screen.queryByText(/casilla de spam/i)).toBeNull();
  });

  it("confirms that treatment planning was saved without a patient email message", () => {
    renderDialog("treatment_start");

    expect(screen.getByRole("heading", {
      name: "El formulario de inicio de tratamiento se guardó",
    })).toBeTruthy();
    expect(screen.queryByText(/mail de acceso|casilla de spam/i)).toBeNull();
  });
});
