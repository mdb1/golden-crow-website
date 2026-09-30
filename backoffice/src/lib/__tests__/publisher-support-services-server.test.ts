/** @jest-environment node */

import { getAdminContextServer } from "@/lib/admin-context-server";
import type { AdminContextRecord } from "@/lib/admin-areas";
import {
  getPublisherSupportServicesProvider,
  requirePublisherSupportServicesAccess,
} from "@/lib/publisher-support-services-server";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";
import { redirect } from "next/navigation";

jest.mock("@/lib/admin-context-server", () => ({
  getAdminContextServer: jest.fn(),
}));

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const organizationContext: AdminContextRecord = {
  email: "organization@example.org",
  uid: "organization-publisher-1",
  role: "organization_publisher",
  organizationId: "org-1",
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: true,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const individualContext: AdminContextRecord = {
  ...organizationContext,
  email: "individual@example.org",
  uid: "individual-publisher-1",
  role: "individual_publisher",
  organizationId: undefined,
  individualId: "ind-1",
};

describe("publisher support-services server scope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves an organization publisher to its organization provider", async () => {
    jest
      .mocked(getAdminContextServer)
      .mockResolvedValue(organizationContext);
    jest.mocked(sdkFetchServer).mockResolvedValue({
      organization: { id: "org-1", name: "Organization One" },
    });

    await expect(getPublisherSupportServicesProvider()).resolves.toEqual({
      adminContext: organizationContext,
      provider: {
        id: "org-1",
        name: "Organization One",
        kind: "organization",
      },
    });
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/discover/organizations/org-1",
    );
  });

  it("resolves an individual publisher to its individual provider", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue(individualContext);
    jest.mocked(sdkFetchServer).mockResolvedValue({
      individual: { id: "ind-1", name: "Professional One" },
    });

    await expect(getPublisherSupportServicesProvider()).resolves.toEqual({
      adminContext: individualContext,
      provider: {
        id: "ind-1",
        name: "Professional One",
        kind: "individual",
      },
    });
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/discover/individuals/ind-1",
    );
  });

  it("redirects a publisher that has no linked provider", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue({
      ...individualContext,
      individualId: " ",
    });

    await expect(requirePublisherSupportServicesAccess()).rejects.toThrow(
      `NEXT_REDIRECT:${PUBLISHER_PORTAL_HOME_ROUTE}`,
    );
    expect(redirect).toHaveBeenCalledWith(PUBLISHER_PORTAL_HOME_ROUTE);
    expect(sdkFetchServer).not.toHaveBeenCalled();
  });

  it("redirects when the linked provider cannot be loaded", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue(individualContext);
    jest.mocked(sdkFetchServer).mockRejectedValue(new Error("Not found"));

    await expect(getPublisherSupportServicesProvider()).rejects.toThrow(
      `NEXT_REDIRECT:${PUBLISHER_PORTAL_HOME_ROUTE}`,
    );
    expect(redirect).toHaveBeenCalledWith(PUBLISHER_PORTAL_HOME_ROUTE);
  });
});
