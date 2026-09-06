export const PUBLISHER_PORTAL_ENTRY_ROUTE = "/publisher-portal/home";
export const PUBLISHER_PORTAL_HOME_ROUTE = "/publisher-portal/home";
export const PUBLISHER_PORTAL_LOGIN_ROUTE = "/publisher-portal/login";
export const PUBLISHER_PORTAL_ACCOUNT_ROUTE = "/publisher-portal/my-account";

export function normalizePublisherPortalCallbackUrl(
  callbackUrl: string | null | undefined,
) {
  if (!callbackUrl) return undefined;
  if (callbackUrl.startsWith("//") || callbackUrl.includes("\\")) {
    return undefined;
  }
  if (
    callbackUrl !== "/publisher-portal" &&
    !callbackUrl.startsWith("/publisher-portal/")
  ) {
    return undefined;
  }
  if (
    callbackUrl === PUBLISHER_PORTAL_LOGIN_ROUTE ||
    callbackUrl.startsWith(`${PUBLISHER_PORTAL_LOGIN_ROUTE}?`) ||
    callbackUrl === "/publisher-portal/complete-profile" ||
    callbackUrl.startsWith("/publisher-portal/complete-profile?")
  ) {
    return undefined;
  }
  if (
    callbackUrl === "/publisher-portal" ||
    callbackUrl === "/publisher-portal/" ||
    callbackUrl === PUBLISHER_PORTAL_HOME_ROUTE ||
    callbackUrl.startsWith(`${PUBLISHER_PORTAL_HOME_ROUTE}?`)
  ) {
    return PUBLISHER_PORTAL_ENTRY_ROUTE;
  }

  return callbackUrl;
}
