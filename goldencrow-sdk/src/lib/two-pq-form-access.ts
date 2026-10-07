import type { AdminRole, TwoPQFormType } from "../types/sdk.types.js";

export function canCreateTwoPQFormType(
  role: AdminRole,
  formType: TwoPQFormType,
) {
  return !(role === "institution_operator" && formType === "sample");
}
