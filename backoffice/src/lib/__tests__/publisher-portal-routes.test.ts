import {
  normalizePublisherPortalCallbackUrl,
  publisherPortalPostLoginRoute,
  PUBLISHER_PORTAL_APP_ACCEPT_TERMS_ROUTE,
  PUBLISHER_PORTAL_APP_NEW_ROUTE,
  PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE,
} from "@/lib/publisher-portal-routes";
import PublisherAppAcceptTermsPage from "@/app/publisher-portal/(portal)/app/accept-terms-and-conditions/page";
import { redirect } from "next/navigation";

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

describe("publisher email destinations", () => {
  it.each([
    PUBLISHER_PORTAL_APP_NEW_ROUTE,
    PUBLISHER_PORTAL_APP_ACCEPT_TERMS_ROUTE,
  ])("continues a completed publisher login to %s", (destination) => {
    expect(publisherPortalPostLoginRoute(destination)).toBe(destination);
  });

  it.each([
    PUBLISHER_PORTAL_APP_NEW_ROUTE,
    PUBLISHER_PORTAL_APP_ACCEPT_TERMS_ROUTE,
  ])("preserves %s through first-time login setup", (destination) => {
    const setup = publisherPortalPostLoginRoute(destination, true);
    const url = new URL(setup, "https://backoffice.example");
    expect(url.pathname).toBe("/publisher-portal/complete-profile");
    expect(
      publisherPortalPostLoginRoute(url.searchParams.get("callbackUrl")),
    ).toBe(destination);
  });

  it.each([
    undefined,
    null,
    "",
    "https://example.com/outside",
    "//example.com/outside",
    "/login",
    "/gc-fitness/login",
    "/publisher-portal/login?callbackUrl=/publisher-portal/app/new",
    "/publisher-portal/login/",
    "/publisher-portal/complete-profile#callback",
    "/publisher-portal/%2e%2e/login",
    "/publisher-portal/app\\outside",
    "/publisher-portal/\napp/new",
  ])("uses safe portal defaults for %s", (callback) => {
    expect(publisherPortalPostLoginRoute(callback)).toBe(
      "/publisher-portal/home",
    );
    expect(publisherPortalPostLoginRoute(callback, true)).toBe(
      "/publisher-portal/complete-profile",
    );
  });

  it("keeps an authorized internal deep link and normalizes portal home", () => {
    expect(
      normalizePublisherPortalCallbackUrl(
        "/publisher-portal/discover/organizations/org_1?tab=details",
      ),
    ).toBe("/publisher-portal/discover/organizations/org_1?tab=details");
    expect(
      normalizePublisherPortalCallbackUrl("/publisher-portal/home?from=email"),
    ).toBe("/publisher-portal/home");
  });

  it("opens the existing guarded terms flow from the email alias without changing its URL", () => {
    expect(() => PublisherAppAcceptTermsPage()).toThrow(
      `NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE}`,
    );
    expect(redirect).toHaveBeenCalledWith(
      PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE,
    );
    expect(PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE).toBe(
      "/publisher-portal/app/sign-terms-and-conditions",
    );
  });
});
