/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { InstitutionStaffRoleBrowser } from "@/components/areas/institution-staff-role-browser";
import type { RoleManagementRecord } from "@/lib/admin-areas";
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
});
