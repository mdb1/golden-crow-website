/** @jest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionToast } from "@/components/action-toast";

describe("ActionToast", () => {
  it("renders warnings as assertive amber alerts", () => {
    render(
      <ActionToast
        language="es"
        onDismiss={jest.fn()}
        toast={{
          id: 3,
          tone: "warning",
          message: "El contrato todavía no está completo.",
          durationMs: 999999,
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Advertencia")).toBeTruthy();
    expect(
      within(alert).getByText("El contrato todavía no está completo."),
    ).toBeTruthy();
    expect(alert.className).toContain("border-amber-400/45");
  });

  it("opens an internal error log modal when an error toast has details", async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();

    render(
      <ActionToast
        language="es"
        onDismiss={onDismiss}
        toast={{
          id: 1,
          tone: "error",
          message: "No se pudieron actualizar las plantillas seleccionadas.",
          details:
            "PUT /admin/partnership-crm/templates/tpl-1 failed with 500\nFirestore permission denied.",
          durationMs: 999999,
        }}
      />,
    );

    expect(screen.getByText("La acción falló")).toBeTruthy();
    expect(
      screen.getByText(
        "No se pudieron actualizar las plantillas seleccionadas.",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ver log completo" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Log de error de acción",
    });
    expect(
      within(dialog).getByText(
        "Detalle completo del error para esta acción fallida.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        /PUT \/admin\/partnership-crm\/templates\/tpl-1/,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Firestore permission denied/),
    ).toBeTruthy();
  });

  it("uses the supplied log handler when one is provided", async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    const onViewLog = jest.fn();

    render(
      <ActionToast
        onDismiss={onDismiss}
        onViewLog={onViewLog}
        toast={{
          id: 2,
          tone: "error",
          message: "Unable to update selected templates.",
          details: "backend stack trace",
          durationMs: 999999,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "See full log" }));

    expect(onViewLog).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
