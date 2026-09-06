import { canAccessInformedConsentPatient } from "../lib/informed-consent-access.js";
import type { AdminContext, PatientRecord } from "../types/sdk.types.js";

const patient: Pick<PatientRecord, "id" | "institutionId" | "doctorId"> = {
  id: "PAT-00009",
  institutionId: "INS-00001",
  doctorId: "DOC-00002",
};

function context(
  values: Partial<AdminContext> & Pick<AdminContext, "role">,
): AdminContext {
  return {
    email: "user@example.com",
    uid: "uid-1",
    isBootstrap: false,
    canAccessBackoffice: values.role !== "patient",
    canAccessPatientPortal: values.role === "patient",
    canAccessPGFlex: values.role === "transport_dispatcher",
    canAccessPublisherPortal:
      values.role === "organization_publisher" ||
      values.role === "individual_publisher",
    projectAccess: ["mydnamap"],
    ...values,
  };
}

describe("informed consent access", () => {
  it("allows full admins to access patient consent records globally", () => {
    expect(
      canAccessInformedConsentPatient(context({ role: "full_admin" }), patient),
    ).toBe(true);
  });

  it("blocks organization publishers from patient consent records", () => {
    expect(
      canAccessInformedConsentPatient(
        context({
          role: "organization_publisher",
          organizationId: "ORG-00001",
        }),
        patient,
      ),
    ).toBe(false);
  });

  it("limits institution roles to their institution", () => {
    expect(
      canAccessInformedConsentPatient(
        context({
          role: "institution_laboratory_staff",
          institutionId: "INS-00001",
        }),
        patient,
      ),
    ).toBe(true);
    expect(
      canAccessInformedConsentPatient(
        context({ role: "institution_admin", institutionId: "INS-99999" }),
        patient,
      ),
    ).toBe(false);
  });

  it("limits doctors to their assigned doctor lane", () => {
    expect(
      canAccessInformedConsentPatient(
        context({
          role: "institution_doctor",
          institutionId: "INS-00001",
          doctorId: "DOC-00002",
        }),
        patient,
      ),
    ).toBe(true);
    expect(
      canAccessInformedConsentPatient(
        context({
          role: "institution_doctor",
          institutionId: "INS-00001",
          doctorId: "DOC-99999",
        }),
        patient,
      ),
    ).toBe(false);
  });

  it("limits patient portal users to their own patient id", () => {
    expect(
      canAccessInformedConsentPatient(
        context({ role: "patient", patientId: "PAT-00009" }),
        patient,
      ),
    ).toBe(true);
    expect(
      canAccessInformedConsentPatient(
        context({ role: "patient", patientId: "PAT-00010" }),
        patient,
      ),
    ).toBe(false);
  });
});
