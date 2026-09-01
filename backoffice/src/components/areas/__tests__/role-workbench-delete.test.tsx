/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { RoleWorkbench } from "@/components/areas/role-workbench";
import type {
  AdminContextRecord,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
}));

const godModeContext: AdminContextRecord = {
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

const dispatcherRole: RoleManagementRecord = {
  email: "driver@example.com",
  role: "transport_dispatcher",
  firebaseUid: "driver-uid",
  isActive: true,
  canAccessPatientPortal: false,
  displayName: "Transportista Ejemplo",
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
};

function renderRoleWorkbench(
  contextOverride?: Partial<AdminContextRecord>,
  roleOverride?: Partial<RoleManagementRecord>,
) {
  return render(
    <AppLanguageProvider initialLanguage="en">
      <AdminContextProvider value={{ ...godModeContext, ...contextOverride }}>
        <RoleWorkbench
          roleRecord={{ ...dispatcherRole, ...roleOverride }}
          institutions={[]}
          doctors={[]}
          patients={[]}
        />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("RoleWorkbench destructive user deletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lets god mode delete a role user from the detail screen", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({
      deleted: true,
      roleDeleted: true,
      authDeleted: true,
    });

    renderRoleWorkbench();

    await user.click(screen.getByRole("button", { name: "Delete user" }));
    const confirmButtons = await screen.findAllByRole("button", {
      name: "Delete user",
    });
    await user.click(confirmButtons.at(-1)!);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/roles/driver%40example.com", {
        method: "DELETE",
      });
    });
    expect(mockPush).toHaveBeenCalledWith("/roles");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("does not expose the delete action to normal full admins", () => {
    renderRoleWorkbench({ isBootstrap: false });

    expect(screen.queryByRole("button", { name: "Delete user" })).toBeNull();
  });

  it("does not expose the delete action for bootstrap records", () => {
    renderRoleWorkbench(undefined, { bootstrap: true });

    expect(screen.queryByRole("button", { name: "Delete user" })).toBeNull();
  });
});

describe("RoleWorkbench transport dispatcher metadata", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("saves the preferred assignment checkbox for transport dispatchers", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({ role: dispatcherRole });

    renderRoleWorkbench();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Assign shipments by default",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/roles/driver%40example.com",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const request = (sdkFetch as jest.Mock).mock.calls[0][1] as {
      body: string;
    };
    expect(JSON.parse(request.body)).toEqual(
      expect.objectContaining({
        role: "transport_dispatcher",
        is_preferred_asignee: true,
      }),
    );
  });
});
