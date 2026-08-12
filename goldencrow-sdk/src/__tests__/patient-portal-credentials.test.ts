import type { Auth, UserRecord } from "firebase-admin/auth";
import {
  PATIENT_TEMPORARY_PASSWORD_LENGTH,
  canManagePatientPortalCredentials,
  generatePatientTemporaryPassword,
  hasPatientAccessedPortal,
  patientTemporaryPasswordDocument,
  provisionPatientFirebaseAccount,
} from "../lib/patient-portal-credentials.js";

const patient = {
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
};

function user(overrides: Partial<UserRecord> = {}) {
  return {
    uid: "uid-1",
    email: "patient@example.com",
    displayName: null,
    ...overrides,
  } as UserRecord;
}

describe("patient portal credentials", () => {
  it("generates exactly eight uppercase letters", () => {
    for (let index = 0; index < 100; index += 1) {
      const password = generatePatientTemporaryPassword();
      expect(password).toHaveLength(PATIENT_TEMPORARY_PASSWORD_LENGTH);
      expect(password).toMatch(/^[A-Z]{8}$/);
    }
  });

  it("stores the credential under the temporary_password property", () => {
    expect(patientTemporaryPasswordDocument("ABCDEFGH")).toEqual({
      temporary_password: "ABCDEFGH",
    });
  });

  it("marks portal activity only after a real Firebase sign-in", () => {
    expect(hasPatientAccessedPortal(null)).toBe(false);
    expect(
      hasPatientAccessedPortal({
        metadata: { lastSignInTime: undefined },
      }),
    ).toBe(false);
    expect(
      hasPatientAccessedPortal({
        metadata: { lastSignInTime: "Wed, 12 Aug 2026 18:00:00 GMT" },
      }),
    ).toBe(true);
  });

  it.each([
    ["bootstrap admin", { role: "full_admin", isBootstrap: true }, true],
    ["full admin", { role: "full_admin", isBootstrap: false }, true],
    [
      "same institution admin",
      {
        role: "institution_admin",
        isBootstrap: false,
        institutionId: "INST-00001",
      },
      true,
    ],
    [
      "other institution admin",
      {
        role: "institution_admin",
        isBootstrap: false,
        institutionId: "INST-00002",
      },
      false,
    ],
    [
      "assigned doctor",
      {
        role: "institution_doctor",
        isBootstrap: false,
        institutionId: "INST-00001",
        doctorId: "DOC-00001",
      },
      true,
    ],
    [
      "unassigned doctor",
      {
        role: "institution_doctor",
        isBootstrap: false,
        institutionId: "INST-00001",
        doctorId: "DOC-00002",
      },
      false,
    ],
    [
      "institution operator",
      {
        role: "institution_operator",
        isBootstrap: false,
        institutionId: "INST-00001",
      },
      false,
    ],
  ] as const)("applies the credential scope for %s", (_label, context, expected) => {
    expect(canManagePatientPortalCredentials(context, patient)).toBe(expected);
  });

  it("creates a Firebase Auth account with the generated credential", async () => {
    const createdUser = user({ displayName: "Patient Name" });
    const auth = {
      getUserByEmail: jest.fn().mockRejectedValue(
        Object.assign(new Error("missing"), { code: "auth/user-not-found" }),
      ),
      createUser: jest.fn().mockResolvedValue(createdUser),
      updateUser: jest.fn(),
    } as unknown as Pick<Auth, "createUser" | "getUserByEmail" | "updateUser">;

    const result = await provisionPatientFirebaseAccount(auth, {
      email: "patient@example.com",
      displayName: "Patient Name",
      temporaryPassword: "ABCDEFGH",
    });

    expect(result).toEqual({ user: createdUser, created: true });
    expect(auth.createUser).toHaveBeenCalledWith({
      email: "patient@example.com",
      password: "ABCDEFGH",
      displayName: "Patient Name",
    });
  });

  it("sets the temporary password on an existing Firebase account", async () => {
    const existingUser = user();
    const updatedUser = user({ displayName: "Patient Name" });
    const auth = {
      getUserByEmail: jest.fn().mockResolvedValue(existingUser),
      createUser: jest.fn(),
      updateUser: jest.fn().mockResolvedValue(updatedUser),
    } as unknown as Pick<Auth, "createUser" | "getUserByEmail" | "updateUser">;

    const result = await provisionPatientFirebaseAccount(auth, {
      email: "patient@example.com",
      displayName: "Patient Name",
      temporaryPassword: "QWERTYUI",
    });

    expect(result).toEqual({ user: updatedUser, created: false });
    expect(auth.updateUser).toHaveBeenCalledWith("uid-1", {
      password: "QWERTYUI",
      disabled: false,
      displayName: "Patient Name",
    });
  });
});
