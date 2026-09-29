import {
  canDeleteRoleRecord,
  getAssignableRoleOptionsForContext,
  getVisibleRoleRecordsForContext,
  isGlobalAdminRole,
  type RoleManagementRecord,
} from "../admin-areas";

describe("canDeleteRoleRecord", () => {
  const target = {
    email: "target@example.com",
    bootstrap: false,
  };

  it("allows full admins and 2PQ admins to delete another non-bootstrap role", () => {
    expect(
      canDeleteRoleRecord(
        { email: "admin@example.com", role: "full_admin" },
        target,
      ),
    ).toBe(true);
    expect(
      canDeleteRoleRecord(
        { email: "2pq@example.com", role: "2pq_admin" },
        target,
      ),
    ).toBe(true);
  });

  it("protects self-deletion, bootstrap roles, and non-global admins", () => {
    expect(
      canDeleteRoleRecord(
        { email: "target@example.com", role: "full_admin" },
        target,
      ),
    ).toBe(false);
    expect(
      canDeleteRoleRecord(
        { email: "admin@example.com", role: "full_admin" },
        { ...target, bootstrap: true },
      ),
    ).toBe(false);
    expect(
      canDeleteRoleRecord(
        { email: "doctor@example.com", role: "institution_doctor" },
        target,
      ),
    ).toBe(false);
  });
});

function roleValues(
  options: ReturnType<typeof getAssignableRoleOptionsForContext>,
) {
  return options.map((option) => option.value);
}

describe("getAssignableRoleOptionsForContext", () => {
  it("hides publisher creation from non-God full admins", () => {
    const values = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: false,
      }),
    );

    expect(values).toContain("full_admin");
    expect(values).toContain("institution_admin");
    expect(values).not.toContain("organization_publisher");
    expect(values).not.toContain("individual_publisher");
  });

  it("keeps publisher creation available for God Mode users", () => {
    const values = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: true,
      }),
    );

    expect(values).toContain("organization_publisher");
    expect(values).toContain("individual_publisher");
  });

  it("gives 2PQ admins the same non-bootstrap assignment options", () => {
    const fullAdminValues = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: false,
      }),
    );
    const twoPQAdminValues = roleValues(
      getAssignableRoleOptionsForContext({
        role: "2pq_admin",
        isBootstrap: false,
      }),
    );

    expect(twoPQAdminValues).toEqual(fullAdminValues);
    expect(isGlobalAdminRole("2pq_admin")).toBe(true);
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
      email: "individual@example.com",
      role: "individual_publisher",
      individualId: "person-1",
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

  it("hides bootstrap and publisher records from non-God full admins", () => {
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
      "individual@example.com",
      "admin@example.com",
      "institution@example.com",
    ]);
  });

  it("hides full-admin, publisher, and bootstrap records from 2PQ admins", () => {
    const values = getVisibleRoleRecordsForContext(records, {
      role: "2pq_admin",
      isBootstrap: false,
    }).map((record) => record.email);

    expect(values).toEqual(["institution@example.com"]);
  });
});
