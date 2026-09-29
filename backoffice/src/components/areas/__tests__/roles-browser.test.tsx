/** @jest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { RolesBrowser } from "@/components/areas/roles-browser";
import type {
  AdminContextRecord,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const context: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const roles: RoleManagementRecord[] = [
  {
    email: "full-admin@example.com",
    role: "full_admin",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "god-mode@example.com",
    role: "institution_operator",
    institutionId: "INST-00001",
    isActive: true,
    canAccessPatientPortal: false,
    bootstrap: true,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  {
    email: "organization@example.com",
    role: "organization_publisher",
    organizationId: "ORG-00001",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "professional-publisher@example.com",
    role: "individual_publisher",
    individualId: "IND-00001",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "2pq-admin@example.com",
    role: "2pq_admin",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "doctor@example.com",
    role: "institution_doctor",
    institutionId: "INST-00001",
    doctorId: "DOC-00001",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "operator@example.com",
    role: "institution_operator",
    institutionId: "INST-00001",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "patient-enabled@example.com",
    role: "patient",
    institutionId: "INST-00001",
    doctorId: "DOC-00001",
    patientId: "PAT-00001",
    isActive: true,
    canAccessPatientPortal: true,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "patient-invitation-pending@example.com",
    role: "patient",
    institutionId: "INST-00001",
    doctorId: "DOC-00001",
    patientId: "PAT-00002",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "driver@example.com",
    role: "transport_dispatcher",
    firebaseUid: "driver-uid",
    isActive: true,
    canAccessPatientPortal: false,
    is_preferred_asignee: true,
    displayName: "Transportista Ejemplo",
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
];

function renderRolesBrowser(contextOverride?: Partial<AdminContextRecord>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  (sdkFetch as jest.Mock).mockResolvedValue({ roles });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage="en">
        <AdminContextProvider value={{ ...context, ...contextOverride }}>
          <RolesBrowser initialRoles={roles} />
        </AdminContextProvider>
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("RolesBrowser access surfaces", () => {
  it("never mixes patient roles into the backoffice list", () => {
    renderRolesBrowser();

    expect(screen.getByText("operator@example.com")).toBeTruthy();
    expect(screen.queryByText("patient-enabled@example.com")).toBeNull();
    expect(
      screen.queryByText("patient-invitation-pending@example.com"),
    ).toBeNull();
    expect(screen.queryByText("driver@example.com")).toBeNull();
  });

  it("shows only patient roles in the patient portal segment", async () => {
    const user = userEvent.setup();
    renderRolesBrowser();

    await user.click(screen.getByRole("tab", { name: /Patient portal/ }));

    expect(screen.queryByText("operator@example.com")).toBeNull();
    expect(screen.getByText("patient-enabled@example.com")).toBeTruthy();
    expect(
      screen.getByText("patient-invitation-pending@example.com"),
    ).toBeTruthy();
    expect(screen.getByText("Portal access")).toBeTruthy();
    expect(screen.getByText("No portal access")).toBeTruthy();
  });

  it("shows only transport dispatcher roles in the PGFlex dispatchers segment", async () => {
    const user = userEvent.setup();
    renderRolesBrowser();

    await user.click(screen.getByRole("tab", { name: /PGFlex Dispatchers/ }));

    expect(screen.queryByText("operator@example.com")).toBeNull();
    expect(screen.queryByText("patient-enabled@example.com")).toBeNull();
    expect(screen.getByText("driver@example.com")).toBeTruthy();
    expect(screen.getByText("PGFlex access")).toBeTruthy();
    expect(screen.getByText("Priority")).toBeTruthy();
    expect(screen.getByText("driver-uid")).toBeTruthy();
  });

  it("limits 2PQ admins to operational 2PQ role records", async () => {
    const user = userEvent.setup();
    renderRolesBrowser({
      email: "viewer-2pq@example.com",
      uid: "viewer-2pq-uid",
      role: "2pq_admin",
      isBootstrap: false,
    });

    expect(screen.getByText("2pq-admin@example.com")).toBeTruthy();
    expect(screen.getByText("doctor@example.com")).toBeTruthy();
    expect(screen.getByText("operator@example.com")).toBeTruthy();
    expect(screen.queryByText("full-admin@example.com")).toBeNull();
    expect(screen.queryByText("god-mode@example.com")).toBeNull();
    expect(screen.queryByText("organization@example.com")).toBeNull();
    expect(
      screen.queryByText("professional-publisher@example.com"),
    ).toBeNull();

    await user.click(screen.getByRole("tab", { name: /Patient portal/ }));
    expect(screen.getByText("patient-enabled@example.com")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /PGFlex Dispatchers/ }));
    expect(screen.getByText("driver@example.com")).toBeTruthy();
  });

  it("shows the trash action next to Open for full admins and 2PQ admins", () => {
    const { unmount } = renderRolesBrowser();
    const fullAdminRow = screen
      .getByText("operator@example.com")
      .closest("[class*='grid-cols']");

    expect(fullAdminRow).toBeTruthy();
    expect(
      within(fullAdminRow as HTMLElement).getByRole("link", { name: /Open/ }),
    ).toBeTruthy();
    expect(
      within(fullAdminRow as HTMLElement).getByRole("button", {
        name: "Delete role",
      }),
    ).toBeTruthy();

    unmount();
    renderRolesBrowser({
      email: "2pq-admin@example.com",
      uid: "2pq-admin-uid",
      role: "2pq_admin",
      isBootstrap: false,
    });
    const twoPQAdminRow = screen
      .getByText("operator@example.com")
      .closest("[class*='grid-cols']");

    expect(
      within(twoPQAdminRow as HTMLElement).getByRole("button", {
        name: "Delete role",
      }),
    ).toBeTruthy();
  });
});
