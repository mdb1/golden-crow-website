export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
};

const mockDocs = new Map<string, MockDocData>();
const mockDeleteUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockGeneratePatientTemporaryPassword = jest.fn(() => "ABCDEFGH");
const mockProvisionPatientFirebaseAccount = jest.fn();
const mockSendPublisherPortalInviteEmail = jest.fn();
const mockCollection = jest.fn((collectionName: string) => ({
  doc: (id: string) => makeDocRef(collectionName, id),
  where: (field: string, operator: string, value: unknown) => ({
    get: jest.fn(async () => ({
      docs: Array.from(mockDocs.entries())
        .filter(([key, data]) => {
          if (!key.startsWith(`${collectionName}/`)) {
            return false;
          }
          if (operator !== "==") {
            return false;
          }
          return data[field] === value;
        })
        .map(([key, data]) => {
          const id = key.slice(`${collectionName}/`.length);
          return {
            id,
            data: () => data,
            ref: makeDocRef(collectionName, id),
          };
        }),
    })),
  }),
}));

function docKey(ref: MockDocumentRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function makeDocRef(collectionName: string, id: string): MockDocumentRef {
  const ref: MockDocumentRef = {
    id,
    collectionName,
    get: jest.fn(async () => {
      const data = mockDocs.get(docKey(ref));
      return {
        exists: Boolean(data),
        id,
        data: () => data,
      };
    }),
    set: jest.fn(async (data: MockDocData, options?: { merge?: boolean }) => {
      mockDocs.set(docKey(ref), {
        ...(options?.merge ? mockDocs.get(docKey(ref)) : {}),
        ...data,
      });
    }),
    delete: jest.fn(async () => {
      mockDocs.delete(docKey(ref));
    }),
  };
  return ref;
}

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    deleteUser: mockDeleteUser,
    getUserByEmail: mockGetUserByEmail,
  })),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

jest.mock("../config/env.js", () => ({
  TEAM_ALLOWLIST: new Set(["bootstrap@example.com"]),
  resolveProjectAccess: jest.fn(() => []),
}));

jest.mock("../lib/patient-portal-credentials.js", () => ({
  generatePatientTemporaryPassword: mockGeneratePatientTemporaryPassword,
  provisionPatientFirebaseAccount: mockProvisionPatientFirebaseAccount,
}));

jest.mock("../lib/pgflex-dispatcher-email.js", () => ({
  sendPGFlexDispatcherInviteEmail: jest.fn(),
}));

jest.mock("../lib/publisher-portal-email.js", () => ({
  sendPublisherPortalInviteEmail: mockSendPublisherPortalInviteEmail,
}));

const godModeContext = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin" as const,
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: false,
  projectAccess: ["mydnamap" as const],
};

describe("role user deletion", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
    mockCollection.mockClear();
    mockDeleteUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockGeneratePatientTemporaryPassword.mockClear();
    mockProvisionPatientFirebaseAccount.mockReset();
    mockSendPublisherPortalInviteEmail.mockReset();
  });

  it("deletes the role document and Firebase Auth account in god mode", async () => {
    const { deleteRoleUserForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/driver@example.com", {
      role: "transport_dispatcher",
      firebaseUid: "driver-uid",
      isActive: true,
      displayName: "Transportista Ejemplo",
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });

    const result = await deleteRoleUserForContext(
      godModeContext,
      " DRIVER@example.com ",
    );

    expect(result).toEqual({
      deleted: true,
      email: "driver@example.com",
      roleDeleted: true,
      authDeleted: true,
      authUid: "driver-uid",
    });
    expect(mockDeleteUser).toHaveBeenCalledWith("driver-uid");
    expect(mockDocs.has("user_roles/driver@example.com")).toBe(false);
  });

  it("resolves the Firebase Auth account by email when firebaseUid is missing", async () => {
    const { deleteRoleUserForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/driver@example.com", {
      role: "transport_dispatcher",
      isActive: true,
      displayName: "Transportista Ejemplo",
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockGetUserByEmail.mockResolvedValue({ uid: "resolved-driver-uid" });

    const result = await deleteRoleUserForContext(
      godModeContext,
      "driver@example.com",
    );

    expect(mockGetUserByEmail).toHaveBeenCalledWith("driver@example.com");
    expect(mockDeleteUser).toHaveBeenCalledWith("resolved-driver-uid");
    expect(result.authUid).toBe("resolved-driver-uid");
    expect(mockDocs.has("user_roles/driver@example.com")).toBe(false);
  });

  it("rejects deletion outside god mode", async () => {
    const { deleteRoleUserForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/driver@example.com", {
      role: "transport_dispatcher",
      firebaseUid: "driver-uid",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });

    await expect(
      deleteRoleUserForContext(
        { ...godModeContext, isBootstrap: false },
        "driver@example.com",
      ),
    ).rejects.toMatchObject({
      message: "God mode is required to delete role users.",
      statusCode: 403,
    });

    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockDocs.has("user_roles/driver@example.com")).toBe(true);
  });

  it("rejects self-deletion and bootstrap role users", async () => {
    const { deleteRoleUserForContext } =
      await import("../repositories/roles.repository");

    await expect(
      deleteRoleUserForContext(godModeContext, "admin@example.com"),
    ).rejects.toMatchObject({
      message: "You cannot delete your own role user.",
      statusCode: 400,
    });

    await expect(
      deleteRoleUserForContext(godModeContext, "bootstrap@example.com"),
    ).rejects.toMatchObject({
      message: "Bootstrap role users cannot be deleted.",
      statusCode: 403,
    });

    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes publisher portal roles and Firebase Auth users linked to an organization", async () => {
    const { deletePublisherPortalRolesForPublisher } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/publisher@example.com", {
      role: "organization_publisher",
      organizationId: "org-1",
      firebaseUid: "publisher-uid",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("user_roles/ops@example.com", {
      role: "organization_publisher",
      organizationId: "org-1",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("user_roles/admin@example.com", {
      role: "full_admin",
      organizationId: "org-1",
      firebaseUid: "admin-uid",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockGetUserByEmail.mockResolvedValueOnce({ uid: "ops-uid" });

    const result = await deletePublisherPortalRolesForPublisher({
      kind: "organization",
      publisherId: "org-1",
    });

    expect(mockGetUserByEmail).toHaveBeenCalledWith("ops@example.com");
    expect(mockDeleteUser).toHaveBeenCalledWith("publisher-uid");
    expect(mockDeleteUser).toHaveBeenCalledWith("ops-uid");
    expect(mockDeleteUser).not.toHaveBeenCalledWith("admin-uid");
    expect(result).toEqual({
      deletedRoleCount: 2,
      deletedAuthUserCount: 2,
      deletedRoleEmails: ["publisher@example.com", "ops@example.com"],
    });
    expect(mockDocs.has("user_roles/publisher@example.com")).toBe(false);
    expect(mockDocs.has("user_roles/ops@example.com")).toBe(false);
    expect(mockDocs.has("user_roles/admin@example.com")).toBe(true);
  });

  it("deletes publisher portal roles linked to an individual publisher", async () => {
    const { deletePublisherPortalRolesForPublisher } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/individual@example.com", {
      role: "individual_publisher",
      individualId: "person-1",
      firebaseUid: "individual-uid",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });

    const result = await deletePublisherPortalRolesForPublisher({
      kind: "individual",
      publisherId: "person-1",
    });

    expect(mockDeleteUser).toHaveBeenCalledWith("individual-uid");
    expect(result).toEqual({
      deletedRoleCount: 1,
      deletedAuthUserCount: 1,
      deletedRoleEmails: ["individual@example.com"],
    });
    expect(mockDocs.has("user_roles/individual@example.com")).toBe(false);
  });
});

describe("transport dispatcher role metadata", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
    mockCollection.mockClear();
    mockDeleteUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockGeneratePatientTemporaryPassword.mockClear();
    mockProvisionPatientFirebaseAccount.mockReset();
    mockSendPublisherPortalInviteEmail.mockReset();
  });

  it("persists the preferred assignment flag for transport dispatcher roles", async () => {
    const { upsertUserRoleForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/driver@example.com", {
      email: "driver@example.com",
      role: "transport_dispatcher",
      firebaseUid: "driver-uid",
      isActive: true,
      canAccessPatientPortal: false,
      is_preferred_asignee: false,
      displayName: "Transportista Ejemplo",
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });

    const role = await upsertUserRoleForContext(
      godModeContext,
      "driver@example.com",
      {
        role: "transport_dispatcher",
        isActive: true,
        is_preferred_asignee: true,
        displayName: "Transportista Ejemplo",
        notes: "Disponible",
      },
    );

    expect(role.is_preferred_asignee).toBe(true);
    expect(mockDocs.get("user_roles/driver@example.com")).toMatchObject({
      role: "transport_dispatcher",
      is_preferred_asignee: true,
      firebaseUid: "driver-uid",
      notes: "Disponible",
    });
  });

  it("provisions publisher portal access with a generated access key", async () => {
    const { provisionPublisherPortalRoleForContext } =
      await import("../repositories/roles.repository");
    mockDocs.set("feed_organizations/org-1", {
      name: "Publisher One",
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockProvisionPatientFirebaseAccount.mockResolvedValue({
      user: { uid: "publisher-uid" },
      created: true,
    });

    const role = await provisionPublisherPortalRoleForContext(godModeContext, {
      kind: "organization",
      publisherId: "org-1",
      displayName: "Publisher One",
      contactEmail: " PUBLISHER@example.org ",
    });

    expect(mockGeneratePatientTemporaryPassword).toHaveBeenCalledTimes(1);
    expect(mockProvisionPatientFirebaseAccount).toHaveBeenCalledWith(
      expect.objectContaining({}),
      {
        email: "publisher@example.org",
        displayName: "Publisher One",
        temporaryPassword: "ABCDEFGH",
      },
    );
    expect(mockSendPublisherPortalInviteEmail).toHaveBeenCalledWith(
      {
        email: "publisher@example.org",
        displayName: "Publisher One",
      },
      "ABCDEFGH",
    );
    expect(role).toMatchObject({
      email: "publisher@example.org",
      role: "organization_publisher",
      organizationId: "org-1",
      firebaseUid: "publisher-uid",
      isActive: true,
      canAccessPatientPortal: false,
      organizationName: "Publisher One",
    });
    expect(mockDocs.get("user_roles/publisher@example.org")).toMatchObject({
      role: "organization_publisher",
      organizationId: "org-1",
      firebaseUid: "publisher-uid",
      publisherPortalInviteEmailSentAt: expect.any(String),
      publisherPortalInviteEmailFailedAt: null,
      publisherPortalInviteEmailLastError: null,
    });
  });
});
