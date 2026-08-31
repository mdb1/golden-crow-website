export const PGFLEX_ENTRY_ROUTE = "/pgflex/logistics";
export const PGFLEX_HOME_ROUTE = "/pgflex/home";
export const PGFLEX_LOGIN_ROUTE = "/pgflex/login";
export const PGFLEX_ACCOUNT_ROUTE = "/pgflex/my-account";

export function normalizePGFlexCallbackUrl(
  callbackUrl: string | null | undefined,
) {
  if (!callbackUrl) return undefined;
  if (callbackUrl.startsWith("//") || callbackUrl.includes("\\")) {
    return undefined;
  }
  if (callbackUrl !== "/pgflex" && !callbackUrl.startsWith("/pgflex/")) {
    return undefined;
  }
  if (
    callbackUrl === PGFLEX_LOGIN_ROUTE ||
    callbackUrl.startsWith(`${PGFLEX_LOGIN_ROUTE}?`) ||
    callbackUrl === "/pgflex/complete-profile" ||
    callbackUrl.startsWith("/pgflex/complete-profile?")
  ) {
    return undefined;
  }
  if (
    callbackUrl === "/pgflex" ||
    callbackUrl === "/pgflex/" ||
    callbackUrl === PGFLEX_HOME_ROUTE ||
    callbackUrl.startsWith(`${PGFLEX_HOME_ROUTE}?`)
  ) {
    return PGFLEX_ENTRY_ROUTE;
  }

  return callbackUrl;
}
