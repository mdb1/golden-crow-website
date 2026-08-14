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
  it("shows patient access email instructions for completed study requests", () => {
    renderDialog("study_request");

    expect(
      screen.getByRole("heading", {
        name: "El mail de acceso fue enviado al paciente",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Se envió un mail con la clave de acceso al correo del paciente. El paciente debe revisarlo para poder subir el archivo.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Pedile al paciente que revise también la casilla de spam; a veces este mail llega ahí.",
      ),
    ).toBeTruthy();
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
});
