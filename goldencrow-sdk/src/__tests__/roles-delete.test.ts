export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  path: string;
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
  where: (field: string, operator: string, value: unknown) => {
    const matchingDocs = () =>
      Array.from(mockDocs.entries())
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
        });
    const get = jest.fn(async () => ({ docs: matchingDocs() }));

    return {
      get,
      limit: (limit: number) => ({
        get: jest.fn(async () => ({ docs: matchingDocs().slice(0, limit) })),
      }),
    };
  },
}));
const mockBatch = jest.fn(() => {
  const refs: MockDocumentRef[] = [];
  return {
    delete: jest.fn((ref: MockDocumentRef) => refs.push(ref)),
    commit: jest.fn(async () => {
      for (const ref of refs) {
        await ref.delete();
      }
    }),
  };
});

function docKey(ref: MockDocumentRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function makeDocRef(collectionName: string, id: string): MockDocumentRef {
  const ref: MockDocumentRef = {
    id,
    path: `${collectionName}/${id}`,
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
    batch: mockBatch,
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
    mockBatch.mockClear();
    mockDeleteUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockGeneratePatientTemporaryPassword.mockClear();
    mockProvisionPatientFirebaseAccount.mockReset();
    mockSendPublisherPortalInviteEmail.mockReset();
  });

  it("deletes only the role document for a full admin", async () => {
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
      { ...godModeContext, isBootstrap: false },
      " DRIVER@example.com ",
    );

    expect(result).toEqual({
      deleted: true,
      email: "driver@example.com",
      roleDeleted: true,
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockDocs.has("user_roles/driver@example.com")).toBe(false);
  });

  it("deletes the Firebase Auth account only during that cleanup step", async () => {
    const { deleteRoleAccountStepForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/driver@example.com", {
      role: "transport_dispatcher",
      firebaseUid: "driver-uid",
      isActive: true,
      displayName: "Transportista Ejemplo",
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    const result = await deleteRoleAccountStepForContext(
      { ...godModeContext, isBootstrap: false },
      "driver@example.com",
      "firebase_auth",
    );

    expect(mockDeleteUser).toHaveBeenCalledWith("driver-uid");
    expect(result).toEqual({
      step: "firebase_auth",
      status: "deleted",
      deletedCount: 1,
      message: "Deleted the Firebase Auth account.",
    });
    expect(mockDocs.has("user_roles/driver@example.com")).toBe(true);
  });

  it("deletes the linked patient entity without removing the role early", async () => {
    const { deleteRoleAccountStepForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/patient@example.com", {
      role: "patient",
      firebaseUid: "patient-uid",
      patientId: "PAT-00001",
      doctorId: "DOC-00001",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("patients/PAT-00001", {
      email: "patient@example.com",
      doctorId: "DOC-00001",
    });
    mockDocs.set("2pq_client/CLNT-00001", {
      clientEmail: "patient@example.com",
      roleEmail: "patient@example.com",
    });

    await expect(
      deleteRoleAccountStepForContext(
        { ...godModeContext, isBootstrap: false },
        "patient@example.com",
        "linked_entity",
      ),
    ).resolves.toMatchObject({
      step: "linked_entity",
      status: "deleted",
      deletedCount: 2,
    });
    expect(mockDocs.has("patients/PAT-00001")).toBe(false);
    expect(mockDocs.has("2pq_client/CLNT-00001")).toBe(false);
    expect(mockDocs.has("user_roles/patient@example.com")).toBe(true);
  });

  it("deduplicates 2PQ client matches found through both email fields", async () => {
    const { deleteRoleAccountStepForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/operator@example.com", {
      role: "institution_operator",
      firebaseUid: "operator-uid",
      institutionId: "INST-00001",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("2pq_client/CLNT-00002", {
      clientEmail: "operator@example.com",
      roleEmail: "operator@example.com",
    });

    await expect(
      deleteRoleAccountStepForContext(
        { ...godModeContext, isBootstrap: false },
        "operator@example.com",
        "linked_entity",
      ),
    ).resolves.toMatchObject({
      step: "linked_entity",
      status: "deleted",
      deletedCount: 1,
    });
    expect(mockDocs.has("2pq_client/CLNT-00002")).toBe(false);
  });

  it("deletes only the community account and preserves authored content", async () => {
    const { deleteRoleAccountStepForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/member@example.com", {
      role: "patient",
      firebaseUid: "member-uid",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("community_users/member-uid", {
      email: "member@example.com",
      username: "member",
    });
    mockDocs.set("community_posts/post-1", {
      authorId: "member-uid",
      body: "This conversation must remain.",
    });
    mockDocs.set("community_comments/comment-1", {
      authorId: "member-uid",
      body: "This reply must remain.",
    });

    await expect(
      deleteRoleAccountStepForContext(
        { ...godModeContext, isBootstrap: false },
        "member@example.com",
        "community",
      ),
    ).resolves.toEqual({
      step: "community",
      status: "deleted",
      deletedCount: 1,
      message: "Deleted the community account.",
    });

    expect(mockDocs.has("community_users/member-uid")).toBe(false);
    expect(mockDocs.has("community_posts/post-1")).toBe(true);
    expect(mockDocs.has("community_comments/comment-1")).toBe(true);
    expect(mockCollection).not.toHaveBeenCalledWith("community_posts");
    expect(mockCollection).not.toHaveBeenCalledWith("community_comments");
  });

  it("cleans profile, ownership, upload, file, and learning records by account identity", async () => {
    const { deleteRoleAccountStepForContext } =
      await import("../repositories/roles.repository");

    mockDocs.set("user_roles/patient@example.com", {
      role: "patient",
      firebaseUid: "patient-uid",
      patientId: "PAT-00001",
      doctorId: "DOC-00001",
      isActive: true,
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("profiles/patient-uid", { displayName: "Patient" });
    mockDocs.set("public_profiles/patient-uid", { fullName: "Patient" });
    mockDocs.set("report_owners/PAT-00001", { owner_name: "Patient" });
    mockDocs.set("report_codes/RPT001", { owner_id: "PAT-00001" });
    mockDocs.set("uploaded_reports/report-1", {
      report_owner_id: "PAT-00001",
      owner_community_user_id: "PAT-00001",
    });
    mockDocs.set("object_owners/PAT-00001", { owner_name: "Patient" });
    mockDocs.set("object_codes/OBJ001", { owner_id: "PAT-00001" });
    mockDocs.set("uploaded_objects/object-1", {
      object_owner_id: "PAT-00001",
      owner_community_user_id: "PAT-00001",
    });
    mockDocs.set("file_storage/file-1", {
      owner_community_user_id: "PAT-00001",
    });
    mockDocs.set("user_progress/patient-uid", { completed: 3 });

    const runStep = (
      step: Parameters<typeof deleteRoleAccountStepForContext>[2],
    ) =>
      deleteRoleAccountStepForContext(
        { ...godModeContext, isBootstrap: false },
        "patient@example.com",
        step,
      );

    await expect(runStep("private_profile")).resolves.toMatchObject({
      status: "deleted",
      deletedCount: 1,
    });
    await expect(runStep("public_profile")).resolves.toMatchObject({
      status: "deleted",
      deletedCount: 1,
    });
    await expect(runStep("reports")).resolves.toMatchObject({
      status: "deleted",
      deletedCount: 3,
    });
    await expect(runStep("objects")).resolves.toMatchObject({
      status: "deleted",
      deletedCount: 3,
    });
    await expect(runStep("stored_files")).resolves.toMatchObject({
      status: "deleted",
      deletedCount: 1,
    });
    await expect(runStep("learning")).resolves.toMatchObject({
      status: "deleted",
      deletedCount: 1,
    });

    expect(mockDocs.has("user_roles/patient@example.com")).toBe(true);
    expect(
      [...mockDocs.keys()].filter((key) => !key.startsWith("user_roles/")),
    ).toEqual([]);
  });

  it("lets 2PQ admins delete role assignments", async () => {
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
        {
          ...godModeContext,
          email: "2pq-admin@example.com",
          uid: "2pq-admin-uid",
          role: "2pq_admin",
          isBootstrap: false,
        },
        "driver@example.com",
      ),
    ).resolves.toMatchObject({ roleDeleted: true });

    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockDocs.has("user_roles/driver@example.com")).toBe(false);
  });

  it("rejects role deletion for non-global administrators", async () => {
    const { deleteRoleUserForContext } =
      await import("../repositories/roles.repository");

    await expect(
      deleteRoleUserForContext(
        {
          ...godModeContext,
          role: "institution_admin",
          isBootstrap: false,
          institutionId: "INST-00001",
        },
        "driver@example.com",
      ),
    ).rejects.toMatchObject({
      message: "Only full admins and 2PQ admins can delete role assignments.",
      statusCode: 403,
    });
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
    mockBatch.mockClear();
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

describe("2PQ admin authorization", () => {
  it("matches full-admin management targets and capabilities", async () => {
    const {
      canCreateInstitution,
      canManageLegacyModeration,
      getAdminCapabilities,
      getRoleManagementTargets,
    } = await import("../repositories/roles.repository");
    const twoPQAdminContext = {
      ...godModeContext,
      email: "2pq-admin@example.com",
      uid: "2pq-admin-uid",
      role: "2pq_admin" as const,
      isBootstrap: false,
    };
    const fullAdminCapabilities = getAdminCapabilities({
      ...godModeContext,
      isBootstrap: false,
    }).filter((capability) => !capability.startsWith("role:"));
    const twoPQAdminCapabilities = getAdminCapabilities(
      twoPQAdminContext,
    ).filter((capability) => !capability.startsWith("role:"));

    expect(getRoleManagementTargets("2pq_admin")).toEqual(
      getRoleManagementTargets("full_admin"),
    );
    expect(twoPQAdminCapabilities).toEqual(fullAdminCapabilities);
    expect(canCreateInstitution(twoPQAdminContext)).toBe(true);
    expect(canManageLegacyModeration(twoPQAdminContext)).toBe(true);
  });
});
