/** @jest-environment jsdom */

import {
  applyScopedInstitutionSelection,
  buildInitialState,
} from "@/components/two-pq-form-flow";
import type { InstitutionListItem } from "@/lib/admin-areas";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

const institution: InstitutionListItem = {
  id: "INST-1",
  code: "clinic",
  name: "Clinic",
  contactEmail: "doctor@clinic.test",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  doctorCount: 1,
  patientCount: 0,
  institutionAdminCount: 0,
  administrativeOperatorCount: 0,
  laboratoryStaffCount: 0,
};

describe("2PQ form patient email defaults", () => {
  it("keeps patient email empty for a new form even when doctor and institution are known", () => {
    const state = buildInitialState(institution.id, "DOC-1");

    expect(state.patientInformation.institutionId).toBe(institution.id);
    expect(state.patientInformation.doctorId).toBe("DOC-1");
    expect(state.patientInformation.email).toBe("");
  });

  it("does not copy institution contact email into the patient email", () => {
    const state = applyScopedInstitutionSelection(
      buildInitialState("", "DOC-1"),
      institution,
    );

    expect(state.patientInformation.institutionId).toBe(institution.id);
    expect(state.patientInformation.email).toBe("");
  });

  it("preserves an existing patient email from a draft or selected patient", () => {
    const state = applyScopedInstitutionSelection(
      {
        ...buildInitialState("", "DOC-1"),
        patientInformation: {
          ...buildInitialState("", "DOC-1").patientInformation,
          email: "patient@example.test",
        },
      },
      institution,
    );

    expect(state.patientInformation.email).toBe("patient@example.test");
  });
});
