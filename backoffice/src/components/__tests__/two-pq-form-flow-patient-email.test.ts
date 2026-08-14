/** @jest-environment jsdom */

import {
  applyPatientInstitutionSelection,
  applyScopedInstitutionSelection,
  buildInitialState,
} from "@/components/two-pq-form-flow";
import type { DoctorListItem, InstitutionListItem } from "@/lib/admin-areas";

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
  legalName: "Clinic Legal Name",
  contactEmail: "doctor@clinic.test",
  contactPhone: "+54 11 1234-5678",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  doctorCount: 1,
  patientCount: 0,
  institutionAdminCount: 0,
  administrativeOperatorCount: 0,
  laboratoryStaffCount: 0,
};

const doctor: DoctorListItem = {
  id: "DOC-1",
  institutionId: institution.id,
  authEmail: "doctor@clinic.test",
  fullName: "Doctor Test",
  status: "active",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  patientCount: 0,
};

describe("2PQ form patient email and institution defaults", () => {
  it("keeps patient email empty for a new form even when doctor and institution are known", () => {
    const state = buildInitialState(institution.id, "DOC-1");

    expect(state.patientInformation.institutionId).toBe(institution.id);
    expect(state.patientInformation.doctorId).toBe("DOC-1");
    expect(state.patientInformation.email).toBe("");
  });

  it("preloads selected institution information without copying contact email into the patient email", () => {
    const state = applyScopedInstitutionSelection(
      buildInitialState("", "DOC-1"),
      institution,
    );

    expect(state.selectedInstitutionId).toBe(institution.id);
    expect(state.institutionInformation).toEqual({
      code: "clinic",
      name: "Clinic",
      legalName: "Clinic Legal Name",
      contactEmail: "doctor@clinic.test",
      contactPhone: "+54 11 1234-5678",
      address: "",
      city: "",
      state: "",
      country: "",
      notes: "",
    });
    expect(state.patientInformation.institutionId).toBe(institution.id);
    expect(state.patientInformation.email).toBe("");
  });

  it("syncs the patient-step institution picker into the institution information step", () => {
    const state = applyPatientInstitutionSelection(
      buildInitialState("", doctor.id),
      institution.id,
      institution,
      [doctor],
    );

    expect(state.selectedInstitutionId).toBe(institution.id);
    expect(state.institutionInformation.name).toBe("Clinic");
    expect(state.institutionInformation.contactEmail).toBe("doctor@clinic.test");
    expect(state.patientInformation.institutionId).toBe(institution.id);
    expect(state.patientInformation.doctorId).toBe(doctor.id);
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
