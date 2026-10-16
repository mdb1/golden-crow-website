import type { AdminRole, TwoPQFormType } from "../types/sdk.types.js";

export function canCreateTwoPQFormType(
  role: AdminRole,
  formType: TwoPQFormType,
) {
  if (role === "institution_laboratory_staff") {
    return formType === "sample";
  }

  return !(role === "institution_operator" && formType === "sample");
}

export function canArchiveTwoPQForms(role: AdminRole) {
  return (
    role === "full_admin" ||
    role === "2pq_admin" ||
    role === "institution_admin"
  );
}
