/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import PublisherPortalHomePage from "@/app/publisher-portal/(portal)/home/page";
import type { MyAccountRecord } from "@/lib/admin-areas";
import {
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE,
  publisherPortalFeedEntriesByStatusRoute,
  publisherPortalFeedEntryCreateRoute,
  publisherPortalOrganizationDetailRoute,
  publisherPortalOrganizationProductCatalogRoute,
  publisherPortalServiceOfferCreateRoute,
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
  hasDraftFeedEntry = false,
  accountOverride: MyAccountRecord = account,
  hasActiveServiceOffer = false,
  hasServiceOffer = hasActiveServiceOffer,
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

    if (path === "/discover/feed-items?limit=1&status=draft") {
      return {
        feedItems: hasDraftFeedEntry ? [{ id: "draft-1" }] : [],
        nextCursor: null,
      };
    }

    if (path === "/admin/support-services/offers?limit=1&status=active") {
      return {
        offers: hasActiveServiceOffer ? [{ id: "offer-1" }] : [],
        nextCursor: null,
      };
    }

    if (path === "/admin/support-services/offers?limit=1") {
      return {
        offers: hasServiceOffer ? [{ id: "offer-1" }] : [],
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

  it("routes service-offer creation through the guided wizard", () => {
    expect(publisherPortalServiceOfferCreateRoute()).toBe(
      "/publisher-portal/service-offers/wizard/new",
    );
  });

  it("prompts a new publisher to create the first feed entry", async () => {
    mockPublisherHomeData(false);

    render(await PublisherPortalHomePage());

    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/discover/feed-items?limit=1&status=published",
    );
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/discover/feed-items?limit=1&status=draft",
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
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/admin/support-services/offers?limit=1",
    );
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/admin/support-services/offers?limit=1&status=active",
    );
    expect(
      screen
        .getByRole("link", { name: /Crear mi primera oferta/i })
        .getAttribute("href"),
    ).toBe(publisherPortalServiceOfferCreateRoute());
    expect(
      screen.getByRole("heading", {
        name: "Crear tu primera oferta de servicio",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("heading", {
          name: "Crear tu primera oferta de servicio",
        })
        .closest("article")
        ?.className,
    ).toContain("border-violet-200/80");
    expect(
      (
        screen.getByRole("button", {
          name: "Disponible después de publicar la oferta",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByText("Solicitudes de servicio")).toBeNull();
    expect(screen.queryByText("Ver mis borradores")).toBeNull();
  });

  it("shows view and create actions once the publisher has an active service offer", async () => {
    mockPublisherHomeData(true, false, account, true);

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
    expect(screen.queryByText("Ver mis borradores")).toBeNull();
    expect(screen.getByText("Personalizar mi organización")).toBeTruthy();
    expect(screen.getByText("Acceder al catálogo")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Abrir ofertas/i })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE);
    expect(
      screen.getByRole("heading", { name: "Ver ofertas de servicio" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "Ver ofertas de servicio" })
        .closest("article")
        ?.className,
    ).toContain("border-violet-200/80");
    expect(
      screen
        .getByRole("link", { name: /Crear nueva oferta/i })
        .getAttribute("href"),
    ).toBe(publisherPortalServiceOfferCreateRoute());
    const quickAccessTitles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(quickAccessTitles.indexOf("Ofrecer un nuevo servicio")).toBeLessThan(
      quickAccessTitles.indexOf("Crear una nueva entrada"),
    );
    expect(
      quickAccessTitles.indexOf("Ver mis notas publicadas"),
    ).toBeGreaterThan(quickAccessTitles.indexOf("Ver ofertas de servicio"));
    expect(screen.queryByText("Solicitudes de servicio")).toBeNull();
  });

  it("offers another creation flow when a non-active service offer already exists", async () => {
    mockPublisherHomeData(false, false, account, false, true);

    render(await PublisherPortalHomePage());

    expect(
      screen.getByRole("heading", { name: "Ofrecer un nuevo servicio" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Crear tu primera oferta de servicio",
      }),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /Crear nueva oferta/i })
        .getAttribute("href"),
    ).toBe(publisherPortalServiceOfferCreateRoute());
    expect(
      (
        screen.getByRole("button", {
          name: "Disponible después de publicar la oferta",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows a draft shortcut before published notes when draft entries exist", async () => {
    mockPublisherHomeData(true, true);

    render(await PublisherPortalHomePage());

    const draftLink = screen.getByRole("link", { name: /Abrir borradores/i });
    expect(draftLink.getAttribute("href")).toBe(
      publisherPortalFeedEntriesByStatusRoute("draft"),
    );

    const quickAccessTitles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(quickAccessTitles.indexOf("Ver mis borradores")).toBeLessThan(
      quickAccessTitles.indexOf("Ver mis notas publicadas"),
    );
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
    mockPublisherHomeData(true, false, individualAccount);

    render(await PublisherPortalHomePage());

    expect(screen.queryByText("Personalizar mi organización")).toBeNull();
    expect(screen.queryByText("Acceder al catálogo")).toBeNull();
    expect(screen.queryByText("Ver ofertas de servicio")).toBeNull();
    expect(
      screen.queryByText("Crear tu primera oferta de servicio"),
    ).toBeNull();
    expect(sdkFetchServer).not.toHaveBeenCalledWith(
      "/admin/support-services/offers?limit=1",
    );
    expect(sdkFetchServer).not.toHaveBeenCalledWith(
      "/admin/support-services/offers?limit=1&status=active",
    );
  });
});
