/** @jest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import PublisherPortalHomePage from "@/app/publisher-portal/(portal)/home/page";
import type { MyAccountRecord } from "@/lib/admin-areas";
import {
  PUBLISHER_PORTAL_ACCOUNT_ROUTE,
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_APP_NEW_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE,
  PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE,
  publisherPortalFeedEntriesByStatusRoute,
  publisherPortalFeedEntryCreateRoute,
  publisherPortalIndividualDetailRoute,
  publisherPortalOrganizationDetailRoute,
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
  hasPublisherAppConfig = false,
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

    if (path === "/discover/organizations/org-1") {
      return {
        organization: {
          id: "org-1",
          name: "Pocket Genes Lab",
          colorHex: "#123ABC",
        },
      };
    }

    if (path === "/discover/individuals/ind-1") {
      return {
        individual: {
          id: "ind-1",
          name: "Pocket Genes Lab",
          colorHex: "#123ABC",
        },
      };
    }

    if (path === "/publisher-app/config") {
      return {
        config: hasPublisherAppConfig
          ? {
              id: "organization_org-1",
              publisherKind: "organization",
              publisherId: "org-1",
              publisherName: "Pocket Genes Lab",
              publisherEmail: "publisher@example.org",
              publisherUsername: "pocketgenes",
              platformOption: "ios_android",
              connectEnabled: true,
              profileEnabled: true,
              learnCustomizationEnabled: true,
              colors: {
                primary: "#123ABC",
                secondary: "#456DEF",
                tertiary: "#FEDCBA",
              },
              schemaVersion: 1,
              createdAt: "2026-10-30T12:00:00.000Z",
              updatedAt: "2026-10-30T12:00:00.000Z",
              createdByUserId: "publisher-1",
              updatedByUserId: "publisher-1",
            }
          : null,
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
    const dashboard = screen.getByTestId("publisher-home-dashboard");
    const appSection = screen.getByTestId("publisher-home-app");
    const userSection = screen.getByTestId("publisher-home-user");
    expect(dashboard.parentElement?.firstElementChild).toBe(dashboard);
    expect(
      dashboard.compareDocumentPosition(appSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      appSection.compareDocumentPosition(userSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      dashboard.compareDocumentPosition(userSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      screen.getByRole("heading", { level: 2, name: "Mi app" }),
    ).toBeTruthy();
    expect(screen.getByTestId("publisher-app-banner").textContent).toContain(
      "Pocket Genes Lab",
    );
    expect(screen.getByText("99.99")).toBeTruthy();
    expect(screen.getByText("59.99")).toBeTruthy();
    expect(screen.getByTestId("publisher-app-banner").dataset.accent).toBe(
      "#123ABC",
    );
    expect(
      screen
        .getByRole("link", { name: "Configurar Mi app" })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_APP_NEW_ROUTE);
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/discover/organizations/org-1",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Mi cuenta" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Abrir Mi cuenta" }).getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_ACCOUNT_ROUTE);
    expect(screen.getByText("Empezá a construir tu presencia")).toBeTruthy();
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
        .getByRole("link", { name: /Abrir perfil/i })
        .getAttribute("href"),
    ).toBe(publisherPortalOrganizationDetailRoute("org-1"));
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
    expect(
      screen
        .getByRole("link", { name: /Abrir solicitudes/i })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE);
    expect(screen.queryByText("Ver mis borradores")).toBeNull();
  });

  it("opens the app editor when the publisher already has a configuration", async () => {
    mockPublisherHomeData(false, false, account, false, false, true);

    render(await PublisherPortalHomePage());

    expect(
      screen
        .getByRole("link", { name: "Editar la configuración de Mi app" })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
    expect(screen.getByTestId("publisher-app-banner-link")).toContainElement(
      screen.getByTestId("publisher-app-banner"),
    );
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
    expect(
      screen
        .getByRole("heading", { name: "Personalizar mi perfil" })
        .closest("article")
        ?.className,
    ).toContain("border-violet-200/80");
    expect(
      screen.getByRole("link", { name: /Abrir perfil/i }).className,
    ).toContain("bg-violet-600");
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
    expect(
      screen
        .getByRole("link", { name: /Abrir solicitudes/i })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE);
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

  it("renders the same home cards for organization and individual publishers", async () => {
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

    mockPublisherHomeData(true, false, account, true);
    render(await PublisherPortalHomePage());

    const organizationCardTitles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    const organizationCardClasses = screen
      .getAllByRole("article")
      .map((article) => article.className);
    cleanup();

    jest.mocked(sdkFetchServer).mockReset();
    mockPublisherHomeData(true, false, individualAccount, true);

    render(await PublisherPortalHomePage());

    expect(
      screen
        .getByRole("link", { name: /Abrir perfil/i })
        .getAttribute("href"),
    ).toBe(publisherPortalIndividualDetailRoute("ind-1"));
    expect(
      screen
        .getByRole("link", { name: /Abrir ofertas/i })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE);
    expect(
      screen
        .getByRole("link", { name: /Abrir solicitudes/i })
        .getAttribute("href"),
    ).toBe(PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(organizationCardTitles);
    expect(
      screen.getAllByRole("article").map((article) => article.className),
    ).toEqual(organizationCardClasses);
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/admin/support-services/offers?limit=1",
    );
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/admin/support-services/offers?limit=1&status=active",
    );
  });
});
