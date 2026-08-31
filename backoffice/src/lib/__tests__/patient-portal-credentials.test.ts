import type { AdminContextRecord, PatientListItem } from "@/lib/admin-areas";
import { canManagePatientPortalCredentialsUi } from "@/lib/areas-ui";

const patient = {
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
} as PatientListItem;

function context(
  values: Partial<AdminContextRecord> & Pick<AdminContextRecord, "role">,
): AdminContextRecord {
  return {
    email: "operator@example.com",
    uid: "uid-1",
    isBootstrap: false,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    project: "mydnamap",
    projectAccess: ["mydnamap"],
    ...values,
  };
}

describe("patient portal credential UI scope", () => {
  it("matches the global, institution-admin, and assigned-doctor boundary", () => {
    expect(
      canManagePatientPortalCredentialsUi(
        context({ role: "full_admin" }),
        patient,
      ),
    ).toBe(true);
    expect(
      canManagePatientPortalCredentialsUi(
        context({
          role: "institution_admin",
          institutionId: "INST-00001",
        }),
        patient,
      ),
    ).toBe(true);
    expect(
      canManagePatientPortalCredentialsUi(
        context({
          role: "institution_doctor",
          institutionId: "INST-00001",
          doctorId: "DOC-00001",
        }),
        patient,
      ),
    ).toBe(true);
  });

  it("rejects operators, unrelated institution admins, and unrelated doctors", () => {
    expect(
      canManagePatientPortalCredentialsUi(
        context({
          role: "institution_operator",
          institutionId: "INST-00001",
        }),
        patient,
      ),
    ).toBe(false);
    expect(
      canManagePatientPortalCredentialsUi(
        context({
          role: "institution_admin",
          institutionId: "INST-00002",
        }),
        patient,
      ),
    ).toBe(false);
    expect(
      canManagePatientPortalCredentialsUi(
        context({
          role: "institution_doctor",
          institutionId: "INST-00001",
          doctorId: "DOC-00002",
        }),
        patient,
      ),
    ).toBe(false);
  });
});
