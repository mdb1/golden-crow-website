/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQDashboardHome } from "@/components/two-pq-dashboard-home";
import type { AdminContextRecord } from "@/lib/admin-areas";
import type { TwoPQFormDraftRecord } from "@/lib/two-pq-forms";

const metrics = {
  institutions: 1,
  doctors: 1,
  patients: 1,
  administrativeOperators: 1,
  laboratoryStaff: 1,
  transportDispatchers: 0,
  roles: 3,
};

function context(
  role: AdminContextRecord["role"],
): AdminContextRecord {
  return {
    email: `${role}@example.test`,
    uid: `${role}-uid`,
    role,
    institutionId: "institution-1",
    isBootstrap: false,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: false,
    project: "mydnamap",
    projectAccess: ["mydnamap"],
  };
}

function renderDashboard(
  role: AdminContextRecord["role"],
  formDraft?: TwoPQFormDraftRecord,
) {
  render(
    <AppLanguageProvider forcedLanguage="es">
      <TwoPQDashboardHome
        adminContext={context(role)}
        language="es"
        metrics={metrics}
        formDraft={formDraft}
      />
    </AppLanguageProvider>,
  );
}

describe("2PQ dashboard form access", () => {
  it("does not offer sample forms or sample drafts to institution operators", () => {
    renderDashboard(
      "institution_operator",
      { formType: "sample" } as TwoPQFormDraftRecord,
    );

    expect(
      screen.queryByRole("link", { name: "Completar formulario de muestra" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Continuar desde borrador/i }),
    ).toBeNull();
    expect(
      screen.getByRole("link", {
        name: "Completar formulario de solicitud de estudio",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Completar formulario de solicitud de retiro",
      }),
    ).toBeTruthy();
  });

  it("keeps sample forms available to institution laboratory staff", () => {
    renderDashboard("institution_laboratory_staff");

    expect(
      screen.getByRole("link", { name: "Completar formulario de muestra" }),
    ).toBeTruthy();
  });
});
