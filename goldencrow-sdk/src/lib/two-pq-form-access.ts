import type { AdminRole, TwoPQFormType } from "../types/sdk.types.js";

export function canCreateTwoPQFormType(
  _role: AdminRole,
  _formType: TwoPQFormType,
) {
  return true;
}

export function canArchiveTwoPQForms(role: AdminRole) {
  return (
    role === "full_admin" ||
    role === "2pq_admin" ||
    role === "institution_admin"
  );
}
