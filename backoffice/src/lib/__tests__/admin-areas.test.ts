import {
  getAssignableRoleOptionsForContext,
  getVisibleRoleRecordsForContext,
  type RoleManagementRecord,
} from "../admin-areas";

function roleValues(
  options: ReturnType<typeof getAssignableRoleOptionsForContext>,
) {
  return options.map((option) => option.value);
}

describe("getAssignableRoleOptionsForContext", () => {
  it("hides organization publisher creation from non-God full admins", () => {
    const values = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: false,
      }),
    );

    expect(values).toContain("full_admin");
    expect(values).toContain("institution_admin");
    expect(values).not.toContain("organization_publisher");
  });

  it("keeps organization publisher creation available for God Mode users", () => {
    const values = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: true,
      }),
    );

    expect(values).toContain("organization_publisher");
  });
});

const roleRecord = (
  overrides: Partial<RoleManagementRecord>,
): RoleManagementRecord => ({
  email: "user@example.com",
  role: "institution_admin",
  isActive: true,
  canAccessPatientPortal: false,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  ...overrides,
});

describe("getVisibleRoleRecordsForContext", () => {
  const records = [
    roleRecord({
      email: "bootstrap@example.com",
      role: "full_admin",
      bootstrap: true,
    }),
    roleRecord({
      email: "publisher@example.com",
      role: "organization_publisher",
      organizationId: "org-1",
    }),
    roleRecord({
      email: "admin@example.com",
      role: "full_admin",
    }),
    roleRecord({
      email: "institution@example.com",
      role: "institution_admin",
      institutionId: "institution-1",
    }),
  ];

  it("hides bootstrap and organization publisher records from non-God full admins", () => {
    const values = getVisibleRoleRecordsForContext(records, {
      role: "full_admin",
      isBootstrap: false,
    }).map((record) => record.email);

    expect(values).toEqual(["admin@example.com", "institution@example.com"]);
  });

  it("does not filter records for God Mode users", () => {
    const values = getVisibleRoleRecordsForContext(records, {
      role: "full_admin",
      isBootstrap: true,
    }).map((record) => record.email);

    expect(values).toEqual([
      "bootstrap@example.com",
      "publisher@example.com",
      "admin@example.com",
      "institution@example.com",
    ]);
  });
});
