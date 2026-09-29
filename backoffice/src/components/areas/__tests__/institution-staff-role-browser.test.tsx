/** @jest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { InstitutionStaffRoleBrowser } from "@/components/areas/institution-staff-role-browser";
import type {
  AdminContextRecord,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const roles: RoleManagementRecord[] = [
  {
    email: "priority-driver@example.com",
    role: "transport_dispatcher",
    firebaseUid: "priority-driver-uid",
    isActive: true,
    canAccessPatientPortal: false,
    is_preferred_asignee: true,
    displayName: "Transportista Prioritario",
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
  {
    email: "standard-driver@example.com",
    role: "transport_dispatcher",
    firebaseUid: "standard-driver-uid",
    isActive: true,
    canAccessPatientPortal: false,
    is_preferred_asignee: false,
    displayName: "Transportista Standard",
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  },
];

const fullAdminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

function renderTransportDispatchersBrowser() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  (sdkFetch as jest.Mock).mockResolvedValue({ roles });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage="es">
        <InstitutionStaffRoleBrowser
          initialRoles={roles}
          role="transport_dispatcher"
          emptyLabel="No transport dispatchers match the current filter."
          searchPlaceholder="Search transport dispatchers by email, name, or notes..."
          resultLabel="transport dispatchers"
        />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("InstitutionStaffRoleBrowser transport dispatchers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a priority tag only for preferred transport dispatchers", () => {
    renderTransportDispatchersBrowser();

    expect(screen.getByText("priority-driver@example.com")).toBeTruthy();
    expect(screen.getByText("standard-driver@example.com")).toBeTruthy();
    expect(screen.getAllByText("Asignación prioritaria")).toHaveLength(1);
  });

  it("shows the role deletion action beside Open when explicitly enabled", () => {
    const operator: RoleManagementRecord = {
      email: "operator@example.com",
      role: "institution_operator",
      institutionId: "INST-00001",
      institutionName: "Central Clinic",
      isActive: true,
      canAccessPatientPortal: false,
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    (sdkFetch as jest.Mock).mockResolvedValue({ roles: [operator] });

    render(
      <QueryClientProvider client={queryClient}>
        <AppLanguageProvider initialLanguage="en">
          <AdminContextProvider value={fullAdminContext}>
            <InstitutionStaffRoleBrowser
              initialRoles={[operator]}
              role="institution_operator"
              emptyLabel="No administrative operators match the current filter."
              searchPlaceholder="Search administrative operators"
              resultLabel="administrative operators"
              showDeleteAction
            />
          </AdminContextProvider>
        </AppLanguageProvider>
      </QueryClientProvider>,
    );

    const row = screen
      .getByText("operator@example.com")
      .closest("[class*='grid-cols']");
    expect(row).toBeTruthy();
    const openAction = within(row as HTMLElement).getByRole("link", {
      name: /Open|Abrir/,
    });
    const deleteAction = within(row as HTMLElement).getByRole("button", {
      name: /Delete role|Eliminar rol/,
    });
    expect(openAction.parentElement).toBe(deleteAction.parentElement);
  });
});
