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
  it.each(["institution_operator", "institution_laboratory_staff"] as const)(
    "offers all forms and resumes biopsy drafts for %s", (role) => {
      renderDashboard(role, { formType: "sample" } as TwoPQFormDraftRecord);
      expect(screen.getByRole("link", { name: "Completar formulario de muestras (biopsias)" }))
        .toHaveAttribute("href", "/2pq-dashboard/forms/sample/new");
      expect(screen.getByRole("link", { name: "Completar formulario de solicitud de estudio" }))
        .toHaveAttribute("href", "/2pq-dashboard/forms/study-request/new");
      expect(screen.getByRole("link", { name: "Completar formulario de planificación del tratamiento" }))
        .toHaveAttribute("href", "/2pq-dashboard/forms/treatment-start/new");
      expect(screen.getByRole("link", { name: "Completar formulario de solicitud de retiro" }))
        .toHaveAttribute("href", "/2pq-dashboard/forms/withdrawal-request/new");
      expect(screen.getByRole("link", { name: /Continuar desde borrador/i }))
        .toHaveAttribute("href", "/2pq-dashboard/forms/sample/new?draft=1");
    },
  );

  it("gives operators doctor and patient shortcuts without staff-management actions", () => {
    renderDashboard("institution_operator");
    expect(screen.getByRole("link", { name: /Alta de médico/ })).toHaveAttribute("href", "/areas/doctors/new");
    expect(screen.getByRole("link", { name: /Alta de paciente/ })).toHaveAttribute("href", "/areas/patients/new");
    expect(screen.queryByRole("link", { name: /Alta de operario|Alta de personal de laboratorio/ })).toBeNull();
  });
});
