/** @jest-environment node */

import TwoPQDashboardPage from "@/app/(dashboard)/2pq-dashboard/page";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type {
  AdminContextRecord,
  AdminRole,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getTwoPQFormDraft } from "@/lib/two-pq-server";

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: jest.fn(() => undefined) })),
}));

jest.mock("@/lib/admin-context-server", () => ({
  getAdminContextServer: jest.fn(),
}));

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

jest.mock("@/lib/two-pq-server", () => ({
  getTwoPQFormDraft: jest.fn(),
}));

const adminContext: AdminContextRecord = {
  email: "viewer-2pq@example.com",
  uid: "viewer-2pq-uid",
  role: "2pq_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

function roleRecord(
  email: string,
  role: AdminRole,
  bootstrap = false,
): RoleManagementRecord {
  return {
    email,
    role,
    bootstrap,
    isActive: true,
    canAccessPatientPortal: role === "patient",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
}

describe("2PQ dashboard role metrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAdminContextServer).mockResolvedValue(adminContext);
    jest.mocked(getTwoPQFormDraft).mockResolvedValue(null);
  });

  it("counts only the role records visible to a 2PQ admin", async () => {
    const roles = [
      roleRecord("god@example.com", "full_admin", true),
      roleRecord("full-admin@example.com", "full_admin"),
      roleRecord("organization@example.com", "organization_publisher"),
      roleRecord("professional@example.com", "individual_publisher"),
      roleRecord("2pq-admin@example.com", "2pq_admin"),
      roleRecord("operator@example.com", "institution_operator"),
      roleRecord("laboratory@example.com", "institution_laboratory_staff"),
      roleRecord("doctor@example.com", "institution_doctor"),
      roleRecord("patient@example.com", "patient"),
      roleRecord("dispatcher@example.com", "transport_dispatcher"),
    ];

    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/roles") return { roles };
      if (path === "/areas/institutions") return { institutions: [] };
      if (path === "/areas/doctors") return { doctors: [] };
      if (path === "/areas/patients") return { patients: [] };
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    const page = await TwoPQDashboardPage();
    const metrics = page.props.metrics as {
      roles: number;
      administrativeOperators: number;
      laboratoryStaff: number;
      transportDispatchers: number;
    };

    expect(metrics).toMatchObject({
      roles: 6,
      administrativeOperators: 1,
      laboratoryStaff: 1,
      transportDispatchers: 1,
    });
  });
});
