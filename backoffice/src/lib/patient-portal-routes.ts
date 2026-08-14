export const PATIENT_PORTAL_ENTRY_ROUTE = "/patient-portal/consents";
export const PATIENT_PORTAL_HOME_ROUTE = "/patient-portal/home";
export const PATIENT_PORTAL_LOGIN_ROUTE = "/patient-portal/login";

export function normalizePatientPortalCallbackUrl(
  callbackUrl: string | null | undefined,
) {
  if (!callbackUrl) return undefined;
  if (callbackUrl.startsWith("//") || callbackUrl.includes("\\")) {
    return undefined;
  }
  if (
    callbackUrl !== "/patient-portal" &&
    !callbackUrl.startsWith("/patient-portal/")
  ) {
    return undefined;
  }
  if (
    callbackUrl === PATIENT_PORTAL_LOGIN_ROUTE ||
    callbackUrl.startsWith(`${PATIENT_PORTAL_LOGIN_ROUTE}?`)
  ) {
    return undefined;
  }
  if (
    callbackUrl === "/patient-portal" ||
    callbackUrl === "/patient-portal/" ||
    callbackUrl === PATIENT_PORTAL_HOME_ROUTE ||
    callbackUrl.startsWith(`${PATIENT_PORTAL_HOME_ROUTE}?`)
  ) {
    return PATIENT_PORTAL_ENTRY_ROUTE;
  }

  return callbackUrl;
}
