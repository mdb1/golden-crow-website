export {};

type Data = Record<string, unknown>;
type MockRef = {
  id: string;
  path: string;
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
};

const documents = new Map<string, Data>();
let authEmail = "dopazoh+director@gmail.com";
const mockGetUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetOwnRoleForContext = jest.fn();
const mockResolveLinkedCommunityUserForRole = jest.fn();
let batchCommitError: Error | null = null;

function makeRef(collection: string, id: string): MockRef {
  const path = `${collection}/${id}`;
  const ref: MockRef = {
    id,
    path,
    get: jest.fn(async () => ({
      id,
      ref,
      exists: documents.has(path),
      data: () => documents.get(path),
    })),
    set: jest.fn(async (data: Data, options?: { merge?: boolean }) => {
      documents.set(path, {
        ...(options?.merge ? documents.get(path) : {}),
        ...data,
      });
    }),
    delete: jest.fn(async () => {
      documents.delete(path);
    }),
  };
  return ref;
}

function matchingDocuments(
  collection: string,
  field: string,
  value: unknown,
) {
  return Array.from(documents.entries())
    .filter(
      ([path, data]) =>
        path.startsWith(`${collection}/`) && data[field] === value,
    )
    .map(([path, data]) => {
      const id = path.slice(collection.length + 1);
      return { id, ref: makeRef(collection, id), data: () => data };
    });
}

const mockCollection = jest.fn((collection: string) => ({
  doc: (id: string) => makeRef(collection, id),
  where: (field: string, operator: string, value: unknown) => ({
    limit: (limit: number) => ({
      get: jest.fn(async () => ({
        docs:
          operator === "=="
            ? matchingDocuments(collection, field, value).slice(0, limit)
            : [],
      })),
    }),
  }),
}));

const mockBatch = jest.fn(() => {
  const writes: Array<
    | {
        kind: "set";
        ref: MockRef;
        data: Data;
        options?: { merge?: boolean };
      }
    | { kind: "delete"; ref: MockRef }
  > = [];
  return {
    set: jest.fn(
      (ref: MockRef, data: Data, options?: { merge?: boolean }) => {
        writes.push({ kind: "set", ref, data, options });
      },
    ),
    delete: jest.fn((ref: MockRef) => {
      writes.push({ kind: "delete", ref });
    }),
    commit: jest.fn(async () => {
      if (batchCommitError) {
        throw batchCommitError;
      }
      for (const write of writes) {
        if (write.kind === "set") {
          await write.ref.set(write.data, write.options);
        } else {
          await write.ref.delete();
        }
      }
    }),
  };
});

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    getUser: mockGetUser,
    getUserByEmail: mockGetUserByEmail,
    updateUser: mockUpdateUser,
  })),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  getAdminCapabilities: jest.fn(() => ["role:individual_publisher"]),
  getOwnRoleForContext: mockGetOwnRoleForContext,
  getRoleCollectionName: jest.fn(() => "user_roles"),
  normalizeRoleEmail: jest.fn((email: string) => email.trim().toLowerCase()),
  resolveLinkedCommunityUserForRole: mockResolveLinkedCommunityUserForRole,
  updateOwnRoleProfileForContext: jest.fn(),
}));

jest.mock("../repositories/profile-setup.repository.js", () => ({
  getProfileSetupState: jest.fn(async () => ({
    defaults: { username: "hdopazo-director", fullName: "Director" },
    onboardingCompleted: true,
    needsCompletion: false,
    docs: {
      profile: true,
      publicProfile: true,
      communityUser: true,
      reportOwner: true,
    },
  })),
  isProfileSetupError: jest.fn(() => false),
}));

const context = {
  email: "dopazoh+director@gmail.com",
  uid: "Oo24Zh3A37YOrwIIGXOOE4lKSq62",
  role: "individual_publisher" as const,
  individualId: "individual-1",
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: true,
  projectAccess: ["mydnamap" as const],
};

function authUser() {
  return {
    uid: context.uid,
    email: authEmail,
    emailVerified: authEmail === context.email,
    disabled: false,
    displayName: "Director",
    providerData: [],
    metadata: {},
    customClaims: {},
  };
}

describe("my account email synchronization", () => {
  beforeEach(() => {
    jest.resetModules();
    documents.clear();
    authEmail = context.email;
    batchCommitError = null;
    mockCollection.mockClear();
    mockBatch.mockClear();
    mockGetUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockUpdateUser.mockReset();
    mockGetOwnRoleForContext.mockReset();
    mockResolveLinkedCommunityUserForRole.mockReset();

    const role = {
      email: context.email,
      role: "individual_publisher" as const,
      firebaseUid: context.uid,
      individualId: "individual-1",
      isActive: true,
      canAccessPatientPortal: false,
      createdAt: "2026-06-05T19:53:24.125Z",
      updatedAt: "2026-06-05T19:53:24.125Z",
    };
    mockGetOwnRoleForContext.mockImplementation(async (nextContext) => ({
      ...role,
      email: nextContext.email,
      communityUserId: context.uid,
      communityUserOriginalEmail: "hdopazo+director@gmail.com",
      communityUserOriginalUsername: "hdopazo-director",
    }));
    mockResolveLinkedCommunityUserForRole.mockResolvedValue({
      id: context.uid,
      email: "hdopazo+director@gmail.com",
      username: "hdopazo-director",
    });
    mockGetUser.mockImplementation(async () => authUser());
    mockGetUserByEmail.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "auth/user-not-found" }),
    );
    mockUpdateUser.mockImplementation(async (_uid, update: Data) => {
      if (typeof update.email === "string") authEmail = update.email;
      return authUser();
    });

    documents.set(`user_roles/${context.email}`, role);
    documents.set(`profiles/${context.uid}`, { email: context.email });
    documents.set(`public_profiles/${context.uid}`, { email: context.email });
    documents.set(`community_users/${context.uid}`, {
      email: "hdopazo+director@gmail.com",
      username: "hdopazo-director",
    });
    documents.set(`report_owners/${context.uid}`, {
      owner_contact_email: "hdopazo+director@gmail.com",
    });
    documents.set(`object_owners/${context.uid}`, {
      owner_contact_email: "hdopazo+director@gmail.com",
    });
    documents.set("feed_individuals/individual-1", {
      contactEmail: context.email,
    });
    documents.set("2pq_client/client-1", {
      roleEmail: context.email,
      clientEmail: "patient@example.com",
    });
  });

  it("moves the role, preserves the original community identity, and aligns account emails", async () => {
    const { changeMyAccountEmailForContext } =
      await import("../repositories/my-account.repository");
    const nextEmail = "director-new@gmail.com";

    const result = await changeMyAccountEmailForContext(context, nextEmail);

    expect(authEmail).toBe(nextEmail);
    expect(documents.has(`user_roles/${context.email}`)).toBe(false);
    expect(documents.get(`user_roles/${nextEmail}`)).toMatchObject({
      email: nextEmail,
      communityUserId: context.uid,
      communityUserOriginalEmail: "hdopazo+director@gmail.com",
      communityUserOriginalUsername: "hdopazo-director",
    });
    expect(documents.get(`community_users/${context.uid}`)).toMatchObject({
      email: nextEmail,
    });
    expect(documents.get(`public_profiles/${context.uid}`)).toMatchObject({
      email: nextEmail,
    });
    expect(documents.get(`report_owners/${context.uid}`)).toMatchObject({
      owner_contact_email: nextEmail,
    });
    expect(documents.get(`object_owners/${context.uid}`)).toMatchObject({
      owner_contact_email: nextEmail,
    });
    expect(documents.get("feed_individuals/individual-1")).toMatchObject({
      contactEmail: nextEmail,
    });
    expect(documents.get("2pq_client/client-1")).toMatchObject({
      roleEmail: nextEmail,
      clientEmail: "patient@example.com",
    });
    expect(result.syncSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "community_user", status: "updated" }),
        expect.objectContaining({ step: "report_owners", status: "updated" }),
        expect.objectContaining({ step: "object_owners", status: "updated" }),
        expect.objectContaining({ step: "linked_entity", status: "updated" }),
      ]),
    );
    expect(mockCollection).not.toHaveBeenCalledWith("community_posts");
    expect(mockCollection).not.toHaveBeenCalledWith("feed_items");
    expect(mockCollection).not.toHaveBeenCalledWith("service_offers");
    expect(mockCollection).not.toHaveBeenCalledWith("service_transactions");
  });

  it("restores the Firebase Auth email when the identity batch fails", async () => {
    const { changeMyAccountEmailForContext } =
      await import("../repositories/my-account.repository");
    batchCommitError = new Error("Firestore batch failed");

    await expect(
      changeMyAccountEmailForContext(context, "director-new@gmail.com"),
    ).rejects.toThrow("Firestore batch failed");

    expect(authEmail).toBe(context.email);
    expect(mockUpdateUser).toHaveBeenNthCalledWith(1, context.uid, {
      email: "director-new@gmail.com",
      emailVerified: false,
    });
    expect(mockUpdateUser).toHaveBeenNthCalledWith(2, context.uid, {
      email: context.email,
      emailVerified: true,
    });
    expect(documents.has(`user_roles/${context.email}`)).toBe(true);
    expect(documents.has("user_roles/director-new@gmail.com")).toBe(false);
  });
});
