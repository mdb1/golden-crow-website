/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import PublisherPortalHomePage from "@/app/publisher-portal/(portal)/home/page";
import type { MyAccountRecord } from "@/lib/admin-areas";
import {
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  publisherPortalFeedEntryCreateRoute,
  publisherPortalOrganizationDetailRoute,
  publisherPortalOrganizationProductCatalogRoute,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

const account = {
  context: {
    email: "publisher@example.org",
    uid: "publisher-1",
    role: "organization_publisher",
    organizationId: "org-1",
    isBootstrap: false,
    canAccessBackoffice: false,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: true,
    project: "mydnamap",
    projectAccess: ["mydnamap"],
  },
  role: {
    email: "publisher@example.org",
    role: "organization_publisher",
    displayName: "Pocket Genes Lab",
  },
  capabilities: [],
  auth: {
    uid: "publisher-1",
    email: "publisher@example.org",
    emailVerified: true,
    disabled: false,
    customClaims: {},
    providerData: [],
    metadata: {},
  },
  profile: null,
} as unknown as MyAccountRecord;

function mockPublisherHomeData(
  hasPublishedFeedEntry: boolean,
  accountOverride: MyAccountRecord = account,
) {
  jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
    if (path === "/auth/my-account") {
      return { account: accountOverride };
    }

    if (path === "/discover/feed-items?limit=1&status=published") {
      return {
        feedItems: hasPublishedFeedEntry ? [{ id: "feed-1" }] : [],
        nextCursor: null,
      };
    }

    throw new Error(`Unexpected SDK path ${path}`);
  });
}

describe("PublisherPortalHomePage", () => {
  beforeEach(() => {
    jest.mocked(sdkFetchServer).mockReset();
  });

  it("prompts a new publisher to create the first feed entry", async () => {
    mockPublisherHomeData(false);

    render(await PublisherPortalHomePage());

    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/discover/feed-items?limit=1&status=published",
    );
    expect(screen.getByText("Empezá con una primera nota")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Crear mi primera entrada/i })
        .getAttribute("href"),
    ).toBe(publisherPortalFeedEntryCreateRoute());
    expect(
      (
        screen.getByRole("button", {
          name: "Disponible después de publicar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: /Abrir organización/i })
        .getAttribute("href"),
    ).toBe(publisherPortalOrganizationDetailRoute("org-1"));
    expect(
      screen
        .getByRole("link", { name: /Abrir catálogo/i })
        .getAttribute("href"),
    ).toBe(publisherPortalOrganizationProductCatalogRoute("org-1"));
  });

  it("enables both quick accesses once the publisher has a published entry", async () => {
    mockPublisherHomeData(true);

    render(await PublisherPortalHomePage());

    expect(
      screen
        .getByRole("link", { name: /Abrir mis notas/i })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE);
    expect(
      screen
        .getByRole("link", { name: /Crear nueva entrada/i })
        .getAttribute("href"),
    ).toBe(publisherPortalFeedEntryCreateRoute());
    expect(
      screen.queryByRole("button", {
        name: "Disponible después de publicar",
      }),
    ).toBeNull();
    expect(screen.getByText("Personalizar mi organización")).toBeTruthy();
    expect(screen.getByText("Acceder al catálogo")).toBeTruthy();
  });

  it("does not show organization quick accesses to individual publishers", async () => {
    const individualAccount = {
      ...account,
      context: {
        ...account.context,
        role: "individual_publisher",
        organizationId: undefined,
        individualId: "ind-1",
      },
      role: {
        ...account.role,
        role: "individual_publisher",
      },
    } as unknown as MyAccountRecord;
    mockPublisherHomeData(true, individualAccount);

    render(await PublisherPortalHomePage());

    expect(screen.queryByText("Personalizar mi organización")).toBeNull();
    expect(screen.queryByText("Acceder al catálogo")).toBeNull();
  });
});
