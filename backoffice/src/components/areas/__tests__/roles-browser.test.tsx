/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
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
    displayName: "Transportista Ejemplo",
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
];

function renderRolesBrowser() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  (sdkFetch as jest.Mock).mockResolvedValue({ roles });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage="en">
        <AdminContextProvider value={context}>
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
    expect(screen.getByText("driver-uid")).toBeTruthy();
  });
});
