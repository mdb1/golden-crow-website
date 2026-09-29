export {};

type Data = Record<string, unknown>;
type MockRef = {
  id: string;
  path: string;
  get: jest.Mock;
  set: jest.Mock;
};

const documents = new Map<string, Data>();
const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();

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
  };
  return ref;
}

const mockCollection = jest.fn((collection: string) => ({
  doc: (id: string) => makeRef(collection, id),
  where: (field: string, operator: string, value: unknown) => ({
    limit: (limit: number) => ({
      get: jest.fn(async () => ({
        docs: Array.from(documents.entries())
          .filter(
            ([path, data]) =>
              path.startsWith(`${collection}/`) &&
              operator === "==" &&
              data[field] === value,
          )
          .slice(0, limit)
          .map(([path, data]) => {
            const id = path.slice(collection.length + 1);
            return { id, ref: makeRef(collection, id), data: () => data };
          }),
      })),
    }),
  }),
}));

const mockBatch = jest.fn(() => {
  const writes: Array<{
    ref: MockRef;
    data: Data;
    options?: { merge?: boolean };
  }> = [];
  return {
    set: jest.fn(
      (ref: MockRef, data: Data, options?: { merge?: boolean }) => {
        writes.push({ ref, data, options });
      },
    ),
    commit: jest.fn(async () => {
      for (const write of writes) {
        await write.ref.set(write.data, write.options);
      }
    }),
  };
});

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    getUser: mockGetUser,
    updateUser: mockUpdateUser,
  })),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
}));

jest.mock("../config/env.js", () => ({
  TEAM_ALLOWLIST: new Set(),
  resolveProjectAccess: jest.fn(() => []),
}));

describe("profile setup role linkage", () => {
  beforeEach(() => {
    jest.resetModules();
    documents.clear();
    mockCollection.mockClear();
    mockBatch.mockClear();
    mockGetUser.mockReset();
    mockUpdateUser.mockReset();
    mockGetUser.mockResolvedValue({
      uid: "member-uid",
      email: "member@example.com",
      displayName: "Member",
    });
    mockUpdateUser.mockResolvedValue({});
    documents.set("user_roles/member@example.com", {
      email: "member@example.com",
      role: "full_admin",
      isActive: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("creates both owner identities and links the role to the community account", async () => {
    const { completeProfileSetup } =
      await import("../repositories/profile-setup.repository");

    await completeProfileSetup("member-uid", "full_admin", {
      fullName: "Member Example",
      iconName: "person.crop.circle.fill",
      iconColorHex: "#5A4FCF",
    });

    const communityUser = documents.get("community_users/member-uid");
    const reportOwner = documents.get("report_owners/member-uid");
    const objectOwner = documents.get("object_owners/member-uid");
    const role = documents.get("user_roles/member@example.com");
    expect(communityUser).toMatchObject({
      email: "member@example.com",
      username: expect.any(String),
    });
    expect(reportOwner).toMatchObject({
      accepted_terms: false,
      owner_name: "Member Example",
      owner_contact_email: "member@example.com",
      owner_profession: null,
      owner_company: null,
    });
    expect(objectOwner).toMatchObject({
      accepted_terms: false,
      owner_name: "Member Example",
      owner_contact_email: "member@example.com",
      owner_profession: null,
      owner_company: null,
    });
    expect(role).toMatchObject({
      firebaseUid: "member-uid",
      communityUserId: "member-uid",
      communityUserOriginalEmail: "member@example.com",
      communityUserOriginalUsername: communityUser?.username,
    });
  });

  it("preserves each owner identity metadata while syncing profile fields", async () => {
    documents.set("report_owners/member-uid", {
      accepted_terms: true,
      accepted_terms_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
    });
    documents.set("object_owners/member-uid", {
      accepted_terms: false,
      accepted_terms_at: null,
      created_at: "2026-07-02T00:00:00.000Z",
    });

    const { completeProfileSetup } =
      await import("../repositories/profile-setup.repository");

    await completeProfileSetup("member-uid", "full_admin", {
      fullName: "Member Example",
      iconName: "person.crop.circle.fill",
      iconColorHex: "#5A4FCF",
      ownerProfession: "Genetic counselor",
      ownerCompany: "Pocket Genes",
      ownerContactNumber: "+54 11 5555 0000",
      ownerBio: "Clinical genetics specialist.",
    });

    expect(documents.get("report_owners/member-uid")).toMatchObject({
      accepted_terms: true,
      accepted_terms_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
      owner_profession: "Genetic counselor",
      owner_company: "Pocket Genes",
    });
    expect(documents.get("object_owners/member-uid")).toMatchObject({
      accepted_terms: false,
      accepted_terms_at: null,
      created_at: "2026-07-02T00:00:00.000Z",
      owner_profession: "Genetic counselor",
      owner_company: "Pocket Genes",
    });
  });

  it("keeps profile setup incomplete while the object owner is missing", async () => {
    documents.set("profiles/member-uid", { onboardingCompleted: true });
    documents.set("public_profiles/member-uid", { fullName: "Member Example" });
    documents.set("community_users/member-uid", { username: "member-example" });
    documents.set("report_owners/member-uid", {
      owner_name: "Member Example",
    });

    const { getProfileSetupState } =
      await import("../repositories/profile-setup.repository");

    const state = await getProfileSetupState("member-uid");

    expect(state.needsCompletion).toBe(true);
    expect(state.docs.objectOwner).toBe(false);
  });
});
