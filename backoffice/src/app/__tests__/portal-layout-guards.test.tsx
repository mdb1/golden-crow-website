// Server layout guards for the three Pocket Genes surfaces (epic #451):
//   (dashboard)/layout.tsx            — backoffice + PGFlex
//   patient-portal/(portal)/layout.tsx
//   publisher-portal/(portal)/layout.tsx
//
// Each layout reads the next-auth session (accessSurface chosen at login) and
// the SDK admin context, then either renders or redirects. redirect() throws
// like Next's NEXT_REDIRECT so a guard that falls through is caught. UI
// components are stubbed — only the routing decision is under test.

import type { ReactElement } from "react";

class RedirectError extends Error {
  constructor(readonly href: string) {
    super(`NEXT_REDIRECT:${href}`);
  }
}

const mockGetServerSession = jest.fn();
const mockGetAdminContextServer = jest.fn();
const mockCookieGet = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((href: string) => {
    throw new RedirectError(href);
  }),
}));
jest.mock("next/headers", () => ({
  cookies: async () => ({ get: mockCookieGet }),
}));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/admin-context-server", () => ({
  getAdminContextServer: (...a: unknown[]) => mockGetAdminContextServer(...a),
}));

function stub(name: string) {
  const Component = ({ children }: { children?: unknown }) => children ?? null;
  Component.displayName = name;
  return Component;
}
jest.mock("@/components/ui/sidebar", () => ({
  SidebarInset: stub("SidebarInset"),
  SidebarProvider: stub("SidebarProvider"),
}));
jest.mock("@/components/app-sidebar", () => ({ AppSidebar: stub("AppSidebar") }));
jest.mock("@/components/app-header", () => ({ AppHeader: stub("AppHeader") }));
jest.mock("@/components/ambient-backdrop", () => ({ AmbientBackdrop: stub("AmbientBackdrop") }));
jest.mock("@/components/app-language-provider", () => ({
  AppLanguageProvider: stub("AppLanguageProvider"),
}));
jest.mock("@/components/pgflex-portal-header", () => ({ PGFlexPortalHeader: stub("PGFlexPortalHeader") }));
jest.mock("@/components/pgflex-portal-sidebar", () => ({ PGFlexPortalSidebar: stub("PGFlexPortalSidebar") }));
jest.mock("@/components/pgflex-route-guard", () => ({ PGFlexRouteGuard: stub("PGFlexRouteGuard") }));
jest.mock("@/components/publisher-route-guard", () => ({
  PublisherRouteGuard: stub("PublisherRouteGuard"),
}));
jest.mock("@/components/patient-portal-header", () => ({ PatientPortalHeader: stub("PatientPortalHeader") }));
jest.mock("@/components/patient-portal-sidebar", () => ({ PatientPortalSidebar: stub("PatientPortalSidebar") }));
jest.mock("@/components/publisher-portal-header", () => ({
  PublisherPortalHeader: stub("PublisherPortalHeader"),
}));
jest.mock("@/components/publisher-portal-sidebar", () => ({
  PublisherPortalSidebar: stub("PublisherPortalSidebar"),
}));
jest.mock("@/app/(dashboard)/providers", () => ({ Providers: stub("Providers") }));

import DashboardLayout from "@/app/(dashboard)/layout";
import PatientPortalLayout from "@/app/patient-portal/(portal)/layout";
import PublisherPortalLayout from "@/app/publisher-portal/(portal)/layout";

type Layout = (props: { children: React.ReactNode }) => Promise<ReactElement>;

async function outcome(layout: Layout) {
  try {
    const element = await layout({ children: "page" });
    return { redirect: null as string | null, element };
  } catch (error) {
    if (error instanceof RedirectError) return { redirect: error.href, element: null };
    throw error;
  }
}

function session(accessSurface?: string, project = "mydnamap") {
  return { user: { email: "a@example.com", project, accessSurface } };
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    email: "a@example.com",
    uid: "u1",
    role: "full_admin",
    isBootstrap: false,
    canAccessBackoffice: false,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: false,
    project: "mydnamap",
    projectAccess: ["mydnamap"],
    ...overrides,
  };
}

const BACKOFFICE = ctx({ canAccessBackoffice: true });
const PATIENT = ctx({ role: "patient", canAccessPatientPortal: true, patientId: "P1" });
const PGFLEX = ctx({ role: "transport_dispatcher", canAccessPGFlex: true });
const PUBLISHER = ctx({
  role: "organization_publisher",
  canAccessPublisherPortal: true,
  organizationId: "ORG-1",
});
const NOTHING = ctx({ role: "patient" });

/** Depth-first search for a stubbed component by displayName. */
function contains(node: unknown, name: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((n) => contains(n, name));
  const el = node as { type?: { displayName?: string }; props?: { children?: unknown } };
  if (el.type?.displayName === name) return true;
  return contains(el.props?.children, name);
}

beforeEach(() => {
  mockGetServerSession.mockReset();
  mockGetAdminContextServer.mockReset();
  mockCookieGet.mockReset();
});

describe("(dashboard) layout", () => {
  it("no session → /login, without touching the SDK", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(outcome(DashboardLayout)).resolves.toMatchObject({ redirect: "/login" });
    expect(mockGetAdminContextServer).not.toHaveBeenCalled();
  });

  it("patient-portal session is kept out of the dashboard", async () => {
    mockGetServerSession.mockResolvedValue(session("patient-portal"));
    mockGetAdminContextServer.mockResolvedValue(BACKOFFICE);
    await expect(outcome(DashboardLayout)).resolves.toMatchObject({
      redirect: "/patient-portal/consents",
    });
    expect(mockGetAdminContextServer).not.toHaveBeenCalled();
  });

  it("publisher-portal session is kept out of the dashboard", async () => {
    mockGetServerSession.mockResolvedValue(session("publisher-portal"));
    await expect(outcome(DashboardLayout)).resolves.toMatchObject({
      redirect: "/publisher-portal/home",
    });
  });

  it("SDK context failure → /access-denied", async () => {
    mockGetServerSession.mockResolvedValue(session("backoffice"));
    mockGetAdminContextServer.mockRejectedValue(new Error("401"));
    await expect(outcome(DashboardLayout)).resolves.toMatchObject({
      redirect: "/access-denied",
    });
  });

  it("passes the session project to the admin context", async () => {
    mockGetServerSession.mockResolvedValue(session("backoffice", "pocketgyms"));
    mockGetAdminContextServer.mockResolvedValue(BACKOFFICE);
    await outcome(DashboardLayout);
    expect(mockGetAdminContextServer).toHaveBeenCalledWith("pocketgyms");
  });

  it("backoffice session + backoffice context → renders the admin shell", async () => {
    mockGetServerSession.mockResolvedValue(session("backoffice"));
    mockGetAdminContextServer.mockResolvedValue(BACKOFFICE);
    const result = await outcome(DashboardLayout);
    expect(result.redirect).toBeNull();
    expect(contains(result.element, "AppSidebar")).toBe(true);
    expect(contains(result.element, "PublisherRouteGuard")).toBe(true);
    expect(contains(result.element, "PGFlexPortalSidebar")).toBe(false);
  });

  it("session without accessSurface is treated as backoffice", async () => {
    mockGetServerSession.mockResolvedValue(session(undefined));
    mockGetAdminContextServer.mockResolvedValue(BACKOFFICE);
    const result = await outcome(DashboardLayout);
    expect(result.redirect).toBeNull();
    expect(contains(result.element, "AppSidebar")).toBe(true);
  });

  it.each([
    ["patient-only context", PATIENT, "/patient-portal/consents"],
    ["PGFlex-only context", PGFLEX, "/pgflex/login"],
    ["publisher-only context", PUBLISHER, "/publisher-portal/home"],
    ["context with no surface", NOTHING, "/access-denied"],
  ])("backoffice session + %s → %s", async (_label, context, href) => {
    mockGetServerSession.mockResolvedValue(session("backoffice"));
    mockGetAdminContextServer.mockResolvedValue(context);
    await expect(outcome(DashboardLayout)).resolves.toMatchObject({ redirect: href });
  });

  it("pgflex session + PGFlex-only context → renders the PGFlex shell", async () => {
    mockGetServerSession.mockResolvedValue(session("pgflex"));
    mockGetAdminContextServer.mockResolvedValue(PGFLEX);
    const result = await outcome(DashboardLayout);
    expect(result.redirect).toBeNull();
    expect(contains(result.element, "PGFlexRouteGuard")).toBe(true);
    expect(contains(result.element, "AppSidebar")).toBe(false);
  });

  it.each([
    ["backoffice context", BACKOFFICE],
    ["PGFlex + backoffice", { ...PGFLEX, canAccessBackoffice: true }],
    ["PGFlex + patient", { ...PGFLEX, canAccessPatientPortal: true }],
    ["PGFlex + publisher", { ...PGFLEX, canAccessPublisherPortal: true }],
    ["patient context", PATIENT],
  ])("pgflex session + %s → /pgflex/login", async (_label, context) => {
    mockGetServerSession.mockResolvedValue(session("pgflex"));
    mockGetAdminContextServer.mockResolvedValue(context);
    await expect(outcome(DashboardLayout)).resolves.toMatchObject({
      redirect: "/pgflex/login",
    });
  });
});

describe("patient-portal layout", () => {
  it("no session → /patient-portal/login", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(outcome(PatientPortalLayout)).resolves.toMatchObject({
      redirect: "/patient-portal/login",
    });
  });

  it.each(["backoffice", "pgflex", "publisher-portal", undefined])(
    "%s session → /2pq-dashboard",
    async (surface) => {
      mockGetServerSession.mockResolvedValue(session(surface));
      await expect(outcome(PatientPortalLayout)).resolves.toMatchObject({
        redirect: "/2pq-dashboard",
      });
      expect(mockGetAdminContextServer).not.toHaveBeenCalled();
    },
  );

  it("SDK failure → /patient-portal/login", async () => {
    mockGetServerSession.mockResolvedValue(session("patient-portal"));
    mockGetAdminContextServer.mockRejectedValue(new Error("401"));
    await expect(outcome(PatientPortalLayout)).resolves.toMatchObject({
      redirect: "/patient-portal/login",
    });
  });

  it("patient session + patient context → renders", async () => {
    mockGetServerSession.mockResolvedValue(session("patient-portal"));
    mockGetAdminContextServer.mockResolvedValue(PATIENT);
    const result = await outcome(PatientPortalLayout);
    expect(result.redirect).toBeNull();
    expect(contains(result.element, "PatientPortalSidebar")).toBe(true);
  });

  it.each([
    ["backoffice-only", BACKOFFICE],
    ["patient + backoffice (staff who is also a patient)", { ...PATIENT, canAccessBackoffice: true }],
    ["no surface", NOTHING],
  ])("patient session + %s context → /patient-portal/login", async (_l, context) => {
    mockGetServerSession.mockResolvedValue(session("patient-portal"));
    mockGetAdminContextServer.mockResolvedValue(context);
    await expect(outcome(PatientPortalLayout)).resolves.toMatchObject({
      redirect: "/patient-portal/login",
    });
  });
});

describe("publisher-portal layout", () => {
  it("no session → /publisher-portal/login", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(outcome(PublisherPortalLayout)).resolves.toMatchObject({
      redirect: "/publisher-portal/login",
    });
  });

  it.each([
    ["patient-portal", "/patient-portal/consents"],
    ["pgflex", "/pgflex/logistics"],
    ["backoffice", "/2pq-dashboard"],
    [undefined, "/2pq-dashboard"],
  ])("%s session → %s", async (surface, href) => {
    mockGetServerSession.mockResolvedValue(session(surface));
    await expect(outcome(PublisherPortalLayout)).resolves.toMatchObject({ redirect: href });
    expect(mockGetAdminContextServer).not.toHaveBeenCalled();
  });

  it("SDK failure → /publisher-portal/login", async () => {
    mockGetServerSession.mockResolvedValue(session("publisher-portal"));
    mockGetAdminContextServer.mockRejectedValue(new Error("401"));
    await expect(outcome(PublisherPortalLayout)).resolves.toMatchObject({
      redirect: "/publisher-portal/login",
    });
  });

  it("publisher session + publisher-only context → renders", async () => {
    mockGetServerSession.mockResolvedValue(session("publisher-portal"));
    mockGetAdminContextServer.mockResolvedValue(PUBLISHER);
    const result = await outcome(PublisherPortalLayout);
    expect(result.redirect).toBeNull();
    expect(contains(result.element, "PublisherPortalSidebar")).toBe(true);
  });

  it.each([
    ["backoffice", BACKOFFICE],
    ["publisher + backoffice", { ...PUBLISHER, canAccessBackoffice: true }],
    ["publisher + patient", { ...PUBLISHER, canAccessPatientPortal: true }],
    ["publisher + PGFlex", { ...PUBLISHER, canAccessPGFlex: true }],
    ["patient", PATIENT],
  ])("publisher session + %s context → /publisher-portal/login", async (_l, context) => {
    mockGetServerSession.mockResolvedValue(session("publisher-portal"));
    mockGetAdminContextServer.mockResolvedValue(context);
    await expect(outcome(PublisherPortalLayout)).resolves.toMatchObject({
      redirect: "/publisher-portal/login",
    });
  });
});
