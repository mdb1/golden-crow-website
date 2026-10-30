import { resolveAdminContextForAccess } from "../lib/admin-context-resolution.js";
import type { UserRoleRecord } from "../types/sdk.types.js";

function publisherRole(
  kind: "organization" | "individual",
): UserRoleRecord {
  return {
    email: "dual@example.com",
    role:
      kind === "organization"
        ? "organization_publisher"
        : "individual_publisher",
    organizationId: kind === "organization" ? "org-1" : undefined,
    individualId: kind === "individual" ? "individual-1" : undefined,
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: "2026-10-30T12:00:00.000Z",
    updatedAt: "2026-10-30T12:00:00.000Z",
  };
}

function dualAccess(roleRecord: UserRoleRecord) {
  return {
    roleRecord,
    viaAllowlist: true,
    viaRoleAssignment: false,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: true,
    projectAccess: ["mydnamap" as const],
  };
}

describe("admin context surface resolution", () => {
  it.each(["organization", "individual"] as const)(
    "uses the scoped %s publisher identity in a publisher portal session",
    (kind) => {
      const roleRecord = publisherRole(kind);
      const context = resolveAdminContextForAccess({
        email: roleRecord.email,
        uid: "uid-1",
        surface: "publisher-portal",
        access: dualAccess(roleRecord),
      });

      expect(context).toMatchObject({
        role: roleRecord.role,
        organizationId: roleRecord.organizationId,
        individualId: roleRecord.individualId,
        canAccessBackoffice: false,
        canAccessPublisherPortal: true,
      });
    },
  );

  it("keeps the same dual-access identity as full admin in a backoffice session", () => {
    const roleRecord = publisherRole("organization");
    const context = resolveAdminContextForAccess({
      email: roleRecord.email,
      uid: "uid-1",
      surface: "backoffice",
      access: dualAccess(roleRecord),
    });

    expect(context).toMatchObject({
      role: "full_admin",
      isBootstrap: true,
      canAccessBackoffice: true,
      canAccessPublisherPortal: false,
    });
  });
});
