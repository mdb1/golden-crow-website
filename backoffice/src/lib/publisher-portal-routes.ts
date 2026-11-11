export const PUBLISHER_PORTAL_ENTRY_ROUTE = "/publisher-portal/home";
export const PUBLISHER_PORTAL_HOME_ROUTE = "/publisher-portal/home";
export const PUBLISHER_PORTAL_LOGIN_ROUTE = "/publisher-portal/login";
export const PUBLISHER_PORTAL_ACCOUNT_ROUTE = "/publisher-portal/my-account";
export const PUBLISHER_PORTAL_APP_ROUTE = "/publisher-portal/app";
export const PUBLISHER_PORTAL_APP_NEW_ROUTE = `${PUBLISHER_PORTAL_APP_ROUTE}/new`;
export const PUBLISHER_PORTAL_APP_EDIT_ROUTE = `${PUBLISHER_PORTAL_APP_ROUTE}/edit`;
export const PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE = `${PUBLISHER_PORTAL_APP_ROUTE}/sign-terms-and-conditions`;
export const PUBLISHER_PORTAL_APP_ACCEPT_TERMS_ROUTE = `${PUBLISHER_PORTAL_APP_ROUTE}/accept-terms-and-conditions`;
export const PUBLISHER_PORTAL_APP_PAYMENT_DETAILS_ROUTE = `${PUBLISHER_PORTAL_APP_ROUTE}/payment-details`;
export const PUBLISHER_PORTAL_APP_UPLOAD_BUILD_DETAILS_ROUTE = `${PUBLISHER_PORTAL_APP_ROUTE}/upload-build-details`;
export const PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE =
  "/publisher-portal/service-offers";
export const PUBLISHER_PORTAL_SERVICE_OFFER_WIZARD_ROUTE = `${PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE}/wizard/new`;
export const PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE =
  "/publisher-portal/service-transactions";
export const PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE =
  "/publisher-portal/discover/organizations";
export const PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE =
  "/publisher-portal/discover/individuals";
export const PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE =
  "/publisher-portal/discover/feed-entries";

export function publisherPortalFeedEntriesByStatusRoute(status: string) {
  return `${PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE}?status=${encodeURIComponent(
    status,
  )}`;
}

export function publisherPortalAppRoute(hasConfig: boolean) {
  return hasConfig
    ? PUBLISHER_PORTAL_APP_EDIT_ROUTE
    : PUBLISHER_PORTAL_APP_NEW_ROUTE;
}

export function publisherPortalOrganizationDetailRoute(organizationId: string) {
  return `${PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE}/${encodeURIComponent(organizationId)}`;
}

export function publisherPortalOrganizationProductCatalogRoute(
  organizationId: string,
) {
  return `${publisherPortalOrganizationDetailRoute(organizationId)}/product-catalog`;
}

export function publisherPortalIndividualDetailRoute(individualId: string) {
  return `${PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE}/${encodeURIComponent(individualId)}`;
}

export function publisherPortalFeedEntryCreateRoute() {
  return `${PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE}/new`;
}

export function publisherPortalServiceOfferDetailRoute(offerId: string) {
  return `${PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE}/${encodeURIComponent(offerId)}`;
}

export function publisherPortalServiceOfferCreateRoute() {
  return PUBLISHER_PORTAL_SERVICE_OFFER_WIZARD_ROUTE;
}

export function publisherPortalServiceTransactionDetailRoute(
  transactionId: string,
) {
  return `${PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE}/${encodeURIComponent(transactionId)}`;
}

export function publisherPortalServiceTransactionsByServiceIdRoute(
  serviceId: string,
) {
  const normalizedServiceId = serviceId.trim();
  return normalizedServiceId
    ? `${PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE}?serviceId=${encodeURIComponent(normalizedServiceId)}`
    : PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE;
}

export function normalizePublisherPortalCallbackUrl(
  callbackUrl: string | null | undefined,
) {
  if (!callbackUrl) return undefined;
  if (callbackUrl.startsWith("//") || /[\\\t\n\r]/.test(callbackUrl)) {
    return undefined;
  }
  if (
    callbackUrl !== "/publisher-portal" &&
    !callbackUrl.startsWith("/publisher-portal/")
  ) {
    return undefined;
  }
  const path = new URL(callbackUrl, "https://publisher-portal.invalid")
    .pathname;
  const normalizedPath = path.replace(/\/+$/, "");
  if (
    (path !== "/publisher-portal" && !path.startsWith("/publisher-portal/")) ||
    normalizedPath === PUBLISHER_PORTAL_LOGIN_ROUTE ||
    normalizedPath === "/publisher-portal/complete-profile"
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

export function publisherPortalPostLoginRoute(
  callbackUrl: string | null | undefined,
  needsProfileCompletion = false,
) {
  const callback = normalizePublisherPortalCallbackUrl(callbackUrl);
  if (needsProfileCompletion) {
    return `/publisher-portal/complete-profile${callback ? `?callbackUrl=${encodeURIComponent(callback)}` : ""}`;
  }
  return callback ?? PUBLISHER_PORTAL_ENTRY_ROUTE;
}
