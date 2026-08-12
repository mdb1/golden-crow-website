import {
  canAccessBackoffice,
  canAccessPatientPortal,
} from "../lib/access-surfaces.js";

describe("access surfaces", () => {
  it("keeps patient roles out of both surfaces by default", () => {
    const patientRole = {
      role: "patient" as const,
      isActive: true,
      canAccessPatientPortal: false,
    };

    expect(canAccessBackoffice(patientRole)).toBe(false);
    expect(canAccessPatientPortal(patientRole)).toBe(false);
  });

  it("grants only the patient portal when explicitly enabled", () => {
    const patientRole = {
      role: "patient" as const,
      isActive: true,
      canAccessPatientPortal: true,
    };

    expect(canAccessBackoffice(patientRole)).toBe(false);
    expect(canAccessPatientPortal(patientRole)).toBe(true);
  });

  it("keeps backoffice and patient portal access mutually exclusive", () => {
    const patientRole = {
      role: "patient" as const,
      isActive: true,
      canAccessPatientPortal: true,
    };

    expect(canAccessBackoffice(patientRole, true)).toBe(true);
    expect(canAccessPatientPortal(patientRole, true)).toBe(false);
  });

  it("never gives an admin role patient portal access", () => {
    const doctorRole = {
      role: "institution_doctor" as const,
      isActive: true,
      canAccessPatientPortal: true,
    };

    expect(canAccessBackoffice(doctorRole)).toBe(true);
    expect(canAccessPatientPortal(doctorRole)).toBe(false);
  });
});
