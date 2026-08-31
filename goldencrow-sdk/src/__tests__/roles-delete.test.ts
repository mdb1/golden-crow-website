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
const mockCollection = jest.fn((collectionName: string) => ({
  doc: (id: string) => makeDocRef(collectionName, id),
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
    set: jest.fn(async (data: MockDocData) => {
      mockDocs.set(docKey(ref), { ...data });
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
  generatePatientTemporaryPassword: jest.fn(() => "ABCDEFGH"),
  provisionPatientFirebaseAccount: jest.fn(),
}));

jest.mock("../lib/pgflex-dispatcher-email.js", () => ({
  sendPGFlexDispatcherInviteEmail: jest.fn(),
}));

const godModeContext = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin" as const,
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap" as const],
};

describe("role user deletion", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
    mockCollection.mockClear();
    mockDeleteUser.mockReset();
    mockGetUserByEmail.mockReset();
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
});
