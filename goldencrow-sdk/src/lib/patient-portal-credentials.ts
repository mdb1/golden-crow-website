import { randomInt } from "node:crypto";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type { AdminContext, PatientRecord } from "../types/sdk.types.js";

const UPPERCASE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const PATIENT_TEMPORARY_PASSWORD_LENGTH = 8;

export function patientTemporaryPasswordDocument(temporaryPassword: string) {
  return { temporary_password: temporaryPassword };
}

type PatientPortalCredentialOwner = Pick<
  PatientRecord,
  "institutionId" | "doctorId"
>;

function firebaseAuthErrorCode(error: unknown) {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "";
}

export function canManagePatientPortalCredentials(
  context: Pick<
    AdminContext,
    "role" | "isBootstrap" | "institutionId" | "doctorId"
  >,
  patient: PatientPortalCredentialOwner,
) {
  if (context.isBootstrap || context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin") {
    return context.institutionId === patient.institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    context.institutionId === patient.institutionId &&
    context.doctorId === patient.doctorId
  );
}

export function generatePatientTemporaryPassword() {
  return Array.from(
    { length: PATIENT_TEMPORARY_PASSWORD_LENGTH },
    () => UPPERCASE_LETTERS[randomInt(UPPERCASE_LETTERS.length)],
  ).join("");
}

export async function provisionPatientFirebaseAccount(
  auth: Pick<Auth, "createUser" | "getUserByEmail" | "updateUser">,
  input: {
    email: string;
    displayName: string;
    temporaryPassword: string;
  },
): Promise<{ user: UserRecord; created: boolean }> {
  let existingUser: UserRecord | null = null;
  try {
    existingUser = await auth.getUserByEmail(input.email);
  } catch (error) {
    if (firebaseAuthErrorCode(error) !== "auth/user-not-found") {
      throw error;
    }
  }

  if (existingUser) {
    const user = await auth.updateUser(existingUser.uid, {
      password: input.temporaryPassword,
      disabled: false,
      ...(existingUser.displayName ? {} : { displayName: input.displayName }),
    });
    return { user, created: false };
  }

  try {
    const user = await auth.createUser({
      email: input.email,
      password: input.temporaryPassword,
      displayName: input.displayName,
    });
    return { user, created: true };
  } catch (error) {
    if (firebaseAuthErrorCode(error) !== "auth/email-already-exists") {
      throw error;
    }

    const racedUser = await auth.getUserByEmail(input.email);
    const user = await auth.updateUser(racedUser.uid, {
      password: input.temporaryPassword,
      disabled: false,
      ...(racedUser.displayName ? {} : { displayName: input.displayName }),
    });
    return { user, created: false };
  }
}
