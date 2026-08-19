import type { AdminContext, PatientRecord } from "../types/sdk.types.js";

type ConsentOwner = Pick<
  PatientRecord,
  "id" | "institutionId" | "doctorId"
>;

export function canAccessInformedConsentPatient(
  context: Pick<
    AdminContext,
    "role" | "institutionId" | "doctorId" | "patientId"
  >,
  owner: ConsentOwner,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "patient") {
    return context.patientId === owner.id;
  }

  if (context.role === "institution_doctor") {
    return (
      context.institutionId === owner.institutionId &&
      context.doctorId === owner.doctorId
    );
  }

  return context.institutionId === owner.institutionId;
}
